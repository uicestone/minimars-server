import md5 from "md5";
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { DocumentType } from "@typegoose/typegoose";
import moment from "moment";
import JSONBigInt from "json-bigint";
import userModel, { User } from "../models/User";

export type Ticket = {
  cashierUid: string;
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

type Member = {
  customerUid: number | string;
  categoryName: string;
  number: string;
  name: string;
  point: number;
  discount: number;
  balance: number;
  phone: string;
  birthday: string;
  qq: string;
  email: string;
  address: string;
  createdDate: string;
  password: string;
  onAccount: number;
  enable: number;
};

export default class Pospal {
  api: AxiosInstance;
  appId: string;
  appKey: string;
  customers?: Member[];
  constructor(storeCode?: string) {
    this.appId =
      process.env[
        `POSPAL_APPID${storeCode ? "_" + storeCode.toUpperCase() : ""}`
      ] || "";
    this.appKey =
      process.env[
        `POSPAL_APPKEY${storeCode ? "_" + storeCode.toUpperCase() : ""}`
      ] || "";
    if (!this.appId || !this.appKey) throw new Error("pospal_store_not_found");
    this.api = axios.create({
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

    this.api.interceptors.request.use((config: AxiosRequestConfig) => {
      config.data.appId = this.appId;
      config.headers["data-signature"] = md5(
        this.appKey + JSON.stringify(config.data)
      ).toUpperCase();
      return config;
    });
  }

  handleError(data: { status: string; messages: string[]; data: any }) {
    if (data.status === "error") {
      console.error(`[PSP] ${data.messages.join("；")}`);
      throw new Error(`pospal_request_error`);
    } else {
      return data.data;
    }
  }

  async post(path: string, data: any) {
    // console.log("[PSP] Request:", path, data);
    const res = await this.api.post(path, data, {
      transformResponse: data => {
        return JSONBigInt({ storeAsString: true }).parse(data);
      }
    });
    // console.log("res data:", res.data?.data);
    return this.handleError(res.data);
  }

  async addMember(user: DocumentType<User>): Promise<void> {
    if (user.pospalId) {
      const customer =
        this.customers?.find(c => c.customerUid.toString() === user.pospalId) ||
        (await this.getMember(user.pospalId));
      if (!customer) {
        console.error(
          `[PSP] Customer not found for ${user.pospalId} ${user.mobile}.`
        );
        return;
      }
      if (customer.balance !== user.balance || customer.point !== user.points) {
        await this.incrementMemberBalancePoints(
          user,
          +(user.balance - customer.balance).toFixed(2),
          +((user.points || 0) - customer.point).toFixed(2)
        );
        // console.log(user.mobile, user.balance, customer.balance);
        // console.log(user.mobile, user.points, customer.point);
        console.log(
          `[PSP] Found user ${
            user.mobile
          } with balance/points offset, fixed (${+(
            user.balance - customer.balance
          ).toFixed(2)}, ${+((user.points || 0) - customer.point).toFixed(2)}).`
        );
      }
      return;
    }

    const customerInfo: Member = await this.post("customerOpenApi/add", {
      customerInfo: {
        number: user.id,
        name: user.name?.replace(/[\u{10000}-\u{10FFFF}]/gu, "") || "",
        phone: user.mobile,
        balance: user.balance,
        point: user.points
      }
    });
    await userModel.updateOne(
      { _id: user.id },
      { pospalId: customerInfo.customerUid.toString() }
    );
    console.log(
      `[PSP] New Pospal customer created ${customerInfo.customerUid} ${user.mobile}.`
    );
  }

  async getMemberByNumber(number: string): Promise<Member> {
    return await this.post("customerOpenApi/queryByNumber", {
      customerNum: number
    });
  }

  async getMember(uid: string): Promise<Member> {
    return await this.post("customerOpenApi/queryByUid", {
      customerUid: uid
    });
  }

  async updateMemberBaseInfo(customerUid: string, set: Partial<Member>) {
    console.log(`[PSP] Update ${customerUid} set ${JSON.stringify(set)}`);
    await this.post("customerOpenApi/updateBaseInfo", {
      customerInfo: {
        customerUid,
        ...set
      }
    });
  }

  async incrementMemberBalancePoints(
    user: DocumentType<User>,
    balanceIncrement = 0,
    pointIncrement = 0
  ) {
    await this.post("customerOpenApi/updateBalancePointByIncrement", {
      customerUid: user.pospalId,
      balanceIncrement,
      pointIncrement,
      dataChangeTime: moment().format("YYYY-MM-DD HH:mm:ss")
    });
  }

  async queryAllCustomers(postBackParameter?: {
    parameterType: string;
    parameterValue: string;
  }): Promise<Member[]> {
    console.log(`[PSP] Query all customers.`);
    const data: {
      postBackParameter: {
        parameterType: string;
        parameterValue: string;
      };
      result: Member[];
      pageSize: number;
    } = await this.post("customerOpenApi/queryCustomerPages", {
      postBackParameter
    });
    data.result.forEach(item => {
      if (item.customerUid && typeof item.customerUid === "number") {
        item.customerUid = item.customerUid.toString();
      }
    });
    let customers = data.result;
    if (data.result.length >= data.pageSize) {
      const nextPageResult = await this.queryAllCustomers(
        data.postBackParameter
      );
      customers = customers.concat(nextPageResult);
    }
    this.customers = customers;
    return customers;
  }

  async queryAllPayMethod() {
    return await this.post("ticketOpenApi/queryAllPayMethod", {});
  }

  async queryTickets(
    dateOrPastMinutes?: string | number,
    postBackParameter?: {
      parameterType: string;
      parameterValue: string;
    }
  ): Promise<Ticket[]> {
    const d = dateOrPastMinutes || moment().format("YYYY-MM-DD");
    if (typeof d !== "number") {
      console.log(`[PSP] Query tickets for ${d}`);
    }
    const start =
      typeof d === "number"
        ? moment().subtract(d, "minutes")
        : moment(d).startOf("day");
    const end = typeof d === "number" ? moment() : moment(d).endOf("day");
    const data: {
      postBackParameter: {
        parameterType: string;
        parameterValue: string;
      };
      result: Ticket[];
      pageSize: number;
    } = await this.post("ticketOpenApi/queryTicketPages", {
      startTime: start.format("YYYY-MM-DD HH:mm:ss"),
      endTime: end.format("YYYY-MM-DD HH:mm:ss"),
      postBackParameter
    });

    let result = data.result;

    if (data.result.length >= data.pageSize) {
      const nextPageResult = await this.queryTickets(d, data.postBackParameter);
      result = result.concat(nextPageResult);
    }

    return result;
  }

  async queryMultiDateTickets(dateStart: string, dateEnd?: string) {
    const end = moment(dateEnd).startOf("day").valueOf();
    let result: Ticket[] = [];
    for (
      let d = moment(dateStart).startOf("day");
      d.valueOf() <= end;
      d.add(1, "day")
    ) {
      result = result.concat(await this.queryTickets(d.format("YYYY-MM-DD")));
    }
    return result;
  }

  async getPushUrl() {
    const result = await this.post("openNotificationOpenApi/queryPushUrl", {});
    console.log(result);
  }

  async updatePushUrl(pushUrl: string) {
    const result = await this.post("openNotificationOpenApi/updatePushUrl", {
      pushUrl
    });
    console.log(result);
  }
}
