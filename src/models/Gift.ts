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
import {
  appendResizeImageUrl,
  appendResizeHtmlImage,
  removeResizeImageUrl,
  removeResizeHtmlImage
} from "../utils/imageResize";

@plugin(updateTimes)
@plugin(autoPopulate, [{ path: "store", select: "-content" }])
export class Gift {
  @prop({ required: true })
  title: string;

  @prop({
    required: true,
    get: v => appendResizeImageUrl(v),
    set: v => removeResizeImageUrl(v)
  })
  posterUrl: string;

  @prop({
    get: v => appendResizeHtmlImage(v),
    set: v => removeResizeHtmlImage(v)
  })
  content?: string;

  @prop({ default: 0 })
  quantity: number;

  @prop({ required: true })
  priceInPoints: number;

  @prop()
  price?: number;

  @prop({ required: true, ref: "Store" })
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
