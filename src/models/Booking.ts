import {
  prop,
  getModelForClass,
  plugin,
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
import { Coupon } from "./Coupon";
import { sendTemplateMessage } from "../utils/wechat";
import cardTypeModel from "./CardType";

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
  GIFT = "gift",
  FOOD = "food"
}

export const liveBookingStatus = [
  BookingStatus.PENDING,
  BookingStatus.BOOKED,
  BookingStatus.IN_SERVICE
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
  { path: "customer", select: "name avatarUrl mobile tags" },
  { path: "store", select: "name" },
  { path: "payments", options: { sort: { _id: -1 } }, select: "-customer" },
  { path: "card", select: "-content" },
  { path: "coupon", select: "-content" },
  { path: "event", select: "-content" },
  { path: "gift", select: "-content" }
])
@plugin(updateTimes)
// @index({ date: 1, checkInAt: 1, customer: 1 }, { unique: true })
export class Booking {
  @prop({ ref: "User", required: true, index: true })
  customer: DocumentType<User>;

  @prop({ ref: "Store" })
  store: DocumentType<Store>;

  @prop({ enum: Object.values(BookingType), required: true })
  type: BookingType;

  @prop({ required: true, index: true })
  date: string;

  @prop({ required: true })
  checkInAt: string;

  @prop()
  checkOutAt: string;

  @prop({ type: Number })
  adultsCount?: number;

  @prop({ type: Number })
  kidsCount?: number;

  @prop({ type: Number })
  socksCount?: number;

  @prop({ type: Number })
  bandsPrinted?: number;

  @prop({
    type: String,
    enum: Object.values(BookingStatus),
    default: BookingStatus.PENDING
  })
  status: BookingStatus;

  @prop({
    type: String,
    enum: Object.values(BookingStatus)
  })
  statusWas?: BookingStatus;

  @prop()
  price?: number;

  @prop()
  priceInPoints?: number;

  @prop({ ref: "Card" })
  card?: DocumentType<Card>;

  @prop({ ref: "Coupon" })
  coupon?: DocumentType<Coupon>;

  @prop({ ref: "Event" })
  event?: DocumentType<Event>;

  @prop({ ref: "Gift" })
  gift?: DocumentType<Gift>;

  @prop() // quantity of gifts
  quantity?: number;

  @prop({ ref: "Payment" })
  payments?: DocumentType<Payment>[];

  @prop({ remarks: String })
  remarks?: string;

  async calculatePrice(this: DocumentType<Booking>) {
    const booking = this;

    if (!booking.populated("customer")) {
      await booking.populate("customer").execPopulate();
    }

    if (booking.type === "play") {
      let kidsCount = booking.kidsCount;
      let extraAdultsCount = Math.max(
        0,
        booking.adultsCount - booking.kidsCount * config.freeParentsPerKid
      );

      if (booking.card) {
        if (!booking.populated("card")) {
          await booking.populate("card").execPopulate();
        }
        if (booking.card.type === "balance") {
          booking.card = null;
        } else {
          kidsCount = Math.max(0, booking.kidsCount - booking.card.maxKids);
          extraAdultsCount = Math.max(
            0,
            booking.adultsCount -
              (booking.kidsCount - kidsCount) * booking.card.freeParentsPerKid -
              kidsCount * config.freeParentsPerKid
          );
        }
        // TODO check card valid times
        // TODO check card valid period
      }

      if (booking.coupon) {
        if (!booking.populated("coupon")) {
          await booking.populate("coupon").execPopulate();
        }
        if (!booking.coupon) {
          throw new Error("coupon_not_found");
        }
        kidsCount = 0;
        extraAdultsCount = Math.max(
          0,
          booking.adultsCount -
            booking.kidsCount * booking.coupon.freeParentsPerKid
        );
      }

      booking.price =
        config.extraParentFullDayPrice * extraAdultsCount +
        config.kidFullDayPrice * kidsCount;

      if (booking.coupon && booking.coupon.price) {
        booking.price += booking.coupon.price * booking.kidsCount;
      }

      booking.price += booking.socksCount * config.sockPrice;
      booking.price = +booking.price.toFixed(2);
    } else if (booking.type === "event") {
      if (!booking.populated("event")) {
        await booking
          .populate({ path: "event", select: "-content" })
          .execPopulate();
      }
      if (!booking.event) {
        return;
        // throw new Error("invalid_event");
      }
      if (booking.event.priceInPoints) {
        booking.priceInPoints = booking.event.priceInPoints * booking.kidsCount;
      }
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
      if (booking.gift.priceInPoints) {
        booking.priceInPoints = booking.gift.priceInPoints * booking.quantity;
      }
      if (booking.gift.price) {
        booking.price = booking.gift.price * booking.quantity;
      }
    } else if (booking.type === "food") {
      if (booking.card && !booking.populated("card")) {
        await booking.populate("card").execPopulate();
        if (
          booking.card.type === "coupon" &&
          (!booking.card.overPrice || booking.price >= booking.card.overPrice)
        ) {
          if (booking.card.discountPrice) {
            booking.price -= booking.card.discountPrice;
          } else if (booking.card.discountRate) {
            booking.price = booking.price * (1 - booking.card.discountRate);
          }
        }
        if (booking.card.type === "coupon" && booking.card.fixedPrice) {
          booking.price = booking.card.fixedPrice;
        }
      }
    }
  }

