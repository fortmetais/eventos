import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  eventThumbnail,
  uploadImagePair,
} from "../../core/image-thumbnails.js";
import type { Prisma } from "@prisma/client";
import { AppError, assert } from "../../core/errors.js";
import type { ArtworkStorage } from "../../core/artwork-storage.js";
import type { EventSetupsRepository } from "./event-setups.repository.js";
import {
  eventDetailsSchema,
  eventSetupSchema,
} from "./event-setups.validation.js";
import { DepartmentsRepository } from "./departments.repository.js";

export class EventSetupsService {
  constructor(
    private repo: EventSetupsRepository,
    private storage: ArtworkStorage,
  ) {}
  async list(organizationId: string) {
    await this.repo.requireReady();
    return this.repo.list(organizationId);
  }
  async updateDetails(
    organizationId: string,
    actorId: string,
    eventId: string,
    input: unknown,
    file?: Express.Multer.File,
  ) {
    const { event: parsed } = eventDetailsSchema.parse(input);
    await this.repo.requireReady();
    const existing = await this.repo.db.event.findFirst({
      where: { id: eventId, organizationId },
    });
    assert(existing, 404, "Evento não encontrado.");
    const registrationsReady = await this.repo.registrationsReady();
    const uploaded = file
      ? await this.uploadArtwork(organizationId, eventId, file)
      : undefined;
    let previous:
      { bucket: string; key: string; thumbnailKey?: string | null } | undefined;
    let result;
    try {
      result = await this.repo.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT evento_id FROM eventos.eventos WHERE evento_id = ${eventId}::uuid
          AND organizacao_id = ${organizationId}::uuid FOR UPDATE`;
        const current = await tx.event.findFirst({
          where: { id: eventId, organizationId },
        });
        assert(current, 404, "Evento não encontrado.");
        await this.preserveDates(tx, current, parsed, registrationsReady);
        const { typeName, imageUrl: _, ...values } = parsed;
        const type = await tx.eventType.upsert({
          where: { organizationId_name: { organizationId, name: typeName } },
          create: { organizationId, name: typeName },
          update: {},
        });
        if (uploaded && current.imageBucket && current.imageKey)
          previous = {
            bucket: current.imageBucket,
            key: current.imageKey,
            thumbnailKey: current.imageThumbnailKey,
          };
        const event = await tx.event.update({
          where: { id: eventId },
          data: {
            ...values,
            startsAt: new Date(values.startsAt),
            endsAt: new Date(values.endsAt),
            typeId: type.id,
            ...(uploaded
              ? {
                  imageUrl: uploaded.url,
                  imageBucket: uploaded.bucket,
                  imageKey: uploaded.key,
                  imageThumbnailKey: uploaded.thumbnailKey,
                }
              : {}),
          },
          include: { type: true, campaigns: true },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            actorId,
            action: "EVENT_UPDATED",
            entityId: eventId,
          },
        });
        return event;
      });
    } catch (error) {
      if (uploaded)
        await this.cleanup(
          uploaded.bucket,
          uploaded.key,
          uploaded.thumbnailKey,
        );
      throw error;
    }
    if (previous)
      await this.cleanup(previous.bucket, previous.key, previous.thumbnailKey);
    return eventThumbnail(result);
  }
  async save(
    organizationId: string,
    actorId: string,
    input: unknown,
    file?: Express.Multer.File,
    editingId?: string,
  ) {
    const {
      event: parsed,
      campaigns,
      departments,
    } = eventSetupSchema.parse(input);
    await this.repo.requireReady();
    const departmentsRepo = new DepartmentsRepository(this.repo.db);
    const departmentsReady = await departmentsRepo.ready();
    if (departments) await departmentsRepo.requireReady();
    assert(
      !departmentsReady || departments,
      422,
      "Cadastre os departamentos e a quantidade de vagas de cada um.",
    );
    if (editingId) {
      const existing = await this.repo.db.event.findFirst({
        where: { id: editingId, organizationId },
      });
      assert(existing, 404, "Evento não encontrado.");
      assert(
        existing.status === "DRAFT",
        409,
        "Este formulário edita apenas eventos em preparação.",
      );
    }
    const eventId = editingId ?? randomUUID();
    const registrationsReady = editingId
      ? await this.repo.registrationsReady()
      : false;
    const uploaded = file
      ? await this.uploadArtwork(organizationId, eventId, file)
      : undefined;
    let previous:
      { bucket: string; key: string; thumbnailKey?: string | null } | undefined;
    let result;
    try {
      result = await this.repo.db.$transaction(async (tx) => {
        if (editingId) {
          await tx.$queryRaw`SELECT evento_id FROM eventos.eventos WHERE evento_id = ${eventId}::uuid
            AND organizacao_id = ${organizationId}::uuid FOR UPDATE`;
          const existing = await tx.event.findFirst({
            where: { id: eventId, organizationId },
          });
          assert(existing, 404, "Evento não encontrado.");
          assert(
            existing.status === "DRAFT",
            409,
            "Este formulário edita apenas eventos em preparação.",
          );
          await this.preserveDates(tx, existing, parsed, registrationsReady);
          if (uploaded && existing.imageBucket && existing.imageKey)
            previous = {
              bucket: existing.imageBucket,
              key: existing.imageKey,
              thumbnailKey: existing.imageThumbnailKey,
            };
        }
        const { typeName, imageUrl: _, ...values } = parsed;
        const type = await tx.eventType.upsert({
          where: { organizationId_name: { organizationId, name: typeName } },
          create: { organizationId, name: typeName },
          update: {},
        });
        const data = {
          ...values,
          startsAt: new Date(values.startsAt),
          endsAt: new Date(values.endsAt),
          typeId: type.id,
          ...(uploaded
            ? {
                imageUrl: uploaded.url,
                imageBucket: uploaded.bucket,
                imageKey: uploaded.key,
                imageThumbnailKey: uploaded.thumbnailKey,
              }
            : {}),
        };
        if (editingId) await tx.event.update({ where: { id: eventId }, data });
        else
          await tx.event.create({
            data: { ...data, id: eventId, organizationId },
          });
        for (const campaign of campaigns) {
          const values = {
            ...campaign,
            opensAt: new Date(campaign.opensAt),
            closesAt: new Date(campaign.closesAt),
          };
          await tx.campaign.upsert({
            where: { eventId_kind: { eventId, kind: campaign.kind } },
            create: { ...values, eventId },
            update: values,
          });
        }
        if (departments) {
          const existing = await tx.team.findMany({ where: { eventId } });
          for (const row of departments)
            assert(
              !row.id || existing.some((team) => team.id === row.id),
              422,
              "Departamento inválido para este evento.",
            );
          const published = await tx.formVersion.count({
            where: { campaign: { eventId }, publishedAt: { not: null } },
          });
          const retained = new Set(
            departments.flatMap((row) => (row.id ? [row.id] : [])),
          );
          for (const team of existing) {
            const row = departments.find((row) => row.id === team.id);
            assert(
              !published || (row && row.name === team.name),
              409,
              "Departamentos de fichas publicadas preservam seus nomes e cadastros.",
            );
          }
          for (const team of existing.filter(
            (team) => !retained.has(team.id),
          )) {
            assert(
              (await tx.registration.count({ where: { teamId: team.id } })) ===
                0,
              409,
              "Um departamento com inscrições não pode ser removido.",
            );
            await tx.team.delete({ where: { id: team.id } });
          }
          // Remove conflitos transitórios de nomes em trocas entre departamentos.
          for (const team of existing.filter((team) => retained.has(team.id)))
            await tx.team.update({
              where: { id: team.id },
              data: { name: `__editing_${team.id}` },
            });
          for (const { id, ...row } of departments) {
            if (id) {
              await departmentsRepo.requireSpaceForCapacity(
                tx,
                organizationId,
                eventId,
                id,
                row.capacity,
              );
              await tx.team.update({ where: { id }, data: row });
            } else await tx.team.create({ data: { ...row, eventId } });
          }
        }
        await tx.auditLog.create({
          data: {
            organizationId,
            actorId,
            action: editingId ? "EVENT_UPDATED" : "EVENT_CREATED",
            entityId: eventId,
          },
        });
        return tx.event.findUniqueOrThrow({
          where: { id: eventId },
          include: {
            type: true,
            campaigns: true,
            ...(departmentsReady ? { teams: true } : {}),
          },
        });
      });
    } catch (error) {
      if (uploaded)
        await this.cleanup(
          uploaded.bucket,
          uploaded.key,
          uploaded.thumbnailKey,
        );
      throw error;
    }
    if (previous)
      await this.cleanup(previous.bucket, previous.key, previous.thumbnailKey);
    return eventThumbnail(result);
  }
  private async preserveDates(
    tx: Prisma.TransactionClient,
    event: { id: string; startsAt: Date; endsAt: Date },
    dates: { startsAt: string; endsAt: string },
    registrationsReady: boolean,
  ) {
    if (!registrationsReady) return;
    // As inscrições bloqueiam a campanha antes de gravar. Compartilhar esse
    // bloqueio evita mudar datas enquanto a primeira inscrição é enviada.
    await tx.$queryRaw`SELECT campanha_id FROM eventos.campanhas
      WHERE evento_id = ${event.id}::uuid ORDER BY campanha_id FOR UPDATE`;
    const count = await tx.registration.count({
      where: { campaign: { eventId: event.id } },
    });
    assert(
      count === 0 ||
        (dates.startsAt === event.startsAt.toISOString().slice(0, 10) &&
          dates.endsAt === event.endsAt.toISOString().slice(0, 10)),
      409,
      "Eventos com inscrições preservam suas datas. Você pode alterar os demais dados e a arte.",
    );
  }
  private async uploadArtwork(
    organizationId: string,
    eventId: string,
    file: Express.Multer.File,
  ) {
    assert(
      file.size <= 10 * 1024 * 1024,
      413,
      "Escolha uma arte com até 10 MB.",
    );
    let buffer: Buffer;
    let thumbnail: Buffer;
    try {
      const image = sharp(file.buffer, {
        limitInputPixels: 40_000_000,
        animated: false,
      });
      const metadata = await image.metadata();
      assert(
        ["jpeg", "png", "webp"].includes(metadata.format ?? "") &&
          (metadata.pages ?? 1) === 1,
        422,
        "Escolha uma arte JPEG, PNG ou WebP, sem animação.",
      );
      // Preserve todo o cartaz, inclusive textos; não aplicar corte 9:16 automático.
      buffer = await image
        .clone()
        .rotate()
        .resize({
          width: 1080,
          height: 1920,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 88 })
        .toBuffer();
      thumbnail = await image
        .autoOrient()
        .resize(320, 570, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        422,
        "A imagem não pôde ser lida. Escolha outro arquivo JPEG, PNG ou WebP.",
      );
    }
    return uploadImagePair(
      this.storage,
      `${organizationId}/${eventId}/${randomUUID()}.webp`,
      buffer,
      thumbnail,
    );
  }
  private async cleanup(
    bucket: string,
    key: string,
    thumbnailKey?: string | null,
  ) {
    if (thumbnailKey) await this.cleanup(bucket, thumbnailKey);
    try {
      await this.storage.remove(bucket, key);
    } catch {
      console.warn(JSON.stringify({ event: "artwork_cleanup_pending" }));
    }
  }
}
