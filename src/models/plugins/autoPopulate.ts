function autoPopulate(schema, options) {
  const populates = options;

  async function postFindOne(doc) {
    if (!doc) {
      return;
    }
    await Promise.all(
      populates.map(populate => {
        return doc.populate(populate).execPopulate();
      })
    );
  }

  async function postFind(docs) {
    await Promise.all(
      populates.map(populate => {
        if (this.options.skipAutoPopulationPaths?.includes(populate.path)) {
          return;
        }
        // console.log("Populate:", this.model, populate, docs.length);
        return this.model.populate(docs, populate);
      })
    );
  }

  schema.post("find", postFind);
  schema.post("findOne", postFindOne);
  schema.post("save", postFindOne);
}

export default autoPopulate;
