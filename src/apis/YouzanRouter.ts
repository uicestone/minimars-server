import { Router, Request, Response } from "express";
import CardTypeModel from "../models/CardType";
import UserModel from "../models/User";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import HttpError from "../utils/HttpError";
import {
  handleAuthMobile,
  handleTradeClose,
  handleTradePaid,
  verifyPush
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
        console.log("[YZN] Push", eventType, JSON.stringify(req.body));
        if (!verifyPush(eventSign, JSON.stringify(req.body))) {
          throw new HttpError(400);
        }
        switch (eventType) {
          case "trade_TradePaid": {
            const message = JSON.parse(decodeURIComponent(req.body.msg));
            await handleTradePaid(message);
            break;
          }
          case "trade_TradePaid": {
            break;
          }
          case "trade_TradeSuccess": {
            const message = JSON.parse(decodeURIComponent(req.body.msg)) as any;
            console.log(`[YZN] Trade success:`, message.tid);
            break;
          }
          case "trade_TradeClose": {
            const message = JSON.parse(decodeURIComponent(req.body.msg)) as any;
            handleTradeClose(message);
            break;
          }
          case "OPEN_PUSH_SCRM_CUSTOMER_AUTH_MOBILE": {
            await handleAuthMobile(req.body);
            break;
          }
        }
        res.json({ code: 0, msg: "success" });
      })
    );

  return router;
};
