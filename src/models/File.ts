import { prop, getModelForClass, plugin } from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";

@plugin(updateTimes)
export class File {
  @prop()
  uri: string;

  @prop()
  thumbnailUrl: string;

  @prop()
  name: string;

  get url() {
    const uploadBase = process.env.UPLOAD_BASE;
    if (!uploadBase) return;
    return uploadBase + this.uri;
  }
}

const fileModel = getModelForClass(File, {
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

export default fileModel;
