import Config, { Config as IConfig } from "../models/Config";
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
      `[CFG] ${initConfigItemsInsert.length} config items initialized.`
    );
  }
  Object.assign(config, ...initConfigItemsInsert, existingConfig);
  if (!DEBUG) {
    console.log("[CFG] Loaded:", JSON.stringify(config));
  }
};

const initConfig: IConfig = {
  sockPrice: 0,
  kidFullDayPrice: 248,
  extraParentFullDayPrice: 50,
  freeParentsPerKid: 1,
  appointmentDeadline: "16:00:00",
  eventHint: "",
  playHint: "",
  offWeekdays: [],
  onWeekends: []
};
