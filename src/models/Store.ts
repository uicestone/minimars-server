import { prop, getModelForClass, plugin } from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";
import {
  appendResizeImageUrl,
  appendResizeHtmlImage,
  removeResizeImageUrl,
  removeResizeHtmlImage
} from "../utils/imageResize";

class DailyLimitDate {
  @prop()
  date: string;
  @prop()
  group: string;
  @prop({ type: Number })
  limit: number;
}

class DailyLimit {
  @prop({ type: Number })
  common: number[];
  @prop({ type: Number })
  coupon: number[];
  @prop({ type: DailyLimitDate })
  dates: DailyLimitDate[];
}

@plugin(updateTimes)
export class Store {
  @prop({ unique: true })
  name: string;

  @prop()
  address: string;

  @prop()
  phone: string;

  @prop({
    required: true,
    get: v => appendResizeImageUrl(v),
    set: v => removeResizeImageUrl(v)
  })
  posterUrl: string;

  @prop({
    get: v => appendResizeHtmlImage(v),
    set: v => removeResizeHtmlImage(v)
  })
  content?: string;

  @prop({
    default: { common: [], coupon: [], dates: [] }
  })
  dailyLimit: DailyLimit;

  @prop()
  partyRooms: number;

  @prop()
  ip: string;
}

const storeModel = getModelForClass(Store, {
  schemaOptions: {
    toJSON: {
      getters: true,
      transform: function (doc, ret, options) {
        delete ret._id;
        delete ret.__v;
      }
    }
  }
});

export default storeModel;
