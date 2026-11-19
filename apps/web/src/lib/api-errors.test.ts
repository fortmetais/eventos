import { describe, expect, it } from "vitest";
import { ApiError, apiFieldErrorMessage } from "./api";

describe("API field error messages", () => {
  it("preserves the server's field/message order without modifying the error", () => {
    const fields = {
      fieldErrors: {
        name: ["Confira o nome.", "O nome está incompleto."],
        startsAt: ["Confira a data."],
      },
    };
    const error = new ApiError("Confira os campos.", 422, fields);

    expect(apiFieldErrorMessage(error)).toBe(
      "Confira o nome. O nome está incompleto. Confira a data.",
    );
    expect(error.fields).toBe(fields);
    expect(error.message).toBe("Confira os campos.");
    expect(error.status).toBe(422);
  });

  it("lets the caller retain its existing fallback for errors without fields", () => {
    expect(apiFieldErrorMessage(new ApiError("Conflito de revisão.", 409))).toBe("");
    expect(
      apiFieldErrorMessage(new ApiError("Campos inválidos.", 422, { fieldErrors: {} })),
    ).toBe("");
    expect(apiFieldErrorMessage(new Error("Falha de conexão."))).toBe("");
  });
});
