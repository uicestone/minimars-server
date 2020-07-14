import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import Event, { Event as IEvent } from "../models/Event";
import { EventPostBody, EventPutBody, EventQuery } from "./interfaces";
import Booking, { liveBookingStatus } from "../models/Booking";
import { DocumentType } from "@typegoose/typegoose";
import escapeStringRegexp from "escape-string-regexp";

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
        if (!event.price && !event.priceInPoints) {
          throw new HttpError(400, "积分和收款售价必须至少设置一项");
        }
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
          order: -1
        };
        query.select("-content");

        if (["manager", "eventManager"].includes(req.user.role)) {
          query.find({ $or: [{ store: req.user.store.id }, { store: null }] });
        }

        if (req.user.role === "customer") {
          query.find({ order: { $gte: 0 } });
        }

        if (queryParams.keyword) {
          query.find({
            title: new RegExp(escapeStringRegexp(queryParams.keyword), "i")
          });
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
        if (req.item.kidsCountMax) {
          // re-calculate kidsCountLeft
          const eventBookings = await Booking.find({
            event,
            status: { $in: liveBookingStatus }
          });
          event.kidsCountLeft =
            event.kidsCountMax -
            eventBookings.reduce(
              (kidsCount, booking) => kidsCount + booking.kidsCount,
              0
            );
          if (event.kidsCountLeft < 0) {
            throw new HttpError(400, "剩余名额不能为负数");
          }
        }
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
