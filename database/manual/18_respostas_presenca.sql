-- Migração aditiva para respostas de presença. Execute o arquivo completo.
BEGIN;
ALTER TABLE inscricoes.avisos_decisao ADD COLUMN IF NOT EXISTS presenca_recusada_em TIMESTAMP(3);
CREATE TABLE IF NOT EXISTS inscricoes.respostas_presenca_historico (
  resposta_id UUID PRIMARY KEY,
  aviso_id UUID NOT NULL REFERENCES inscricoes.avisos_decisao(aviso_id) ON DELETE RESTRICT,
  resposta TEXT NOT NULL CHECK (resposta IN ('VOU', 'NAO_IREI')),
  respondido_em TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS respostas_presenca_aviso_idx ON inscricoes.respostas_presenca_historico (aviso_id, respondido_em);
ALTER TABLE inscricoes.respostas_presenca_historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE inscricoes.respostas_presenca_historico FROM PUBLIC;
DO $$ DECLARE papel TEXT; BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON TABLE inscricoes.respostas_presenca_historico FROM %I', papel);
    END IF;
  END LOOP;
END $$;
ALTER TABLE inscricoes.avisos_decisao DROP CONSTRAINT IF EXISTS avisos_decisao_respostas_exclusivas;
ALTER TABLE inscricoes.avisos_decisao ADD CONSTRAINT avisos_decisao_respostas_exclusivas CHECK (presenca_recusada_em IS NULL OR (tipo = 'ACEITE' AND presenca_confirmada_em IS NULL));
COMMIT;
