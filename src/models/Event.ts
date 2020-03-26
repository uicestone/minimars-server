import mongoose, { Schema } from "mongoose";
import updateTimes from "./plugins/updateTimes";
import { IStore } from "./Store";
import autoPopulate from "./plugins/autoPopulate";

const Event = new Schema({
  title: { type: String, required: true },
  content: { type: String },
  posterUrl: { type: String, required: true },
  kidsCountMax: {
    type: Schema.Types.Mixed,
    default: null,
    set(v) {
      if (!v) {
        return null;
      } else return +v;
    }
  },
  kidsCountLeft: { type: Number },
  props: { type: Object },
  priceInPoints: { type: Number, required: true },
  price: { type: Number },
  date: { type: Date, required: true },
  store: { type: Schema.Types.ObjectId, ref: "Store", required: true }
});

Event.plugin(updateTimes);
Event.plugin(autoPopulate, ["store"]);

Event.set("toJSON", {
  getters: true,
  transform: function(doc, ret, options) {
    delete ret._id;
    delete ret.__v;
  }
});

Event.pre("validate", function(next) {
  const event = this as IEvent;
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
});

export interface IEvent extends mongoose.Document {
  title: string;
  content?: string;
  posterUrl: string;
  kidsCountMax: number | null;
  kidsCountLeft: number | null;
  props?: Object;
  priceInPoints: number;
  price?: number;
  date: Date;
  store: IStore;
}

export default mongoose.model<IEvent>("Event", Event);
