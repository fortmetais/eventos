import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

const entry = z
  .object({
    event: z.enum(["view", "registration_click"]),
    screen: z.enum(["SMALL", "MEDIUM", "LARGE"]),
  })
  .strict();
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function siteVisitsRoutes(
  db: PrismaClient,
  options: { origin: string; rateLimits?: boolean; now?: () => Date },
) {
  const router = Router();
  const origin = new URL(options.origin).origin;
  const limit = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  let warned = false;
  router.post(
    "/public/site-visits",
    ...(options.rateLimits === false ? [] : [limit]),
    async (req, res) => {
      // No cross-site ingestion or arbitrary URLs/metadata supplied by visitors.
      if (
        req.header("Origin") !== origin ||
        (req.header("Sec-Fetch-Site") &&
          req.header("Sec-Fetch-Site") !== "same-origin")
      ) {
        res.sendStatus(403);
        return;
      }
      const result = entry.safeParse(req.body);
      if (!result.success) {
        res.sendStatus(422);
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      if (
        /prefetch|prerender/i.test(
          `${req.header("Purpose") ?? ""} ${req.header("Sec-Purpose") ?? ""}`,
        ) ||
        /bot\b|crawler|spider|facebookexternalhit|whatsapp|preview/i.test(
          req.header("User-Agent") ?? "",
        )
      ) {
        res.sendStatus(204);
        return;
      }
      const { event, screen } = result.data;
      const parts = Object.fromEntries(
        dayFormat
          .formatToParts(options.now?.() ?? new Date())
          .map((p) => [p.type, p.value]),
      );
      const day = new Date(
        `${parts.year}-${parts.month}-${parts.day}T00:00:00Z`,
      );
      try {
        await db.siteVisitDaily.upsert({
          where: { day_screen: { day, screen } },
          create: {
            day,
            screen,
            pageViews: event === "view" ? 1 : 0,
            registrationClicks: event === "registration_click" ? 1 : 0,
          },
          update:
            event === "view"
              ? { pageViews: { increment: 1 } }
              : { registrationClicks: { increment: 1 } },
          select: { day: true },
        });
        warned = false;
      } catch {
        // Analytics must never prevent opening the poster or the external form.
        if (!warned)
          console.warn(
            JSON.stringify({ event: "site_visits_storage_unavailable" }),
          );
        warned = true;
      }
      res.sendStatus(204);
    },
  );
  return router;
}
