import { Router, Request, Response, NextFunction } from "express";
import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import RoleModel, { Role } from "../models/Role";
import { RoleQuery, RolePostBody, RolePutBody } from "./interfaces";
import { DocumentType } from "@typegoose/typegoose";
import { Permission } from "../models/Role";

export default (router: Router) => {
  // Role CURD
  router
    .route("/role")

    // create a role
    .post(
      handleAsyncErrors(async (req: Request, res: Response) => {
        // if (!req.user.can(Permission.ROLE)) {
        //   throw new HttpError(403);
        // }
        const role = new RoleModel(req.body as RolePostBody);
        await role.save();
        res.json(role);
      })
    )

    // get all the roles
    .get(
      paginatify,
      handleAsyncErrors(async (req: Request, res: Response) => {
        const queryParams = req.query as RoleQuery;
        const { limit, skip } = req.pagination;
        const query = RoleModel.find();

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
    .route("/role/:roleId")

    .all(
      handleAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
          const role = await RoleModel.findById(req.params.roleId);
          if (!role) {
            throw new HttpError(404, `Role not found: ${req.params.roleId}`);
          }
          req.item = role;
          next();
        }
      )
    )

    // get the role with that id
    .get(
      handleAsyncErrors(async (req: Request, res: Response) => {
        const role = req.item;
        res.json(role);
      })
    )

    .put(
      handleAsyncErrors(async (req: Request, res: Response) => {
        // if (!req.user.can(Permission.ROLE)) {
        //   throw new HttpError(403);
        // }
        const role = req.item as DocumentType<Role>;
        role.set(req.body as RolePutBody);
        await role.save();
        res.json(role);
      })
    )

    // delete the role with this id
    .delete(
      handleAsyncErrors(async (req: Request, res: Response) => {
        if (!req.user.can(Permission.ROLE)) {
          throw new HttpError(403);
        }
        const role = req.item as DocumentType<Role>;
        await role.remove();
        res.end();
      })
    );

  return router;
};
