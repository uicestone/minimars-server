import { Request, Response, NextFunction } from "express";

const handleAsyncErrors = (fn: Function) => (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default handleAsyncErrors;
