import { User } from "../models/User";
import { DocumentType } from "@typegoose/typegoose";
import { Document } from "mongoose";

declare module "express-serve-static-core" {
  interface Request {
    user: DocumentType<User>;
    ua: { isWechat?: boolean };
    pagination: { limit: number; skip: number };
    item?: Document;
  }
  interface Response {
    paginatify: (limit: number, skip: number, total: number) => Response;
  }
}
