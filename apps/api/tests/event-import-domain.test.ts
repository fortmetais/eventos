import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { defaultLayout } from "@fac/form-layout";
import { volunteerTemplate } from "../src/modules/events/volunteer-template.js";
import {
  eventImportCatalog,
  normalizeEventRow,
  readImportFile,
  suggestEventMapping,
  validateEventMapping,
  type EventImportMapping,
} from "../src/modules/participant-imports/event-import-domain.js";

// Synthetic records deliberately contain no participant data from the private CSV.
const headers = [
  "Carimbo de data/hora",
  "Nome completo:",
  "Sexo:",
  "Celular:",
  "Idade:",
  "Data de Nascimento:",
  "Cidade:",
  "Já FEZ ou SERVIU no FAC?",
  "É campista? Qual edição do Acampamento que você fez? (Sênior, Juvenil, JOAM, Mergulhar…)",
  "Possui ou cursa formação na área da saúde? Se sim, qual?",
  "Seu cônjuge também se inscreveu para servir? Se sim, qual nome completo dele(a):",
  "Qual paróquia frequenta?",
  "Possui quais sacramentos?",
  "SUGESTÃO- Qual equipe GOSTARIA de servir?",
  "Tamanho Camiseta:",
  "Informe o @ do seu INSTAGRAM\n\n",
  "FORMAÇÃO PARA EQUIPE DE TRABALHO",
  "CONFIRMAÇÃO DA INSCRIÇÃO:",
];
const departments = [
  { id: "a", name: "Anjos" },
  { id: "b", name: "Cozinha" },
  { id: "c", name: "Intercessão" },
  { id: "d", name: "Recreação" },
  { id: "e", name: "Secretaria" },
];
const form = () =>
  volunteerTemplate(
    "FAC",
    departments.map((department) => department.name),
  );
const cells = () => [
  "2026/10/09 4:23:52 PM GMT-3",
  " Pessoa   de Teste ",
  "Feminino",
  "+55 (44) 99999-1234",
  "26 anos",
  "2000-01-01",
  "Loanda PR",
  "Não!",
  "1º FAC de Teste",
  "Enfermagem",
  "",
  "Paróquia de Teste",
  "BATISMO;1a EUCARISTIA;CRISMA",
  "Anjos;Cozinha;Intercessão;Recreação;Secretaria",
  "Gg",
  "@pessoa_teste",
  "Sim, estou de acordo",
  "Sim, estou de acordo",
];
const mapping = (): EventImportMapping =>
  suggestEventMapping(headers, eventImportCatalog(form(), departments)).map(
    (entry) => ({ ...entry, confirmed: true }),
  );
const normalize = (overrides: Record<string, never> = {}) =>
  normalizeEventRow(
    { headers, cells: cells() },
    mapping(),
    [],
    form(),
    departments,
    new Date("2027-02-05"),
    overrides,
  );
