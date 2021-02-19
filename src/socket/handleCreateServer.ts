import moment from "moment";
import { Socket } from "net";
import handleSocketData from "./handleSocketData";
import { Store as IStore, storeServerSockets } from "../models/Store";
import { DocumentType } from "@typegoose/typegoose";

const pingInterval = +process.env.DOOR_PING_INTERVAL || 10000;
let connections = 0;

export default function handleCreateServer() {
  return async (socket: Socket) => {
    const client: { store: DocumentType<IStore>; connectedAt: Date } = {
      store: null,
      connectedAt: new Date()
    };
    connections++;
    console.log(
      `[SYS] Socket connect from: ${socket.remoteAddress}:${socket.remotePort} at ${client.connectedAt}, ${connections} connections in total.`
    );
    const heartBeatInterval = setInterval(() => {
      socket.write(`PING. Server time: ${moment().format("HH:mm:ss")}.\r\n`);
    }, pingInterval);

    socket.setKeepAlive(true);
    socket.setTimeout(10000);

    // When receive socket data.
    socket.on("data", handleSocketData(socket, client));

    // When socket send data complete.
    socket.on("close", async function () {
      clearInterval(heartBeatInterval);
      if (client.store) {
        storeServerSockets[client.store.id] = null;
      }
      connections--;
      console.log(
        `[SYS] Socket disconnect from ${socket.remoteAddress}:${socket.remotePort}, was connected at ${client.connectedAt}, ${connections} connections in total.`
      );
    });

    socket.on("error", async function (err) {
      console.log(`[SOK] Socket error: ${err.message}, destroy...`);
      socket.destroy(err);
    });

    // When socket timeout.
    socket.on("timeout", function () {
      console.log(
        `[SOK] Daemon not declaring store identity, timeout ${socket.remoteAddress}:${socket.remotePort}.`
      );
      socket.destroy(new Error("UNIDENTIFIED STORE"));
    });
  };
}
