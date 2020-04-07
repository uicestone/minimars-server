import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import Event, { Event as IEvent } from "../models/Event";
import { EventPostBody, EventPutBody, EventQuery } from "./interfaces";
import Booking from "../models/Booking";
import { DocumentType } from "@typegoose/typegoose";

export default router => {
  // Event CURD
  router
    .route("/event")

    // create an event
    .post(
      handleAsyncErrors(async (req, res) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const event = new Event(req.body as EventPostBody);
        await event.save();
        res.json(event);
      })
    )

    // get all the events
    .get(
      paginatify,
      handleAsyncErrors(async (req, res) => {
        const queryParams = req.query as EventQuery;
        const { limit, skip } = req.pagination;
        const query = Event.find().populate("customer");
        const sort = parseSortString(queryParams.order) || {
          createdAt: -1
        };

        if (queryParams.keyword) {
          query.find({ title: new RegExp(queryParams.keyword, "i") });
        }

        ["store"].forEach(field => {
          if (queryParams[field]) {
            query.find({ [field]: queryParams[field] });
          }
        });

        if (queryParams.tag) {
          query.find({ tags: queryParams.tag });
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
    .route("/event/:eventId")

    .all(
      handleAsyncErrors(async (req, res, next) => {
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
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const event = req.item;
        event.set(req.body as EventPutBody);
        await event.save();
        res.json(event);
      })
    )

    // delete the event with this id
    .delete(
      handleAsyncErrors(async (req, res) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const event = req.item as DocumentType<IEvent>;
        const bookingCount = await Booking.count({ event: event.id });

        if (bookingCount > 0) {
          throw new HttpError(400, "已经存在报名记录，不能删除");
        }

        await event.remove();

        res.end();
      })
    );

  return router;
};
