import {
  prop,
  getModelForClass,
  plugin,
  DocumentType,
  modelOptions,
  Severity
} from "@typegoose/typegoose";
import moment from "moment";
import updateTimes from "./plugins/updateTimes";
import autoPopulate from "./plugins/autoPopulate";
import { config } from "../models/Config";
import PaymentModel, { Payment, PaymentGateway, Scene } from "./Payment";
import { User } from "./User";
import { Store } from "./Store";
import CardModel, { Card } from "./Card";
import { Event } from "./Event";
import { Gift } from "./Gift";
import { Coupon } from "./Coupon";
import { sendTemplateMessage, TemplateMessageType } from "../utils/wechat";
import CardTypeModel from "./CardType";

const { DEBUG } = process.env;

export enum BookingStatus {
  PENDING = "pending",
  BOOKED = "booked",
  IN_SERVICE = "in_service",
  PENDING_REFUND = "pending_refund",
  FINISHED = "finished",
  CANCELED = "canceled"
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

export const validBookingStatus = [
  BookingStatus.PENDING,
  BookingStatus.BOOKED,
  BookingStatus.IN_SERVICE,
  BookingStatus.FINISHED
];

export class BookingPrice {
  price = 0;
  priceInPoints?: number;
  coupon?: Coupon;
}

type Amounts = Required<
  Pick<
    Booking,
    | "amountPaid"
    | "amountPaidInBalance"
    | "amountPaidInDeposit"
    | "amountPaidInCard"
    | "amountPaidInPoints"
  >
>;

@plugin(autoPopulate, [
  { path: "customer", select: "name avatarUrl mobile tags" },
  { path: "store", select: "name code" },
  { path: "payments", options: { sort: { _id: -1 } }, select: "-customer" },
  { path: "card", select: "-content" },
  { path: "coupon", select: "-content" },
  { path: "event", select: "-content" },
  { path: "gift", select: "-content" }
])
@plugin(updateTimes)
// @index({ date: 1, checkInAt: 1, customer: 1 }, { unique: true })
@modelOptions({ options: { allowMixed: Severity.ALLOW } })
export class Booking {
  @prop({ ref: "User" })
  customer?: DocumentType<User>;

  @prop({ ref: "Store" })
  store?: DocumentType<Store>;

  @prop({ enum: Object.values(Scene), required: true })
  type!: Scene;

  @prop({ required: true })
  date!: string;

  @prop({ required: true })
  checkInAt!: string;

  @prop()
  checkOutAt?: string;

  @prop({ type: Number })
  adultsCount?: number;

  @prop({ type: Number })
  kidsCount?: number;

  @prop({ type: Number })
  socksCount?: number;

  @prop({ type: Number })
  bandsPrinted?: number;

  @prop({ type: String })
  photos?: string[];

  @prop({ type: String })
  faces?: string[];

  @prop({
    type: String,
    enum: Object.values(BookingStatus),
    default: BookingStatus.PENDING
  })
  status: BookingStatus = BookingStatus.PENDING;

  @prop({
    type: String,
    enum: Object.values(BookingStatus)
  })
  statusWas?: BookingStatus;

  @prop({ type: Number })
  price?: number;

  @prop({ type: Number })
  amountPaid?: number;

  @prop({ type: Number })
  amountPaidInBalance?: number;

  @prop({ type: Number })
  amountPaidInDeposit?: number;

  @prop({ type: Number })
  amountPaidInCard?: number;

  @prop({ type: Number })
  amountPaidInPoints?: number;

  @prop({ ref: "Card" })
  card?: DocumentType<Card>;

  @prop({ ref: "Coupon" })
  coupon?: DocumentType<Coupon>;

  @prop({ ref: "Event" })
  event?: DocumentType<Event>;

  @prop({ ref: "Gift" })
  gift?: DocumentType<Gift>;

  @prop({ type: Number }) // quantity of gifts
  quantity?: number;

  @prop({ ref: "Payment" })
  payments!: DocumentType<Payment>[];

