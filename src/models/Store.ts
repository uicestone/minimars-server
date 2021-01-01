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
import BookingModel, { BookingStatus } from "./Booking";
import Pospal, { Ticket } from "../utils/pospal";
import PaymentModel, { PaymentGateway, Scene } from "./Payment";
import { config } from "./Config";

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

  async syncPospalTickets(from: string | number, to?: string) {
    const pospal = new Pospal(this.code);
    const result: Ticket[] =
      typeof from === "number"
        ? await pospal.queryTickets(from)
        : await pospal.queryMultiDateTickets(from, to);

    result.forEach(t => {
      t.payments.forEach(p => {
        if (!config.pospalPaymentMethodMap[p.code]) {
          pospal.queryAllPayMethod().then(methods => {
            const method = methods.find(m => m.code === "payCode_107");
            console.error(
              `[STR] Need code ${p.code} (${JSON.stringify(
                method
              )}) to be configured.`
            );
          });
          throw new Error("invalid_payment_code");
        }
      });
    });
    console.log(`[STR] Fetched ${result.length} Pospal tickets.`);
    for (const ticket of result) {
      if (ticket.invalid) {
        continue;
      }
      try {
        const [date, checkInAt] = ticket.datetime.split(" ");
        const booking = new BookingModel({
          type: Scene.FOOD,
          status: BookingStatus.FINISHED,
          date,
          checkInAt,
          price: ticket.totalAmount,
          store: this, // TODO conditional store
          // TODO booking card
          // TODO booking customer
          providerData: { provider: "pospal", ...ticket, payments: undefined },
          createdAt: new Date(ticket.datetime)
        });

        const payments = ticket.payments.map(p => {
          const payment = new PaymentModel({
            scene: Scene.FOOD,
            paid: true,
            title: "餐饮消费",
            // TODO customer,
            store: this, // TODO conditional store
            amount: p.amount,
            attach: `booking ${booking.id}`,
            gateway: config.pospalPaymentMethodMap[p.code],
            gatewayData: { provider: "pospal" },
            createdAt: new Date(ticket.datetime)
          });
          return payment;
        });

        booking.payments = payments;

        await booking.save();
        await Promise.all(
          payments.map(async p => {
            if (p.gateway === PaymentGateway.Balance) {
              if (p.customer) {
                const {
                  depositPaymentAmount
                } = await p.customer.writeOffBalance(p.amount);
                p.amountDeposit = depositPaymentAmount;
              } else {
                console.error(
                  `[STR] Empty customer in balance payment from Pospal, payment: ${p.id}.`
                );
              }
            }
            await p.save();
          })
        );
      } catch (e) {
        if (e.code === 11000) {
        } else {
          console.error(e);
        }
        continue;
      }
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
