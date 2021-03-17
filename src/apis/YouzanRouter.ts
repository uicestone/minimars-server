import { Router, Request, Response } from "express";
import CardTypeModel from "../models/CardType";
import UserModel from "../models/User";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import HttpError from "../utils/HttpError";
import {
  handleAuthMobile,
  handleTradePaid,
  syncUserPoints,
  verifyPush,
  virtualCodeApply
} from "../utils/youzan";

export default (router: Router) => {
  router
    .route("/youzan")
    .get(
      handleAsyncErrors(async (req: Request, res: Response) => {
        res.json("Welcome!");
      })
    )
    .post(
      handleAsyncErrors(async (req: Request, res: Response) => {
        const eventSign = req.header("event-sign") || "";
        const eventType = req.header("event-type") || "";
        console.log("[YZN] Push", eventType, req.body);
        if (!verifyPush(eventSign, JSON.stringify(req.body))) {
          throw new HttpError(400);
        }
        if (eventType === "trade_TradePaid") {
          const message = JSON.parse(decodeURIComponent(req.body.msg));
          await handleTradePaid(message);
        } else if (eventType === "trade_TradeSuccess") {
          const message = JSON.parse(decodeURIComponent(req.body.msg)) as any;
          console.log(`[YZN] Trade success:`, message.tid);
        } else if (eventType === "OPEN_PUSH_SCRM_CUSTOMER_AUTH_MOBILE") {
          await handleAuthMobile(req.body);
        }
        res.json({ code: 0, msg: "success" });
      })
    );

  return router;
};
