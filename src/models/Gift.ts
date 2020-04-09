import {
  prop,
  getModelForClass,
  plugin,
  Ref,
  DocumentType
} from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";
import autoPopulate from "./plugins/autoPopulate";
import { Store } from "./Store";

@plugin(updateTimes)
@plugin(autoPopulate, [{ path: "store", select: "-content" }])
export class Gift {
  @prop({ required: true })
  title: string;

  @prop({ default: "" })
  content: string;

  @prop({ required: true })
  posterUrl: string;

  @prop({ default: 0 })
  quantity: number;

  @prop({ required: true })
  priceInPoints: number;

  @prop()
  price?: number;

  @prop({ ref: "Store", required: true })
  store: DocumentType<Store>;
}

const giftModel = getModelForClass(Gift, {
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

export default giftModel;