const csv = (rows: string[][], delimiter = ",") =>
  rows
    .map((row) =>
      row
        .map((value) =>
          /["\r\n,;\t]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value,
        )
        .join(delimiter),
    )
    .join("\r\n");

describe("Leitura dos arquivos para candidaturas", () => {
  it("lê 356 respostas e 18 colunas com BOM, acentos e cabeçalho multilinha", async () => {
    const file = Buffer.from(
      "\uFEFF" + csv([headers, ...Array.from({ length: 356 }, () => cells())]),
    );
    const [sheet] = await readImportFile(file, "respostas.csv");
    expect(sheet.rows).toHaveLength(356);
    expect(sheet.headers).toHaveLength(18);
    expect(sheet.headers[15]).toBe("Informe o @ do seu INSTAGRAM");
    expect(sheet.rows[0].cells[8]).toBe("1º FAC de Teste");
    expect(sheet.rows[355].rowNumber).toBe(357);
  });

  it.each([";", "\t"])(
    "reconhece o separador %j e mantém separadores dentro de aspas",
    async (delimiter) => {
      const [sheet] = await readImportFile(
        Buffer.from(
          csv(
            [
              ["Nome", "Observação"],
              ["Pessoa Teste", "texto; com, detalhes\ne nova linha"],
            ],
            delimiter,
          ),
        ),
        "lista.csv",
      );
      expect(sheet.rows[0].cells).toEqual([
        "Pessoa Teste",
        "texto; com, detalhes\ne nova linha",
      ]);
    },
  );

  it("aceita Windows-1252 e o indicador de separador exportado pelo Excel", async () => {
    const [sheet] = await readImportFile(
      Buffer.from("sep=;\r\nNome;Cidade\r\nJoão Teste;Paranavaí", "latin1"),
      "lista.csv",
    );
    expect(sheet.rows[0].cells).toEqual(["João Teste", "Paranavaí"]);
  });

  it("mantém conteúdo parecido com fórmula como texto literal", async () => {
    const [sheet] = await readImportFile(
      Buffer.from(
        'Nome,Observação\nPessoa Teste,"=HYPERLINK(""https://example.test"")"',
      ),
      "lista.csv",
    );
    expect(sheet.rows[0].cells[1]).toBe('=HYPERLINK("https://example.test")');
  });

  it("mantém a leitura de Excel", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inscrições");
    sheet.addRow(["Nome", "Cidade"]);
    sheet.addRow(["Pessoa Teste", "Loanda"]);
    const result = await readImportFile(
      Buffer.from(await workbook.xlsx.writeBuffer()),
      "lista.xlsx",
    );
    expect(result[0].name).toBe("Inscrições");
    expect(result[0].rows[0].cells).toEqual(["Pessoa Teste", "Loanda"]);
  });

  it.each([
    ['Nome,Cidade\nPessoa,"sem fechamento', /aspas não fechadas/],
    ["Nome,Cidade\nPessoa,Loanda,outra", /quantidade de colunas/],
    ['Nome,Cidade\nPessoa,"Loanda"inválido', /aspas e o separador/],
    ["Nome,Cidade\nPessoa,\0", /CSV de texto válido/],
  ])("recusa CSV inconsistente", async (content, error) => {
    await expect(
      readImportFile(Buffer.from(content), "lista.csv"),
    ).rejects.toThrow(error);
  });

  it("aplica os limites de arquivo, coluna, linha e célula", async () => {
    await expect(
      readImportFile(Buffer.alloc(10 * 1024 * 1024 + 1), "lista.csv"),
    ).rejects.toThrow(/10 MB/);
    await expect(
      readImportFile(
        Buffer.from(Array(101).fill("Coluna").join(",") + "\nx"),
        "lista.csv",
      ),
    ).rejects.toThrow(/100 colunas/);
    await expect(
      readImportFile(
        Buffer.from("Nome\n" + Array(5001).fill("Pessoa").join("\n")),
        "lista.csv",
      ),
    ).rejects.toThrow(/5.000/);
    await expect(
      readImportFile(Buffer.from("Nome\n" + "a".repeat(20001)), "lista.csv"),
    ).rejects.toThrow(/resposta muito longa/);
  });
});

