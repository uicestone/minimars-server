import {
  prop,
  getModelForClass,
  plugin,
  pre,
  Ref,
  DocumentType,
  modelOptions,
  Severity,
  post
} from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";
import autoPopulate from "./plugins/autoPopulate";
import { User } from "./User";
import BookingModel, { Booking } from "./Booking";
import CardModel, { Card, CardStatus } from "./Card";
import { Store } from "./Store";
import {
  unifiedOrder as wechatUnifiedOrder,
  payArgs as wechatPayArgs,
  refundOrder
} from "../utils/wechat";
import moment from "moment";
import HttpError from "../utils/HttpError";

export enum Scene {
  PLAY = "play",
  PARTY = "party",
  EVENT = "event",
  GIFT = "gift",
  MALL = "mall",
  FOOD = "food",
  CARD = "card",
  BALANCE = "balance",
  PERIOD = "period"
}

export const SceneLabel = {
  play: "门票",
  party: "派对",
  event: "活动",
  gift: "礼品",
  food: "餐饮",
  card: "购卡",
  balance: "充值",
  period: "时效卡",
  mall: "商城"
};

@pre("save", async function (next) {
  const payment = this as DocumentType<Payment>;
  if (!payment.isModified("paid") && !payment.isNew) {
    return next();
  }

  if (payment.paid) {
    // payment.paid is modified to true and save
    await payment.paidSuccess();
    return next();
  }

  await payment.populate("customer").execPopulate();

  const customer = payment.customer as DocumentType<User> | undefined;

  switch (payment.gateway) {
    case PaymentGateway.WechatPay:
      if (payment.payArgs) return next();
      await payment.populate("customer").execPopulate();
      if (!customer?.openid) {
        throw new Error("no_customer_openid");
      }
      payment.assets = payment.amount;
      if (payment.booking) {
        payment.revenue = payment.amount;
      } else if (payment.card) {
        payment.debt = payment.amount;
      }

      // not the wechatpay in weapp
      if (payment.gatewayData.provider) return next();

      if (payment.amount > 0) {
        const wechatUnifiedOrderData = await wechatUnifiedOrder(
          payment._id.toString(),
          payment.amount,
          customer.openid,
          payment.title,
          payment.attach
        );
        Object.assign(payment.gatewayData, wechatUnifiedOrderData);
      } else {
        const originalPayment = await PaymentModel.findOne({
          _id: payment.original
        });
        if (!originalPayment) throw new Error("invalid_refund_original");
        const wechatRefundOrderData = await refundOrder(
          payment.original || "",
          payment.id,
          originalPayment.amount,
          payment.amount
        );
        Object.assign(payment.gatewayData, wechatRefundOrderData);
        if (wechatRefundOrderData.result_code === "SUCCESS") {
          payment.paid = true;
          await payment.paidSuccess();
        } else {
          if (wechatRefundOrderData.err_code === "NOTENOUGH") {
            throw new Error("wechat_account_insufficient_balance");
          } else if (wechatRefundOrderData.err_code_des) {
            throw new HttpError(400, wechatRefundOrderData.err_code_des);
          } else {
            throw new Error("wechat_refund_failed");
          }
        }
      }
      break;
    case PaymentGateway.Balance:
      if (!customer) throw new Error("invalid_payment_customer");
      const {
        depositPaymentAmount,
        rewardPaymentAmount
      } = await customer.writeOffBalance(
        payment.amount,
        payment.amountForceDeposit,
        payment.amountDeposit,
        true,
        payment.gatewayData?.provider !== "pospal"
      );

      console.log(
        `[PAY] Payment amount D:R is ${depositPaymentAmount}:${rewardPaymentAmount}.`
      );

      payment.amountDeposit = depositPaymentAmount;
      if (payment.booking) {
        payment.debt = -payment.amountDeposit;
        payment.balance = -payment.amount;
        payment.revenue = payment.amountDeposit;
      } else {
        throw new Error("balance_payment_missing_booking");
      }
      payment.paid = true;
      break;
    case PaymentGateway.Card:
      if (!payment.times || !payment.gatewayData.cardId) {
        throw new Error("invalid_card_payment_gateway_data");
      }
      const card = await CardModel.findById(payment.gatewayData.cardId);

      if (!card || card.timesLeft === undefined) {
        throw new Error("invalid_card");
      }

      if (payment.times > 0) {
        card.timesLeft += payment.times;
        await card.save();
        console.log(
          `[PAY] Card ${card.id} refunded, time left: ${card.timesLeft}.`
        );
      } else {
        if (card.status !== CardStatus.ACTIVATED) {
          throw new Error("invalid_card");
        }
        if (card.timesLeft + payment.times < 0) {
          throw new Error("insufficient_card_times");
        }
        card.timesLeft += payment.times;
        await card.save();
        console.log(
          `[PAY] Card ${
            card.id
          } used in ${payment.booking?.toString()}, times left: ${
            card.timesLeft
          }.`
        );
      }
      if (payment.booking) {
        payment.debt = -payment.amount;
        payment.revenue = payment.amount;
      } else {
        throw new Error("card_payment_missing_booking");
      }
      payment.paid = true;
      break;
    case PaymentGateway.Coupon:
    case PaymentGateway.Cash:
    case PaymentGateway.Pr:
    case PaymentGateway.Pos:
    case PaymentGateway.Dianping:
    case PaymentGateway.Shouqianba:
    case PaymentGateway.Mall:
      payment.assets = payment.amount;
      if (payment.booking) {
        payment.revenue = payment.amount;
      } else {
        payment.debt = payment.amount;
      }
      payment.paid = true;
      break;
    case PaymentGateway.Points:
      if (!customer) throw new Error("invalid_payment_customer");
      if (payment.amountInPoints === undefined) {
        throw new Error("invalid_points_payment");
      }
      if (
        customer.points === undefined ||
        payment.amountInPoints > customer.points
      ) {
        throw new Error("insufficient_points");
      }
      await customer.addPoints(-payment.amountInPoints);
      payment.paid = true;
      break;
    default:
      throw new Error("unsupported_payment_gateway");
  }
  next();
})
@post("save", function (this: DocumentType<Payment>) {
  if (this.booking) {
    // update booking paid amount 1s after payment save
    // this is dirty but working
    setTimeout(async () => {
      const booking = await BookingModel.findById(this.booking);
      if (booking) {
        await booking.setAmountPaid();
        await booking.save();
      }
    }, 1000);
  }
})
@plugin(autoPopulate, [{ path: "customer", select: "name avatarUrl mobile" }])
@plugin(updateTimes)
@modelOptions({ options: { allowMixed: Severity.ALLOW } })
export class Payment {
  @prop({ enum: Object.values(Scene), required: true })
  scene!: Scene;

