import {
  Schema,
} from "mongoose";

/*
 OEs bzw. Abteilungen fuer die Endpunkt-Zuordnung
 */
export let farcOeSchema = new Schema({  // schema
  name: String,  // OE-Bezeichnung
  roles: [ {name: String, dn: String} ], // AD-Rollen mit displayName + distinguishedName
});
