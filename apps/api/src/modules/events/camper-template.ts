import { defaultLayout } from "@fac/form-layout";
import type { FormConfig } from "./events.validation.js";

export function camperTemplate(typeName: string): FormConfig {
  const form: FormConfig = {
    askCpf: false,
    askAddress: true,
    askShirt: true,
    terms:
      "Declaro que as informações prestadas são verdadeiras e autorizo seu uso pela organização para analisar minha inscrição, identificar participantes e organizar os cuidados necessários durante este evento. Estou ciente de que o envio da ficha não garante uma vaga e de que devo aguardar a confirmação da organização. O uso de imagem é opcional. Para menores de idade, a participação depende da autorização assinada pelo responsável legal.",
    camper: {
      template: "CAMPER_REGISTRATION_V1",
      description: "",
      requirements:
        "A inscrição será analisada pela organização. O envio da ficha não garante uma vaga. Aguarde o retorno e a confirmação da participação.",
      arrivalInstructions:
        "A organização informará os horários de chegada, a programação e o que levar para o evento. Informe como pretende chegar e se precisa de orientações sobre transporte.",
    },
    questions: [
      {
        id: "apelido",
        label: "Nome pelo qual prefere ser chamado",
        type: "text",
        required: false,
        options: [],
      },
      {
        id: "cidade",
        label: "Cidade onde mora",
        type: "text",
        required: true,
        options: [],
      },
      {
        id: "estado",
        label: "Estado onde mora",
        type: "single",
        required: true,
        options: [
          "AC",
          "AL",
          "AP",
          "AM",
          "BA",
          "CE",
          "DF",
          "ES",
          "GO",
          "MA",
          "MT",
          "MS",
          "MG",
          "PA",
          "PB",
          "PR",
          "PE",
          "PI",
          "RJ",
          "RN",
          "RS",
          "RO",
          "RR",
          "SC",
          "SP",
          "SE",
          "TO",
        ],
      },
      {
        id: "paroquia",
        label: "Paróquia ou comunidade que frequenta (se possuir)",
        type: "text",
        required: false,
        options: [],
      },
      {
        id: "grupo_comunidade",
        label: "Participa de algum grupo, pastoral ou movimento? Qual?",
        type: "text",
        required: false,
        options: [],
      },
      {
        id: "experiencia_evento",
        label: `Já participou de acampamentos ou retiros, como ${typeName}?`,
        type: "boolean",
        required: true,
        options: [],
      },
      {
        id: "eventos_anteriores",
        label: "Quais acampamentos ou retiros já participou?",
        type: "text",
        required: false,
        options: [],
        hint: "Preencha se já participou de algum encontro.",
      },
      {
        id: "expectativas",
        label: "O que espera viver neste encontro?",
        type: "text",
        required: true,
        options: [],
      },
      {
        id: "chegada",
        label: "Como pretende chegar ao local?",
        type: "text",
        required: true,
        options: [],
      },
      {
        id: "transporte",
        label: "Precisa de informações sobre transporte?",
        type: "boolean",
        required: true,
        options: [],
      },
      {
        id: "observacoes",
        label: "Há alguma observação que deseja comunicar à organização?",
        type: "text",
        required: false,
        options: [],
      },
      {
        id: "aceite_orientacoes",
        label:
          "Conferi minhas informações e li as orientações para participar deste evento.",
        type: "boolean",
        required: true,
        mustBeTrue: true,
        options: [],
      },
    ],
  };
  return { ...form, layout: defaultLayout(form, "CAMPER") };
}
