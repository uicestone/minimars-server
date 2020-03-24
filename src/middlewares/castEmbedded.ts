export default async function(req, res, next) {
  const objectKeys = [
    "card",
    "store",
    "user",
    "customer",
    "author",
    "event",
    "gift"
  ];
  for (let key in req.body) {
    if (
      req.body[key] instanceof Object &&
      objectKeys.includes(key) &&
      req.body[key].id
    ) {
      req.body[key] = req.body[key].id;
    }
    objectKeys.forEach(key => {
      if (req.body[key + "Id"]) {
        req.body.key = req.body[key + "Id"];
        delete req.body[key + "Id"];
      }
    });
    if (["payments", "cards"].includes(key) && Array.isArray(req.body[key])) {
      req.body[key] = req.body[key].map(item => item.id || item);
    }
  }
  next();
}
