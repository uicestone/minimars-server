import {
  prop,
  getModelForClass,
  plugin,
  DocumentType
} from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";
import { Store } from "./Store";
import autoPopulate from "./plugins/autoPopulate";

@plugin(updateTimes)
@plugin(autoPopulate, ["store"])
export class CardType {
  @prop({ required: true })
  title: string;

  @prop({ required: true, unique: true })
  slug: string;

  @prop({ enum: ["times", "period", "balance"], required: true })
  type: string;

  @prop({ default: false })
  isGift: boolean;

  @prop({ ref: "Store" })
  store?: DocumentType<Store>;

  @prop()
  posterUrl: string;

  @prop()
  content: string;

  @prop()
  times: number;

  @prop({ type: Date })
  start: Date;

  @prop({ type: Date })
  end: Date;

  @prop()
  balance: number;

  @prop({ required: true })
  price: number;

  @prop({ required: true })
  maxKids: number;

  @prop({ default: 2 })
  freeParentsPerKid: number;
}

const cardTypeModel = getModelForClass(CardType, {
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

export default cardTypeModel;
