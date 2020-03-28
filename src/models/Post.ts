import {
  prop,
  getModelForClass,
  plugin,
  index,
  DocumentType
} from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";
import { User } from "./User";
import autoPopulate from "./plugins/autoPopulate";

@plugin(updateTimes)
@plugin(autoPopulate, ["author"])
export class Post {
  @prop({ required: true })
  title: string;

  @prop({ unique: true, sparse: true })
  slug?: string;

  @prop()
  content: string;

  @prop()
  tags: string[];

  @prop({ type: String })
  posterUrl: string;

  @prop({ type: String })
  target?: string;

  @prop({ ref: "User", required: true })
  author: DocumentType<User>;
}

const postModel = getModelForClass(Post, {
  schemaOptions: {
    toJSON: {
      getters: true,
      transform: function(doc, ret, options) {
        delete ret._id;
        delete ret.__v;
      }
    }
  }
});

export default postModel;
