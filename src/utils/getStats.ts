import moment from "moment";
import Booking, { paidBookingStatus, BookingType } from "../models/Booking";
import Payment, {
  PaymentGateway,
  flowGateways,
  cardCouponGateways
} from "../models/Payment";
import { Store } from "../models/Store";
import { DocumentType } from "@typegoose/typegoose";

export default async (
  dateInput?: string | Date,
  dateInputFrom?: string | Date,
  store?: DocumentType<Store>
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

  const bookingsPaidQuery = Booking.find({
    date: dateStrFrom ? { $gte: dateStrFrom, $lte: dateStr } : dateStr,
    status: { $in: paidBookingStatus },
    type: BookingType.PLAY
  });

  if (store) {
    bookingsPaidQuery.find({ store });
  }

  const bookingsPaid = await bookingsPaidQuery.exec();

  const paymentsQuery = Payment.find({
    createdAt: {
      $gte: startOfDay,
      $lte: endOfDay
    },
    paid: true
  });

  if (store) {
    paymentsQuery.find({ store });
  }

  const payments = await paymentsQuery.exec();

  const flowAmount = payments
    .filter(p => flowGateways.includes(p.gateway))
    .reduce((amount, p) => amount + p.amount, 0);

  const cardCouponAmount = payments
    .filter(p => cardCouponGateways.includes(p.gateway))
    .reduce((amount, p) => amount + (p.amountDeposit || p.amount), 0);

  const customerCount = bookingsPaid.reduce(
    (count, booking) => count + booking.adultsCount + booking.kidsCount,
    0
  );

  const customersByType = bookingsPaid.reduce(
    (acc, booking) => {
      if (booking.card) {
        acc.card.adultsCount += booking.adultsCount;
        acc.card.kidsCount += booking.kidsCount;
      } else if (booking.coupon) {
        acc.coupon.adultsCount += booking.adultsCount;
        acc.coupon.kidsCount += booking.kidsCount;
      } else {
        acc.guest.adultsCount += booking.adultsCount;
        acc.guest.kidsCount += booking.kidsCount;
      }
      return acc;
    },
    {
      card: { adultsCount: 0, kidsCount: 0 },
      coupon: { adultsCount: 0, kidsCount: 0 },
      guest: { adultsCount: 0, kidsCount: 0 }
    }
  );

  const flowAmountByGateways: { [gateway: string]: number } = payments
    .filter(p => flowGateways.includes(p.gateway))
    .reduce((acc, payment) => {
      if (!acc[payment.gateway]) {
        acc[payment.gateway] = 0;
      }
      acc[payment.gateway] += payment.amount;
      return acc;
    }, {});

  const couponsCount: {
    slug: string;
    name: string;
    count: number;
    amount: number;
  }[] = bookingsPaid
    .filter(b => b.coupon)
    .reduce((acc, booking) => {
      let item = acc.find(c => c.name === booking.coupon.title);
      const coupon = booking.coupon;
      if (!item) {
        item = {
          name: coupon.title,
          price: coupon.priceThirdParty,
          kidsCount: 0,
          adultsCount: 0,
          amount: 0
        };
        acc.push(item);
      }
      item.adultsCount += booking.adultsCount;
      item.kidsCount += booking.kidsCount;
      return acc;
    }, [])
    .map(item => {
      item.amount = item.price * item.kidsCount;
      return item;
    });

  const cardsCount = bookingsPaid
    .filter(b => b.card)
    .reduce((acc, booking) => {
      let item = acc.find(i => i.name === booking.card.title);

      if (!item) {
        item = {
          name: booking.card.title,
          adultsCount: 0,
          kidsCount: 0,
          amount: 0
        };
        acc.push(item);
      }

      item.adultsCount += booking.adultsCount;
      item.kidsCount += booking.kidsCount;
      item.amount += booking.payments
        .filter(p =>
          [PaymentGateway.Card, PaymentGateway.Balance].includes(p.gateway)
        )
        .reduce((amount, p) => amount + p.amount, 0);
      return acc;
    }, []);

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

  const dailyFlowAmount = await Payment.aggregate([
    {
      $match: {
        createdAt: { $gte: startOfDateRange, $lte: endOfDay },
        paid: true,
        gateway: { $in: flowGateways }
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

  const dailyCardCouponPayment = await Payment.aggregate([
    {
      $match: {
        createdAt: { $gte: startOfDateRange, $lte: endOfDay },
        paid: true,
        gateway: { $in: cardCouponGateways }
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
    flowAmount,
    cardCouponAmount,
    customerCount,
    flowAmountByGateways,
    couponsCount,
    cardsCount,
    customersByType,
    dailyCustomers,
    dailyFlowAmount,
    dailyCardCouponPayment
  };
};
