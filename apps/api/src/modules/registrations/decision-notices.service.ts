import { createHmac, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { assert } from "../../core/errors.js";
import { hashToken } from "../../core/security.js";
import type { DecisionEmailSender } from "../../core/decision-mail.js";

const noticeInclude = {
  registration: {
    include: {
      person: true,
      campaign: { include: { event: { include: { organization: true } } } },
    },
  },
} satisfies Prisma.DecisionNoticeInclude;
type Notice = Prisma.DecisionNoticeGetPayload<{
  include: typeof noticeInclude;
}>;
export class DecisionNoticesService {
  constructor(
    private db: PrismaClient,
    private sender: DecisionEmailSender,
    private secret: string | undefined,
    private webUrl: string,
  ) {}
  async ready() {
    if (!this.secret) return false;
    const [result] = await this.db.$queryRaw<
      { ready: boolean }[]
    >`SELECT to_regclass('inscricoes.avisos_decisao') IS NOT NULL AS ready`;
    return result?.ready === true;
  }
  private token(id: string, expiresAt: Date) {
    assert(this.secret, 503, "Os avisos aos candidatos aguardam configuração.");
    return createHmac("sha256", this.secret)
      .update(`decision:${id}:${expiresAt.toISOString()}`)
      .digest("base64url");
  }
  private expiry(eventDate: Date, kind: string) {
    const week = Date.now() + 7 * 86400000;
    const start = new Date(
      `${eventDate.toISOString().slice(0, 10)}T00:00:00-03:00`,
    ).getTime();
    const expiry = new Date(kind === "ACEITE" ? Math.min(week, start) : week);
    assert(
      expiry > new Date(),
      409,
      "O evento já começou e não aceita confirmação de presença.",
    );
    return expiry;
  }
  async prepare(
    tx: Prisma.TransactionClient,
    registrationId: string,
    historyId: string,
    actorId: string,
    status: string,
    eventDate: Date,
  ) {
    await tx.decisionNotice.updateMany({
      where: { registrationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const id = randomUUID(),
      kind = status === "APPROVED" ? "ACEITE" : "RECUSA",
      expiresAt = this.expiry(eventDate, kind);
    await tx.decisionNotice.create({
      data: {
        id,
        registrationId,
        historyId,
        createdById: actorId,
        kind,
        expiresAt,
        tokenHash: hashToken(this.token(id, expiresAt)),
      },
    });
    return id;
  }
  async invalidate(tx: Prisma.TransactionClient, registrationId: string) {
    await tx.decisionNotice.updateMany({
      where: { registrationId, kind: "ACEITE", revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  async requirePresence(tx: Prisma.TransactionClient, registrationId: string) {
    const latest = await tx.decisionNotice.findFirst({
      where: { registrationId, kind: "ACEITE", revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    // Inscrições antigas sem aviso preservam o fluxo de confirmação manual.
    if (latest)
      assert(
        latest.confirmedAt,
        409,
        "Aguarde o candidato confirmar presença pelo link enviado.",
        "CANDIDATE_CONFIRMATION_REQUIRED",
      );
  }
  private active(notice: Notice) {
    const registration = notice.registration;
    const event = registration.campaign.event;
    return (
      !notice.revokedAt &&
      event.organization.active &&
      event.status === "PUBLISHED" &&
      (notice.kind === "ACEITE"
        ? ["APPROVED", "CONFIRMED"].includes(registration.status)
        : registration.status === "REJECTED")
    );
  }
  private messages(notice: Notice) {
    const registration = notice.registration,
      event = registration.campaign.event;
    const token = this.token(notice.id, notice.expiresAt);
    assert(
      hashToken(token) === notice.tokenHash,
      503,
      "A configuração dos links foi alterada. Renove o link antes de enviar novamente.",
    );
    const link = new URL(`/resposta/${notice.id}`, this.webUrl);
    link.hash = `token=${token}`;
    const eventDate = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "UTC",
    }).format(event.startsAt);
    const expiry = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(notice.expiresAt);
    const name = registration.person.name;
    const text =
      notice.kind === "ACEITE"
        ? `Olá, ${name}! Sua candidatura para servir no ${event.name} foi aceita!\n\n${event.organization.name} · Evento a partir de ${eventDate}.\n\nConfirme sua presença pelo link: ${link}\n\nO link é pessoal e válido até ${expiry} (horário de Brasília). A organização finalizará sua equipe e a confirmação da participação.\n\nEsperamos você!`
        : `Olá, ${name}. Não foi dessa vez!\n\nAgradecemos sua disponibilidade para servir no ${event.name}. Sua candidatura não foi selecionada para esta edição. Esperamos poder contar com você em uma próxima oportunidade!\n\nConfira o resultado: ${link}\n\n${event.organization.name}`;
    const snapshot = registration.snapshot as {
      email?: string;
      phone?: string;
    };
    const email = snapshot.email?.trim() || null;
    let phone = (snapshot.phone ?? "").replace(/\D/g, "");
    if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
    return {
      text,
      link: link.toString(),
      email,
      whatsappLink: /^\d{12,13}$/.test(phone)
        ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
        : null,
      subject:
        notice.kind === "ACEITE"
          ? `Confirme sua presença — ${event.name.replace(/[\r\n]/g, " ")}`
          : `Resultado da candidatura — ${event.name.replace(/[\r\n]/g, " ")}`,
    };
  }
  private async latest(organizationId: string, registrationId: string) {
    const registration = await this.db.registration.findFirst({
      where: {
        id: registrationId,
        campaign: { kind: "VOLUNTEER", event: { organizationId } },
      },
      select: { id: true },
    });
    assert(registration, 404, "Candidatura não encontrada.");
    return (
      (await this.db.decisionNotice.findFirst({
        where: { registrationId, revokedAt: null },
        orderBy: { createdAt: "desc" },
        include: noticeInclude,
      })) ??
      this.db.decisionNotice.findFirst({
        where: { registrationId },
        orderBy: { createdAt: "desc" },
        include: noticeInclude,
      })
    );
  }
  async state(organizationId: string, registrationId: string) {
    if (!(await this.ready())) return { ready: false, notice: null };
    const notice = await this.latest(organizationId, registrationId);
    if (!notice) return { ready: true, notice: null };
    const expired = notice.expiresAt <= new Date() && !notice.confirmedAt;
    const active = this.active(notice);
    const messages = active && !expired ? this.messages(notice) : null;
    return {
      ready: true,
      notice: {
        id: notice.id,
        kind: notice.kind,
        emailStatus: notice.emailStatus,
        emailSentAt: notice.emailSentAt,
        whatsappSentAt: notice.whatsappSentAt,
        confirmedAt: notice.confirmedAt,
        expiresAt: notice.expiresAt,
        active,
        expired,
        email: messages?.email ?? null,
        message: messages?.text ?? null,
        link: messages?.link ?? null,
        whatsappLink: messages?.whatsappLink ?? null,
      },
    };
  }
  async deliver(noticeId: string, retry = false) {
    let notice = await this.db.decisionNotice.findUnique({
      where: { id: noticeId },
      include: noticeInclude,
    });
    if (!notice || !this.active(notice) || notice.expiresAt <= new Date())
      return;
    let message = this.messages(notice);
    if (!message.email) {
      await this.db.decisionNotice.updateMany({
        where: { id: notice.id, emailStatus: { not: "ENVIADA" } },
        data: { emailStatus: "SEM_EMAIL" },
      });
      return;
    }
    if (retry)
      await this.db.decisionNotice.updateMany({
        where: {
          id: noticeId,
          emailStatus: "EM_ENVIO",
          emailStartedAt: { lt: new Date(Date.now() - 120000) },
        },
        data: { emailStatus: "INCERTO" },
      });
    const startedAt = new Date();
    const claim = await this.db.decisionNotice.updateMany({
      where: {
        id: noticeId,
        revokedAt: null,
        tokenHash: notice.tokenHash,
        emailStatus: {
          in: ["PENDENTE", "FALHA", "SEM_CONFIGURACAO", "INCERTO"],
        },
      },
      data: {
        emailStatus: "EM_ENVIO",
        emailStartedAt: startedAt,
        emailAttempts: { increment: 1 },
      },
    });
    if (!claim.count) return;
    // Confere novamente depois de obter a exclusividade do envio.
    notice = await this.db.decisionNotice.findUniqueOrThrow({
      where: { id: noticeId },
      include: noticeInclude,
    });
    if (!this.active(notice)) {
      await this.db.decisionNotice.updateMany({
        where: { id: noticeId, emailStartedAt: startedAt },
        data: { emailStatus: "FALHA" },
      });
      return;
    }
    message = this.messages(notice);
    if (!message.email) {
      await this.db.decisionNotice.updateMany({
        where: { id: noticeId, emailStartedAt: startedAt },
        data: { emailStatus: "SEM_EMAIL" },
      });
      return;
    }
    let status: "ENVIADA" | "FALHA" | "SEM_CONFIGURACAO";
    try {
      status = await this.sender.send({
        to: message.email,
        subject: message.subject,
        text: message.text,
        messageId: `<decision-${noticeId}@${new URL(this.webUrl).hostname}>`,
      });
    } catch {
      status = "FALHA";
    }
    await this.db.decisionNotice.updateMany({
      where: {
        id: noticeId,
        emailStatus: "EM_ENVIO",
        emailStartedAt: startedAt,
      },
      data: {
        emailStatus: status,
        ...(status === "ENVIADA" ? { emailSentAt: new Date() } : {}),
      },
    });
  }
  async sendEmail(organizationId: string, registrationId: string) {
    assert(
      await this.ready(),
      503,
      "Os avisos aos candidatos aguardam configuração.",
    );
    const notice = await this.latest(organizationId, registrationId);
    assert(
      notice && this.active(notice),
      409,
      "Não há aviso válido para enviar.",
    );
    assert(
      notice.expiresAt > new Date(),
      409,
      "Renove o link expirado antes de enviar.",
    );
    await this.deliver(notice.id, true);
    return this.state(organizationId, registrationId);
  }
  async whatsappSent(
    organizationId: string,
    registrationId: string,
    actorId: string,
  ) {
    assert(
      await this.ready(),
      503,
      "Os avisos aos candidatos aguardam configuração.",
    );
    const notice = await this.latest(organizationId, registrationId);
    assert(
      notice && this.active(notice) && notice.expiresAt > new Date(),
      409,
      "Não há aviso válido para registrar.",
    );
    await this.db.$transaction(async (tx) => {
      const updated = await tx.decisionNotice.updateMany({
        where: { id: notice.id, revokedAt: null, whatsappSentAt: null },
        data: { whatsappSentAt: new Date() },
      });
      if (updated.count)
        await tx.auditLog.create({
          data: {
            organizationId,
            actorId,
            action: "DECISION_WHATSAPP_SENT_DECLARED",
            entityId: notice.id,
          },
        });
    });
    return this.state(organizationId, registrationId);
  }
  async renew(organizationId: string, registrationId: string, actorId: string) {
    assert(
      await this.ready(),
      503,
      "Os avisos aos candidatos aguardam configuração.",
    );
    const notice = await this.latest(organizationId, registrationId);
    assert(
      notice && this.active(notice) && !notice.confirmedAt,
      409,
      "Este aviso não permite renovar o link.",
    );
    const expiresAt = this.expiry(
      notice.registration.campaign.event.startsAt,
      notice.kind,
    );
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT inscricao_id FROM inscricoes.inscricoes WHERE inscricao_id=${registrationId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT aviso_id FROM inscricoes.avisos_decisao WHERE aviso_id=${notice.id}::uuid FOR UPDATE`;
      const current = await tx.decisionNotice.findUniqueOrThrow({
        where: { id: notice.id },
        include: noticeInclude,
      });
      assert(
        this.active(current) &&
          !current.confirmedAt &&
          current.emailStatus !== "EM_ENVIO",
        409,
        "Aguarde a conclusão do envio ou confira a decisão atual.",
      );
      await tx.decisionNotice.update({
        where: { id: notice.id },
        data: {
          expiresAt,
          tokenHash: hashToken(this.token(notice.id, expiresAt)),
          emailStatus: "PENDENTE",
          emailSentAt: null,
          whatsappSentAt: null,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: "DECISION_LINK_RENEWED",
          entityId: notice.id,
        },
      });
    });
    return this.state(organizationId, registrationId);
  }
  private async authorized(
    noticeId: string,
    token: string,
    tx: Prisma.TransactionClient | PrismaClient = this.db,
  ) {
    assert(
      await this.ready(),
      503,
      "O retorno aos candidatos aguarda configuração.",
    );
    const notice = await tx.decisionNotice.findFirst({
      where: { id: noticeId, tokenHash: hashToken(token) },
      include: noticeInclude,
    });
    assert(notice, 404, "Este link é inválido ou foi substituído.");
    assert(
      this.active(notice),
      410,
      "Este aviso não está mais disponível. Procure a organização.",
    );
    assert(
      notice.confirmedAt || notice.expiresAt > new Date(),
      410,
      "Este link expirou. Solicite um novo link à organização.",
    );
    return notice;
  }
  private publicSummary(notice: Notice) {
    const event = notice.registration.campaign.event;
    return {
      kind: notice.kind,
      candidateName: notice.registration.person.name.split(" ")[0],
      confirmedAt: notice.confirmedAt,
      expiresAt: notice.expiresAt,
      event: {
        name: event.name,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        organization: event.organization.name,
      },
    };
  }
  async view(noticeId: string, token: string) {
    return this.publicSummary(await this.authorized(noticeId, token));
  }
  async confirm(noticeId: string, token: string) {
    const candidate = await this.authorized(noticeId, token);
    return this.db.$transaction(async (tx) => {
      // Ordem igual à confirmação administrativa: campanha → inscrição → aviso.
      await tx.$queryRaw`SELECT campanha_id FROM eventos.campanhas WHERE campanha_id=${candidate.registration.campaignId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT inscricao_id FROM inscricoes.inscricoes WHERE inscricao_id=${candidate.registrationId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT aviso_id FROM inscricoes.avisos_decisao WHERE aviso_id=${noticeId}::uuid FOR UPDATE`;
      const current = await this.authorized(noticeId, token, tx);
      assert(
        current.kind === "ACEITE",
        409,
        "Uma candidatura recusada não permite confirmar presença.",
      );
      if (!current.confirmedAt)
        await tx.decisionNotice.update({
          where: { id: noticeId },
          data: { confirmedAt: new Date() },
        });
      const updated = await tx.decisionNotice.findUniqueOrThrow({
        where: { id: noticeId },
        include: noticeInclude,
      });
      return this.publicSummary(updated);
    });
  }
}
