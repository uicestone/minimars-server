import { sign, verify } from "jsonwebtoken";
import { hash, compare } from "bcryptjs";
import { User } from "../models/User";
import { DocumentType } from "@typegoose/typegoose";
import { getExtension } from "mime";
import { writeFileSync } from "fs";
import { createHash } from "crypto";
import { config } from "../models/Config";
import moment from "moment";

interface TokenData {
  userId: number;
  userRole: string;
}
const { APP_SECRET = "test123456" } = process.env;

export const hashPwd = (password: string) => hash(password, 10);

export const comparePwd = (password: string, hashPassword: string) =>
  compare(password, hashPassword);

export const signToken = (user: DocumentType<User>): string => {
  return sign(
    {
      userId: user.id,
      userRole: user.role
    },
    APP_SECRET
  );
};
export const verifyToken = (token: string): TokenData =>
  verify(token, APP_SECRET) as TokenData;

export const getTokenData = (token: string): TokenData => {
  token = token.replace(/^Bearer /, "");
  return verifyToken(token);
};

export const sleep = async (milliseconds = 500) => {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
};

export const isValidHexObjectId = (id: string) => {
  return id.match(/^[0-9a-fA-F]{24}$/);
};

export const saveContentImages = (content: string) => {
  if (!content.match(";base64,")) {
    return content;
  }
  const srcs = content.match(/src="data:image(.*?)"/g);
  if (!srcs) return;
  srcs.map(src => {
    const [, mime, base64] = src.match(/^src="data:(.*?);base64,(.*?)"$/) || [];
    console.log(`[HLP] Found base64 of ${mime}.`);
    const ext = getExtension(mime);
    const data = Buffer.from(base64, "base64");
    const filename = createHash("sha1").update(data).digest("hex") + "." + ext;
    const path = process.cwd() + "/uploads/" + filename;
    writeFileSync(path, data);
    console.log(`[HLP] Base64 saved to file ${filename}.`);
    content = content.replace(
      src,
      `src="${process.env.UPLOAD_BASE}uploads/${filename}"`
    );
  });
  return content;
};

export const isOffDay = (date: string) => {
  if (config.offWeekdays?.includes(date)) {
    return true;
  }
  if (config.onWeekends?.includes(date)) {
    return false;
  }
  return [0, 6].includes(moment(date).day());
};
