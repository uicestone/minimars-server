import Agenda from "agenda";
import moment from "moment";
import axios from "axios";
import { MongoClient } from "mongodb";
import { DocumentType } from "@typegoose/typegoose";
import Booking, { BookingStatus } from "../models/Booking";
import CardModel, { Card, CardStatus } from "../models/Card";
import Gift from "../models/Gift";
import CardType from "../models/CardType";
import Event from "../models/Event";
import Post from "../models/Post";
import Store from "../models/Store";
import UserModel, { User } from "../models/User";
import configModel, { Config } from "../models/Config";
import CardTypeModel from "../models/CardType";
import StoreModel from "../models/Store";
import paymentModel, { PaymentGateway } from "../models/Payment";
import { saveContentImages } from "./helper";
import importPrevData from "./importPrevData";
import { getMpUserOpenids, getQrcode, getUsersInfo } from "./wechat";
import Pospal from "./pospal";

const pospalTicketsSyncInterval = +(
  process.env.POSPAL_TICKETS_SYNC_INTERVAL || 10
);

const agenda: Agenda = new Agenda();

export const initAgenda = async () => {
  const client = new MongoClient(process.env.MONGODB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  await client.connect();

  agenda.mongo(client.db());

  agenda.define("cancel expired pending bookings", async (job, done) => {
    const bookings = await Booking.find({
      status: BookingStatus.PENDING,
      createdAt: {
        $lt: moment().subtract(10, "minutes").toDate()
      }
    });

    if (bookings.length) {
      console.log(`[CRO] Cancel expired pending bookings...`);
    }

    for (const booking of bookings) {
      await booking.cancel(true);
    }

    done();
  });

  agenda.define("cancel expired booked bookings", async (job, done) => {
    const bookings = await Booking.find({
      status: BookingStatus.BOOKED,
      date: {
        $lt: moment().format("YYYY-MM-DD")
      }
    });

    if (bookings.length) {
      console.log(`[CRO] Cancel expired booked bookings...`);
    }

    for (const booking of bookings) {
      await booking.cancel();
    }

    done();
  });

  agenda.define("finish in_service bookings", async (job, done) => {
    const bookings = await Booking.find({
      status: BookingStatus.IN_SERVICE,
      date: {
        $lt: moment().format("YYYY-MM-DD")
      }
    });

    if (bookings.length) {
      console.log(`[CRO] Finish previous in_service bookings...`);
    }

    for (const booking of bookings) {
      await booking.finish();
    }

    done();
  });

  agenda.define("cancel expired pending cards", async (job, done) => {
    const cards = await CardModel.find({
      status: CardStatus.PENDING,
      createdAt: {
        $lt: moment().subtract(2, "hours").toDate()
      }
    });

    if (cards.length) {
      console.log(`[CRO] Cancel expired pending cards...`);
    }

    for (const card of cards) {
      card.status = CardStatus.CANCELED;
      await card.save();
    }

    done();
  });

  agenda.define("import prev data", async (job, done) => {
    await importPrevData(job.attrs.data.database, job.attrs.data.storeKey);
    console.log("[CRO] Previous data imported.");
    done();
  });

  agenda.define("create indexes", async (job, done) => {
    UserModel.createIndexes();
    console.log("[CRO] Index created.");
    done();
  });

  agenda.define("save image from content", async (job, done) => {
    console.log(`[CRO] Running '${job.attrs.name}'...`);
    const cardTypes = await CardType.find();
    const events = await Event.find();
    const gifts = await Gift.find();
    const posts = await Post.find();
    const stores = await Store.find();
    for (const documents of [cardTypes, events, gifts, posts, stores]) {
      for (const document of documents) {
        if (!document.content) continue;
        document.content = saveContentImages(document.content);
        // @ts-ignore
        document.save();
      }
    }
    console.log(`[CRO] Finished '${job.attrs.name}'.`);
    done();
  });

  agenda.define("set expired cards", async (job, done) => {
    console.log(`[CRO] Running '${job.attrs.name}'...`);
    await CardModel.updateMany(
      { type: { $in: ["coupon", "period"] }, expiresAt: { $lt: new Date() } },
      { $set: { status: CardStatus.EXPIRED } }
    );
    console.log(`[CRO] Finished '${job.attrs.name}'.`);
    done();
  });

  agenda.define("check balance reward cards", async (job, done) => {
    console.log(`[CRO] Running '${job.attrs.name}'...`);
    const cards = await CardModel.find({
      status: { $in: [CardStatus.ACTIVATED, CardStatus.VALID] }
    });
    const users = await UserModel.find({
      _id: { $in: cards.map(c => c.customer) }
    });
    const userMap: Map<
      string,
      DocumentType<User> & { cards: DocumentType<Card>[] }
    > = new Map();
    users.forEach(u => {
      userMap.set(u.id, Object.assign(u, { cards: [] }));
    });
    cards.forEach(c => {
      const u = userMap.get(c.customer.toString());
      if (!u) return;
      u.cards.push(c);
    });
    const cardTypes = await CardTypeModel.find({
      rewardCardTypes: { $exists: true },
      type: "balance"
    });
    for (const cardType of cardTypes) {
      const rewardCardTypes = await CardTypeModel.find({
        slug: cardType.rewardCardTypes.split(" ")
      });

      for (const [, user] of userMap) {
        const shouldRewardCount = user.cards.filter(
          c => c.slug === cardType.slug
        ).length;
        for (const rewardCardType of rewardCardTypes) {
          const fixRewardCount =
            shouldRewardCount -
            user.cards.filter(c => c.slug === rewardCardType.slug).length;
          for (let i = 0; i < fixRewardCount; i++) {
            console.log(
              `[CRO] User ${user.id} missing reward ${rewardCardType.slug} from ${cardType.slug}`
            );
            const rewardedCard = rewardCardType.issue(user);
            rewardedCard.paymentSuccess();
            try {
              await rewardedCard.save();
            } catch (e) {
              console.error(e.message);
            }
          }
        }
      }
    }
    console.log(`[CRO] Finished '${job.attrs.name}'.`);
    done();
  });

  agenda.define("update holidays", async (job, done) => {
    console.log(`[CRO] Running '${job.attrs.name}'...`);
    const year = new Date().getFullYear();
    const [res1, res2] = await Promise.all([
      axios.get(`${process.env.NATIONAL_HOLIDAY_BASE}/${year}.json`),
      axios.get(`${process.env.NATIONAL_HOLIDAY_BASE}/${year + 1}.json`)
    ]);
    const days = res1.data.days.concat(res2.data.days) as {
      name: string;
      date: string;
      isOffDay: boolean;
    }[];
    const conf = days.reduce(
      (conf: Config, day) => {
        if (day.isOffDay && [1, 2, 3, 4, 5].includes(moment(day.date).day())) {
          conf.offWeekdays.push(day.date);
        } else if (!day.isOffDay && [0, 7].includes(moment(day.date).day())) {
          conf.onWeekends.push(day.date);
        }
        return conf;
      },
      { offWeekdays: [], onWeekends: [] }
    );
    const [configItemOnWeekends, configItemOffWeekdays] = await Promise.all([
      configModel.findOne({ onWeekends: { $exists: true } }),
      configModel.findOne({ offWeekdays: { $exists: true } })
    ]);
    configItemOnWeekends.set("onWeekends", conf.onWeekends);
    configItemOffWeekdays.set("offWeekdays", conf.offWeekdays);
    await Promise.all([
      configItemOnWeekends.save(),
      configItemOffWeekdays.save()
    ]);
    console.log(`[CRO] Finished '${job.attrs.name}'.`);
    done();
  });

  agenda.define("verify user balance", async (job, done) => {
    console.log(`[CRO] Running '${job.attrs.name}'...`);
    const userBalanceMap: Record<string, number> = {};
    const balanceCards = await CardModel.find({
      type: "balance",
      status: CardStatus.ACTIVATED
    });
    balanceCards.forEach(c => {
      userBalanceMap[c.customer.toString()] =
        c.balance + (userBalanceMap[c.customer.toString()] || 0);
    });
    console.log(`[CRO] Balance card added.`);
    const balancePayments = await paymentModel.find({
      gateway: PaymentGateway.Balance,
      paid: true
    });
    balancePayments.forEach(p => {
      userBalanceMap[p.customer.id] =
        (userBalanceMap[p.customer.id] || 0) - p.amount;
    });
    const users = await UserModel.find({
      _id: { $in: Object.keys(userBalanceMap) }
    });
    users.forEach(u => {
      userBalanceMap[u.id] = +userBalanceMap[u.id].toFixed(2);
      if (u.balance !== userBalanceMap[u.id]) {
        console.error(
          `[CRO] User balance mismatch: ${u.id} ${u.name} ${u.mobile} calc ${
            userBalanceMap[u.id]
          }, stored ${u.balance}`
        );
      }
    });
    console.log(`[CRO] Finished '${job.attrs.name}'.`);
    done();
  });

  agenda.define("generate wechat qrcode", async (job, done) => {
    console.log(`[CRO] Running '${job.attrs.name}'...`);
    const { path } = job.attrs.data;
    getQrcode(path);
    console.log(`[CRO] Finished '${job.attrs.name}'.`);
    done();
  });

  agenda.define("get wechat mp users", async (job, done) => {
    console.log(`[CRO] Running '${job.attrs.name}'...`);
    const openids = await getMpUserOpenids();
    let start = 0;
    while (start < openids.length) {
      const chunk = openids.slice(start, start + 100);
      const usersInfo = await getUsersInfo(chunk);
      console.log(`[CRO] Got users info ${start} +100.`);
      const usersExists = await UserModel.find({
        openidMp: null,
        unionid: { $in: usersInfo.filter(u => u.unionid).map(u => u.unionid) }
      });
      if (usersExists.length) {
        console.log(
          `[CRO] ${usersExists.length} users matching unionid without openidMp.`
        );
      }
      for (const user of usersExists) {
        const userInfo = usersInfo.find(u => u.unionid === user.unionid);
        await UserModel.updateOne(
          { _id: user.id },
          { openidMp: userInfo.openid }
        );
        console.log(
          `[CRO] User openidMp updated, user ${user.id}, openidMp ${userInfo.openid}`
        );
      }
      start += 100;
    }
    console.log(`[CRO] Finished '${job.attrs.name}'.`);
    done();
  });

  agenda.define("sync history pospal tickets", async (job, done) => {
    console.log(`[CRO] Running '${job.attrs.name}'...`);
    const { code, dateStart, dateEnd } = job.attrs.data;
    const store = await StoreModel.findOne({ code });
    await store.syncPospalTickets(dateStart, dateEnd);
    console.log(`[CRO] Finished '${job.attrs.name}'.`);
    done();
  });

  agenda.define("sync pospal tickets", async (job, done) => {
    console.log(`[CRO] Running '${job.attrs.name}'...`);
    const stores = await StoreModel.find();
    for (const store of stores) {
      try {
        await store.syncPospalTickets(pospalTicketsSyncInterval * 2);
      } catch (e) {
        continue;
      }
    }
    console.log(`[CRO] Finished '${job.attrs.name}'.`);
    done();
  });

  agenda.define("sync pospal customers", async (job, done) => {
    try {
      console.log(`[CRO] Running '${job.attrs.name}'...`);
      const pospal = new Pospal();
      // download pospal customers
      const customers = await pospal.queryAllCustomers();
      for (const customer of customers) {
        if (!customer.phone || customer.enable !== 1) continue;
        const user = await UserModel.findOne({ mobile: customer.phone });
        if (!user || customer.customerUid.toString() === user.pospalId)
          continue;
        user.pospalId = customer.customerUid.toString();
        console.log(`User ${user.mobile} pospal id set to ${user.pospalId}`);
        await user.save();
      }
      // upload balance customers to customer
      const users = await UserModel.find({
        $or: [{ balanceDeposit: { $gt: 0 } }, { balanceReward: { $gt: 0 } }]
      });
      for (const user of users) {
        try {
          await pospal.addMember(user);
        } catch (e) {
          console.error(
            `[CRO] Sync user ${user.id} ${user.mobile} to Pospal failed.`
          );
        }
      }
      console.log(`[CRO] Finished '${job.attrs.name}'.`);
      done();
    } catch (e) {
      console.error(e);
    }
  });

  agenda.define("init store doors", async (job, done) => {
    console.log(`[CRO] Running '${job.attrs.name}'...`);
    const { code } = job.attrs.data;
    const store = await StoreModel.findOne({ code });
    if (!store) {
      throw new Error("store_not_found");
    }
    store.initDoors();
    console.log(`[CRO] Finished '${job.attrs.name}'.`);
    done();
  });

  agenda.define("auth store doors", async (job, done) => {
    console.log(`[CRO] Running '${job.attrs.name}'...`);
    const { code, no } = job.attrs.data;
    const store = await StoreModel.findOne({ code });
    if (!store) {
      throw new Error("store_not_found");
    }
    store.authDoors(no);
    console.log(`[CRO] Finished '${job.attrs.name}'.`);
    done();
  });

  agenda.define("open store doors", async (job, done) => {
    console.log(`[CRO] Running '${job.attrs.name}'...`);
    const { code, name } = job.attrs.data;
    const store = await StoreModel.findOne({ code });
    if (!store) {
      throw new Error("store_not_found");
    }
    store.openDoor(name);
    console.log(`[CRO] Finished '${job.attrs.name}'.`);
    done();
  });

  agenda.start();

  agenda.on("ready", () => {
    agenda.every("5 minutes", "cancel expired pending bookings");
    agenda.every("1 hour", "cancel expired pending cards");
    agenda.every("1 day", "finish in_service bookings");
    agenda.every("1 day", "update holidays");
    agenda.every("0 0 * * *", "set expired cards"); // run everyday at 0am
    agenda.every("1 day", "get wechat mp users");
    agenda.every("0 20 * * *", "check balance reward cards"); // run everyday at 8pm
    agenda.every(
      `*/${pospalTicketsSyncInterval} 10-21 * * *`,
      "sync pospal tickets"
    );
  });

  agenda.on("error", err => {
    console.error(err.message);
  });
};

export default agenda;
