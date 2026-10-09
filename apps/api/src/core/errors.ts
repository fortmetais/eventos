import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_ERROR",
    public details?: unknown,
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  status: number,
  message: string,
  code?: string,
): asserts condition {
  if (!condition) throw new AppError(status, message, code);
}
export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  if (error instanceof ZodError) {
    response.status(422).json({
      error: {
        code: "VALIDATION",
        message: "Confira os campos informados.",
        fields: error.flatten(),
      },
    });
    return;
  }
  if (error instanceof AppError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { fields: error.details } : {}),
      },
    });
    return;
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    response.status(409).json({
      error: {
        code: "CONFLICT",
        message: "Já existe um registro com essas informações.",
      },
    });
    return;
  }
  if (error?.code === "LIMIT_FILE_SIZE") {
    response.status(413).json({
      error: {
        code: "FILE_TOO_LARGE",
        message: "Escolha uma imagem com até 10 MB.",
      },
    });
    return;
  }
  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({
      error: { code: "INVALID_JSON", message: "Requisição inválida." },
    });
    return;
  }
  // Não registrar mensagens de consultas, corpos, tokens, arquivos ou dados pessoais.
  console.error(
    JSON.stringify({
      level: "error",
      event: "request_failed",
      type: error?.constructor?.name ?? "Unknown",
    }),
  );
  response.status(500).json({
    error: {
      code: "INTERNAL",
      message: "Não foi possível concluir. Tente novamente.",
    },
  });
};
