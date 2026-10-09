import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";
import { z } from "zod";
import { assert } from "./errors.js";

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const id = z.string().uuid();
export const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export function draftToken(request: Request) {
  const token = request.header("X-Draft-Token");
  assert(
    token && /^[A-Za-z0-9_-]{43}$/.test(token),
    401,
    "Credencial da inscrição inválida.",
  );
  return token;
}
export function param(request: Request, name: string) {
  return id.parse(request.params[name]);
}
export function invitationToken(request: Request) {
  return z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .parse(request.params.token);
}
export const json = <T>(value: T) => JSON.parse(JSON.stringify(value));
