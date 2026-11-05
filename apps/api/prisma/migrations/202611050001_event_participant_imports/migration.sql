-- Etapa aditiva: assistente de candidaturas importadas. Não incorpora arquivos.
BEGIN;
ALTER TABLE pessoas.lotes_importacao
  ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'HISTORY',
  ADD COLUMN IF NOT EXISTS destino text NOT NULL DEFAULT 'HISTORY',
  ADD COLUMN IF NOT EXISTS campanha_id uuid REFERENCES eventos.campanhas(campanha_id),
  ADD COLUMN IF NOT EXISTS versao_ficha_id uuid REFERENCES inscricoes.versoes_ficha(versao_ficha_id),
  ADD COLUMN IF NOT EXISTS equivalencias jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS revisao integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS etapa integer NOT NULL DEFAULT 1;
DO $$ DECLARE constraint_name text; BEGIN
  FOR constraint_name IN SELECT conname FROM pg_constraint
    WHERE conrelid='pessoas.lotes_importacao'::regclass AND contype='u'
      AND pg_get_constraintdef(oid)='UNIQUE (organizacao_id, hash_arquivo, aba)'
  LOOP EXECUTE format('ALTER TABLE pessoas.lotes_importacao DROP CONSTRAINT %I', constraint_name); END LOOP;
END $$;
ALTER TABLE pessoas.lotes_importacao DROP CONSTRAINT IF EXISTS lotes_importacao_situacao_check;
ALTER TABLE pessoas.lotes_importacao ADD CONSTRAINT lotes_importacao_situacao_check
  CHECK (situacao IN ('PREVIEW','MAPPING','REVIEW','PARTIALLY_CONFIRMED','CONFIRMED','CANCELLED'));
CREATE UNIQUE INDEX IF NOT EXISTS lotes_importacao_arquivo_destino_uk
  ON pessoas.lotes_importacao(organizacao_id, hash_arquivo, aba, destino);
ALTER TABLE inscricoes.inscricoes
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'PUBLIC_FORM',
  ADD COLUMN IF NOT EXISTS dados_importacao jsonb;
ALTER TABLE inscricoes.inscricoes ALTER COLUMN rascunho_id DROP NOT NULL;
ALTER TABLE pessoas.linhas_importacao
  ADD COLUMN IF NOT EXISTS execucao text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS revisao integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correcoes jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS motivo_distinto text,
  ADD COLUMN IF NOT EXISTS inscricao_id uuid REFERENCES inscricoes.inscricoes(inscricao_id),
  ADD COLUMN IF NOT EXISTS substituir_inscricao_id uuid REFERENCES inscricoes.inscricoes(inscricao_id);
CREATE INDEX IF NOT EXISTS linhas_importacao_inscricao_idx ON pessoas.linhas_importacao(inscricao_id);
CREATE INDEX IF NOT EXISTS inscricoes_campanha_origem_idx ON inscricoes.inscricoes(campanha_id, origem);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lotes_importacao_destino_check' AND conrelid='pessoas.lotes_importacao'::regclass) THEN
    ALTER TABLE pessoas.lotes_importacao ADD CONSTRAINT lotes_importacao_destino_check CHECK (
      (modo='HISTORY' AND destino='HISTORY' AND campanha_id IS NULL AND versao_ficha_id IS NULL)
      OR (modo='EVENT' AND campanha_id IS NOT NULL AND versao_ficha_id IS NOT NULL AND destino=campanha_id::text));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='inscricoes_origem_rascunho_check' AND conrelid='inscricoes.inscricoes'::regclass) THEN
    ALTER TABLE inscricoes.inscricoes ADD CONSTRAINT inscricoes_origem_rascunho_check CHECK (
      (origem='PUBLIC_FORM' AND rascunho_id IS NOT NULL)
      OR (origem='IMPORT' AND rascunho_id IS NULL AND dados_importacao IS NOT NULL));
  END IF;
END $$;
-- Respostas nativas permanecem imutáveis. Correções de importadas exigem
-- transação administrativa explícita, preservando a primeira evidência da origem.
CREATE OR REPLACE FUNCTION inscricoes.proteger_respostas_inscricao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.versao_ficha_id IS DISTINCT FROM OLD.versao_ficha_id OR
     NEW.campanha_id IS DISTINCT FROM OLD.campanha_id OR
     NEW.pessoa_id IS DISTINCT FROM OLD.pessoa_id OR
     NEW.rascunho_id IS DISTINCT FROM OLD.rascunho_id OR
     NEW.origem IS DISTINCT FROM OLD.origem THEN
    RAISE EXCEPTION 'A identidade e a origem da inscrição são imutáveis.';
  END IF;
  IF NEW.respostas IS DISTINCT FROM OLD.respostas OR NEW.dados_importacao IS DISTINCT FROM OLD.dados_importacao THEN
    IF OLD.origem <> 'IMPORT' OR current_setting('fac.import_correction', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'As respostas enviadas e sua origem são imutáveis.';
    END IF;
    IF NEW.dados_importacao->'source' IS DISTINCT FROM OLD.dados_importacao->'source' OR
       NEW.dados_importacao->'original' IS DISTINCT FROM OLD.dados_importacao->'original' THEN
      RAISE EXCEPTION 'A evidência original da importação é imutável.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
COMMIT;
