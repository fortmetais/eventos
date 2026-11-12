import type { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import { assert } from "../../core/errors.js";

export const messageFields = [
  { key: "nome", label: "Nome do candidato", example: "Maria Exemplo" },
  {
    key: "primeiro_nome",
    label: "Primeiro nome do candidato",
    example: "Maria",
  },
  { key: "evento", label: "Nome do evento", example: "Acampamento de exemplo" },
  { key: "organizacao", label: "Organização", example: "Paróquia de exemplo" },
  { key: "data_evento", label: "Data do evento", example: "05/02/2027" },
  { key: "departamento", label: "Departamento alocado", example: "SECRETARIA" },
  {
    key: "link",
    label: "Link pessoal",
    example: "[link pessoal de confirmação]",
  },
  {
    key: "validade",
    label: "Validade do link",
    example: "[data e horário de vencimento]",
  },
] as const;
export type MessageValues = Record<
  Exclude<(typeof messageFields)[number]["key"], "primeiro_nome">,
  string
>;
export const defaultMessageTemplate = `Olá, {{nome}}! Sua candidatura para servir no {{evento}} foi aceita!

{{organizacao}} · Evento a partir de {{data_evento}}.

Departamento alocado: {{departamento}}.

Confirme sua presença pelo link: {{link}}

O link é pessoal e válido até {{validade}} (horário de Brasília). A organização finalizará a confirmação da sua participação.

Esperamos você!`;
export function validateMessageTemplate(template: string) {
  assert(
    template.trim().length >= 20 && template.length <= 5000,
    422,
    "Escreva uma mensagem entre 20 e 5.000 caracteres.",
  );
  const variables = [...template.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)].map(
    (match) => match[1],
  );
  assert(
    variables.every((key) => messageFields.some((field) => field.key === key)),
    422,
    "A mensagem contém uma informação automática desconhecida.",
  );
  assert(
    !/[{}]/.test(template.replace(/\{\{\s*[\w]+\s*\}\}/g, "")),
    422,
    "Confira as informações automáticas entre chaves.",
  );
  assert(
    variables.includes("nome") || variables.includes("primeiro_nome"),
    422,
    "Mantenha a informação automática {{nome}} ou {{primeiro_nome}} na mensagem.",
  );
  for (const key of ["evento", "link", "validade"])
    assert(
      variables.includes(key),
      422,
      `Mantenha a informação automática {{${key}}} na mensagem.`,
    );
  assert(
    variables.filter((key) => key === "link").length === 1,
    422,
    "Inclua o link pessoal uma única vez.",
  );
}
export function renderMessageTemplate(template: string, values: MessageValues) {
  const replacements = {
    ...values,
    primeiro_nome: values.nome.trim().split(/\s+/u)[0] ?? "",
  };
  return template.replace(
    /\{\{\s*([\w]+)\s*\}\}/g,
    (_, key: keyof typeof replacements) => replacements[key],
  );
}
type TemplateRow = {
  content: string | null;
  revision: number;
  updatedAt: Date;
};
type Db = PrismaClient | Prisma.TransactionClient;
export class EventMessagesService {
  constructor(private db: PrismaClient) {}
  async ready(db: Db = this.db) {
    const [row] = await db.$queryRaw<
      { ready: boolean }[]
    >`SELECT to_regclass('eventos.mensagens_aceite') IS NOT NULL AS ready`;
    return row?.ready === true;
  }
  async template(eventId: string) {
    if (!(await this.ready())) return null;
    const [row] = await this.db.$queryRaw<
      TemplateRow[]
    >`SELECT conteudo AS content, revisao AS revision, atualizado_em AS "updatedAt" FROM eventos.mensagens_aceite WHERE evento_id=${eventId}::uuid`;
    return row?.content ?? null;
  }
  async page(organizationId: string, eventId: string) {
    const event = await this.db.event.findFirst({
      where: { id: eventId, organizationId },
      include: { organization: true },
    });
    assert(event, 404, "Evento não encontrado nesta organização.");
    const ready = await this.ready();
    const [row] = ready
      ? await this.db.$queryRaw<
          TemplateRow[]
        >`SELECT conteudo AS content, revisao AS revision, atualizado_em AS "updatedAt" FROM eventos.mensagens_aceite WHERE evento_id=${eventId}::uuid`
      : [];
    return {
      ready,
      event: { id: event.id, name: event.name },
      revision: row?.revision ?? 0,
      template: row?.content ?? defaultMessageTemplate,
      customized: !!row?.content,
      defaultTemplate: defaultMessageTemplate,
      fields: messageFields,
      previewValues: {
        ...Object.fromEntries(
          messageFields.map((field) => [field.key, field.example]),
        ),
        evento: event.name,
        organizacao: event.organization.name,
        data_evento: new Intl.DateTimeFormat("pt-BR", {
          timeZone: "UTC",
        }).format(event.startsAt),
      },
    };
  }
  async save(
    organizationId: string,
    eventId: string,
    actorId: string,
    input: unknown,
  ) {
    const data = z
      .object({
        revision: z.number().int().min(0),
        template: z.string().max(5000).nullable(),
      })
      .strict()
      .parse(input);
    if (data.template !== null) validateMessageTemplate(data.template);
    assert(
      await this.ready(),
      503,
      "A personalização das mensagens aguarda a atualização 17 do banco.",
    );
    await this.db.$transaction(async (tx) => {
      const event = await tx.$queryRaw<
        { id: string }[]
      >`SELECT evento_id AS id FROM eventos.eventos WHERE evento_id=${eventId}::uuid AND organizacao_id=${organizationId}::uuid FOR UPDATE`;
      assert(event.length, 404, "Evento não encontrado nesta organização.");
      const [current] = await tx.$queryRaw<
        TemplateRow[]
      >`SELECT conteudo AS content, revisao AS revision, atualizado_em AS "updatedAt" FROM eventos.mensagens_aceite WHERE evento_id=${eventId}::uuid`;
      assert(
        (current?.revision ?? 0) === data.revision,
        409,
        "A mensagem foi alterada em outra tela. Recarregue antes de salvar.",
      );
      const content =
        data.template === defaultMessageTemplate ? null : data.template;
      await tx.$executeRaw`INSERT INTO eventos.mensagens_aceite (evento_id, conteudo, revisao, atualizado_por) VALUES (${eventId}::uuid, ${content}, 1, ${actorId}::uuid) ON CONFLICT (evento_id) DO UPDATE SET conteudo=EXCLUDED.conteudo, revisao=eventos.mensagens_aceite.revisao+1, atualizado_por=EXCLUDED.atualizado_por, atualizado_em=now()`;
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityId: eventId,
          action:
            content === null
              ? "EVENT_ACCEPT_MESSAGE_RESET"
              : "EVENT_ACCEPT_MESSAGE_UPDATED",
        },
      });
    });
    return this.page(organizationId, eventId);
  }
}
