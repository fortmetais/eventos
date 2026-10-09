import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
if (process.env.NODE_ENV === "production" || process.env.SEED_DEMO !== "true")
  throw new Error(
    "A carga demonstrativa exige SEED_DEMO=true e não pode ser usada em produção.",
  );
const organizations = [
  {
    id: "00000000-0000-4000-a000-000000000101",
    name: "Paróquia Nossa Senhora Aparecida · demonstração",
    city: "Toledo",
    state: "PR",
  },
  {
    id: "00000000-0000-4000-a000-000000000102",
    name: "Comunidade São José · demonstração",
    city: "Cianorte",
    state: "PR",
  },
];
try {
  for (const org of organizations)
    await db.organization.upsert({
      where: { id: org.id },
      create: { ...org, kind: "PARISH", contact: "Contato de demonstração" },
      update: {},
    });
  const examples = [
    ["FAC", "2º Acampamento FAC", "CAMPER"],
    ["Mariano", "Acampamento Mariano Imaculada", "VOLUNTEER"],
    ["Sênior", "5º Acampamento Sênior", "BOTH"],
    ["Juvenil", "Acampamento Juvenil", "BOTH"],
    ["Casais", "Encontro de Casais", "CAMPER"],
    ["Mergulhar", "Acampamento Mergulhar", "VOLUNTEER"],
  ];
  for (const [i, [typeName, name, mode]] of examples.entries()) {
    const org = organizations[i % 2];
    const type = await db.eventType.upsert({
      where: {
        organizationId_name: { organizationId: org.id, name: typeName },
      },
      create: { organizationId: org.id, name: typeName },
      update: {},
    });
    const eventId = `00000000-0000-4000-a000-${String(201 + i).padStart(12, "0")}`;
    const startsAt = new Date();
    startsAt.setUTCDate(startsAt.getUTCDate() + 40 + i * 7);
    const endsAt = new Date(startsAt);
    endsAt.setUTCDate(endsAt.getUTCDate() + 3);
    const event = await db.event.upsert({
      where: { id: eventId },
      create: {
        id: eventId,
        organizationId: org.id,
        typeId: type.id,
        name: `${name} · demonstração`,
        description:
          "Evento fictício para demonstrar a plataforma. Uma experiência de acolhimento, convivência e serviço em comunidade. Os dados e as inscrições desta edição são apenas de demonstração.",
        location: "Centro de encontros · demonstração",
        city: org.city,
        startsAt,
        endsAt,
        status: "PUBLISHED",
      },
      update: {},
    });
    for (const kind of mode === "BOTH" ? ["CAMPER", "VOLUNTEER"] : [mode]) {
      const campaign = await db.campaign.upsert({
        where: {
          eventId_kind: {
            eventId: event.id,
            kind: kind as "CAMPER" | "VOLUNTEER",
          },
        },
        create: {
          eventId: event.id,
          kind: kind as "CAMPER" | "VOLUNTEER",
          opensAt: new Date(Date.now() - 86400000),
          closesAt: new Date(Date.now() + 30 * 86400000),
          capacity: kind === "CAMPER" ? 100 : null,
          allowWaitlist: true,
        },
        update: {},
      });
      if (
        (await db.formVersion.count({ where: { campaignId: campaign.id } })) ===
        0
      )
        await db.formVersion.create({
          data: {
            campaignId: campaign.id,
            version: 1,
            publishedAt: new Date(),
            config: {
              askCpf: false,
              askAddress: false,
              askShirt: true,
              questions: [
                {
                  id: "pastoral",
                  label: "Participa de alguma pastoral ou movimento?",
                  type: "text",
                  required: false,
                  options: [],
                },
              ],
              terms:
                "Ficha demonstrativa. Não forneça dados pessoais reais neste ambiente. Em um evento real, a organização deve revisar os termos, as finalidades e as autorizações antes da abertura das inscrições.",
            },
          },
        });
    }
    for (const name of ["Recepção", "Cozinha", "Liturgia"])
      await db.team.upsert({
        where: { eventId_name: { eventId: event.id, name } },
        create: { eventId: event.id, name },
        update: {},
      });
  }
  console.info(
    "Duas organizações e seis eventos fictícios preparados. Nenhuma conta administrativa foi criada.",
  );
} finally {
  await db.$disconnect();
}
