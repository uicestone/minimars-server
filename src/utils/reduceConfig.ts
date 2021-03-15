import { DocumentType } from "@typegoose/typegoose";
import { Config, ConfigDocument } from "../models/Config";

export default (items: DocumentType<ConfigDocument>[]) => {
  return items.reduce((acc, cur) => {
    const curObj = cur.toObject();
    ["_id", "__v", "createdAt", "updatedAt"].forEach(k => {
      delete curObj[k];
    });
    return Object.assign(acc, curObj);
  }, {} as Config);
};
