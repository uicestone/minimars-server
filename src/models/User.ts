import mongoose, { Schema } from "mongoose";
import updateTimes from "./plugins/updateTimes";
import { config } from "./Config";
import Store, { IStore } from "./Store";

const User = new Schema({
  role: { type: String, default: "customer" },
  login: { type: String, index: { unique: true, sparse: true } },
  password: { type: String, select: false },
  name: String,
  gender: {
    type: String,
    set: v => {
      const genderIndex = ["未知", "男", "女"];
      return genderIndex[v] || v;
    }
  },
  mobile: {
    type: String,
    index: { unique: true, sparse: true },
    validate: {
      validator: function(v) {
        return v.length === 11 || v.match(/^\+/);
      },
      // @ts-ignore
      message: props =>
        `手机号必须是11位数或“+”开头的国际号码，输入的是${JSON.stringify(
          props.value
        )}`
    }
  },
  avatarUrl: String,
  region: String,
  country: String,
  isForeigner: Boolean,
  birthday: String,
  constellation: String,
  idCardNo: String,
  openid: { type: String, index: { unique: true, sparse: true } },
  store: { type: Schema.Types.ObjectId, ref: Store }, // manager only
  creditDeposit: Number, // below for customer only
  creditReward: Number,
  freePlayFrom: Date,
  freePlayTo: Date,
  cardType: { type: String },
  cardNo: { type: String }
});

// User.virtual("avatarUrl").get(function(req) {
//   if (!this.avatarUri) return null;
//   return (process.env.CDN_URL || req.baseUrl )+ this.avatarUri;
// });

User.virtual("credit").get(function() {
  const user = this as IUser;
  if (user.creditDeposit === undefined && user.creditReward === undefined) {
    return undefined;
  }
  return +((user.creditDeposit || 0) + (user.creditReward || 0)).toFixed(2);
});

User.virtual("freePlay").get(function() {
  const user = this as IUser;
  const now = new Date();
  const { freePlayFrom: from, freePlayTo: to } = user;
  return from && from <= now && to && to >= now;
});

User.plugin(updateTimes);

User.pre("validate", function(next) {
  const user = this as IUser;
  ["creditDeposit", "creditReward"].forEach(field => {
    if (user[field]) {
      user[field] = +user[field].toFixed(2);
    }
  });
  next();
});

User.set("toJSON", {
  getters: true,
  transform: function(doc, ret, options) {
    delete ret._id;
    delete ret.__v;
  }
});

User.methods.depositSuccess = async function(levelName: string) {
  const user = this as IUser;
  const level = config.depositLevels.filter(l => l.slug === levelName)[0];
  if (!level) {
    throw new Error(`Deposit level not found for slug ${levelName}.`);
  }

  user.cardType = level.cardType;

  if (level.depositCredit || level.rewardCredit) {
    if (!user.creditDeposit) {
      user.creditDeposit = 0;
    }
    if (!user.creditReward) {
      user.creditReward = 0;
    }

    console.log(
      `[USR] User ${user.id} credit was ${user.creditDeposit}:${user.creditReward}.`
    );

    if (level.depositCredit) {
      user.creditDeposit += level.depositCredit;
    }

    if (level.rewardCredit) {
      user.creditReward += level.rewardCredit;
    }

    console.log(
      `[USR] Deposit success ${user.id}, credit is now ${user.creditDeposit}:${user.creditReward}.`
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

export interface IUser extends mongoose.Document {
  role: string;
  login?: string;
  password?: string;
  name?: string;
  gender?: string;
  mobile?: string;
  avatarUrl?: string;
  region?: string;
  country?: string;
  isForeigner?: boolean;
  birthday?: string;
  constellation?: string;
  idCardNo?: string;
  openid?: string;
  store?: IStore;
  creditDeposit?: number;
  creditReward?: number;
  credit?: number;
  freePlayFrom: Date;
  freePlayTo: Date;
  freePlay: boolean;
  cardType?: string;
  cardNo?: string;
  depositSuccess: (level: string) => Promise<IUser>;
  membershipUpgradeSuccess: (cardTypeName: string) => Promise<IUser>;
}

export default mongoose.model<IUser>("User", User);
