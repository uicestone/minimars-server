import {
  prop,
  getModelForClass,
  plugin,
  pre,
  DocumentType
} from "@typegoose/typegoose";
import { Schema } from "mongoose";
import updateTimes from "./plugins/updateTimes";
import { Store } from "./Store";
import autoPopulate from "./plugins/autoPopulate";
import {
  appendResizeHtmlImage,
  appendResizeImageUrl,
  removeResizeImageUrl,
  removeResizeHtmlImage
} from "../utils/imageResize";

@pre("validate", function (next) {
  const event = this as DocumentType<Event>;
  if (
    event.kidsCountMax !== null &&
    (event.kidsCountLeft === null || event.kidsCountLeft === undefined)
  ) {
    event.kidsCountLeft = event.kidsCountMax;
  }
  if (event.kidsCountLeft !== null && event.kidsCountMax === null) {
    event.kidsCountLeft = null;
  }
  next();
})
@plugin(updateTimes)
@plugin(autoPopulate, [{ path: "store", select: "-content" }])
export class Event {
  @prop({ required: true })
  title: string;

  @prop()
  tags: string[];

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

  @prop({
    type: Schema.Types.Mixed,
    default: null,
    get: v => v,
    set(v) {
      if (!v) {
        return null;
      } else return +v;
    }
  })
  kidsCountMax: number | null;

  @prop()
  kidsCountLeft: number | null;

  @prop({ type: Object })
  props?: Object;

  @prop({ required: true })
  priceInPoints: number;

  @prop()
  price?: number;

  @prop({ type: Date })
  date?: Date;

  @prop({ ref: "Store" })
  store?: DocumentType<Store>;

  @prop({ type: Number, default: 0 })
  order: number;

  @prop({ type: String })
  kidAgeRange: string;
}

const eventModel = getModelForClass(Event, {
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

export default eventModel;
