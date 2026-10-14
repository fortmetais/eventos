export const stepIds = ["identification", "photo", "about", "care", "review"];
export const guardianRelationships = Object.freeze([
  "Pai",
  "Mãe",
  "Tutor(a) legal",
  "Responsável com guarda judicial",
]);
export const emergencyRelationships = Object.freeze([
  "Pai",
  "Mãe",
  "Cônjuge",
  "Filho",
  "Filha",
  "Irmão",
  "Irmã",
  "Avô",
  "Avó",
  "Neto",
  "Neta",
  "Tio",
  "Tia",
  "Sobrinho",
  "Sobrinha",
  "Primo",
  "Prima",
  "Responsável legal",
  "Amigo",
  "Amiga",
  "Vizinho",
  "Vizinha",
  "Outro",
]);
export const stepLabels = [
  "Identificação",
  "Sua foto",
  "Sobre você",
  "Saúde e emergência",
  "Revisão e envio",
];
export const healthFields = [
  ["hasAllergies", "allergies", "Possui alguma alergia?"],
  ["hasMedication", "medication", "Usa medicamentos regularmente?"],
  ["hasDiet", "diet", "Possui restrição alimentar?"],
  [
    "hasCondition",
    "condition",
    "Há uma condição de saúde que precisamos conhecer?",
  ],
  ["hasNeeds", "needs", "Precisa de algum apoio ou adaptação?"],
];
const protectedIdentity =
  "Necessário para identificar o candidato e calcular sua idade.";

export function fieldCatalog(form, kind) {
  const base = (id, label, step, required = false, protectedReason) => ({
    key: `base:${id}`,
    label,
    step,
    required,
    protectedReason,
  });
  const fields = [
    base("name", "Nome completo", "identification", true, protectedIdentity),
    base(
      "phone",
      "Telefone / WhatsApp com DDD",
      "identification",
      true,
      protectedIdentity,
    ),
    base(
      "birthDate",
      "Data de nascimento",
      "identification",
      true,
      protectedIdentity,
    ),
    base("email", "E-mail (opcional)", "identification"),
    base("photoAssetId", "Foto", "photo", true),
    base("cpf", "CPF (opcional)", "about"),
    base("address", "Endereço (opcional)", "about"),
    base(
      "shirt",
      "Tamanho da camiseta",
      "about",
      Boolean(form.volunteer || form.camper),
    ),
    ...(kind === "VOLUNTEER"
      ? [
          base("availability", "Sua disponibilidade", "about", true),
          ...(!form.volunteer
            ? [
                base(
                  "preferredTeamId",
                  "Equipe de preferência (opcional)",
                  "about",
                ),
              ]
            : []),
        ]
      : []),
    base("emergencyName", "Nome do contato de emergência", "care", true),
    base(
      "emergencyPhone",
      "Telefone do contato de emergência com DDD",
      "care",
      true,
    ),
    base(
      "emergencyRelationship",
      "Parentesco / relação do contato de emergência",
      "care",
      true,
    ),
    ...(form.camper
      ? [
          base(
            "emergencyAlternativePhone",
            "Telefone alternativo de emergência (opcional)",
            "care",
          ),
        ]
      : []),
    ...healthFields.map(([flag, detail, label]) => ({
      key: `health:${flag}`,
      label,
      detail,
      step: "care",
      required: true,
    })),
    base(
      "guardian",
      "Responsável legal (somente para menores)",
      "care",
      true,
      "O responsável precisa ser identificado e assinar a autorização quando o candidato for menor.",
    ),
    base(
      "termsAccepted",
      "Aceite dos termos gerais",
      "review",
      true,
      "O aceite dos termos gerais é necessário para enviar a inscrição.",
    ),
    base(
      "imageAuthorized",
      "Autorização de imagem (opcional, para adultos)",
      "review",
    ),
  ];
  const questions = form.questions.map((question) => ({
    key: `question:${question.id}`,
    label: question.label,
    required: question.required,
    step:
      (form.volunteer && ["sexo", "cidade"].includes(question.id)) ||
      (form.camper && ["apelido", "cidade", "estado"].includes(question.id))
        ? "identification"
        : (form.volunteer &&
              ["aceite_formacao", "aceite_regras"].includes(question.id)) ||
            (form.camper && question.id === "aceite_orientacoes")
          ? "review"
          : "about",
  }));
  // A ordem legada mantém perguntas após os campos básicos, exceto os aceites
  // de servos, que originalmente precedem os termos gerais.
  return stepIds.flatMap((step) =>
    step === "review"
      ? [
          ...questions.filter((field) => field.step === step),
          ...fields.filter((field) => field.step === step),
        ]
      : [
          ...fields.filter((field) => field.step === step),
          ...questions.filter((field) => field.step === step),
        ],
  );
}

