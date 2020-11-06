import {
  prop,
  getModelForClass,
  plugin,
  DocumentType,
  pre
} from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";
import { Store } from "./Store";
import autoPopulate from "./plugins/autoPopulate";

@plugin(updateTimes)
@plugin(autoPopulate, [{ path: "stores", select: "-content" }])
@pre("validate", function (this: DocumentType<CardType>, next) {
  if (this.customerTags) {
    this.customerTags = this.customerTags.map(t => t.toLowerCase());
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

  @prop({ enum: ["times", "period", "balance", "coupon"], required: true })
  type: string;

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
}

const cardTypeModel = getModelForClass(CardType, {
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

export default cardTypeModel;
