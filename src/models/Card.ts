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
  type: { type: String, enum: ["times", "period", "balance"], required: true },
  store: { type: Schema.Types.ObjectId, ref: "Store" },
  content: { type: String },
  times: { type: Number },
  start: { type: Date },
  end: { type: Date },
  balance: { type: Number },
  price: { type: Number, required: true },
  maxKids: { type: Number, requried: true },
  freeParentsPerKid: { type: Number, requried: true }
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
  balance: number;
  price: number;
  maxKids: number;
  freeParentsPerKid: number;
}

export default mongoose.model<ICard>("Card", Card);
