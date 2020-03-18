import Agenda from "agenda";
import moment from "moment";
import Booking, { BookingStatuses } from "../models/Booking";
import { icCode10To8, sleep } from "./helper";

const agenda = new Agenda({
  db: {
    address: process.env.MONGODB_URL,
    options: {
      useNewUrlParser: true
    }
  }
});

agenda.define("cancel expired pending bookings", async (job, done) => {
  console.log(`[CRO] Start cancel expired pending bookings.`);
  const bookings = await Booking.find({
    status: BookingStatuses.PENDING,
    createdAt: {
      $lt: moment()
        .subtract(1, "day")
        .toDate()
    }
  });

  for (const booking of bookings) {
    await booking.cancel();
  }

  done();
});

agenda.define("cancel expired booked bookings", async (job, done) => {
  console.log(`[CRO] Start cancel expired booked bookings.`);
  const bookings = await Booking.find({
    status: BookingStatuses.BOOKED,
    date: {
      $lt: moment().format("YYYY-MM-DD")
    }
  });
  for (const booking of bookings) {
    await booking.cancel();
  }

  done();
});

agenda.define("finish expired booked bookings", async (job, done) => {
  console.log(`[CRO] Start finish expired booked bookings.`);
  const bookings = await Booking.find({
    status: BookingStatuses.BOOKED,
    date: {
      $lt: moment().format("YYYY-MM-DD")
    }
  });
  for (const booking of bookings) {
    await booking.finish();
  }

  done();
});

agenda.define("finish overtime served bookings", async (job, done) => {
  console.log(`[CRO] Start finish overtime served bookings.`);
  const bookings = await Booking.find({
    status: BookingStatuses.IN_SERVICE,
    date: { $lte: moment().format("YYYY-MM-DD") }
  });
  for (const booking of bookings) {
    if (
      moment(`${booking.date} ${booking.checkInAt}`)
        .add(booking.hours + 1, "hours")
        .toDate() < new Date()
    ) {
      await booking.finish();
    }
  }

  done();
});

agenda.on("ready", () => {
  agenda.every("1 hour", "cancel expired pending bookings");
  agenda.every("1 hour", "finish expired booked bookings");
  // agenda.every("1 day", "cancel expired booked bookings");
  agenda.every("5 minutes", "finish overtime served bookings");
  // agenda.now("generate 8 digit card no");
});

export default agenda;
