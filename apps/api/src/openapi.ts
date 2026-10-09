type Operation = {
  method: string;
  path: string;
  summary: string;
  security?: "account" | "draft" | "both";
  body?: string;
  query?: string[];
  multipart?: boolean;
};
const operations: Operation[] = [
  { method: "get", path: "/health", summary: "Verificar processo" },
  { method: "get", path: "/readiness", summary: "Verificar banco" },
  { method: "get", path: "/config", summary: "Configuração pública do Auth" },
  {
    method: "get",
    path: "/organizations/{organizationId}/registrations/{registrationId}/decision-notice",
    summary: "Aviso de aceite ou recusa e confirmação de presença",
    security: "account",
  },
  ...["email", "whatsapp-sent", "renew"].map((action) => ({
    method: "post",
    path: `/organizations/{organizationId}/registrations/{registrationId}/decision-notice/${action}`,
    summary:
      action === "email"
        ? "Enviar aviso por e-mail"
        : action === "renew"
          ? "Renovar link do candidato"
          : "Registrar declaração de envio pelo WhatsApp",
    security: "account" as const,
  })),
  {
    method: "post",
    path: "/public/decision-responses/{noticeId}/view",
    summary:
      "Consultar aviso com a credencial recebida, sem confirmar presença",
    body: "ResponseCredential",
  },
  {
    method: "post",
    path: "/public/decision-responses/{noticeId}",
    summary: "Confirmar presença explicitamente, sem conta obrigatória",
    body: "ResponseCredential",
  },
  {
    method: "get",
    path: "/organizations/{organizationId}/events/{eventId}/volunteer-form",
    summary: "Modelo e última versão da ficha de intenção para servos",
    security: "account",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/events/{eventId}/volunteer-form",
    summary:
      "Publicar nova versão da ficha de servos e disponibilizar o evento",
    security: "account",
    body: "Form",
  },
  {
    method: "get",
    path: "/organizations/{organizationId}/event-setups",
    summary: "Listar eventos da etapa gradual",
    security: "account",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/event-setups",
    summary: "Criar evento e períodos de servos e campistas, com arte opcional",
    security: "account",
    multipart: true,
  },
  {
    method: "put",
    path: "/organizations/{organizationId}/event-setups/{eventId}",
    summary: "Editar evento em preparação e seus dois períodos",
    security: "account",
    multipart: true,
  },
  {
    method: "get",
    path: "/me/access",
    summary: "Conta e vínculos ativos",
    security: "account",
  },
  {
    method: "get",
    path: "/admin/organizations",
    summary: "Listar organizações como administrador",
    security: "account",
    query: ["page", "pageSize"],
  },
  {
    method: "post",
    path: "/admin/organizations",
    summary: "Cadastrar organização como administrador",
    security: "account",
    body: "Organization",
  },
  {
    method: "put",
    path: "/admin/organizations/{organizationId}",
    summary: "Atualizar organização e estado ativo",
    security: "account",
    body: "OrganizationUpdate",
  },
  {
    method: "get",
    path: "/organizations/{organizationId}/members",
    summary: "Listar membros e convites",
    security: "account",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/invitations",
    summary: "Convidar membro",
    security: "account",
    body: "Invitation",
  },
  {
    method: "delete",
    path: "/organizations/{organizationId}/invitations/{invitationId}",
    summary: "Revogar convite",
    security: "account",
  },
  {
    method: "patch",
    path: "/organizations/{organizationId}/members/{memberId}",
    summary: "Atualizar permissões de membro",
    security: "account",
    body: "Membership",
  },
  {
    method: "post",
    path: "/invitations/{token}/accept",
    summary: "Aceitar convite correspondente ao e-mail verificado",
    security: "account",
  },
  {
    method: "get",
    path: "/public/events",
    summary: "Listar eventos com campanhas abertas",
    query: ["q", "city", "organizationId", "page", "pageSize"],
  },
  {
    method: "get",
    path: "/public/events/{eventId}",
    summary: "Consultar evento publicado",
  },
  {
    method: "get",
    path: "/public/campaigns/{campaignId}",
    summary: "Consultar campanha e ficha publicada",
  },
  {
    method: "get",
    path: "/organizations/{organizationId}/events",
    summary: "Listar edições da organização",
    security: "account",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/events",
    summary: "Cadastrar edição",
    security: "account",
    body: "Event",
  },
  {
    method: "put",
    path: "/organizations/{organizationId}/events/{eventId}",
    summary: "Editar edição",
    security: "account",
    body: "Event",
  },
  {
    method: "patch",
    path: "/organizations/{organizationId}/events/{eventId}/status",
    summary: "Publicar, cancelar ou realizar edição",
    security: "account",
    body: "EventStatus",
  },
  {
    method: "put",
    path: "/organizations/{organizationId}/events/{eventId}/campaigns",
    summary: "Configurar campanha independente",
    security: "account",
    body: "Campaign",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/campaigns/{campaignId}/forms",
    summary: "Criar versão de ficha",
    security: "account",
    body: "Form",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/campaigns/{campaignId}/forms/{formId}/publish",
    summary: "Publicar ficha imutável",
    security: "account",
  },
  {
    method: "post",
    path: "/public/campaigns/{campaignId}/drafts",
    summary: "Iniciar rascunho sem conta",
  },
  {
    method: "get",
    path: "/public/drafts/{draftId}",
    summary: "Retomar rascunho pela credencial",
    security: "draft",
  },
  {
    method: "put",
    path: "/public/drafts/{draftId}",
    summary: "Salvar rascunho e saúde separada",
    security: "draft",
    body: "DraftUpdate",
  },
  {
    method: "post",
    path: "/public/drafts/{draftId}/submit",
    summary: "Enviar ficha de forma idempotente",
    security: "draft",
  },
  {
    method: "post",
    path: "/public/drafts/{draftId}/photo",
    summary: "Guardar foto privada otimizada",
    security: "draft",
    multipart: true,
  },
  {
    method: "get",
    path: "/public/drafts/{draftId}/photos/{assetId}",
    summary: "Consultar foto do próprio rascunho",
    security: "draft",
  },
  {
    method: "get",
    path: "/organizations/{organizationId}/registrations",
    summary: "Listar fichas sem saúde",
    security: "account",
    query: ["eventId", "campaignId", "status", "page", "pageSize"],
  },
  {
    method: "get",
    path: "/organizations/{organizationId}/registrations/{registrationId}",
    summary: "Consultar ficha e histórico sem saúde",
    security: "account",
  },
  {
    method: "patch",
    path: "/organizations/{organizationId}/registrations/{registrationId}/status",
    summary: "Analisar e confirmar com controle de capacidade",
    security: "account",
    body: "Decision",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/events/{eventId}/teams",
    summary: "Criar departamento da edição com vagas",
    security: "account",
    body: "Team",
  },
  {
    method: "put",
    path: "/organizations/{organizationId}/events/{eventId}/teams/{teamId}",
    summary: "Alterar vagas do departamento sem reduzir abaixo dos alocados",
    security: "account",
    body: "DepartmentCapacity",
  },
  {
    method: "put",
    path: "/organizations/{organizationId}/registrations/{registrationId}/team",
    summary: "Alocar servo aprovado",
    security: "account",
    body: "Assignment",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/registrations/{registrationId}/link",
    summary: "Vincular individualmente após comprovação",
    security: "account",
    body: "ManualLink",
  },
  {
    method: "get",
    path: "/organizations/{organizationId}/events/{eventId}/health",
    summary: "Listar participantes do evento autorizado para saúde",
    security: "account",
  },
  {
    method: "get",
    path: "/organizations/{organizationId}/registrations/{registrationId}/health",
    summary: "Consultar saúde com escopo e auditoria",
    security: "account",
  },
  {
    method: "get",
    path: "/organizations/{organizationId}/registrations/{registrationId}/photo",
    summary: "Consultar foto da organização",
    security: "account",
  },
  {
    method: "get",
    path: "/me/profile",
    summary: "Consultar perfil próprio",
    security: "account",
  },
  {
    method: "put",
    path: "/me/profile",
    summary: "Atualizar perfil sem alterar fichas históricas",
    security: "account",
    body: "Profile",
  },
  {
    method: "get",
    path: "/me/registrations",
    summary: "Consultar somente inscrições vinculadas",
    security: "account",
  },
  {
    method: "post",
    path: "/me/drafts/{draftId}/claim",
    summary: "Vincular com credencial e e-mail verificado",
    security: "both",
  },
  {
    method: "post",
    path: "/me/photo",
    summary: "Guardar foto independente do perfil",
    security: "account",
    multipart: true,
  },
  {
    method: "get",
    path: "/me/photos/{assetId}",
    summary: "Consultar foto própria",
    security: "account",
  },
  {
    method: "get",
    path: "/me/registrations/{registrationId}/photo",
    summary: "Consultar foto da inscrição própria",
    security: "account",
  },
];
const string = { type: "string" };
const uuid = { type: "string", format: "uuid" };
const boolean = { type: "boolean" };
const object = (
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({ type: "object", additionalProperties: false, properties, required });
const organization = {
  name: string,
  kind: { enum: ["PARISH", "COMMUNITY", "ORGANIZATION"] },
  city: string,
  state: string,
  contact: string,
  logoUrl: { type: "string", format: "uri", nullable: true },
};
const schemas = {
  Organization: object(organization, [
    "name",
    "kind",
    "city",
    "state",
    "contact",
  ]),
  OrganizationUpdate: object({ ...organization, active: boolean }, [
    "name",
    "kind",
    "city",
    "state",
    "contact",
    "active",
  ]),
  Invitation: object(
    {
      email: { type: "string", format: "email" },
      role: { enum: ["ORGANIZER", "SECRETARY", "HEALTH"] },
    },
    ["email", "role"],
  ),
  Membership: object(
    {
      role: { enum: ["ORGANIZER", "SECRETARY", "HEALTH"] },
      active: boolean,
      healthEventIds: { type: "array", items: uuid },
    },
    ["role", "active"],
  ),
  Event: object(
    {
      typeName: string,
      name: string,
      description: string,
      imageUrl: { ...string, format: "uri", nullable: true },
      location: string,
      city: string,
      startsAt: { ...string, format: "date" },
      endsAt: { ...string, format: "date" },
    },
    [
      "typeName",
      "name",
      "description",
      "location",
      "city",
      "startsAt",
      "endsAt",
    ],
  ),
  EventStatus: object(
    { status: { enum: ["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"] } },
    ["status"],
  ),
  Campaign: object(
    {
      kind: { enum: ["CAMPER", "VOLUNTEER"] },
      opensAt: { ...string, format: "date-time" },
      closesAt: { ...string, format: "date-time" },
      paused: boolean,
      capacity: { type: "integer", minimum: 1, nullable: true },
      allowWaitlist: boolean,
    },
    ["kind", "opensAt", "closesAt"],
  ),
  Question: object(
    {
      id: string,
      label: string,
      type: {
        enum: ["text", "number", "date", "boolean", "single", "multiple"],
      },
      required: boolean,
      options: { type: "array", items: string },
      hint: string,
      maxSelections: { type: "integer", minimum: 1, maximum: 30 },
      exclusiveOption: string,
      mustBeTrue: boolean,
    },
    ["id", "label", "type", "required"],
  ),
  ResponseCredential: object(
    {
      token: {
        type: "string",
        pattern: "^[A-Za-z0-9_-]{43}$",
        description: "Credencial pessoal recebida no fragmento do link.",
      },
    },
    ["token"],
  ),
  Form: object(
    {
      askCpf: boolean,
      askAddress: boolean,
      askShirt: boolean,
      terms: string,
      volunteer: object(
        {
          template: { enum: ["VOLUNTEER_INTENTION_V1"] },
          requirements: string,
          training: string,
        },
        ["template", "requirements", "training"],
      ),
      questions: {
        type: "array",
        maxItems: 30,
        items: { $ref: "#/components/schemas/Question" },
      },
    },
    ["askCpf", "askAddress", "askShirt", "terms", "questions"],
  ),
  Payload: object(
    Object.fromEntries(
      [
        "name",
        "birthDate",
        "phone",
        "email",
        "cpf",
        "address",
        "shirt",
        "photoAssetId",
        "emergencyName",
        "emergencyPhone",
        "emergencyRelationship",
        "guardianName",
        "guardianPhone",
        "guardianRelationship",
        "availability",
        "preferredTeamId",
      ]
        .map((key) => [key, string])
        .concat([
          ["guardianAuthorization", boolean],
          ["termsAccepted", boolean],
          ["imageAuthorized", boolean],
          ["answers", { type: "object" }],
        ]),
    ),
  ),
  Health: object({
    hasAllergies: boolean,
    allergies: string,
    hasMedication: boolean,
    medication: string,
    hasDiet: boolean,
    diet: string,
    hasCondition: boolean,
    condition: string,
    hasNeeds: boolean,
    needs: string,
  }),
  DraftUpdate: object(
    {
      payload: { $ref: "#/components/schemas/Payload" },
      health: { $ref: "#/components/schemas/Health" },
    },
    ["payload", "health"],
  ),
  Decision: object(
    {
      status: {
        enum: [
          "REVIEW",
          "APPROVED",
          "CONFIRMED",
          "WAITLIST",
          "REJECTED",
          "CANCELLED",
        ],
      },
      reason: { ...string, minLength: 3 },
    },
    ["status", "reason"],
  ),
  Team: object(
    {
      name: string,
      capacity: { type: "integer", minimum: 0, maximum: 100000 },
    },
    ["name", "capacity"],
  ),
  DepartmentCapacity: object(
    { capacity: { type: "integer", minimum: 0, maximum: 100000 } },
    ["capacity"],
  ),
  Assignment: object({ teamId: uuid }, ["teamId"]),
  ManualLink: object(
    {
      email: { ...string, format: "email" },
      reason: { ...string, minLength: 10 },
    },
    ["email", "reason"],
  ),
  Profile: object(
    {
      name: string,
      phone: string,
      birthDate: { ...string, format: "date" },
      city: string,
      photoAssetId: uuid,
    },
    ["name"],
  ),
  Error: object(
    {
      error: object(
        { code: string, message: string, fields: { type: "object" } },
        ["code", "message"],
      ),
    },
    ["error"],
  ),
};
const paths: Record<string, Record<string, unknown>> = {};
for (const operation of operations) {
  const parameters = [
    ...Array.from(operation.path.matchAll(/\{([^}]+)\}/g), (match) => ({
      name: match[1],
      in: "path",
      required: true,
      schema: match[1] === "token" ? string : uuid,
    })),
    ...(operation.query ?? []).map((name) => ({
      name,
      in: "query",
      schema: ["page", "pageSize"].includes(name)
        ? { type: "integer", minimum: 1 }
        : string,
    })),
  ];
  const security =
    operation.security === "both"
      ? [{ BearerAuth: [], DraftToken: [] }]
      : operation.security === "account"
        ? [{ BearerAuth: [] }]
        : operation.security === "draft"
          ? [{ DraftToken: [] }]
          : [];
  const requestBody = operation.body
    ? {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: `#/components/schemas/${operation.body}` },
          },
        },
      }
    : operation.multipart
      ? {
          required: true,
          content: {
            "multipart/form-data": {
              schema: object(
                operation.path.includes("event-setups")
                  ? {
                      data: {
                        ...string,
                        description:
                          "JSON com event e campaigns (servos e campistas).",
                      },
                      artwork: { type: "string", format: "binary" },
                    }
                  : {
                      photo: { type: "string", format: "binary" },
                      crop: string,
                    },
                operation.path.includes("event-setups") ? ["data"] : ["photo"],
              ),
            },
          },
        }
      : undefined;
  paths[operation.path] ??= {};
  paths[operation.path][operation.method] = {
    summary: operation.summary,
    parameters,
    security,
    ...(requestBody ? { requestBody } : {}),
    responses: {
      "200": { description: "Operação concluída" },
      ...(operation.method === "post"
        ? { "201": { description: "Recurso criado" } }
        : {}),
      "401": { description: "Credencial inválida" },
      "403": { description: "Sem permissão" },
      "404": { description: "Recurso indisponível neste escopo" },
      "409": { description: "Conflito de estado ou capacidade" },
      "422": {
        description: "Dados inválidos",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    },
  };
}
export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Encontro — API de eventos",
    version: "0.1.0",
    description:
      "Conta global, organizações isoladas e inscrições sem conta obrigatória. Contratos detalhados em docs/api.md.",
  },
  servers: [{ url: "/api/v1" }],
  paths,
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "Supabase JWT",
      },
      DraftToken: { type: "apiKey", in: "header", name: "X-Draft-Token" },
    },
    schemas,
  },
};
