import mongoose, { Schema } from "mongoose";
import moment from "moment";
import updateTimes from "./plugins/updateTimes";
import autoPopulate from "./plugins/autoPopulate";
import { config } from "../models/Config";
import Payment, { IPayment, PaymentGateway } from "./Payment";
import { IUser } from "./User";
import { IStore } from "./Store";
import { ICard } from "./Card";
import { IEvent } from "./Event";
import { IGift } from "./Gift";

const { DEBUG } = process.env;

export enum BookingStatus {
  PENDING = "pending",
  BOOKED = "booked",
  IN_SERVICE = "in_service",
  PENDING_REFUND = "pending_refund",
  FINISHED = "finished",
  CANCELED = "canceled"
}

export enum BookingType {
  PLAY = "play",
  PARTY = "party",
  EVENT = "event",
  GIFT = "gift"
}

export const liveBookingStatus = [
  BookingStatus.PENDING,
  BookingStatus.BOOKED,
  BookingStatus.IN_SERVICE,
  BookingStatus.PENDING_REFUND
];

export const deadBookingStatus = [
  BookingStatus.FINISHED,
  BookingStatus.CANCELED
];

export const paidBookingStatus = [
  BookingStatus.BOOKED,
  BookingStatus.IN_SERVICE,
  BookingStatus.PENDING_REFUND,
  BookingStatus.FINISHED
];

const Booking = new Schema({
  customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
  store: { type: Schema.Types.ObjectId, ref: "Store", required: true },
  type: { type: String, enum: Object.values(BookingType), required: true },
  date: { type: String, required: true },
  checkInAt: { type: String, required: true },
  adultsCount: { type: Number, default: 1 },
  kidsCount: { type: Number, default: 0 },
  socksCount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: Object.values(BookingStatus),
    default: BookingStatus.PENDING
  },
  price: { type: Number },
  priceInPoints: { type: Number },
  card: { type: Schema.Types.ObjectId, ref: "Card" },
  coupon: { type: String },
  event: { type: Schema.Types.ObjectId, ref: "Event" },
  gift: { type: Schema.Types.ObjectId, ref: "Gift" },
  quantity: { type: Number }, // quantity of gifts
  payments: [{ type: Schema.Types.ObjectId, ref: "Payment" }],
  remarks: String
});

Booking.index({ date: 1, checkInAt: 1, customer: 1 }, { unique: true });

Booking.plugin(autoPopulate, [
  { path: "customer", select: "name avatarUrl mobile" },
  { path: "store", select: "name" },
  { path: "payments", options: { sort: { _id: -1 } }, select: "-customer" },
  { path: "card" },
  { path: "event" },
  { path: "gift" }
]);
Booking.plugin(updateTimes);

Booking.set("toJSON", {
  getters: true,
  transform: function(doc, ret, options) {
    delete ret._id;
    delete ret.__v;
  }
});

Booking.methods.calculatePrice = async function() {
  const booking = this as IBooking;

  await booking.populate("customer").execPopulate();

  if (booking.type === "play") {
    let kidsCount = booking.kidsCount;
    let extraAdultsCount = Math.max(
      0,
      booking.adultsCount - booking.kidsCount * config.freeParentsPerKid
    );

    if (booking.card) {
      if (!booking.card.title) {
        await booking.populate("card").execPopulate();
      }
      kidsCount = Math.max(0, booking.kidsCount - booking.card.maxKids);
      extraAdultsCount = Math.max(
        0,
        booking.adultsCount - booking.kidsCount * booking.card.freeParentsPerKid
      );
      // TODO check card valid times
      // TODO check card valid period
    }

    let coupon;

    if (booking.coupon) {
      coupon = config.coupons.find(c => c.slug === booking.coupon);
      if (!coupon) {
        throw new Error("coupon_not_found");
      }
    }

    if (coupon) {
      // fullDay hours with coupon
      booking.price = 0;
    } else {
      // fullDay hours standard
      booking.price =
        config.extraParentFullDayPrice * extraAdultsCount +
        config.kidFullDayPrice * kidsCount;
    }

    if (coupon && coupon.price) {
      booking.price += coupon.price;
    }

    if (coupon && coupon.discountAmount) {
      booking.price -= coupon.discountAmount;
      if (booking.price < 0) {
        booking.price = 0;
      }
    }

    if (coupon && coupon.discountRate) {
      booking.price = booking.price * (1 - coupon.discountRate);
    }

    booking.price += booking.socksCount * config.sockPrice;
    booking.price = +booking.price.toFixed(2);
  } else if (booking.type === "event") {
    if (!booking.populated("event")) {
      await booking.populate("event").execPopulate();
    }
    const event = booking.event;
    if (!event) {
      return;
      // throw new Error("invalid_event");
    }
    booking.priceInPoints = event.priceInPoints * booking.kidsCount;
    if (event.price) {
      booking.price = event.price * booking.kidsCount;
    }
  } else if (booking.type === "gift") {
    if (!booking.populated("gift")) {
      await booking.populate("gift").execPopulate();
    }
    const gift = booking.gift;
    if (!gift) {
      return;
      // throw new Error("invalid_gift");
    }
    booking.priceInPoints = gift.priceInPoints * booking.quantity;
    if (gift.price) {
      booking.price = gift.price * booking.quantity;
    }
  }
};

