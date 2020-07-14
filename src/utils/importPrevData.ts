import { createConnection } from "mysql";
import User from "../models/User";
import Card, { CardStatus } from "../models/Card";
import Store from "../models/Store";
import Booking, { BookingType, BookingStatus } from "../models/Booking";
import moment from "moment";
import Payment, { PaymentGateway } from "../models/Payment";
import Coupon from "../models/Coupon";
import escapeStringRegexp from "escape-string-regexp";

// item.type 0 会员卡，24 扫码，25 点评，27 麦淘 30 周末酒店
// 28/29 小丸子， 26 彩贝壳， 23 现金， 22 银行卡， 20 支付宝，21 微信支付(POS)
// 3 其他来源
// 2 现金(其他)支付
// 1 微信支付
const paymentType = {
  0: PaymentGateway.Card,
  1: PaymentGateway.WechatPay,
  2: PaymentGateway.Cash,
  3: "其他来源",
  20: PaymentGateway.Alipay,
  21: PaymentGateway.WechatPay,
  23: PaymentGateway.Cash,
  24: PaymentGateway.Dianping,
  25: "点评",
  26: "彩贝壳",
  27: "麦淘",
  28: "小丸子",
  29: "小丸子",
  30: "周末酒店"
};

export default async (database: "mmts" | "mmjn", storeKey: "静安" | "长宁") => {
  const slug = database.substr(2);
  const userMobileMap = new Map(),
    userCodeMap = new Map(),
    bookingEntranceIdMap = new Map(),
    cardMap = new Map(),
    cardCustomerMap = new Map(),
    bookingMap = new Map(),
    paymentMap = new Map(),
    userMap = new Map();

  const connection = createConnection({
    host: "localhost",
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASS || "",
    database
  });

  const store = await Store.findOne({
    name: new RegExp(escapeStringRegexp(storeKey))
  });

  if (!store) {
    throw new Error("store_not_found");
  }

  const coupons = await Coupon.find();

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
      await importMembership(item);
    } catch (e) {
      console.error(e.message);
    }
  }
  console.log(`${membership.length} membership processed.`);
  console.timeEnd("Import membership");

  console.log("Import special card...");
  console.time("Import special card");
  const specialCard = await query("SELECT * FROM `special_card`");
  for (const item of specialCard) {
    if (!item.phone) continue;
    try {
      await importSpecialCard(item);
    } catch (e) {
      console.error(e.message);
    }
  }
  console.log(`${specialCard.length} special cards processed.`);
  console.timeEnd("Import special card");

  console.log("Import entrance_records...");
  console.time("Import entrance_records");
  const entranceRecords = await query("SELECT * FROM `entrance_records`");
  for (const item of entranceRecords) {
    try {
      await importEntranceRecord(item);
    } catch (e) {
      console.error(e.message);
    }
  }
  console.log(`${entranceRecords.length} entrance records processed.`);
  console.timeEnd("Import entrance_records");

  // console.log("Import family_packages...");
  // console.time("Import family_packages");
  // const familyPackages = await query("SELECT * FROM `family_package`");
  // for (const item of familyPackages) {
  //   try {
  //     await importFamilyPackage(item);
  //   } catch (e) {
  //     console.error(e.message);
  //   }
  // }
  // console.log(`${entranceRecords.length} entrance records processed.`);
  // console.timeEnd("Import family_packages");

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

  connection.end();

  try {
    for (const item of consumeRecords) {
      const u = userCodeMap.get(item.code);
      if (!u) continue;
      const match = item.costDes.match(/会员(\d+)次卡/);
      if (match) {
        if (u.timesLeft === undefined) {
          u.timesLeft = 0;
        }
        if (u.times === undefined) {
          u.times = 0;
        }
        u.timesLeft += +match[1];
        u.times += +match[1];
      }
      if (item.costDes === "入场消费") {
        const matchTimes = item.cost.match(/核销次数：(\d+)/);
        if (!+matchTimes[1]) throw new Error("times wrong");
        u.timesLeft -= +matchTimes[1];
      }
      if (u.timesLeft >= 15) {
        u.maxKids = 3;
      } else if (u.timesLeft >= 5) {
        u.maxKids = 2;
      } else if (u.timesLeft === 0) {
        u.maxKids = undefined;
      }
    }
    const uu = Array.from(userCodeMap)
      .map(u => u[1])
      .filter(u => (u as any).maxKids);
    console.log(`${uu.length} users to update card maxKids.`);
    for (const u of uu) {
      const card = cardCustomerMap.get(u.id);
      card.maxKids = u.maxKids;
      card.times = u.times;
    }
  } catch (e) {
    console.error(e);
  }

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

  async function importMembership(item) {
    let user = userMobileMap.get(item.phone);
    if (!user) {
      user = new User({
        childGender: item.childGender = "1" ? "男" : "女",
        childName: item.childName,
        avatarUrl: item.headimg,
        name: item.name,
        mobile: item.phone,
        cardNo: `${slug}-${item.code}`,
        updatedAt: item.updateTime,
        childBirthday:
          item.babyBirthday && moment(item.babyBirthday).format("YYYY-MM-DD"),
        createdAt: new Date(item.createTime),
        remarks: item.remark
      });
      // await user.save();
      userMobileMap.set(user.mobile, user);
      userMap.set(user.id, user);
      // console.log(`User created: ${user.mobile}.`);
    }
    userCodeMap.set(item.code, user);

    const card =
      item.account < 100
        ? new Card({
            customer: user._id,
            timesLeft: +item.account,
            status: +item.account ? CardStatus.ACTIVATED : CardStatus.EXPIRED,
            title: `${storeKey}店次卡`,
            type: "times",
            slug: `${slug}-times`,
            times: +item.account,
            store,
            posterUrl: "",
            freeParentsPerKid: 2,
            maxKids: 2,
            price: 0,
            createdAt: new Date(item.createTime),
            expiresAt: item.expiredTime && new Date(item.expiredTime)
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
            maxKids: 1,
            price: 0,
            createdAt: new Date(item.createTime),
            expiresAt: item.expiredTime && new Date(item.expiredTime)
          });

    // await card.save();
    cardMap.set(card.id, card);
    cardCustomerMap.set("" + card.customer, card);

    // console.log(`Card created: ${card.title}.`);
  }

  async function importSpecialCard(item) {
    let user = userMobileMap.get(item.phone);
    if (!user) {
      user = new User({
        childName: item.name,
        avatarUrl: item.photo,
        name: item.name,
        mobile: item.phone,
        childBirthday: item.babyBirthday,
        createdAt: new Date(item.createTime)
      });
      // await user.save();
      userMobileMap.set(user.mobile, user);
      userMap.set(user.id, user);
      // console.log(`User created: ${user.mobile}.`);
    }
    userCodeMap.set(item.code, user);

    const card = new Card({
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
      maxKids: 1,
      price: +item.fee,
      createdAt: new Date(item.createTime),
      expiresAt: new Date(item.expiredTime)
    });

    // await card.save();
    cardMap.set(card.id, card);
  }

  async function importEntranceRecord(item) {
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
      status: item.status > 0 ? BookingStatus.FINISHED : BookingStatus.CANCELED,
      createdAt: new Date(item.enterTime),
      remarks: item.remark,
      serialNumber: item.serialNumber
    });

    const title = `${booking.store.name} ${booking.adultsCount}大${booking.kidsCount}小 ${booking.date} ${booking.checkInAt}入场`;

    if ([3, 25, 26, 27, 28, 29, 30].includes(item.type)) {
      const coupon = coupons.find(
        c => c.title.indexOf(paymentType[item.type]) > -1
      );
      if (!coupon) throw new Error(paymentType[item.type]);
      const couponPayment = new Payment({
        customer,
        amount: coupon.priceThirdParty,
        paid: item.status > 0,
        title,
        attach: `booking ${booking.id}`,
        gateway: PaymentGateway.Coupon,
        gatewayData: {
          couponId: coupon.id,
          bookingId: booking.id
        }
      });
      booking.payments.push(couponPayment._id);
      paymentMap.set(couponPayment.id, couponPayment);
      booking.coupon = coupon;
    }

    if ([1, 2, 20, 21, 23, 24].includes(item.type)) {
      const directPayment = new Payment({
        customer,
        amount: +item.totalFee,
        paid: item.status > 0,
        title,
        attach: `booking ${booking.id}`,
        gateway: paymentType[item.type]
      });
      booking.payments.push(directPayment._id);
      paymentMap.set(directPayment.id, directPayment);
    }

    if (item.type === 0) {
      const card = cardCustomerMap.get(customer.id);
      booking.card = card;
      // if (customer.cards.length === 1) {
      //   booking.card = customer.cards[0];
      // }
      // if (customer.cards.length > 1) {
      //   booking.card = customer.cards.sort((c1, c2) => {
      //     if (!c1.updatedAt) return 1;
      //     return c1.updatedAt < c2.updatedAt ? 1 : -1;
      //   })[0];
      //   console.log(
      //     // @ts-ignore
      //     `Multiple cards for user ${customer.mobile}, use ${booking.card.updatedAt}`
      //   );
      // }
    }

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
    booking.payments.push(payment._id);
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

    // 1 Card
    // 2 buy time card
    // 3 food
    // 6 guest
    // 7 buy period card

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
    const booking = bookingEntranceIdMap.get(item.trade_no);

    if (booking) {
      booking.payments.push(payment._id);
    }

    // await payment.save();
    paymentMap.set(payment.id, payment);
  }
};
