import {
  prop,
  getModelForClass,
  plugin,
  Ref,
  DocumentType,
  pre,
  modelOptions,
  Severity
} from "@typegoose/typegoose";
import { sign } from "jsonwebtoken";
import updateTimes from "./plugins/updateTimes";
import { Booking } from "./Booking";
import UserModel, { User } from "./User";
import { Store } from "./Store";
import PaymentModel, { PaymentGateway, Payment, Scene } from "./Payment";
import autoPopulate from "./plugins/autoPopulate";
import HttpError from "../utils/HttpError";

const { DEBUG } = process.env;

export enum CardStatus {
  PENDING = "pending", // pending payment for the card
  VALID = "valid", // paid gift card before activated
  ACTIVATED = "activated", // paid non-gift card / activated gift card
  EXPIRED = "expired", // expired period, times empty, credit deposit to user
  CANCELED = "canceled" // never used and will never be activated
}

export const userVisibleCardStatus = [
  CardStatus.VALID,
  CardStatus.ACTIVATED,
  CardStatus.EXPIRED
];

@plugin(updateTimes)
@plugin(autoPopulate, [
  {
    path: "payments",
    options: { sort: { _id: -1 } },
    select: "-customer"
  }
])
@pre("save", async function (this: DocumentType<Card>, next) {
  if (["times", "coupon", "period"].includes(this.type)) {
    if (
      this.status === CardStatus.ACTIVATED &&
      (this.timesLeft === 0 || (this.expiresAt && this.expiresAt < new Date()))
    ) {
      this.status = CardStatus.EXPIRED;
    } else if (
      this.status === CardStatus.EXPIRED &&
      ((this.timesLeft &&
        this.timesLeft > 0 &&
        (!this.expiresAt || this.expiresAt >= new Date())) ||
        (this.type === "period" &&
          this.expiresAt &&
          this.expiresAt >= new Date()))
    ) {
      this.status = CardStatus.ACTIVATED;
    }
  }
  if (
    this.type === "balance" &&
    this.isModified("status") &&
    this.status === CardStatus.ACTIVATED &&
    this.balance !== undefined
  ) {
    if (!this.populated("customer")) {
      await this.populate("customer").execPopulate();
    }
    const customer = this.customer as DocumentType<User>;
    await customer.depositBalance(this.balance, this.price);
    console.log(
      `[CRD] Balance card ${this.id} deposit user ${customer.id} by ${
        this.balance - this.price
      }/${this.price}`
    );
  }
  next();
})
@modelOptions({ options: { allowMixed: Severity.ALLOW } })
export class Card {
  @prop({ ref: "User", required: true, index: true })
  customer: Ref<User>;

  @prop({ type: Number })
  timesLeft?: number;

  @prop({ type: String })
  num?: string;

  @prop({ type: Number })
  quantity?: number;

  @prop({
    type: String,
    enum: Object.values(CardStatus),
    default: CardStatus.PENDING
  })
  status: CardStatus = CardStatus.PENDING;

  @prop({
    ref: "Payment",
    foreignField: "card",
    localField: "_id"
  })
  payments!: DocumentType<Payment>[];

  @prop({ type: Date })
  expiresAt?: Date;

  @prop({ type: Date })
  expiresAtWas?: Date;

  @prop({ type: String, required: true })
  title!: string;

  @prop({ type: String })
  slug?: string;

  @prop()
  couponSlug?: string;

  @prop({
    type: String,
    enum: ["times", "period", "balance", "coupon", "partner"],
    required: true
  })
  type!: "times" | "period" | "balance" | "coupon" | "partner";

  @prop({ type: Boolean, default: false })
  isGift: boolean = false;

  @prop({ ref: "Store" })
  stores!: Ref<Store>[];

  @prop()
  posterUrl?: string;

  @prop()
  content?: string;

  @prop({ type: Number })
  times?: number;

  @prop({ type: Date })
  start?: Date;

  @prop({ type: Date })
  end?: Date;

  @prop()
  dayType?: "onDaysOnly" | "offDaysOnly";

  @prop({ type: Number })
  balance?: number;

  @prop({ type: Number, required: true })
  price!: number;

  @prop({ type: Number })
  maxKids?: number;

  @prop({ type: Number, default: 0 })
  minKids = 0;

  @prop({ type: Number })
  freeParentsPerKid?: number;

  @prop({ type: Number })
  overPrice?: number;

  @prop({ type: Number })
  discountPrice?: number;

  @prop({ type: Number })
  discountRate?: number;

  @prop({ type: Number })
  fixedPrice?: number;

  @prop()
  partnerUrl?: string;

  @prop()
  rewardCardTypes?: string;

