import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import Card, { ICard } from "../models/Card";
import CardType from "../models/CardType";

export default router => {
  // Card CURD
  router
    .route("/card")

    // create a card
    .post(
      handleAsyncErrors(async (req, res) => {
        const card = new Card(req.body);
        const cardType = await CardType.findOne({ slug: card.slug });
        if (!cardType) {
          throw new HttpError(404, `CardType '${card.slug}' not exists.`);
        }
        if (req.user.role === "customer") {
          card.customer = req.user;
        }

        if (!card.customer) {
          throw new HttpError(400, "Invalid card customer.");
        }

        if (cardType.times) {
          card.timesLeft = cardType.times;
        }

        await card.save();
        res.json(card);
      })
    )

    // get all the cards
    .get(
      paginatify,
      handleAsyncErrors(async (req, res) => {
        const { limit, skip } = req.pagination;
        const query = Card.find().populate("customer");
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
        if (req.body.type && req.body.type !== req.item.type) {
          card.set({
            start: undefined,
            end: undefined,
            balance: undefined,
            times: undefined
          });
        }
        card.set(req.body);
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
