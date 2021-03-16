import { Router, Request, Response, NextFunction } from "express";
import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import BookingModel from "../models/Booking";
import GiftModel, { Gift } from "../models/Gift";
import { GiftQuery, GiftPostBody, GiftPutBody } from "./interfaces";
import { DocumentType } from "@typegoose/typegoose";
import escapeStringRegexp from "escape-string-regexp";
import { Permission } from "../models/Role";

export default (router: Router) => {
  // Gift CURD
  router
    .route("/gift")

    // create a gift
    .post(
      handleAsyncErrors(async (req: Request, res: Response) => {
        if (!req.user.can(Permission.GIFT)) {
          throw new HttpError(403);
        }
        const gift = new GiftModel(req.body as GiftPostBody);
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
      handleAsyncErrors(async (req: Request, res: Response) => {
        const queryParams = req.query as GiftQuery;
        const { limit, skip } = req.pagination;
        const query = GiftModel.find().populate("customer");
        const sort = parseSortString(queryParams.order) || {
          order: -1
        };
        query.select("-content");

        if (!req.user.can(Permission.BOOKING_ALL_STORE)) {
          query.find({ $or: [{ store: req.user.store?.id }, { store: null }] });
        }

        if (!req.user.role) {
          query.find({ order: { $gte: 0 } });
        }

        if (queryParams.keyword) {
          query.find({
            title: new RegExp(escapeStringRegexp(queryParams.keyword), "i")
          });
        }

        (["store"] as Array<keyof GiftQuery>).forEach(field => {
          if (queryParams[field]) {
            query.find({ [field]: queryParams[field] });
          }
        });

        if (queryParams.isCover) {
          query.where({ isProfileCover: true });
        }

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
      handleAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
          const gift = await GiftModel.findById(req.params.giftId);
          if (!gift) {
            throw new HttpError(404, `Gift not found: ${req.params.giftId}`);
          }
          req.item = gift;
          next();
        }
      )
    )

    // get the gift with that id
    .get(
      handleAsyncErrors(async (req: Request, res: Response) => {
        const gift = req.item;
        res.json(gift);
      })
    )

    .put(
      handleAsyncErrors(async (req: Request, res: Response) => {
        if (!req.user.can(Permission.COUPON)) {
          throw new HttpError(403);
        }
        const gift = req.item as DocumentType<Gift>;
        gift.set(req.body as GiftPutBody);
        await gift.save();
        res.json(gift);
      })
    )

    // delete the gift with this id
    .delete(
      handleAsyncErrors(async (req: Request, res: Response) => {
        if (!req.user.can(Permission.COUPON)) {
          throw new HttpError(403);
        }
        const gift = req.item as DocumentType<Gift>;
        const bookingCount = await BookingModel.countDocuments({
          gift: gift.id
        });

        if (bookingCount > 0) {
          throw new HttpError(400, "已经存在兑换记录，不能删除");
        }
        await gift.remove();
        res.end();
      })
    );

  return router;
};
