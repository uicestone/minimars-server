// @ts-nocheck
import StoreModel from "../models/Store";
import UserModel, { User } from "../models/User";
import agenda from "./agenda";
import Pospal from "./pospal";
import { syncUserPoints } from "./youzan";

export default async function playground() {
  console.log("Run playground...");
  try {
    // const user = await UserModel.findOne({ mobile: "13601881283" });
    // const pospal = new Pospal("TS");
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
    const user = await UserModel.findOne({ mobile: "13641926334" });
    syncUserPoints(user);
  } catch (e) {
    console.error(e);
  }
}
