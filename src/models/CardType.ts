import {
  prop,
  getModelForClass,
  plugin,
  DocumentType,
  pre
} from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";
import { Store } from "./Store";
import { User } from "./User";
import CardModel from "./Card";
import autoPopulate from "./plugins/autoPopulate";
import HttpError from "../utils/HttpError";
import moment from "moment";

@plugin(updateTimes)
@plugin(autoPopulate, [{ path: "stores", select: "name code" }])
@pre("validate", async function (this: DocumentType<CardType>, next) {
  if (this.customerTags) {
    this.customerTags = this.customerTags.map(t => t.toLowerCase());
  }
  if (this.rewardCardTypes) {
    for (const slug of this.rewardCardTypes.split(" ")) {
      const card = await CardTypeModel.findOne({ slug });
      if (!card) {
        throw new HttpError(400, `不存在这个卡券种类：${slug}`);
      }
      if (card.rewardCardTypes) {
        throw new HttpError(400, `赠送的卡券种类不能再赠卡：${slug}`);
      }
    }
  }
  next();
})
export class CardType {
  @prop({ required: true })
  title: string;

  @prop({ required: true, unique: true })
  slug: string;

  @prop()
  couponSlug?: string;

  @prop({
    enum: ["times", "period", "balance", "coupon", "partner"],
    required: true
  })
  type: "times" | "period" | "balance" | "coupon" | "partner";

  @prop({ default: false })
  isGift: boolean;

  @prop({ ref: "Store", required: true })
  stores: DocumentType<Store>[];

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

  @prop()
  dayType?: "onDaysOnly" | "offDaysOnly";

  @prop({ type: Number })
  expiresInDays: number;

  @prop({ type: Number })
  balance: number;

  @prop({ type: Number, required: true })
  price: number;

  @prop({ type: Number })
  maxKids: number;

  @prop({ type: Number, default: 1 })
  minKids = 1;

  @prop({ type: Number, default: 2 })
  freeParentsPerKid: number;

  @prop({ type: Boolean, default: false })
  openForClient: boolean;

  @prop({ type: Boolean, default: false })
  openForReception: boolean;

  @prop({ type: String })
  customerTags: string[];

  @prop({ type: Number })
  maxPerCustomer?: number;

  @prop({ type: Number })
  overPrice?: number;

  @prop({ type: Number })
  discountPrice?: number;

  @prop({ type: Number })
  discountRate?: number;

  @prop({ type: Number })
  fixedPrice?: number;

  @prop({ type: Number })
  quantity?: number;

  @prop()
  partnerUrl?: string;

  @prop()
  rewardCardTypes?: string;

  issue(this: DocumentType<CardType>, customer: DocumentType<User>) {
    const card = new CardModel({
      customer: customer.id
    });

    if (this.stores) {
      card.stores = this.stores.map(s => s.id);
    }

    Object.keys(this.toObject())
      .filter(
        key => !["_id", "__v", "createdAt", "updatedAt", "store"].includes(key)
      )
      .forEach(key => {
        card.set(key, this[key]);
      });

    if (this.times) {
      card.timesLeft = this.times;
    }

    if (this.end) {
      card.expiresAt = moment(this.end).endOf("day").toDate();
    } else if (this.expiresInDays !== undefined) {
      card.expiresAt = moment(card.start || undefined)
        .add(this.expiresInDays, "days")
        .endOf("day")
        .toDate();
    }

    return card;
  }
}

const CardTypeModel = getModelForClass(CardType, {
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

export default CardTypeModel;
