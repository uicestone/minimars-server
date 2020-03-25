import Config, { IConfig } from "../models/Config";
import reduceConfig from "./reduceConfig";
import moment from "moment";

const { DEBUG } = process.env;

export default async (config: IConfig) => {
  const existingConfig = reduceConfig(await Config.find());
  const initConfigItemsInsert = Object.keys(initConfig)
    .filter(key => existingConfig[key] === undefined)
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
  depositLevels: [
    {
      slug: "gift-1000",
      desc: "礼品卡1000元",
      price: 1000,
      cardType: "",
      isGift: true,
      depositBalance: 1000,
      rewardBalance: 200
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
  sockPrice: 0,
  kidFullDayPrice: 248,
  extraParentFullDayPrice: 50,
  freeParentsPerKid: 1,
  coupons: []
};
