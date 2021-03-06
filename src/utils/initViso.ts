import { Server } from "ws";
import { storeMap } from "../models/Store";
import { viso } from "./Viso";

export default async function initViso(wss: Server) {
  viso.init(wss, Object.values(storeMap));
}
