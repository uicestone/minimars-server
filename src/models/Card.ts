import {
  prop,
  arrayProp,
  getModelForClass,
  plugin,
  Ref,
  DocumentType
} from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";
import { User } from "./User";
import { Store } from "./Store";
import paymentModel, { PaymentGateway, Payment } from "./Payment";
import autoPopulate from "./plugins/autoPopulate";
import { sign } from "jsonwebtoken";

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

  @arrayProp({ ref: "Payment" })
  payments?: DocumentType<Payment>[];

  @prop({ type: Date })
  expiresAt: Date;

  @prop({ type: String, required: true })
  title: string;

  @prop({ type: String, required: true })
  slug: string;

  @prop({ type: String, enum: ["times", "period", "balance"], required: true })
  type: "times" | "period" | "balance";

  @prop({ type: Boolean, default: false })
  isGift: boolean;

  @prop({ ref: "Store" })
  store?: Ref<Store>;

  @prop()
  posterUrl: string;

  @prop({ type: String })
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

  @prop({ type: Number, required: true })
  maxKids: number;

  @prop({ type: Number, required: true })
  freeParentsPerKid: number;

  get giftCode(this: DocumentType<Card>): string | undefined {
    if (!this.isGift || this.status !== CardStatus.VALID) return undefined;
    const code = sign(this.customer + " " + this.id, process.env.APP_SECRET);
    // console.log("Hash giftCode:", this.customer, this.id, code);
    return code;
  }

  async createPayment(
    this: DocumentType<Card>,
    {
      paymentGateway,
      adminAddWithoutPayment = false
    }: {
      paymentGateway: PaymentGateway;
      adminAddWithoutPayment: boolean;
    }
  ) {
    const card = this as DocumentType<Card>;

    let totalPayAmount = card.price;

    let attach = `card ${card.id}`;

    const title = `${card.title}`;

    if (adminAddWithoutPayment) {
      card.status = card.isGift ? CardStatus.VALID : CardStatus.ACTIVATED;
    } else {
      const payment = new paymentModel({
        customer: card.customer,
        store: card.store.id,
        amount: DEBUG ? totalPayAmount / 1e4 : totalPayAmount,
        title,
        attach,
        gateway: paymentGateway
      });
      // payment is now set to true automatically
      if (paymentGateway !== PaymentGateway.WechatPay) {
        card.status = card.isGift ? CardStatus.VALID : CardStatus.ACTIVATED;
      }

      try {
        await payment.save();
        console.log(`[PAY] Card payment: `, JSON.stringify(payment));
      } catch (err) {
        throw err;
      }

      card.payments.push(payment);
    }
  }

  async paymentSuccess(this: DocumentType<Card>) {
    this.status = this.isGift ? CardStatus.VALID : CardStatus.ACTIVATED;
    await this.save();
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
