import { NextFunction, Request, Response } from "express";

export default async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  req.pagination = { limit: 20, skip: 0 };

  if (req.query.skip) {
    req.pagination.skip = +req.query.skip;
  }

  if (req.query.limit !== undefined) {
    req.pagination.limit = Math.max(+req.query.limit, 0);
  }

  res.paginatify = function (limit, skip, total) {
    const from = Math.min(skip + 1, total);
    const to = limit ? Math.min(skip + limit, total) : total;

    this.set("accept-range", "items")
      .set("content-range", `items ${from}-${to}/${total}`)
      .set("items-start", from.toString())
      .set("items-end", to.toString())
      .set("items-total", total.toString());

    return this;
  };

  next();
}
