-- ETAPA 5: fichas de intenção para servos e avaliação dos organizadores.
-- Execute inteiro UMA VEZ no eventos_beta após o arquivo 05_eventos_e_periodos.sql.
-- Não altera as tabelas ou os dados das etapas anteriores. Não publica eventos.
BEGIN;
DO $$ BEGIN
  IF to_regclass('eventos.campanhas') IS NULL OR to_regclass('pessoas.pessoas') IS NULL THEN
    RAISE EXCEPTION 'Conclua primeiro as etapas de pessoas e eventos.';
  END IF;
END $$;
CREATE SCHEMA inscricoes;
CREATE SCHEMA saude;
CREATE SCHEMA arquivos;
COMMENT ON SCHEMA inscricoes IS 'Versões de fichas, rascunhos, inscrições, aceites e histórico de análise.';
COMMENT ON SCHEMA saude IS 'Respostas de saúde, separadas das consultas administrativas comuns.';
COMMENT ON SCHEMA arquivos IS 'Metadados de imagens privadas; os arquivos ficam no Supabase Storage.';
CREATE TYPE "inscricoes"."situacao_inscricao" AS ENUM ('RECEBIDA', 'EM_ANALISE', 'APROVADA', 'CONFIRMADA', 'LISTA_ESPERA', 'RECUSADA', 'CANCELADA');
CREATE TABLE "inscricoes"."versoes_ficha" (
    "versao_ficha_id" UUID NOT NULL,
    "campanha_id" UUID NOT NULL,
    "numero_versao" INTEGER NOT NULL,
    "configuracao" JSONB NOT NULL,
    "publicada_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),

    CONSTRAINT "versoes_ficha_pkey" PRIMARY KEY ("versao_ficha_id")
);

CREATE TABLE "inscricoes"."rascunhos" (
    "rascunho_id" UUID NOT NULL,
    "campanha_id" UUID NOT NULL,
    "versao_ficha_id" UUID NOT NULL,
    "hash_token" TEXT NOT NULL,
    "respostas" JSONB NOT NULL DEFAULT '{}',
    "expira_em" TIMESTAMP(3) NOT NULL,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),

    CONSTRAINT "rascunhos_pkey" PRIMARY KEY ("rascunho_id")
);

CREATE TABLE "saude"."rascunhos_saude" (
    "rascunho_id" UUID NOT NULL,
    "respostas" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "rascunhos_saude_pkey" PRIMARY KEY ("rascunho_id")
);

CREATE TABLE "inscricoes"."inscricoes" (
    "inscricao_id" UUID NOT NULL,
    "protocolo" TEXT NOT NULL,
    "rascunho_id" UUID NOT NULL,
    "pessoa_id" UUID NOT NULL,
    "campanha_id" UUID NOT NULL,
    "versao_ficha_id" UUID NOT NULL,
    "conta_id" UUID,
    "equipe_id" UUID,
    "respostas" JSONB NOT NULL,
    "situacao" "inscricoes"."situacao_inscricao" NOT NULL DEFAULT 'RECEBIDA',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inscricoes_pkey" PRIMARY KEY ("inscricao_id")
);

CREATE TABLE "saude"."fichas_saude" (
    "inscricao_id" UUID NOT NULL,
    "respostas" JSONB NOT NULL,

    CONSTRAINT "fichas_saude_pkey" PRIMARY KEY ("inscricao_id")
);

CREATE TABLE "inscricoes"."aceites" (
    "inscricao_id" UUID NOT NULL,
    "versao" TEXT NOT NULL,
    "texto_termos" TEXT NOT NULL,
    "aceito" BOOLEAN NOT NULL,
    "imagem_autorizada" BOOLEAN NOT NULL,
    "responsavel_autorizou" BOOLEAN NOT NULL,
    "aceito_em" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),

    CONSTRAINT "aceites_pkey" PRIMARY KEY ("inscricao_id")
);

CREATE TABLE "inscricoes"."historico" (
    "historico_id" UUID NOT NULL,
    "inscricao_id" UUID NOT NULL,
    "autor_id" UUID NOT NULL,
    "situacao_anterior" "inscricoes"."situacao_inscricao" NOT NULL,
    "situacao_nova" "inscricoes"."situacao_inscricao" NOT NULL,
    "motivo" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),

    CONSTRAINT "historico_pkey" PRIMARY KEY ("historico_id")
);

