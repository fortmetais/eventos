import type { PrismaClient } from "@prisma/client";
export class MediaRepository {
  constructor(public db: PrismaClient) {}
  asset(id: string) {
    return this.db.mediaAsset.findUnique({ where: { id } });
  }
}
