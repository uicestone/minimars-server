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

@pre("validate", function(next) {
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
  content?: string;

  @prop()
  tags: string[];

  @prop({ required: true })
  posterUrl: string;

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

  @prop({ type: Date, required: true })
  date: Date;

  @prop({ ref: "Store", required: true })
  store: DocumentType<Store>;
}

const eventModel = getModelForClass(Event, {
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

export default eventModel;
