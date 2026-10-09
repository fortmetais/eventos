import { z } from "zod";
import type { Account } from "@prisma/client";
import { assert } from "../../core/errors.js";
import { hashToken, id, json } from "../../core/security.js";
import { dateOnly } from "../events/events.validation.js";
import { ProfilesRepository } from "./profiles.repository.js";
export const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    phone: z.string().max(30).optional(),
    birthDate: z.union([dateOnly, z.literal("")]).optional(),
    city: z.string().max(100).optional(),
    photoAssetId: id.optional(),
  })
  .strict();
export class ProfilesService {
  constructor(
    private repo: ProfilesRepository,
    private eventsEnabled: boolean | (() => Promise<boolean>) = true,
  ) {}
  get(accountId: string) {
    return this.repo.get(accountId);
  }
  private async enabled() {
    return typeof this.eventsEnabled === "function"
      ? this.eventsEnabled()
      : this.eventsEnabled;
  }
  async registrations(accountId: string) {
    return (await this.enabled())
      ? this.repo.registrations(accountId)
      : Promise.resolve([]);
  }
  async update(accountId: string, input: unknown) {
    const data = profileSchema.parse(input);
    assert(
      (await this.enabled()) || !data.photoAssetId,
      503,
      "As fotos serão disponibilizadas na próxima etapa.",
    );
    if (data.photoAssetId)
      assert(
        await this.repo.db.mediaAsset.findFirst({
          where: { id: data.photoAssetId, accountId, purpose: "PROFILE" },
        }),
        422,
        "Foto inválida para este perfil.",
      );
    return this.repo.update(accountId, json(data));
  }
  async claim(draftId: string, token: string, user: Account) {
    assert(
      await this.enabled(),
      503,
      "As inscrições serão disponibilizadas na próxima etapa.",
    );
    return this.repo.db.$transaction(async (tx) => {
      const draft = await tx.draft.findFirst({
        where: {
          id: draftId,
          tokenHash: hashToken(token),
          expiresAt: { gt: new Date() },
        },
        include: { registration: true },
      });
      assert(
        draft?.registration,
        404,
        "Inscrição não encontrada ou credencial expirada.",
      );
      const email = (draft.registration.snapshot as Record<string, unknown>)
        .email;
      assert(
        typeof email === "string" && email.toLowerCase() === user.email,
        403,
        "Valide o e-mail informado nesta inscrição para vinculá-la.",
      );
      assert(
        !draft.registration.accountId ||
          draft.registration.accountId === user.id,
        409,
        "Esta inscrição já foi vinculada a uma conta.",
      );
      const result = await tx.registration.updateMany({
        where: {
          id: draft.registration.id,
          OR: [{ accountId: null }, { accountId: user.id }],
        },
        data: { accountId: user.id },
      });
      assert(result.count === 1, 409, "Inscrição já vinculada.");
      return { linked: true, registrationId: draft.registration.id };
    });
  }
}
