export interface PhotoCrop {
  left: number;
  top: number;
  size: number;
}

/** Canvas applies the browser's EXIF orientation, matching the displayed preview. */
export async function preparePhotoUpload(
  file: File,
  source: HTMLImageElement | null,
  crop: PhotoCrop,
) {
  const original = { file, crop };
  if (!source || Math.max(source.naturalWidth, source.naturalHeight) <= 1000)
    return original;
  const width = source.naturalWidth,
    height = source.naturalHeight;
  if (width * height > 40_000_000)
    throw new Error("Escolha uma foto com até 40 megapixels.");
  const side = Math.max(1, Math.floor(crop.size * Math.min(width, height)));
  const left = Math.round(crop.left * width),
    top = Math.round(crop.top * height);
  if (left + side > width || top + side > height) return original;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(1000, side);
    const context = canvas.getContext("2d");
    if (!context) return original;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      source,
      left,
      top,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob || blob.type !== "image/png" || blob.size >= file.size)
      return original;
    return {
      file: new File([blob], "foto-identificacao.png", { type: "image/png" }),
      crop: { left: 0, top: 0, size: 1 },
    };
  } catch {
    return original;
  }
}
