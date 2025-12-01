// mongo-init/01-create-appuser.js
db = db.getSiblingDB("voicemapdb");

db.createUser({
  user: "appuser",
  pwd: "apppassword",
  roles: [{ role: "readWrite", db: "voicemapdb" }]
});
