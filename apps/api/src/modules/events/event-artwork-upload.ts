import multer from "multer";
import type { RequestHandler } from "express";
import { AppError } from "../../core/errors.js";
export function eventArtworkUpload(): RequestHandler {
  const fileUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 2,
      fields: 1,
      fieldSize: 150_000,
    },
  }).fields([
    { name: "artwork", maxCount: 1 },
    { name: "mobileArtwork", maxCount: 1 },
  ]);
  const upload: RequestHandler = (req, res, next) =>
    fileUpload(req, res, (error) => {
      if (error && error.code !== "LIMIT_FILE_SIZE")
        return next(
          new AppError(
            400,
            "Envie os dados do evento e somente um banner para cada tamanho de tela.",
          ),
        );
      next(error);
    });
  return upload;
}
