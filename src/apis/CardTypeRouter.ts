import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import CardType, { CardType as ICardType } from "../models/CardType";
import { CardTypeQuery, CardTypePutBody } from "./interfaces";
import { DocumentType } from "@typegoose/typegoose";
import User from "../models/User";

export default router => {
  // CardType CURD
  router
    .route("/card-type")

    // create a cardType
    .post(
      handleAsyncErrors(async (req, res) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const cardType = new CardType(req.body);
        await cardType.save();
        res.json(cardType);
      })
    )

    // get all the cardTypes
    .get(
      paginatify,
      handleAsyncErrors(async (req, res) => {
        const queryParams = req.query as CardTypeQuery;
        const { limit, skip } = req.pagination;
        const query = CardType.find().populate("customer");
        const sort = parseSortString(queryParams.order) || {
          price: 1
        };

        query.select("-content");

        if (req.user.role === "manager") {
          query.find({ store: { $in: [req.user.store.id, null] } });
        }

        if (req.user.role === "customer") {
          if (req.user.tags && req.user.tags.length) {
            query.find({
              $or: [
                { customerTags: { $in: req.user.tags } },
                { customerTags: null },
                { customerTags: [] }
              ]
            });
          }
        }

        if (req.ua && req.ua.isWechat) {
          query.find({ openForClient: true });
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
    .route("/card-type/:cardTypeId")

    .all(
      handleAsyncErrors(async (req, res, next) => {
        const cardType = await CardType.findById(req.params.cardTypeId);
        if (!cardType) {
          throw new HttpError(
            404,
            `CardType not found: ${req.params.cardTypeId}`
          );
        }
        req.item = cardType;
        next();
      })
    )

    // get the cardType with that id
    .get(
      handleAsyncErrors(async (req, res) => {
        const cardType = req.item;
        res.json(cardType);
      })
    )

    .put(
      handleAsyncErrors(async (req, res) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const cardType = req.item as DocumentType<ICardType>;
        const body = req.body as CardTypePutBody;
        if (body.type && body.type !== cardType.type) {
          cardType.set({
            start: undefined,
            end: undefined,
            balance: undefined,
            times: undefined
          });
        }
        cardType.set(body);
        await cardType.save();
        res.json(cardType);
      })
    )

    // delete the cardType with this id
    .delete(
      handleAsyncErrors(async (req, res) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const cardType = req.item;
        await cardType.remove();
        res.end();
      })
    );

  return router;
};
