/**
 * Created by hb on 10.04.17.
 */

/**
 * Userdaten im Session-Objekt -> req["session"]["data"]
 */
export interface FarcSession {
  uid: string;
  name: string;
  vorname: string;
  mail: string;
  oe: string;
  admin: boolean;
}
