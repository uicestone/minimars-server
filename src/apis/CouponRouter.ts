import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import Coupon, { Coupon as ICoupon } from "../models/Coupon";
import { CouponQuery, CouponPutBody } from "./interfaces";
import { DocumentType } from "@typegoose/typegoose";
import User from "../models/User";

export default router => {
  // Coupon CURD
  router
    .route("/coupon")

    // create a coupon
    .post(
      handleAsyncErrors(async (req, res) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const coupon = new Coupon(req.body);
        await coupon.save();
        res.json(coupon);
      })
    )

    // get all the coupons
    .get(
      paginatify,
      handleAsyncErrors(async (req, res) => {
        const queryParams = req.query as CouponQuery;
        const { limit, skip } = req.pagination;
        const query = Coupon.find().populate("customer");
        const sort = parseSortString(queryParams.order) || {
          createdAt: -1
        };

        query.select("-content");

        if (req.user.role === "manager") {
          if (!req.user.store) {
            req.user = await User.findById(req.user.id);
          }
          query.find({ store: { $in: [req.user.store.id, null] } });
          query.find({ enabled: true });
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
    .route("/coupon/:couponId")

    .all(
      handleAsyncErrors(async (req, res, next) => {
        const coupon = await Coupon.findById(req.params.couponId);
        if (!coupon) {
          throw new HttpError(404, `Coupon not found: ${req.params.couponId}`);
        }
        req.item = coupon;
        next();
      })
    )

    // get the coupon with that id
    .get(
      handleAsyncErrors(async (req, res) => {
        const coupon = req.item;
        res.json(coupon);
      })
    )

    .put(
      handleAsyncErrors(async (req, res) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const coupon = req.item as DocumentType<ICoupon>;
        const body = req.body as CouponPutBody;
        coupon.set(body);
        await coupon.save();
        res.json(coupon);
      })
    )

    // delete the coupon with this id
    .delete(
      handleAsyncErrors(async (req, res) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const coupon = req.item;
        await coupon.remove();
        res.end();
      })
    );

  return router;
};
