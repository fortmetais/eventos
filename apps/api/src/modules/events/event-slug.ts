import { z } from "zod";
import { id } from "../../core/security.js";
import { assert } from "../../core/errors.js";
import type { Prisma } from "@prisma/client";

export const eventSlug = z
  .string()
  .trim()
  .max(80)
  .transform((value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "-"),
  )
  .pipe(
    z
      .string()
      .min(3)
      .max(80)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Use letras, números e hífens, sem barras ou outros símbolos.",
      )
      .refine(
        (value) => !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value),
        "Escolha um endereço diferente do identificador original do evento.",
      ),
  );

export const optionalEventSlug = z
  .union([z.literal(""), eventSlug, z.null()])
  .transform((value) => value || null)
  .optional();

export const eventReference = z.union([id, eventSlug]);

export async function requireAvailableEventSlug(
  tx: Prisma.TransactionClient,
  slug: string | null | undefined,
  eventId?: string,
) {
  if (!slug) return;
  const existing = await tx.event.findFirst({
    where: { slug, ...(eventId ? { id: { not: eventId } } : {}) },
    select: { id: true },
  });
  assert(
    !existing,
    409,
    "Este endereço já está em uso. Escolha outro para o evento.",
    "EVENT_SLUG_CONFLICT",
  );
}
