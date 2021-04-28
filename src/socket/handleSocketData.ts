import { Socket } from "net";
import { DocumentType } from "@typegoose/typegoose";
import storeModel, { Store, storeDoors } from "../models/Store";
import { JxCtl } from "jingxing-doors";
import { parseRemoteServerData } from "jingxing-doors";

export default function handleSocketData(
  socket: Socket,
  client: { store?: DocumentType<Store>; connectedAt: Date }
) {
  return async (data: Buffer | string) => {
    console.log(
      `[SOK] Got data from ${socket.remoteAddress}:${socket.remotePort}`,
      data
    );

    // parse string data
    if (data.slice(-2).toString() === "\r\n" || typeof data === "string") {
      const str = data.slice(0, -2).toString();
      console.log(`[SOK] String data: "${str}".`);

      const matchStore = str.match(/^store (.*)$/);

      // store identity message
      if (matchStore && matchStore[1]) {
        try {
          const store = await storeModel.findById(matchStore[1]);
          if (!store) throw new Error("invalid_store");
          client.store = store;
        } catch (e) {
          socket.destroy(new Error("CANNOT FIND STORE"));
          return;
        }
        if (!client.store) {
          socket.destroy(new Error("INVALID STORE"));
          return;
        }
        const timeout = +(process.env.DOOR_PING_INTERVAL || "") * (1 + 1 / 60);
        socket.setTimeout(timeout);
        console.log(
          `[SOK] Identified store ${client.store.code}, socket timeout set to ${timeout}.`
        );
        client.store.ip = socket.remoteAddress;
        client.store.save();
        if (!client.store.doors) return;
        storeDoors[client.store.id] = client.store.doors.map(d => {
          d.controller = new JxCtl(socket, d.ip);
          return d;
        });
      }
    } else {
      parseRemoteServerData(data);
    }
  };
}
