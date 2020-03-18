import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import Post from "../models/Post";
import { isValidHexObjectId } from "../utils/helper";

export default router => {
  // Post CURD
  router
    .route("/post")

    // create a post
    .post(
      handleAsyncErrors(async (req, res) => {
        const post = new Post(req.body);
        post.author = req.user;
        await post.save();
        res.json(post);
      })
    )
    // get all the posts
    .get(
      paginatify,
      handleAsyncErrors(async (req, res) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const { limit, skip } = req.pagination;
        const query = Post.find().populate("customer");
        const sort = parseSortString(req.query.order) || {
          createdAt: -1
        };

        if (req.query.slug) {
          query.find({ slug: new RegExp("^" + req.query.slug) });
        }

        if (req.query.tag) {
          query.find({ tags: req.query.tag });
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
      handleAsyncErrors(async (req, res, next) => {
        const post = isValidHexObjectId(req.params.postId)
          ? await Post.findById(req.params.postId)
          : await Post.findOne({ slug: req.params.postId });

        if (!post) {
          throw new HttpError(404, `Post not found: ${req.params.postId}`);
        }

        req.item = post;
        next();
      })
    )

    // get the post with that id
    .get(
      handleAsyncErrors(async (req, res) => {
        const post = req.item;
        res.json(post);
      })
    )

    .put(
      handleAsyncErrors(async (req, res) => {
        const post = req.item;
        post.set(req.body);
        await post.save();
        res.json(post);
      })
    )

    // delete the post with this id
    .delete(
      handleAsyncErrors(async (req, res) => {
        const post = req.item;
        await post.remove();
        res.end();
      })
    );

  return router;
};
