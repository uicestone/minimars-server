import mongoose, { Schema } from "mongoose";
import updateTimes from "./plugins/updateTimes";
import { IStore } from "./Store";
import autoPopulate from "./plugins/autoPopulate";

const CardType = new Schema({
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

CardType.plugin(updateTimes);
CardType.plugin(autoPopulate, ["store"]);

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

export default mongoose.model<ICardType>("CardType", CardType);
