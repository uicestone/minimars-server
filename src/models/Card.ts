import mongoose, { Schema } from "mongoose";
import updateTimes from "./plugins/updateTimes";
import { IUser } from "./User";

const Card = new Schema({
  customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
  timesLeft: { type: Number },
  bound: { type: Boolean },
  title: { type: String, required: true },
  type: { type: String, enum: ["times", "period", "credit"], required: true },
  num: { type: String },
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
  title: string;
  type: string;
  num?: string;
  content: string;
  times: number;
  start: Date;
  end: Date;
  credit: number;
  price: number;
}

export default mongoose.model<ICard>("Card", Card);