  @prop({ ref: "User", index: true })
  customer?: DocumentType<User>;

  @prop({ ref: "Store", index: true })
  store?: Ref<Store>;

  @prop({ required: true })
  amount!: number;

  @prop()
  amountForceDeposit?: number;

  @prop()
  amountDeposit?: number;

  @prop()
  amountInPoints?: number;

  @prop({ type: Number, default: 0 })
  debt = 0;

  @prop({ type: Number, default: 0 })
  assets = 0;

  @prop({ type: Number, default: 0 })
  revenue = 0;

  @prop({ type: Number })
  balance?: number;

  @prop({ default: false })
  paid: boolean = false;

  @prop({ type: Boolean })
  refunded?: boolean;

  @prop({ default: " " })
  title: string = " ";

  @prop({ ref: "Booking" })
  booking?: Ref<Booking>;

  @prop({ ref: "Card" })
  card?: Ref<Card>;

  @prop({ type: Number })
  times?: number;

  @prop({ required: true })
  gateway!: PaymentGateway;

  @prop({ default: {} })
  gatewayData: Record<string, any> = {};

  @prop()
  original?: string;

  get valid() {
    const payment = (this as unknown) as DocumentType<Payment>;
    return (
      payment.paid ||
      payment.isNew ||
      moment().diff((payment as any).createdAt, "hours", true) <= 2
    );
  }

