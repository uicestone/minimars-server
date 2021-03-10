import { Schema, Document, Query } from "mongoose";
import { TimeStamps } from "@typegoose/typegoose/lib/defaultClasses";

interface TimeStampDocument extends Document {} // have the interface to add the types of "Base" to the class
class TimeStampDocument extends TimeStamps {} // have your class

function updateTimes(schema: Schema): void {
  schema.add({ createdAt: Date });
  schema.add({ updatedAt: Date });

  schema.index({ createdAt: -1 });
  schema.index({ updatedAt: -1 });

  schema.pre("save", function (this: TimeStampDocument) {
    this.updatedAt = new Date();
    if (this.isNew && !this.createdAt) {
      this.createdAt = new Date();
    }
  });

  schema.pre("findOneAndUpdate", function (this: Query<TimeStampDocument>) {
    const timestamps = {
      createdAt: new Date(),
      updatedAt: new Date()
    };
    // @ts-ignore
    Object.assign(this._update.$setOnInsert, timestamps);
  });
}

export default updateTimes;
