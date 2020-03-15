import mongoose, { Schema } from "mongoose";
import updateTimes from "./plugins/updateTimes";

const Gift = new Schema({
  title: { type: String, required: true },
  content: { type: String, default: "" },
  posterUrl: { type: String, required: true },
  quantity: { type: Number, default: 0 },
  priceInCredit: { type: Number, required: true },
  priceInCny: { type: Number }
});

Gift.plugin(updateTimes);

Gift.set("toJSON", {
  getters: true,
  transform: function(doc, ret, options) {
    delete ret._id;
    delete ret.__v;
  }
});

export interface IGift extends mongoose.Document {
  title: string;
  content: string;
  posterUrl: string;
  quantity: number;
  priceInCredit: number;
  priceInCny?: number;
}

export default mongoose.model<IGift>("Gift", Gift);
