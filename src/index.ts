import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
// import SocketIo from "socket.io";
import http from "http";
import ensureEnv from "./utils/ensureEnv";

ensureEnv();

import handleError from "./utils/handleError";
import applyRoutes from "./apis";
import agenda from "./utils/agenda";
import { config } from "./models/Config";
import initConfig from "./utils/initConfig";

const app = express();
const router = express.Router();
const httpServer = http.createServer(app);
// const io = SocketIo(httpServer);

const mongooseUrl: string = process.env.MONGODB_URL || process.exit();
const portHttp: string = process.env.PORT_HTTP || process.exit();

console.log(`[SYS] System time is ${new Date()}`);

mongoose.connect(mongooseUrl, {
  useNewUrlParser: true,
  useFindAndModify: false,
  useCreateIndex: true,
  keepAlive: true
});

mongoose.Promise = global.Promise;

app.use(bodyParser.json({ limit: "100mb" }));
app.use(bodyParser.raw({ type: "text/xml" }));
app.use("/uploads/", express.static(`${__dirname}/../uploads`));

app.set("trust proxy", "loopback");
applyRoutes(app, router);

app.use(handleError);

httpServer.listen(portHttp, () => {
  console.log(`[SYS] HTTP server listening port: ${portHttp}.`);
});

(async () => {
  await initConfig(config);
})();

agenda.start();
