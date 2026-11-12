-- Execute completo. Campos próprios não alteram as respostas originais da ficha.
BEGIN;
ALTER TABLE eventos.eventos ADD COLUMN IF NOT EXISTS espiritualidade_em TIMESTAMP(3);
DO $$ DECLARE papel TEXT; BEGIN
IF to_regclass('inscricoes.inscricoes') IS NOT NULL THEN
ALTER TABLE inscricoes.inscricoes
  ADD COLUMN IF NOT EXISTS espiritualidade_participara BOOLEAN,
  ADD COLUMN IF NOT EXISTS espiritualidade_respondido_em TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS espiritualidade_em TIMESTAMP(3);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='inscricoes_espiritualidade_resposta_completa' AND conrelid='inscricoes.inscricoes'::regclass) THEN
    ALTER TABLE inscricoes.inscricoes ADD CONSTRAINT inscricoes_espiritualidade_resposta_completa CHECK (
      (espiritualidade_participara IS NULL AND espiritualidade_respondido_em IS NULL AND espiritualidade_em IS NULL)
      OR (espiritualidade_participara IS NOT NULL AND espiritualidade_respondido_em IS NOT NULL AND espiritualidade_em IS NOT NULL)
    );
  END IF;
CREATE TABLE IF NOT EXISTS inscricoes.respostas_espiritualidade_historico (
  resposta_id UUID PRIMARY KEY,
  inscricao_id UUID NOT NULL REFERENCES inscricoes.inscricoes(inscricao_id) ON DELETE RESTRICT,
  espiritualidade_em TIMESTAMP(3) NOT NULL,
  participara BOOLEAN NOT NULL,
  respondido_em TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS respostas_espiritualidade_inscricao_idx ON inscricoes.respostas_espiritualidade_historico (inscricao_id, respondido_em);
ALTER TABLE inscricoes.respostas_espiritualidade_historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE inscricoes.respostas_espiritualidade_historico FROM PUBLIC;
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=papel) THEN
      EXECUTE format('REVOKE ALL ON TABLE inscricoes.respostas_espiritualidade_historico FROM %I', papel);
    END IF;
  END LOOP;
END IF;
END $$;
-- 14h de Brasília = 17h UTC. Configuração exclusiva do evento solicitado.
UPDATE eventos.eventos SET espiritualidade_em = TIMESTAMP '2026-11-14 17:00:00'
WHERE evento_id = 'ab179ba5-9954-449f-90ae-c90982aa839d'::uuid
  AND espiritualidade_em IS NULL;
COMMIT;
