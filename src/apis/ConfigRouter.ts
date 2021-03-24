import { Router, Request, Response, NextFunction } from "express";
import { DocumentType } from "@typegoose/typegoose";
import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import ConfigModel, { ConfigDocument, config } from "../models/Config";
import HttpError from "../utils/HttpError";
import reduceConfig from "../utils/reduceConfig";
import initConfig from "../utils/initConfig";
import { Permission } from "../models/Role";

export default (router: Router) => {
  // Config CURD
  router
    .route("/config")

    // create a config
    .post(
      handleAsyncErrors(async (req: Request, res: Response) => {
        if (!req.user.can(Permission.CONFIG)) {
          throw new HttpError(403);
        }
        const configItem = new ConfigModel(req.body);
        await configItem.save();
        res.json(configItem);
      })
    )

    // get all the configs
    .get(
      paginatify,
      handleAsyncErrors(async (req: Request, res: Response) => {
        const items = await ConfigModel.find().sort({ createdAt: -1 }).exec();

        res.json(req.query.seperate ? items : reduceConfig(items));
      })
    );

  router
    .route("/config/:key")

    .all(
      handleAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
          if (!req.user.can(Permission.CONFIG)) {
            throw new HttpError(403);
          }
          const config = await ConfigModel.findOne({
            [req.params.key]: { $exists: true }
          });
          if (!config) {
            throw new HttpError(404, `Config not found: ${req.params.key}`);
          }
          req.item = config;
          next();
        }
      )
    )

    // get the config with that id
    .get(
      handleAsyncErrors(async (req: Request, res: Response) => {
        const configItem = req.item;
        res.json(configItem);
      })
    )

    .put(
      handleAsyncErrors(async (req: Request, res: Response) => {
        const configItem = req.item as DocumentType<ConfigDocument>;
        const set = req.body[req.params.key]
          ? req.body
          : { [req.params.key]: req.body };
        configItem.set(set);
        await configItem.save();
        res.json(configItem);
        initConfig(config);
      })
    )

    // delete the config with this id
    .delete(
      handleAsyncErrors(async (req: Request, res: Response) => {
        const configItem = req.item as DocumentType<ConfigDocument>;
        await configItem.remove();
        res.end();
      })
    );

  router
    .route("/config-init")

    // load or reload config from database
    .post(
      handleAsyncErrors(async (req: Request, res: Response) => {
        initConfig(config);
        res.end();
      })
    );

  return router;
};
