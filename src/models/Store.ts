import { prop, getModelForClass, plugin } from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";
import {
  appendResizeImageUrl,
  appendResizeHtmlImage
} from "../utils/imageResize";

@plugin(updateTimes)
export class Store {
  @prop({ unique: true })
  name: string;

  @prop()
  address: string;

  @prop()
  phone: string;

  @prop({
    required: true,
    get: v => appendResizeImageUrl(v),
    set: v => v
  })
  posterUrl: string;

  @prop({ get: v => appendResizeHtmlImage(v), set: v => v })
  content?: string;

  @prop()
  partyRooms: number;

  @prop()
  ip: string;
}

const storeModel = getModelForClass(Store, {
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

export default storeModel;
