-- ETAPA 2 — paróquias, organizadoras, membros, convites e auditoria.
-- Execute somente após validar a etapa 1, na MESMA base.
-- As contas já existem em acesso.contas; cada vínculo concede uma função
-- específica naquela organização. A mesma conta pode ter vários vínculos.

BEGIN;

-- Falhar antes de criar objetos se a etapa 1 não estiver disponível.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = to_regclass('acesso.contas') AND contype = 'p'
          AND pg_get_constraintdef(oid) = 'PRIMARY KEY (conta_id)'
    ) THEN
        RAISE EXCEPTION 'É necessária a tabela acesso.contas com chave primária conta_id. Confira a etapa 1 antes de continuar.';
    END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS organizacoes;
COMMENT ON SCHEMA organizacoes IS
    'Organizações responsáveis e seus vínculos administrativos. Uma linha por paróquia/organização, não um esquema por paróquia.';

CREATE TYPE organizacoes.funcao_membro AS ENUM (
    'ORGANIZER', 'SECRETARY', 'HEALTH'
);

CREATE TABLE organizacoes.organizacoes (
    organizacao_id        UUID NOT NULL,
    nome      TEXT NOT NULL,
    tipo      TEXT NOT NULL DEFAULT 'PARISH',
    cidade      TEXT NOT NULL,
    uf     TEXT NOT NULL,
    contato   TEXT NOT NULL,
    url_logotipo   TEXT,
    ativo    BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL
                    DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),

    CONSTRAINT organizacoes_pk PRIMARY KEY (organizacao_id),
    CONSTRAINT organizacoes_nome_obrigatorio CHECK (length(btrim(nome)) > 0),
    CONSTRAINT organizacoes_cidade_obrigatorio CHECK (length(btrim(cidade)) > 0),
    CONSTRAINT organizacoes_uf_formato CHECK (uf ~ '^[A-Z]{2}$')
);

CREATE TABLE organizacoes.membros (
    membro_id             UUID NOT NULL,
    organizacao_id UUID NOT NULL,
    conta_id      UUID NOT NULL,
    funcao           organizacoes.funcao_membro NOT NULL,
    ativo         BOOLEAN NOT NULL DEFAULT TRUE,
    eventos_saude_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT membros_pk PRIMARY KEY (membro_id),
    CONSTRAINT membros_organizacao_id_fk
        FOREIGN KEY (organizacao_id) REFERENCES organizacoes.organizacoes (organizacao_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT membros_conta_id_fk
        FOREIGN KEY (conta_id) REFERENCES acesso.contas (conta_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT membros_organizacao_id_conta_id_uk
        UNIQUE (organizacao_id, conta_id)
);

CREATE INDEX membros_conta_id_idx ON organizacoes.membros (conta_id);

CREATE TABLE organizacoes.convites (
    convite_id             UUID NOT NULL,
    organizacao_id UUID NOT NULL,
    email          TEXT NOT NULL,
    funcao           organizacoes.funcao_membro NOT NULL,
    hash_token      TEXT NOT NULL,
    expira_em      TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
    aceito_em     TIMESTAMP(3) WITHOUT TIME ZONE,
    revogado_em      TIMESTAMP(3) WITHOUT TIME ZONE,
    criado_por      UUID NOT NULL,
    criado_em      TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL
                         DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),

    CONSTRAINT convites_pk PRIMARY KEY (convite_id),
    CONSTRAINT convites_hash_token_uk UNIQUE (hash_token),
    CONSTRAINT convites_organizacao_id_fk
        FOREIGN KEY (organizacao_id) REFERENCES organizacoes.organizacoes (organizacao_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT convites_criado_por_fk
        FOREIGN KEY (criado_por) REFERENCES acesso.contas (conta_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT convites_email_obrigatorio CHECK (length(btrim(email)) > 0),
    CONSTRAINT convites_hash_token_formato CHECK (hash_token ~ '^[0-9a-f]{64}$'),
    CONSTRAINT convites_periodo_valido CHECK (expira_em > criado_em),
    CONSTRAINT convites_desfecho_unico
        CHECK (aceito_em IS NULL OR revogado_em IS NULL)
);

CREATE INDEX convites_organizacao_id_email_idx
    ON organizacoes.convites (organizacao_id, email);

CREATE TABLE organizacoes.auditoria (
    auditoria_id             UUID NOT NULL,
    organizacao_id UUID NOT NULL,
    autor_id        UUID NOT NULL,
    acao         TEXT NOT NULL,
    entidade_id       TEXT NOT NULL,
    criado_em      TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL
                         DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),

    CONSTRAINT auditoria_pk PRIMARY KEY (auditoria_id),
    CONSTRAINT auditoria_organizacao_id_fk
        FOREIGN KEY (organizacao_id) REFERENCES organizacoes.organizacoes (organizacao_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT auditoria_autor_id_fk
        FOREIGN KEY (autor_id) REFERENCES acesso.contas (conta_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX auditoria_organizacao_id_criado_em_idx
    ON organizacoes.auditoria (organizacao_id, criado_em);

COMMENT ON TABLE organizacoes.membros IS
    'Uma função administrativa por conta e organização. ativo=false suspende o vínculo mesmo com sessão de autenticação válida.';
COMMENT ON COLUMN organizacoes.membros.eventos_saude_ids IS
    'IDs de edições autorizadas para saúde. Lista vazia não concede acesso. Validação por organização é feita pela API; estrutura preservada do modelo atual.';
COMMENT ON COLUMN organizacoes.convites.hash_token IS
    'SHA-256 hexadecimal do token de convite. Nunca gravar o token em texto puro.';
COMMENT ON TABLE organizacoes.convites IS
    'Convite com validade e uso único; consumo concorrente precisa de transação e bloqueio da linha na API.';
COMMENT ON TABLE organizacoes.auditoria IS
    'Auditoria administrativa por organização. Não gravar respostas médicas, senhas ou credenciais em acao/entidade_id.';
COMMENT ON COLUMN organizacoes.organizacoes.organizacao_id IS
    'UUID gerado pela aplicação/Prisma. Não é uma conta de acesso.';

ALTER TABLE organizacoes.organizacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizacoes.membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizacoes.convites ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizacoes.auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA organizacoes FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA organizacoes FROM PUBLIC;
REVOKE ALL ON TYPE organizacoes.funcao_membro FROM PUBLIC;

DO $$
DECLARE
    papel_navegador TEXT;
BEGIN
    FOREACH papel_navegador IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel_navegador) THEN
            EXECUTE format('REVOKE ALL ON SCHEMA organizacoes FROM %I', papel_navegador);
            EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA organizacoes FROM %I', papel_navegador);
            EXECUTE format('REVOKE ALL ON TYPE organizacoes.funcao_membro FROM %I', papel_navegador);
        END IF;
    END LOOP;
END;
$$;

COMMIT;

SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'organizacoes' AND table_type = 'BASE TABLE'
ORDER BY table_name;
