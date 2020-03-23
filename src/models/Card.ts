import mongoose, { Schema } from "mongoose";
import updateTimes from "./plugins/updateTimes";
import { IUser } from "./User";
import { IStore } from "./Store";
import Payment, { IPayment, Gateways } from "./Payment";

const { DEBUG } = process.env;

export enum CardStatuses {
  PENDING = "pending", // pending payment for the card
  VALID = "valid", // paid gift card before activated
  ACTIVATED = "activated", // paid non-gift card / activated gift card
  EXPIRED = "expired" // expired period, times empty, credit deposit to user
}

const Card = new Schema({
  customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
  timesLeft: { type: Number },
  num: { type: String },
  status: {
    type: String,
    enum: Object.values(CardStatuses),
    default: CardStatuses.PENDING
  },
  payments: [{ type: Schema.Types.ObjectId, ref: "Payment" }],
  title: { type: String, required: true },
  slug: { type: String, required: true },
  type: { type: String, enum: ["times", "period", "balance"], required: true },
  isGift: { type: Boolean, default: false },
  store: { type: Schema.Types.ObjectId, ref: "Store" },
  content: { type: String },
  times: { type: Number },
  start: { type: Date },
  end: { type: Date },
  balance: { type: Number },
  price: { type: Number, required: true },
  maxKids: { type: Number, required: true },
  freeParentsPerKid: { type: Number, required: true }
});

Card.plugin(updateTimes);

Card.set("toJSON", {
  getters: true,
  transform: function(doc, ret, options) {
    delete ret._id;
    delete ret.__v;
  }
});

Card.methods.createPayment = async function(
  { paymentGateway, adminAddWithoutPayment = false } = {
    paymentGateway: Gateways
  }
) {
  const card = this as ICard;

  let totalPayAmount = card.price;

  let attach = `card ${card.id}`;

  const title = `${card.title}`;

  if (adminAddWithoutPayment) {
    card.status = card.isGift ? CardStatuses.VALID : CardStatuses.ACTIVATED;
  } else {
    const payment = new Payment({
      customer: card.customer,
      amount: DEBUG ? totalPayAmount / 1e4 : totalPayAmount,
      title,
      attach,
      gateway: paymentGateway
    });
    console.log(`[PAY] Card payment: `, JSON.stringify(payment));

    try {
      await payment.save();
    } catch (err) {
      throw err;
    }

    card.payments.push(payment);
  }
};

Card.methods.paymentSuccess = async function() {
  const card = this as ICard;
  card.status = card.isGift ? CardStatuses.VALID : CardStatuses.ACTIVATED;
  await card.save();
  // send user notification
};

export interface ICard extends mongoose.Document {
  customer: IUser;
  timesLeft: number;
  num?: string;
  status: CardStatuses;
  payments?: IPayment[];
  title: string;
  slug: string;
  type: string;
  isGift: boolean;
  store?: IStore;
  content: string;
  times: number;
  start: Date;
  end: Date;
  balance: number;
  price: number;
  maxKids: number;
  freeParentsPerKid: number;
  createPayment: (
    Object: {
      paymentGateway?: Gateways;
      adminAddWithoutPayment?: boolean;
    },
    amount?: number
  ) => Promise<ICard>;
  paymentSuccess: () => Promise<ICard>;
}

export default mongoose.model<ICard>("Card", Card);
