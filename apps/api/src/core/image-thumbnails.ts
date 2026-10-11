import type { ArtworkStorage } from "./artwork-storage.js";

export function thumbnailKey(key: string) {
  return key.replace(/\.webp$/, "-thumb.webp");
}

/** Both objects use new UUID keys; keep the previous image until the DB commits. */
export async function uploadImagePair(
  storage: ArtworkStorage,
  key: string,
  image: Buffer,
  thumbnail: Buffer,
) {
  const uploaded = await storage.upload(key, image);
  const thumbKey = thumbnailKey(key);
  try {
    await storage.upload(thumbKey, thumbnail);
    return { ...uploaded, thumbnailKey: thumbKey };
  } catch (error) {
    await Promise.allSettled([
      storage.remove(uploaded.bucket, uploaded.key),
      storage.remove(uploaded.bucket, thumbKey),
    ]);
    throw error;
  }
}

export function publicThumbnailUrl(
  url: string | null | undefined,
  key: string | null | undefined,
  thumbKey: string | null | undefined,
) {
  if (!url || !key || !thumbKey) return null;
  try {
    const parsed = new URL(url);
    const encoded = (value: string) =>
      value.split("/").map(encodeURIComponent).join("/");
    const suffix = `/${encoded(key)}`;
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      !parsed.pathname.endsWith(suffix)
    )
      return null;
    parsed.pathname =
      parsed.pathname.slice(0, -suffix.length) + `/${encoded(thumbKey)}`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function organizationThumbnail<
  T extends {
    logoUrl?: string | null;
    logoKey?: string | null;
    logoThumbnailKey?: string | null;
  },
>(organization: T) {
  return {
    ...organization,
    logoThumbnailUrl: publicThumbnailUrl(
      organization.logoUrl,
      organization.logoKey,
      organization.logoThumbnailKey,
    ),
  };
}

export function eventThumbnail<
  T extends {
    imageUrl?: string | null;
    imageKey?: string | null;
    imageThumbnailKey?: string | null;
  },
>(event: T) {
  return {
    ...event,
    imageThumbnailUrl: publicThumbnailUrl(
      event.imageUrl,
      event.imageKey,
      event.imageThumbnailKey,
    ),
  };
}
