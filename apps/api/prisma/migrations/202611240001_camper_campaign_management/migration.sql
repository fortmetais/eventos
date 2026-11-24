-- Execute antes da nova API. Somente estrutura aditiva; não altera inscrições,
-- departamentos de servos, mensagens existentes ou a abertura das campanhas.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS eventos.equipes_campistas (
  equipe_campista_id UUID NOT NULL,
  campanha_id UUID NOT NULL,
  nome TEXT NOT NULL,
  vagas INTEGER NOT NULL,
  CONSTRAINT equipes_campistas_pk PRIMARY KEY (equipe_campista_id),
  CONSTRAINT equipes_campistas_campanha_fk FOREIGN KEY (campanha_id)
    REFERENCES eventos.campanhas(campanha_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT equipes_campistas_campanha_nome_uk UNIQUE (campanha_id, nome),
  CONSTRAINT equipes_campistas_id_campanha_uk UNIQUE (equipe_campista_id, campanha_id),
  CONSTRAINT equipes_campistas_nome_valido CHECK (length(btrim(nome)) BETWEEN 2 AND 100),
  CONSTRAINT equipes_campistas_vagas_validas CHECK (vagas BETWEEN 0 AND 100000)
);

CREATE TABLE IF NOT EXISTS eventos.mensagens_aceite_campistas (
  campanha_id UUID NOT NULL,
  conteudo TEXT,
  revisao INTEGER NOT NULL DEFAULT 0,
  atualizado_por UUID NOT NULL,
  atualizado_em TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT mensagens_aceite_campistas_pk PRIMARY KEY (campanha_id),
  CONSTRAINT mensagens_aceite_campistas_campanha_fk FOREIGN KEY (campanha_id)
    REFERENCES eventos.campanhas(campanha_id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT mensagens_aceite_campistas_autor_fk FOREIGN KEY (atualizado_por)
    REFERENCES acesso.contas(conta_id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT mensagens_aceite_campistas_revisao_valida CHECK (revisao >= 0),
  CONSTRAINT mensagens_aceite_campistas_conteudo_valido CHECK (conteudo IS NULL OR length(conteudo) <= 5000)
);
CREATE INDEX IF NOT EXISTS mensagens_aceite_campistas_autor_idx
  ON eventos.mensagens_aceite_campistas(atualizado_por);

ALTER TABLE inscricoes.inscricoes ADD COLUMN IF NOT EXISTS equipe_campista_id UUID;
CREATE INDEX IF NOT EXISTS inscricoes_equipe_campista_idx
  ON inscricoes.inscricoes(equipe_campista_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='inscricoes.inscricoes'::regclass AND conname='inscricoes_equipe_campista_campanha_fk') THEN
    ALTER TABLE inscricoes.inscricoes ADD CONSTRAINT inscricoes_equipe_campista_campanha_fk
      FOREIGN KEY (equipe_campista_id, campanha_id)
      REFERENCES eventos.equipes_campistas(equipe_campista_id, campanha_id)
      ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='inscricoes.inscricoes'::regclass AND conname='inscricoes_equipe_unico_publico') THEN
    ALTER TABLE inscricoes.inscricoes ADD CONSTRAINT inscricoes_equipe_unico_publico
      CHECK (equipe_id IS NULL OR equipe_campista_id IS NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM inscricoes.inscricoes r JOIN eventos.campanhas c USING (campanha_id)
    WHERE r.equipe_id IS NOT NULL AND c.publico::text <> 'SERVO') THEN
    RAISE EXCEPTION 'Existem campistas vinculados a departamentos antigos. Confira os vínculos antes de executar a etapa 22.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION eventos.validar_publico_campista()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM eventos.campanhas c WHERE c.campanha_id=NEW.campanha_id AND c.publico::text='CAMPISTA') THEN
    RAISE EXCEPTION 'A equipe ou mensagem deve pertencer a uma campanha de campistas.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS equipes_campistas_publico ON eventos.equipes_campistas;
CREATE TRIGGER equipes_campistas_publico BEFORE INSERT OR UPDATE OF campanha_id
  ON eventos.equipes_campistas FOR EACH ROW EXECUTE FUNCTION eventos.validar_publico_campista();
DROP TRIGGER IF EXISTS mensagens_aceite_campistas_publico ON eventos.mensagens_aceite_campistas;
CREATE TRIGGER mensagens_aceite_campistas_publico BEFORE INSERT OR UPDATE OF campanha_id
  ON eventos.mensagens_aceite_campistas FOR EACH ROW EXECUTE FUNCTION eventos.validar_publico_campista();

CREATE OR REPLACE FUNCTION inscricoes.validar_publico_equipe()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE publico TEXT;
BEGIN
  IF NEW.equipe_id IS NULL AND NEW.equipe_campista_id IS NULL THEN RETURN NEW; END IF;
  SELECT c.publico::text INTO publico FROM eventos.campanhas c WHERE c.campanha_id=NEW.campanha_id;
  IF (NEW.equipe_id IS NOT NULL AND publico <> 'SERVO') OR
     (NEW.equipe_campista_id IS NOT NULL AND publico <> 'CAMPISTA') THEN
    RAISE EXCEPTION 'A equipe não corresponde ao público da inscrição.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS inscricoes_equipe_publico ON inscricoes.inscricoes;
CREATE TRIGGER inscricoes_equipe_publico BEFORE INSERT OR UPDATE OF campanha_id,equipe_id,equipe_campista_id
  ON inscricoes.inscricoes FOR EACH ROW EXECUTE FUNCTION inscricoes.validar_publico_equipe();

CREATE OR REPLACE FUNCTION eventos.preservar_publico_campanha_campista()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.publico::text <> 'CAMPISTA' AND (
    EXISTS (SELECT 1 FROM eventos.equipes_campistas t WHERE t.campanha_id=NEW.campanha_id) OR
    EXISTS (SELECT 1 FROM eventos.mensagens_aceite_campistas m WHERE m.campanha_id=NEW.campanha_id)
  ) THEN
    RAISE EXCEPTION 'A campanha possui equipes ou mensagem de campistas e não pode mudar de público.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS campanhas_preservar_publico_campista ON eventos.campanhas;
CREATE TRIGGER campanhas_preservar_publico_campista BEFORE UPDATE OF publico
  ON eventos.campanhas FOR EACH ROW EXECUTE FUNCTION eventos.preservar_publico_campanha_campista();

ALTER TABLE eventos.equipes_campistas ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos.mensagens_aceite_campistas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON eventos.equipes_campistas,eventos.mensagens_aceite_campistas FROM PUBLIC;
DO $$ DECLARE papel TEXT; BEGIN
  FOREACH papel IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=papel) THEN
      EXECUTE format('REVOKE ALL ON eventos.equipes_campistas,eventos.mensagens_aceite_campistas FROM %I',papel);
    END IF;
  END LOOP;
END $$;
COMMENT ON TABLE eventos.equipes_campistas IS 'Equipes privadas da campanha de campistas; não compartilham capacidade com departamentos de servos.';
COMMENT ON COLUMN inscricoes.inscricoes.equipe_campista_id IS 'Alocação administrativa de campistas; nullable e independente de equipe_id dos servos.';
COMMIT;
