/// <reference types="../../node_modules/@types/express" />
/// <reference types="./types/express-request-response" />

import express from "express";
import bodyParser from "body-parser";
import SocketIo from "socket.io";
import http from "http";
import net from "net";
import { Server as WebSocketServer } from "ws";
import ensureEnv from "./utils/ensureEnv";

ensureEnv();

import handleError from "./utils/handleError";
import handleCreateServer from "./socket/handleCreateServer";
import applyRoutes from "./apis";
import { initAgenda } from "./utils/agenda";
import { config } from "./models/Config";
import initConfig from "./utils/initConfig";
import { initMongoose } from "./utils/mongoose";
import playground from "./utils/playground";
import initViso from "./utils/initViso";

const app = express();
const router = express.Router();
const httpServer = http.createServer(app);
const io = SocketIo(httpServer);
const socketServer = net.createServer(handleCreateServer(io));

const portHttp: string = process.env.PORT_HTTP;
const portSocket: string = process.env.PORT_SOCKET;
const portWebSocket: string = process.env.PORT_WEBSOCKET;

console.log(`[SYS] System time is ${new Date()}`);

initMongoose();
initConfig(config);
initAgenda();

app.use(bodyParser.json({ limit: "100mb" }));
app.use(bodyParser.raw({ type: "text/xml" }));
app.use("/uploads/", express.static(`${process.cwd()}/uploads`));

app.set("trust proxy", "loopback");
applyRoutes(app, router);

app.use(handleError);

httpServer.listen(portHttp, () => {
  console.log(`[SYS] HTTP server listening port: ${portHttp}.`);
});

if (portSocket) {
  socketServer.listen(portSocket, () => {
    console.log(`[SYS] Socket server listening port: ${portSocket}.`);
  });
}

let wss: WebSocketServer;

if (portWebSocket) {
  wss = new WebSocketServer({
    port: +portWebSocket
  });
  wss.on("listening", () => {
    console.log(`[SYS] Websocket server listening port: ${portWebSocket}.`);
  });
  initViso(wss);
}

if (process.env.PLAYGROUND) {
  setTimeout(() => {
    playground({ wss });
  }, 1e3);
}
