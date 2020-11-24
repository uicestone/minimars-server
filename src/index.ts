import express from "express";
import bodyParser from "body-parser";
import SocketIo from "socket.io";
import http from "http";
import net from "net";
import ensureEnv from "./utils/ensureEnv";

ensureEnv();

import handleError from "./utils/handleError";
import handleCreateServer from "./socket/handleCreateServer";
import applyRoutes from "./apis";
import { initAgenda } from "./utils/agenda";
import { config } from "./models/Config";
import initConfig from "./utils/initConfig";
import { initMongoose } from "./utils/mongoose";

const app = express();
const router = express.Router();
const httpServer = http.createServer(app);
const io = SocketIo(httpServer);
const socketServer = net.createServer(handleCreateServer(io));

const portHttp: string = process.env.PORT_HTTP;
const portSocket: string = process.env.PORT_SOCKET;

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
