import type { FormConfig } from "./events.validation.js";

export const volunteerTeams = [
  "Animação (cantar / tocar)",
  "Cozinha",
  "Externa",
  "Anjos",
  "Intercessão",
  "Manutenção",
  "Ordem e Limpeza",
  "Recreação",
  "Secretaria",
  "Anjos Guardiões",
];

export function volunteerTemplate(
  typeName: string,
  departments = volunteerTeams,
): FormConfig {
  return {
    askCpf: false,
    askAddress: false,
    askShirt: true,
    terms:
      "Declaro que as informações prestadas são verdadeiras e autorizo seu uso pela organização para avaliar minha candidatura, identificar participantes e preparar o evento. Estou ciente de que esta ficha expressa minha intenção de servir e não confirma automaticamente minha participação. A aprovação e a equipe de trabalho serão definidas pela organização. O uso de imagem é uma escolha independente.",
    volunteer: {
      template: "VOLUNTEER_INTENTION_V1",
      requirements:
        "A candidatura será avaliada pela organização. A inscrição não garante vaga ou equipe de preferência.",
      training:
        "A organização informará a programação da preparação. Confirmo minha disponibilidade para participar das formações e alinhamentos comunicados para este evento.",
    },
    questions: [
      {
        id: "sexo",
        label: "Sexo",
        type: "single",
        required: true,
        options: ["Feminino", "Masculino"],
      },
      {
        id: "cidade",
        label: "Cidade onde mora",
        type: "text",
        required: true,
        options: [],
      },
      {
        id: "experiencia_evento",
        label: `Já participou ou serviu em um evento ${typeName}?`,
        type: "boolean",
        required: true,
        options: [],
      },
      {
        id: "acampamento_edicao",
        label: "É campista? Qual edição do acampamento você fez?",
        type: "text",
        required: true,
        options: [],
        hint: "Informe o tipo, a edição e a organização. Se ainda não participou, informe isso.",
      },
      {
        id: "formacao_saude",
        label: "Possui ou cursa formação na área da saúde? Se sim, qual?",
        type: "text",
        required: false,
        options: [],
      },
      {
        id: "conjuge",
        label:
          "Seu cônjuge também se inscreveu para servir? Se sim, qual o nome completo?",
        type: "text",
        required: false,
        options: [],
        hint: "Neste campo, cônjuge se refere à pessoa com quem você é casado(a).",
      },
      {
        id: "paroquia",
        label: "Qual paróquia frequenta?",
        type: "text",
        required: false,
        options: [],
      },
      {
        id: "sacramentos",
        label: "Quais sacramentos possui?",
        type: "multiple",
        required: true,
        options: [
          "Batismo",
          "1ª Eucaristia",
          "Crisma",
          "Não possuo nenhum sacramento",
        ],
        exclusiveOption: "Não possuo nenhum sacramento",
      },
      {
        id: "equipes_preferencia",
        label: "Em quais departamentos gostaria de servir?",
        type: "multiple",
        required: true,
        options: [...departments],
        maxSelections: 3,
        hint: "Selecione até três departamentos. É uma preferência; a organização definirá a alocação conforme as vagas.",
      },
      {
        id: "aceite_formacao",
        label:
          "Estou de acordo com a preparação e as formações informadas para este evento.",
        type: "boolean",
        required: true,
        options: [],
        mustBeTrue: true,
      },
      {
        id: "aceite_regras",
        label: "Declaro que estou ciente das regras para servir neste evento.",
        type: "boolean",
        required: true,
        options: [],
        mustBeTrue: true,
      },
    ],
  };
}
