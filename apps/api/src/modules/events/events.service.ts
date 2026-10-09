import { Prisma } from "@prisma/client";
import { assert } from "../../core/errors.js";
import { json } from "../../core/security.js";
import { EventsRepository, publicOrganization } from "./events.repository.js";
import {
  campaignIsOpen,
  campaignSchema,
  eventSchema,
  eventStatusSchema,
  formSchema,
  type FormConfig,
} from "./events.validation.js";
import { volunteerTemplate } from "./volunteer-template.js";
import { DepartmentsRepository } from "./departments.repository.js";
import { departmentsSchema } from "./departments.validation.js";

export class EventsService {
  constructor(
    private repo: EventsRepository,
    private volunteersOnly = false,
  ) {}
  administrative(organizationId: string, authorizedEvents?: string[]) {
    return this.repo.administrative(organizationId, authorizedEvents);
  }
  async create(organizationId: string, actorId: string, input: unknown) {
    const { departments, ...eventInput } = (
      input && typeof input === "object" && !Array.isArray(input) ? input : {}
    ) as Record<string, unknown>;
    const parsed = eventSchema.parse(eventInput);
    const departmentData =
      departments === undefined ? [] : departmentsSchema.parse(departments);
    if (departments !== undefined)
      await new DepartmentsRepository(this.repo.db).requireReady();
    assert(
      departmentData.every((row) => !row.id),
      422,
      "Novos departamentos não reutilizam identificadores de outro evento.",
    );
    return this.repo.db.$transaction(async (tx) => {
      const type = await tx.eventType.upsert({
        where: {
          organizationId_name: { organizationId, name: parsed.typeName },
        },
        create: { organizationId, name: parsed.typeName },
        update: {},
      });
      const { typeName: _, ...data } = parsed;
      const event = await tx.event.create({
        data: {
          ...data,
          startsAt: new Date(data.startsAt),
          endsAt: new Date(data.endsAt),
          organizationId,
          typeId: type.id,
        },
      });
      for (const { id: _, ...department } of departmentData)
        await tx.team.create({ data: { ...department, eventId: event.id } });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: "EVENT_CREATED",
          entityId: event.id,
        },
      });
      return event;
    });
  }
  async volunteerForm(organizationId: string, eventId: string) {
    const event = await this.repo.db.event.findFirst({
      where: { id: eventId, organizationId },
      include: {
        type: true,
        campaigns: {
          where: { kind: "VOLUNTEER" },
          include: {
            forms: { orderBy: { version: "desc" }, take: 1 },
          },
        },
      },
    });
    assert(event, 404, "Evento não encontrado.");
    const campaign = event.campaigns[0];
    assert(
      campaign,
      422,
      "Cadastre primeiro o período de inscrição dos servos.",
    );
    const departmentsRepo = new DepartmentsRepository(this.repo.db);
    const departmentsReady = await departmentsRepo.ready();
    const departments = await departmentsRepo.list(organizationId, [eventId]);
    return {
      event: { id: event.id, name: event.name, status: event.status },
      campaign: {
        id: campaign.id,
        opensAt: campaign.opensAt,
        closesAt: campaign.closesAt,
        paused: campaign.paused,
        capacity: campaign.capacity,
        allowWaitlist: campaign.allowWaitlist,
      },
      form: campaign.forms[0] ?? null,
      departmentsReady,
      departments,
      template: volunteerTemplate(
        event.type.name,
        departmentsReady
          ? departments
              .filter((team) => team.capacity !== null)
              .map((team) => team.name)
          : undefined,
      ),
    };
  }
  async publishVolunteerForm(
    organizationId: string,
    eventId: string,
    actorId: string,
    input: unknown,
  ) {
    const config = formSchema.parse(input);
    const departmentsRepo = new DepartmentsRepository(this.repo.db);
    await departmentsRepo.requireReady();
    assert(
      config.volunteer && config.askShirt,
      422,
      "Utilize a ficha de intenção para servos com tamanho de camiseta.",
    );
    const required = volunteerTemplate("evento").questions;
    for (const question of required) {
      const configured = config.questions.find((q) => q.id === question.id);
      assert(
        configured &&
          configured.type === question.type &&
          configured.required === question.required,
        422,
        `Preserve o campo básico: ${question.label}`,
      );
      if (question.mustBeTrue)
        assert(
          configured.mustBeTrue,
          422,
          "Os aceites de preparação e regras são obrigatórios.",
        );
      if (question.maxSelections)
        assert(
          configured.maxSelections === 3,
          422,
          "A preferência deve permitir até três departamentos.",
        );
      if (question.exclusiveOption)
        assert(
          configured.exclusiveOption === question.exclusiveOption,
          422,
          "Preserve a opção exclusiva para quem não possui sacramentos.",
        );
    }
    return this.repo.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT evento_id FROM eventos.eventos WHERE evento_id = ${eventId}::uuid AND organizacao_id = ${organizationId}::uuid FOR UPDATE`;
      const event = await tx.event.findFirst({
        where: { id: eventId, organizationId },
      });
      assert(event, 404, "Evento não encontrado.");
      assert(
        ["DRAFT", "PUBLISHED"].includes(event.status),
        409,
        "Este evento não aceita publicação de fichas.",
      );
      const campaign = await tx.campaign.findUnique({
        where: { eventId_kind: { eventId, kind: "VOLUNTEER" } },
      });
      assert(
        campaign,
        422,
        "Cadastre primeiro o período de inscrição dos servos.",
      );
      const departments = await tx.team.findMany({
        where: { eventId },
        orderBy: { name: "asc" },
      });
      assert(
        departments.length > 0 &&
          departments.every((team) => team.capacity !== null),
        422,
        "Cadastre os departamentos e defina as vagas de todos antes de publicar a ficha.",
      );
      const preferences = config.questions.find(
        (question) => question.id === "equipes_preferencia",
      )!;
      assert(
        preferences.options.length === departments.length &&
          departments.every((team) => preferences.options.includes(team.name)),
        409,
        "Os departamentos da ficha precisam corresponder aos cadastros deste evento. Atualize a ficha.",
      );
      await tx.$queryRaw`SELECT campanha_id FROM eventos.campanhas WHERE campanha_id = ${campaign.id}::uuid FOR UPDATE`;
      const invalidCampers = await tx.campaign.count({
        where: {
          eventId,
          kind: "CAMPER",
          capacity: null,
          forms: { some: { publishedAt: { not: null } } },
        },
      });
      assert(
        !invalidCampers,
        422,
        "Defina a capacidade da campanha de campistas que já possui ficha publicada.",
      );
      const latest = await tx.formVersion.findFirst({
        where: { campaignId: campaign.id },
        orderBy: { version: "desc" },
      });
      const form = await tx.formVersion.create({
        data: {
          campaignId: campaign.id,
          version: (latest?.version ?? 0) + 1,
          config: json(config),
          publishedAt: new Date(),
        },
      });
      if (event.status === "DRAFT")
        await tx.event.update({
          where: { id: eventId },
          data: { status: "PUBLISHED" },
        });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: "VOLUNTEER_FORM_PUBLISHED",
          entityId: form.id,
        },
      });
      return {
        form,
        campaignId: campaign.id,
        link: `/inscricao/${campaign.id}`,
      };
    });
  }
  async update(organizationId: string, eventId: string, input: unknown) {
    const { typeName, ...data } = eventSchema.parse(input);
    return this.repo.db.$transaction(async (tx) => {
      const existing = await tx.event.findFirst({
        where: { id: eventId, organizationId },
      });
      assert(existing, 404, "Evento não encontrado.");
      const count = await tx.registration.count({
        where: { campaign: { eventId } },
      });
      assert(
        !count ||
          (data.startsAt === existing.startsAt.toISOString().slice(0, 10) &&
            data.endsAt === existing.endsAt.toISOString().slice(0, 10)),
        409,
        "Eventos com inscrições preservam suas datas.",
      );
      const type = await tx.eventType.upsert({
        where: { organizationId_name: { organizationId, name: typeName } },
        create: { organizationId, name: typeName },
        update: {},
      });
      return tx.event.update({
        where: { id: eventId },
        data: {
          ...data,
          typeId: type.id,
          startsAt: new Date(data.startsAt),
          endsAt: new Date(data.endsAt),
        },
      });
    });
  }
  async status(
    organizationId: string,
    eventId: string,
    actorId: string,
    input: unknown,
  ) {
    const { status } = eventStatusSchema.parse(input);
    return this.repo.db.$transaction(async (tx) => {
      const event = await tx.event.findFirst({
        where: { id: eventId, organizationId },
        include: {
          campaigns: {
            include: { forms: { where: { publishedAt: { not: null } } } },
          },
        },
      });
      assert(event, 404, "Evento não encontrado.");
      if (status === "PUBLISHED") {
        assert(
          event.campaigns.every(
            (c) => c.kind !== "CAMPER" || c.capacity !== null,
          ),
          422,
          "Informe a capacidade de campistas antes de publicar o evento.",
        );
        assert(
          event.campaigns.some((c) => c.forms.length > 0),
          422,
          "Configure e publique pelo menos uma ficha antes de divulgar o evento.",
        );
      }
      if (status === "DRAFT")
        assert(
          (await tx.registration.count({
            where: { campaign: { eventId } },
          })) === 0,
          409,
          "Use cancelamento ou arquivamento para eventos com inscrições.",
        );
      const updated = await tx.event.update({
        where: { id: eventId },
        data: { status },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: `EVENT_${status}`,
          entityId: eventId,
        },
      });
      return updated;
    });
  }
  async saveCampaign(organizationId: string, eventId: string, input: unknown) {
    const data = campaignSchema.parse(input);
    assert(
      !this.volunteersOnly || data.kind === "VOLUNTEER",
      404,
      "Campanha indisponível.",
    );
    return this.repo.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT evento_id FROM eventos.eventos WHERE evento_id = ${eventId}::uuid AND organizacao_id = ${organizationId}::uuid FOR UPDATE`;
      const event = await tx.event.findFirst({
        where: { id: eventId, organizationId },
      });
      assert(event, 404, "Evento não encontrado.");
      const existing = await tx.campaign.findUnique({
        where: { eventId_kind: { eventId, kind: data.kind } },
      });
      if (existing) {
        await tx.$queryRaw`SELECT campanha_id FROM eventos.campanhas WHERE campanha_id = ${existing.id}::uuid FOR UPDATE`;
        const confirmed = await tx.registration.count({
          where: { campaignId: existing.id, status: "CONFIRMED" },
        });
        assert(
          data.capacity === null || data.capacity >= confirmed,
          409,
          "A capacidade não pode ser menor que o número de confirmados.",
        );
      }
      const values = {
        ...data,
        opensAt: new Date(data.opensAt),
        closesAt: new Date(data.closesAt),
      };
      return tx.campaign.upsert({
        where: { eventId_kind: { eventId, kind: data.kind } },
        create: { ...values, eventId },
        update: values,
      });
    });
  }
  async form(organizationId: string, campaignId: string, input: unknown) {
    const config = formSchema.parse(input);
    return this.repo.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT campanha_id FROM eventos.campanhas WHERE campanha_id = ${campaignId}::uuid FOR UPDATE`;
      const campaign = await tx.campaign.findFirst({
        where: { id: campaignId, event: { organizationId } },
      });
      assert(campaign, 404, "Campanha não encontrada.");
      const latest = await tx.formVersion.findFirst({
        where: { campaignId },
        orderBy: { version: "desc" },
      });
      return tx.formVersion.create({
        data: {
          campaignId,
          version: (latest?.version ?? 0) + 1,
          config: json(config),
        },
      });
    });
  }
  async publishForm(
    organizationId: string,
    campaignId: string,
    formId: string,
  ) {
    const form = await this.repo.db.formVersion.findFirst({
      where: {
        id: formId,
        campaignId,
        campaign: { event: { organizationId } },
      },
    });
    assert(form, 404, "Ficha não encontrada.");
    if (form.publishedAt) return form;
    return this.repo.db.formVersion.update({
      where: { id: formId },
      data: { publishedAt: new Date() },
    });
  }
  async publicList(
    filters: { q?: string; city?: string; organizationId?: string },
    page: number,
    pageSize: number,
  ) {
    const now = new Date();
    const where: Prisma.EventWhereInput = {
      status: "PUBLISHED",
      organization: { active: true },
      ...(filters.organizationId
        ? { organizationId: filters.organizationId }
        : {}),
      ...(filters.city
        ? { city: { contains: filters.city, mode: "insensitive" } }
        : {}),
      ...(filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" } },
              {
                organization: {
                  name: { contains: filters.q, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
      campaigns: {
        some: {
          ...(this.volunteersOnly ? { kind: "VOLUNTEER" } : {}),
          paused: false,
          opensAt: { lte: now },
          closesAt: { gt: now },
          forms: { some: { publishedAt: { not: null } } },
        },
      },
    };
    const [items, total] = await this.repo.publicList(
      where,
      (page - 1) * pageSize,
      pageSize,
    );
    return {
      items: items.map((event) => ({
        ...event,
        campaigns: event.campaigns.map((c) => ({
          ...c,
          open:
            c.forms.length > 0 &&
            !c.paused &&
            c.opensAt <= now &&
            c.closesAt > now,
          forms: undefined,
        })),
      })),
      total,
      page,
      pageSize,
    };
  }
  async publicEvent(eventId: string) {
    const event = await this.repo.db.event.findFirst({
      where: {
        id: eventId,
        status: { in: ["PUBLISHED", "COMPLETED"] },
        organization: { active: true },
      },
      include: {
        organization: { select: publicOrganization },
        type: true,
        campaigns: {
          ...(this.volunteersOnly ? { where: { kind: "VOLUNTEER" } } : {}),
          include: {
            forms: {
              where: { publishedAt: { not: null } },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    assert(event, 404, "Evento indisponível.");
    return {
      ...event,
      campaigns: event.campaigns.map((c) => ({
        ...c,
        forms: undefined,
        open:
          event.status === "PUBLISHED" &&
          c.forms.length > 0 &&
          !c.paused &&
          c.opensAt <= new Date() &&
          c.closesAt > new Date(),
      })),
    };
  }
  async publicCampaign(campaignId: string) {
    const campaign = await this.repo.db.campaign.findFirst({
      where: {
        id: campaignId,
        ...(this.volunteersOnly ? { kind: "VOLUNTEER" } : {}),
        event: { status: "PUBLISHED", organization: { active: true } },
      },
      include: {
        event: {
          include: {
            organization: { select: { ...publicOrganization, active: true } },
            teams: { select: { id: true, name: true } },
          },
        },
        forms: {
          where: { publishedAt: { not: null } },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });
    assert(campaign && campaign.forms.length, 404, "Campanha indisponível.");
    const { forms, ...data } = campaign;
    return {
      ...data,
      open: campaignIsOpen(campaign),
      form: { ...forms[0], config: forms[0].config as unknown as FormConfig },
    };
  }
}
