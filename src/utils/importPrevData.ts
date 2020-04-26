import { createConnection } from "mysql";
import User from "../models/User";
import Card, { CardStatus } from "../models/Card";
import Store from "../models/Store";
import Booking, { BookingType, BookingStatus } from "../models/Booking";
import moment from "moment";
import Payment, { PaymentGateway } from "../models/Payment";

export default async (database: "mmts" | "mmjn", storeKey: "静安" | "长宁") => {
  const userMobileMap = new Map(),
    userCodeMap = new Map(),
    bookingEntranceIdMap = new Map(),
    cardMap = new Map(),
    bookingMap = new Map(),
    paymentMap = new Map(),
    userMap = new Map();

  const connection = createConnection({
    host: "localhost",
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASS || "",
    database
  });

  const store = await Store.findOne({ name: new RegExp(storeKey) });

  if (!store) {
    throw new Error("store_not_found");
  }

  const customers = await User.find({ role: "customer" });

  for (const c of customers) {
    userMobileMap.set(c.mobile, c);
    userMap.set(c.id, c);
  }

  console.log(`${customers.length} users loaded to map.`);

  connection.connect();

  const query: (sql: string) => Promise<Record<string, any>[]> = sql => {
    return new Promise(resolve => {
      connection.query(sql, function (err, results, fields) {
        resolve(results);
      });
    });
  };

  console.log("Import membership...");
  console.time("Import membership");
  const membership = await query("SELECT * FROM `membership`");
  for (const item of membership) {
    if (!item.phone) continue;
    try {
      await importMembership(item, store);
    } catch (e) {
      console.error(e.message);
    }
  }
  console.log(`${membership.length} membership processed.`);
  console.timeEnd("Import membership");

  console.log("Import entrance_records...");
  console.time("Import entrance_records");
  const entranceRecords = await query("SELECT * FROM `entrance_records`");
  for (const item of entranceRecords) {
    try {
      await importEntranceRecord(item, store);
    } catch (e) {
      console.error(e.message);
    }
  }
  console.log(`${entranceRecords.length} entrance records processed.`);
  console.timeEnd("Import entrance_records");

  console.log("Import family_packages...");
  console.time("Import family_packages");
  const familyPackages = await query("SELECT * FROM `family_package`");
  for (const item of familyPackages) {
    try {
      await importFamilyPackage(item);
    } catch (e) {
      console.error(e.message);
    }
  }
  console.log(`${entranceRecords.length} entrance records processed.`);
  console.timeEnd("Import family_packages");

  console.log("Import consume_records...");
  console.time("Import consume_records");
  const consumeRecords = await query("SELECT * FROM `consume_records`");
  for (const item of consumeRecords) {
    try {
      await importConsumeRecord(item);
    } catch (e) {
      console.error(e.message);
    }
  }
  console.log(`${consumeRecords.length} consume records processed`);
  console.timeEnd("Import consume_records");

  console.log("Save documents...");
  console.time("Save documents");
  try {
    await User.insertMany(Array.from(userMap, i => i[1]).filter(i => i.isNew));
    console.log(`${userMap.size} users saved.`);
    await Card.insertMany(Array.from(cardMap, i => i[1]));
    console.log(`${cardMap.size} cards saved.`);
    await Booking.insertMany(Array.from(bookingMap, i => i[1]));
    console.log(`${bookingMap.size} bookings saved.`);
    await Payment.insertMany(Array.from(paymentMap, i => i[1]));
    console.log(`${paymentMap.size} payments saved.`);
  } catch (e) {
    console.error(e.message);
  }
  console.timeEnd("Save documents");

  connection.end();

  async function importMembership(item, store) {
    let user = userMobileMap.get(item.phone);
    if (!user) {
      user = new User({
        childGender: item.childGender = "1" ? "男" : "女",
        childName: item.childName,
        avatarUrl: item.headimg,
        name: item.name,
        mobile: item.phone,
        updatedAt: item.updateTime,
        childBirthday: item.babyBirthday,
        createdAt: new Date(item.createTime)
      });
      // await user.save();
      userMobileMap.set(user.mobile, user);
      userMap.set(user.id, user);
      // console.log(`User created: ${user.mobile}.`);
    }
    userCodeMap.set(item.code, user);

    let originalTimes = 0;

    if (item.account > 100) {
    } else if (item.account > 16) {
      originalTimes = 30;
    } else if (item.account > 6) {
      originalTimes = 15;
    } else {
      originalTimes = 5;
    }

    const card = originalTimes
      ? new Card({
          customer: user._id,
          timesLeft: item.account,
          status: CardStatus.ACTIVATED,
          title: `${storeKey}店${originalTimes}次卡`,
          type: "times",
          slug: `ts-${originalTimes}`,
          times: originalTimes,
          store,
          posterUrl: "",
          freeParentsPerKid: 2,
          maxKids: originalTimes > 5 ? 3 : 2,
          price: 0,
          createdAt: new Date(item.createTime)
        })
      : new Card({
          customer: user._id,
          status:
            new Date(item.expiredTime) > new Date()
              ? CardStatus.ACTIVATED
              : CardStatus.EXPIRED,
          title: `${storeKey}店年卡`,
          type: "period",
          slug: `period`,
          start: new Date(item.createTime),
          end: new Date(item.expiredTime),
          store,
          posterUrl: "",
          freeParentsPerKid: 2,
          maxKids: originalTimes > 5 ? 3 : 2,
          price: 0,
          createdAt: new Date(item.createTime)
        });

    // await card.save();
    cardMap.set(card.id, card);

    // console.log(`Card created: ${card.title}.`);
  }

  async function importEntranceRecord(item, store) {
    let customer = userMobileMap.get(item.code) || userCodeMap.get(item.code);
    if (!customer) {
      // if (item.code.length !== 11 && !item.code.match(/^\+/)) {
      //   throw new Error(
      //     `Invalid mobile ${item.code} in entrance record ${item.serialNumber}.`
      //   );
      // }
      customer = new User({
        role: "customer",
        mobile: item.code,
        createdAt: new Date(item.enterTime)
      });
      // await customer.save();
      userMobileMap.set(item.code, customer);
      userMap.set(customer.id, customer);
    }
    const booking = new Booking({
      customer,
      store,
      type: BookingType.PLAY,
      date: moment(item.enterTime).format("YYYY-MM-DD"),
      checkInAt: moment(item.enterTime).format("HH:mm:ss"),
      adultsCount: +item.enterPeople - item.cost,
      kidsCount: item.cost,
      status: BookingStatus.FINISHED,
      createdAt: new Date(item.enterTime)
    });
    // await booking.save();
    bookingMap.set(booking.id, booking);
    bookingEntranceIdMap.set(item.id, booking);
    // console.log(
    //   `Booking of ${customer.mobile} at ${booking.date} ${booking.checkInAt} saved.`
    // );
  }

  async function importFamilyPackage(item) {
    const booking = bookingEntranceIdMap.get(item.entranceId);
    if (!booking)
      throw new Error(
        `Family package entranceId not found: ${item.entranceId}`
      );
    const customer = bookingEntranceIdMap.get(item.entranceId).customer;
    const payment = new Payment({
      customer: customer._id,
      amount: +item.totalPrice,
      paid: true,
      title: item.type,
      attach: "booking imported " + item.price + " " + item.amount,
      gateway: PaymentGateway.Cash,
      createdAt: new Date(item.createTime)
    });
    if (!booking.payments) booking.payments = [];
    booking.payments.push(payment.id);
    paymentMap.set(payment.id, payment);
  }

  async function importConsumeRecord(item) {
    let customer = userMobileMap.get(item.code) || userCodeMap.get(item.code);

    if (!customer) {
      const message = `Code not found as user: ${item.code} ${item.costDes}.`;
      if (item.costDes !== "点餐消费") {
        throw new Error(message);
      }
    }

    const cost = item.cost.replace("金额：￥", "");

    const payment = ["入场消费", "点餐消费"].includes(item.costDes)
      ? new Payment({
          customer: customer ? customer._id : undefined,
          amount: 0,
          paid: true,
          title: item.costDes,
          attach:
            "booking imported " +
            (item.costDes === "入场消费"
              ? item.cost.replace("核销次数：", "")
              : "food"),
          gateway: PaymentGateway.Card,
          gatewayData: {
            remark: item.remark,
            costType: item.costType,
            payType: item.payType,
            status: item.status,
            times: +item.cost.replace("核销次数：", "")
          },
          createdAt: new Date(item.createtime)
        })
      : new Payment({
          customer: customer._id,
          amount: +cost,
          paid: item.status !== -1,
          title: item.costDes,
          attach: "card imported",
          gateway: PaymentGateway.Cash,
          gatewayData: {
            remark: item.remark,
            costType: item.costType,
            payType: item.payType,
            status: item.status
          },
          createdAt: new Date(item.createtime)
        });

    // await payment.save();
    paymentMap.set(payment.id, payment);
  }
};
