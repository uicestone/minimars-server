// @ts-ignore
import { md5 } from "@sigodenjs/wechatpay/dist/utils";
import { DocumentType } from "@typegoose/typegoose";
// @ts-ignore
import { token, client } from "youzanyun-sdk";
import CardTypeModel from "../models/CardType";
import UserModel, { User } from "../models/User";
const tokenExpireOffset = 3e5; // 5 minutes

export const accessToken = {
  token: "",
  refreshToken: "",
  expiresAt: new Date()
};

const clientId = process.env.YOUZAN_CLIENT_ID;
const clientSecret = process.env.YOUZAN_CLIENT_SECRET;
const grantId = process.env.YOUZAN_GRANT_ID;

export async function getAccessToken() {
  if (
    accessToken.token &&
    accessToken.expiresAt.valueOf() - Date.now() >= tokenExpireOffset
  ) {
    return accessToken.token;
  }
  const { data } = await token.get({
    authorize_type: "silent",
    client_id: clientId,
    client_secret: clientSecret,
    grant_id: grantId,
    refresh: true
  });
  if (!data.success) {
    throw new Error(data.message);
  }
  accessToken.token = data.data.access_token;
  accessToken.expiresAt = new Date(data.data.expires);
  accessToken.refreshToken = data.data.refresh_token;
  console.log("[YZN] Got access token.");
  return accessToken.token;
}

async function call(api: string, version: string, params: Record<string, any>) {
  const token = await getAccessToken();
  try {
    const { data } = await client.call({
      api,
      version,
      token,
      params
    });
    // console.log(data);
    if (version >= "4.0.0") {
      if (data.gw_err_resp) {
        throw new Error(data.gw_err_resp.err_msg);
      }
      if (!data.success) {
        throw new Error(data.message);
      }
      return data.data;
    } else if (version >= "3.0.0") {
      if (data.error_response) {
        throw new Error(data.error_response.msg);
      }
      return data.response;
    } else if (version >= "1.0.0") {
      if (!data.success) {
        throw new Error(data.message);
      }
      return data.data;
    }
  } catch (err) {
    console.error(`[YZN] API Error:`, err.message);
  }
}

export async function syncUserPoints(
  user: DocumentType<User>,
  reason = "积分同步"
) {
  const result = await call("youzan.crm.customer.points.sync", "4.0.0", {
    points: user.points,
    user: {
      account_type: 2, // 1:fans_id, 2:mobile, 3:open_user_id, 4:yzOpenId
      account_id: user.mobile
    },
    reason
  });
  if (result.is_success) {
    console.log(
      `[YZN] User points synded, ${user.points} ${user.mobile} ${user.id}.`
    );
  }
}

export function verifyPush(eventKey: string, entity: string) {
  return md5(clientId + entity + clientSecret) === eventKey;
}

export async function getTrade(tid: string) {
  const trade = await call("youzan.trade.get", "4.0.0", { tid });
  return trade;
}

export async function searchTrade(query = {}) {
  const { full_order_info_list } = await call(
    "youzan.trades.sold.get",
    "4.0.0",
    query
  );
  const trades = full_order_info_list.map((i: any) => i.full_order_info);
  return trades;
}

export async function virtualCodeApply(code: string) {
  const result = await call("youzan.trade.virtualcode.apply", "3.0.0", {
    code
  });
  return result;
}

export async function handleAuthMobile(message: {
  mobile: string;
  yz_open_id: string;
}) {
  let user = await UserModel.findOne({ mobile: message.mobile });
  if (!user) {
    user = new UserModel();
    user.mobile = message.mobile;
  }
  user.youzanId = message.yz_open_id;
  console.log(
    `[YZN] User ${user.mobile} is ${
      user.isNew ? "created" : "updated"
    } from Youzan.`
  );
  await user.save();
  if (user.points) {
    syncUserPoints(user);
  }
}

export async function handleTradePaid(trade: any) {
  const mobile = trade.full_order_info.buyer_info.buyer_phone;
  let user = await UserModel.findOne({ mobile });
  if (!user) {
    user = new UserModel({ mobile });
    await user.save();
  }
  const slugNums = trade.full_order_info.orders.map((order: any) => [
    order.outer_item_id,
    order.num,
    JSON.parse(order.sku_properties_name).map((p: any) => p.v)
  ]);
  for (const [slug, num, storeNames] of slugNums) {
    console.log(
      `[YZN] Try create card ${slug}×${num}@${storeNames.join(",")} for user ${
        user.mobile
      } ${user.id}.`
    );
    const cardType = await CardTypeModel.findOne({ slug });
    if (!cardType) continue;
    for (let n = 0; n < num; n++) {
      const card = cardType.issue(user);
      await card.save();
      // TODO, payment, store, cancel
      console.log(
        `[YZN] Auto created card ${slug} ${card.title} ${card.id} for user ${user.mobile} ${user.id}.`
      );
    }
  }
  if (trade.full_order_info.order_info.order_tags.is_virtual) {
    await virtualCodeApply(trade.full_order_info.order_info.tid);
  }
  console.log("[YZN] Code applied:", trade.full_order_info.order_info.tid);
}
