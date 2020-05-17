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

  @prop({ type: Number, default: 0 })
  quantity: number;

  @prop({ type: Number })
  priceInPoints: number;

  @prop({ type: Number })
  price?: number;

  @prop({ ref: "Store" })
  store: DocumentType<Store>;

  @prop({ type: Number })
  order?: number;

  @prop({ type: Boolean, default: true })
  useBalance: boolean;

  @prop()
  tagCustomer: string; // push a tag to customer after purchased
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
