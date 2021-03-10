import { Schema, Document, ModelPopulateOptions } from "mongoose";

function autoPopulate(schema: Schema, options: ModelPopulateOptions[]): void {
  const populates = options;

  async function postFindOne(doc: Document) {
    if (!doc) {
      return;
    }
    await Promise.all(
      populates.map(populate => {
        return doc.populate(populate).execPopulate();
      })
    );
  }

  async function postFind(docs: Document) {
    await Promise.all(
      populates.map(populate => {
        // @ts-ignore
        if (this.options.skipAutoPopulationPaths?.includes(populate.path)) {
          return;
        }
        // console.log("Populate:", this.model, populate, docs.length);
        // @ts-ignore
        return this.model.populate(docs, populate);
      })
    );
  }

  schema.post("find", postFind);
  schema.post("findOne", postFindOne);
  schema.post("save", postFindOne);
}

export default autoPopulate;
