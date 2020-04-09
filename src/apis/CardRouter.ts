import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import Card, { Card as ICard, CardStatus } from "../models/Card";
import CardType from "../models/CardType";
import {
  CardPostBody,
  CardPutBody,
  CardQuery,
  CardPostQuery
} from "./interfaces";
import { PaymentGateway } from "../models/Payment";
import User, { User as IUser } from "../models/User";
import { Types } from "mongoose";
import { DocumentType } from "@typegoose/typegoose";
import { verify } from "jsonwebtoken";

export default router => {
  // Card CURD
  router
    .route("/card")

    // create a card
    .post(
      handleAsyncErrors(async (req, res) => {
        const body = req.body as CardPostBody;

        if (body.giftCode) {
          try {
            const [userId, cardId] = (verify(
              body.giftCode,
              process.env.APP_SECRET
            ) as string).split(" ");

            console.log(
              `Gift code parsed, userId: ${userId}, cardId: ${cardId}`
            );

            const card = await Card.findOne({ _id: cardId });
            if (card.customer.toString() === userId) {
              // verify success, now change owner
              card.customer = body.customer || req.user.id;
              await card.save();
              return res.json(card);
            } else {
              throw "";
            }
          } catch (e) {
            throw new HttpError(403, "Card gift code verify failed.");
          }
        }

        const card = new Card(body);
        const query = req.query as CardPostQuery;
        const cardType = await CardType.findOne({ slug: card.slug });
        if (!cardType) {
          throw new HttpError(404, `CardType '${card.slug}' not exists.`);
        }
        if (req.user.role === "customer") {
          card.customer = req.user;
        }

        const customer = await User.findOne({
          _id: card.customer as Types.ObjectId
        });

        if (!customer) {
          throw new HttpError(400, "Invalid card customer.");
        }

        if (cardType.times) {
          card.timesLeft = cardType.times;
        }

        try {
          await card.createPayment({
            paymentGateway:
              query.paymentGateway ||
              (req.ua.isWechat ? PaymentGateway.WechatPay : undefined),
            adminAddWithoutPayment:
              req.user.role === "admin" && query.adminAddWithoutPayment
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

        await card.save();
        await customer.save();

        res.json(card);
      })
    )

    // get all the cards
    .get(
      paginatify,
      handleAsyncErrors(async (req, res) => {
        const queryParams = req.query as CardQuery;
        const { limit, skip } = req.pagination;
        const query = Card.find();
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
        const card = await Card.findById(req.params.cardId);
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
      handleAsyncErrors(async (req, res) => {
        const card = req.item;
        res.json(card);
      })
    )

    .put(
      handleAsyncErrors(async (req, res) => {
        const card = req.item as DocumentType<ICard>;

        const statusWas = card.status;
        card.set(req.body as CardPutBody);
        if (
          statusWas === CardStatus.VALID &&
          card.status === CardStatus.ACTIVATED
        ) {
          await card.populate("customer").execPopulate();
          const customer = card.customer as DocumentType<IUser>;
          customer.balanceDeposit += card.price;
          customer.balanceReward += card.balance - card.price;
          card.status = CardStatus.EXPIRED;
          await customer.save();
          await card.save();
        }
        await card.save();
        res.json(card);
      })
    )

    // delete the card with this id
    .delete(
      handleAsyncErrors(async (req, res) => {
        const card = req.item;
        await card.remove();
        res.end();
      })
    );

  return router;
};
