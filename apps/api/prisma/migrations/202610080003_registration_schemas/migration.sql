-- Somente instalações completas/testes. Na base gradual, utilize o SQL manual 06.
CREATE SCHEMA inscricoes; CREATE SCHEMA saude; CREATE SCHEMA arquivos;
ALTER TYPE public."RegistrationStatus" SET SCHEMA inscricoes;
ALTER TYPE inscricoes."RegistrationStatus" RENAME TO situacao_inscricao;
ALTER TYPE inscricoes.situacao_inscricao RENAME VALUE 'RECEIVED' TO 'RECEBIDA';
ALTER TYPE inscricoes.situacao_inscricao RENAME VALUE 'REVIEW' TO 'EM_ANALISE';
ALTER TYPE inscricoes.situacao_inscricao RENAME VALUE 'APPROVED' TO 'APROVADA';
ALTER TYPE inscricoes.situacao_inscricao RENAME VALUE 'CONFIRMED' TO 'CONFIRMADA';
ALTER TYPE inscricoes.situacao_inscricao RENAME VALUE 'WAITLIST' TO 'LISTA_ESPERA';
ALTER TYPE inscricoes.situacao_inscricao RENAME VALUE 'REJECTED' TO 'RECUSADA';
ALTER TYPE inscricoes.situacao_inscricao RENAME VALUE 'CANCELLED' TO 'CANCELADA';
ALTER TABLE public."FormVersion" SET SCHEMA "inscricoes";
ALTER TABLE "inscricoes"."FormVersion" RENAME TO "versoes_ficha";
ALTER TABLE "inscricoes"."versoes_ficha" RENAME COLUMN "id" TO "versao_ficha_id";
ALTER TABLE "inscricoes"."versoes_ficha" RENAME COLUMN "campaignId" TO "campanha_id";
ALTER TABLE "inscricoes"."versoes_ficha" RENAME COLUMN "version" TO "numero_versao";
ALTER TABLE "inscricoes"."versoes_ficha" RENAME COLUMN "config" TO "configuracao";
ALTER TABLE "inscricoes"."versoes_ficha" RENAME COLUMN "publishedAt" TO "publicada_em";
ALTER TABLE "inscricoes"."versoes_ficha" RENAME COLUMN "createdAt" TO "criado_em";
ALTER TABLE "inscricoes"."versoes_ficha" ALTER COLUMN "criado_em" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "inscricoes"."versoes_ficha" RENAME CONSTRAINT "FormVersion_pkey" TO "versoes_ficha_pkey";
ALTER INDEX "inscricoes"."FormVersion_campaignId_version_key" RENAME TO "versoes_ficha_campanha_id_numero_versao_key";
ALTER TABLE "inscricoes"."versoes_ficha" RENAME CONSTRAINT "FormVersion_campaignId_fkey" TO "versoes_ficha_campanha_id_fkey";
ALTER TABLE public."Draft" SET SCHEMA "inscricoes";
ALTER TABLE "inscricoes"."Draft" RENAME TO "rascunhos";
ALTER TABLE "inscricoes"."rascunhos" RENAME COLUMN "id" TO "rascunho_id";
ALTER TABLE "inscricoes"."rascunhos" RENAME COLUMN "campaignId" TO "campanha_id";
ALTER TABLE "inscricoes"."rascunhos" RENAME COLUMN "formVersionId" TO "versao_ficha_id";
ALTER TABLE "inscricoes"."rascunhos" RENAME COLUMN "tokenHash" TO "hash_token";
ALTER TABLE "inscricoes"."rascunhos" RENAME COLUMN "payload" TO "respostas";
ALTER TABLE "inscricoes"."rascunhos" RENAME COLUMN "expiresAt" TO "expira_em";
ALTER TABLE "inscricoes"."rascunhos" RENAME COLUMN "updatedAt" TO "atualizado_em";
ALTER TABLE "inscricoes"."rascunhos" RENAME COLUMN "createdAt" TO "criado_em";
ALTER TABLE "inscricoes"."rascunhos" ALTER COLUMN "criado_em" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "inscricoes"."rascunhos" RENAME CONSTRAINT "Draft_pkey" TO "rascunhos_pkey";
ALTER INDEX "inscricoes"."Draft_tokenHash_key" RENAME TO "rascunhos_hash_token_key";
ALTER TABLE "inscricoes"."rascunhos" RENAME CONSTRAINT "Draft_campaignId_fkey" TO "rascunhos_campanha_id_fkey";
ALTER TABLE "inscricoes"."rascunhos" RENAME CONSTRAINT "Draft_formVersionId_fkey" TO "rascunhos_versao_ficha_id_fkey";
ALTER TABLE public."DraftHealth" SET SCHEMA "saude";
ALTER TABLE "saude"."DraftHealth" RENAME TO "rascunhos_saude";
ALTER TABLE "saude"."rascunhos_saude" RENAME COLUMN "draftId" TO "rascunho_id";
ALTER TABLE "saude"."rascunhos_saude" RENAME COLUMN "data" TO "respostas";
ALTER TABLE "saude"."rascunhos_saude" RENAME CONSTRAINT "DraftHealth_pkey" TO "rascunhos_saude_pkey";
ALTER TABLE "saude"."rascunhos_saude" RENAME CONSTRAINT "DraftHealth_draftId_fkey" TO "rascunhos_saude_rascunho_id_fkey";
ALTER TABLE public."Registration" SET SCHEMA "inscricoes";
ALTER TABLE "inscricoes"."Registration" RENAME TO "inscricoes";
ALTER TABLE "inscricoes"."inscricoes" RENAME COLUMN "id" TO "inscricao_id";
ALTER TABLE "inscricoes"."inscricoes" RENAME COLUMN "protocol" TO "protocolo";
ALTER TABLE "inscricoes"."inscricoes" RENAME COLUMN "draftId" TO "rascunho_id";
ALTER TABLE "inscricoes"."inscricoes" RENAME COLUMN "personId" TO "pessoa_id";
ALTER TABLE "inscricoes"."inscricoes" RENAME COLUMN "campaignId" TO "campanha_id";
ALTER TABLE "inscricoes"."inscricoes" RENAME COLUMN "formVersionId" TO "versao_ficha_id";
ALTER TABLE "inscricoes"."inscricoes" RENAME COLUMN "accountId" TO "conta_id";
ALTER TABLE "inscricoes"."inscricoes" RENAME COLUMN "teamId" TO "equipe_id";
ALTER TABLE "inscricoes"."inscricoes" RENAME COLUMN "snapshot" TO "respostas";
ALTER TABLE "inscricoes"."inscricoes" RENAME COLUMN "status" TO "situacao";
ALTER TABLE "inscricoes"."inscricoes" RENAME COLUMN "createdAt" TO "criado_em";
ALTER TABLE "inscricoes"."inscricoes" RENAME COLUMN "updatedAt" TO "atualizado_em";
ALTER TABLE "inscricoes"."inscricoes" ALTER COLUMN "criado_em" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "inscricoes"."inscricoes" RENAME CONSTRAINT "Registration_pkey" TO "inscricoes_pkey";
ALTER INDEX "inscricoes"."Registration_protocol_key" RENAME TO "inscricoes_protocolo_key";
ALTER INDEX "inscricoes"."Registration_draftId_key" RENAME TO "inscricoes_rascunho_id_key";
ALTER INDEX "inscricoes"."Registration_campaignId_status_idx" RENAME TO "inscricoes_campanha_id_situacao_idx";
ALTER INDEX "inscricoes"."Registration_accountId_idx" RENAME TO "inscricoes_conta_id_idx";
ALTER TABLE "inscricoes"."inscricoes" RENAME CONSTRAINT "Registration_draftId_fkey" TO "inscricoes_rascunho_id_fkey";
ALTER TABLE "inscricoes"."inscricoes" RENAME CONSTRAINT "Registration_personId_fkey" TO "inscricoes_pessoa_id_fkey";
ALTER TABLE "inscricoes"."inscricoes" RENAME CONSTRAINT "Registration_campaignId_fkey" TO "inscricoes_campanha_id_fkey";
ALTER TABLE "inscricoes"."inscricoes" RENAME CONSTRAINT "Registration_formVersionId_fkey" TO "inscricoes_versao_ficha_id_fkey";
ALTER TABLE "inscricoes"."inscricoes" RENAME CONSTRAINT "Registration_accountId_fkey" TO "inscricoes_conta_id_fkey";
ALTER TABLE "inscricoes"."inscricoes" RENAME CONSTRAINT "Registration_teamId_fkey" TO "inscricoes_equipe_id_fkey";
ALTER TABLE public."HealthSubmission" SET SCHEMA "saude";
ALTER TABLE "saude"."HealthSubmission" RENAME TO "fichas_saude";
ALTER TABLE "saude"."fichas_saude" RENAME COLUMN "registrationId" TO "inscricao_id";
ALTER TABLE "saude"."fichas_saude" RENAME COLUMN "data" TO "respostas";
ALTER TABLE "saude"."fichas_saude" RENAME CONSTRAINT "HealthSubmission_pkey" TO "fichas_saude_pkey";
ALTER TABLE "saude"."fichas_saude" RENAME CONSTRAINT "HealthSubmission_registrationId_fkey" TO "fichas_saude_inscricao_id_fkey";
ALTER TABLE public."Consent" SET SCHEMA "inscricoes";
ALTER TABLE "inscricoes"."Consent" RENAME TO "aceites";
ALTER TABLE "inscricoes"."aceites" RENAME COLUMN "registrationId" TO "inscricao_id";
ALTER TABLE "inscricoes"."aceites" RENAME COLUMN "version" TO "versao";
ALTER TABLE "inscricoes"."aceites" RENAME COLUMN "termsText" TO "texto_termos";
ALTER TABLE "inscricoes"."aceites" RENAME COLUMN "accepted" TO "aceito";
ALTER TABLE "inscricoes"."aceites" RENAME COLUMN "imageAuthorized" TO "imagem_autorizada";
ALTER TABLE "inscricoes"."aceites" RENAME COLUMN "guardianAuthorized" TO "responsavel_autorizou";
ALTER TABLE "inscricoes"."aceites" RENAME COLUMN "acceptedAt" TO "aceito_em";
ALTER TABLE "inscricoes"."aceites" ALTER COLUMN "aceito_em" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "inscricoes"."aceites" RENAME CONSTRAINT "Consent_pkey" TO "aceites_pkey";
ALTER TABLE "inscricoes"."aceites" RENAME CONSTRAINT "Consent_registrationId_fkey" TO "aceites_inscricao_id_fkey";
ALTER TABLE public."StatusHistory" SET SCHEMA "inscricoes";
ALTER TABLE "inscricoes"."StatusHistory" RENAME TO "historico";
ALTER TABLE "inscricoes"."historico" RENAME COLUMN "id" TO "historico_id";
ALTER TABLE "inscricoes"."historico" RENAME COLUMN "registrationId" TO "inscricao_id";
ALTER TABLE "inscricoes"."historico" RENAME COLUMN "actorId" TO "autor_id";
ALTER TABLE "inscricoes"."historico" RENAME COLUMN "fromStatus" TO "situacao_anterior";
ALTER TABLE "inscricoes"."historico" RENAME COLUMN "toStatus" TO "situacao_nova";
ALTER TABLE "inscricoes"."historico" RENAME COLUMN "reason" TO "motivo";
ALTER TABLE "inscricoes"."historico" RENAME COLUMN "createdAt" TO "criado_em";
ALTER TABLE "inscricoes"."historico" ALTER COLUMN "criado_em" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "inscricoes"."historico" RENAME CONSTRAINT "StatusHistory_pkey" TO "historico_pkey";
ALTER TABLE "inscricoes"."historico" RENAME CONSTRAINT "StatusHistory_registrationId_fkey" TO "historico_inscricao_id_fkey";
ALTER TABLE public."Team" SET SCHEMA "eventos";
ALTER TABLE "eventos"."Team" RENAME TO "equipes";
ALTER TABLE "eventos"."equipes" RENAME COLUMN "id" TO "equipe_id";
ALTER TABLE "eventos"."equipes" RENAME COLUMN "eventId" TO "evento_id";
ALTER TABLE "eventos"."equipes" RENAME COLUMN "name" TO "nome";
ALTER TABLE "eventos"."equipes" RENAME CONSTRAINT "Team_pkey" TO "equipes_pkey";
ALTER INDEX "eventos"."Team_eventId_name_key" RENAME TO "equipes_evento_id_nome_key";
ALTER TABLE "eventos"."equipes" RENAME CONSTRAINT "Team_eventId_fkey" TO "equipes_evento_id_fkey";
ALTER TABLE public."MediaAsset" SET SCHEMA "arquivos";
ALTER TABLE "arquivos"."MediaAsset" RENAME TO "arquivos";
ALTER TABLE "arquivos"."arquivos" RENAME COLUMN "id" TO "arquivo_id";
ALTER TABLE "arquivos"."arquivos" RENAME COLUMN "organizationId" TO "organizacao_id";
ALTER TABLE "arquivos"."arquivos" RENAME COLUMN "draftId" TO "rascunho_id";
ALTER TABLE "arquivos"."arquivos" RENAME COLUMN "accountId" TO "conta_id";
ALTER TABLE "arquivos"."arquivos" RENAME COLUMN "provider" TO "provedor";
ALTER TABLE "arquivos"."arquivos" RENAME COLUMN "objectKey" TO "chave_objeto";
ALTER TABLE "arquivos"."arquivos" RENAME COLUMN "purpose" TO "finalidade";
ALTER TABLE "arquivos"."arquivos" RENAME COLUMN "mimeType" TO "tipo_mime";
ALTER TABLE "arquivos"."arquivos" RENAME COLUMN "size" TO "tamanho_bytes";
ALTER TABLE "arquivos"."arquivos" RENAME COLUMN "createdAt" TO "criado_em";
ALTER TABLE "arquivos"."arquivos" ALTER COLUMN "criado_em" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "arquivos"."arquivos" RENAME CONSTRAINT "MediaAsset_pkey" TO "arquivos_pkey";
ALTER INDEX "arquivos"."MediaAsset_objectKey_key" RENAME TO "arquivos_chave_objeto_key";
ALTER TABLE "arquivos"."arquivos" RENAME CONSTRAINT "MediaAsset_organizationId_fkey" TO "arquivos_organizacao_id_fkey";
ALTER TABLE "arquivos"."arquivos" RENAME CONSTRAINT "MediaAsset_draftId_fkey" TO "arquivos_rascunho_id_fkey";
ALTER TABLE "arquivos"."arquivos" RENAME CONSTRAINT "MediaAsset_accountId_fkey" TO "arquivos_conta_id_fkey";
DROP TRIGGER immutable_published_form ON inscricoes.versoes_ficha;
DROP TRIGGER immutable_registration_snapshot ON inscricoes.inscricoes;
DROP FUNCTION public.protect_published_form();
DROP FUNCTION public.protect_registration_snapshot();
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

