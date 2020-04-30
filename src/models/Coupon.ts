import { prop, getModelForClass, plugin, Ref } from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";
import { Store } from "./Store";

@plugin(updateTimes)
export class Coupon {
  @prop({ required: true })
  title: string;

  @prop({ ref: "Store" })
  store?: Ref<Store>;

  @prop()
  content: string;

  @prop()
  kidsCount = 1;

  @prop()
  price = 0;

  @prop()
  priceThirdParty: number;

  @prop({ default: 2 })
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
