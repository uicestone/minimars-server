import {
  prop,
  getModelForClass,
  plugin,
  DocumentType,
  pre
} from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";
import { User } from "./User";
import autoPopulate from "./plugins/autoPopulate";
import {
  appendResizeImageUrl,
  appendResizeHtmlImage,
  removeResizeImageUrl,
  removeResizeHtmlImage
} from "../utils/imageResize";
import moment from "moment";

@plugin(updateTimes)
@plugin(autoPopulate, ["author"])
@pre("validate", function (this: DocumentType<Post>, next) {
  if (this.tags) {
    this.tags = this.tags.map(t => t.toLowerCase());
  }
  next();
})
export class Post {
  @prop({ required: true })
  title: string;

  @prop({ unique: true, sparse: true })
  slug?: string;

  @prop({ type: String })
  tags: string[];

  @prop({
    type: Date,
    get: v => v && moment(v).format("YYYY-MM-DD"),
    set: v => v && moment(v).startOf("day").toDate()
  })
  start?: Date;

  @prop({
    type: Date,
    get: v => v && moment(v).format("YYYY-MM-DD"),
    set: v => v && moment(v).endOf("day").toDate()
  })
  end?: Date;

  @prop({
    required: true,
    get: v => appendResizeImageUrl(v),
    set: v => removeResizeImageUrl(v)
  })
  posterUrl: string;

  @prop({
    get: v => appendResizeHtmlImage(v),
    set: v => removeResizeHtmlImage(v)
  })
  content?: string;

  @prop()
  target?: string;

  @prop({ ref: "User", required: true })
  author: DocumentType<User>;
}

const PostModel = getModelForClass(Post, {
  schemaOptions: {
    toJSON: {
      getters: true,
      transform: function (doc, ret, options) {
        delete ret._id;
        delete ret.__v;
      }
    }
  }
});

export default PostModel;
