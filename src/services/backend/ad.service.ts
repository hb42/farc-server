import {Client, createClient, SearchOptions} from "ldapjs";

import { LoggerService } from "@hb42/lib-server";

import {
  DataServiceHandler,
} from "../data";

export class ADService {

  private client: Client | null;

  private log = LoggerService.get("farc-server.services.backend.ADService");

  constructor(private services: DataServiceHandler) {
    this.log.debug("c'tor ADService");
  }

  public bind(ldapUrl: string, ldapUser: string, ldapPwd: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (this.client) {
        this.log.debug("bind() on already connected AD");
        resolve(false);
      }
      this.log.debug("connecting to AD...");
      this.client = createClient({url: ldapUrl, connectTimeout: 5000});
      if (this.client) {
        this.log.debug("binding to AD...");
        this.client.bind(ldapUser, ldapPwd,
                         (err) => {
                           if (err) {
                             const e = "error binding " + err;
                             this.log.error(e);
                             reject(e);
                           } else {
                             this.log.info("success binding to AD");
                             resolve(true);
                           }
                         });
      } else {
        const e = "ERROR: timeout connecting to AD";
        this.log.error(e);
        reject(e);
      }
    });
  }

  public unbind() {
    if (!this.client) {
      this.log.debug("unbind() on already unbound AD");
      return;
    }
    this.client.unbind((uberr) => {
      if (uberr) {
        this.log.error("error unbinding " + uberr);
      } else {
        this.log.info("successfuly disconnected AD");
      }
      this.client = null;
    });
  }

  public query(base: string, opts: SearchOptions): Promise<any[]> {

    this.log.info("query");
    const rc: any[] = [];

    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject("calling query() on unbound LDAP");
      } else {
        this.client.search(base, opts,
                    (err, res) => {
                      if (err) {
                        this.log.error("LDAP query error: " + err.message);
                        reject("LADP query error: " + err.message);
                      } else {
                        res.on("searchEntry", (entry) => {
                          rc.push(entry.object);
                        });
                        res.on("searchReference", (referral) => {
                          this.log.info("referral: " + referral.uris.join());
                        });
                        res.on("error", (e) => {
                          this.log.error("LDAP query error: " + e.message);
                          reject("LDAP query error: " + e.message);
                        });
                        res.on("end", (result) => {
                          this.log.info("query on.end");
                          resolve(rc);
                        });
                      }
                    });
      }
    });
  }

}
