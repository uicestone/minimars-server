import md5 from "md5";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import userModel, { User } from "../models/User";
import { DocumentType } from "@typegoose/typegoose";
import moment from "moment";

const { POSPAL_APPID: appId, POSPAL_APPKEY: appKey } = process.env;

type Ticket = {
  cashierUid: number;
  cashier: {
    jobNumber: string;
    name: string;
    uid: number;
  };
  customerUid: number;
  uid: number;
  sn: string;
  datetime: string;
  totalAmount: number;
  totalProfit: number;
  discount: number;
  rounding: number;
  ticketType: string;
  invalid: number;
  items: Item[];
  payments: Payment[];
};

type Item = {
  name: string;
  buyPrice: number;
  sellPrice: number;
  customerPrice: number;
  quantity: number;
  discount: number;
  customerDiscount: number;
  totalAmount: number;
  totalProfit: number;
  isCustomerDiscount: number;
  productUid: number;
  productBarcode: string;
  isWeighing: number;
  ticketitemattributes: [];
  discountDetails: [];
  saleGuiderList: [];
};

type Payment = {
  code: string;
  amount: number;
};

const api = axios.create({
  baseURL: "https://area35-win.pospal.cn:443/pospal-api2/openapi/v1/",
  headers: { "time-stamp": Date.now() },
  transformResponse(data) {
    const parsed = JSON.parse(data);
    const match = data.match(/"customerUid"\:(\d+)\,/);
    if (match) {
      if (parsed.customerUid) parsed.customerUid = match[1];
      if (parsed.data?.customerUid) parsed.data.customerUid = match[1];
      if (parsed.data?.customrUid) parsed.data.customrUid = match[1];
    }
    return parsed;
  }
});

api.interceptors.request.use((config: AxiosRequestConfig) => {
  config.data.appId = appId;
  config.headers["data-signature"] = sign(config.data);
  return config;
});

export function sign(data: any) {
  return md5(appKey + JSON.stringify(data)).toUpperCase();
}

function handleError(data) {
  if (data.status === "error") {
    console.error(`[PSP] ${data.messages.join("；")}`);
    return;
  } else {
    return data.data;
  }
}

async function post(path: string, data: any) {
  console.log("[PSP] Request:", path, data);
  const res = await api.post(path, data);
  // console.log("res data:", res.data?.data);
  return handleError(res.data);
}

export async function addMember(user: DocumentType<User>) {
  const existing = await getMember(user.id);
  if (existing) {
    if (!user.pospalId) {
      user.pospalId = existing.customerUid;
      await user.save();
    }
    if (existing.balance !== user.balance || existing.point !== user.points) {
      await incrementMemberBalancePoints(
        user,
        +(user.balance - existing.balance).toFixed(2),
        +(user.points - existing.point).toFixed(2)
      );
      console.log(
        `[PSP] Found user ${user.mobile} with points/balance offset, fixed (${+(
          user.balance - existing.balance
        ).toFixed(2)}, ${+(user.points - existing.point).toFixed(2)}).`
      );
    } else {
      console.log(
        `[PSP] Found user ${user.mobile} with points/balance exact match.`
      );
    }
  } else {
    const customerInfo = await post("customerOpenApi/add", {
      customerInfo: {
        number: user.id,
        name: user.name,
        phone: user.mobile,
        balance: user.balance,
        point: user.points
      }
    });
    if (!customerInfo) {
      await post("customerOpenApi/updateBaseInfo", {
        customerInfo: {
          customerUid: "85961344667500269",
          enable: 1
        }
      });
      return;
    }
    await userModel.updateOne(
      { _id: user.id },
      { pospalId: customerInfo.customerUid }
    );
    console.log(`[PSP] New Pospal member created.`);
  }
}

export async function incrementMemberBalancePoints(
  user: DocumentType<User>,
  balanceIncrement = 0,
  pointIncrement = 0
) {
  await post("customerOpenApi/updateBalancePointByIncrement", {
    customerUid: user.pospalId,
    balanceIncrement,
    pointIncrement,
    dataChangeTime: moment().format("YYYY-MM-DD HH:mm:ss")
  });
}

export async function getMember(number: string) {
  return await post("customerOpenApi/queryByNumber", {
    customerNum: number
  });
}

export async function queryAllPayMethod() {
  return await post("ticketOpenApi/queryAllPayMethod", {});
}

export async function queryTickets(postBackParameter?: {
  parameterType: string;
  parameterValue: string;
}): Promise<Ticket[]> {
  const data: {
    postBackParameter: {
      parameterType: string;
      parameterValue: string;
    };
    result: any[];
    pageSize: number;
  } = await post("ticketOpenApi/queryTicketPages", {
    startTime: moment().subtract(1, "day").format("YYYY-MM-DD HH:mm:ss"),
    endTime: moment().format("YYYY-MM-DD HH:mm:ss"),
    postBackParameter
  });

  let result = data.result;

  if (data.result.length >= data.pageSize) {
    const nextPageResult = await queryTickets(data.postBackParameter);
    result = result.concat(nextPageResult);
  }

  return result;
}
