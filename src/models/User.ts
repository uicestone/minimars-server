import {
  prop,
  getModelForClass,
  plugin,
  pre,
  DocumentType,
  index
} from "@typegoose/typegoose";
import moment from "moment";
import updateTimes from "./plugins/updateTimes";
import { Store } from "./Store";
import autoPopulate from "./plugins/autoPopulate";
import Pospal from "../utils/pospal";

@pre("validate", function (next) {
  const user = this as DocumentType<User>;
  ["balanceDeposit", "balanceReward"].forEach(field => {
    if (user[field]) {
      user[field] = +user[field].toFixed(2);
    }
  });
  if (user.role === "customer" && user.points === undefined) {
    user.points = 0;
  }
  if (user.tags) {
    user.tags = user.tags.map(t => t.toLowerCase());
  }
  next();
})
@plugin(updateTimes)
@plugin(autoPopulate, [{ path: "store", select: "-content" }])
@index({ name: "text", mobile: "text", cardNo: "text", tags: "text" })
export class User {
  @prop({ default: "customer" })
  role: string;

  @prop({ unique: true, sparse: true })
  login?: string;

  @prop({ select: false })
  password?: string;

  @prop({ type: String })
  name?: string;

  @prop({ type: String })
  childName?: string;

  @prop({ type: String })
  childBirthday?: string;

  @prop()
  childPhotoUrl?: string;

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
      validator: function (v) {
        return (
          v.length === 11 || v.match(/^\+/) || process.env.SUPPRESS_VALIDATOR
        );
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

  @prop({ index: true })
  idCardNo?: string;

  @prop()
  openid?: string;

  @prop()
  openidMp?: string;

  @prop()
  unionid?: string;

  @prop()
  pospalId?: string;

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

  @prop({ type: String, default: [] })
  tags: string[] = [];

  @prop()
  points?: number;

  @prop()
  cardType?: string;

  @prop({ index: true })
  cardNo?: string;

  @prop({
    remarks: String,
    set: (v: string) => {
      if (!v) return v;
      const lines = v.split("\n");
      return lines
        .map(line => {
          if (line && !line.match(/^\d{4}-\d{2}-\d{2}: /)) {
            line = moment().format("YYYY-MM-DD") + ": " + line;
          }
          return line;
        })
        .join("\n");
    },
    get: v => v
  })
  remarks?: string;

  async addPoints(this: DocumentType<User>, amount: number, save = true) {
    const r = 1;
    amount = +amount.toFixed(2);
    if (save) {
      await this.updateOne({ $inc: { points: amount * r } }).exec();
      const u = await UserModel.findById(this._id);
      this.points = u.points;
    } else {
      if (!this.points) this.points = 0;
      this.points = +(this.points + r * amount).toFixed(2);
    }
  }

  async depositBalance(
    this: DocumentType<User>,
    balance: number,
    amountDeposit: number,
    save = true
  ) {
    const balanceDepositWas = this.balanceDeposit,
      balanceRewardWas = this.balanceReward;

    this.balanceDeposit = +(this.balanceDeposit + amountDeposit).toFixed(2);
    this.balanceReward = +(
      this.balanceReward +
      balance -
      amountDeposit
    ).toFixed(2);

    if (save) {
      await this.save();
    }

    await new Pospal().addMember(this);

    console.log(
      `[USR] Deposit balance of ${this.id} to ${this.balanceDeposit}:${this.balanceReward}, was ${balanceDepositWas}:${balanceRewardWas}`
    );
  }

  async writeOffBalance(
    this: DocumentType<User>,
    amount: number,
    amountForceDeposit = 0,
    amountDeposit?: number,
    save = true,
    syncToPospal = true
  ) {
    if (this.balance < amount) {
      throw new Error("insufficient_balance");
    }

    const balanceDepositWas = this.balanceDeposit,
      balanceRewardWas = this.balanceReward;

    const depositPaymentAmount =
      amountDeposit ||
      Math.max(
        +(
          amountForceDeposit +
          ((amount - amountForceDeposit) * this.balanceDeposit) / this.balance
        ).toFixed(2),
        0.01
      );

    const rewardPaymentAmount = +(amount - depositPaymentAmount).toFixed(2);
    this.balanceDeposit -= depositPaymentAmount;
    this.balanceReward -= rewardPaymentAmount;

    if (save) {
      await this.save();
    }

    if (syncToPospal) {
      await new Pospal().addMember(this);
    }

    console.log(
      `[USR] Write off balance of ${this.id} to ${this.balanceDeposit}:${this.balanceReward}, was ${balanceDepositWas}:${balanceRewardWas}`
    );

    return {
      depositPaymentAmount,
      rewardPaymentAmount
    };
  }
}

const UserModel = getModelForClass(User, {
  schemaOptions: {
    strict: false,
    toJSON: {
      getters: true,
      transform: function (doc, ret, options) {
        delete ret._id;
        delete ret.__v;
      }
    }
  }
});

export default UserModel;
