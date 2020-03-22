import { parse } from "express-useragent";

export default async function(req, res, next) {
  const ua = parse(req.headers["user-agent"]);
  const source = ua.source;
  ua.isWechat = source.match(/ MicroMessenger\//);
  req.ua = ua;
  next();
}
