import {
  prop,
  getModelForClass,
  plugin,
  pre,
  Ref,
  DocumentType,
  modelOptions,
  Severity
} from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";
import autoPopulate from "./plugins/autoPopulate";
import { User } from "./User";
import BookingModel from "./Booking";
import CardModel, { CardStatus } from "./Card";
import { Store } from "./Store";
import {
  unifiedOrder as wechatUnifiedOrder,
  payArgs as wechatPayArgs,
  refundOrder
} from "../utils/wechat";
import { isValidHexObjectId } from "../utils/helper";
import moment from "moment";
import HttpError from "../utils/HttpError";

export enum Scene {
  PLAY = "play",
  PARTY = "party",
  EVENT = "event",
  GIFT = "gift",
  FOOD = "food",
  CARD = "card"
}

export const SceneLabel = {
  play: "门票",
  party: "派对",
  event: "活动",
  gift: "礼品",
  food: "餐饮",
  card: "购卡"
};

@pre("save", async function (next) {
  const payment = this as DocumentType<Payment>;

  if (!payment.isModified("paid") && !payment.isNew) {
    return next();
  }

  if (payment.gatewayData?.provider) {
    return next();
  }

  // console.log(`[PAY] Payment pre save ${payment._id}.`);

  if (payment.paid) {
    // payment.paid is modified to true and save
    await payment.paidSuccess();
    return next();
  }

  await payment.populate("customer").execPopulate();

  const customer = payment.customer as DocumentType<User>;

  switch (payment.gateway) {
    case PaymentGateway.WechatPay:
      if (payment.payArgs) return next();
      await payment.populate("customer").execPopulate();
      if (!customer.openid) {
        throw new Error("no_customer_openid");
      }
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
          payment.original,
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
      const {
        depositPaymentAmount,
        rewardPaymentAmount
      } = await customer.writeOffBalance(
        payment.amount,
        payment.amountForceDeposit,
        payment.amountDeposit
      );

      console.log(
        `[PAY] Payment amount D:R is ${depositPaymentAmount}:${rewardPaymentAmount}.`
      );

      payment.amountDeposit = depositPaymentAmount;
      payment.paid = true;
      if (payment.attach.match(/^booking /)) {
        await payment.customer.addPoints(payment.amount);
      }
      break;
    case PaymentGateway.Card:
      if (
        !payment.gatewayData.bookingId ||
        !payment.gatewayData.cardId ||
        !payment.gatewayData.times
      ) {
        throw new Error("invalid_card_payment_gateway_data");
      }
      const card = await CardModel.findOne({ _id: payment.gatewayData.cardId });

      if (payment.gatewayData.cardRefund) {
        card.timesLeft += payment.gatewayData.times;
        await card.save();
        // await customer.updateCardBalance();
        console.log(
          `[PAY] Card ${card.id} refunded, time left: ${card.timesLeft}.`
        );
      } else {
        if (card.status !== CardStatus.ACTIVATED) {
          throw new Error("invalid_card");
        }
        if (card.timesLeft < payment.gatewayData.times) {
          throw new Error("insufficient_card_times");
        }
        card.timesLeft -= payment.gatewayData.times;
        await card.save();
        // await customer.updateCardBalance();
        console.log(
          `[PAY] Card ${card.id} used in ${payment.gatewayData.bookingId}, times left: ${card.timesLeft}.`
        );
      }
      payment.paid = true;
      // await payment.paidSuccess();
      if (payment.attach.match(/^booking /)) {
        await payment.customer.addPoints(payment.amount);
      }

      break;
    case PaymentGateway.Coupon:
      payment.paid = true;
      // await payment.paidSuccess();
      break;
    case PaymentGateway.Scan:
      break;
    case PaymentGateway.Cash:
      payment.paid = true;
      // await payment.paidSuccess();
      if (payment.attach.match(/^booking /)) {
        await payment.customer.addPoints(payment.amount);
      }
      break;
    case PaymentGateway.Pr:
      payment.paid = true;
      // await payment.paidSuccess();
      break;
    case PaymentGateway.Pos:
      payment.paid = true;
      // await payment.paidSuccess();
      if (payment.attach.match(/^booking /)) {
        await payment.customer.addPoints(payment.amount);
      }
      break;
    case PaymentGateway.Dianping:
      payment.paid = true;
      // await payment.paidSuccess();
      if (payment.attach.match(/^booking /)) {
        await payment.customer.addPoints(payment.amount);
      }
      break;
    case PaymentGateway.Shouqianba:
      payment.paid = true;
      // await payment.paidSuccess();
      if (payment.attach.match(/^booking /)) {
        await payment.customer.addPoints(payment.amount);
      }
      break;
    case PaymentGateway.Points:
      if (payment.amountInPoints > customer.points) {
        throw new Error("insufficient_points");
      }
      await customer.addPoints(-payment.amountInPoints);
      payment.paid = true;
      // await payment.paidSuccess();
      break;
    default:
      throw new Error("unsupported_payment_gateway");
  }
  next();
})
@plugin(autoPopulate, [{ path: "customer", select: "name avatarUrl mobile" }])
@plugin(updateTimes)
@modelOptions({ options: { allowMixed: Severity.ALLOW } })
export class Payment {
  @prop({ enum: Object.values(Scene), required: true })
  scene: Scene;

  @prop({ ref: "User", index: true })
  customer?: DocumentType<User>;

  @prop({ ref: "Store", index: true })
  store?: Ref<Store>;

  @prop({ required: true })
  amount: number;

  @prop()
  amountForceDeposit?: number;

  @prop()
  amountDeposit?: number;

  @prop()
  amountInPoints?: number;

  @prop({ default: false })
  paid: boolean;

  @prop({ default: " " })
  title: string;

  @prop({ type: String, index: true })
  attach: string;

  @prop({ required: true, index: true })
  gateway: PaymentGateway;

  @prop({ default: {} })
  gatewayData: Record<string, any>;

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

  async paidSuccess(this: DocumentType<Payment>) {
    const payment = this;

    const paymentAttach = payment.attach.split(" ");

    switch (paymentAttach[0]) {
      case "booking":
        if (!isValidHexObjectId(paymentAttach[1])) break;
        const booking = await BookingModel.findOne({ _id: paymentAttach[1] });
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
        break;
      case "card":
        if (!isValidHexObjectId(paymentAttach[1])) break;
        const card = await CardModel.findOne({ _id: paymentAttach[1] });
        await card.paymentSuccess();
        await card.save();
        console.log(`[PAY] Card purchase success, id: ${card._id}.`);
        break;
      default:
      // console.error(
      //   `[PAY] Unknown payment attach: ${JSON.stringify(payment.attach)}`
      // );
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
