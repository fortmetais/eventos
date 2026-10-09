-- Compatibilidade para instalações completas feitas pelas migrations antigas.
-- NÃO aplicar à base parcial do DBeaver: ela já tem os nomes novos.
-- Move e renomeia objetos existentes, sem DROP de tabelas.
BEGIN;
CREATE SCHEMA IF NOT EXISTS acesso;
CREATE SCHEMA IF NOT EXISTS organizacoes;
CREATE SCHEMA IF NOT EXISTS pessoas;
ALTER TYPE public."MemberRole" SET SCHEMA organizacoes;
ALTER TYPE organizacoes."MemberRole" RENAME TO funcao_membro;

ALTER TABLE public."Account" SET SCHEMA acesso;
ALTER TABLE acesso."Account" RENAME TO contas;
ALTER TABLE acesso.contas RENAME COLUMN "id" TO conta_id;
ALTER TABLE acesso.contas RENAME COLUMN "platformAdmin" TO admin;
ALTER TABLE acesso.contas RENAME COLUMN "profile" TO perfil;
ALTER TABLE acesso.contas RENAME COLUMN "createdAt" TO criado_em;
ALTER TABLE acesso.contas RENAME CONSTRAINT "Account_pkey" TO contas_pk;
ALTER TABLE acesso.contas ALTER COLUMN criado_em SET DEFAULT timezone('UTC', CURRENT_TIMESTAMP);

ALTER TABLE public."Organization" SET SCHEMA organizacoes;
ALTER TABLE organizacoes."Organization" RENAME TO organizacoes;
ALTER TABLE organizacoes.organizacoes RENAME COLUMN "id" TO organizacao_id;
ALTER TABLE organizacoes.organizacoes RENAME COLUMN "name" TO nome;
ALTER TABLE organizacoes.organizacoes RENAME COLUMN "kind" TO tipo;
ALTER TABLE organizacoes.organizacoes RENAME COLUMN "city" TO cidade;
ALTER TABLE organizacoes.organizacoes RENAME COLUMN "state" TO uf;
ALTER TABLE organizacoes.organizacoes RENAME COLUMN "contact" TO contato;
ALTER TABLE organizacoes.organizacoes RENAME COLUMN "logoUrl" TO url_logotipo;
ALTER TABLE organizacoes.organizacoes RENAME COLUMN "active" TO ativo;
ALTER TABLE organizacoes.organizacoes RENAME COLUMN "createdAt" TO criado_em;
ALTER TABLE organizacoes.organizacoes RENAME CONSTRAINT "Organization_pkey" TO organizacoes_pk;
ALTER TABLE organizacoes.organizacoes ALTER COLUMN criado_em SET DEFAULT timezone('UTC', CURRENT_TIMESTAMP);

ALTER TABLE public."Membership" SET SCHEMA organizacoes;
ALTER TABLE organizacoes."Membership" RENAME TO membros;
ALTER TABLE organizacoes.membros RENAME COLUMN "id" TO membro_id;
ALTER TABLE organizacoes.membros RENAME COLUMN "organizationId" TO organizacao_id;
ALTER TABLE organizacoes.membros RENAME COLUMN "accountId" TO conta_id;
ALTER TABLE organizacoes.membros RENAME COLUMN "role" TO funcao;
ALTER TABLE organizacoes.membros RENAME COLUMN "active" TO ativo;
ALTER TABLE organizacoes.membros RENAME COLUMN "healthEventIds" TO eventos_saude_ids;
ALTER TABLE organizacoes.membros RENAME CONSTRAINT "Membership_pkey" TO membros_pk;
ALTER TABLE organizacoes.membros RENAME CONSTRAINT "Membership_organizationId_fkey" TO membros_organizacao_id_fk;

ALTER TABLE public."Invitation" SET SCHEMA organizacoes;
ALTER TABLE organizacoes."Invitation" RENAME TO convites;
ALTER TABLE organizacoes.convites RENAME COLUMN "id" TO convite_id;
ALTER TABLE organizacoes.convites RENAME COLUMN "organizationId" TO organizacao_id;
ALTER TABLE organizacoes.convites RENAME COLUMN "role" TO funcao;
ALTER TABLE organizacoes.convites RENAME COLUMN "tokenHash" TO hash_token;
ALTER TABLE organizacoes.convites RENAME COLUMN "expiresAt" TO expira_em;
ALTER TABLE organizacoes.convites RENAME COLUMN "acceptedAt" TO aceito_em;
ALTER TABLE organizacoes.convites RENAME COLUMN "revokedAt" TO revogado_em;
ALTER TABLE organizacoes.convites RENAME COLUMN "createdBy" TO criado_por;
ALTER TABLE organizacoes.convites RENAME COLUMN "createdAt" TO criado_em;
ALTER TABLE organizacoes.convites RENAME CONSTRAINT "Invitation_pkey" TO convites_pk;
ALTER TABLE organizacoes.convites ALTER COLUMN criado_em SET DEFAULT timezone('UTC', CURRENT_TIMESTAMP);
ALTER TABLE organizacoes.convites RENAME CONSTRAINT "Invitation_organizationId_fkey" TO convites_organizacao_id_fk;

