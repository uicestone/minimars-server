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

  @prop({ type: String })
  tags: string[];

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
    if (save) {
      await this.updateOne({ $inc: { points: amount * r } }).exec();
      const u = await userModel.findById(this._id);
      this.points = u.points;
    } else {
      if (!this.points) this.points = 0;
      this.points += r * amount;
    }
  }
}

const userModel = getModelForClass(User, {
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

export default userModel;
