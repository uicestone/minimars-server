import { prop, getModelForClass, plugin } from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";

export enum Permission {
  DEVELOP = "develop",
  BOSSBOARD = "bossboard",
  DASHBOARD = "dashboard",
  PLAY_BOOKING = "play booking",
  EVENT_BOOKING = "event booking",
  FOOD_BOOKING = "food booking",
  GIFT_BOOKING = "gift booking",
  PARTY_BOOKING = "party booking",
  BOOKING_ALL_STORE = "booking all store",
  BOOKING_CREATE = "booking create",
  BOOKING_CANCEL_REVIEW = "booking cancel review",
  CARD = "card",
  CARD_SELL_STORE = "card sell store",
  CARD_SELL_ALL = "card sell all",
  CARD_ISSUE_SURVEY = "card issue survey",
  CUSTOMER = "customer",
  PAYMENT = "payment",
  PAYMENT_DOWNLOAD = "payment download",
  PAYMENT_LAST_WEEK = "payment last week",
  PAYMENT_LAST_MONTH = "payment last month",
  PAYMENT_ALL_DATE = "payment all date",
  CARD_TYPE = "card-type",
  COUPON = "coupon",
  POST = "post",
  EVENT = "event",
  GIFT = "gift",
  STORE = "store",
  STAFF = "staff",
  ROLE = "role",
  CONFIG = "config"
}

export type Permissions = keyof typeof Permission;

@plugin(updateTimes)
export class Role {
  @prop({ required: true })
  name!: string;

  @prop({ type: String, enum: Object.values(Permission), default: [] })
  permissions!: Permission[];

  can(p: Permission) {
    return this.permissions.includes(p);
  }
}

const RoleModel = getModelForClass(Role, {
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

export default RoleModel;
