import mongoose, { Schema } from "mongoose";
import updateTimes from "./plugins/updateTimes";

const CardType = new Schema({
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

CardType.plugin(updateTimes);

CardType.set("toJSON", {
  getters: true,
  transform: function(doc, ret, options) {
    delete ret._id;
    delete ret.__v;
  }
});

export interface ICardType extends mongoose.Document {
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

export default mongoose.model<ICardType>("CardType", CardType);
