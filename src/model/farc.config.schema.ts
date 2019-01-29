import {
  Schema,
} from "mongoose";

export let farcConfigSchema = new Schema({
  name: String,
  value: Object,

});
