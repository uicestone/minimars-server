import paginatify from "../middlewares/paginatify";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import parseSortString from "../utils/parseSortString";
import HttpError from "../utils/HttpError";
import User, { User as IUser } from "../models/User";
import { hashPwd } from "../utils/helper";
import { config } from "../models/Config";
import Payment, { PaymentGateway } from "../models/Payment";
import idCard from "idcard";
import { UserQuery, UserPostBody, UserPutBody } from "./interfaces";
import { DocumentType } from "@typegoose/typegoose";

const { DEBUG } = process.env;

export default router => {
  // User CURD
  router
    .route("/user")

    // create a user
    .post(
      handleAsyncErrors(async (req, res) => {
        const body = req.body as UserPostBody;
        if (req.user.role !== "admin") {
          ["role", "openid", "cardType", "balance"].forEach(f => {
            delete body[f];
          });
        }
        if (body.password) {
          body.password = await hashPwd(body.password);
        }
        if (body.mobile) {
          const userMobileExists = await User.findOne({
            mobile: body.mobile
          });
          if (userMobileExists) {
            throw new HttpError(409, `手机号${body.mobile}已被使用.`);
          }
        }
        if (body.cardNo) {
          const userCardNoExists = await User.findOne({
            cardNo: body.cardNo
          });
          if (userCardNoExists) {
            throw new HttpError(409, `会员卡号${body.cardNo}已被使用.`);
          }
        }
        if (body.idCardNo) {
          body.idCardNo = body.idCardNo.replace("*", "X").toUpperCase();
          const userIdCardNoExists = await User.findOne({
            idCardNo: body.idCardNo
          });
          if (userIdCardNoExists) {
            throw new HttpError(409, `身份证号${body.idCardNo}已被使用.`);
          }
        }
        const user = new User(body);
        if (body.idCardNo) {
          const idCardInfo = idCard.info(body.idCardNo);
          if (!idCardInfo.valid) {
            throw new HttpError(400, `非法身份证号`);
          }
          user.gender = idCardInfo.gender === "M" ? "男" : "女";
          user.region = `${idCardInfo.province.text} ${idCardInfo.city.text} ${idCardInfo.area.text}`;
          user.constellation = idCardInfo.constellation;
          user.birthday = idCardInfo.birthday
            .toString()
            .replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
        }
        await user.save();

        user.password = undefined;

        res.json(user);
      })
    )

    // get all the users
    .get(
      paginatify,
      handleAsyncErrors(async (req, res) => {
        if (!["admin", "manager"].includes(req.user.role)) {
          // TODO should restrict manager user list to own store booking
          throw new HttpError(403);
        }
        const queryParams = req.query as UserQuery;
        const { limit, skip } = req.pagination;
        const query = User.find();
        const sort = parseSortString(queryParams.order) || {
          createdAt: -1
        };

        const $and = []; // combine all $or conditions into one $and

        if (queryParams.keyword) {
          $and.push({
            // mobile: new RegExp(queryParams.keyword)
            $text: { $search: queryParams.keyword }
          });
        }

        if (queryParams.role) {
          query.find({ role: queryParams.role });
        }

        if (queryParams.membership) {
          const membershipConditions = {
            deposit: { balanceDeposit: { $gt: 0 } }
          };
          $and.push({
            $or: queryParams.membership.map(type => membershipConditions[type])
          });
        }

        if (queryParams.cardTypes) {
          query.find({ cardType: { $in: queryParams.cardTypes } });
        }

        if ($and.length) {
          query.find({ $and });
        }

        let total = await query.countDocuments();
        const [{ totalBalance } = { totalBalance: 0 }] = await User.aggregate([
          //@ts-ignore
          { $match: query._conditions },
          {
            $group: {
              _id: null,
              totalBalance: {
                $sum: { $sum: ["$balanceDeposit"] }
              }
            }
          }
        ]);

        const page = await query
          .find()
          .sort(sort)
          .limit(limit)
          .skip(skip)
          .exec();

        if (skip + page.length > total) {
          total = skip + page.length;
        }

        res.set("total-balance", Math.round(totalBalance));

        res.paginatify(limit, skip, total).json(page);
      })
    );

  router
    .route("/user/:userId")

    .all(
      handleAsyncErrors(async (req, res, next) => {
        const user = await User.findById(req.params.userId);
        if (
          !["admin", "manager"].includes(req.user.role) &&
          req.user.id !== req.params.userId
        ) {
          throw new HttpError(403);
        }
        if (!user) {
          throw new HttpError(404, `User not found: ${req.params.userId}`);
        }

        req.item = user;
        next();
      })
    )

    // get the user with that id
    .get(
      handleAsyncErrors(async (req, res) => {
        const user = req.item;
        res.json(user);
      })
    )

    .put(
      handleAsyncErrors(async (req, res) => {
        const body = req.body as UserPutBody;
        if (req.user.role !== "admin") {
          [
            "role",
            "openid",
            "cardType",
            "balanceDeposit",
            "balanceReward"
          ].forEach(f => {
            delete body[f];
          });
        }
        if (!["admin", "manager"].includes(req.user.role)) {
          ["cardNo"].forEach(f => {
            delete body[f];
          });
        }
        const user = req.item as DocumentType<IUser>;
        if (body.password) {
          console.log(`[USR] User ${user.id} password reset.`);
          body.password = await hashPwd(body.password);
        }
        if (body.mobile) {
          const userMobileExists = await User.findOne({
            mobile: body.mobile,
            _id: { $ne: user.id }
          });
          if (userMobileExists) {
            throw new HttpError(409, `手机号${body.mobile}已被使用`);
          }
        }
        if (body.cardNo) {
          const userCardNoExists = await User.findOne({
            cardNo: body.cardNo,
            _id: { $ne: user.id }
          });
          if (userCardNoExists) {
            throw new HttpError(409, `会员卡号${body.cardNo}已被使用`);
          }
        }
        if (body.idCardNo) {
          body.idCardNo = body.idCardNo.replace("*", "X").toUpperCase();
          const userIdCardNoExists = await User.findOne({
            idCardNo: body.idCardNo,
            _id: { $ne: user.id }
          });
          if (userIdCardNoExists) {
            throw new HttpError(409, `身份证号${body.idCardNo}已被使用`);
          }
        }
        if (body.isForeigner) {
          if (!body.country) {
            throw new HttpError(400, "外籍用户必须录入国籍");
          }
        }

        user.set(body);

        if (body.idCardNo) {
          const idCardInfo = idCard.info(body.idCardNo);
          if (!idCardInfo.valid) {
            throw new HttpError(400, `非法身份证号`);
          }
          user.gender = idCardInfo.gender === "M" ? "男" : "女";
          user.region = `${idCardInfo.province.text} ${idCardInfo.city.text} ${idCardInfo.area.text}`;
          user.constellation = idCardInfo.constellation;
          user.birthday = idCardInfo.birthday
            .toString()
            .replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
        }

        if (body.cardNo) {
          console.log(
            `[USR] User ${user.id} card number set to ${user.cardNo}.`
          );
        }
        await user.save();

        user.password = undefined;

        res.json(user);
      })
    )

    // delete the user with this id
    .delete(
      handleAsyncErrors(async (req, res) => {
        if (req.user.role !== "admin") {
          throw new HttpError(403);
        }
        const user = req.item;
        await user.remove();
        res.end();
      })
    );

  return router;
};
