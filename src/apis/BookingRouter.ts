import moment from "moment";
import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import Booking, {
  Booking as IBooking,
  BookingStatus,
  BookingType,
  paidBookingStatus
} from "../models/Booking";
import User from "../models/User";
import Store from "../models/Store";
import Payment, { PaymentGateway } from "../models/Payment";
import { config } from "../models/Config";
import {
  BookingPostBody,
  BookingPostQuery,
  BookingPutBody,
  BookingQuery,
  BookingPricePostBody,
  BookingPriceResponseBody
} from "./interfaces";
import { DocumentType } from "@typegoose/typegoose";
import { isValidHexObjectId, isOffDay } from "../utils/helper";

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
            // create a user with mobile given before create booking
            query.customerKeyword &&
            ["admin", "manager", "eventManager"].includes(req.user.role)
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
          `[BOK] Create booking for customer ${booking.customer.mobile} ${booking.customer.id}.`
        );

        if (!booking.customer) {
          throw new HttpError(400, "客户信息错误");
        }

        await booking.populate("store").execPopulate();

        if (!booking.store || !booking.store.name) {
          if (booking.type !== BookingType.GIFT) {
            throw new HttpError(400, "门店信息错误");
          }
        }

        if (!booking.date) {
          booking.date = moment().format("YYYY-MM-DD");
        }

        if (!booking.checkInAt) {
          booking.checkInAt = config.appointmentDeadline;
        }

        if (
          req.user.role === "customer" &&
          !booking.customer.equals(req.user)
        ) {
          throw new HttpError(403, "只能为自己预订");
        }

        if (booking.type === BookingType.PLAY) {
          if (!booking.kidsCount) {
            booking.kidsCount = 0;
          }
          if (!booking.adultsCount) {
            booking.adultsCount = 0;
          }
          if (booking.card) {
            const otherBookings = await Booking.find({
              card: booking.card,
              status: { $in: paidBookingStatus },
              date: booking.date
            });
            const kidsCountToday =
              booking.kidsCount +
              otherBookings.reduce((c, b) => c + b.kidsCount, 0);
            if (!booking.populated("card")) {
              await booking.populate("card", "-content").execPopulate();
            }
            if (kidsCountToday > booking.card.maxKids) {
              throw new HttpError(400, "客户会员卡当日预约已到达最大孩子数量");
            }
            if (
              booking.card.dayType === "onDaysOnly" &&
              isOffDay(booking.date)
            ) {
              throw new HttpError(400, "该卡只能在法定工作日使用");
            }
            if (
              booking.card.dayType === "offDaysOnly" &&
              !isOffDay(booking.date)
            ) {
              throw new HttpError(400, "该卡只能在法定节假日使用");
            }
          }
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
            booking.event.kidsCountLeft !== undefined &&
            booking.event.kidsCountLeft < body.kidsCount
          ) {
            throw new HttpError(400, "活动儿童人数名额不足");
          }

          if (
            booking.event.date &&
            moment(booking.date).toDate() > booking.event.date
          ) {
            throw new HttpError(400, "活动日期已过，无法预约报名");
          }
        }

        if (body.type === BookingType.GIFT) {
          if (!booking.populated("gift")) {
            await booking.populate("gift").execPopulate();
          }
          if (!booking.gift) {
            throw new HttpError(400, "礼品信息错误");
          }
          if (
            booking.gift.quantity >= 0 &&
            booking.gift.quantity < body.quantity
          ) {
            throw new HttpError(400, "礼品库存不足");
          }
          if (booking.gift.maxQuantityPerCustomer) {
            const historyGiftBookings = await Booking.find({
              type: BookingType.GIFT,
              status: { $in: paidBookingStatus },
              gift: booking.gift,
              customer: booking.customer
            });
            const historyQuantity = historyGiftBookings.reduce(
              (quantity, booking) => quantity + booking.quantity,
              0
            );
            if (
              historyQuantity + booking.quantity >
              booking.gift.maxQuantityPerCustomer
            ) {
              throw new HttpError(400, "超过客户礼品限制兑换数");
            }
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
            atReception:
              ["manager", "eventManager"].includes(req.user.role) &&
              booking.customer.id !== req.user.id
          });
        } catch (err) {
          switch (err.message) {
            case "no_customer_openid":
              throw new HttpError(400, "缺少客户openid");
            case "incomplete_gateway_data":
              throw new HttpError(400, "微信支付信息错误");
            case "insufficient_balance":
              throw new HttpError(400, "客户账户余额不足");
            case "insufficient_points":
              throw new HttpError(400, "客户账户积分不足");
            case "card_expired":
              throw new HttpError(400, "会员卡已失效");
            case "card_not_started":
              throw new HttpError(400, "会员卡未生效");
            case "insufficient_card_times":
              throw new HttpError(400, "次卡剩余次数不足");
            case "missing_gateway":
              throw new HttpError(400, "未选择支付方式");
            case "points_gateway_not_supported":
              throw new HttpError(400, "不支持积分购买");
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
        } else if (["manager", "eventManager"].includes(req.user.role)) {
          query.find({ store: { $in: [req.user.store.id, null] } });
        } else if (req.user.role !== "admin") {
          throw new HttpError(403);
        }

        if (queryParams.status) {
          query.find({
            status: {
              $in: queryParams.status.split(",") as BookingStatus[]
            }
          });
        }

        if (queryParams.customerKeyword) {
          if (isValidHexObjectId(queryParams.customerKeyword)) {
            // @ts-ignore
            query.find({ customer: queryParams.customerKeyword });
          } else {
            const matchCustomers = await User.find({
              $text: { $search: queryParams.customerKeyword }
            });
            query.find({ customer: { $in: matchCustomers } });
          }
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
        if (!booking) {
          throw new HttpError(
            404,
            `Booking not found: ${req.params.bookingId}`
          );
        }
        if (req.user.role === "customer") {
          if (!booking.customer.equals(req.user)) {
            throw new HttpError(403);
          }
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
          statusWas !== BookingStatus.CANCELED &&
          booking.status === BookingStatus.CANCELED
          // req.user.role !== "admin"
        ) {
          // TODO refund permission should be restricted
          // TODO IN_SERVICE refund

          booking.status = statusWas;
          if (
            req.user.role === "customer" &&
            statusWas !== BookingStatus.PENDING
          ) {
            booking.status = BookingStatus.PENDING_REFUND;
            booking.remarks =
              booking.remarks ||
              "" +
                `\n${moment().format("YYYY-MM-DD HH:mm")} 客户申请取消，原因：${
                  req.query.reason
                }。*小程序端可见*`;
          } else {
            await booking.cancel(false);
            if (
              booking.remarks &&
              booking.remarks.match &&
              booking.remarks.match(/\*小程序端\*/) &&
              booking.remarks.match(/客户申请取消/)
            ) {
              booking.remarks += `\n${moment().format(
                "YYYY-MM-DD HH:mm"
              )} 取消申请通过，已发起退款，微信支付将在1-7天内原路退回。*小程序端可见*`;
            }
          }
        }

        if (
          statusWas !== BookingStatus.IN_SERVICE &&
          booking.status === BookingStatus.IN_SERVICE
        ) {
          booking.checkInAt = moment().format("HH:mm:ss");
        }

        if (
          statusWas === BookingStatus.IN_SERVICE &&
          booking.status === BookingStatus.FINISHED &&
          !booking.checkOutAt
        ) {
          booking.checkOutAt = moment().format("HH:mm:ss");
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

        await Payment.deleteMany({
          _id: { $in: booking.payments.map(p => p.id) }
        });
        await booking.remove();
        res.end();
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
        if (booking.type !== BookingType.GIFT) {
          throw new HttpError(400, "门店信息错误");
        }
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
