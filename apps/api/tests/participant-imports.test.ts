import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { volunteerTemplate } from "../src/modules/events/volunteer-template.js";
import type { RegistrationsService } from "../src/modules/registrations/registrations.service.js";
import { ParticipantImportsService } from "../src/modules/participant-imports/participant-imports.service.js";
import ExcelJS from "exceljs";
import {
  readWorkbook,
  mappedValues,
  mappingSchema,
  normalizeName,
  normalizePhone,
  normalizeBirth,
  normalizeShirt,
  normalized,
  suggestedMapping,
} from "../src/modules/participant-imports/workbook.js";
import { analyzeRows } from "../src/modules/participant-imports/participant-imports.service.js";

describe("Leitura e identificação dos cadastros anteriores", () => {
  it("limita a resposta pública e não sugere resposta única para seleção múltipla", async () => {
    const config = volunteerTemplate("FAC");
    config.questions.find((q) => q.id === "sexo")!.type = "multiple";
    const db = {
      $queryRaw: async () => [{ ready: true }],
      previousParticipant: {
        findMany: async () => [
          {
            city: "Loanda",
            sex: "Feminino",
            shirt: "G",
            responses: { paroquia: "Resposta privada" },
            name: "Nome privado",
            phone: "Contato privado",
          },
        ],
      },
    } as unknown as PrismaClient;
    const registrations = {
      authorizedDraft: async () => ({
        campaign: {
          kind: "VOLUNTEER",
          paused: false,
          opensAt: new Date("2020-01-01"),
          closesAt: new Date("2090-01-01"),
          event: {
            organizationId: "org",
            status: "PUBLISHED",
            organization: { active: true },
          },
        },
        form: { config },
      }),
    } as unknown as RegistrationsService;
    const service = new ParticipantImportsService(db, registrations, true);
    expect(
      await service.prefill("draft", "token", {
        name: "Maria Teste",
        birthDate: "2000-01-01",
        phone: "44999999999",
      }),
    ).toEqual({ payload: { shirt: "G", answers: { cidade: "Loanda" } } });
  });
  it("normaliza apresentação sem aproximar nomes diferentes", () => {
    expect(normalizeName("  José   DA Silva ")).toBe("jose da silva");
    expect(normalizeName("José Silva")).not.toBe(
      normalizeName("José da Silva"),
    );
    expect(normalizePhone("+55 (44) 99999-9999")).toBe("44999999999");
    expect(normalizePhone("(55) 99999-9999")).toBe("55999999999");
    expect(normalizeBirth("31/02/2000")).toBe("");
    expect(normalizeBirth("29/02/2000")).toBe("2000-02-29");
    expect(normalizeBirth("2000-02-30")).toBe("");
    expect(normalizeShirt(" Tamanho (g) ")).toBe("G");
    expect(normalizeShirt("G1")).toBe("");
    expect(normalizeShirt("72/56")).toBe("");
  });
  it("lê datas, abas, colunas não mapeadas e resultados já salvos sem executar fórmulas", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Respostas");
    sheet.addRow([
      "Nome completo:",
      "Celular:",
      "Data de Nascimento:",
      "Cidade:",
      "Sexo:",
      "Tamanho Camiseta:",
      "Paróquia",
      "Foto",
    ]);
    sheet.addRow([
      "José da Silva",
      "44999999999",
      new Date("2000-02-29"),
      { formula: '"Loanda"', result: "Loanda" },
      "Masculino",
      "Tamanho G",
      "Resposta privada",
      { text: "Foto", hyperlink: "https://drive.google.test/foto" },
    ]);
    workbook.addWorksheet("Outra aba").addRow(["Sem respostas"]);
    const sheets = await readWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer()),
    );
    expect(sheets).toHaveLength(2);
    expect(sheets[0].rows[0].cells[2]).toBe("2000-02-29");
    expect(sheets[0].rows[0].cells[3]).toBe("Loanda");
    expect(sheets[0].rows[0].cells[6]).toBe("Resposta privada");
    expect(sheets[0].rows[0].cells[7]).toContain(
      "https://drive.google.test/foto",
    );
    const mapping = mappingSchema.parse(suggestedMapping(sheets[0].headers));
    expect(
      normalized(mappedValues(sheets[0].rows[0].cells, mapping)),
    ).toMatchObject({ shirt: "G", errors: [] });
    expect(
      mappingSchema.safeParse({ ...mapping, phone: mapping.name }).success,
    ).toBe(false);
  });
  it("rejeita arquivos inválidos, grandes e planilhas acima de 5.000 registros", async () => {
    await expect(readWorkbook(Buffer.from("not-an-excel"))).rejects.toThrow(
      "XLSX",
    );
    await expect(
      readWorkbook(Buffer.alloc(10 * 1024 * 1024 + 1)),
    ).rejects.toThrow("10 MB");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Excesso");
    sheet.addRow(["Nome"]);
    for (let i = 0; i < 5001; i++) sheet.addRow(["Participante Teste"]);
    await expect(
      readWorkbook(Buffer.from(await workbook.xlsx.writeBuffer())),
    ).rejects.toThrow("5.000");
  });
  it("separa identificação inválida, homônimos, telefone compartilhado e camisetas não reconhecidas", () => {
    const values = {
      name: "Maria Teste",
      birthDate: "2000-02-29",
      phone: "44999999999",
      city: "Loanda",
      sex: "Feminino",
      shirt: "G1",
    };
    const row = (id: string, rowNumber: number, v = values) => ({
      id,
      rowNumber,
      values: v,
      original: {},
      decision: "KEEP",
      reviewed: false,
      replaceId: null,
    });
    const reports = analyzeRows(
      [
        row("a", 2),
        row("b", 3, { ...values, phone: "44888888888" }),
        row("c", 4, { ...values, name: "Ana Teste" }),
        row("d", 5, { ...values, phone: "123" }),
      ],
      [],
    );
    expect(reports[0].pending).toBe(true);
    expect(reports[0].duplicateRows).toEqual([3]);
    expect(reports[0].warnings.join(" ")).toMatch(/Camiseta.*compartilhado/);
    expect(reports[2].pending).toBe(false);
    expect(reports[3].errors).toContain("Confira o celular com DDD.");
  });
});