Booking.methods.createPayment = async function(
  { paymentGateway, useBalance = true, adminAddWithoutPayment = false } = {
    paymentGateway: PaymentGateway
  },
  amount?: number
) {
  const booking = this as IBooking;

  if (!paymentGateway && !booking.card) {
    throw new Error("missing_gateway");
  }

  let totalPayAmount = amount || booking.price;

  let balancePayAmount = 0;

  let attach = `booking ${booking._id}`;

  const title = `预定${booking.store.name} ${booking.date} ${booking.checkInAt}入场`;

  if (booking.card && booking.card.type === "times") {
    const cardPayment = new Payment({
      customer: booking.customer,
      amount: (booking.card.price / booking.card.times) * booking.kidsCount,
      title,
      attach,
      gateway: PaymentGateway.Card,
      gatewayData: {
        cardId: booking.card.id,
        bookingId: booking.id,
        times: booking.kidsCount
      }
    });
    await cardPayment.save();
    booking.payments.push(cardPayment);
  }

  if (
    totalPayAmount >= 0.01 &&
    useBalance &&
    booking.customer.balance &&
    !adminAddWithoutPayment
  ) {
    balancePayAmount = Math.min(totalPayAmount, booking.customer.balance);
    const balancePayment = new Payment({
      customer: booking.customer,
      amount: balancePayAmount,
      amountForceDeposit: booking.socksCount * config.sockPrice,
      title,
      attach,
      gateway: PaymentGateway.Balance
    });

    await balancePayment.save();
    booking.payments.push(balancePayment);
  }

  const extraPayAmount = totalPayAmount - balancePayAmount;
  // console.log(`[PAY] Extra payment amount is ${extraPayAmount}`);

  if (extraPayAmount < 0.01 || adminAddWithoutPayment) {
    booking.status = BookingStatus.BOOKED;
  } else if (extraPayAmount >= 0.01) {
    const extraPayment = new Payment({
      customer: booking.customer,
      amount: DEBUG ? extraPayAmount / 1e4 : extraPayAmount,
      title,
      attach,
      gateway: paymentGateway
    });

    console.log(`[PAY] Extra payment: `, JSON.stringify(extraPayment));

    try {
      await extraPayment.save();
    } catch (err) {
      throw err;
    }

    booking.payments.push(extraPayment);
  }

  if (booking.priceInPoints) {
    const pointsPayment = new Payment({
      customer: booking.customer,
      amount: 0,
      amountInPoints: booking.priceInPoints,
      title,
      attach,
      gateway: paymentGateway
    });

    try {
      if (booking.type === "event") {
        if (!booking.populated("event")) {
          await booking.populate("event").execPopulate();
        }
        if (!booking.event) {
          throw new Error("invalid_event");
        }
        if (booking.event.kidsCountMax) {
          booking.event.kidsCountLeft -= booking.kidsCount;
          await booking.event.save();
        }
      } else if (booking.type === "gift") {
        if (!booking.populated("gift")) {
          await booking.populate("gift").execPopulate();
        }
        if (!booking.gift) {
          throw new Error("invalid_gift");
        }
        if (booking.gift.quantity) {
          booking.gift.quantity -= booking.quantity;
          await booking.gift.save();
        }
      }
      booking.status = BookingStatus.BOOKED;
      await pointsPayment.save();
    } catch (err) {
      throw err;
    }

    booking.payments.push(pointsPayment);
  }
};

Booking.methods.paymentSuccess = async function() {
  const booking = this as IBooking;
  booking.status = BookingStatus.BOOKED;
  await booking.save();
  if (!booking.populated("customer")) {
    await booking.populate("customer").execPopulate();
  }
  if (!booking.customer.points) {
    booking.customer.points = 0;
  }
  booking.customer.points += 1 * booking.price;
  await booking.customer.save();
  // send user notification
};

