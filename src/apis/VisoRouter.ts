import { Router, Request, Response } from "express";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import { Face } from "../utils/Viso";

export default (router: Router) => {
  router.route("/viso/push").post(
    handleAsyncErrors(async (req: Request, res: Response) => {
      req.body.faces.forEach((face: Face) => {
        delete face.image;
        delete face.irimg;
        delete face.orgimg;
        console.log(
          "[VSO]",
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
