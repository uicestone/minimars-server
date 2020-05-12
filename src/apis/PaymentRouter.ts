import moment from "moment";
import xlsx from "xlsx";
import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import Payment, {
  gatewayNames,
  PaymentGateway,
  receptionGateways
} from "../models/Payment";
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

        if (req.user.role === "manager") {
          query.find({ store: req.user.store.id });
        }

        if (queryParams.date) {
          const start = moment(queryParams.date).startOf("day");
          const end = moment(queryParams.dateEnd || queryParams.date).endOf(
            "day"
          );
          query.find({ createdAt: { $gte: start, $lte: end } });
        }

        if (queryParams.paid) {
          if (queryParams.paid === "false") {
            query.find({ paid: false });
          } else {
            query.find({ paid: true });
          }
        }

        if (queryParams.attach) {
          query.find({ attach: new RegExp("^" + queryParams.attach) });
        }

        if (queryParams.gateway) {
          const gateways = queryParams.gateway.includes(",")
            ? (queryParams.gateway.split(",") as PaymentGateway[])
            : (queryParams.gateway as PaymentGateway);
          query.find({
            gateway: {
              $in: Array.isArray(gateways) ? gateways : [gateways]
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

        ["store", "customer", "amount"].forEach(field => {
          if (queryParams[field]) {
            query.find({ [field]: queryParams[field] });
          }
        });

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

  router.route("/payment-sheet").get(
    handleAsyncErrors(async (req, res) => {
      if (!["admin", "accountant", "manager"].includes(req.user.role)) {
        throw new HttpError(403);
      }
      const queryParams = req.query as PaymentQuery;
      const query = Payment.find().sort({ _id: -1 });

      if (req.user.role === "manager") {
        query.find({ store: req.user.store.id });
      }

      if (queryParams.date) {
        const start = moment(queryParams.date).startOf("day");
        const end = moment(queryParams.dateEnd || queryParams.date).endOf(
          "day"
        );
        query.find({ createdAt: { $gte: start, $lte: end } });
      }

      if (queryParams.paid) {
        if (queryParams.paid === "false") {
          query.find({ paid: false });
        } else {
          query.find({ paid: true });
        }
      }

      if (queryParams.attach) {
        query.find({ attach: new RegExp("^" + queryParams.attach) });
      }

      if (queryParams.gateway) {
        const gateways = queryParams.gateway.includes(",")
          ? (queryParams.gateway.split(",") as PaymentGateway[])
          : (queryParams.gateway as PaymentGateway);
        query.find({
          gateway: {
            $in: Array.isArray(gateways) ? gateways : [gateways]
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

      ["store", "customer", "amount"].forEach(field => {
        if (queryParams[field]) {
          query.find({ [field]: queryParams[field] });
        }
      });

      const payments = await query.find().limit(5e3).exec();

      /* original data */
      const filename = "流水明细.xlsx";
      const path = "/tmp/" + filename;
      const data: any[][] = [
        ["手机", "已支付", "金额", "明细", "支付方式", "时间"]
      ];

      payments.forEach(payment => {
        const row = [
          payment.customer.mobile,
          payment.paid,
          payment.amountDeposit || payment.amount,
          payment.title,
          gatewayNames[payment.gateway],
          moment((payment as any).createdAt).format("YYYY-MM-DD HH:mm")
        ];
        data.push(row);
      });

      const ws_name = filename.replace(/\.xlsx$/, "");
      const wb = xlsx.utils.book_new(),
        ws = xlsx.utils.aoa_to_sheet(data);

      /* add worksheet to workbook */
      xlsx.utils.book_append_sheet(wb, ws, ws_name);

      /* write workbook */
      xlsx.writeFile(wb, path);
      res.download(path, filename);
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
        const payment = req.item;
        const body = req.body as PaymentPutBody;
        let set: PaymentPutBody = {};

        if (
          (req.user.role =
            "manager" && receptionGateways.includes(payment.gateway))
        ) {
          ["paid", "gateway"].forEach(key => {
            if (body[key] !== undefined) {
              set[key] = body[key];
            }
          });
        } else if (req.user.role === "admin") {
          set = body;
        } else {
          throw new HttpError(403);
        }
        payment.set(set);
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