Booking.methods.createRefundPayment = async function() {
  const booking = this as IBooking;

  // repopulate payments with customers
  await booking.populate("payments").execPopulate();

  const balanceAndCardPayments = booking.payments.filter(
    p =>
      [PaymentGateway.Balance, PaymentGateway.Card].includes(p.gateway) &&
      p.amount > 0 &&
      p.paid
  );
  const extraPayments = booking.payments.filter(
    p =>
      ![PaymentGateway.Balance, PaymentGateway.Card].includes(p.gateway) &&
      p.amount > 0 &&
      p.paid
  );

  for (const p of balanceAndCardPayments) {
    const refundPayment = new Payment({
      customer: p.customer,
      amount: -p.amount,
      amountDeposit: p.amountDeposit ? -p.amountDeposit : undefined,
      amountForceDeposit: p.amountForceDeposit
        ? -p.amountForceDeposit
        : undefined,
      title: `退款：${p.title}`,
      attach: p.attach,
      gateway: p.gateway,
      gatewayData: p.gatewayData,
      original: p.id
    });
    if (p.gateway === PaymentGateway.Card) {
      p.gatewayData.cardRefund = true;
    }
    await refundPayment.save();
    booking.payments.push(refundPayment);
  }

  if (!extraPayments.length) {
    booking.status = BookingStatus.CANCELED;
  } else {
    await Promise.all(
      extraPayments.map(async p => {
        const refundPayment = new Payment({
          customer: p.customer,
          amount: -p.amount,
          title: `退款：${p.title}`,
          attach: p.attach,
          gateway: p.gateway,
          original: p.id
        });
        await refundPayment.save();
        booking.payments.push(refundPayment);
      })
    );
  }
};

Booking.methods.refundSuccess = async function() {
  const booking = this as IBooking;
  booking.status = BookingStatus.CANCELED;
  await booking.save();
  // send user notification
};

Booking.methods.checkIn = async function(save = true) {
  const booking = this as IBooking;
  booking.status = BookingStatus.IN_SERVICE;
  booking.checkInAt = moment().format("HH:mm:ss");
  if (save) {
    await booking.save();
  }
  console.log(`[BOK] Booking ${booking.id} checked in, timer started.`);
  // send user notification
};

Booking.methods.cancel = async function(save = true) {
  const booking = this as IBooking;

  if (
    [BookingStatus.CANCELED, BookingStatus.PENDING_REFUND].includes(
      booking.status
    )
  )
    return;

  if (![BookingStatus.PENDING, BookingStatus.BOOKED].includes(booking.status)) {
    throw new Error("uncancelable_booking_status");
  }
  if (booking.payments.filter(p => p.paid).length) {
    console.log(`[BOK] Refund booking ${booking._id}.`);
    // we don't directly change status to canceled, will auto change on refund fullfil
    booking.status = BookingStatus.PENDING_REFUND;
    await booking.createRefundPayment();
  } else {
    booking.status = BookingStatus.CANCELED;
  }

  console.log(`[BOK] Cancel booking ${booking._id}.`);

  if (save) {
    await booking.save();
  }
};

Booking.methods.finish = async function(save = true) {
  const booking = this as IBooking;

  booking.status = BookingStatus.FINISHED;

  console.log(`[BOK] Finish booking ${booking._id}.`);

  if (save) {
    await booking.save();
  }
};

export interface IBooking extends mongoose.Document {
  customer: IUser;
  store: IStore;
  type: BookingType;
  date: string;
  checkInAt: string;
  adultsCount: number;
  kidsCount: number;
  socksCount: number;
  status: BookingStatus;
  price?: number;
  priceInPoints?: number;
  card?: ICard;
  coupon?: string;
  event?: IEvent;
  gift?: IGift;
  quantity?: number;
  payments?: IPayment[];
  remarks?: string;
  calculatePrice: () => Promise<IBooking>;
  createPayment: (
    Object: {
      paymentGateway?: PaymentGateway;
      useBalance?: boolean;
      adminAddWithoutPayment?: boolean;
    },
    amount?: number
  ) => Promise<IBooking>;
  paymentSuccess: () => Promise<IBooking>;
  createRefundPayment: () => Promise<IBooking>;
  refundSuccess: () => Promise<IBooking>;
  checkIn: (save?: boolean) => Promise<boolean>;
  cancel: (save?: boolean) => Promise<boolean>;
  finish: (save?: boolean) => Promise<boolean>;
}

export default mongoose.model<IBooking>("Booking", Booking);
