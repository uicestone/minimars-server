import { NextFunction, Request, Response } from "express";
import { Details, parse } from "express-useragent";

interface Ua extends Details {
  isWechat?: boolean;
}

export default async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const ua = parse(req.headers["user-agent"] || "") as Ua;
    const source = ua.source;
    ua.isWechat = !!source.match(/ MicroMessenger\//);
    req.ua = ua;
  } catch (e) {
    console.error(e.message);
    req.ua = {};
  }
  next();
}