CREATE TABLE "eventos"."equipes" (
    "equipe_id" UUID NOT NULL,
    "evento_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "equipes_pkey" PRIMARY KEY ("equipe_id")
);

CREATE TABLE "arquivos"."arquivos" (
    "arquivo_id" UUID NOT NULL,
    "organizacao_id" UUID,
    "rascunho_id" UUID,
    "conta_id" UUID,
    "provedor" TEXT NOT NULL DEFAULT 'supabase',
    "bucket" TEXT NOT NULL,
    "chave_objeto" TEXT NOT NULL,
    "finalidade" TEXT NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "tamanho_bytes" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),

    CONSTRAINT "arquivos_pkey" PRIMARY KEY ("arquivo_id")
);
CREATE UNIQUE INDEX "versoes_ficha_campanha_id_numero_versao_key" ON "inscricoes"."versoes_ficha"("campanha_id", "numero_versao");
CREATE UNIQUE INDEX "rascunhos_hash_token_key" ON "inscricoes"."rascunhos"("hash_token");
CREATE UNIQUE INDEX "inscricoes_protocolo_key" ON "inscricoes"."inscricoes"("protocolo");
CREATE UNIQUE INDEX "inscricoes_rascunho_id_key" ON "inscricoes"."inscricoes"("rascunho_id");
CREATE INDEX "inscricoes_campanha_id_situacao_idx" ON "inscricoes"."inscricoes"("campanha_id", "situacao");
CREATE INDEX "inscricoes_conta_id_idx" ON "inscricoes"."inscricoes"("conta_id");
CREATE UNIQUE INDEX "equipes_evento_id_nome_key" ON "eventos"."equipes"("evento_id", "nome");
CREATE UNIQUE INDEX "arquivos_chave_objeto_key" ON "arquivos"."arquivos"("chave_objeto");
ALTER TABLE "inscricoes"."versoes_ficha" ADD CONSTRAINT "versoes_ficha_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "eventos"."campanhas"("campanha_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inscricoes"."rascunhos" ADD CONSTRAINT "rascunhos_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "eventos"."campanhas"("campanha_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inscricoes"."rascunhos" ADD CONSTRAINT "rascunhos_versao_ficha_id_fkey" FOREIGN KEY ("versao_ficha_id") REFERENCES "inscricoes"."versoes_ficha"("versao_ficha_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "saude"."rascunhos_saude" ADD CONSTRAINT "rascunhos_saude_rascunho_id_fkey" FOREIGN KEY ("rascunho_id") REFERENCES "inscricoes"."rascunhos"("rascunho_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inscricoes"."inscricoes" ADD CONSTRAINT "inscricoes_rascunho_id_fkey" FOREIGN KEY ("rascunho_id") REFERENCES "inscricoes"."rascunhos"("rascunho_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inscricoes"."inscricoes" ADD CONSTRAINT "inscricoes_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoas"."pessoas"("pessoa_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inscricoes"."inscricoes" ADD CONSTRAINT "inscricoes_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "eventos"."campanhas"("campanha_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inscricoes"."inscricoes" ADD CONSTRAINT "inscricoes_versao_ficha_id_fkey" FOREIGN KEY ("versao_ficha_id") REFERENCES "inscricoes"."versoes_ficha"("versao_ficha_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inscricoes"."inscricoes" ADD CONSTRAINT "inscricoes_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "acesso"."contas"("conta_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inscricoes"."inscricoes" ADD CONSTRAINT "inscricoes_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "eventos"."equipes"("equipe_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "saude"."fichas_saude" ADD CONSTRAINT "fichas_saude_inscricao_id_fkey" FOREIGN KEY ("inscricao_id") REFERENCES "inscricoes"."inscricoes"("inscricao_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inscricoes"."aceites" ADD CONSTRAINT "aceites_inscricao_id_fkey" FOREIGN KEY ("inscricao_id") REFERENCES "inscricoes"."inscricoes"("inscricao_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inscricoes"."historico" ADD CONSTRAINT "historico_inscricao_id_fkey" FOREIGN KEY ("inscricao_id") REFERENCES "inscricoes"."inscricoes"("inscricao_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "eventos"."equipes" ADD CONSTRAINT "equipes_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "eventos"."eventos"("evento_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "arquivos"."arquivos" ADD CONSTRAINT "arquivos_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"."organizacoes"("organizacao_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "arquivos"."arquivos" ADD CONSTRAINT "arquivos_rascunho_id_fkey" FOREIGN KEY ("rascunho_id") REFERENCES "inscricoes"."rascunhos"("rascunho_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "arquivos"."arquivos" ADD CONSTRAINT "arquivos_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "acesso"."contas"("conta_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE inscricoes.versoes_ficha ADD CONSTRAINT versoes_ficha_numero_positivo CHECK (numero_versao > 0);
ALTER TABLE inscricoes.rascunhos ADD CONSTRAINT rascunhos_hash_token_valido CHECK (hash_token ~ '^[0-9a-f]{64}$');
ALTER TABLE arquivos.arquivos ADD CONSTRAINT arquivos_tamanho_positivo CHECK (tamanho_bytes > 0);

-- Uma ficha publicada e as respostas enviadas são registros imutáveis.
CREATE FUNCTION inscricoes.proteger_ficha_publicada() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.publicada_em IS NOT NULL AND (
    NEW.configuracao IS DISTINCT FROM OLD.configuracao OR
    NEW.publicada_em IS DISTINCT FROM OLD.publicada_em OR
    NEW.campanha_id IS DISTINCT FROM OLD.campanha_id OR
    NEW.numero_versao IS DISTINCT FROM OLD.numero_versao
  ) THEN
    RAISE EXCEPTION 'Ficha publicada é imutável; crie uma nova versão.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ficha_publicada_imutavel BEFORE UPDATE ON inscricoes.versoes_ficha
FOR EACH ROW EXECUTE FUNCTION inscricoes.proteger_ficha_publicada();
CREATE FUNCTION inscricoes.proteger_respostas_inscricao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.respostas IS DISTINCT FROM OLD.respostas OR
     NEW.versao_ficha_id IS DISTINCT FROM OLD.versao_ficha_id OR
     NEW.campanha_id IS DISTINCT FROM OLD.campanha_id OR
     NEW.pessoa_id IS DISTINCT FROM OLD.pessoa_id OR
     NEW.rascunho_id IS DISTINCT FROM OLD.rascunho_id THEN
    RAISE EXCEPTION 'As respostas enviadas e sua origem são imutáveis.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER respostas_inscricao_imutaveis BEFORE UPDATE ON inscricoes.inscricoes
FOR EACH ROW EXECUTE FUNCTION inscricoes.proteger_respostas_inscricao();

ALTER TABLE "inscricoes"."versoes_ficha" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inscricoes"."rascunhos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saude"."rascunhos_saude" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inscricoes"."inscricoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saude"."fichas_saude" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inscricoes"."aceites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inscricoes"."historico" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eventos"."equipes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "arquivos"."arquivos" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA inscricoes, saude, arquivos FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA inscricoes, saude, arquivos FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA inscricoes FROM PUBLIC;
REVOKE ALL ON TABLE eventos.equipes FROM PUBLIC;
REVOKE ALL ON TYPE inscricoes.situacao_inscricao FROM PUBLIC;
DO $$ DECLARE papel TEXT; BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA inscricoes, saude, arquivos FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA inscricoes, saude, arquivos FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA inscricoes FROM %I', papel);
      EXECUTE format('REVOKE ALL ON TABLE eventos.equipes FROM %I', papel);
      EXECUTE format('REVOKE ALL ON TYPE inscricoes.situacao_inscricao FROM %I', papel);
    END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN inscricoes.inscricoes.respostas IS 'Retrato das respostas enviado com a versão original da ficha; nunca alterar ao editar o perfil.';
COMMENT ON COLUMN inscricoes.rascunhos.hash_token IS 'Hash SHA-256 da credencial exclusiva do rascunho. Nunca gravar o token em texto puro.';
COMMENT ON TABLE inscricoes.historico IS 'Autor, instante e motivo de cada decisão. Não incluir dados médicos no motivo.';
COMMIT;
SELECT table_schema, table_name FROM information_schema.tables
WHERE table_schema IN ('inscricoes','saude','arquivos') OR (table_schema='eventos' AND table_name='equipes')
ORDER BY table_schema, table_name;
