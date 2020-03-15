import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import CardType from "../models/CardType";

export default router => {
  // CardType CURD
  router
    .route("/card-type")

    // get all the cardTypes
    .get(
      paginatify,
      handleAsyncErrors(async (req, res) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const { limit, skip } = req.pagination;
        const query = CardType.find().populate("customer");
        const sort = parseSortString(req.query.order) || {
          createdAt: -1
        };

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
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
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
        const cardType = req.item;
        cardType.set(req.body);
        await cardType.save();
        res.json(cardType);
      })
    )

    // delete the cardType with this id
    .delete(
      handleAsyncErrors(async (req, res) => {
        const cardType = req.item;
        await cardType.remove();
        res.end();
      })
    );

  return router;
};
