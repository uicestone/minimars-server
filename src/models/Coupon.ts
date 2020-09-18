import {
  prop,
  getModelForClass,
  plugin,
  Ref,
  modelOptions,
  Severity
} from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";
import { Store } from "./Store";

@plugin(updateTimes)
@modelOptions({ options: { allowMixed: Severity.ALLOW } })
export class Coupon {
  @prop({ required: true })
  title: string;

  @prop({ ref: "Store" })
  stores: Ref<Store>[];

  @prop()
  content: string;

  @prop({ type: Number })
  kidsCount = 1;

  @prop({ type: Number })
  price = 0;

  @prop({ type: Number })
  priceThirdParty: number;

  @prop({ type: Number, default: 2 })
  freeParentsPerKid: number;

  @prop()
  start?: Date;

  @prop()
  end?: Date;

  @prop()
  enabled = true;
}

const cardModel = getModelForClass(Coupon, {
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

export default cardModel;
