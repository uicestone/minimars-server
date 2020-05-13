import { parse } from "express-useragent";

export default async function (req, res, next) {
  try {
    if (!req.headers["user-agent"])
      throw new Error("Empty user-agent in headers.");
    const ua = parse(req.headers["user-agent"]);
    const source = ua.source;
    ua.isWechat = source.match(/ MicroMessenger\//);
    req.ua = ua;
  } catch (e) {
    console.error(e.message);
    req.ua = {};
  }
  next();
}
