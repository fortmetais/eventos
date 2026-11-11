import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { DecisionNoticesService } from "../src/modules/registrations/decision-notices.service.js";

describe("Resumo de convites em lote", () => {
  it("limita a hidratação aos avisos selecionados e não monta mensagens ou expõe credenciais", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ ready: true }])
      .mockResolvedValueOnce([{ id: "latest-a" }, { id: "latest-b" }]);
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "latest-a",
        registrationId: "a",
        kind: "ACEITE",
        revokedAt: null,
        emailStatus: "PENDENTE",
        emailSentAt: null,
        whatsappSentAt: null,
        confirmedAt: null,
        expiresAt: new Date("2099-01-01"),
        tokenHash: "should-never-leave-this-layer",
        registration: {
          status: "APPROVED",
          campaign: {
            event: { status: "PUBLISHED", organization: { active: true } },
          },
        },
      },
      {
        id: "latest-b",
        registrationId: "b",
        kind: "ACEITE",
        revokedAt: new Date(),
        emailStatus: "ENVIADA",
        emailSentAt: new Date(),
        whatsappSentAt: null,
        confirmedAt: null,
        expiresAt: new Date("2099-01-01"),
        registration: {
          status: "CANCELLED",
          campaign: {
            event: { status: "PUBLISHED", organization: { active: true } },
          },
        },
      },
    ]);
    const send = vi.fn();
    const service = new DecisionNoticesService(
      {
        $queryRaw: query,
        decisionNotice: { findMany },
      } as unknown as PrismaClient,
      { send },
      "summary-test-secret",
      "https://example.test",
    );
    const summaries = await service.summaries("organization", ["a", "b", "c"]);
    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany.mock.calls[0][0].where).toEqual({
      id: { in: ["latest-a", "latest-b"] },
      registration: { campaign: { event: { organizationId: "organization" } } },
    });
    expect(summaries.get("a")?.notice).toMatchObject({
      id: "latest-a",
      active: true,
      expired: false,
    });
    expect(summaries.get("b")?.notice).toMatchObject({
      id: "latest-b",
      active: false,
    });
    expect(summaries.get("c")).toEqual({ ready: true, notice: null });
    expect(JSON.stringify([...summaries.values()])).not.toMatch(
      /token|hash|whatsappLink|shortLink|message|"link"/i,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("preserva a instalação gradual sem consultar tabela indisponível", async () => {
    const query = vi.fn().mockResolvedValue([{ ready: false }]);
    const findMany = vi.fn(),
      send = vi.fn();
    const service = new DecisionNoticesService(
      {
        $queryRaw: query,
        decisionNotice: { findMany },
      } as unknown as PrismaClient,
      { send },
      "summary-test-secret",
      "https://example.test",
    );
    expect(await service.summaries("org", ["a"])).toEqual(
      new Map([["a", { ready: false, notice: null }]]),
    );
    expect(query).toHaveBeenCalledOnce();
    expect(findMany).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
