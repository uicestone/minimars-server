import moment from "moment";
import { Socket } from "net";
import { JxCtl } from "jingxing-doors";
import {
  prop,
  getModelForClass,
  plugin,
  DocumentType,
  modelOptions,
  Severity
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
import UserModel from "./User";
import WebSocket from "ws";

export const storeDoors: { [storeId: string]: Door[] } = {};
export const storeServerSockets: { [storeId: string]: Socket } = {};

class DailyLimitDate {
  @prop({ required: true })
  date!: string;
  @prop({ required: true })
  group!: string;
  @prop({ type: Number, required: true })
  limit!: number;
}

class DailyLimit {
  @prop({ type: Number, required: true })
  common!: number[];
  @prop({ type: Number, required: true })
  coupon!: number[];
  @prop({ type: DailyLimitDate, required: true })
  dates!: DailyLimitDate[];
}

class Door {
  @prop({ required: true })
  ip!: string;
  @prop({ required: true })
  name!: string;
  @prop()
  io!: "in" | "out";
  controller?: JxCtl;
}

export class FaceDevice {
  ws?: WebSocket;

  @prop({ required: true })
  mac!: string;

  @prop()
  storeCode?: string;

  @prop({ required: true })
  name!: string;

  @prop({ required: true })
  io!: "in" | "out";
}

@plugin(updateTimes)
@modelOptions({ options: { allowMixed: Severity.ALLOW } })
export class Store {
  @prop({ unique: true })
  name!: string;

  @prop({ unique: true })
  code!: string;

  @prop()
  address!: string;

  @prop()
  phone!: string;

  @prop({
    required: true,
    get: v => appendResizeImageUrl(v),
    set: v => removeResizeImageUrl(v)
  })
  posterUrl!: string;

  @prop({
    get: v => appendResizeHtmlImage(v),
    set: v => removeResizeHtmlImage(v)
  })
  content?: string;

  @prop({
    default: { common: [], coupon: [], dates: [] }
  })
  dailyLimit: DailyLimit = { common: [], coupon: [], dates: [] };

  @prop()
  partyRooms?: number;

  @prop({ type: Door })
  doors?: Door[];

  @prop({ type: FaceDevice })
  faceDevices?: FaceDevice[];

  @prop()
  ip?: string;

  @prop({ type: Object })
  pospalPaymentMethodMap?: Record<string, PaymentGateway>;

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
      door.controller?.registerCard(no, moment().format("YYYY-MM-DD"));
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
      return;
    }
    door.controller?.openDoor(0); // assume 1-1 controller-door, so each controller has only 1 door
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
      door.controller?.init();
    }
  }

  async syncPospalTickets(from: string | number, to?: string) {
    if (process.env.DISABLE_POSPAL_SYNC) {
      console.log(
        "Mock sync pospal tickets:",
        this.code,
        moment().format("HH:mm:ss")
      );
      return;
    }

    const pospal = new Pospal(this.code);
    const result: Ticket[] =
      typeof from === "number"
        ? await pospal.queryTickets(from)
        : await pospal.queryMultiDateTickets(from, to);

    let invalidPaymentMethodCodes: string[] = [];
    result.forEach(t => {
      t.payments.forEach(p => {
        if (
          !this.pospalPaymentMethodMap?.[p.code] &&
          !invalidPaymentMethodCodes.includes(p.code)
        ) {
          invalidPaymentMethodCodes.push(p.code);
        }
      });
    });
    if (invalidPaymentMethodCodes.length) {
      pospal.queryAllPayMethod().then((methods: { code: string }[]) => {
        const methodsUndefined = methods.filter(m =>
          invalidPaymentMethodCodes.includes(m.code)
        );
        for (const method of methodsUndefined) {
          console.error(
            `[STR] Need method ${JSON.stringify(method)} to be configured at ${
              this.code
            }.`
          );
        }
      });
      throw new Error("invalid_payment_code");
    }
    if (typeof from !== "number") {
      console.log(`[STR] Fetched ${result.length} Pospal tickets.`);
    }
    let insertBookings = 0;
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
          createdAt: new Date(ticket.datetime),
          remarks: ticket.items.map(i => `${i.name}×${i.quantity}`).join("\n")
        });

        if (ticket.customerUid) {
          const customer = await UserModel.findOne({
            pospalId: ticket.customerUid.toString()
          });
          if (customer) {
            booking.customer = customer;
          } else {
            console.error(
              `[STR] Failed to find customer when sync booking from Pospal, booking ${booking.id} customerUid ${ticket.customerUid}.`
            );
          }
        }

        const payments = ticket.payments
          .map(p => {
            const payment = new PaymentModel({
              scene: Scene.FOOD,
              paid: true,
              title: "餐饮消费",
              customer: booking.customer,
              store: this,
              amount: p.amount,
              attach: `booking ${booking.id}`,
              gateway: this.pospalPaymentMethodMap?.[p.code],
              gatewayData: { provider: "pospal" },
              createdAt: new Date(ticket.datetime)
            });
            return payment;
          })
          // drop internal payment
          .filter(p => p.gateway !== PaymentGateway.Internal);

        booking.payments = payments;

        await booking.save(); // may throw duplicate error so skip payment saving below
        insertBookings++;
        await Promise.all(
          payments.map(async p => {
            if (p.gateway === PaymentGateway.Balance) {
              if (!p.customer) return;
              const { depositPaymentAmount } = await p.customer.writeOffBalance(
                p.amount,
                0,
                0,
                true,
                false
              );
              p.amountDeposit = depositPaymentAmount;
            }
            await p.save();
          })
        );
      } catch (e) {
        if (e.code === 11000) {
        } else if (e.message === "insufficient_balance") {
        } else {
          console.error(e);
        }
        continue;
      }
    }
    if (typeof from !== "number" || insertBookings) {
      console.log(`[STR] Created ${insertBookings} food bookings.`);
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
