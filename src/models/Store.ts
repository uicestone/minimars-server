import moment from "moment";
import { Socket } from "net";
import { JxCtl } from "jingxing-doors";
import {
  prop,
  getModelForClass,
  plugin,
  DocumentType
} from "@typegoose/typegoose";
import updateTimes from "./plugins/updateTimes";
import {
  appendResizeImageUrl,
  appendResizeHtmlImage,
  removeResizeImageUrl,
  removeResizeHtmlImage
} from "../utils/imageResize";
import { sleep } from "../utils/helper";

export const storeDoors: { [storeId: string]: Door[] } = {};
export const storeServerSockets: { [storeId: string]: Socket } = {};

class DailyLimitDate {
  @prop()
  date: string;
  @prop()
  group: string;
  @prop({ type: Number })
  limit: number;
}

class DailyLimit {
  @prop({ type: Number })
  common: number[];
  @prop({ type: Number })
  coupon: number[];
  @prop({ type: DailyLimitDate })
  dates: DailyLimitDate[];
}

class Door {
  @prop()
  ip: string;
  @prop()
  name: string;
  @prop()
  io: "in" | "out";
  controller?: JxCtl;
}

@plugin(updateTimes)
export class Store {
  @prop({ unique: true })
  name: string;

  @prop({ unique: true })
  code: string;

  @prop()
  address: string;

  @prop()
  phone: string;

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

  @prop({
    default: { common: [], coupon: [], dates: [] }
  })
  dailyLimit: DailyLimit;

  @prop()
  partyRooms: number;

  @prop({ type: Door })
  doors: Door[];

  @prop()
  ip: string;

  async authDoors(this: DocumentType<Store>, no: number) {
    if (no >= Math.pow(2, 32) || no <= 0) {
      console.error(`[STR] Auth number out of range: "${no}"`);
      return;
    }
    const doors = storeDoors[this.id];
    if (!doors) {
      console.error(
        `[STR] Doors has not been registered in store ${this.code}.`
      );
      return;
    }
    for (const door of doors) {
      await sleep(1000);
      console.log(`[STR] Auth ${no} to store ${this.code}.`);
      door.controller.registerCard(no, moment().format("YYYY-MM-DD"));
    }
  }

  openDoor(this: DocumentType<Store>, name: string) {
    const doors = storeDoors[this.id];
    if (!doors) {
      console.error(
        `[STR] Doors has not been registered in store ${this.code}.`
      );
      return;
    }
    const door = doors.find(d => d.name === name);
    if (!door) {
      console.error(`[STR] Door ${name} not found in store ${this.code}.`);
    }
    door.controller.openDoor(0); // assume 1-1 controller-door, so each controller has only 1 door
  }

  async initDoors(this: DocumentType<Store>) {
    const doors = storeDoors[this.id];
    if (!doors) {
      console.error(
        `[STR] Doors has not been registered in store ${this.code}.`
      );
      return;
    }
    for (const door of doors) {
      await sleep(1000);
      door.controller.init();
    }
  }
}

const StoreModel = getModelForClass(Store, {
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

export default StoreModel;