  async createPayment(
    this: DocumentType<Booking>,
    {
      paymentGateway,
      useBalance = true,
      atReception = false
    }: {
      paymentGateway: PaymentGateway;
      useBalance?: boolean;
      atReception?: boolean;
    },
    amount?: number
  ) {
    const booking = this;
    let totalPayAmount = amount || booking.price;
    let balancePayAmount = 0;
    let attach = `booking ${booking._id}`;
    let title = "";

    if (booking.type === BookingType.GIFT) {
      title = `${booking.gift.title} ${booking.quantity}份 ${
        booking.store?.name || "门店通用"
      } `;
    } else if (booking.type === BookingType.EVENT) {
      title = `${booking.event.title} ${booking.kidsCount}人 ${booking.store.name} `;
    } else if (booking.type === BookingType.FOOD) {
      title = `餐饮消费`;
    } else {
      title = `${booking.store.name} ${booking.adultsCount}大${
        booking.kidsCount
      }小 ${booking.date.substr(5)} ${booking.checkInAt.substr(0, 5)}前入场`;
    }

    if (booking.card && ["times", "coupon"].includes(booking.card.type)) {
      if (!atReception) {
        if (
          booking.card.start &&
          new Date(booking.card.start) >
            moment(booking.date).endOf("day").toDate()
        ) {
          throw new Error("card_not_started");
        }
        const cardExpiresAt = booking.card.end || booking.card.expiresAt;
        if (
          cardExpiresAt &&
          new Date(cardExpiresAt) < moment(booking.date).startOf("day").toDate()
        ) {
          throw new Error("card_expired");
        }
      }
      const cardPayment = new paymentModel({
        customer: booking.customer,
        store: booking.store,
        amount:
          (booking.card.price / booking.card.times) * booking.kidsCount || 0,
        title,
        attach,
        gateway: PaymentGateway.Card,
        gatewayData: {
          atReception,
          cardId: booking.card.id,
          bookingId: booking.id,
          times:
            booking.card.type === "times"
              ? Math.min(
                  booking.kidsCount,
                  booking.card.maxKids
                  // booking.card.timesLeft
                )
              : 1
        }
      });
      await cardPayment.save();
      booking.payments.push(cardPayment);
    }

    if (booking.coupon) {
      title = booking.coupon.title + " " + title;
      const couponPayment = new paymentModel({
        customer: booking.customer,
        store: booking.store,
        amount: booking.coupon.priceThirdParty * booking.kidsCount,
        title,
        attach,
        gateway: PaymentGateway.Coupon,
        gatewayData: {
          atReception,
          couponId: booking.coupon.id,
          bookingId: booking.id
        }
      });
      await couponPayment.save();
      booking.payments.push(couponPayment);
    }

    if (
      totalPayAmount >= 0.01 &&
      useBalance &&
      booking.customer.balance &&
      paymentGateway !== PaymentGateway.Points
    ) {
      balancePayAmount = Math.min(totalPayAmount, booking.customer.balance);
      const balancePayment = new paymentModel({
        customer: booking.customer,
        store: booking.store,
        amount: balancePayAmount,
        amountForceDeposit: booking.socksCount * config.sockPrice || 0,
        title,
        attach,
        gateway: PaymentGateway.Balance,
        gatewayData: {
          atReception
        }
      });

      await balancePayment.save();
      booking.payments.push(balancePayment);
    }

    const extraPayAmount = totalPayAmount - balancePayAmount;
    // console.log(`[PAY] Extra payment amount is ${extraPayAmount}`);

    if (extraPayAmount < 0.01) {
      await booking.paymentSuccess(atReception);
    } else if (
      extraPayAmount >= 0.01 &&
      paymentGateway !== PaymentGateway.Points
    ) {
      if (!paymentGateway) {
        // TODO possible create balance payment before failed
        throw new Error("missing_gateway");
      }

      const extraPayment = new paymentModel({
        customer: booking.customer,
        store: booking.store?.id,
        amount: DEBUG ? extraPayAmount / 1e4 : extraPayAmount,
        title,
        attach,
        gateway: paymentGateway,
        gatewayData: {
          atReception
        }
      });

      if (paymentGateway !== PaymentGateway.WechatPay) {
        await booking.paymentSuccess(atReception);
      }

      await extraPayment.save();
      booking.payments.push(extraPayment);
    }
    if (booking.priceInPoints && paymentGateway === PaymentGateway.Points) {
      const pointsPayment = new paymentModel({
        customer: booking.customer,
        store: booking.store,
        amount: 0,
        amountInPoints: booking.priceInPoints,
        title,
        attach,
        gateway: paymentGateway,
        gatewayData: {
          atReception
        }
      });

      try {
        await booking.paymentSuccess(atReception);
        await pointsPayment.save();
      } catch (err) {
        throw err;
      }

      await pointsPayment.save();
      booking.payments.push(pointsPayment);
    }
    if (paymentGateway === PaymentGateway.Points && !booking.priceInPoints) {
      throw new Error("points_gateway_not_supported");
    }

    // we have to save all payments before booking saved, otherwise mongoose remove unsaved ref keys
    // await Promise.all(booking.payments.map(p => p.save()));
    // we give up save all payments at the same time. It saves no time but cause a user parallel saving problem
  }

