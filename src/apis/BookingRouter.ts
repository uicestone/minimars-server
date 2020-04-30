import moment from "moment";
import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import Booking, {
  Booking as IBooking,
  BookingStatus,
  BookingType
} from "../models/Booking";
import User from "../models/User";
import Store from "../models/Store";
import EscPosEncoder from "esc-pos-encoder-canvas";
import { Image } from "canvas";
import Payment, { gatewayNames, PaymentGateway } from "../models/Payment";
import { config } from "../models/Config";
import stringWidth from "string-width";
import {
  BookingPostBody,
  BookingPostQuery,
  BookingPutBody,
  BookingQuery,
  BookingPricePostBody,
  BookingPriceResponseBody
} from "./interfaces";
import { DocumentType } from "@typegoose/typegoose";

setTimeout(async () => {
  // const u = await User.findOne({ name: "陆秋石" });
  // const s = await Store.findOne();
  // const b = new Booking({
  //   customer: u,
  //   store: s,
  //   checkInAt: moment().format("HH:mm:ss"),
  //   date: "2020-03-28",
  //   type: "play"
  // });
  // const p = new Payment({
  //   customer: u,
  //   amount: 999,
  //   gateway: PaymentGateway.Cash
  // });
  // await p.save();
  // b.payments.push(p);
  // b.save();
}, 500);

export default router => {
  // Booking CURD
  router
    .route("/booking")

    // create a booking
    .post(
      handleAsyncErrors(async (req, res) => {
        const body = req.body as BookingPostBody;
        const query = req.query as BookingPostQuery;

        if (body.status && req.user.role !== "admin") {
          delete body.status;
          // throw new HttpError(403, "Only admin can set status directly.");
        }

        const booking = new Booking(body);

        if (!booking.customer) {
          if (req.user.role === "customer") {
            booking.customer = req.user._id;
          } else if (
            query.customerKeyword &&
            ["admin", "manager"].includes(req.user.role)
          ) {
            booking.customer = new User({
              role: "customer",
              mobile: query.customerKeyword
            });
            await booking.customer.validate();
          }
        }

        if (!booking.populated("customer")) {
          await booking.populate("customer").execPopulate();
        }

        console.log(
          `Create booking for customer ${booking.customer.mobile} ${booking.customer.id}`
        );

        if (!booking.customer) {
          throw new HttpError(400, "客户信息错误");
        }

        await booking.populate("store").execPopulate();

        if (!booking.store || !booking.store.name) {
          throw new HttpError(400, "门店信息错误");
        }

        if (!booking.date) {
          booking.date = moment().format("YYYY-MM-DD");
        }

        if (!booking.checkInAt) {
          booking.checkInAt = moment().add(5, "minutes").format("HH:mm:ss");
        }

        if (
          req.user.role === "customer" &&
          !booking.customer.equals(req.user)
        ) {
          throw new HttpError(403, "只能为自己预订");
        }

        if (body.adultsCount === 0 && body.kidsCount === 0) {
          throw new HttpError(400, "成人和儿童数不能都为0");
        }

        if (body.type === BookingType.EVENT) {
          if (!booking.populated("event")) {
            await booking
              .populate({ path: "event", select: "-content" })
              .execPopulate();
          }
          if (!booking.event) {
            throw new HttpError(400, "活动信息错误");
          }
          if (
            booking.event.kidsCountLeft &&
            booking.event.kidsCountLeft < body.kidsCount
          ) {
            throw new HttpError(400, "活动儿童人数名额不足");
          }
        }

        if (body.type === BookingType.GIFT) {
          if (!booking.populated("gift")) {
            await booking.populate("gift").execPopulate();
          }
          if (!booking.gift) {
            throw new HttpError(400, "礼品信息错误");
          }
          if (booking.gift.quantity && booking.gift.quantity < body.quantity) {
            throw new HttpError(400, "礼品库存不足");
          }
        }

        if (booking.type === BookingType.FOOD && !booking.price) {
          throw new HttpError(400, "请填写收款金额");
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

        if (booking.customer.isNew) {
          await booking.customer.save();
        }

        try {
          await booking.createPayment({
            paymentGateway:
              query.paymentGateway ||
              (req.ua.isWechat ? PaymentGateway.WechatPay : undefined),
            useBalance: query.useBalance !== "false",
            adminAddWithoutPayment:
              req.user.role === "admin" && query.adminAddWithoutPayment
          });
        } catch (err) {
          switch (err.message) {
            case "no_customer_openid":
              throw new HttpError(400, "缺少客户openid");
            case "insufficient_balance":
              throw new HttpError(400, "客户账户余额不足");
            case "insufficient_points":
              throw new HttpError(400, "客户账户积分不足");
            case "insufficient_card_times":
              throw new HttpError(400, "次卡剩余次数不足");
            case "missing_gateway":
              throw new HttpError(400, "未选择支付方式");
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
        const queryParams = req.query as BookingQuery;
        const { limit, skip } = req.pagination;
        const query = Booking.find();
        const sort = parseSortString(queryParams.order) || {
          createdAt: -1
        };

        // restrict self bookings for customers
        if (req.user.role === "customer") {
          query.find({ customer: req.user._id });
        }

        if (req.user.role === "manager") {
          query.find({ store: req.user.store.id });
        }

        [
          "type",
          "store",
          "date",
          "customer",
          "event",
          "gift",
          "coupon"
        ].forEach(field => {
          if (queryParams[field]) {
            query.find({ [field]: queryParams[field] });
          }
        });

        if (queryParams.status) {
          query.find({
            status: {
              $in: queryParams.status.split(",") as BookingStatus[]
            }
          });
        }

        if (queryParams.customerKeyword) {
          const matchCustomers = await User.find({
            $text: { $search: queryParams.customerKeyword }
          });
          query.find({ customer: { $in: matchCustomers } });
        }

        if (queryParams.paymentType) {
          switch (queryParams.paymentType) {
            case "guest":
              query.find({ coupon: null, card: null });
              break;
            case "coupon":
              query.find({ coupon: { $ne: null } });
              break;
            case "card":
              query.find({ card: { $ne: null } });
              break;
          }
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
        const booking = req.item as DocumentType<IBooking>;

        // TODO restrict for roles

        const statusWas = booking.status;

        booking.set(req.body as BookingPutBody);

        await booking.populate("customer").execPopulate();
        await booking.populate("store").execPopulate();

        if (
          booking.status === BookingStatus.CANCELED &&
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

        const booking = req.item as DocumentType<IBooking>;

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

      if (booking.type === BookingType.PLAY && !booking.coupon) {
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
        const coupon = booking.coupon;
        if (coupon) {
          encoder.line(
            coupon.title +
              " ".repeat(
                Math.max(
                  0,
                  31 -
                    stringWidth(coupon.title) -
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

      const balancePayment = booking.payments.filter(
        p => p.gateway === "balance" && p.paid
      )[0];
      if (balancePayment) {
        encoder.line(
          " ".repeat(3) +
            `余额支付：￥${balancePayment.amount.toFixed(2)}` +
            " ".repeat(4)
        );
      }

      const extraPayment = booking.payments.filter(
        p => p.gateway !== "balance" && p.paid
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
      const booking = new Booking(req.body as BookingPricePostBody);

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
        booking.checkInAt = moment().add(5, "minutes").format("HH:mm:ss");
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

      const result = {
        price: booking.price,
        priceInPoints: booking.priceInPoints || undefined
      } as BookingPriceResponseBody;

      res.json(result);
    })
  );

  return router;
};
