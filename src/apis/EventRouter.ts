import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import Event from "../models/Event";

export default router => {
  // Event CURD
  router
    .route("/event")

    // create an event
    .post(
      handleAsyncErrors(async (req, res) => {
        const event = new Event(req.body);
        await event.save();
        res.json(event);
      })
    )

    // get all the events
    .get(
      paginatify,
      handleAsyncErrors(async (req, res) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const { limit, skip } = req.pagination;
        const query = Event.find().populate("customer");
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
    .route("/event/:eventId")

    .all(
      handleAsyncErrors(async (req, res, next) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const event = await Event.findById(req.params.eventId);
        if (!event) {
          throw new HttpError(404, `Event not found: ${req.params.eventId}`);
        }
        req.item = event;
        next();
      })
    )

    // get the event with that id
    .get(
      handleAsyncErrors(async (req, res) => {
        const event = req.item;
        res.json(event);
      })
    )

    .put(
      handleAsyncErrors(async (req, res) => {
        const event = req.item;
        event.set(req.body);
        await event.save();
        res.json(event);
      })
    )

    // delete the event with this id
    .delete(
      handleAsyncErrors(async (req, res) => {
        const event = req.item;
        await event.remove();
        res.end();
      })
    );

  return router;
};
