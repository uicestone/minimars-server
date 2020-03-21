import Agenda from "agenda";
import moment from "moment";
import Booking, { BookingStatus } from "../models/Booking";
import { MongoClient } from "mongodb";

let agenda: Agenda;

export const initAgenda = async () => {
  const client = new MongoClient(process.env.MONGODB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  await client.connect();

  agenda = new Agenda({ mongo: client.db() });

  agenda.define("cancel expired pending bookings", async (job, done) => {
    console.log(`[CRO] Cancel expired pending bookings.`);
    const bookings = await Booking.find({
      status: BookingStatus.PENDING,
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
    console.log(`[CRO] Cancel expired booked bookings.`);
    const bookings = await Booking.find({
      status: BookingStatus.BOOKED,
      date: {
        $lt: moment().format("YYYY-MM-DD")
      }
    });
    for (const booking of bookings) {
      await booking.cancel();
    }

    done();
  });

  agenda.define("test", async (job, done) => {
    console.log(`[CRO] Test cron job.`);

    done();
  });

  agenda.start();

  agenda.on("ready", () => {
    agenda.every("1 hour", "cancel expired pending bookings");
    // agenda.every("10 seconds", "test");
    // agenda.every("1 day", "cancel expired booked bookings");
    // agenda.now("generate 8 digit card no");
  });

  agenda.on("error", err => {
    console.error(err.message);
  });
};

export default agenda;
