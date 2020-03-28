import {
  prop,
  arrayProp,
  getModelForClass,
  plugin,
  pre,
  DocumentType
} from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";
import { config } from "./Config";
import { Store } from "./Store";
import autoPopulate from "./plugins/autoPopulate";
import { Card } from "./Card";

@pre("validate", function(next) {
  const user = this as DocumentType<User>;
  ["balanceDeposit", "balanceReward"].forEach(field => {
    if (user[field]) {
      user[field] = +user[field].toFixed(2);
    }
  });
  if (user.role === "customer" && user.points === undefined) {
    user.points = 0;
  }
  next();
})
@plugin(updateTimes)
@plugin(autoPopulate, ["store"])
export class User {
  @prop({ default: "customer" })
  role: string;

  @prop({ unique: true, sparse: true })
  login?: string;

  @prop({ select: false })
  password?: string;

  @prop(String)
  name?: string;

  @prop({
    type: String,
    get: v => v,
    set: v => {
      const genderIndex = ["未知", "男", "女"];
      return genderIndex[v] || v;
    }
  })
  gender?: string;

  @prop({
    unique: true,
    sparse: true,
    // @ts-ignore
    validate: {
      validator: function(v) {
        return v.length === 11 || v.match(/^\+/);
      },
      message: (props: { value: any }) =>
        `手机号必须是11位数或“+”开头的国际号码，输入的是${JSON.stringify(
          props.value
        )}`
    }
  })
  mobile?: string;

  @prop()
  avatarUrl?: string;

  @prop()
  region?: string;

  @prop()
  country?: string;

  @prop()
  isForeigner?: boolean;

  @prop()
  birthday?: string;

  @prop()
  constellation?: string;

  @prop({ unique: true, sparse: true })
  idCardNo?: string;

  @prop()
  openid?: string;

  @prop({ ref: "Store" }) // manager only
  store?: DocumentType<Store>;

  @prop({ default: 0 }) // below for customer only
  balanceDeposit?: number;

  @prop({ default: 0 })
  balanceReward?: number;

  get balance() {
    if (this.balanceDeposit === undefined && this.balanceReward === undefined) {
      return undefined;
    }
    return +((this.balanceDeposit || 0) + (this.balanceReward || 0)).toFixed(2);
  }

  @prop()
  points?: number;

  @prop()
  freePlayFrom: Date;

  @prop()
  freePlayTo: Date;

  get freePlay() {
    const now = new Date();
    const { freePlayFrom: from, freePlayTo: to } = this;
    return from && from <= now && to && to >= now;
  }

  @prop()
  cardType?: string;

  @prop()
  cardNo?: string;

  @arrayProp({ ref: "Card" })
  cards: DocumentType<Card>[];

  depositSuccess = async function(levelName: string) {
    const user = this as DocumentType<User>;
    const level = config.depositLevels.filter(l => l.slug === levelName)[0];
    if (!level) {
      throw new Error(`Deposit level not found for slug ${levelName}.`);
    }

    user.cardType = level.cardType;

    if (level.depositBalance || level.rewardBalance) {
      if (!user.balanceDeposit) {
        user.balanceDeposit = 0;
      }
      if (!user.balanceReward) {
        user.balanceReward = 0;
      }

      console.log(
        `[USR] User ${user.id} balance was ${user.balanceDeposit}:${user.balanceReward}.`
      );

      if (level.depositBalance) {
        user.balanceDeposit += level.depositBalance;
      }

      if (level.rewardBalance) {
        user.balanceReward += level.rewardBalance;
      }

      console.log(
        `[USR] Deposit success ${user.id}, balance is now ${user.balanceDeposit}:${user.balanceReward}.`
      );
    }

    if (level.freePlayFrom && level.freePlayTo) {
      user.freePlayFrom = level.freePlayFrom;
      user.freePlayTo = level.freePlayTo;
      console.log(
        `[USR] Update free-play duration for user ${user.id}: ${user.freePlayFrom}-${user.freePlayTo}`
      );
    }

    await user.save();

    // send user notification

    return user;
  };
  membershipUpgradeSuccess: (cardTypeName: string) => Promise<User>;
}

const userModel = getModelForClass(User, {
  schemaOptions: {
    toJSON: {
      getters: true,
      transform: function(doc, ret, options) {
        delete ret._id;
        delete ret.__v;
      }
    }
  }
});

export default userModel;
