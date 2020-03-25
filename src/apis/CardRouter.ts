import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import Card, { ICard } from "../models/Card";
import CardType from "../models/CardType";
import {
  CardPostBody,
  CardPutBody,
  CardQuery,
  CardPostQuery
} from "./interfaces";
import { Gateways } from "../models/Payment";
import User from "../models/User";

export default router => {
  // Card CURD
  router
    .route("/card")

    // create a card
    .post(
      handleAsyncErrors(async (req, res) => {
        const card = new Card(req.body as CardPostBody);
        const query = req.query as CardPostQuery;
        const cardType = await CardType.findOne({ slug: card.slug });
        if (!cardType) {
          throw new HttpError(404, `CardType '${card.slug}' not exists.`);
        }
        if (req.user.role === "customer") {
          card.customer = req.user;
        }

        const customer = await User.findOne({ _id: card.customer });

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
              (req.ua.isWechat ? Gateways.WechatPay : undefined),
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
        customer.cards.push(card);
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

        ["customer"].forEach(field => {
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
    .route("/card/:cardId")

    .all(
      handleAsyncErrors(async (req, res, next) => {
        const card = await Card.findById(req.params.cardId);
        if (!card) {
          throw new HttpError(404, `Card not found: ${req.params.cardId}`);
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
        const card = req.item as ICard;
        card.set(req.body as CardPutBody);
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
