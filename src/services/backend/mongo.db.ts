import * as mongoose from "mongoose";

import { LoggerService } from "@hb42/lib-server";

// ES6 native Promise in Mongoose: mongoose.Promise = global.Promise
// (die (<any> Konstruktion ist noetig wg. Typescript-Error TS2450)
// ES5 ext. lib einbinden: mongoose.Promise = require('q').Promise; | = require('bluebird');
// (mongoose v5 wird in ES5 bluebird verwenden)
(mongoose as any).Promise = Promise;

/* Multiple Connections:
  var conn = mongoose.createConnection(...)
  -> models sind an connection gebunden => *.model.ts muesste angepasst werden
 http://mongoosejs.com/docs/connections.html
 */

export class MongoDB {
  private connection: mongoose.Connection;
  private readonly dbUrl: string;

  // ist verfuegbar, wenn die DB laeuft
  // (kann damit auch als check genutzt werden)
  private readonly dbver: Promise<string>;
  public get mongodbVersion(): Promise<string> {
    return this.dbver;
  }

  private log = LoggerService.get("lib-server.server.service.MongoDB");

  /*  Mongogoose connection
   *  opts enthaelt credentials: { user: config.mongodbUser, pass: config.mongodbPwd }
   */
  constructor(srv: string, db: string, port: number, private opts: mongoose.ConnectionOptions) {
    this.dbUrl = "mongodb://" + srv + ":" + port + "/" + db;
    opts = {
      ...opts,
      // useMongoClient   : true, // verhindert deprection-warning aus mongodb
      poolSize         : 200,  // Number of connections in the connection pool for each server instance (default 5)
      reconnectTries   : 100,  // Server attempt to reconnect #times (default 30)
      reconnectInterval: 1000, // Server will wait # milliseconds between retries (default 1000)
      autoReconnect    : true, // Reconnect on error (default true)
      keepAlive        : true, // TCP KeepAlive on the socket
      connectTimeoutMS : 0,    // TCP Connection timeout setting (default 0)
      socketTimeoutMS  : 0,    // TCP Socket timeout setting (default 0)
      useNewUrlParser  : true, // mongoDB >= 4
    };

    this.dbver = this.connect(this.dbUrl, opts);
  }

  public getConnection(): mongoose.Connection {
    return this.connection;
  }

  public close(): Promise<string> {
    return new Promise((resolve) => {
      this.connection.close(() => {
        // console.log("Mongoose connection " + srv + " disconnected.");
        resolve("Mongoose connection " + this.dbUrl + " disconnected.");
      });
    });

  }

  private connect(url: string, opts: mongoose.ConnectionOptions): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.connection = mongoose.createConnection(url, opts);
      // this.connection.open(this.srv, this.db, this.port, this.opts);

      this.connection.once("open", () => {
        // mongo-Version holen
        // der User muss dazu die Rolle "clusterMonitor" fuer die DB "admin" haben
        // > use farc
        // > db.grantRolesToUser('farc',[{ role: "clusterMonitor", db: "admin" }])
        const admin = this.connection.db.admin();
        admin.serverStatus((err, info) => {
          if (err) {
            this.log.error("error at serverStatus");
            this.log.error(err);
            return;
          }
          this.log.info("succesfully connected to " + this.dbUrl + " (mongoDB " + info.version + ")");
          resolve(info.version);
        });
      });
      this.connection.on("error", (err: Error) => {
        this.log.error(this.dbUrl + " connection error: " + err);
        reject(null);
      });
    });
  }

}
