import { EventEmitter } from "events";

export class DataEventEmitter extends EventEmitter {

  public evtADready = "ADready";

  public evtReadAdUsers = "readAdUsers";
  public evtReadAdEps = "readAdEps";
  public evtReadAdRoles = "readAdRoles";

  public evtReadDataReady = "readDataReady";
  public evtReadFsReady = "evtReadFsReady";
  public evtVormerkReady = "evtVormerkReady";

}
