import { Router, Request, Response, NextFunction } from "express";
import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import StoreModel, { Store } from "../models/Store";
import { StoreQuery, StorePostBody, StorePutBody } from "./interfaces";
import { DocumentType } from "@typegoose/typegoose";
import { Permission } from "../models/Role";
import Pospal from "../utils/pospal";

export default (router: Router) => {
  // Store CURD
  router
    .route("/store")

    // create a store
    .post(
      handleAsyncErrors(async (req: Request, res: Response) => {
        if (!req.user.can(Permission.STORE)) {
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
      handleAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
          const store = await StoreModel.findById(req.params.storeId);
          if (!store) {
            throw new HttpError(404, `Store not found: ${req.params.storeId}`);
          }
          req.item = store;
          next();
        }
      )
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
        if (!req.user.can(Permission.STORE)) {
          throw new HttpError(403);
        }
        const store = req.item as DocumentType<Store>;
        store.set(req.body as StorePutBody);
        await store.save();
        res.json(store);
      })
    )

    // delete the store with this id
    .delete(
      handleAsyncErrors(async (req: Request, res: Response) => {
        if (!req.user.can(Permission.STORE)) {
          throw new HttpError(403);
        }
        const store = req.item as DocumentType<Store>;
        await store.remove();
        res.end();
      })
    );

  router.route("/store/:storeId/food-menu").get(
    handleAsyncErrors(async (req: Request, res: Response) => {
      const store = await StoreModel.findById(req.params.storeId).select(
        "foodMenu"
      );
      if (!store) {
        throw new HttpError(404, `Store not found: ${req.params.storeId}`);
      }
      if (!store.foodMenu) {
        const pospal = new Pospal(store.code);
        const menu = await pospal.getMenu();
        store.foodMenu = menu;
        await store.save();
      }
      res.json(store.foodMenu);
    })
  );

  router
    .route("/store-menu")

    // create a store
    .get(
      handleAsyncErrors(async (req: Request, res: Response) => {
        const qr = req.query.qr as string;
        const match = qr.match(/^.*?:\/\/(.*?)-.*qrc=(.*)$/);
        if (!match) {
          throw new HttpError(400, "二维码信息错误");
        }
        const [, pospalCode, tableIdEncoded] = match;
        const tableId = decodeURIComponent(tableIdEncoded);
        const store = await StoreModel.findOne({ pospalCode }).select(
          "name phone address posterUrl foodMenu"
        );
        if (!store) {
          throw new HttpError(404, `Store not found: ${req.params.storeId}`);
        }
        if (!store.foodMenu) {
          const pospal = new Pospal(store.code);
          const menu = await pospal.getMenu();
          store.foodMenu = menu;
          await store.save();
        }
        const menu = store.foodMenu;
        const storeObject = store.toJSON();
        delete storeObject.foodMenu;
        res.json({
          store: storeObject,
          tableId,
          menu
        });
      })
    );

  return router;
};
