import multer, { diskStorage } from "multer";
import { createHash } from "crypto";
import { renameSync } from "fs";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import File, { IFile } from "../models/File";
import HttpError from "../utils/HttpError";

const storage = diskStorage({
  destination: function(req, file, cb) {
    cb(null, process.cwd() + "/uploads/");
  },
  filename: function(req: any, file, cb) {
    const hash = createHash("sha1");
    const extension = file.originalname.match(/^.*(\..*?)$/)[1];
    // @ts-ignore/
    file.stream.on("data", data => {
      hash.update(data);
    });
    // @ts-ignore/
    file.stream.on("end", () => {
      const hex = hash.digest("hex");
      // @ts-ignore
      file.hashedFullName = hex + extension;
      console.log("file hashed");
    });
    cb(null, `tmp-${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage: storage });

export default router => {
  // File CURD
  router
    .route("/file")

    // create a file
    .post(
      upload.single("file"),
      handleAsyncErrors(async (req, res) => {
        renameSync(
          req.file.path,
          req.file.destination + req.file.hashedFullName
        );
        const fileUriPrefix = "uploads/" + req.file.hashedFullName;
        const file = new File() as IFile;
        file.name = req.file.originalname;
        file.uri = fileUriPrefix;
        await file.save();
        res.json(file);
      })
    );

  router
    .route("/file/:fileId")

    .all(
      handleAsyncErrors(async (req, res, next) => {
        const file = await File.findById(req.params.fileId);
        if (!file) {
          throw new HttpError(404, `找不到文件：${req.params.fileId}`);
        }
        req.item = file;
        next();
      })
    )

    // get the file with that id
    .get(
      handleAsyncErrors(async (req, res) => {
        const file = req.item;
        res.json(file);
      })
    )

    // delete the file with this id
    .delete(
      handleAsyncErrors(async (req, res) => {
        const file = req.item;
        await file.remove();
        // TODO unlink file
        res.end();
      })
    );

  return router;
};
