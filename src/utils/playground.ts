import moment from "moment";
import BookingModel, { BookingStatus } from "../models/Booking";
import CardTypeModel from "../models/CardType";
import PaymentModel, { PaymentGateway, Scene } from "../models/Payment";
import StoreModel from "../models/Store";
import UserModel, { User } from "../models/User";
import agenda from "./agenda";
import Pospal from "./pospal";
import {
  getTrade,
  searchTrade,
  syncUserPoints,
  virtualCodeApply
} from "./youzan";

export default async function playground() {
  console.log("Run playground...");
  try {
    // const user = await UserModel.findOne({ mobile: "13601881283" });
    const pospal = new Pospal("TS");
    // const cats = await pospal.queryAllProductCategories();
    // const products = await pospal.queryAllProducts();
    const menu = await pospal.getMenu();
    console.log(menu[0].products[0]);
    // pospal.addMember(user);
    // console.log(user.pospalId);
    // const customer = await pospal.getMember(user.pospalId);
    // await pospal.updateMemberBaseInfo(user.pospalId, { enable: 1 });
    // console.log(customer);
    // const store = await StoreModel.findOne({ code: "TS" });
    // await store.syncPospalTickets("2021-01-14", "2021-01-19");
    // const am = await pospal.queryAllPayMethod();
    // const em = [
    //   "payCode_103",
    //   "payCode_17",
    //   "payCode_105",
    //   "payCode_108",
    //   "payCode_111",
    //   "payCode_109",
    //   "payCode_107",
    //   "payCode_7",
    //   "payCode_106",
    //   "payCode_110",
    //   "payCode_2"
    // ];
    // console.log(
    //   am
    //     .filter(i => em.includes(i.code))
    //     .map(m => `${m.code} ${m.name}`)
    //     .join("\n")
    // );
    // const user = await UserModel.findOne({ mobile: "13641926334" });
    // syncUserPoints(user);
    // const trade = await getTrade("E20210313010129071404117");
    // console.log("trade:", JSON.stringify(trade));
    // console.log("trade:", trade.full_order_info);
    // if (trade.full_order_info.order_info.order_tags.is_virtual) {
    //   await virtualCodeApply(trade.full_order_info.order_info.tid);
    // }
    // console.log(
    //   JSON.parse(trade.full_order_info.orders[0].sku_properties_name).map(
    //     (p: any) => p.v
    //   )
    // );
    // const cardInfos = trade.full_order_info.orders.map(o => ({
    //   slug: o.outer_item_id,
    //   count: o.num
    // }));
    // for (const cardInfo of cardInfos) {
    //   for (let n = 0; n < cardInfo.count; n++) {}
    // }
    // searchTrade();
  } catch (e) {
    console.error(e.code);
  }
}
