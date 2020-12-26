import { Socket } from "net";
import { DocumentType } from "@typegoose/typegoose";
import storeModel, { Store, storeGateControllers } from "../models/Store";
import { JxCtl } from "jingxing-doors";

export default function handleSocketData(
  socket: Socket,
  client: { store: DocumentType<Store>; connectedAt: Date }
) {
  return async (data: Buffer | string) => {
    console.log(
      `[SOK] Got data from ${socket.remoteAddress}:${socket.remotePort}`
    );
    if (data.slice(-2).toString() === "\r\n") {
      const str = data.slice(0, -2).toString();
      console.log(`[SOK] String data: "${str}".`);
      const matchStore = str.match(/^store (.*)$/);
      if (matchStore && matchStore[1]) {
        client.store = await storeModel.findById(matchStore[1]);
        console.log(`[SOK] Identified store ${client.store.name}.`);
        client.store.ip = socket.remoteAddress;
        client.store.save();
        storeGateControllers[client.store.id] = new JxCtl(
          socket,
          client.store.doors[0].ip
        );
        storeGateControllers[client.store.id].init();
      }
    }
  };
}
