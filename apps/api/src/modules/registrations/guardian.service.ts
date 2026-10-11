import { createHmac, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { assert } from "../../core/errors.js";
import { hashToken, json } from "../../core/security.js";
import type { DecisionEmailSender } from "../../core/decision-mail.js";
import { guardianSignSchema, requiresGuardian } from "./guardian.validation.js";
import { z } from "zod";

const include = {
  registration: {
    include: {
      campaign: { include: { event: { include: { organization: true } } } },
    },
  },
} satisfies Prisma.GuardianAuthorizationInclude;
type Authorization = Prisma.GuardianAuthorizationGetPayload<{
  include: typeof include;
}>;
export class GuardianService {
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
    >`SELECT to_regclass('inscricoes.autorizacoes_responsavel') IS NOT NULL AND to_regclass('saude.termos_responsavel') IS NOT NULL AS ready`;
    return result?.ready === true;
  }
  async requireReady() {
    assert(
      await this.ready(),
      503,
      "A autorização de menores aguarda configuração pela administração. Seu rascunho foi preservado.",
      "GUARDIAN_SETUP_REQUIRED",
    );
  }
  private token(id: string, expiresAt: Date) {
    assert(
      this.secret,
      503,
      "Os links dos responsáveis aguardam configuração.",
    );
    return createHmac("sha256", this.secret)
      .update(`guardian:${id}:${expiresAt.toISOString()}`)
      .digest("base64url");
  }
  async prepare(
    tx: Prisma.TransactionClient,
    registrationId: string,
    payload: Record<string, unknown>,
    event: {
      name: string;
      location: string;
      city: string;
      startsAt: Date;
      endsAt: Date;
      organization: {
        name: string;
        contact: string;
        city: string;
        state: string;
      };
    },
    kind: string,
    formTerms: string,
    health: Record<string, unknown>,
  ) {
    const id = randomUUID(),
      expiresAt = new Date(Date.now() + 14 * 86400000);
    const date = (value: Date) =>
      new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(value);
    const termsText = `TERMO DE RESPONSABILIDADE E AUTORIZAÇÃO\n${event.organization.name}\nContato: ${event.organization.contact}\n\nAutorizo o(a) menor identificado(a) neste termo a ${kind === "VOLUNTEER" ? "servir voluntariamente" : "participar"} no evento ${event.name}, organizado por ${event.organization.name}, em ${event.location}, ${event.city}, de ${date(event.startsAt)} a ${date(event.endsAt)}, permanecendo no local nesse período.\n\nDeclaro que as informações de saúde do(a) menor são verdadeiras e que informei as condições que possam impedir sua participação. Isento os coordenadores e a entidade de responsabilidade por problemas de saúde omitidos à coordenação e estou ciente de que a instituição zelará pela integridade do(a) participante.\n\nConsciente dos benefícios do evento, declaro estar ciente dos riscos de acidentes imprevisíveis e do texto de responsabilidade apresentado pela organização: abdico de responsabilizar, em qualquer instância judicial, a liderança da comunidade e do evento, a igreja, padres e demais lideranças por danos decorrentes de acidentes imprevisíveis.\n\nUso de imagem e voz (opcional): autorizo, se marcar a opção correspondente, a cessão de direitos de veiculação de imagens e/ou voz do(a) menor em meios de comunicação, de livre e espontânea vontade, sem remuneração por direitos de imagem.\n\nConcordo com o tratamento dos dados pessoais fornecidos para inscrição, autorização e cuidados durante este evento, conforme a Lei nº 13.709/2018 (LGPD).\n\nTERMOS DA FICHA\n${formTerms}`;
    await tx.guardianAuthorization.create({
      data: {
        id,
        registrationId,
        expiresAt,
        tokenHash: hashToken(this.token(id, expiresAt)),
        termsText,
        snapshot: json({
          participantName: payload.name,
          birthDate: payload.birthDate,
          participantPhone: payload.phone,
          participantCpf: payload.cpf ?? "",
          participantCity:
            (payload.answers as Record<string, unknown>)?.cidade ?? "",
          team:
            kind === "VOLUNTEER" ? "A definir pela organização" : "Campista",
          familyName: payload.emergencyName ?? "",
          familyPhone: payload.emergencyPhone ?? "",
          guardianName: payload.guardianName,
          guardianPhone: payload.guardianPhone,
          guardianRelationship: payload.guardianRelationship,
          guardianEmail: payload.guardianEmail ?? "",
          event: {
            name: event.name,
            location: event.location,
            city: event.city,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            organization: event.organization.name,
          },
        }),
        health: {
          create: {
            data: json({
              ...(health.hasMedication !== undefined
                ? {
                    hasMedication: health.hasMedication,
                    medication: health.medication ?? "",
                  }
                : {}),
              ...(health.hasAllergies !== undefined
                ? {
                    hasAllergies: health.hasAllergies,
                    allergies: health.allergies ?? "",
                  }
                : {}),
            }),
          },
        },
      },
    });
  }
  private active(item: Authorization) {
    const event = item.registration.campaign.event;
    assert(
      event.organization.active &&
        event.status === "PUBLISHED" &&
        !["REJECTED", "CANCELLED"].includes(item.registration.status),
      409,
      "Esta inscrição não aceita autorização.",
    );
  }
  private messages(item: Authorization) {
    const token = this.token(item.id, item.expiresAt);
    assert(
      hashToken(token) === item.tokenHash,
      503,
      "Renove o link após a alteração da configuração.",
    );
    const link = new URL(`/autorizacao/${item.id}`, this.webUrl);
    link.hash = `token=${token}`;
    const data = item.snapshot as Record<string, string>;
    const text = `Olá, ${data.guardianName}. ${item.registration.campaign.event.organization.name} solicita sua autorização para ${data.participantName} participar de ${item.registration.campaign.event.name}.\n\nConfira os dados, preencha o termo e assine na tela: ${link}\n\nLink pessoal, válido por 14 dias. Não encaminhe a terceiros.`;
    let phone = data.guardianPhone.replace(/\D/g, "");
    if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
    return {
      link: link.toString(),
      message: text,
      email: data.guardianEmail || null,
      whatsappLink: /^\d{12,13}$/.test(phone)
        ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
        : null,
    };
  }
  private summary(item: Authorization) {
    return {
      id: item.id,
      signedAt: item.signedAt,
      expiresAt: item.expiresAt,
      emailStatus: item.emailStatus,
      expired: !item.signedAt && item.expiresAt <= new Date(),
      ...(!item.signedAt && item.expiresAt > new Date()
        ? this.messages(item)
        : {}),
    };
  }
  async forRegistration(registrationId: string) {
    const item = await this.db.guardianAuthorization.findUnique({
      where: { registrationId },
      include,
    });
    return item ? this.summary(item) : null;
  }
  async state(organizationId: string, registrationId: string) {
    const registration = await this.db.registration.findFirst({
      where: { id: registrationId, campaign: { event: { organizationId } } },
      select: {
        id: true,
        person: { select: { birthDate: true } },
        campaign: { select: { event: { select: { startsAt: true } } } },
      },
    });
    assert(registration, 404, "Inscrição não encontrada.");
    if (!(await this.ready()))
      return {
        ready: false,
        authorization: null,
        needsAuthorization: requiresGuardian(
          registration.person.birthDate.toISOString().slice(0, 10),
          registration.campaign.event.startsAt,
        ),
      };
    const item = await this.db.guardianAuthorization.findUnique({
      where: { registrationId },
      include,
    });
    if (!item)
      return {
        ready: true,
        authorization: null,
        needsAuthorization: requiresGuardian(
          registration.person.birthDate.toISOString().slice(0, 10),
          registration.campaign.event.startsAt,
        ),
      };
    const active = (() => {
      try {
        this.active(item);
        return true;
      } catch {
        return false;
      }
    })();
    return {
      ready: true,
      authorization: {
        ...(active
          ? this.summary(item)
          : {
              id: item.id,
              signedAt: item.signedAt,
              expiresAt: item.expiresAt,
              emailStatus: item.emailStatus,
            }),
        active,
        signedData: item.signedData,
        signature: item.signature,
        termsText: item.termsText,
        snapshot: item.snapshot,
        receiptHash: item.receiptHash,
      },
    };
  }
  async deliver(registrationId: string) {
    const item = await this.db.guardianAuthorization.findUnique({
      where: { registrationId },
      include,
    });
    if (!item || item.signedAt || item.expiresAt <= new Date()) return;
    this.active(item);
    const message = this.messages(item);
    if (!message.email) return;
    const claim = await this.db.guardianAuthorization.updateMany({
      where: {
        id: item.id,
        signedAt: null,
        expiresAt: item.expiresAt,
        OR: [
          { emailStartedAt: null },
          { emailStartedAt: { lt: new Date(Date.now() - 60000) } },
        ],
      },
      data: { emailStartedAt: new Date(), emailStatus: "ENVIANDO" },
    });
    if (!claim.count) return;
    let status = "FALHA";
    try {
      status = await this.sender.send({
        to: message.email,
        subject: `Autorização do responsável — ${item.registration.campaign.event.name.replace(/[\r\n]/g, " ")}`,
        text: message.message,
        messageId: `<guardian-${item.id}-${item.expiresAt.getTime()}@encontro>`,
      });
    } catch {
      /* Não expor dados pessoais nos logs. */
    }
    await this.db.guardianAuthorization.updateMany({
      where: { id: item.id, expiresAt: item.expiresAt },
      data: { emailStatus: status },
    });
  }
  async renew(organizationId: string, registrationId: string) {
    await this.state(organizationId, registrationId);
    await this.requireReady();
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT inscricao_id FROM inscricoes.inscricoes WHERE inscricao_id = ${registrationId}::uuid FOR UPDATE`;
      const item = await tx.guardianAuthorization.findUnique({
        where: { registrationId },
        include,
      });
      if (!item) {
        const registration = await tx.registration.findFirst({
          where: {
            id: registrationId,
            campaign: { event: { organizationId } },
          },
          include: {
            person: true,
            campaign: {
              include: { event: { include: { organization: true } } },
            },
            form: true,
            health: true,
          },
        });
        assert(registration, 404, "Inscrição não encontrada.");
        const payload = registration.snapshot as Record<string, unknown>;
        assert(
          requiresGuardian(
            registration.person.birthDate.toISOString().slice(0, 10),
            registration.campaign.event.startsAt,
          ),
          409,
          "Esta inscrição não exige responsável.",
        );
        assert(
          registration.campaign.event.organization.active &&
            registration.campaign.event.status === "PUBLISHED" &&
            !["REJECTED", "CANCELLED"].includes(registration.status),
          409,
          "Esta inscrição não aceita autorização.",
        );
        z.object({
          guardianName: z.string().trim().min(2),
          guardianRelationship: z.string().trim().min(2),
          guardianPhone: z
            .string()
            .max(25)
            .refine((v) => /^\d{10,13}$/.test(v.replace(/\D/g, ""))),
          guardianEmail: z
            .union([z.string().email(), z.literal("")])
            .optional(),
        }).parse(payload);
        await this.prepare(
          tx,
          registrationId,
          {
            ...payload,
            birthDate: registration.person.birthDate.toISOString().slice(0, 10),
          },
          registration.campaign.event,
          registration.campaign.kind,
          (registration.form.config as { terms: string }).terms,
          (registration.health?.data ?? {}) as Record<string, unknown>,
        );
        return;
      }
      assert(!item.signedAt, 409, "Este termo já foi assinado.");
      this.active(item);
      const expiresAt = new Date(
        Math.max(Date.now() + 14 * 86400000, item.expiresAt.getTime() + 1),
      );
      await tx.guardianAuthorization.update({
        where: { id: item.id },
        data: {
          expiresAt,
          tokenHash: hashToken(this.token(item.id, expiresAt)),
          emailStatus: "PENDENTE",
          emailStartedAt: null,
        },
      });
    });
    await this.deliver(registrationId);
    return this.state(organizationId, registrationId);
  }
  private async authorized(
    tx: Prisma.TransactionClient,
    id: string,
    token: string,
  ) {
    const item = await tx.guardianAuthorization.findFirst({
      where: { id, tokenHash: hashToken(token) },
      include,
    });
    assert(item, 401, "Link de autorização inválido.");
    if (!item.signedAt) this.active(item);
    assert(
      item.signedAt || item.expiresAt > new Date(),
      410,
      "Este link expirou. Peça um novo link à organização.",
    );
    return item;
  }
  async view(id: string, token: string) {
    await this.requireReady();
    const item = await this.authorized(this.db, id, token);
    const health = await this.db.guardianTermHealth.findUnique({
      where: { authorizationId: id },
    });
    return {
      id,
      protocol: item.registration.protocol,
      snapshot: item.snapshot,
      termsText: item.termsText,
      signedAt: item.signedAt,
      expiresAt: item.expiresAt,
      signedData: item.signedData,
      signature: item.signature,
      receiptHash: item.receiptHash,
      health: health?.data ?? {},
    };
  }
  async sign(
    id: string,
    token: string,
    input: unknown,
    evidence: { ip: string; userAgent: string },
  ) {
    await this.requireReady();
    await this.db.$transaction(async (tx) => {
      const candidate = await this.authorized(tx, id, token);
      await tx.$queryRaw`SELECT inscricao_id FROM inscricoes.inscricoes WHERE inscricao_id = ${candidate.registrationId}::uuid FOR UPDATE`;
      const item = await this.authorized(tx, id, token);
      if (item.signedAt) return;
      const data = guardianSignSchema.parse(input);
      const {
        signature,
        hasMedication,
        medication,
        hasAllergies,
        allergies,
        ...signedData
      } = data;
      const health = {
        hasMedication,
        medication: hasMedication ? medication : "",
        hasAllergies,
        allergies: hasAllergies ? allergies : "",
      };
      const signedAt = new Date();
      const receiptHash = hashToken(
        JSON.stringify({
          terms: item.termsText,
          snapshot: item.snapshot,
          signedData,
          signature,
          health,
          signedAt: signedAt.toISOString(),
        }),
      );
      await tx.guardianAuthorization.update({
        where: { id },
        data: {
          signedAt,
          signedData: json(signedData),
          signature: json(signature),
          receiptHash,
          ip: evidence.ip.slice(0, 100),
          userAgent: evidence.userAgent.slice(0, 500),
        },
      });
      await tx.guardianTermHealth.update({
        where: { authorizationId: id },
        data: { data: json(health) },
      });
      const original = await tx.healthSubmission.findUnique({
        where: { registrationId: item.registrationId },
      });
      await tx.healthSubmission.upsert({
        where: { registrationId: item.registrationId },
        create: { registrationId: item.registrationId, data: json(health) },
        update: {
          data: json({ ...((original?.data as object) ?? {}), ...health }),
        },
      });
      await tx.consent.update({
        where: { registrationId: item.registrationId },
        data: {
          guardianAuthorized: true,
          imageAuthorized: data.imageAuthorized,
        },
      });
    });
    return this.view(id, token);
  }
  async requireSigned(tx: Prisma.TransactionClient, registrationId: string) {
    const item = await tx.guardianAuthorization.findUnique({
      where: { registrationId },
      select: { signedAt: true },
    });
    assert(
      item?.signedAt,
      409,
      "Aguarde o responsável preencher e assinar o termo antes de confirmar a participação.",
      "GUARDIAN_SIGNATURE_REQUIRED",
    );
  }
}