  @prop({ type: Boolean })
  cardsRewarded?: boolean;

  @prop({ ref: "Booking" })
  rewardedFromBooking?: Ref<Booking>;

  @prop({ type: Object })
  providerData?: Record<string, any>;

  get giftCode(): string | undefined {
    const card = (this as unknown) as DocumentType<Card>;
    if (!card.isGift || card.status !== CardStatus.VALID) return undefined;
    const code = sign(
      card.customer + " " + card.id,
      process.env.APP_SECRET || ""
    );
    // console.log("Hash giftCode:", card.customer, card.id, code);
    return code;
  }

  get balanceReward(): number {
    if (this.balance === undefined) return NaN;
    return +(this.balance - this.price).toFixed(2);
  }

  async createPayment(
    this: DocumentType<Card>,
    {
      paymentGateway,
      atReceptionStore = undefined
    }: {
      paymentGateway?: PaymentGateway;
      atReceptionStore?: DocumentType<Store>;
    },
    amount?: number
  ) {
    const card = this as DocumentType<Card>;
    let totalPayAmount = card.price * (card.quantity || 1);
    let attach = `card ${card.id}`;
    let title = `${card.title}`;

    if (card.quantity && card.quantity > 1) {
      title = title + "×" + card.quantity;
    }

    if (totalPayAmount < 0.01) {
      await card.paymentSuccess();
    } else {
      const scene =
        paymentGateway == PaymentGateway.Mall
          ? Scene.MALL
          : card.type === "balance"
          ? Scene.BALANCE
          : card.type === "period"
          ? Scene.PERIOD
          : Scene.CARD;
      const payment = new PaymentModel({
        scene,
        customer: card.customer,
        store: atReceptionStore?.id,
        amount:
          amount === undefined
            ? DEBUG
              ? totalPayAmount / 1e4
              : totalPayAmount
            : amount,
        title,
        attach,
        card: card.id,
        gateway: paymentGateway
      });

      if (card.times !== undefined) {
        payment.times = card.times;
      }

      await payment.save();

      if (paymentGateway !== PaymentGateway.WechatPay) {
        await card.paymentSuccess();
      }
    }
  }

  async paymentSuccess(this: DocumentType<Card>) {
    this.status = this.isGift ? CardStatus.VALID : CardStatus.ACTIVATED;
    console.log(`[CRD] Card ${this.id} payment success.`);
    // send user notification
  }

  async createRefundPayment(this: DocumentType<Card>) {
    const card = this;

    // repopulate payments with customers
    await card.populate("payments").execPopulate();

    const extraPayments = card.payments.filter(
      (p: DocumentType<Payment>) =>
        ![PaymentGateway.Balance, PaymentGateway.Card].includes(p.gateway) &&
        p.amount > 0 &&
        p.paid
    );

    await Promise.all(
      extraPayments.map(async (p: DocumentType<Payment>) => {
        const refundPayment = new PaymentModel({
          scene: p.scene,
          customer: p.customer,
          store: p.store,
          amount: -p.amount,
          title: `退款：${p.title}`,
          card: p.card,
          times: p.times ? -p.times : undefined,
          gateway: p.gateway,
          original: p.id
        });
        p.refunded = true;
        await p.save();
        await refundPayment.save();
      })
    );

    await card.populate("payments").execPopulate();

    this.refundSuccess();
  }

  async refundSuccess(this: DocumentType<Card>) {
    this.status = CardStatus.CANCELED;
    console.log(`[CRD] Refund success ${this.id}.`);
    // send user notification
  }

  async refund(this: DocumentType<Card>, save = true) {
    console.log("refund", this.type, this.status);
    if (this.status === CardStatus.CANCELED) {
      return;
    }

    if (this.payments.filter(p => p.paid).length) {
      console.log(`[CRD] Refund card ${this._id}.`);
      // we don't directly change status to canceled, will auto change on refund fullfil
      await this.createRefundPayment();
      if (!this.payments.filter(p => p.amount < 0).some(p => !p.paid)) {
        this.refundSuccess();
      }
    } else {
      this.refundSuccess();
    }

    if (this.type === "balance" && this.status === CardStatus.ACTIVATED) {
      const customer = await UserModel.findById(this.customer);
      if (
        (customer?.balanceDeposit || 0) < this.price ||
        (customer?.balanceReward || 0) < this.balanceReward
      ) {
        throw new HttpError(400, "用户余额已不足以退款本储值卡");
      }
      await customer?.depositBalance(-(this.balance || 0), -this.price);
    }

    console.log(`[CRD] Refund card ${this.id}.`);

    if (save) {
      await this.save();
    }
  }
}

const CardModel = getModelForClass(Card, {
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

export default CardModel;
