import { Router, Request, Response, NextFunction } from "express";
import multer, { diskStorage } from "multer";
import { createHash } from "crypto";
import { renameSync } from "fs";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import FileModel, { File } from "../models/File";
import HttpError from "../utils/HttpError";
import { DocumentType } from "@typegoose/typegoose";

const storage = diskStorage({
  destination: function (req, file, cb) {
    cb(null, process.cwd() + "/uploads/");
  },
  filename: function (req: any, file, cb) {
    const hash = createHash("sha1");
    const extension = file.originalname.match(/^.*(\..*?)$/)?.[1];
    // @ts-ignore/
    file.stream.on("data", data => {
      hash.update(data);
    });
    // @ts-ignore/
    file.stream.on("end", () => {
      const hex = hash.digest("hex");
      // @ts-ignore
      file.hashedFullName = hex + extension;
    });
    cb(null, `tmp-${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage: storage });

export default (router: Router) => {
  // File CURD
  router
    .route("/file")

    // create a file
    .post(
      upload.single("file"),
      handleAsyncErrors(async (req: Request, res: Response) => {
        renameSync(
          req.file.path,
          // @ts-ignore
          req.file.destination + req.file.hashedFullName
        );
        // @ts-ignore
        const fileUriPrefix = "uploads/" + req.file.hashedFullName;
        const file = new FileModel();
        file.name = req.file.originalname;
        file.uri = fileUriPrefix;
        await file.save();
        res.json(file);
      })
    );

  router
    .route("/file/:fileId")

    .all(
      handleAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
          const file = await FileModel.findById(req.params.fileId);
          if (!file) {
            throw new HttpError(404, `找不到文件：${req.params.fileId}`);
          }
          req.item = file;
          next();
        }
      )
    )

    // get the file with that id
    .get(
      handleAsyncErrors(async (req: Request, res: Response) => {
        const file = req.item;
        res.json(file);
      })
    )

    // delete the file with this id
    .delete(
      handleAsyncErrors(async (req: Request, res: Response) => {
        const file = req.item as DocumentType<File>;
        await file.remove();
        // TODO unlink file
        res.end();
      })
    );

  return router;
};
