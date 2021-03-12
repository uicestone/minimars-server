// @ts-ignore
import { DocumentType } from "@typegoose/typegoose";
import { token, client } from "youzanyun-sdk";
import { User } from "../models/User";
const tokenExpireOffset = 3e5; // 5 minutes

export const accessToken = {
  token: "",
  refreshToken: "",
  expiresAt: new Date()
};

export async function getAccessToken() {
  if (
    accessToken.token &&
    accessToken.expiresAt.valueOf() - Date.now() >= tokenExpireOffset
  ) {
    return accessToken.token;
  }
  const { data } = await token.get({
    authorize_type: "silent",
    client_id: process.env.YOUZAN_CLIENT_ID,
    client_secret: process.env.YOUZAN_CLIENT_SECRET,
    grant_id: process.env.YOUZAN_GRANT_ID,
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

async function call(api: string, params: Record<string, any>) {
  const token = await getAccessToken();
  const { data } = await client.call({
    api,
    version: "4.0.0",
    token,
    params
  });

  if (data.gw_err_resp) {
    throw new Error(data.gw_err_resp.err_msg);
  }
  if (!data.success) {
    throw new Error(data.message);
  }
  return data.data;
}

export async function syncUserPoints(
  user: DocumentType<User>,
  reason = "积分同步"
) {
  const result = await call("youzan.crm.customer.points.sync", {
    points: user.points,
    user: {
      account_type: 2, // 1:fans_id, 2:mobile, 3:open_user_id, 4:yzOpenId
      account_id: user.mobile
    },
    reason
  });
  if (result.is_success) {
    console.log(
      `[YZN] User points synded, ${user.points} ${user.mobile} ${user.id}`
    );
  }
}
