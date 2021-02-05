import WXOauth from "@xinglu/wxapp-oauth";
import { Pay, SignType, utils } from "@sigodenjs/wechatpay";
import fs from "fs";
import Axios, { AxiosRequestConfig } from "axios";
import { User } from "../models/User";
import { DocumentType } from "@typegoose/typegoose";

const {
  WEIXIN_APPID,
  WEIXIN_SECRET,
  WEIXIN_MCH_ID,
  WEIXIN_MCH_KEY,
  WEIXIN_MCH_CERT_PATH,
  WEIXIN_APPID_MP,
  WEIXIN_SECRET_MP,
  API_ROOT
} = process.env;
const accessToken = { token: "", expiresAt: 0 };
const accessTokenMp = { token: "", expiresAt: 0 };

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

function handleError(res: any) {
  if (!res || !res.data) {
    throw new Error("wechat_api_network_error");
  } else if (res.data.errcode) {
    console.error(`[WEC] Wechat API error: ${res.data.errmsg}.`);
    throw new Error("wechat_api_error");
  }
  return res.data;
}

async function request(
  isMp: boolean,
  path: string,
  data: any = null,
  config: AxiosRequestConfig = {}
) {
  const client = Axios.create({
    baseURL: "https://api.weixin.qq.com/cgi-bin/"
  });
  if (path !== "token") {
    client.interceptors.request.use(async (config: AxiosRequestConfig) => {
      if (!config.params) config.params = {};
      config.params.access_token = await getAccessToken(isMp);
      return config;
    });
  }
  let res: any;
  if (data) {
    res = await client.post(path, data, config);
  } else {
    res = await client.get(path, config);
  }
  return handleError(res);
}

export async function getAccessToken(isMp = false): Promise<string> {
  const at = isMp ? accessTokenMp : accessToken;
  if (at.expiresAt > Date.now()) {
    return at.token;
  }
  const data = await request(isMp, "token", null, {
    params: {
      grant_type: "client_credential",
      appid: isMp ? WEIXIN_APPID_MP : WEIXIN_APPID,
      secret: isMp ? WEIXIN_SECRET_MP : WEIXIN_SECRET
    }
  });
  if (!data?.access_token) throw new Error("invalid_access_token");
  console.log(`[WEC] Get access token ${data.access_token}`);
  at.token = data.access_token;
  at.expiresAt = Date.now() + 3.6e6;
  return at.token;
}

export async function getQrcode(
  path: string,
  output = "qrcode.jpg"
): Promise<void> {
  const data = await request(
    false,
    "wxaapp/createwxaqrcode",
    { path, width: 1280 },
    { responseType: "arraybuffer" }
  );
  if (data.errcode) {
    console.error(`[WEC] ${data.errcode} ${data.errmsg}.`);
    return;
  }
  const fileName = `${process.cwd()}/${output}`;
  console.log(fileName);
  fs.writeFileSync(fileName, data);
}

export async function getMpUserOpenids() {
  let nextOpenid = "";
  let openids: string[] = [];
  while (true) {
    const data = await request(true, "user/get", null, {
      params: { next_openid: nextOpenid }
    });
    openids = openids.concat(data.data.openid);
    if (data.count < 1e4) break;
    else nextOpenid = data.next_openid;
  }
  return openids;
}

export async function getUsersInfo(openids: string[]) {
  const { user_info_list: usersInfo } = await request(
    true,
    "user/info/batchget",
    {
      user_list: openids.map(openid => ({ openid, lang: "zh_CN" }))
    }
  );
  return usersInfo;
}

export enum TemplateMessageType {
  WRITEOFF = "WRITEOFF",
  CANCEL = "CANCEL",
  GIFT_CARD_RECEIVED = "GIFT_CARD_RECEIVED"
}

export async function sendTemplateMessage(
  user: DocumentType<User>,
  type: TemplateMessageType,
  messages: string[]
) {
  if (
    !user.tags.includes("test") &&
    !process.env.ENABLE_WECHAT_TEMPLATE_MESSAGE
  ) {
    return;
  }
  if (!user.openidMp) {
    console.log(
      `[WEC] Fail to send template message without openidMp, user ${user.id}.`
    );
    return;
  }
  const templates = Object.values(TemplateMessageType).reduce(
    (templates, type) => {
      templates[type] = process.env[type];
      return templates;
    },
    {} as Record<TemplateMessageType, string>
  );

  const messageData: Record<string, { value: string; color?: string }> = {};

  messages.forEach((message, index) => {
    if (index === 0) {
      messageData.first = { value: message };
    } else if (index === messages.length - 1) {
      messageData.remark = { value: message, color: "#2f69c8" };
    } else {
      messageData["keyword" + index] = { value: message, color: "#18e245" };
    }
  });
  const postData = {
    touser: user.openidMp,
    template_id: templates[type],
    // url: "http://weixin.qq.com/download",
    miniprogram: {
      appid: WEIXIN_APPID,
      pagepath: "/pages/index/index"
    },
    data: messageData
  };
  await request(true, "message/template/send", postData);
  console.log(`[WEC] Send ${type} message to user ${user.mobile} ${user.id}.`);
}

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
