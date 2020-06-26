import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import Card, {
  Card as ICard,
  CardStatus,
  userVisibleCardStatus
} from "../models/Card";
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
import moment from "moment";

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
              `[CRD] Gift code parsed, userId: ${userId}, cardId: ${cardId}.`
            );

            const card = await Card.findOne({ _id: cardId });
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

        const card = new Card({
          customer: body.customer
        });

        if (cardType.store) {
          card.store = cardType.store.id;
        }

        Object.keys(cardType.toObject())
          .filter(
            key =>
              !["_id", "__v", "createdAt", "updatedAt", "store"].includes(key)
          )
          .forEach(key => {
            card.set(key, cardType[key]);
          });

        if (req.user.role === "customer") {
          card.customer = req.user;
        }

        const customer = await User.findOne({
          _id: card.customer as Types.ObjectId
        });

        if (!customer) {
          throw new HttpError(400, "Invalid card customer.");
        }

        if (cardType.maxPerCustomer) {
          const cardsOfSlug = await Card.find({
            slug: cardType.slug,
            status: { $in: userVisibleCardStatus },
            customer: card.customer
          });
          if (cardsOfSlug.length + 1 > cardType.maxPerCustomer) {
            throw new HttpError(400, "超过该会员卡限制购买数");
          }
        }

        if (cardType.times) {
          card.timesLeft = cardType.times;
        }

        if (cardType.expiresInDays && !cardType.end) {
          card.expiresAt = moment(card.start)
            .add(cardType.expiresInDays, "days")
            // .subtract(1, "day")
            .endOf("day")
            .toDate();
        } else if (cardType.end) {
          card.expiresAt = cardType.end;
        }

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

        // restrict self card for customers
        if (req.user.role === "customer") {
          query.find({ customer: req.user._id });
        } else if (req.user.role === "manager") {
          query.find({ store: { $in: [req.user.store.id, null] } });
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
