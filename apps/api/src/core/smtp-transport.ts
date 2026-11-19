import nodemailer from "nodemailer";
import { config } from "../config.js";

type SmtpTimeouts = {
  connectionTimeout?: number;
  greetingTimeout?: number;
  socketTimeout?: number;
};

export function createSmtpTransport(timeouts: SmtpTimeouts = {}) {
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    ...timeouts,
    ...(config.SMTP_USER
      ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } }
      : {}),
  });
}
