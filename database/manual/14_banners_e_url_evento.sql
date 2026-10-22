-- Atualização aditiva: executar depois do SQL 05, antes de publicar esta versão.
-- Mantém artes existentes e os links originais por UUID. Pode ser repetido.
BEGIN;
ALTER TABLE eventos.eventos
  ADD COLUMN IF NOT EXISTS url_personalizada TEXT,
  ADD COLUMN IF NOT EXISTS url_arte_celular TEXT,
  ADD COLUMN IF NOT EXISTS bucket_arte_celular TEXT,
  ADD COLUMN IF NOT EXISTS chave_arte_celular TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS eventos_url_personalizada_key
  ON eventos.eventos(url_personalizada);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eventos_url_personalizada_formato' AND conrelid = 'eventos.eventos'::regclass) THEN
    ALTER TABLE eventos.eventos ADD CONSTRAINT eventos_url_personalizada_formato CHECK (
      url_personalizada IS NULL OR (
        length(url_personalizada) BETWEEN 3 AND 80
        AND url_personalizada ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        AND url_personalizada !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eventos_arte_celular_completa' AND conrelid = 'eventos.eventos'::regclass) THEN
    ALTER TABLE eventos.eventos ADD CONSTRAINT eventos_arte_celular_completa CHECK (
      (url_arte_celular IS NULL AND bucket_arte_celular IS NULL AND chave_arte_celular IS NULL)
      OR (url_arte_celular IS NOT NULL AND bucket_arte_celular IS NOT NULL AND chave_arte_celular IS NOT NULL)
    );
  END IF;
END $$;
COMMENT ON COLUMN eventos.eventos.url_personalizada IS 'Endereço público exclusivo do evento; links com evento_id continuam funcionando.';
COMMENT ON COLUMN eventos.eventos.url_arte_celular IS 'Banner alternativo para celular no bucket público de artes.';
COMMIT;
