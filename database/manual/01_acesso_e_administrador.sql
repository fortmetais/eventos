-- ETAPA 1 — contas de acesso e permissão de administrador da plataforma.
-- PADRÃO PT-BR CONFIRMADO: eventos_beta / acesso.contas.
-- Se você já concluiu esta etapa no DBeaver, NÃO execute novamente.
-- Use 01b_conferir_contas.sql para conferir a estrutura existente.
-- Execute como proprietário do banco, em uma base nova da aplicação.
-- Execute o arquivo inteiro como SCRIPT no DBeaver. Executar apenas a
-- instrução sob o cursor pode deixar uma transação aberta.
-- Não há DROP, senha, conta fictícia ou promoção automática de usuário.
-- Este script é de instalação: execute uma vez. Em caso de erro, ROLLBACK.

BEGIN;

-- A instalação anterior do projeto usava public. Não misturar as duas bases.
DO $$
BEGIN
    IF to_regclass('public."Account"') IS NOT NULL OR to_regclass('public.contas') IS NOT NULL THEN
        RAISE EXCEPTION 'Existe uma tabela de contas legada no esquema public desta base. Use uma base nova ou planeje a migração dos dados antes de executar estes scripts.';
    END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS acesso;
COMMENT ON SCHEMA acesso IS
    'Identidades globais da aplicação e permissões da plataforma; autenticação gerida pelo Supabase Auth.';

CREATE TABLE acesso.contas (
    conta_id            UUID NOT NULL,
    email         TEXT NOT NULL,
    admin BOOLEAN NOT NULL DEFAULT FALSE,
    perfil       JSONB NOT NULL DEFAULT '{}'::JSONB,
    criado_em     TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL
                        DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),

    CONSTRAINT contas_pk PRIMARY KEY (conta_id),
    CONSTRAINT contas_email_obrigatorio CHECK (length(btrim(email)) > 0),
    CONSTRAINT contas_perfil_objeto CHECK (jsonb_typeof(perfil) = 'object')
);

CREATE INDEX contas_email_busca_idx ON acesso.contas (lower(email));

COMMENT ON TABLE acesso.contas IS
    'Conta global. Administradores, organizadores e participantes usam a mesma identidade; pessoas sem login ficam no esquema pessoas.';
COMMENT ON COLUMN acesso.contas.conta_id IS
    'Mesmo UUID da identidade verificada no Supabase Auth. Não gerar um UUID independente para uma conta de acesso.';
COMMENT ON COLUMN acesso.contas.admin IS
    'Permissão global provisionada por procedimento restrito. Não concede acesso automático a dados de saúde.';
COMMENT ON COLUMN acesso.contas.perfil IS
    'Dados básicos opcionais do perfil pessoal; não armazenar senhas, tokens, respostas de saúde nem permissões neste JSON.';
COMMENT ON COLUMN acesso.contas.criado_em IS
    'Instante em UTC, mantido como timestamp sem fuso para corresponder ao modelo Prisma atual.';

-- Sem políticas públicas: navegação não deve consultar tabelas de negócio
-- diretamente. O servidor aplicará a autorização com uma conexão privada.
ALTER TABLE acesso.contas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA acesso FROM PUBLIC;
REVOKE ALL ON TABLE acesso.contas FROM PUBLIC;

-- Esses papéis existem no Supabase; a mesma instalação funciona no PostgreSQL
-- comum, onde eles podem não existir. Não alterar o esquema auth do Supabase.
DO $$
DECLARE
    papel_navegador TEXT;
BEGIN
    FOREACH papel_navegador IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel_navegador) THEN
            EXECUTE format('REVOKE ALL ON SCHEMA acesso FROM %I', papel_navegador);
            EXECUTE format('REVOKE ALL ON TABLE acesso.contas FROM %I', papel_navegador);
        END IF;
    END LOOP;
END;
$$;

COMMIT;

-- Conferência: deve retornar acesso.contas.
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'acesso' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- A criação do primeiro administrador virá DEPOIS da configuração do Auth.
-- Quando estiver no próprio banco do Supabase, este EXEMPLO pode ser usado
-- pelo proprietário do banco após substituir o UUID e conferir a identidade.
-- Ele está comentado de propósito: não cria identidade nem senha no Auth.
--
-- INSERT INTO acesso.contas (conta_id, email, admin)
-- SELECT id, lower(email), TRUE
-- FROM auth.users
-- WHERE id = 'SUBSTITUIR_PELO_UUID_REAL'::UUID
--   AND email IS NOT NULL
--   AND email_confirmed_at IS NOT NULL
-- ON CONFLICT (conta_id) DO UPDATE
-- SET email = EXCLUDED.email, admin = TRUE;
--
-- No PostgreSQL externo ao Supabase, auth.users não existe. Nesse caso,
-- usaremos o procedimento bootstrap-admin da API depois de adaptar o Prisma.
