import mongoose, { Schema } from "mongoose";
import updateTimes from "./plugins/updateTimes";
import { IUser } from "./User";
import { IStore } from "./Store";

const Card = new Schema({
  customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
  timesLeft: { type: Number },
  bound: { type: Boolean },
  num: { type: String },
  title: { type: String, required: true },
  type: { type: String, enum: ["times", "period", "credit"], required: true },
  store: { type: Schema.Types.ObjectId, ref: "Store" },
  content: { type: String },
  times: { type: Number },
  start: { type: Date },
  end: { type: Date },
  credit: { type: Number },
  price: { type: Number, required: true }
});

Card.plugin(updateTimes);

Card.set("toJSON", {
  getters: true,
  transform: function(doc, ret, options) {
    delete ret._id;
    delete ret.__v;
  }
});

export interface ICard extends mongoose.Document {
  customer: IUser;
  timesLeft: number;
  bound: boolean;
  num?: string;
  title: string;
  type: string;
  store?: IStore;
  content: string;
  times: number;
  start: Date;
  end: Date;
  credit: number;
  price: number;
}

export default mongoose.model<ICard>("Card", Card);
