import moment from "moment";
import Booking, { paidBookingStatus } from "../models/Booking";
import Payment, {
  PaymentGateway,
  flowGateways,
  cardCouponGateways,
  Scene
} from "../models/Payment";
import { Store } from "../models/Store";
import { DocumentType } from "@typegoose/typegoose";

export default async (
  dateInput?: string | Date,
  dateEndInput?: string | Date,
  store?: DocumentType<Store>
) => {
  // const starts: number = Date.now();
  // console.log("[DEBUG] Stats starts:", starts);
  const dateStr = moment(dateInput).format("YYYY-MM-DD"),
    dateEndStr = moment(dateEndInput || dateInput).format("YYYY-MM-DD"),
    startOfDay = moment(dateInput).startOf("day").toDate(),
    endOfDay = moment(dateEndInput || dateInput)
      .endOf("day")
      .toDate(),
    dateRangeStartStr = dateEndInput
      ? moment(dateInput).format("YYYY-MM-DD")
      : moment(dateInput).subtract(6, "days").format("YYYY-MM-DD"),
    dateRangeStart = dateEndInput
      ? moment(dateInput).toDate()
      : moment(dateInput).subtract(6, "days").startOf("day").toDate();
  const bookingsPaidQuery = Booking.find({
    date: { $gte: dateStr, $lte: dateEndStr },
    status: { $in: paidBookingStatus }
  });

  if (store) {
    bookingsPaidQuery.find({ store });
  }

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

  bookingsPaidQuery.setOptions({
    skipAutoPopulationPaths: ["customer", "store", "payments", "event", "gift"]
  });
  paymentsQuery.setOptions({ skipAutoPopulationPaths: ["customer"] });
  console.time("[STATS] Queries took:");
  const [bookingsPaid, payments] = await Promise.all([
    bookingsPaidQuery.exec(),
    paymentsQuery.exec()
  ]);
  console.timeEnd("[STATS] Queries took:");
  // console.log("[DEBUG] Bookings & payments queried:", Date.now() - starts);

  const flowAmount = payments
    .filter(p => flowGateways.includes(p.gateway))
    .reduce((amount, p) => amount + p.amount, 0);

  const cardCouponAmount = payments
    .filter(p => cardCouponGateways.includes(p.gateway))
    .reduce((amount, p) => amount + (p.amountDeposit || p.amount), 0);

  const playAmount = payments
    .filter(p => p.scene === Scene.PLAY)
    .reduce((amount, p) => amount + (p.amountDeposit || p.amount), 0);

  const foodAmount = payments
    .filter(p => p.scene === Scene.FOOD)
    .reduce((amount, p) => amount + (p.amountDeposit || p.amount), 0);

  const mallAmount = payments
    .filter(p => p.scene === Scene.MALL)
    .reduce((amount, p) => amount + (p.amountDeposit || p.amount), 0);

  const customerCount = bookingsPaid
    .filter(b => b.type === Scene.PLAY)
    .reduce(
      (count, booking) => count + booking.adultsCount + booking.kidsCount,
      0
    );

  const foodBookingsCount = bookingsPaid.filter(b => b.type === Scene.FOOD)
    .length;

  const mallBookingsCount = bookingsPaid.filter(b => b.type === Scene.MALL)
    .length;

  const customersByType = bookingsPaid
    .filter(b => b.type === Scene.PLAY)
    .reduce(
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

  const flowAmountByScenes: { [gateway: string]: number } = payments
    .filter(p => flowGateways.includes(p.gateway))
    .reduce((acc, payment) => {
      if (!acc[payment.scene]) {
        acc[payment.scene] = 0;
      }
      acc[payment.scene] += payment.amount;
      return acc;
    }, {});

  const flowAmountByStores: { [storeId: string]: number } = payments
    .filter(p => flowGateways.includes(p.gateway))
    .reduce((acc, payment) => {
      if (!payment.store) return acc;
      const storeId = payment.store.toString();
      if (!acc[storeId]) {
        acc[storeId] = 0;
      }
      acc[storeId] += payment.amount;
      return acc;
    }, {});

  const couponsCount: {
    slug: string;
    name: string;
    count: number;
    kidsPerCoupon: number;
    amount: number;
  }[] = bookingsPaid
    .filter(b => b.type === Scene.PLAY)
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
          amount: 0,
          kidsPerCoupon: coupon.kidsCount
        };
        acc.push(item);
      }
      item.adultsCount += booking.adultsCount;
      item.kidsCount += booking.kidsCount;
      return acc;
    }, [])
    .map(item => {
      item.amount = (item.price * item.kidsCount) / item.kidsPerCoupon;
      // couponsCount kidsCount is used as coupon count
      item.kidsCount = item.kidsCount / item.kidsPerCoupon;
      return item;
    });

  const cardsCount = bookingsPaid
    .filter(b => b.type === Scene.PLAY)
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
      item.amount +=
        (booking.amountPaidInCard || 0) + (booking.amountPaidInDeposit || 0);
      return acc;
    }, []);

  const balanceCount = bookingsPaid
    .filter(b => b.type === Scene.PLAY)
    .filter(b => b.amountPaidInBalance)
    .reduce(
      (acc, booking) => {
        acc.adultsCount += booking.adultsCount;
        acc.kidsCount += booking.kidsCount;
        return acc;
      },
      {
        name: "账户余额",
        adultsCount: 0,
        kidsCount: 0,
        amount: 0
      }
    );

  balanceCount.amount = payments
    .filter(p => p.gateway === PaymentGateway.Balance)
    .reduce((acc, p) => acc + p.amountDeposit || p.amount, 0);
  // console.log("[DEBUG] Groups calculated:", Date.now() - starts);

  const dailyCustomers = await Booking.aggregate([
    { $match: { date: { $gte: dateRangeStartStr, $lte: dateEndStr } } },
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
        createdAt: { $gte: dateRangeStart, $lte: endOfDay },
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
        createdAt: { $gte: dateRangeStart, $lte: endOfDay },
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
  // console.log("[DEBUG] Chart calculated:", Date.now() - starts);

  return {
    flowAmount,
    cardCouponAmount,
    playAmount,
    foodAmount,
    mallAmount,
    customerCount,
    foodBookingsCount,
    mallBookingsCount,
    flowAmountByGateways,
    flowAmountByScenes,
    flowAmountByStores,
    couponsCount,
    cardsCount,
    balanceCount,
    customersByType,
    dailyCustomers,
    dailyFlowAmount,
    dailyCardCouponPayment
  };
};
