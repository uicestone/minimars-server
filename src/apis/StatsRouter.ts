import handleAsyncErrors from "../utils/handleAsyncErrors";
import moment from "moment";
import getStats from "../utils/getStats";
import UserModel from "../models/User";
import CardModel, { CardStatus } from "../models/Card";
import StoreModel from "../models/Store";

moment.locale("zh-cn");

export default router => {
  router.route("/stats/user-balance").get(
    handleAsyncErrors(async (req, res) => {
      const [
        { totalBalance, totalBalanceDeposit } = {
          totalBalance: 0,
          totalBalanceDeposit: 0
        }
      ] = await UserModel.aggregate([
        {
          $group: {
            _id: null,
            totalBalanceDeposit: {
              $sum: "$balanceDeposit"
            },
            totalBalanceReward: {
              $sum: "$balanceReward"
            }
          }
        },
        {
          $project: {
            _id: false,
            totalBalanceDeposit: true,
            totalBalance: {
              $sum: ["$totalBalanceDeposit", "$totalBalanceReward"]
            }
          }
        }
      ]);

      const [
        { totalValidCardBalance, totalValidCardBalanceDeposit } = {
          totalValidCardBalance: 0,
          totalValidCardBalanceDeposit: 0
        }
      ] = await CardModel.aggregate([
        { $match: { status: CardStatus.VALID } },
        {
          $group: {
            _id: null,
            totalValidCardBalanceDeposit: {
              $sum: "$price"
            },
            totalValidCardBalance: {
              $sum: "$balance"
            }
          }
        }
      ]);

      res.json({
        totalBalance,
        totalBalanceDeposit,
        totalValidCardBalance,
        totalValidCardBalanceDeposit
      });
    })
  );

  router.route("/stats/times-card").get(
    handleAsyncErrors(async (req, res) => {
      const totalTimesCardByStore: {
        _id: string[];
        times: number;
        priceLeft: number;
      }[] = await CardModel.aggregate([
        {
          $match: {
            timesLeft: { $gt: 0 },
            type: "times",
            expiresAt: { $gte: new Date() }
          }
        },
        {
          $group: {
            _id: "$stores",
            times: { $sum: "$timesLeft" },
            priceLeft: {
              $sum: {
                $multiply: [{ $divide: ["$timesLeft", "$times"] }, "$price"]
              }
            }
          }
        }
      ]);

      const stores = await StoreModel.find();

      const result = totalTimesCardByStore
        .sort((a, b) => {
          return JSON.stringify(a._id) > JSON.stringify(b._id) ? 1 : -1;
        })
        .map(storeGroup => {
          const storeNames =
            stores
              .filter(s => storeGroup._id.map(i => i.toString()).includes(s.id))
              .map(s => s.name)
              .join("，") || "通用";
          return {
            storeNames,
            times: storeGroup.times,
            priceLeft: storeGroup.priceLeft
          };
        });

      res.json(result);
    })
  );

  router.route("/stats/:date?").get(
    handleAsyncErrors(async (req, res) => {
      const dateInput = req.params.date;
      const stats = await getStats(
        dateInput,
        undefined,
        req.query.store || req.user.store
      );
      res.json(stats);
    })
  );

  return router;
};
