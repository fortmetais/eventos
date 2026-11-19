import type { Request } from "express";
import { AppError } from "./errors.js";

export function parseMultipartBody(
  request: Request,
  errorMessage: string,
): unknown {
  if (!request.is("multipart/form-data")) return request.body;
  try {
    return JSON.parse(request.body.data);
  } catch {
    throw new AppError(400, errorMessage);
  }
}
