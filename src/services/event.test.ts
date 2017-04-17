/**
 * Created by hb on 04.03.17.
 */

import {
  DataEventEmitter,
  DataService,
} from "./data";

export class EventTest {

  private event: DataEventEmitter;

  constructor(private eventHandler: DataService) {
    this.event = eventHandler.getEvent();
  }

  public do() {
    this.event
        .addListener("TEST1", () => {
          console.info("evt TEST1");
        })
        .addListener("TEST2", () => {
          console.info("evt TEST2");
        });

    this.event.emit(("TEST1"));
    this.duplex();
    this.event.emit(("TEST1"));

  }

  private duplex() {
    this.event.addListener("TEST1", () => {
      console.info("evt TEST1 2nd listener");
    });
    this.event.emit("TEST2");
  }

}