  async paymentSuccess(this: DocumentType<Booking>, atReception = false) {
    // conditional change booking status
    if (this.type === BookingType.FOOD) {
      this.status = BookingStatus.FINISHED;
    } else if ([BookingType.GIFT, BookingType.EVENT].includes(this.type)) {
      this.status = atReception ? BookingStatus.FINISHED : BookingStatus.BOOKED;
    } else if (this.date === moment().format("YYYY-MM-DD") && atReception) {
      this.status = BookingStatus.IN_SERVICE;
    } else {
      this.status = BookingStatus.BOOKED;
    }

    console.log(`[BOK] Auto set booking status ${this.status} for ${this.id}.`);

    if (this.type === BookingType.EVENT) {
      if (!this.populated("event")) {
        await this.populate({
          path: "event",
          select: "-content"
        }).execPopulate();
      }
      if (!this.event) {
        throw new Error("invalid_event");
      }
      if (this.event.kidsCountMax) {
        this.event.kidsCountLeft -= this.kidsCount;
        await this.event.save();
      }
    } else if (this.type === BookingType.GIFT) {
      if (!this.populated("gift")) {
        await this.populate("gift").execPopulate();
      }
      if (!this.gift) {
        throw new Error("invalid_gift");
      }
      if (this.gift.quantity) {
        this.gift.quantity -= this.quantity;
        await this.gift.save();
      }
    }

    if (!this.populated("customer")) {
      await this.populate("customer").execPopulate();
    }

    if (this.gift && this.gift.tagCustomer) {
      if (!this.customer.tags) this.customer.tags = [];
      if (!this.customer.tags.includes(this.gift.tagCustomer)) {
        this.customer.tags.push(this.gift.tagCustomer);
        await this.customer.save();
      }
    }

    const rewardCardTypesString =
      this.coupon?.rewardCardTypes ||
      (this.card?.type !== "balance" && this.card?.rewardCardTypes);

    if (rewardCardTypesString) {
      const rewardCardTypes = await cardTypeModel.find({
        slug: { $in: rewardCardTypesString.split(" ") }
      });
      await Promise.all(
        rewardCardTypes.map(async cardType => {
          const card = cardType.issue(this.customer);

          card.paymentSuccess();
          card.rewardedFromBooking = this;

          await card.save();
          console.log(
            `[CRD] Rewarded card ${card.slug} to customer ${this.customer.id}.`
          );
          return card;
        })
      );
    }

    console.log(`[PAY] Booking payment success: ${this.id}.`);
    // send user notification
  }

