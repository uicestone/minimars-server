import cors from "cors";
import methodOverride from "method-override";
import Agendash from "agendash2";
import cookieSession from "cookie-session";
import authenticate from "../middlewares/authenticate";
import castEmbedded from "../middlewares/castEmbedded";
import AuthRouter from "./AuthRouter";
import BookingRouter from "./BookingRouter";
import CardTypeRouter from "./CardTypeRouter";
import CouponRouter from "./CouponRouter";
import ConfigRouter from "./ConfigRouter";
import EventRouter from "./EventRouter";
import FileRouter from "./FileRouter";
import GiftRouter from "./GiftRouter";
import PaymentRouter from "./PaymentRouter";
import PostRouter from "./PostRouter";
import StatsRouter from "./StatsRouter";
import StoreRouter from "./StoreRouter";
import UserRouter from "./UserRouter";
import WechatRouter from "./WechatRouter";
import CardRouter from "./CardRouter";
import detectUa from "../middlewares/detectUa";
import agenda from "../utils/agenda";
import { NextFunction, Request, Response, Router } from "express";
import VisoRouter from "./VisoRouter";

export default (app, router: Router) => {
  // register routes
  [
    AuthRouter,
    BookingRouter,
    CardRouter,
    CardTypeRouter,
    CouponRouter,
    ConfigRouter,
    EventRouter,
    FileRouter,
    GiftRouter,
    PaymentRouter,
    PostRouter,
    StatsRouter,
    StoreRouter,
    UserRouter,
    VisoRouter,
    WechatRouter
  ].forEach(R => {
    router = R(router);
  });

  app.use(
    "/api",
    cors({
      exposedHeaders: [
        "content-range",
        "accept-range",
        "items-total",
        "items-start",
        "items-end",
        "total-amount"
      ]
    }),
    methodOverride(),
    authenticate,
    castEmbedded,
    detectUa,
    router
  );

  app.use(
    "/agendash",
    cookieSession({
      name: "session",
      keys: [process.env.APP_SECRET],

      // Cookie Options
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }),
    authenticate,
    function (req: Request, res: Response, next: NextFunction) {
      if (req.session?.userRole === "admin") {
        next();
      } else if (req.user?.role === "admin") {
        next();
        req.session = { userId: req.user.id, userRole: req.user.role };
      } else {
        res.sendStatus(401);
      }
    },
    Agendash(agenda)
  );
};
