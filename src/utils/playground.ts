import UserModel from "../models/User";
import agenda from "./agenda";
import Pospal from "./pospal";

export default async function playground() {
  console.log("Run playground...");
  try {
    const user = await UserModel.findOne({ mobile: "13601881283" });
    const pospal = new Pospal("BY");
    // pospal.addMember(user);
    // console.log(user.pospalId);
    // const customer = await pospal.getMember(user.pospalId);
    // await pospal.updateMemberBaseInfo(user.pospalId, { enable: 1 });
    // console.log(customer);
    // await store.syncPospalTickets("2020-09-19", "2021-01-04");
    // agenda.now("sync pospal customers");
  } catch (e) {
    console.error(e);
  }
}
