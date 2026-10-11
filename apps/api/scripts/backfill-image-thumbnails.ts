import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { config } from "../src/config.js";
import { artworkStorage } from "../src/core/artwork-storage.js";
import { supabaseAdmin } from "../src/core/supabase.js";

const apply = process.argv.includes("--apply");
const db = new PrismaClient();
let generated = 0,
  failures = 0;
try {
  const organizations = await db.organization.findMany({
    where: {
      logoThumbnailKey: null,
      logoBucket: config.SUPABASE_ARTWORK_BUCKET,
      logoKey: { not: null },
    },
    select: { id: true, logoKey: true },
    take: 100,
    orderBy: { id: "asc" },
  });
  const events = await db.event.findMany({
    where: {
      imageThumbnailKey: null,
      imageBucket: config.SUPABASE_ARTWORK_BUCKET,
      imageKey: { not: null },
    },
    select: { id: true, imageKey: true },
    take: 100,
    orderBy: { id: "asc" },
  });
  if (apply) {
    for (const row of [
      ...organizations.map((o) => ({
        id: o.id,
        key: o.logoKey!,
        kind: "logo" as const,
      })),
      ...events.map((e) => ({
        id: e.id,
        key: e.imageKey!,
        kind: "event" as const,
      })),
    ]) {
      let uploaded:
        Awaited<ReturnType<typeof artworkStorage.upload>> | undefined;
      try {
        const { data, error } = await supabaseAdmin()
          .storage.from(config.SUPABASE_ARTWORK_BUCKET)
          .download(row.key);
        if (error || !data || data.size > 10 * 1024 * 1024)
          throw new Error("Imagem indisponível");
        const image = sharp(Buffer.from(await data.arrayBuffer()), {
          limitInputPixels: 40_000_000,
          animated: true,
        });
        const metadata = await image.metadata();
        if (
          (metadata.pages ?? 1) !== 1 ||
          !["jpeg", "png", "webp"].includes(metadata.format ?? "")
        )
          throw new Error("Imagem inválida");
        const buffer = await image
          .autoOrient()
          .resize(
            row.kind === "logo" ? 160 : 320,
            row.kind === "logo" ? 160 : 570,
            { fit: "inside", withoutEnlargement: true },
          )
          .webp({ quality: row.kind === "logo" ? 88 : 82 })
          .toBuffer();
        uploaded = await artworkStorage.upload(
          row.key.replace(/\.webp$/, `-thumb-${randomUUID()}.webp`),
          buffer,
        );
        const updated =
          row.kind === "logo"
            ? await db.organization.updateMany({
                where: {
                  id: row.id,
                  logoBucket: uploaded.bucket,
                  logoKey: row.key,
                  logoThumbnailKey: null,
                },
                data: { logoThumbnailKey: uploaded.key },
              })
            : await db.event.updateMany({
                where: {
                  id: row.id,
                  imageBucket: uploaded.bucket,
                  imageKey: row.key,
                  imageThumbnailKey: null,
                },
                data: { imageThumbnailKey: uploaded.key },
              });
        if (!updated.count)
          await artworkStorage.remove(uploaded.bucket, uploaded.key);
        else generated++;
      } catch {
        failures++;
        if (uploaded)
          await artworkStorage
            .remove(uploaded.bucket, uploaded.key)
            .catch(() => {});
      }
    }
  }
  console.info(
    JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      organizations: organizations.length,
      events: events.length,
      generated,
      failures,
    }),
  );
  if (failures) process.exitCode = 1;
} finally {
  await db.$disconnect();
}
