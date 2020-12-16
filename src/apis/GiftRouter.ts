import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import Gift, { Gift as IGift } from "../models/Gift";
import { GiftQuery, GiftPostBody, GiftPutBody } from "./interfaces";
import Booking from "../models/Booking";
import { DocumentType } from "@typegoose/typegoose";
import escapeStringRegexp from "escape-string-regexp";

export default router => {
  // Gift CURD
  router
    .route("/gift")

    // create a gift
    .post(
      handleAsyncErrors(async (req, res) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const gift = new Gift(req.body as GiftPostBody);
        if (!gift.price && !gift.priceInPoints) {
          throw new HttpError(400, "积分和收款售价必须至少设置一项");
        }
        await gift.save();
        res.json(gift);
      })
    )

    // get all the gifts
    .get(
      paginatify,
      handleAsyncErrors(async (req, res) => {
        const queryParams = req.query as GiftQuery;
        const { limit, skip } = req.pagination;
        const query = Gift.find().populate("customer");
        const sort = parseSortString(queryParams.order) || {
          order: -1
        };
        query.select("-content");

        if (req.user.role === "manager") {
          query.find({ $or: [{ store: req.user.store.id }, { store: null }] });
        }

        if (req.user.role === "customer") {
          query.find({ order: { $gte: 0 } });
        }

        if (queryParams.keyword) {
          query.find({
            title: new RegExp(escapeStringRegexp(queryParams.keyword), "i")
          });
        }

        ["store"].forEach(field => {
          if (queryParams[field]) {
            query.find({ [field]: queryParams[field] });
          }
        });

        let total = await query.countDocuments();
        const page = await query
          .find()
          .sort(sort)
          .limit(limit)
          .skip(skip)
          .exec();

        if (skip + page.length > total) {
          total = skip + page.length;
        }

        res.paginatify(limit, skip, total).json(page);
      })
    );

  router
    .route("/gift/:giftId")

    .all(
      handleAsyncErrors(async (req, res, next) => {
        const gift = await Gift.findById(req.params.giftId);
        if (!gift) {
          throw new HttpError(404, `Gift not found: ${req.params.giftId}`);
        }
        req.item = gift;
        next();
      })
    )

    // get the gift with that id
    .get(
      handleAsyncErrors(async (req, res) => {
        const gift = req.item;
        res.json(gift);
      })
    )

    .put(
      handleAsyncErrors(async (req, res) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const gift = req.item;
        gift.set(req.body as GiftPutBody);
        await gift.save();
        res.json(gift);
      })
    )

    // delete the gift with this id
    .delete(
      handleAsyncErrors(async (req, res) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const gift = req.item as DocumentType<IGift>;
        const bookingCount = await Booking.countDocuments({ gift: gift.id });

        if (bookingCount > 0) {
          throw new HttpError(400, "已经存在兑换记录，不能删除");
        }
        await gift.remove();
        res.end();
      })
    );

  return router;
};
