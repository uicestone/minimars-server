import moment from "moment";
import { config } from "../models/Config";
import Booking, { paidBookingStatus, BookingStatus } from "../models/Booking";
import Payment, { PaymentGateway } from "../models/Payment";
import Card from "../models/Card";

export default async (
  dateInput?: string | Date,
  dateInputFrom?: string | Date
) => {
  const dateStr = moment(dateInput).format("YYYY-MM-DD"),
    dateStrFrom = dateInputFrom && moment(dateInputFrom).format("YYYY-MM-DD"),
    startOfDay = moment(dateInputFrom || dateInput)
      .startOf("day")
      .toDate(),
    endOfDay = moment(dateInput).endOf("day").toDate(),
    dateRangeStartStr = moment(dateInputFrom || dateInput)
      .subtract(6, "days")
      .format("YYYY-MM-DD"),
    startOfDateRange = moment(dateInput)
      .subtract(6, "days")
      .startOf("day")
      .toDate();

  const bookingsPaid = await Booking.find({
    date: dateStrFrom ? { $gte: dateStrFrom, $lte: dateStr } : dateStr,
    status: { $in: paidBookingStatus }
  });

  const payments = await Payment.find({
    createdAt: {
      $gte: startOfDay,
      $lte: endOfDay
    },
    paid: true
  });

  const bookingServing = await Booking.find({
    status: BookingStatus.IN_SERVICE
  });

  const checkedInCount = bookingServing.reduce(
    (count, booking) => count + booking.adultsCount + booking.kidsCount,
    0
  );

  const customerCount = bookingsPaid.reduce(
    (count, booking) => count + booking.adultsCount + booking.kidsCount,
    0
  );

  const kidsCount = bookingsPaid.reduce(
    (count, booking) => count + booking.kidsCount,
    0
  );

  // booking paid amount
  const paidAmount = payments
    .filter(p => p.attach.match(/^booking /))
    .reduce((amount, p) => amount + (p.amountDeposit || p.amount), 0);

  const cardAmount = payments
    .filter(p => p.attach.match(/^card /))
    .reduce((amount, p) => amount + p.amount, 0);

  const socksCount = bookingsPaid.reduce(
    (socks, booking) => socks + booking.socksCount,
    0
  );

  const socksAmount = socksCount * config.sockPrice;

  const partyAmount = bookingsPaid
    .filter(booking => booking.type === "party")
    .reduce(
      (amount, booking) =>
        amount +
        booking.payments
          .filter(p => p.paid)
          .reduce((a, p) => a + (p.amountDeposit || p.amount), 0),
      0
    );

  const playAmount = bookingsPaid
    .filter(booking => booking.type === "play")
    .reduce(
      (amount, booking) =>
        amount +
        booking.payments
          .filter(p => p.paid)
          .reduce((a, p) => a + (p.amountDeposit || p.amount), 0),
      0
    );
  const foodAmount = bookingsPaid
    .filter(booking => booking.type === "food")
    .reduce(
      (amount, booking) =>
        amount +
        booking.payments
          .filter(p => p.paid)
          .reduce((a, p) => a + (p.amountDeposit || p.amount), 0),
      0
    );

  const paidAmountByGateways: { [gateway: string]: number } = payments.reduce(
    (amountByGateways, payment) => {
      if (!amountByGateways[payment.gateway]) {
        amountByGateways[payment.gateway] = 0;
      }
      if (payment.gateway === PaymentGateway.Balance) {
        amountByGateways[payment.gateway] += payment.amountDeposit;
      } else {
        amountByGateways[payment.gateway] += payment.amount;
      }
      return amountByGateways;
    },
    {}
  );

  const couponsCount: {
    slug: string;
    name: string;
    count: number;
    amount: number;
  }[] = bookingsPaid
    .filter(b => b.coupon)
    .reduce((couponsCount, booking) => {
      let couponCount = couponsCount.find(c => c.slug === booking.coupon);
      const coupon = booking.coupon;
      if (!couponCount) {
        couponCount = {
          name: coupon.title,
          price: coupon.priceThirdParty,
          count: 0
        };
        couponsCount.push(couponCount);
      }
      couponCount.count += booking.kidsCount / coupon.kidsCount;
      return couponsCount;
    }, [])
    .map(couponCount => {
      couponCount.amount = couponCount.price * couponCount.count;
      return couponCount;
    });

  paidAmountByGateways.coupon = couponsCount.reduce((a, c) => a + c.amount, 0);

  // const cardTypesCount: {
  //   slug: string;
  //   title: string;
  //   price: number;
  //   count: number;
  // }[] = [];

  // const cardIds = payments
  //   .filter(p => p.attach.match(/^card /))
  //   .map(p => {
  //     return p.attach.split(" ")[1];
  //   });

  // const cards = await Card.find({ _id: { $in: cardIds } });

  // for (const card of cards) {
  //   const cardTypeCount = cardTypesCount.find(t => t.slug === card.slug);
  //   if (cardTypeCount) {
  //     cardTypeCount.count++;
  //   } else {
  //     cardTypesCount.push({
  //       slug: card.slug,
  //       title: card.title,
  //       price: card.price,
  //       count: 1
  //     });
  //   }
  // }

  // for (const cardPayment of payments.filter(p => p.attach.match(/^card /))) {
  //   const paymentAttach = cardPayment.attach.split(" ");
  //   const cardId = paymentAttach[1];
  //   await Card.findOne({ _id: cardId });
  // }

  const dailyCustomers = await Booking.aggregate([
    { $match: { date: { $gte: dateRangeStartStr, $lte: dateStr } } },
    {
      $project: {
        adultsCount: 1,
        kidsCount: 1,
        date: {
          $dateToParts: {
            date: {
              $dateFromString: {
                dateString: "$date",
                timezone: "Asia/Shanghai"
              }
            },
            timezone: "Asia/Shanghai"
          }
        }
      }
    },
    {
      $group: {
        _id: {
          y: "$date.year",
          m: "$date.month",
          d: "$date.day"
        },
        adultsCount: {
          $sum: "$adultsCount"
        },
        kidsCount: {
          $sum: "$kidsCount"
        }
      }
    },
    {
      $sort: { _id: 1 }
    },
    {
      $project: {
        _id: 0,
        day: {
          $dayOfWeek: {
            date: {
              $dateFromParts: {
                year: "$_id.y",
                month: "$_id.m",
                day: "$_id.d",
                timezone: "Asia/Shanghai"
              }
            }
          }
        },
        adultsCount: 1,
        kidsCount: 1
      }
    }
  ]);

  const dailyBookingPayment = await Payment.aggregate([
    {
      $match: {
        createdAt: { $gte: startOfDateRange, $lte: endOfDay },
        attach: { $regex: /^booking / },
        paid: true
      }
    },
    {
      $project: {
        amountDeposit: 1,
        amount: 1,
        date: {
          $dateToParts: {
            date: "$createdAt",
            timezone: "Asia/Shanghai"
          }
        }
      }
    },
    {
      $group: {
        _id: {
          y: "$date.year",
          m: "$date.month",
          d: "$date.day"
        },
        amount: {
          $sum: { $cond: ["$amountDeposit", "$amountDeposit", "$amount"] }
        }
      }
    },
    {
      $sort: { _id: 1 }
    },
    {
      $project: {
        _id: 0,
        day: {
          $dayOfWeek: {
            date: {
              $dateFromParts: {
                year: "$_id.y",
                month: "$_id.m",
                day: "$_id.d",
                timezone: "Asia/Shanghai"
              }
            }
          }
        },
        amount: 1
      }
    }
  ]);

  const dailyCardPayment = await Payment.aggregate([
    {
      $match: {
        createdAt: { $gte: startOfDateRange, $lte: endOfDay },
        attach: { $regex: /^card / },
        paid: true
      }
    },
    {
      $project: {
        amount: 1,
        date: {
          $dateToParts: {
            date: "$createdAt",
            timezone: "Asia/Shanghai"
          }
        }
      }
    },
    {
      $group: {
        _id: {
          y: "$date.year",
          m: "$date.month",
          d: "$date.day"
        },
        amount: {
          $sum: "$amount"
        }
      }
    },
    {
      $sort: { _id: 1 }
    },
    {
      $project: {
        _id: 0,
        day: {
          $dayOfWeek: {
            date: {
              $dateFromParts: {
                year: "$_id.y",
                month: "$_id.m",
                day: "$_id.d",
                timezone: "Asia/Shanghai"
              }
            }
          }
        },
        amount: 1
      }
    }
  ]);

  return {
    checkedInCount,
    customerCount,
    kidsCount,
    paidAmount,
    playAmount,
    partyAmount,
    foodAmount,
    cardAmount,
    socksCount,
    socksAmount,
    paidAmountByGateways,
    couponsCount,
    // cardTypesCount,
    dailyCustomers,
    dailyBookingPayment,
    dailyCardPayment
  };
};
