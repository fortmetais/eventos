-- Personalização do aceite de servos por evento. Não envia mensagens nem altera inscrições.
BEGIN;
CREATE TABLE IF NOT EXISTS eventos.mensagens_aceite (
  evento_id uuid PRIMARY KEY REFERENCES eventos.eventos(evento_id),
  conteudo text CHECK (conteudo IS NULL OR char_length(conteudo) BETWEEN 20 AND 5000),
  revisao integer NOT NULL DEFAULT 0 CHECK (revisao >= 0),
  atualizado_por uuid NOT NULL REFERENCES acesso.contas(conta_id),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE eventos.mensagens_aceite ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON eventos.mensagens_aceite FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON eventos.mensagens_aceite FROM authenticated; END IF;
END $$;
COMMIT;