  @prop()
  remarks?: string;

  @prop({ type: Object })
  providerData?: Record<string, any>;

  async calculatePrice(this: DocumentType<Booking>): Promise<BookingPrice> {
    const bookingPrice = new BookingPrice();

    if (!this.populated("customer")) {
      await this.populate("customer").execPopulate();
    }

    if (this.type === "play") {
      if (
        this.adultsCount === undefined ||
        this.kidsCount === undefined ||
        config.freeParentsPerKid === undefined ||
        config.extraParentFullDayPrice === undefined ||
        config.kidFullDayPrice === undefined
      ) {
        throw new Error("undefined_play_params");
      }
      let kidsCount = this.kidsCount;
      let extraAdultsCount = Math.max(
        0,
        this.adultsCount - this.kidsCount * config.freeParentsPerKid
      );

      if (this.card) {
        if (!this.populated("card")) {
          await this.populate("card").execPopulate();
        }
        if (
          this.card.maxKids === undefined ||
          this.card.freeParentsPerKid === undefined
        )
          throw new Error("invalid_card");
        if (this.card.type === "balance") {
          this.card = undefined;
        } else {
          kidsCount = Math.max(0, this.kidsCount - this.card.maxKids);
          extraAdultsCount = Math.max(
            0,
            this.adultsCount -
              (this.kidsCount - kidsCount) * this.card.freeParentsPerKid -
              kidsCount * config.freeParentsPerKid
          );
        }
        // TODO check card valid times
        // TODO check card valid period
      }

      if (this.coupon) {
        if (!this.populated("coupon")) {
          await this.populate("coupon").execPopulate();
        }
        if (!this.coupon) {
          throw new Error("coupon_not_found");
        }
        kidsCount = 0;
        extraAdultsCount = Math.max(
          0,
          this.adultsCount - this.kidsCount * this.coupon.freeParentsPerKid
        );
      }

      bookingPrice.price =
        config.extraParentFullDayPrice * extraAdultsCount +
        config.kidFullDayPrice * kidsCount;

      if (this.coupon && this.coupon.price) {
        bookingPrice.price += this.coupon.price * this.kidsCount;
      }

      if (config.sockPrice && this.socksCount) {
        bookingPrice.price += this.socksCount * config.sockPrice;
      }
      bookingPrice.price = +bookingPrice.price.toFixed(2);
    } else if (this.type === "event") {
      if (this.kidsCount === undefined) {
        throw new Error("undefined_event_kids_count");
      }
      if (!this.populated("event")) {
        await this.populate({
          path: "event",
          select: "-content"
        }).execPopulate();
      }
      if (!this.event) {
        return bookingPrice;
        // throw new Error("invalid_event");
      }
      if (this.event.priceInPoints) {
        bookingPrice.priceInPoints = this.event.priceInPoints * this.kidsCount;
      }
      if (this.event.price) {
        bookingPrice.price = this.event.price * this.kidsCount;
      }
    } else if (this.type === "gift") {
      if (this.quantity === undefined) {
        throw new Error("undefined_gift_quantity");
      }
      if (!this.populated("gift")) {
        await this.populate("gift").execPopulate();
      }
      if (!this.gift) {
        return bookingPrice;
        // throw new Error("invalid_gift");
      }
      if (this.gift.priceInPoints) {
        bookingPrice.priceInPoints = this.gift.priceInPoints * this.quantity;
      }
      if (this.gift.price) {
        bookingPrice.price = this.gift.price * this.quantity;
      }
    } else if (this.type === "food") {
      if (this.card && !this.populated("card")) {
        await this.populate("card").execPopulate();
        if (this.price) {
          bookingPrice.price = this.price;
        }
        if (
          this.card.type === "coupon" &&
          (!this.card.overPrice || bookingPrice.price >= this.card.overPrice)
        ) {
          if (this.card.discountPrice) {
            bookingPrice.price -= this.card.discountPrice;
          } else if (this.card.discountRate) {
            bookingPrice.price =
              bookingPrice.price * (1 - this.card.discountRate);
          }
        }
        if (this.card.type === "coupon" && this.card.fixedPrice) {
          bookingPrice.price = this.card.fixedPrice;
        }
      }
    } else if (this.type === "party") {
      if (this.price) {
        bookingPrice.price = this.price;
      }
    }
    return bookingPrice;
  }

