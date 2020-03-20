import mongoose, { Schema } from "mongoose";
import updateTimes from "./plugins/updateTimes";
import { IUser } from "./User";
import autoPopulate from "./plugins/autoPopulate";

const Post = new Schema({
  title: { type: String, required: true },
  slug: { type: String, unique: true, sparse: true },
  tags: { type: [String] },
  content: { type: String },
  posterUrl: { type: String },
  author: { type: Schema.Types.ObjectId, ref: "User", required: true }
});

Post.plugin(updateTimes);
Post.plugin(autoPopulate, ["author"]);

Post.set("toJSON", {
  getters: true,
  transform: function(doc, ret, options) {
    delete ret._id;
    delete ret.__v;
  }
});

export interface IPost extends mongoose.Document {
  title: string;
  slug?: string;
  content: string;
  tags: string[];
  posterUrl: string;
  author: IUser;
}

export default mongoose.model<IPost>("Post", Post);
