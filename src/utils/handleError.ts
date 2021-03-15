import { NextFunction, Request, Response } from "express";
import HttpError from "./HttpError";

export default (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message });
  } else if (
    err.name === "MongoError" &&
    err.message.match(
      /collection: .*?\.(.*?) index: (.*?) dup key: { (.*?): (.*?) }$/
    )
  ) {
    const match = err.message.match(
      /collection: .*?\.(.*?) index: (.*?) dup key: { (.*?): (.*?) }$/
    );
    let message = "";
    if (match) {
      message = `字段重复："${match[1]}" "${match[2].replace(
        /_\d+_?/g,
        ", "
      )}": ${match[4]}`;
    } else {
      message = `字段重复`;
    }
    res.status(409).json({ message });
  } else if (err.name === "ValidationError") {
    res.status(400).json({
      // @ts-ignore
      message: Object.values(err.errors)
        // @ts-ignore
        .map(e => e.message)
        .join("\n")
    });
  } else {
    console.error(`${err.name}: ${err.message}`, "\n[Stack]", err.stack);
    res.status(500).send("Internal server error.");
  }
};
