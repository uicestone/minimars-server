import WXOauth from "@xinglu/wxapp-oauth";
import { Pay, SignType, utils } from "@sigodenjs/wechatpay";
import fs from "fs";

const {
  WEIXIN_APPID,
  WEIXIN_SECRET,
  WEIXIN_MCH_ID,
  WEIXIN_MCH_KEY,
  WEIXIN_MCH_CERT_PATH,
  API_ROOT
} = process.env;

const pfx = WEIXIN_MCH_CERT_PATH ? fs.readFileSync(WEIXIN_MCH_CERT_PATH) : null;

export const oAuth = WXOauth({
  appid: WEIXIN_APPID,
  secret: WEIXIN_SECRET
});
export const pay = new Pay({
  appId: WEIXIN_APPID,
  mchId: WEIXIN_MCH_ID,
  key: WEIXIN_MCH_KEY,
  pfx
});

export const unifiedOrder = async (
  outTradeNo: string,
  totalFee: number,
  openid: string,
  body: string = " ",
  attach: string = ""
) => {
  const orderData = await pay.unifiedOrder({
    body,
    attach,
    out_trade_no: outTradeNo,
    total_fee: Math.max(Math.round(totalFee * 100), 1),
    trade_type: "JSAPI",
    openid,
    notify_url: `${API_ROOT}wechat/pay/notify`,
    spbill_create_ip: "8.8.8.8"
  });
  if (!pay.verifySign(orderData)) throw new Error("WechatPay sign error.");
  if (orderData.result_code === "FAIL")
    throw new Error(`Trade failed: ${JSON.stringify(orderData)}`);

  return orderData;
};

export const refundOrder = async (
  outTradeNo: string,
  outRefundNo: string,
  totalFee: number,
  refundFee: number
) => {
  console.log(
    `[PAY] Wechat refund ${outTradeNo} ${outRefundNo} ${totalFee} ${refundFee}`
  );
  return await pay.refund({
    out_trade_no: outTradeNo,
    out_refund_no: outRefundNo,
    total_fee: Math.max(Math.round(Math.abs(totalFee) * 100), 1),
    refund_fee: Math.max(Math.round(Math.abs(refundFee) * 100), 1)
  });
};

export const payArgs = (gatewayData: {
  nonce_str: string;
  prepay_id: string;
}) => {
  const timeStamp = String(Date.now()).substr(0, 10);
  const nonceStr = gatewayData.nonce_str;
  const _package = `prepay_id=${gatewayData.prepay_id}`;
  return {
    timeStamp,
    nonceStr,
    package: _package,
    paySign: utils.sign(
      "MD5" as SignType,
      {
        appId: WEIXIN_APPID,
        timeStamp,
        nonceStr,
        package: _package,
        signType: "MD5"
      },
      WEIXIN_MCH_KEY
    )
  };
};