  get payArgs() {
    const payment = (this as unknown) as DocumentType<Payment>;
    if (payment.gateway !== PaymentGateway.WechatPay || payment.paid) return;
    if (!payment.gatewayData.nonce_str || !payment.gatewayData.prepay_id) {
      // if (payment.valid && payment.amount > 0) {
      //   console.trace(
      //     `[PAY] Incomplete wechat pay gateway data, payment: ${payment.id}`
      //   );
      // }
      return;
    }
    const wechatGatewayData = payment.gatewayData as {
      nonce_str: string;
      prepay_id: string;
    };
    return wechatPayArgs(wechatGatewayData);
  }

  get attach() {
    if (this.card) return `card ${this.card}`;
    if (this.booking) return `booking ${this.booking}`;
    return ((this as unknown) as DocumentType<Payment>).id;
  }

  async paidSuccess(this: DocumentType<Payment>) {
    const payment = this;

    if (this.booking) {
      const booking = await BookingModel.findById(this.booking);
      if (!booking) throw new Error("invalid_booking");
      if (payment.amount >= 0) {
        // TODO: no, single payment success is not booking payment success
        // so right now we don't trigger paidSuccess for balance/card/coupon payment
        console.log(
          `[PAY] Booking payment success ${this.id}, booking: ${booking._id}.`
        );
        await booking.paymentSuccess();
      } else {
        console.log(
          `[PAY] Booking refund success ${this.id}, booking: ${booking._id}.`
        );
        await booking.refundSuccess();
      }
      await booking.save();
    } else if (this.card) {
      const card = await CardModel.findById(this.card);
      if (!card) throw new Error("invalid_card");
      await card.paymentSuccess();
      await card.save();
      console.log(`[PAY] Card purchase success, id: ${card._id}.`);
    }
  }
}

export enum PaymentGateway {
  Balance = "balance",
  Points = "points",
  Card = "card",
  Coupon = "coupon",
  Scan = "scan",
  Pos = "pos",
  Cash = "cash",
  Shouqianba = "shouqianba",
  Dianping = "dianping",
  WechatPay = "wechatpay",
  Mall = "mall",
  Pr = "pr",
  Internal = "internal",
  Alipay = "alipay",
  UnionPay = "unionpay"
}

export const gatewayNames = {
  [PaymentGateway.Balance]: "账户余额",
  [PaymentGateway.Points]: "账户积分",
  [PaymentGateway.Coupon]: "团购优惠券",
  [PaymentGateway.Scan]: "现场扫码",
  [PaymentGateway.Card]: "会员卡",
  [PaymentGateway.Pos]: "银行卡",
  [PaymentGateway.Cash]: "现金",
  [PaymentGateway.Shouqianba]: "收钱吧",
  [PaymentGateway.Dianping]: "点评POS",
  [PaymentGateway.WechatPay]: "微信支付",
  [PaymentGateway.Mall]: "线上商城",
  [PaymentGateway.Pr]: "市场公关",
  [PaymentGateway.Internal]: "内部消费",
  [PaymentGateway.Alipay]: "支付宝",
  [PaymentGateway.UnionPay]: "银联"
};

export const flowGateways = [
  PaymentGateway.Scan,
  PaymentGateway.Pos,
  PaymentGateway.Cash,
  PaymentGateway.Shouqianba,
  PaymentGateway.Dianping,
  PaymentGateway.WechatPay,
  PaymentGateway.Alipay,
  PaymentGateway.UnionPay
];

export const cardCouponGateways = [
  PaymentGateway.Card,
  PaymentGateway.Coupon,
  PaymentGateway.Balance
];

export const receptionGateways = [
  PaymentGateway.Scan,
  PaymentGateway.Pos,
  PaymentGateway.Cash,
  PaymentGateway.Shouqianba,
  PaymentGateway.Dianping,
  PaymentGateway.Coupon
];

const PaymentModel = getModelForClass(Payment, {
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

export default PaymentModel;
