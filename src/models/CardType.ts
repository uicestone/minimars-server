import {
  prop,
  getModelForClass,
  plugin,
  DocumentType,
  pre
} from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";
import { Store } from "./Store";
import { User } from "./User";
import CardModel, { BalanceGroup } from "./Card";
import autoPopulate from "./plugins/autoPopulate";
import HttpError from "../utils/HttpError";
import moment from "moment";
import { Scene } from "./Payment";

class BalancePriceGroup {
  @prop({ type: Number, required: true })
  balance!: number;

  @prop({ type: Number, required: true })
  price!: number;
}

@plugin(updateTimes)
@plugin(autoPopulate, [{ path: "stores", select: "name code" }])
@pre("validate", async function (this: DocumentType<CardType>, next) {
  if (this.customerTags) {
    this.customerTags = this.customerTags.map(t => t.toLowerCase());
  }
  if (this.type === "balance") {
    if (this.balance === undefined || this.price === undefined)
      throw new HttpError(400, "面值，价格必填");
    if (this.balancePriceGroups) {
      this.balancePriceGroups = this.balancePriceGroups.filter(
        g => g.price !== undefined && g.balance !== undefined
      );
    }
  }
  if (this.rewardCardTypes) {
    for (const slug of this.rewardCardTypes.split(" ")) {
      const card = await CardTypeModel.findOne({ slug });
      if (!card) {
        throw new HttpError(400, `不存在这个卡券种类：${slug}`);
      }
      if (card.rewardCardTypes) {
        throw new HttpError(400, `赠送的卡券种类不能再赠卡：${slug}`);
      }
    }
  }
  next();
})
export class CardType {
  @prop({ required: true })
  title!: string;

  @prop({ required: true, unique: true })
  slug!: string;

  @prop()
  couponSlug?: string;

  @prop({
    enum: ["times", "period", "balance", "coupon", "partner"],
    required: true
  })
  type!: "times" | "period" | "balance" | "coupon" | "partner";

  @prop({ default: false })
  isGift: boolean = false;

  @prop({ ref: "Store" })
  stores!: DocumentType<Store>[];

  @prop()
  posterUrl?: string;

  @prop({ type: String, default: [] })
  posterUrls: string[] = [];

  @prop()
  content?: string;

  @prop({ type: Number })
  times?: number;

  @prop({ type: Date })
  start?: Date;

  @prop({ type: Date })
  end?: Date;

  @prop()
  dayType?: "onDaysOnly" | "offDaysOnly";

  @prop({ type: Number })
  expiresInDays?: number;

  @prop({ type: Number })
  balance?: number;

  @prop({ type: Number, required: true })
  price!: number;

  @prop({ type: BalancePriceGroup })
  balancePriceGroups?: BalancePriceGroup[];

  @prop({ type: Number })
  maxKids?: number;

  @prop({ type: Number, default: 1 })
  minKids = 1;

  @prop({ type: Number, default: 2 })
  freeParentsPerKid: number = 2;

  @prop({ type: Boolean, default: false })
  openForClient: boolean = false;

  @prop({ type: Boolean, default: false })
  openForReception: boolean = false;

  @prop({ type: String })
  customerTags!: string[];

  @prop({ type: Number })
  maxPerCustomer?: number;

  @prop({ type: Number })
  overPrice?: number;

  @prop({ type: Number })
  discountPrice?: number;

  @prop({ type: Number })
  discountRate?: number;

  @prop({ type: Number })
  fixedPrice?: number;

  @prop({ type: Number })
  quantity?: number;

  @prop()
  partnerUrl?: string;

  @prop()
  rewardCardTypes?: string;

  issue(
    this: DocumentType<CardType>,
    customer: DocumentType<User>,
    {
      quantity = undefined,
      balanceGroups = undefined
    }: { quantity?: number; balanceGroups?: BalanceGroup[] } = {}
  ) {
    const card = new CardModel({
      customer: customer.id
    });

    if (this.stores) {
      card.stores = this.stores.map(s => s.id);
    }

    (Object.keys(this.toObject()) as Array<keyof CardType>)
      .filter(
        key =>
          ![
            "_id",
            "__v",
            "createdAt",
            "updatedAt",
            "store",
            "quantity"
          ].includes(key)
      )
      .forEach(key => {
        card.set(key, this[key]);
      });

    if (this.times) {
      if (quantity) {
        card.quantity = quantity;
        card.times = this.times * quantity;
        card.price = this.price * quantity;
      }
      card.timesLeft = card.times;
    }

    balanceGroups = balanceGroups?.filter(
      g => g.count >= 1 && g.count % 1 === 0
    );

    if (balanceGroups && balanceGroups.length) {
      card.price = balanceGroups.reduce((price, group) => {
        const balancePriceGroup = this.balancePriceGroups?.find(
          pg => pg.balance === group.balance
        );
        if (!balancePriceGroup) {
          throw new HttpError(400, `不支持这个金额：${group.balance}`);
        }
        return +(price + (balancePriceGroup.price || 0) * group.count).toFixed(
          10
        );
      }, 0);
      card.balance = balanceGroups.reduce(
        (price, group) => +(price + group.balance * group.count).toFixed(10),
        0
      );
    } else if (this.balancePriceGroups && this.balancePriceGroups.length) {
      throw new HttpError(400, `没有选择面额组合`);
    }

    if (this.end) {
      card.expiresAt = moment(this.end).endOf("day").toDate();
    } else if (this.expiresInDays !== undefined) {
      card.expiresAt = moment(card.start || undefined)
        .add(this.expiresInDays, "days")
        .endOf("day")
        .toDate();
    }

    if (this.type === Scene.PERIOD) {
      if (!this.start) {
        card.start = moment().startOf("day").toDate();
      }
      if (!this.end) {
        card.end = card.expiresAt;
      }
    }

    return card;
  }
}

const CardTypeModel = getModelForClass(CardType, {
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

export default CardTypeModel;
