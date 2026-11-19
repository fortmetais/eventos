import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, setAccessToken } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});
describe("Erros da API", () => {
  it("preserva o código de erro estruturado sem depender da mensagem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: "TEMPORARY_ACCESS_ALREADY_GRANTED",
            message: "Operação já aplicada.",
          },
        }),
      }),
    );
    await expect(api("/teste")).rejects.toMatchObject({
      name: "Error",
      status: 409,
      code: "TEMPORARY_ACCESS_ALREADY_GRANTED",
      message: "Operação já aplicada.",
    });
  });
  it("mantém compatibilidade com erros sem código e ignora códigos de formato inválido", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({
            error: { code: { internal: true }, message: "Inválido." },
          }),
        }),
    );
    await expect(api("/teste")).rejects.toBeInstanceOf(ApiError);
    await expect(api("/teste")).rejects.toMatchObject({
      status: 400,
      code: undefined,
    });
  });
});
