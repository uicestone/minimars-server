import { Router, Request, Response } from "express";
import handleAsyncErrors from "../utils/handleAsyncErrors";

export default (router: Router) => {
  router.route("/youzan").post(
    handleAsyncErrors(async (req: Request, res: Response) => {
      console.log("[DEBUG] Youzan", req.body);
    })
  );

  return router;
};
