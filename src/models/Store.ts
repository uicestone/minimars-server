import { prop, getModelForClass, plugin } from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";

@plugin(updateTimes)
export class Store {
  @prop({ unique: true })
  name: string;

  @prop()
  address: string;

  @prop()
  phone: string;

  @prop()
  content: string;

  @prop()
  posterUrl: string;

  @prop()
  partyRooms: number;

  @prop()
  ip: string;
}

const storeModel = getModelForClass(Store, {
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

export default storeModel;
