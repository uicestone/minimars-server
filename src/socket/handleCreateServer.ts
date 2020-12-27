import moment from "moment";
import { Socket } from "net";
import { Server as SocketIoServer } from "socket.io";
import handleSocketData from "./handleSocketData";
import { Store as IStore, storeServerSockets } from "../models/Store";
import { DocumentType } from "@typegoose/typegoose";

const pingInterval = +process.env.DOOR_PING_INTERVAL || 10000;

export default function handleCreateServer(io: SocketIoServer) {
  return async (socket: Socket) => {
    const client: { store: DocumentType<IStore>; connectedAt: Date } = {
      store: null,
      connectedAt: new Date()
    };
    console.log(
      `[SYS] Socket connect from: ${socket.remoteAddress}:${socket.remotePort} at ${client.connectedAt}.`
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
      console.log(
        `[SYS] Socket disconnect from ${socket.remoteAddress}:${socket.remotePort}, was connected at ${client.connectedAt}`
      );
    });

    socket.on("error", async function (err) {
      console.error(`[DEBUG] Socket error:`, err.message);
      socket.destroy(err);
    });

    // When socket timeout.
    socket.on("timeout", function () {
      if (client.store) return;
      console.log(
        `[SOK] Daemon not declaring store identity, timeout ${socket.remoteAddress}:${socket.remotePort}.`
      );
      socket.destroy(new Error("store_unidentified"));
    });
  };
}
