import {
  prop,
  arrayProp,
  getModelForClass,
  plugin,
  index,
  DocumentType
} from "@typegoose/typegoose";
import moment from "moment";
import updateTimes from "./plugins/updateTimes";
import autoPopulate from "./plugins/autoPopulate";
import { config } from "../models/Config";
import paymentModel, { Payment, PaymentGateway } from "./Payment";
import { User } from "./User";
import { Store } from "./Store";
import { Card } from "./Card";
import { Event } from "./Event";
import { Gift } from "./Gift";

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

@plugin(autoPopulate, [
  { path: "customer", select: "name avatarUrl mobile" },
  { path: "store", select: "name" },
  { path: "payments", options: { sort: { _id: -1 } }, select: "-customer" },
  { path: "card" },
  { path: "event" },
  { path: "gift" }
])
@plugin(updateTimes)
@index({ date: 1, checkInAt: 1, customer: 1 }, { unique: true })
export class Booking {
  @prop({ ref: "User", required: true })
  customer: DocumentType<User>;

  @prop({ ref: "Store", required: true })
  store: DocumentType<Store>;

  @prop({ type: String, enum: Object.values(BookingType), required: true })
  type: BookingType;

  @prop({ type: String, required: true })
  date: string;

  @prop({ type: String, required: true })
  checkInAt: string;

  @prop({ type: Number, default: 1 })
  adultsCount: number;

  @prop({ type: Number, default: 0 })
  kidsCount: number;

  @prop({ type: Number, default: 0 })
  socksCount: number;

  @prop({
    type: String,
    enum: Object.values(BookingStatus),
    default: BookingStatus.PENDING
  })
  status: BookingStatus;

  @prop()
  price?: number;

  @prop()
  priceInPoints?: number;

  @prop({ ref: "Card" })
  card?: DocumentType<Card>;

  @prop()
  coupon?: string;

  @prop({ ref: "Event" })
  event?: DocumentType<Event>;

  @prop({ ref: "Gift" })
  gift?: DocumentType<Gift>;

  @prop() // quantity of gifts
  quantity?: number;

  @arrayProp({ ref: "Payment" })
  payments?: DocumentType<Payment>[];

  @prop({ remarks: String })
  remarks?: string;

  async calculatePrice(this: DocumentType<Booking>) {
    const booking = this;

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
          booking.adultsCount -
            booking.kidsCount * booking.card.freeParentsPerKid
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
      if (!booking.event) {
        return;
        // throw new Error("invalid_event");
      }
      booking.priceInPoints = booking.event.priceInPoints * booking.kidsCount;
      if (booking.event.price) {
        booking.price = booking.event.price * booking.kidsCount;
      }
    } else if (booking.type === "gift") {
      if (!booking.populated("gift")) {
        await booking.populate("gift").execPopulate();
      }
      if (!booking.gift) {
        return;
        // throw new Error("invalid_gift");
      }
      booking.priceInPoints = booking.gift.priceInPoints * booking.quantity;
      if (booking.gift.price) {
        booking.price = booking.gift.price * booking.quantity;
      }
    }
  }

  async createPayment(
    this: DocumentType<Booking>,
    {
      paymentGateway,
      useBalance = true,
      adminAddWithoutPayment = false
    }: {
      paymentGateway: PaymentGateway;
      useBalance: boolean;
      adminAddWithoutPayment: boolean;
    },
    amount?: number
  ) {
    const booking = this;

    if (!paymentGateway && !booking.card) {
      throw new Error("missing_gateway");
    }

    let totalPayAmount = amount || booking.price;

    let balancePayAmount = 0;

    let attach = `booking ${booking._id}`;

    const title = `预定${booking.store.name} ${booking.date} ${booking.checkInAt}入场`;

    if (booking.card && booking.card.type === "times") {
      const cardPayment = new paymentModel({
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
      const balancePayment = new paymentModel({
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
      const extraPayment = new paymentModel({
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
      const pointsPayment = new paymentModel({
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
  }

  async paymentSuccess(this: DocumentType<Booking>) {
    const booking = this;

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
  }

  async createRefundPayment(this: DocumentType<Booking>) {
    const booking = this;

    // repopulate payments with customers
    await booking.populate("payments").execPopulate();

    const balanceAndCardPayments = booking.payments.filter(
      (p: DocumentType<Payment>) =>
        [PaymentGateway.Balance, PaymentGateway.Card].includes(p.gateway) &&
        p.amount > 0 &&
        p.paid
    );
    const extraPayments = booking.payments.filter(
      (p: DocumentType<Payment>) =>
        ![PaymentGateway.Balance, PaymentGateway.Card].includes(p.gateway) &&
        p.amount > 0 &&
        p.paid
    );

    for (const payment of balanceAndCardPayments) {
      const p = payment;
      const refundPayment = new paymentModel({
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
        extraPayments.map(async (p: DocumentType<Payment>) => {
          const refundPayment = new paymentModel({
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
  }

  async refundSuccess(this: DocumentType<Booking>) {
    const booking = this;
    booking.status = BookingStatus.CANCELED;
    await booking.save();
    // send user notification
  }

  async checkIn(this: DocumentType<Booking>, save = true) {
    const booking = this;
    booking.status = BookingStatus.IN_SERVICE;
    booking.checkInAt = moment().format("HH:mm:ss");
    if (save) {
      await booking.save();
    }
    console.log(`[BOK] Booking ${booking.id} checked in, timer started.`);
    // send user notification
  }

  async cancel(this: DocumentType<Booking>, save = true) {
    const booking = this;

    if (
      [BookingStatus.CANCELED, BookingStatus.PENDING_REFUND].includes(
        booking.status
      )
    )
      return;

    if (
      ![BookingStatus.PENDING, BookingStatus.BOOKED].includes(booking.status)
    ) {
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
  }

  async finish(this: DocumentType<Booking>, save = true) {
    const booking = this;

    booking.status = BookingStatus.FINISHED;

    console.log(`[BOK] Finish booking ${booking._id}.`);

    if (save) {
      await booking.save();
    }
  }
}

export default getModelForClass(Booking, {
  schemaOptions: {
    toJSON: {
      getters: true,
      transform: function(doc, ret, options) {
        delete ret._id;
        delete ret.__v;
      }
    }
  }
});
