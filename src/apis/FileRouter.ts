import sha1 from "sha1";
import multer, { diskStorage } from "multer";
import handleAsyncErrors from "../utils/handleAsyncErrors";
import File, { IFile } from "../models/File";
import HttpError from "../utils/HttpError";

const storage = diskStorage({
  destination: function(req, file, cb) {
    cb(null, __dirname + "/../../uploads/");
  },
  filename: function(req: any, file, cb) {
    const extension = file.originalname.match(/^.*(\..*?)$/)[1];
    cb(null, sha1(req.user._id + Date.now()).substr(0, 16) + extension);
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
        const filePathRelative = req.file.path.replace(
          __dirname.replace("/src/apis", "") + "/",
          ""
        );
        console.log(filePathRelative);
        const file = new File() as IFile;
        file.name = req.file.originalname;
        file.uri = filePathRelative;

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
