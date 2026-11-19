import { config } from "../config.js";
import { createSmtpTransport } from "./smtp-transport.js";
import { logOperationalEvent } from "./operational-log.js";
export interface InvitationMailer {
  send(email: string, organization: string, link: string): Promise<boolean>;
}
export const mailer: InvitationMailer = {
  async send(email, organization, link) {
    if (!config.SMTP_HOST || !config.SMTP_FROM) return false;
    const transport = createSmtpTransport();
    try {
      await transport.sendMail({
        from: config.SMTP_FROM,
        to: email,
        subject: `Convite para organizar eventos — ${organization}`,
        text: `Você recebeu um convite para ${organization}.\n\nAcesse: ${link}\n\nO convite é válido por sete dias. Entre com este endereço de e-mail para aceitar.`,
      });
      return true;
    } catch {
      logOperationalEvent({ level: "error", event: "invitation_email_failed" });
      return false;
    }
  },
};
