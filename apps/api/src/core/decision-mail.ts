import { config } from "../config.js";
import { createSmtpTransport } from "./smtp-transport.js";
import { logOperationalEvent } from "./operational-log.js";

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
    const transport = createSmtpTransport({
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    try {
      const result = await transport.sendMail({
        from: config.SMTP_FROM,
        ...message,
      });
      return result.accepted?.length ? "ENVIADA" : "FALHA";
    } catch {
      logOperationalEvent({ level: "error", event: "decision_email_failed" });
      return "FALHA";
    } finally {
      transport.close();
    }
  },
};
