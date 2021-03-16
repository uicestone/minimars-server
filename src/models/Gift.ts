import {
  prop,
  getModelForClass,
  plugin,
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
  title!: string;

  @prop({
    required: true,
    get: v => appendResizeImageUrl(v),
    set: v => removeResizeImageUrl(v)
  })
  posterUrl!: string;

  @prop({
    get: v => appendResizeHtmlImage(v),
    set: v => removeResizeHtmlImage(v)
  })
  content?: string;

  @prop({ type: Number, default: 0 })
  quantity: number = 0;

  @prop({ type: Number })
  priceInPoints?: number;

  @prop({ type: Number })
  price?: number;

  @prop({ ref: "Store" })
  store?: DocumentType<Store>;

  @prop({ type: Number, default: 0 })
  order: number = 0;

  @prop({ type: Boolean, default: true })
  useBalance: boolean = true;

  @prop()
  tagCustomer?: string; // push a tag to customer after purchased

  @prop({ type: Number })
  maxQuantityPerCustomer?: number;

  @prop({ type: Boolean })
  isProfileCover?: boolean; // custom cover in weapp 'my' page
}

const GiftModel = getModelForClass(Gift, {
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

export default GiftModel;
