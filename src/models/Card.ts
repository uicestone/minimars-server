import {
  prop,
  getModelForClass,
  plugin,
  Ref,
  DocumentType,
  pre
} from "@typegoose/typegoose";
import { sign } from "jsonwebtoken";
import updateTimes from "./plugins/updateTimes";
import { User } from "./User";
import { Store } from "./Store";
import paymentModel, { PaymentGateway, Payment } from "./Payment";
import autoPopulate from "./plugins/autoPopulate";

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
      ((this.timesLeft > 0 &&
        (!this.expiresAt || this.expiresAt >= new Date())) ||
        (this.type === "period" && this.expiresAt >= new Date()))
    ) {
      this.status = CardStatus.ACTIVATED;
    }
  }
  if (
    this.type === "balance" &&
    this.isModified("status") &&
    this.status === CardStatus.ACTIVATED
  ) {
    if (!this.populated("customer")) {
      await this.populate("customer").execPopulate();
    }
    const customer = this.customer as DocumentType<User>;
    customer.balanceDeposit += this.price;
    customer.balanceReward += this.balance - this.price;
    await customer.save();
    console.log(
      `[CRD] Balance card ${this.id} deposit user ${customer.id} by ${
        this.balance - this.price
      }/${this.price}`
    );
  }
  next();
})
export class Card {
  @prop({ ref: "User", required: true, index: true })
  customer: Ref<User>;

  @prop({ type: Number })
  timesLeft: number;

  @prop({ type: String })
  num?: string;

  @prop({
    type: String,
    enum: Object.values(CardStatus),
    default: CardStatus.PENDING
  })
  status: CardStatus;

  @prop({ ref: "Payment" })
  payments?: DocumentType<Payment>[];

  @prop({ type: Date })
  expiresAt: Date;

  @prop({ type: Date })
  expiresAtWas: Date;

  @prop({ type: String, required: true })
  title: string;

  @prop({ type: String, required: true })
  slug: string;

  @prop({
    type: String,
    enum: ["times", "period", "balance", "coupon"],
    required: true
  })
  type: "times" | "period" | "balance" | "coupon";

  @prop({ type: Boolean, default: false })
  isGift: boolean;

  @prop({ ref: "Store" })
  store?: Ref<Store>;

  @prop()
  posterUrl: string;

  @prop()
  content: string;

  @prop({ type: Number })
  times: number;

  @prop({ type: Date })
  start: Date;

  @prop({ type: Date })
  end: Date;

  @prop({ type: Number })
  balance: number;

  @prop({ type: Number, required: true })
  price: number;

  @prop({ type: Number })
  maxKids: number;

  @prop({ type: Number })
  freeParentsPerKid: number;

  @prop({ type: Number })
  overPrice?: number;

  @prop({ type: Number })
  discountPrice?: number;

  @prop({ type: Number })
  discountRate?: number;

  get giftCode(): string | undefined {
    const card = (this as unknown) as DocumentType<Card>;
    if (!card.isGift || card.status !== CardStatus.VALID) return undefined;
    const code = sign(card.customer + " " + card.id, process.env.APP_SECRET);
    // console.log("Hash giftCode:", card.customer, card.id, code);
    return code;
  }

  async createPayment(
    this: DocumentType<Card>,
    {
      paymentGateway,
      atReceptionStore = null
    }: {
      paymentGateway: PaymentGateway;
      atReceptionStore?: DocumentType<Store>;
    }
  ) {
    const card = this as DocumentType<Card>;
    let totalPayAmount = card.price;
    let attach = `card ${card.id}`;
    const title = `${card.title}`;

    if (totalPayAmount < 0.01) {
      await card.paymentSuccess();
    } else {
      const payment = new paymentModel({
        customer: card.customer,
        store: card.store || atReceptionStore?.id,
        amount: DEBUG ? totalPayAmount / 1e4 : totalPayAmount,
        title,
        attach,
        gateway: paymentGateway
      });

      await payment.save();

      if (paymentGateway !== PaymentGateway.WechatPay) {
        await card.paymentSuccess();
      }

      card.payments.push(payment);
    }
  }

  async paymentSuccess(this: DocumentType<Card>) {
    this.status = this.isGift ? CardStatus.VALID : CardStatus.ACTIVATED;
    // send user notification
  }
}

const cardModel = getModelForClass(Card, {
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

export default cardModel;