  async createPayment(
    this: DocumentType<Booking>,
    {
      paymentGateway,
      useBalance = true,
      atReception = false
    }: {
      paymentGateway?: PaymentGateway;
      useBalance?: boolean;
      atReception?: boolean;
    },
    amount: number,
    amountInPoints?: number
  ) {
    const booking = this;
    let totalPayAmount = amount;
    let balancePayAmount = 0;
    let attach = `booking ${booking._id}`;
    let title = "";

    if (booking.type === Scene.GIFT) {
      if (!booking.gift) throw new Error("undefined_gift");
      title = `${booking.gift.title} ${booking.quantity}份 ${
        booking.store?.name || "门店通用"
      } `;
    } else if (booking.type === Scene.PARTY) {
      title = "派对消费";
    } else if (booking.type === Scene.EVENT) {
      if (!booking.event || !booking.store)
        throw new Error("undefined_event_store");
      title = `${booking.event.title} ${booking.kidsCount}人 ${booking.store.name} `;
    } else if (booking.type === Scene.FOOD) {
      title = `餐饮消费`;
    } else {
      if (!booking.store) throw new Error("undefined_play_store");
      title = `${booking.store.name} ${booking.adultsCount}大${
        booking.kidsCount
      }小 ${booking.date.substr(5)} ${booking.checkInAt.substr(0, 5)}前入场`;
    }

    if (booking.card && ["times", "coupon"].includes(booking.card.type)) {
      if (booking.card.times === undefined)
        throw new Error("invalid_times_coupon_card");
      if (!atReception) {
        if (
          booking.card.start &&
          new Date(booking.card.start) >
            moment(booking.date).endOf("day").toDate()
        ) {
          throw new Error("card_not_started");
        }
        const cardExpiresAt = booking.card.expiresAt || booking.card.end;
        if (
          cardExpiresAt &&
          new Date(cardExpiresAt) < moment(booking.date).startOf("day").toDate()
        ) {
          throw new Error("card_expired");
        }
      }
      const cardPayment = new PaymentModel({
        scene: booking.type,
        customer: booking.customer,
        store: booking.store,
        amount:
          (booking.card.price / booking.card.times) * (booking.kidsCount || 1),
        title,
        attach,
        booking: booking.id,
        gateway: PaymentGateway.Card,
        times: booking.kidsCount || 1,
        gatewayData: {
          atReception,
          cardId: booking.card.id,
          cardTitle: booking.card.title,
          timesBefore: booking.card.timesLeft
        }
      });
      await cardPayment.save();
      booking.payments.push(cardPayment);
    }

    if (booking.coupon) {
      if ((booking.kidsCount || 0) % booking.coupon.kidsCount) {
        throw new Error("coupon_kids_count_not_match");
      }
      title = booking.coupon.title + " " + title;
      const couponPayment = new PaymentModel({
        scene: booking.type,
        customer: booking.customer,
        store: booking.store,
        amount:
          (booking.coupon.priceThirdParty * (booking.kidsCount || 1)) /
          booking.coupon.kidsCount,
        title,
        attach,
        booking: booking.id,
        gateway: PaymentGateway.Coupon,
        gatewayData: {
          atReception,
          couponId: booking.coupon.id,
          couponTitle: booking.coupon.title,
          bookingId: booking.id
        }
      });
      await couponPayment.save();
      booking.payments.push(couponPayment);
    }

    if (
      totalPayAmount >= 0.01 &&
      useBalance &&
      booking.customer?.balance &&
      paymentGateway !== PaymentGateway.Points
    ) {
      balancePayAmount = Math.min(totalPayAmount, booking.customer.balance);
      const balancePayment = new PaymentModel({
        scene: booking.type,
        customer: booking.customer,
        store: booking.store,
        amount: balancePayAmount,
        amountForceDeposit:
          (booking.socksCount || 0) * (config.sockPrice || 0) || 0,
        title,
        attach,
        booking: booking.id,
        gateway: PaymentGateway.Balance,
        gatewayData: {
          atReception,
          balanceBefore: booking.customer.balance,
          balanceDepositBefore: booking.customer.balanceDeposit
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

      const extraPayment = new PaymentModel({
        scene: booking.type,
        customer: booking.customer,
        store: booking.store?.id,
        amount: DEBUG ? extraPayAmount / 1e4 : extraPayAmount,
        title,
        attach,
        booking: booking.id,
        gateway: paymentGateway,
        gatewayData: {
          atReception
        }
      });

      await extraPayment.save();
      booking.payments.push(extraPayment);

      if (paymentGateway !== PaymentGateway.WechatPay) {
        await booking.paymentSuccess(atReception);
      }
    }
    if (amountInPoints && paymentGateway === PaymentGateway.Points) {
      const pointsPayment = new PaymentModel({
        scene: booking.type,
        customer: booking.customer,
        store: booking.store,
        amount: 0,
        amountInPoints,
        title,
        attach,
        booking: booking.id,
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
    if (paymentGateway === PaymentGateway.Points && !amountInPoints) {
      throw new Error("points_gateway_not_supported");
    }

    // we have to save all payments before booking saved, otherwise mongoose remove unsaved ref keys
    // await Promise.all(booking.payments.map(p => p.save()));
    // we give up save all payments at the same time. It saves no time but cause a user parallel saving problem
  }

  async paymentSuccess(this: DocumentType<Booking>, atReception = false) {
    // conditional change booking status
    if (this.type === Scene.FOOD) {
      this.status = BookingStatus.FINISHED;
    } else if ([Scene.GIFT, Scene.EVENT].includes(this.type)) {
      this.status = atReception ? BookingStatus.FINISHED : BookingStatus.BOOKED;
    } else if (this.date === moment().format("YYYY-MM-DD") && atReception) {
      await this.checkIn(false);
    } else {
      this.status = BookingStatus.BOOKED;
    }

    console.log(`[BOK] Payment success: ${this.id}, status is ${this.status}.`);

    if (this.type === Scene.EVENT) {
      if (!this.populated("event")) {
        await this.populate({
          path: "event",
          select: "-content"
        }).execPopulate();
      }
      if (!this.event || !this.kidsCount) {
        throw new Error("invalid_event");
      }
      if (this.event.kidsCountMax && this.event.kidsCountLeft) {
        this.event.kidsCountLeft -= this.kidsCount;
        console.log(
          `[BOK] Event ${this.event.id} kids left ${this.event.kidsCountLeft}, ${this.kidsCount} occupied by booking ${this.id}.`
        );
        await this.event.save();
      }
    } else if (this.type === Scene.GIFT) {
      if (!this.populated("gift")) {
        await this.populate("gift").execPopulate();
      }
      if (!this.gift || !this.quantity) {
        throw new Error("invalid_gift");
      }
      if (this.gift.quantity) {
        this.gift.quantity -= this.quantity;
        console.log(
          `[BOK] Gift ${this.gift.id} quantity left ${this.gift.quantity}, ${this.quantity} occupied by booking ${this.id}.`
        );
        await this.gift.save();
      }
    }

    if (!this.populated("customer")) {
      await this.populate("customer").execPopulate();
    }

    if (this.gift && this.gift.tagCustomer && this.customer) {
      if (!this.customer.tags.includes(this.gift.tagCustomer)) {
        this.customer.tags.push(this.gift.tagCustomer);
        await this.customer.save();
      }
    }

    const amountPaidNoCoupon = this.payments.reduce((amount, p) => {
      if (p.paid && p.gateway !== PaymentGateway.Coupon) {
        amount += p.amount;
      }
      return amount;
    }, 0);

    await this.customer?.addPoints(amountPaidNoCoupon);

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
      const refundPayment = new PaymentModel({
        scene: p.scene,
        customer: p.customer,
        store: booking.store,
        amount: -p.amount,
        amountDeposit: p.amountDeposit ? -p.amountDeposit : undefined,
        amountForceDeposit: p.amountForceDeposit
          ? -p.amountForceDeposit
          : undefined,
        title: `退款：${p.title}`,
        booking: p.booking,
        gateway: p.gateway,
        card: p.card,
        times: p.times ? -p.times : undefined,
        gatewayData: p.gatewayData,
        original: p.id
      });
      await refundPayment.save();
      booking.payments.push(refundPayment);
    }

    for (const payment of pointsPayments) {
      const p = payment;
      const refundPayment = new PaymentModel({
        scene: p.scene,
        customer: p.customer,
        store: booking.store,
        amount: 0,
        amountInPoints: p.amountInPoints && -p.amountInPoints,
        title: `积分退还：${p.title}`,
        booking: p.booking,
        gateway: p.gateway,
        gatewayData: p.gatewayData,
        original: p.id
      });
      await refundPayment.save();
      booking.payments.push(refundPayment);
    }

    await Promise.all(
      extraPayments.map(async (p: DocumentType<Payment>) => {
        const refundPayment = new PaymentModel({
          scene: p.scene,
          customer: p.customer,
          store: booking.store,
          amount: -p.amount,
          title: `退款：${p.title}`,
          booking: p.booking,
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
    if (this.type === Scene.EVENT) {
      if (!this.populated("event")) {
        await this.populate({
          path: "event",
          select: "-content"
        }).execPopulate();
      }
      if (!this.event || !this.kidsCount) {
        throw new Error("invalid_event");
      }
      if (this.event.kidsCountMax && this.event.kidsCountLeft) {
        this.event.kidsCountLeft += this.kidsCount;
        await this.event.save();
      }
    } else if (this.type === Scene.GIFT) {
      if (!this.populated("gift")) {
        await this.populate("gift").execPopulate();
      }
      if (!this.gift || !this.quantity) {
        throw new Error("invalid_gift");
      }
      if (this.gift.quantity) {
        this.gift.quantity += this.quantity;
        await this.gift.save();
      }
    }
    // send user notification
  }

  async setAmountPaid(
    this: DocumentType<Booking>,
    forcePopulatePayments = false
  ): Promise<void> {
    if (!this.populated("payments") || forcePopulatePayments) {
      await this.populate({
        path: "payments",
        options: { sort: { _id: -1 } },
        select: "-customer"
      }).execPopulate();
    }
    const paymentsAmounts = this.payments.reduce(
      (total, payment) => {
        if (payment.paid) {
          total.amountPaid += payment.amount;
          if (payment.gateway === PaymentGateway.Card) {
            total.amountPaidInCard += payment.amount;
          }
          if (payment.gateway === PaymentGateway.Balance) {
            total.amountPaidInDeposit += payment.amountDeposit || 0;
            total.amountPaidInBalance += payment.amount;
          }
          if (payment.amountInPoints) {
            total.amountPaidInPoints += payment.amountInPoints;
          }
        }
        return total;
      },
      {
        amountPaid: 0,
        amountPaidInBalance: 0,
        amountPaidInDeposit: 0,
        amountPaidInCard: 0,
        amountPaidInPoints: 0
      }
    ) as Amounts;

    ([
      "amountPaid",
      "amountPaidInDeposit",
      "amountPaidInBalance",
      "amountPaidInCard",
      "amountPaidInPoints"
    ] as Array<keyof Amounts>).forEach(amountField => {
      if (paymentsAmounts[amountField]) {
        this[amountField] = paymentsAmounts[amountField];
      } else {
        this[amountField] = undefined;
      }
    });
  }

  async checkIn(this: DocumentType<Booking>, save = true) {
    this.status = BookingStatus.IN_SERVICE;
    this.checkInAt = moment().format("HH:mm:ss");
    if (save) {
      await this.save();
    }

    console.log(`[BOK] Booking ${this.id} checked in.`);

    if (this.card && !this.populated("card")) {
      await this.populate("card").execPopulate();
    }

    if (this.coupon && !this.populated("coupon")) {
      await this.populate("coupon").execPopulate();
    }

    const rewardCardTypesString =
      this.coupon?.rewardCardTypes ||
      (this.card?.type !== "balance" && this.card?.rewardCardTypes);

    if (rewardCardTypesString && this.kidsCount && this.customer) {
      const rewardCardTypes = await CardTypeModel.find({
        slug: { $in: rewardCardTypesString.split(" ") }
      });

      let n = 1;

      if (this.coupon) {
        n = this.kidsCount / this.coupon.kidsCount;
      }

      if (this.card && this.card.cardsRewarded) {
        n = 0;
      }

      for (let i = 0; i < n; i++) {
        for (const cardType of rewardCardTypes) {
          const card = cardType.issue(this.customer);

          card.paymentSuccess();
          card.rewardedFromBooking = this;

          await card.save();
          console.log(
            `[CRD] Rewarded card ${card.slug} to customer ${this.customer.id}.`
          );
        }
      }

      if (this.card && !this.card.cardsRewarded) {
        this.card.cardsRewarded = true;
        await this.card.save();
      }
    }

    if (this.card?.type === "times" && this.customer && this.store) {
      sendTemplateMessage(this.customer, TemplateMessageType.WRITEOFF, [
        "您的次卡已成功核销",
        this.customer.name || "",
        `${this.store.name} ${this.adultsCount}大${this.kidsCount}小`,
        `${this.kidsCount}`,
        `${this.date} ${this.checkInAt}`,
        `卡内剩余次数：${this.card.timesLeft}`
      ]);
    }
  }

  async cancel(this: DocumentType<Booking>, save = true) {
    if (this.status === BookingStatus.CANCELED) {
      return;
    }

    if (this.payments.filter(p => p.paid).length) {
      console.log(`[BOK] Refund booking ${this._id}.`);
      // we don't directly change status to canceled, will auto change on refund fullfil
      this.status = BookingStatus.PENDING_REFUND;
      await this.createRefundPayment();
      if (!this.payments.filter(p => p.amount < 0).some(p => !p.paid)) {
        this.refundSuccess();
      }
    } else {
      this.refundSuccess();
    }

    console.log(`[BOK] Cancel booking ${this._id}.`);

    if (save) {
      await this.save();
    }

    if (
      this.type === Scene.PLAY &&
      this.store &&
      this.customer &&
      !this.payments.some(p => p.gateway === PaymentGateway.Coupon)
    ) {
      sendTemplateMessage(this.customer, TemplateMessageType.CANCEL, [
        "您的预约已被取消",
        `${this.store.name} ${this.adultsCount}大${this.kidsCount}小`,
        `${this.date}`,
        "管理员审批",
        "您的微信支付、次卡、余额将自动原路退回；如有疑问，请联系门店"
      ]);
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

  async checkStoreLimit(
    this: DocumentType<Booking>,
    group: "common" | "coupon" = "common"
  ) {
    if (!this.store || !this.store.dailyLimit || !this.kidsCount) return;
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
      const bookings = await BookingModel.find({
        type: Scene.PLAY,
        store: this.store,
        date: this.date,
        status: { $in: paidBookingStatus },
        coupon: { $exists: true }
      });
      const kidsCount = bookings.reduce(
        (count, booking) => count + (booking.kidsCount || 0),
        0
      );
      if (kidsCount + this.kidsCount > limit) {
        throw new Error("store_limit_exceeded");
      }
    }
  }
}

const BookingModel = getModelForClass(Booking, {
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

export default BookingModel;
