import nodemailer from "nodemailer";
import { config } from "../config.js";

export type DeliveryResult = "ENVIADA" | "FALHA" | "SEM_CONFIGURACAO";
export interface DecisionEmailSender {
  send(message: {
    to: string;
    subject: string;
    text: string;
    messageId: string;
  }): Promise<DeliveryResult>;
}
export const decisionEmailSender: DecisionEmailSender = {
  async send(message) {
    if (!config.SMTP_HOST || !config.SMTP_FROM) return "SEM_CONFIGURACAO";
    const transport = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      ...(config.SMTP_USER
        ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } }
        : {}),
    });
    try {
      const result = await transport.sendMail({
        from: config.SMTP_FROM,
        ...message,
      });
      return result.accepted?.length ? "ENVIADA" : "FALHA";
    } catch {
      console.error(
        JSON.stringify({ level: "error", event: "decision_email_failed" }),
      );
      return "FALHA";
    } finally {
      transport.close();
    }
  },
};
