import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import Payment from "../models/Payment";
import moment from "moment";
import { PaymentQuery, PaymentPutBody } from "./interfaces";

export default router => {
  // Payment CURD
  router
    .route("/payment")

    // get all the payments
    .get(
      paginatify,
      handleAsyncErrors(async (req, res) => {
        const queryParams = req.query as PaymentQuery;
        const { limit, skip } = req.pagination;
        const query = Payment.find();
        const sort = parseSortString(queryParams.order) || {
          createdAt: -1
        };

        if (req.user.role === "customer") {
          query.find({ customer: req.user });
        }

        if (queryParams.date) {
          const startOfDay = moment(queryParams.date).startOf("day");
          const endOfDay = moment(queryParams.date).endOf("day");
          query.find({ createdAt: { $gte: startOfDay, $lte: endOfDay } });
        }

        if (queryParams.paid) {
          if (queryParams.paid === "false") {
            query.find({ paid: false });
          } else {
            query.find({ paid: true });
          }
        }

        if (queryParams.customer) {
          query.find({ customer: queryParams.customer });
        }

        if (queryParams.attach) {
          query.find({ attach: new RegExp("^" + queryParams.attach) });
        }

        if (queryParams.gateway) {
          query.find({
            gateway: {
              $in: Array.isArray(queryParams.gateway)
                ? queryParams.gateway
                : [queryParams.gateway]
            }
          });
        }

        if (queryParams.direction === "payment") {
          query.find({
            amount: { $gt: 0 }
          });
        }

        if (queryParams.direction === "refund") {
          query.find({
            amount: { $lt: 0 }
          });
        }

        let total = await query.countDocuments();
        const [{ totalAmount } = { totalAmount: 0 }] = await Payment.aggregate([
          //@ts-ignore
          { $match: query._conditions },
          {
            $group: {
              _id: null,
              totalAmount: {
                $sum: { $cond: ["$amountDeposit", "$amountDeposit", "$amount"] }
              }
            }
          }
        ]);

        const page = await query
          .find()
          .sort(sort)
          .limit(limit)
          .skip(skip)
          .exec();

        if (skip + page.length > total) {
          total = skip + page.length;
        }

        res.set("total-amount", totalAmount.toFixed(2));

        res.paginatify(limit, skip, total).json(page);
      })
    );

  router
    .route("/payment/:paymentId")

    .all(
      handleAsyncErrors(async (req, res, next) => {
        if (!["admin", "manager"].includes(req.user.role)) {
          // TODO shop can only operate payment that is attached to booking in own store
          throw new HttpError(403);
        }
        const payment = await Payment.findById(req.params.paymentId);
        if (!payment) {
          throw new HttpError(
            404,
            `Payment not found: ${req.params.paymentId}`
          );
        }
        req.item = payment;
        next();
      })
    )

    // get the payment with that id
    .get(
      handleAsyncErrors(async (req, res) => {
        const payment = req.item;
        res.json(payment);
      })
    )

    .put(
      handleAsyncErrors(async (req, res) => {
        // TODO should restrict write access for manager
        const payment = req.item;
        payment.set(req.body as PaymentPutBody);
        await payment.save();
        // sendConfirmEmail(payment);
        res.json(payment);
      })
    )

    // delete the payment with this id
    .delete(
      handleAsyncErrors(async (req, res) => {
        const payment = req.item;
        await payment.remove();
        res.end();
      })
    );

  return router;
};
