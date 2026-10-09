import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pendingInvitation, rememberInvitation } from "./navigation";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("Contexto temporário do convite", () => {
  it("descarta o contexto expirado ao confirmar o e-mail em outra aba", () => {
    vi.useFakeTimers();
    rememberInvitation(`/convite/${"a".repeat(43)}`);
    sessionStorage.clear();
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    expect(pendingInvitation()).toBeNull();
    expect(localStorage.getItem("encontro.pendingInvitation")).toBeNull();
  });
  it("ignora um retorno externo adulterado no armazenamento", () => {
    localStorage.setItem(
      "encontro.pendingInvitation",
      JSON.stringify({
        path: "//outro.example",
        expiresAt: Date.now() + 10000,
      }),
    );
    expect(pendingInvitation()).toBeNull();
  });
  it("não restaura a cópia da aba original depois do aceite em outra aba", () => {
    rememberInvitation(`/convite/${"a".repeat(43)}`);
    localStorage.removeItem("encontro.pendingInvitation");
    expect(pendingInvitation()).toBeNull();
    expect(sessionStorage.getItem("encontro.pendingInvitation")).toBeNull();
  });
  it("continua usando o retorno da URL quando o navegador bloqueia armazenamento", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() =>
      rememberInvitation(`/convite/${"a".repeat(43)}`),
    ).not.toThrow();
    expect(pendingInvitation()).toBeNull();
  });
});
