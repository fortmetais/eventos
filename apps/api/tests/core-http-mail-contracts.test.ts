import type { Request } from "express";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, errorHandler } from "../src/core/errors.js";
import { parseMultipartBody } from "../src/core/http-input.js";
import { logOperationalEvent } from "../src/core/operational-log.js";
import { createSmtpTransport } from "../src/core/smtp-transport.js";
import { mailer } from "../src/core/mail.js";
import { decisionEmailSender } from "../src/core/decision-mail.js";

const mocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  close: vi.fn(),
  config: {
    SMTP_HOST: "smtp.example.test" as string | undefined,
    SMTP_PORT: 587,
    SMTP_FROM: "app@example.test" as string | undefined,
    SMTP_USER: "sender" as string | undefined,
    SMTP_PASSWORD: "not-a-real-password",
  },
}));
vi.mock("../src/config.js", () => ({ config: mocks.config }));
vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.config, {
    SMTP_HOST: "smtp.example.test",
    SMTP_PORT: 587,
    SMTP_FROM: "app@example.test",
    SMTP_USER: "sender",
    SMTP_PASSWORD: "not-a-real-password",
  });
  mocks.sendMail.mockResolvedValue({ accepted: ["person@example.test"] });
  mocks.createTransport.mockReturnValue({
    sendMail: mocks.sendMail,
    close: mocks.close,
  });
});
afterEach(() => vi.restoreAllMocks());

function bodyRequest(body: unknown, multipart: boolean) {
  return {
    body,
    is: (type: string) => multipart && type === "multipart/form-data",
  } as unknown as Request;
}

describe("Shared request parsing preserves controller contracts", () => {
  it("retains ordinary request bodies without copying or coercion", () => {
    const body = { name: "Community" };
    expect(parseMultipartBody(bodyRequest(body, false), "unused")).toBe(body);
    expect(
      parseMultipartBody(bodyRequest(undefined, false), "unused"),
    ).toBeUndefined();
  });
  it.each(["null", "false", "0", '"text"', "[]", '{"name":"Community"}'])(
    "leaves JSON validation to the owning service: %s",
    (data) => {
      expect(parseMultipartBody(bodyRequest({ data }, true), "unused")).toEqual(
        JSON.parse(data),
      );
    },
  );
  it.each([undefined, {}, { data: "{" }])(
    "preserves the owning controller's malformed multipart error",
    (body) => {
      expect(() =>
        parseMultipartBody(bodyRequest(body, true), "Controller message"),
      ).toThrow(
        expect.objectContaining({
          status: 400,
          code: "REQUEST_ERROR",
          message: "Controller message",
        }),
      );
    },
  );
});

describe("SMTP consumers preserve their separate delivery policies", () => {
  const message = {
    to: "person@example.test",
    subject: "Decision",
    text: "Personal invitation in a fixture",
    messageId: "fixture-message",
  };
  it("keeps invitation defaults and the decision-only timeout settings", async () => {
    expect(
      await mailer.send(
        message.to,
        "Community",
        "https://example.test/invitation",
      ),
    ).toBe(true);
    expect(mocks.createTransport).toHaveBeenNthCalledWith(1, {
      host: "smtp.example.test",
      port: 587,
      secure: false,
      auth: { user: "sender", pass: "not-a-real-password" },
    });
    expect(mocks.close).not.toHaveBeenCalled();
    expect(await decisionEmailSender.send(message)).toBe("ENVIADA");
    expect(mocks.createTransport).toHaveBeenNthCalledWith(2, {
      host: "smtp.example.test",
      port: 587,
      secure: false,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      auth: { user: "sender", pass: "not-a-real-password" },
    });
    expect(mocks.sendMail).toHaveBeenLastCalledWith({
      from: "app@example.test",
      ...message,
    });
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("retains secure unauthenticated SMTP without inventing credentials", () => {
    mocks.config.SMTP_PORT = 465;
    mocks.config.SMTP_USER = undefined;
    createSmtpTransport();
    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: "smtp.example.test",
      port: 465,
      secure: true,
    });
  });
  it.each(["SMTP_HOST", "SMTP_FROM"] as const)(
    "keeps separate unavailable results without opening transport when %s is missing",
    async (key) => {
      mocks.config[key] = undefined;
      expect(await mailer.send(message.to, "Community", "fixture-link")).toBe(
        false,
      );
      expect(await decisionEmailSender.send(message)).toBe("SEM_CONFIGURACAO");
      expect(mocks.createTransport).not.toHaveBeenCalled();
    },
  );
  it("does not convert unaccepted delivery into a sent decision", async () => {
    mocks.sendMail.mockResolvedValue({ accepted: [] });
    expect(await decisionEmailSender.send(message)).toBe("FALHA");
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("preserves delivery errors and closes only the decision transport", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sendMail.mockRejectedValue(
      new Error("private credentials and recipient"),
    );
    expect(await mailer.send(message.to, "Community", "fixture-link")).toBe(
      false,
    );
    expect(await decisionEmailSender.send(message)).toBe("FALHA");
    expect(log.mock.calls).toEqual([
      [JSON.stringify({ level: "error", event: "invitation_email_failed" })],
      [JSON.stringify({ level: "error", event: "decision_email_failed" })],
    ]);
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});

describe("Structured operational failures retain HTTP and privacy boundaries", () => {
  it("does not serialize extra personal fields carried by an operational event", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const event = {
      level: "warn" as const,
      event: "organization_logo_cleanup_failed",
      email: "private@example.test",
      token: "private-token",
    };
    logOperationalEvent(event);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({ level: "warn", event: event.event }),
    );
  });
  it("preserves expected application-error status and envelope", async () => {
    const app = express();
    app.get("/failure", () => {
      throw new AppError(409, "Revision conflict", "REVISION_CONFLICT", {
        fieldErrors: { revision: ["Reload"] },
      });
    });
    app.use(errorHandler);
    const result = await request(app).get("/failure");
    expect(result.status).toBe(409);
    expect(result.body).toEqual({
      error: {
        code: "REVISION_CONFLICT",
        message: "Revision conflict",
        fields: { fieldErrors: { revision: ["Reload"] } },
      },
    });
  });
  it("keeps unexpected details out of logs and the public response", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = express();
    app.get("/failure", () => {
      throw new TypeError("private token and personal data");
    });
    app.use(errorHandler);
    const result = await request(app).get("/failure");
    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      error: {
        code: "INTERNAL",
        message: "Não foi possível concluir. Tente novamente.",
      },
    });
    expect(log).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        level: "error",
        event: "request_failed",
        type: "TypeError",
      }),
    );
  });
});