export function defaultLayout(form, kind) {
  const fields = fieldCatalog(form, kind);
  const legacyFlags = {
    "base:cpf": form.askCpf,
    "base:address": form.askAddress,
    "base:shirt": form.askShirt,
  };
  return {
    version: 1,
    kind,
    steps: stepIds.map((step) => ({
      step,
      fields: fields
        .filter((field) => field.step === step)
        .map((field) => ({
          key: field.key,
          hidden: field.key in legacyFlags ? !legacyFlags[field.key] : false,
        })),
    })),
  };
}

export function validateLayout(form) {
  if (!form.layout) return [];
  const layout = form.layout;
  const errors = [];
  const catalog = new Map(
    fieldCatalog(form, layout.kind).map((field) => [field.key, field]),
  );
  const seen = new Set();
  const steps = new Set();
  for (const group of layout.steps) {
    if (steps.has(group.step))
      errors.push("Cada etapa deve aparecer somente uma vez.");
    steps.add(group.step);
    for (const entry of group.fields) {
      const field = catalog.get(entry.key);
      if (!field) errors.push(`Campo desconhecido: ${entry.key}.`);
      else {
        if (field.step !== group.step)
          errors.push(`O campo ${field.label} não pode mudar de etapa.`);
        if (field.protectedReason && entry.hidden)
          errors.push(`Não é possível ocultar ${field.label}.`);
      }
      if (seen.has(entry.key)) errors.push(`Campo duplicado: ${entry.key}.`);
      seen.add(entry.key);
    }
  }
  if (steps.size !== 5 || stepIds.some((step) => !steps.has(step)))
    errors.push("Informe as cinco etapas da ficha.");
  if ([...catalog.keys()].some((key) => !seen.has(key)))
    errors.push("Todos os campos devem constar no layout, mesmo os ocultos.");
  if (form.volunteer && layout.kind !== "VOLUNTEER")
    errors.push("A ficha de intenção é exclusiva para servos.");
  if (form.camper && layout.kind !== "CAMPER")
    errors.push("A ficha de campistas exige uma campanha de campistas.");
  if (form.camper && form.volunteer)
    errors.push("Uma ficha deve atender somente um público.");
  return errors;
}

export function editableLayout(form, kind) {
  const fallback = defaultLayout(form, kind);
  if (!form.layout) return fallback;
  return {
    ...fallback,
    steps: fallback.steps.map((group) => {
      const previous =
        form.layout.steps.find((item) => item.step === group.step)?.fields ??
        [];
      const allowed = new Map(group.fields.map((item) => [item.key, item]));
      const retained = previous.filter((item) => allowed.has(item.key));
      return {
        ...group,
        fields: [
          ...retained,
          ...group.fields.filter(
            (item) => !retained.some((old) => old.key === item.key),
          ),
        ],
      };
    }),
  };
}

export function syncLegacyFlags(form) {
  if (!form.layout) return form;
  const visible = new Set(
    form.layout.steps.flatMap((step) =>
      step.fields.filter((field) => !field.hidden).map((field) => field.key),
    ),
  );
  return {
    ...form,
    askCpf: visible.has("base:cpf"),
    askAddress: visible.has("base:address"),
    askShirt: visible.has("base:shirt"),
  };
}

export function orderedFields(form, kind, step, minor = true) {
  const catalog = new Map(
    fieldCatalog(form, kind).map((field) => [field.key, field]),
  );
  const layout = form.layout ?? defaultLayout(form, kind);
  return (layout.steps.find((group) => group.step === step)?.fields ?? [])
    .filter(
      (entry) =>
        !entry.hidden &&
        catalog.has(entry.key) &&
        (minor || entry.key !== "base:guardian") &&
        (!minor || entry.key !== "base:imageAuthorized"),
    )
    .map((entry) => catalog.get(entry.key));
}

export function fieldVisible(form, kind, key) {
  return (form.layout ?? defaultLayout(form, kind)).steps.some((step) =>
    step.fields.some((field) => field.key === key && !field.hidden),
  );
}

export function sanitizeHidden(form, kind, payload, health) {
  const cleanPayload = {
    ...payload,
    ...(payload.answers ? { answers: { ...payload.answers } } : {}),
  };
  const cleanHealth = { ...health };
  if (!form.layout) return { payload: cleanPayload, health: cleanHealth };
  if (kind !== "VOLUNTEER") delete cleanPayload.availability;
  if (kind !== "VOLUNTEER" || form.volunteer)
    delete cleanPayload.preferredTeamId;
  for (const field of fieldCatalog(form, kind)) {
    if (fieldVisible(form, kind, field.key)) continue;
    const [source, id] = field.key.split(":");
    if (source === "question") delete cleanPayload.answers?.[id];
    else if (source === "health") {
      delete cleanHealth[id];
      delete cleanHealth[field.detail];
    } else delete cleanPayload[id];
  }
  return { payload: cleanPayload, health: cleanHealth };
}
