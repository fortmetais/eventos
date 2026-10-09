-- ETAPA 3 — pessoas cadastradas pela organização, inclusive sem login.
-- Execute após validar as etapas 1 e 2, na MESMA base.
-- A conta pessoal global já é acesso.contas: não criar outra tabela de login.
-- O vínculo comprovado com inscrições será adicionado no módulo de inscrição.

BEGIN;

CREATE SCHEMA IF NOT EXISTS pessoas;
COMMENT ON SCHEMA pessoas IS
    'Cadastros de pessoas vinculados às organizações, independentemente de terem conta pessoal.';

CREATE TABLE pessoas.pessoas (
    pessoa_id             UUID NOT NULL,
    organizacao_id UUID NOT NULL,
    nome           TEXT NOT NULL,
    data_nascimento      DATE NOT NULL,
    telefone          TEXT NOT NULL,
    email          TEXT,
    cpf            TEXT,
    criado_em      TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL
                         DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),

    CONSTRAINT pessoas_pk PRIMARY KEY (pessoa_id),
    CONSTRAINT pessoas_organizacao_id_fk
        FOREIGN KEY (organizacao_id) REFERENCES organizacoes.organizacoes (organizacao_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT pessoas_nome_obrigatorio CHECK (length(btrim(nome)) > 0),
    CONSTRAINT pessoas_telefone_obrigatorio CHECK (length(btrim(telefone)) > 0)
);

CREATE INDEX pessoas_organizacao_id_cpf_idx
    ON pessoas.pessoas (organizacao_id, cpf);
CREATE INDEX pessoas_organizacao_id_nome_idx
    ON pessoas.pessoas (organizacao_id, nome);

COMMENT ON TABLE pessoas.pessoas IS
    'Cadastro pertencente a uma organização. Não é uma conta de acesso e não reúne automaticamente o histórico de outras paróquias.';
COMMENT ON COLUMN pessoas.pessoas.email IS
    'Opcional para inscrição; informar este e-mail não prova titularidade de uma conta.';
COMMENT ON COLUMN pessoas.pessoas.cpf IS
    'Opcional. Sem unicidade global: CPF não concede acesso nem autoriza mesclar cadastros ou vincular históricos.';
COMMENT ON COLUMN pessoas.pessoas.pessoa_id IS
    'UUID gerado pela aplicação/Prisma. A identidade da conta de acesso, quando existir, é distinta.';

ALTER TABLE pessoas.pessoas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA pessoas FROM PUBLIC;
REVOKE ALL ON TABLE pessoas.pessoas FROM PUBLIC;

DO $$
DECLARE
    papel_navegador TEXT;
BEGIN
    FOREACH papel_navegador IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel_navegador) THEN
            EXECUTE format('REVOKE ALL ON SCHEMA pessoas FROM %I', papel_navegador);
            EXECUTE format('REVOKE ALL ON TABLE pessoas.pessoas FROM %I', papel_navegador);
        END IF;
    END LOOP;
END;
$$;

COMMIT;

SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema IN ('acesso', 'organizacoes', 'pessoas')
  AND table_type = 'BASE TABLE'
ORDER BY table_schema, table_name;
