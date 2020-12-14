import cors from "cors";
import methodOverride from "method-override";
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

export default (app, router) => {
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
    WechatRouter
  ].forEach(R => {
    router = R(router);
  });

  router.get("/", (req, res) => {
    res.send("Welcome!");
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
};
