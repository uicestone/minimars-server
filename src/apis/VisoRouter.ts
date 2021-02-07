import { Router, Request, Response } from "express";
import handleAsyncErrors from "../utils/handleAsyncErrors";

export default (router: Router) => {
  router.route("/viso/push").post(
    handleAsyncErrors(async (req: Request, res: Response) => {
      req.body.faces.forEach(face => {
        delete face.image;
        delete face.irimg;
        delete face.orgimg;
        console.log(
          face.userId,
          face.name,
          face.score,
          face.similarity,
          face.temperature,
          face.timestamp
        );
      });
    })
  );

  return router;
};