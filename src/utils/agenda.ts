import Agenda from "agenda";
import moment from "moment";
import Booking, { BookingStatus } from "../models/Booking";
import { MongoClient } from "mongodb";
import Card, { CardStatus } from "../models/Card";
import Gift from "../models/Gift";
import CardType from "../models/CardType";
import Event from "../models/Event";
import Post from "../models/Post";
import Store from "../models/Store";
import { saveContentImages } from "./helper";
import importPrevData from "./importPrevData";
import User from "../models/User";

let agenda: Agenda;

export const initAgenda = async () => {
  const client = new MongoClient(process.env.MONGODB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  await client.connect();

  agenda = new Agenda({ mongo: client.db() });

  agenda.define("cancel expired pending bookings", async (job, done) => {
    const bookings = await Booking.find({
      status: BookingStatus.PENDING,
      createdAt: {
        $lt: moment().subtract(1, "day").toDate()
      }
    });

    if (bookings.length) {
      console.log(`[CRO] Cancel expired pending bookings...`);
    }

    for (const booking of bookings) {
      await booking.cancel();
    }

    done();
  });

  agenda.define("cancel expired booked bookings", async (job, done) => {
    const bookings = await Booking.find({
      status: BookingStatus.BOOKED,
      date: {
        $lt: moment().format("YYYY-MM-DD")
      }
    });

    if (bookings.length) {
      console.log(`[CRO] Cancel expired booked bookings...`);
    }

    for (const booking of bookings) {
      await booking.cancel();
    }

    done();
  });

  agenda.define("cancel expired pending cards", async (job, done) => {
    const cards = await Card.find({
      status: CardStatus.PENDING,
      createdAt: {
        $lt: moment().subtract(1, "day").toDate()
      }
    });

    if (cards.length) {
      console.log(`[CRO] Cancel expired pending cards...`);
    }

    for (const card of cards) {
      card.status = CardStatus.CANCELED;
      await card.save();
    }

    done();
  });

  agenda.define("import prev data", async (job, done) => {
    await importPrevData(job.attrs.data.database, job.attrs.data.storeKey);
    console.log("Previous data imported.");
    done();
  });

  agenda.define("create indexes", async (job, done) => {
    User.createIndexes();
    console.log("Index created.");
    done();
  });

  agenda.define("save image from content", async (job, done) => {
    console.log(`[CRO] Save image from content...`);
    const cardTypes = await CardType.find();
    const events = await Event.find();
    const gifts = await Gift.find();
    const posts = await Post.find();
    const stores = await Store.find();
    for (const documents of [cardTypes, events, gifts, posts, stores]) {
      for (const document of documents) {
        if (!document.content) continue;
        document.content = saveContentImages(document.content);
        // @ts-ignore
        document.save();
      }
    }
    console.log(`[CRO] Saved image from content.`);
    done();
  });

  agenda.start();

  agenda.on("ready", () => {
    agenda.every("4 hours", "cancel expired pending bookings");
    agenda.every("4 hours", "cancel expired pending cards");
    // agenda.every("1 day", "cancel expired booked bookings");
    // agenda.now("create indexes");
  });

  agenda.on("error", err => {
    console.error(err.message);
  });
};

export default agenda;
