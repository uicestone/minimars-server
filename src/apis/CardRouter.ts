import { Router, Request, Response } from "express";
import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import CardModel, {
  Card,
  CardStatus,
  userVisibleCardStatus
} from "../models/Card";
import CardType from "../models/CardType";
import Payment, { PaymentGateway } from "../models/Payment";
import UserModel from "../models/User";
import CardTypeModel from "../models/CardType";
import BookingModel, { paidBookingStatus } from "../models/Booking";
import {
  CardPostBody,
  CardPutBody,
  CardQuery,
  CardPostQuery
} from "./interfaces";
import { DocumentType } from "@typegoose/typegoose";
import { verify } from "jsonwebtoken";
import moment from "moment";

export default (router: Router) => {
  // Card CURD
  router
    .route("/card")

    // create a card
    .post(
      handleAsyncErrors(async (req: Request, res: Response) => {
        const body = req.body as CardPostBody;

        const customer =
          req.user.role === "customer"
            ? req.user
            : await UserModel.findById(body.customer);

        if (!customer) {
          throw new HttpError(400, "购卡用户无效");
        }

        if (!customer.mobile) {
          throw new HttpError(400, "必须先授权获取手机号才能购买/领取会员卡");
        }

        if (body.giftCode) {
          try {
            const [userId, cardId] = (verify(
              body.giftCode,
              process.env.APP_SECRET
            ) as string).split(" ");

            console.log(
              `[CRD] Gift code parsed, userId: ${userId}, cardId: ${cardId}.`
            );

            const card = await CardModel.findOne({ _id: cardId });
            if (card.customer.toString() === userId) {
              // verify success, now change owner
              card.customer = body.customer || req.user.id;
              await card.save();
              console.log(
                `[CRD] Card ${card.id} transferred from user ${userId} to ${card.customer}.`
              );
              return res.json(card);
            } else {
              throw "";
            }
          } catch (e) {
            throw new HttpError(403, "Card gift code verify failed.");
          }
        }

        const query = req.query as CardPostQuery;
        const cardType = await CardType.findOne({ slug: body.slug });
        if (!cardType) {
          throw new HttpError(404, `CardType '${body.slug}' not exists.`);
        }

        if (cardType.maxPerCustomer) {
          const cardsOfSlug = await CardModel.find({
            slug: cardType.slug,
            status: { $in: userVisibleCardStatus },
            customer
          });
          if (cardsOfSlug.length + 1 > cardType.maxPerCustomer) {
            throw new HttpError(400, "超过该会员卡限制购买数");
          }
        }

        if (cardType.quantity === 0) {
          throw new HttpError(400, "抱歉，该卡券已售罄");
        }

        const card = cardType.issue(customer);

        try {
          await card.createPayment({
            paymentGateway:
              query.paymentGateway ||
              (req.ua.isWechat ? PaymentGateway.WechatPay : undefined),
            atReceptionStore:
              req.user.role === "manager" && card.customer !== req.user.id
                ? req.user.store
                : null
          });
        } catch (err) {
          switch (err.message) {
            case "no_customer_openid":
              throw new HttpError(400, "缺少客户openid");
            case "missing_gateway":
              throw new HttpError(400, "未选择支付方式");
            default:
              throw err;
          }
        }

        if (typeof cardType.quantity === "number") {
          await CardTypeModel.updateOne(
            { _id: cardType.id },
            { $inc: { quantity: -1 } }
          );
        }

        if (card.type === "times") {
          const expiredTimesCards = await CardModel.find({
            customer: card.customer,
            stores: { $all: card.stores },
            timesLeft: { $gt: 0 },
            expiresAt: { $lt: card.expiresAt },
            end: null
          });
          await Promise.all(
            expiredTimesCards.map(ec => {
              ec.expiresAtWas = ec.expiresAt;
              ec.expiresAt = card.expiresAt;
              ec.status = CardStatus.ACTIVATED;
              console.log(
                `[CRD] Customer ${
                  ec.customer
                } expired times card extends from ${moment(
                  ec.expiresAtWas
                ).format("YYYY-MM-DD HH:mm:ss")} to ${moment(
                  card.expiresAt
                ).format("YYYY-MM-DD HH:mm:ss")}.`
              );
              return ec.save();
            })
          );
        }

        await card.save();
        await customer.save();

        res.json(card);
      })
    )

    // get all the cards
    .get(
      paginatify,
      handleAsyncErrors(async (req: Request, res: Response) => {
        const queryParams = req.query as CardQuery;
        const { limit, skip } = req.pagination;
        const query = CardModel.find();
        const sort = parseSortString(queryParams.order) || {
          createdAt: -1
        };

        query.select("-content");

        ["customer"].forEach(field => {
          if (queryParams[field]) {
            query.find({ [field]: queryParams[field] });
          }
        });

        if (queryParams.status) {
          query.find({
            status: {
              $in: queryParams.status.split(",") as CardStatus[]
            }
          });
        } else if (req.user.role === "customer") {
          query.find({
            status: {
              $in: [CardStatus.ACTIVATED, CardStatus.VALID, CardStatus.EXPIRED]
            }
          });
        }

        // restrict self card for customers
        if (req.user.role === "customer") {
          query.find({ customer: req.user._id });
        } else if (req.user.role === "manager") {
          query.find({ stores: { $in: [req.user.store.id, []] } });
        } else if (req.user.role !== "admin") {
          throw new HttpError(403);
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
    .route("/card/:cardId")

    .all(
      handleAsyncErrors(async (req, res, next) => {
        const card = await CardModel.findById(req.params.cardId);
        if (!card) {
          throw new HttpError(404, `Card not found: ${req.params.cardId}`);
        }
        if (req.user.role === "customer" && !req.user.equals(card.customer)) {
          throw new HttpError(403);
        }
        req.item = card;
        next();
      })
    )

    // get the card with that id
    .get(
      handleAsyncErrors(async (req: Request, res: Response) => {
        const card = req.item;
        res.json(card);
      })
    )

    .put(
      handleAsyncErrors(async (req: Request, res: Response) => {
        const card = req.item as DocumentType<Card>;
        const body = req.body as CardPutBody;

        const statusWas = card.status;
        card.set(body);

        if (body.expiresAt && req.user.role === "admin") {
          // extend card expire time
          card.expiresAtWas = card.expiresAt;
          card.expiresAt = moment(card.expiresAt).endOf("day").toDate();
        }

        if (
          body.status === CardStatus.CANCELED &&
          statusWas !== CardStatus.CANCELED &&
          req.user.role === "admin"
        ) {
          card.status = statusWas;
          await card.refund();
        }

        await card.save();
        res.json(card);
      })
    )

    // delete the card with this id
    .delete(
      handleAsyncErrors(async (req: Request, res: Response) => {
        if (!["admin", "manager"].includes(req.user.role)) {
          throw new HttpError(403);
        }
        const card = req.item as DocumentType<Card>;
        if (card.times !== card.timesLeft) {
          throw new HttpError(400, "次卡已使用，请撤销使用订单后再删除卡");
        }
        const usedCount = await BookingModel.countDocuments({
          card: card.id,
          status: { $in: paidBookingStatus }
        });
        if (usedCount) {
          throw new HttpError(400, "该卡已使用，请撤销订单后再删除卡");
        }
        if (card.type === "balance" && card.status === CardStatus.ACTIVATED) {
          const customer = await UserModel.findById(card.customer);
          if (
            customer.balanceDeposit < card.price ||
            customer.balanceReward < card.balanceReward
          ) {
            throw new HttpError(400, "用户余额已不足以删除本储值卡");
          }
          customer.balanceDeposit -= card.price;
          customer.balanceReward -= card.balanceReward;
          await customer.save();
        }
        await Payment.deleteMany({
          _id: { $in: card.payments.map(p => p.id) }
        });
        await card.remove();
        res.end();
      })
    );

  return router;
};