ALTER TABLE public."Person" SET SCHEMA pessoas;
ALTER TABLE pessoas."Person" RENAME TO pessoas;
ALTER TABLE pessoas.pessoas RENAME COLUMN "id" TO pessoa_id;
ALTER TABLE pessoas.pessoas RENAME COLUMN "organizationId" TO organizacao_id;
ALTER TABLE pessoas.pessoas RENAME COLUMN "name" TO nome;
ALTER TABLE pessoas.pessoas RENAME COLUMN "birthDate" TO data_nascimento;
ALTER TABLE pessoas.pessoas RENAME COLUMN "phone" TO telefone;
ALTER TABLE pessoas.pessoas RENAME COLUMN "createdAt" TO criado_em;
ALTER TABLE pessoas.pessoas RENAME CONSTRAINT "Person_pkey" TO pessoas_pk;
ALTER TABLE pessoas.pessoas ALTER COLUMN criado_em SET DEFAULT timezone('UTC', CURRENT_TIMESTAMP);
ALTER TABLE pessoas.pessoas RENAME CONSTRAINT "Person_organizationId_fkey" TO pessoas_organizacao_id_fk;

ALTER TABLE public."AuditLog" SET SCHEMA organizacoes;
ALTER TABLE organizacoes."AuditLog" RENAME TO auditoria;
ALTER TABLE organizacoes.auditoria RENAME COLUMN "id" TO auditoria_id;
ALTER TABLE organizacoes.auditoria RENAME COLUMN "organizationId" TO organizacao_id;
ALTER TABLE organizacoes.auditoria RENAME COLUMN "actorId" TO autor_id;
ALTER TABLE organizacoes.auditoria RENAME COLUMN "action" TO acao;
ALTER TABLE organizacoes.auditoria RENAME COLUMN "entityId" TO entidade_id;
ALTER TABLE organizacoes.auditoria RENAME COLUMN "createdAt" TO criado_em;
ALTER TABLE organizacoes.auditoria RENAME CONSTRAINT "AuditLog_pkey" TO auditoria_pk;
ALTER TABLE organizacoes.auditoria ALTER COLUMN criado_em SET DEFAULT timezone('UTC', CURRENT_TIMESTAMP);
ALTER TABLE organizacoes.auditoria RENAME CONSTRAINT "AuditLog_organizationId_fkey" TO auditoria_organizacao_id_fk;

ALTER TABLE organizacoes.membros RENAME CONSTRAINT "Membership_accountId_fkey" TO membros_conta_id_fk;
ALTER INDEX organizacoes."Membership_organizationId_accountId_key" RENAME TO membros_organizacao_id_conta_id_uk;
ALTER INDEX organizacoes."Invitation_tokenHash_key" RENAME TO convites_hash_token_uk;
ALTER INDEX organizacoes."Invitation_organizationId_email_idx" RENAME TO convites_organizacao_id_email_idx;
ALTER INDEX pessoas."Person_organizationId_cpf_idx" RENAME TO pessoas_organizacao_id_cpf_idx;
ALTER INDEX organizacoes."AuditLog_organizationId_createdAt_idx" RENAME TO auditoria_organizacao_id_criado_em_idx;
UPDATE organizacoes.membros SET eventos_saude_ids = ARRAY[]::text[] WHERE eventos_saude_ids IS NULL;
ALTER TABLE organizacoes.membros ALTER COLUMN eventos_saude_ids SET NOT NULL;
CREATE INDEX contas_email_busca_idx ON acesso.contas (lower(email));
CREATE INDEX membros_conta_id_idx ON organizacoes.membros (conta_id);
CREATE INDEX pessoas_organizacao_id_nome_idx ON pessoas.pessoas (organizacao_id, nome);
ALTER TABLE acesso.contas ADD CONSTRAINT contas_email_obrigatorio CHECK (length(btrim(email)) > 0);
ALTER TABLE acesso.contas ADD CONSTRAINT contas_perfil_objeto CHECK (jsonb_typeof(perfil) = 'object');
ALTER TABLE organizacoes.organizacoes ADD CONSTRAINT organizacoes_nome_obrigatorio CHECK (length(btrim(nome)) > 0);
ALTER TABLE organizacoes.organizacoes ADD CONSTRAINT organizacoes_cidade_obrigatorio CHECK (length(btrim(cidade)) > 0);
ALTER TABLE organizacoes.organizacoes ADD CONSTRAINT organizacoes_uf_formato CHECK (uf ~ '^[A-Z]{2}$');
ALTER TABLE organizacoes.convites ADD CONSTRAINT convites_criado_por_fk FOREIGN KEY (criado_por) REFERENCES acesso.contas(conta_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE organizacoes.convites ADD CONSTRAINT convites_email_obrigatorio CHECK (length(btrim(email)) > 0);
ALTER TABLE organizacoes.convites ADD CONSTRAINT convites_hash_token_formato CHECK (hash_token ~ '^[0-9a-f]{64}$');
ALTER TABLE organizacoes.convites ADD CONSTRAINT convites_periodo_valido CHECK (expira_em > criado_em);
ALTER TABLE organizacoes.convites ADD CONSTRAINT convites_desfecho_unico CHECK (aceito_em IS NULL OR revogado_em IS NULL);
ALTER TABLE organizacoes.auditoria ADD CONSTRAINT auditoria_autor_id_fk FOREIGN KEY (autor_id) REFERENCES acesso.contas(conta_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE pessoas.pessoas ADD CONSTRAINT pessoas_nome_obrigatorio CHECK (length(btrim(nome)) > 0);
ALTER TABLE pessoas.pessoas ADD CONSTRAINT pessoas_telefone_obrigatorio CHECK (length(btrim(telefone)) > 0);
REVOKE ALL ON SCHEMA acesso, organizacoes, pessoas FROM PUBLIC;
REVOKE ALL ON TYPE organizacoes.funcao_membro FROM PUBLIC;
DO $$
DECLARE papel TEXT;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA acesso, organizacoes, pessoas FROM %I', papel);
      EXECUTE format('REVOKE ALL ON TYPE organizacoes.funcao_membro FROM %I', papel);
    END IF;
  END LOOP;
END;
$$;
COMMIT;
