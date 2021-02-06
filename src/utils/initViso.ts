import { Server } from "ws";
import StoreModel from "../models/Store";
import { viso } from "./Viso";

export default async function initViso(wss: Server) {
  const stores = await StoreModel.find();
  viso.init(wss, stores);
}
