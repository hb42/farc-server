import {
  Schema,
} from "mongoose";

export let farcUserSchema = new Schema({
  // user
  uid: String,
  name: String,
  vorname: String,
  mail: String,
  roles: [String],  // dn
});
