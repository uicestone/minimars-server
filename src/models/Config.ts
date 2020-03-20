import mongoose, { Schema } from "mongoose";
import updateTimes from "./plugins/updateTimes";

const configSchema = new Schema(
  {
    desc: String
  },
  { strict: false }
);

configSchema.plugin(updateTimes);

configSchema.set("toJSON", {
  getters: true,
  transform: function(doc, ret, options) {
    delete ret._id;
    delete ret.__v;
  }
});

configSchema.statics.get = async function(key, defaults) {
  const doc = await this.findOne({ key });
  return doc ? doc.value : defaults;
};

export default mongoose.model("Config", configSchema);

export interface IConfig {
  depositLevels?: {
    slug: string;
    desc: string;
    price: number;
    cardType: string;
    isGift?: boolean;
    depositBalance?: number;
    rewardBalance?: number;
    freePlayFrom?: Date;
    freePlayTo?: Date;
  }[];
  sockPrice?: number;
  extraParentFullDayPrice?: number;
  kidFullDayPrice?: number;
  freeParentsPerKid?: number;
  coupons?: {
    slug: string;
    name: string;
    validFrom: Date;
    validTill: Date;
    type: string;
    amount: number; // value of the coupon itself
    adultsCount?: number;
    kidsCount?: number;
    fixedMembersCount?: boolean;
    price?: number;
    discountAmount?: number;
    discountRate?: number;
  }[];
}

export const config: IConfig = {};
