import Config, { IConfig } from "../models/Config";
import reduceConfig from "./reduceConfig";
import moment from "moment";

const { DEBUG } = process.env;

export default async (config: IConfig) => {
  const existingConfig = reduceConfig(await Config.find());
  const initConfigItemsInsert = Object.keys(initConfig)
    .filter(key => !existingConfig[key])
    .map(initKey => ({ [initKey]: initConfig[initKey] }));
  if (initConfigItemsInsert.length) {
    await Config.insertMany(initConfigItemsInsert);
    console.log(
      `[SYS] ${initConfigItemsInsert.length} config items initialized.`
    );
  }
  Object.assign(config, ...initConfigItemsInsert, existingConfig);
  if (!DEBUG) {
    console.log("[CFG] Loaded:", JSON.stringify(config));
  }
};

const initConfig: IConfig = {
  cardTypes: {},
  depositLevels: [
    {
      slug: "gift-1000",
      desc: "礼品卡1000元",
      price: 1000,
      cardType: "",
      isGift: true,
      depositCredit: 1000,
      rewardCredit: 200
    },
    {
      slug: "year-2020",
      desc: "2020年卡",
      price: 5888,
      cardType: "年卡",
      freePlayFrom: moment("2020-01-01")
        .startOf("month")
        .toDate(),
      freePlayTo: moment("2020-12-31")
        .endOf("month")
        .toDate()
    }
  ],
  hourPriceRatio: [1, 0.5, 0.5],
  hourPrice: 158,
  sockPrice: 10,
  fullDayPrice: 200,
  kidHourPrice: 33,
  kidFullDayPrice: 33,
  coupons: []
};