describe("Associação e normalização das candidaturas", () => {
  it.each(["G1", "G2", "G3", "G4"])(
    "importa a camiseta %s sem pendência de tamanho",
    (shirt) => {
      const original = cells();
      original[14] = shirt.toLowerCase();
      const result = normalizeEventRow(
        { headers, cells: original },
        mapping(),
        [],
        form(),
        departments,
        "2027-02-05",
      );
      expect(result.payload.shirt).toBe(shirt);
      expect(result.pending).not.toContain("Informar o tamanho da camiseta.");
    },
  );
  it("identifica as 18 colunas sem transformar concordâncias antigas em aceites atuais", () => {
    const associations = mapping();
    expect(associations.map((entry) => entry.target)).toEqual([
      "metadata:submittedAt",
      "name",
      "question:sexo",
      "phone",
      "metadata:age",
      "birthDate",
      "question:cidade",
      "question:experiencia_evento",
      "question:acampamento_edicao",
      "question:formacao_saude",
      "question:conjuge",
      "question:paroquia",
      "question:sacramentos",
      "question:equipes_preferencia",
      "shirt",
      "metadata:instagram",
      "historical:training",
      "historical:confirmation",
    ]);
    const result = normalize();
    expect(result.errors).toEqual([]);
    expect(result.payload).toMatchObject({
      name: "Pessoa de Teste",
      birthDate: "2000-01-01",
      phone: "44999991234",
      shirt: "GG",
    });
    expect(result.payload.answers.experiencia_evento).toBe(false);
    expect(result.payload.answers.sacramentos).toEqual([
      "Batismo",
      "1ª Eucaristia",
      "Crisma",
    ]);
    expect(result.payload).not.toHaveProperty("termsAccepted");
    expect(result.payload.answers).not.toHaveProperty("aceite_formacao");
    expect(result.payload.answers).not.toHaveProperty("aceite_regras");
    expect(result.historical["16"].value).toBe("Sim, estou de acordo");
    expect(result.submittedAt).toBe("2026-10-09T19:23:52.000Z");
    expect(result.metadata.ageAtEvent).toBe(27);
    expect(
      result.pending.some((value) => value.includes("termos atuais")),
    ).toBe(true);
  });

  it("preserva todas as preferências históricas e identifica departamentos por IDs", () => {
    const result = normalize();
    expect(result.preferences).toHaveLength(5);
    expect(result.departmentIds).toEqual(["a", "b", "c", "d", "e"]);
    expect(result.payload.answers.equipes_preferencia).toEqual(
      result.preferences,
    );
    expect(result.warnings).toContain(
      "Preferências históricas acima de três preservadas integralmente.",
    );
  });

  it("exige confirmação de todas as colunas e recusa índices/destinos duplicados ou desconhecidos", () => {
    const catalog = eventImportCatalog(form(), departments);
    expect(() =>
      validateEventMapping(
        suggestEventMapping(headers, catalog),
        headers,
        catalog,
      ),
    ).toThrow(/todas as colunas/);
    expect(() =>
      validateEventMapping(mapping().slice(1), headers, catalog),
    ).toThrow(/todas as colunas/);
    expect(() =>
      validateEventMapping(
        mapping().map((entry, index) =>
          index === 0 ? { ...entry, target: "name" } : entry,
        ),
        headers,
        catalog,
      ),
    ).toThrow(/mesmo campo/);
    expect(() =>
      validateEventMapping(
        mapping().map((entry, index) =>
          index === 0 ? { ...entry, column: 1 } : entry,
        ),
        headers,
        catalog,
      ),
    ).toThrow(/índices/);
    expect(() =>
      validateEventMapping(
        mapping().map((entry, index) =>
          index === 0 ? { ...entry, target: "question:inexistente" } : entry,
        ),
        headers,
        catalog,
      ),
    ).toThrow(/desconhecida/);
  });

  it("aplica equivalências aprovadas e mantém a correção individual acima delas", () => {
    const result = normalizeEventRow(
      { headers, cells: cells() },
      mapping(),
      [
        { target: "question:cidade", from: "Loanda PR", to: "Loanda - PR" },
        { target: "question:sexo", from: "Feminino", to: "Masculino" },
        { target: "shirt", from: "P", to: "GG" },
      ],
      form(),
      departments,
      "2027-02-05",
      { shirt: "P", "question:sexo": "Feminino" },
    );
    expect(result.payload.answers.cidade).toBe("Loanda - PR");
    expect(result.payload.answers.sexo).toBe("Feminino");
    expect(result.payload.shirt).toBe("P");
    expect(cells()[6]).toBe("Loanda PR");
  });

  it("aplica equivalência por opção, aceita IDs e preserva opções não reconhecidas como pendência", () => {
    const source = cells();
    source[13] = "Equipe Antiga;Equipe Inexistente";
    const result = normalizeEventRow(
      { headers, cells: source },
      mapping(),
      [
        {
          target: "question:equipes_preferencia",
          from: "Equipe Antiga",
          to: "a",
        },
      ],
      form(),
      departments,
      "2027-02-05",
    );
    expect(result.departmentIds).toEqual(["a"]);
    expect(
      result.pending.some((pending) => pending.includes("Equipe Inexistente")),
    ).toBe(true);
    expect(source[13]).toContain("Equipe Inexistente");
  });

  it("mantém respostas ocultas somente no histórico e não cria respostas negativas", () => {
    const config = form();
    config.layout = defaultLayout(config, "VOLUNTEER");
    for (const step of config.layout.steps)
      for (const entry of step.fields) {
        if (
          [
            "question:paroquia",
            "question:experiencia_evento",
            "base:shirt",
          ].includes(entry.key)
        )
          entry.hidden = true;
      }
    const source = cells();
    source[9] = "";
    const result = normalizeEventRow(
      { headers, cells: source },
      mapping(),
      [],
      config,
      departments,
      "2027-02-05",
    );
    expect(result.payload).not.toHaveProperty("shirt");
    expect(result.payload.answers).not.toHaveProperty("paroquia");
    expect(result.payload.answers).not.toHaveProperty("experiencia_evento");
    expect(result.payload.answers).not.toHaveProperty("formacao_saude");
    expect(result.historical["11"].value).toBe("Paróquia de Teste");
  });

  it("não deduz idade ou DDD e separa identidade inválida de campos complementares", () => {
    const source = cells();
    source[3] = "999991234";
    source[5] = "0075-01-01";
    source[6] = "39";
    source[14] = "Extra monstro";
    const result = normalizeEventRow(
      { headers, cells: source },
      mapping(),
      [],
      form(),
      departments,
      "2027-02-05",
    );
    expect(result.errors).toContain("Confira a data de nascimento.");
    expect(result.errors).toContain("Confira o celular com DDD.");
    expect(result.payload.phone).toBe("999991234");
    expect(result.payload.birthDate).toBe("");
    expect(result.payload).not.toHaveProperty("shirt");
    expect(result.payload.answers).not.toHaveProperty("cidade");
    expect(result.pending.length).toBeGreaterThan(0);
  });

  it("não converte uma resposta contraditória de sacramentos em resposta válida", () => {
    const source = cells();
    source[12] = "BATISMO;não possuo nenhum sacramento";
    const result = normalizeEventRow(
      { headers, cells: source },
      mapping(),
      [],
      form(),
      departments,
      "2027-02-05",
    );
    expect(result.payload.answers).not.toHaveProperty("sacramentos");
    expect(
      result.pending.some((pending) => pending.includes("Opção exclusiva")),
    ).toBe(true);
  });

  it("calcula necessidade do responsável na data do evento e não altera o nascimento", () => {
    const source = cells();
    source[5] = "2010-03-01";
    source[4] = "16";
    const result = normalizeEventRow(
      { headers, cells: source },
      mapping(),
      [],
      form(),
      departments,
      "2027-02-05",
    );
    expect(result.metadata.ageAtSubmission).toBe(16);
    expect(result.metadata.ageAtEvent).toBe(16);
    expect(
      result.pending.some((pending) =>
        pending.includes("autorização para menor"),
      ),
    ).toBe(true);
    expect(result.payload.birthDate).toBe("2010-03-01");
  });

  it("mantém datas futuras válidas nas perguntas que não são nascimento", () => {
    const config = form();
    config.questions.push({
      id: "dia_preparacao",
      label: "Dia da preparação",
      type: "date",
      required: false,
      options: [],
    });
    const sourceHeaders = [...headers, "Dia da preparação"];
    const sourceCells = [...cells(), "05/02/2027"];
    const associations = suggestEventMapping(
      sourceHeaders,
      eventImportCatalog(config, departments),
    ).map((entry) => ({ ...entry, confirmed: true }));
    const result = normalizeEventRow(
      { headers: sourceHeaders, cells: sourceCells },
      associations,
      [],
      config,
      departments,
      "2027-02-05",
    );
    expect(result.payload.answers.dia_preparacao).toBe("2027-02-05");
  });

  it("preserva como histórico até quando um aceite atual é associado explicitamente", () => {
    const associations = mapping();
    associations[16].target = "question:aceite_formacao";
    const source = cells();
    source[16] = "Sim!";
    const result = normalizeEventRow(
      { headers, cells: source },
      associations,
      [],
      form(),
      departments,
      "2027-02-05",
    );
    expect(result.payload.answers).not.toHaveProperty("aceite_formacao");
    expect(result.historical["16"].value).toBe("Sim!");
    expect(
      result.pending.some((pending) =>
        pending.includes("Confirmar: Estou de acordo"),
      ),
    ).toBe(true);
  });

  it("confere a idade na data local do envio, mesmo quando UTC já é outro dia", () => {
    const source = cells();
    source[0] = "2026/10/09 11:23:52 PM GMT-3";
    source[5] = "2000-10-10";
    source[4] = "25 anos";
    const result = normalizeEventRow(
      { headers, cells: source },
      mapping(),
      [],
      form(),
      departments,
      "2027-02-05",
    );
    expect(result.submittedAt).toBe("2026-10-10T02:23:52.000Z");
    expect(result.metadata.ageAtSubmission).toBe(25);
    expect(
      result.warnings.some((warning) =>
        warning.includes("idade informada difere"),
      ),
    ).toBe(false);
  });

  it("permite corrigir pergunta conhecida sem coluna de origem sem criar aceites", () => {
    const config = form();
    config.questions.push({
      id: "transporte",
      label: "Precisa de transporte?",
      type: "boolean",
      required: false,
      options: [],
    });
    const result = normalizeEventRow(
      { headers, cells: cells() },
      mapping(),
      [],
      config,
      departments,
      "2027-02-05",
      {
        "question:transporte": false,
        "question:aceite_regras": true,
      },
    );
    expect(result.payload.answers.transporte).toBe(false);
    expect(result.payload.answers).not.toHaveProperty("aceite_regras");
    expect(result.historical["override:question:aceite_regras"].value).toBe(
      true,
    );
    expect(result.payload).not.toHaveProperty("termsAccepted");
  });
});