  async createRefundPayment(this: DocumentType<Booking>) {
    const booking = this;

    // repopulate payments with customers
    await booking.populate("payments").execPopulate();

    const balanceAndCardPayments = booking.payments.filter(
      (p: DocumentType<Payment>) =>
        [PaymentGateway.Balance, PaymentGateway.Card].includes(p.gateway) &&
        p.amount >= 0 &&
        p.paid
    );

    const pointsPayments = booking.payments.filter(
      (p: DocumentType<Payment>) =>
        [PaymentGateway.Points].includes(p.gateway) && p.amount >= 0 && p.paid
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
        store: booking.store,
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

    for (const payment of pointsPayments) {
      const p = payment;
      const refundPayment = new paymentModel({
        customer: p.customer,
        store: booking.store,
        amount: 0,
        amountInPoints: -p.amountInPoints,
        title: `积分退还：${p.title}`,
        attach: p.attach,
        gateway: p.gateway,
        gatewayData: p.gatewayData,
        original: p.id
      });
      await refundPayment.save();
      booking.payments.push(refundPayment);
    }

    await Promise.all(
      extraPayments.map(async (p: DocumentType<Payment>) => {
        const refundPayment = new paymentModel({
          customer: p.customer,
          store: booking.store,
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
    booking.status = BookingStatus.CANCELED;
  }

  async refundSuccess(this: DocumentType<Booking>) {
    this.status = BookingStatus.CANCELED;
    if (this.type === BookingType.EVENT) {
      if (!this.populated("event")) {
        await this.populate({
          path: "event",
          select: "-content"
        }).execPopulate();
      }
      if (!this.event) {
        throw new Error("invalid_event");
      }
      if (this.event.kidsCountMax) {
        this.event.kidsCountLeft += this.kidsCount;
        await this.event.save();
      }
    } else if (this.type === BookingType.GIFT) {
      if (!this.populated("gift")) {
        await this.populate("gift").execPopulate();
      }
      if (!this.gift) {
        throw new Error("invalid_gift");
      }
      if (this.gift.quantity) {
        this.gift.quantity += this.quantity;
        await this.gift.save();
      }
    }
    // send user notification
  }

  async checkIn(this: DocumentType<Booking>, save = true) {
    const booking = this;
    booking.status = BookingStatus.IN_SERVICE;
    booking.checkInAt = moment().format("HH:mm:ss");
    if (save) {
      await booking.save();
    }
    console.log(`[BOK] Booking ${booking.id} checked in.`);
    await booking.populate("card").execPopulate();
    if (booking.card?.type === "times") {
      sendTemplateMessage(booking.customer, "writeoff", [
        "您的次卡已成功核销",
        booking.customer.name,
        `${booking.store.name} ${booking.adultsCount}大${booking.kidsCount}小`,
        `${booking.kidsCount}`,
        `${booking.date} ${booking.checkInAt}`,
        `卡内剩余次数：${booking.card.timesLeft}`
      ]);
    }
  }

  async cancel(this: DocumentType<Booking>, save = true) {
    const booking = this;

    if (booking.status === BookingStatus.CANCELED) {
      return;
    }

    if (booking.payments.filter(p => p.paid).length) {
      console.log(`[BOK] Refund booking ${booking._id}.`);
      // we don't directly change status to canceled, will auto change on refund fullfil
      booking.status = BookingStatus.PENDING_REFUND;
      await booking.createRefundPayment();
      if (!booking.payments.filter(p => p.amount < 0).some(p => !p.paid)) {
        booking.refundSuccess();
      }
    } else {
      booking.status = BookingStatus.CANCELED;
    }

    console.log(`[BOK] Cancel booking ${booking._id}.`);
    sendTemplateMessage(booking.customer, "cancel", [
      "您的预约已被取消",
      `${booking.store.name} ${booking.adultsCount}大${booking.kidsCount}小`,
      `${booking.date}`,
      "管理员审批",
      "您的微信支付、次卡、余额将自动原路退回；如有疑问，请联系门店"
    ]);

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

  async checkStoreLimit(this: DocumentType<Booking>, group = "common") {
    const dayOfWeek = moment(this.date).day();
    const special = this.store.dailyLimit.dates.find(
      d => d.date === this.date && d.group === group
    )?.limit;
    const common = this.store.dailyLimit[group][dayOfWeek];
    let limit: number | null = null;
    if (special !== undefined) {
      limit = special;
    } else if (common !== undefined) {
      limit = common;
    }
    if (limit !== null) {
      const bookings = await bookingModel.find({
        type: BookingType.PLAY,
        store: this.store,
        date: this.date,
        status: { $in: paidBookingStatus },
        coupon: { $exists: true }
      });
      const kidsCount = bookings.reduce(
        (count, booking) => count + booking.kidsCount,
        0
      );
      if (kidsCount + this.kidsCount > limit) {
        throw new Error("store_limit_exceeded");
      }
    }
  }
}

const bookingModel = getModelForClass(Booking, {
  schemaOptions: {
    toJSON: {
      getters: true,
      transform: function (doc, ret, options) {
        delete ret._id;
        delete ret.__v;
      }
    }
  }
});

export default bookingModel;
