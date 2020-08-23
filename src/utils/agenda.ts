import Agenda from "agenda";
import moment from "moment";
import axios from "axios";
import Booking, { BookingStatus } from "../models/Booking";
import { MongoClient } from "mongodb";
import Card, { CardStatus } from "../models/Card";
import Gift from "../models/Gift";
import CardType from "../models/CardType";
import Event from "../models/Event";
import Post from "../models/Post";
import Store from "../models/Store";
import { saveContentImages } from "./helper";
import importPrevData from "./importPrevData";
import User from "../models/User";
import configModel, { Config } from "../models/Config";

let agenda: Agenda;

export const initAgenda = async () => {
  const client = new MongoClient(process.env.MONGODB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  await client.connect();

  agenda = new Agenda({ mongo: client.db() });

  agenda.define("cancel expired pending bookings", async (job, done) => {
    const bookings = await Booking.find({
      status: BookingStatus.PENDING,
      createdAt: {
        $lt: moment().subtract(2, "hours").toDate()
      }
    });

    if (bookings.length) {
      console.log(`[CRO] Cancel expired pending bookings...`);
    }

    for (const booking of bookings) {
      await booking.cancel();
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
    const cards = await Card.find({
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
    User.createIndexes();
    console.log("[CRO] Index created.");
    done();
  });

  agenda.define("save image from content", async (job, done) => {
    console.log(`[CRO] Save image from content...`);
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
    console.log(`[CRO] Saved image from content.`);
    done();
  });

  agenda.define("set expired coupon cards", async (job, done) => {
    console.log(`[CRO] Set expired coupon cards...`);
    await Card.updateMany(
      { type: "coupon", expiresAt: { $lt: new Date() } },
      { $set: { status: CardStatus.EXPIRED } }
    );
    console.log(`[CRO] Finished setting expired coupon cards.`);
    done();
  });

  agenda.define("update holidays", async (job, done) => {
    console.log(`[CRO] Update holidays...`);
    const year = new Date().getFullYear();
    const [res1, res2] = await Promise.all([
      axios.get(
        `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`
      ),
      axios.get(
        `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${
          year + 1
        }.json`
      )
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
    console.log(`[CRO] Finished update holidays.`);
    done();
  });

  agenda.start();

  agenda.on("ready", () => {
    agenda.every("1 hour", "cancel expired pending bookings");
    agenda.every("1 hour", "cancel expired pending cards");
    agenda.every("1 day", "finish in_service bookings");
    agenda.every("1 day", "update holidays");
    agenda.every("0 0 * * *", "set expired coupon cards"); // run everyday at 0:00am
    // agenda.now("create indexes");
  });

  agenda.on("error", err => {
    console.error(err.message);
  });
};

export default agenda;
