import HttpError from "../utils/HttpError";
import { getTokenData } from "../utils/helper";
import { Types } from "mongoose";
import UserModel from "../models/User";

const { DEBUG } = process.env;

export default async function (req, res, next) {
  const token = req.get("authorization") || req.query.token;

  if (token) {
    try {
      if (DEBUG) {
        req.user = await UserModel.findOne({
          login: token.replace(/^Bearer /, "")
        });
        if (req.user) return next();
      }
      const tokenData = getTokenData(token);
      req.user = await UserModel.findById(tokenData.userId);
      // req.user = await User.findById(tokenData.userId);
    } catch (err) {
      return next(new HttpError(401, "无效登录，请重新登录"));
    }
  } else if (
    ["booking(/.*)?", "payment.*"].some(pattern =>
      req._parsedUrl.pathname.match(`^/api/${pattern}$`)
    )
  ) {
    return next(new HttpError(401, "登录后才能访问此功能"));
  } else {
    req.user = new UserModel({ _id: Types.ObjectId(), role: "guest" });
  }

  next();
}
