import moment from "moment";
import { config } from "../models/Config";
import Booking, { paidBookingStatus, BookingStatus } from "../models/Booking";
import Payment, { Gateways } from "../models/Payment";

export default async (
  dateInput?: string | Date,
  dateInputFrom?: string | Date
) => {
  const dateStr = moment(dateInput).format("YYYY-MM-DD"),
    dateStrFrom = dateInputFrom && moment(dateInputFrom).format("YYYY-MM-DD"),
    startOfDay = moment(dateInputFrom || dateInput)
      .startOf("day")
      .toDate(),
    endOfDay = moment(dateInput)
      .endOf("day")
      .toDate(),
    dateRangeStartStr = moment(dateInputFrom || dateInput)
      .subtract(6, "days")
      .format("YYYY-MM-DD"),
    startOfDateRange = moment(dateInput)
      .subtract(6, "days")
      .startOf("day")
      .toDate();

  const coupons = config.coupons;

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

  const depositAmount = payments
    .filter(p => p.attach.match(/^deposit /))
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

  const paidAmountByGateways: { [gateway: string]: number } = payments.reduce(
    (amountByGateways, payment) => {
      if (!amountByGateways[payment.gateway]) {
        amountByGateways[payment.gateway] = 0;
      }
      if (payment.gateway === Gateways.Balance) {
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
      const coupon = coupons.find(c => c.slug === booking.coupon);
      if (!couponCount) {
        couponCount = {
          slug: coupon.slug,
          name: coupon.name,
          price: coupon.amount,
          count: 0
        };
        couponsCount.push(couponCount);
      }
      couponCount.count +=
        (booking.adultsCount + booking.kidsCount) /
        ((coupon.adultsCount || 0) + (coupon.kidsCount || 0) || 1);
      return couponsCount;
    }, [])
    .map(couponCount => {
      couponCount.amount = couponCount.price * couponCount.count;
      return couponCount;
    });

  paidAmountByGateways.coupon = couponsCount.reduce((a, c) => a + c.amount, 0);

  const depositsCount: {
    slug: string;
    desc: string;
    price: number;
    cardType: string;
    count: number;
  }[] = [];

  payments
    .filter(p => p.attach.match(/^deposit /))
    .reduce((depositsCount, payment) => {
      const [, levelSlug] = payment.attach.match(
        /^deposit [\d\w]+ ([\d\w\-]+)/
      );
      let depositCount = depositsCount.find(c => c.slug === levelSlug);
      if (!depositCount) {
        const level = config.depositLevels.find(l => l.slug === levelSlug);
        if (!level) {
          throw new Error(
            `Level not found for slug ${levelSlug}, ${payment.attach}`
          );
        }

        depositCount = {
          ...level,
          count: 0
        };

        depositsCount.push(depositCount);
      }
      depositCount.count++;
      return depositsCount;
    }, depositsCount);

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

  const dailyDepositPayment = await Payment.aggregate([
    {
      $match: {
        createdAt: { $gte: startOfDateRange, $lte: endOfDay },
        attach: { $regex: /^deposit / },
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
    partyAmount,
    depositAmount,
    socksCount,
    socksAmount,
    paidAmountByGateways,
    couponsCount,
    depositsCount,
    dailyCustomers,
    dailyBookingPayment,
    dailyDepositPayment
  };
};
