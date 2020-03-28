import { prop, getModelForClass, plugin } from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";

@plugin(updateTimes)
class ConfigDocument {
  @prop()
  desc: string;

  @prop()
  value: any;

  public static async get(key: string, defaults: any) {
    const doc = await configModel.findOne({ key });
    return doc ? doc.value : defaults;
  }
}

const configModel = getModelForClass(ConfigDocument, {
  schemaOptions: {
    strict: false,
    toJSON: {
      getters: true,
      transform: function(doc, ret, options) {
        delete ret._id;
        delete ret.__v;
      }
    }
  }
});

export default configModel;

export class Config {
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

export const config: Config = {};
