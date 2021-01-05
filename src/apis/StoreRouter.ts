import { Router, Request, Response } from "express";
import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import StoreModel from "../models/Store";
import { StoreQuery, StorePostBody, StorePutBody } from "./interfaces";
import Pospal from "../utils/pospal";
import UserModel from "../models/User";

export default (router: Router) => {
  // Store CURD
  router
    .route("/store")

    // create a store
    .post(
      handleAsyncErrors(async (req: Request, res: Response) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const store = new StoreModel(req.body as StorePostBody);
        await store.save();
        res.json(store);
      })
    )

    // get all the stores
    .get(
      paginatify,
      handleAsyncErrors(async (req: Request, res: Response) => {
        const queryParams = req.query as StoreQuery;
        const { limit, skip } = req.pagination;
        const query = StoreModel.find();

        query.select("-content");

        const sort = parseSortString(queryParams.order) || {
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
    .route("/store/:storeId")

    .all(
      handleAsyncErrors(async (req, res, next) => {
        const store = await StoreModel.findById(req.params.storeId);
        if (!store) {
          throw new HttpError(404, `Store not found: ${req.params.storeId}`);
        }
        req.item = store;
        next();
      })
    )

    // get the store with that id
    .get(
      handleAsyncErrors(async (req: Request, res: Response) => {
        const store = req.item;
        res.json(store);
      })
    )

    .put(
      handleAsyncErrors(async (req: Request, res: Response) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const store = req.item;
        store.set(req.body as StorePutBody);
        await store.save();
        res.json(store);
      })
    )

    // delete the store with this id
    .delete(
      handleAsyncErrors(async (req: Request, res: Response) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const store = req.item;
        await store.remove();
        res.end();
      })
    );

  return router;
};

// setTimeout(async () => {
//   const store = await StoreModel.findOne({ code: "BY" });
//   try {
//     await store.syncPospalTickets(60 * 24);
//   } catch (e) {
//     console.error(e);
//   }
// }, 1000);
