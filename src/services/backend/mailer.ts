import {
  createTransport,
  SendMailOptions,
  Transporter,
} from "nodemailer";

import { LoggerService } from "@hb42/lib-server";

import {
  DataServiceHandler,
} from "../data";

export class Mailer {

  private log = LoggerService.get("farc-server.services.backend.Mailer");

  private transporter: Transporter;

  constructor(private services: DataServiceHandler) {
    this.transporter = createTransport({
      host: services.config.smtpServer,
      port: services.config.smtpPort,
                                       });
  }

  public sendStatusMail(sender: string, recv: string, body: string, subj: string) {
    const mail: SendMailOptions = {
      from: sender,
      to: recv,
      subject: subj,
      html: body,
    };
    this.transporter.sendMail(mail, (err, info) => {
      if (err) {
        this.log.error("error sending mail: " + err);
      }
    });
  }
  /*
   // create reusable transporter object using the default SMTP transport
   let transporter = nodemailer.createTransport({
   host: 'smtp.example.com',
   port: 465,
   secure: true, // secure:true for port 465, secure:false for port 587
   auth: {
   user: 'username@example.com',
   pass: 'userpass'
   }
   });

   // setup email data with unicode symbols
   let mailOptions = {
   from: '"Fred Foo" <foo@blurdybloop.com>', // sender address
   to: 'bar@blurdybloop.com, baz@blurdybloop.com', // list of receivers
   subject: 'Hello', // Subject line
   text: 'Hello world ?', // plain text body
   html: '<b>Hello world ?</b>' // html body
   };

   // send mail with defined transport object
   transporter.sendMail(mailOptions, (error, info) => {
   if (error) {
   return this.log.log(error);
   }
   this.log.log('Message %s sent: %s', info.messageId, info.response);
   });
   */
}
