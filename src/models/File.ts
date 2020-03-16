import mongoose, { Schema } from "mongoose";
import updateTimes from "./plugins/updateTimes";

const File = new Schema({
  uri: String,
  thumbnailUrl: String,
  name: String
});

File.virtual("url").get(function() {
  const uploadBase = process.env.UPLOAD_BASE;
  if (!uploadBase) return;
  return uploadBase + this.uri;
});

File.plugin(updateTimes);

File.set("toJSON", {
  getters: true,
  transform: function(doc, ret, options) {
    delete ret._id;
  }
});

export interface IFile extends mongoose.Document {
  uri: string;
  thumbnailUrl: string;
  name: string;
}

export default mongoose.model("File", File);
