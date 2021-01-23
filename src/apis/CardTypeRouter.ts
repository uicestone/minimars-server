import { Router, Request, Response } from "express";
import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import CardTypeModel, { CardType } from "../models/CardType";
import { CardTypeQuery, CardTypePutBody } from "./interfaces";
import { DocumentType } from "@typegoose/typegoose";
import { isValidHexObjectId } from "../utils/helper";

export default (router: Router) => {
  // CardType CURD
  router
    .route("/card-type")

    // create a cardType
    .post(
      handleAsyncErrors(async (req: Request, res: Response) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const cardType = new CardTypeModel(req.body);
        await cardType.save();
        res.json(cardType);
      })
    )

    // get all the cardTypes
    .get(
      paginatify,
      handleAsyncErrors(async (req: Request, res: Response) => {
        const queryParams = req.query as CardTypeQuery;
        const { limit, skip } = req.pagination;
        const query = CardTypeModel.find().populate("customer");
        const sort = parseSortString(queryParams.order) || {
          type: -1,
          price: 1
        };

        query.select("-content");

        if (req.user.role === "customer") {
          query.where({
            $or: [
              { customerTags: { $in: req.user.tags || [] } },
              { customerTags: null },
              { customerTags: [] }
            ]
          });
        } else if (req.user.role !== "admin") {
          query.find({ stores: { $in: [req.user.store?.id, []] } });
        }

        if (req.ua && req.ua.isWechat) {
          if (queryParams.include && !isValidHexObjectId(queryParams.include)) {
            throw new HttpError(400, "无效的卡券类型ID");
          }
          query.where({
            $or: [{ openForClient: true }, { _id: queryParams.include }]
          });
        }

        if (queryParams.title) {
          query.where({ title: new RegExp(queryParams.title) });
        }

        [
          "couponSlug",
          "slug",
          "openForClient",
          "openForReception",
          "type",
          "stores"
        ].forEach(field => {
          if (queryParams[field]) {
            if (queryParams[field] === "true") {
              query.find({ [field]: true });
            } else if (queryParams[field] === "false") {
              query.find({ [field]: { $in: [false, null] } });
            } else {
              query.find({ [field]: queryParams[field] });
            }
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
    .route("/card-type/:cardTypeId")

    .all(
      handleAsyncErrors(async (req, res, next) => {
        const cardType = await CardTypeModel.findById(req.params.cardTypeId);
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
      handleAsyncErrors(async (req: Request, res: Response) => {
        const cardType = req.item;
        res.json(cardType);
      })
    )

    .put(
      handleAsyncErrors(async (req: Request, res: Response) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const cardType = req.item as DocumentType<CardType>;
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
      handleAsyncErrors(async (req: Request, res: Response) => {
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
