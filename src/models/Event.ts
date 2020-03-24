import mongoose, { Schema } from "mongoose";
import updateTimes from "./plugins/updateTimes";
import { IStore } from "./Store";
import autoPopulate from "./plugins/autoPopulate";

const Event = new Schema({
  title: { type: String, required: true },
  content: { type: String },
  posterUrl: { type: String, required: true },
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

export interface IEvent extends mongoose.Document {
  title: string;
  content?: string;
  posterUrl: string;
  props?: Object;
  priceInPoints: number;
  price?: number;
  date: Date;
  store: IStore;
}

export default mongoose.model<IEvent>("Event", Event);
