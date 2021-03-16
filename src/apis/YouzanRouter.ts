import { Router, Request, Response } from "express";
import CardTypeModel from "../models/CardType";
import UserModel from "../models/User";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import HttpError from "../utils/HttpError";
import { verifyPush, virtualCodeApply } from "../utils/youzan";

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
          console.log(message);
          const mobile = message.full_order_info.buyer_info.buyer_phone;
          let user = await UserModel.findOne({ mobile });
          if (!user) {
            user = new UserModel({ mobile });
            await user.save();
          }
          const slugNums = message.full_order_info.orders.map((order: any) => [
            order.outer_item_id,
            order.num,
            JSON.parse(order.sku_properties_name).map((p: any) => p.v)
          ]);
          for (const [slug, num, storeNames] of slugNums) {
            console.log(
              `[YZN] Try create card ${slug}×${num}@${storeNames.join(
                ","
              )} for user ${user.mobile} ${user.id}.`
            );
            const cardType = await CardTypeModel.findOne({ slug });
            if (!cardType) continue;
            for (let n = 0; n < num; n++) {
              const card = cardType.issue(user);
              await card.save();
              // TODO, payment, store, cancel
              console.log(
                `[YZN] Auto created card ${slug} ${card.title} ${card.id} for user ${user.mobile} ${user.id}.`
              );
            }
          }
          if (message.full_order_info.order_info.order_tags.is_virtual) {
            await virtualCodeApply(message.full_order_info.order_info.tid);
          }
          console.log(
            "[YZN] Code applied:",
            message.full_order_info.order_info.tid
          );
        }
        if (eventType === "trade_TradeSuccess") {
          const message = JSON.parse(decodeURIComponent(req.body.msg)) as any;
          console.log(`[YZN] Trade success:`, message.tid);
        }
        res.json({ code: 0, msg: "success" });
      })
    );

  return router;
};
