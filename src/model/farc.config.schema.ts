/**
 * Created by hb on 06.02.17.
 */

import {
  Schema,
} from "mongoose";

export let farcConfigSchema = new Schema({
  name: String,
  value: Object,

});
