/**
 * Created by hb on 19.08.16.
 */

import {
  Schema,
} from "mongoose";

export let farcUserSchema = new Schema({
  // user
  uid: String,
  name: String,
  vorname: String,
  mail: String,
  roles: [String],  // dn (sinnvoll?)
});
