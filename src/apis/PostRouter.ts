import { Router, Request, Response, NextFunction } from "express";
import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import PostModel, { Post } from "../models/Post";
import { isValidHexObjectId } from "../utils/helper";
import { PostQuery, PostPostBody, PostPutBody } from "./interfaces";
import escapeStringRegexp from "escape-string-regexp";
import { DocumentType } from "@typegoose/typegoose";
import { Permission } from "../models/Role";

export default (router: Router) => {
  // Post CURD
  router
    .route("/post")

    // create a post
    .post(
      handleAsyncErrors(async (req: Request, res: Response) => {
        if (!req.user.can(Permission.POST)) {
          throw new HttpError(403);
        }
        const post = new PostModel(req.body as PostPostBody);
        post.author = req.user;
        await post.save();
        res.json(post);
      })
    )
    // get all the posts
    .get(
      paginatify,
      handleAsyncErrors(async (req: Request, res: Response) => {
        const queryParams = req.query as PostQuery;
        const { limit, skip } = req.pagination;
        const query = PostModel.find().populate("customer");
        const sort = parseSortString(queryParams.order) || {
          createdAt: -1
        };

        if (queryParams.slug) {
          query.find({
            slug: new RegExp("^" + escapeStringRegexp(queryParams.slug))
          });
        }

        if (queryParams.tag) {
          query.find({ tags: queryParams.tag });
        }

        if (req.ua.isWechat) {
          query.where({
            $and: [
              { $or: [{ end: null }, { end: { $gte: new Date() } }] },
              { $or: [{ start: null }, { start: { $lte: new Date() } }] }
            ]
          });
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
    .route("/post/:postId")

    .all(
      handleAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
          const post = isValidHexObjectId(req.params.postId)
            ? await PostModel.findById(req.params.postId)
            : await PostModel.findOne({ slug: req.params.postId });

          if (!post) {
            throw new HttpError(404, `Post not found: ${req.params.postId}`);
          }

          req.item = post;
          next();
        }
      )
    )

    // get the post with that id
    .get(
      handleAsyncErrors(async (req: Request, res: Response) => {
        const post = req.item;
        res.json(post);
      })
    )

    .put(
      handleAsyncErrors(async (req: Request, res: Response) => {
        if (!req.user.can(Permission.POST)) {
          throw new HttpError(403);
        }
        const post = req.item as DocumentType<Post>;
        post.set(req.body as PostPutBody);
        await post.save();
        res.json(post);
      })
    )

    // delete the post with this id
    .delete(
      handleAsyncErrors(async (req: Request, res: Response) => {
        if (!req.user.can(Permission.POST)) {
          throw new HttpError(403);
        }
        const post = req.item as DocumentType<Post>;
        await post.remove();
        res.end();
      })
    );

  return router;
};
