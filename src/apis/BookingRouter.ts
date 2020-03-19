import moment from "moment";
import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import Booking, { IBooking, BookingStatuses } from "../models/Booking";
import User from "../models/User";
import Store from "../models/Store";
import EscPosEncoder from "esc-pos-encoder-canvas";
import { Image } from "canvas";
import Payment, { gatewayNames } from "../models/Payment";
import { config } from "../models/Config";
import stringWidth from "string-width";

setTimeout(async () => {
  // const u = await User.findOne({ name: "测试用户2" });
  // u.depositSuccess("deposit-1000");
}, 500);

export default router => {
  // Booking CURD
  router
    .route("/booking")

    // create a booking
    .post(
      handleAsyncErrors(async (req, res) => {
        if (req.body.status && req.user.role !== "admin") {
          throw new HttpError(403, "Only admin can set status directly.");
        }

        const booking = new Booking(req.body);

        if (!booking.customer) {
          booking.customer = req.user;
        }
        await booking.populate("customer").execPopulate();

        if (!booking.customer) {
          throw new HttpError(401, "客户信息错误");
        }

        if (!booking.store) {
          booking.store = await Store.findOne();
          // TODO booking default store should be disabled
        }
        await booking.populate("store").execPopulate();

        if (!booking.store || !booking.store.name) {
          throw new HttpError(400, "门店信息错误");
        }

        if (!booking.date) {
          booking.date = moment().format("YYYY-MM-DD");
        }

        if (!booking.checkInAt) {
          booking.checkInAt = moment()
            .add(5, "minutes")
            .format("HH:mm:ss");
        }

        if (
          req.user.role === "customer" &&
          !booking.customer.equals(req.user)
        ) {
          throw new HttpError(403, "只能为自己预订");
        }

        if (req.body.adultsCount === 0 && req.body.kidsCount === 0) {
          throw new HttpError(400, "成人和儿童数不能都为0");
        }

        try {
          await booking.calculatePrice();
        } catch (err) {
          switch (err.message) {
            case "coupon_not_found":
              throw new HttpError(400, "优惠不存在");
            default:
              throw err;
          }
        }

        try {
          await booking.createPayment({
            paymentGateway: req.query.paymentGateway,
            useCredit: req.query.useCredit !== "false",
            adminAddWithoutPayment: req.user.role === "admin"
          });
        } catch (err) {
          switch (err.message) {
            case "no_customer_openid":
              throw new HttpError(400, "Customer openid is missing.");
            case "insufficient_credit":
              throw new HttpError(400, "Customer credit is insufficient.");
            default:
              throw err;
          }
        }

        await booking.save();

        res.json(booking);
      })
    )

    // get all the bookings
    .get(
      paginatify,
      handleAsyncErrors(async (req, res) => {
        const { limit, skip } = req.pagination;
        const query = Booking.find();
        const sort = parseSortString(req.query.order) || {
          createdAt: -1
        };

        const $and = []; // combine all $or conditions into one $and

        // restrict self bookings for customers
        if (req.user.role === "customer") {
          query.find({ customer: req.user._id });
        }

        ["type", "store", "date", "customer"].forEach(field => {
          if (req.query[field]) {
            query.find({ [field]: req.query[field] });
          }
        });

        if (req.query.status) {
          query.find({
            status: {
              $in: req.query.status.split(",").map(s => s.toUpperCase())
            }
          });
        }

        if (req.query.customerKeyword) {
          const matchCustomers = await User.find({
            $or: [
              { name: new RegExp(req.query.customerKeyword, "i") },
              { mobile: new RegExp(req.query.customerKeyword) },
              { cardNo: new RegExp(req.query.customerKeyword) }
            ]
          });
          query.find({ customer: { $in: matchCustomers } });
        }

        if (req.query.coupon) {
          query.find({ coupon: new RegExp(req.query.coupon) });
        }

        // restrict self store bookings for managers
        // TODO

        if ($and.length) {
          query.find({ $and });
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
    .route("/booking/:bookingId")

    .all(
      handleAsyncErrors(async (req, res, next) => {
        const booking = await Booking.findOne({ _id: req.params.bookingId });
        if (req.user.role === "customer") {
          if (!booking.customer.equals(req.user)) {
            throw new HttpError(403);
          }
        }
        if (!booking) {
          throw new HttpError(
            404,
            `Booking not found: ${req.params.bookingId}`
          );
        }
        req.item = booking;
        next();
      })
    )

    // get the booking with that id
    .get(
      handleAsyncErrors(async (req, res) => {
        const booking = req.item;
        res.json(booking);
      })
    )

    .put(
      handleAsyncErrors(async (req, res) => {
        const booking = req.item as IBooking;

        // TODO restrict for roles

        const statusWas = booking.status;

        booking.set(req.body);

        await booking.populate("customer").execPopulate();
        await booking.populate("store").execPopulate();

        if (
          booking.status === BookingStatuses.CANCELED &&
          req.user.role !== "admin"
        ) {
          // TODO refund permission should be restricted
          // TODO IN_SERVICE refund

          try {
            booking.status = statusWas;
            await booking.cancel(false);
          } catch (err) {
            switch (err.message) {
              case "uncancelable_booking_status":
                throw new HttpError(
                  403,
                  "服务状态无法取消，只有待付款/已确认状态才能取消"
                );
              default:
                throw err;
            }
          }
        }

        await booking.save();
        // sendConfirmEmail(booking);
        res.json(booking);
      })
    )

    // delete the booking with this id
    .delete(
      handleAsyncErrors(async (req, res) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }

        const booking = req.item as IBooking;

        if (booking.payments.some(p => p.paid)) {
          throw new HttpError(403, "已有成功付款记录，无法删除");
        }

        await Payment.deleteOne({
          _id: { $in: booking.payments.map(p => p.id) }
        });
        await booking.remove();
        res.end();
      })
    );

  router.route("/booking/:bookingId/receipt-data").get(
    handleAsyncErrors(async (req, res) => {
      if (!["manager", "admin"].includes(req.user.role)) {
        throw new HttpError(403, "只有店员可以打印小票");
      }

      const receiptLogo = new Image();

      await new Promise((resolve, reject) => {
        receiptLogo.onload = () => {
          resolve();
        };
        receiptLogo.onerror = err => {
          reject(err);
        };
        receiptLogo.src = __dirname + "/../resource/images/logo-greyscale.png";
      });

      const booking = await Booking.findOne({ _id: req.params.bookingId });

      let encoder = new EscPosEncoder();
      encoder
        .initialize()
        .codepage("cp936")
        .align("center")
        .image(receiptLogo, 384, 152, "threshold")
        .newline()
        .align("left")
        .line("手机尾号：" + booking.customer.mobile.substr(-4))
        .line("会员卡号：" + (booking.customer.cardNo || "无"))
        .line("打印时间：" + moment().format("YYYY-MM-DD HH:mm:ss"))
        .line("入场人数：" + booking.adultsCount + booking.kidsCount);

      const counter = await User.findOne({ _id: req.user.id });

      encoder
        .line(`收银台号：${counter.name}`)
        .newline()
        .line("付款明细：")
        .line("-".repeat(31))
        .newline()
        .line(
          " ".repeat(3) +
            "类型" +
            " ".repeat(7) +
            "数量" +
            " ".repeat(7) +
            "金额" +
            " ".repeat(2)
        );

      if (booking.type === "play" && !booking.coupon) {
        encoder.line(
          "自由游玩" +
            " ".repeat(2) +
            `${booking.adultsCount}额外成人 畅玩` +
            " ".repeat(4) +
            `￥${(config.extraParentFullDayPrice * booking.adultsCount).toFixed(
              2
            )}`
        );
        if (booking.kidsCount) {
          encoder.line(
            "自由游玩" +
              " ".repeat(2) +
              `${booking.kidsCount}儿童 畅玩` +
              " ".repeat(4) +
              `￥${(config.kidFullDayPrice * booking.kidsCount).toFixed(2)}`
          );
        }
      }

      if (booking.coupon) {
        const coupon = config.coupons.find(c => c.slug === booking.coupon);
        if (coupon) {
          encoder.line(
            coupon.name +
              " ".repeat(
                Math.max(
                  0,
                  31 -
                    stringWidth(coupon.name) -
                    stringWidth(
                      coupon.price ? `￥${coupon.price.toFixed(2)}` : ""
                    )
                )
              ) +
              (coupon.price ? `￥${coupon.price.toFixed(2)}` : "")
          );
        }
      }

      if (booking.socksCount > 0) {
        encoder.line(
          "袜子" +
            " ".repeat(7) +
            `${booking.socksCount}双` +
            " ".repeat(7) +
            `￥${(config.sockPrice * booking.socksCount).toFixed(2)}`
        );
      }

      encoder
        .newline()
        .line("-".repeat(31))
        .newline()
        .align("right")
        .line(
          " ".repeat(3) + `合计：￥${booking.price.toFixed(2)}` + " ".repeat(4)
        );

      const creditPayment = booking.payments.filter(
        p => p.gateway === "credit" && p.paid
      )[0];
      if (creditPayment) {
        encoder.line(
          " ".repeat(3) +
            `余额支付：￥${creditPayment.amount.toFixed(2)}` +
            " ".repeat(4)
        );
      }

      const extraPayment = booking.payments.filter(
        p => p.gateway !== "credit" && p.paid
      )[0];

      if (extraPayment) {
        encoder.line(
          " ".repeat(3) +
            `${
              gatewayNames[extraPayment.gateway]
            }：￥${extraPayment.amount.toFixed(2)}` +
            " ".repeat(4)
        );
      }
      encoder
        .newline()
        .line("-".repeat(31))
        .align("center")
        .qrcode(
          "https://mp.weixin.qq.com/a/~vcK_feF35uOgreEAXvwxcw~~",
          1,
          8,
          "m"
        )
        .newline()
        .line("扫码使用微信小程序")
        .line("充值预定延时更方便")
        .align("right")
        .newline()
        .newline()
        .newline()
        .newline();

      const hexString = Buffer.from(encoder.encode()).toString("hex");

      res.send(hexString);
    })
  );

  router.route("/booking-price").post(
    handleAsyncErrors(async (req, res) => {
      const booking = new Booking(req.body);

      if (!booking.customer) {
        booking.customer = req.user;
      }
      await booking.populate("customer").execPopulate();

      if (!booking.customer) {
        throw new HttpError(401, "客户信息错误");
      }

      if (!booking.store) {
        booking.store = await Store.findOne();
        // TODO booking default store should be disabled
      }
      await booking.populate("store").execPopulate();

      if (!booking.store || !booking.store.name) {
        throw new HttpError(400, "门店信息错误");
      }

      if (!booking.date) {
        booking.date = moment().format("YYYY-MM-DD");
      }

      if (!booking.checkInAt) {
        booking.checkInAt = moment()
          .add(5, "minutes")
          .format("HH:mm:ss");
      }

      try {
        await booking.calculatePrice();
      } catch (err) {
        switch (err.message) {
          case "coupon_not_found":
            throw new HttpError(400, "优惠不存在");
          default:
            throw err;
        }
      }

      res.json({ price: booking.price });
    })
  );

  return router;
};
