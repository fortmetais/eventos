-- ETAPA 4 — execute no DBeaver conectado ao banco eventos_beta.
-- Depende das etapas 1 e 2. Não cria fichas, inscrições ou equipes.
-- Execute o arquivo inteiro uma única vez. UUIDs são gerados pelo Prisma.
BEGIN;
DO $$ BEGIN
    IF to_regclass('organizacoes.organizacoes') IS NULL THEN
        RAISE EXCEPTION 'Crie primeiro as organizações da etapa 2.';
    END IF;
END $$;

CREATE SCHEMA eventos;
COMMENT ON SCHEMA eventos IS 'Tipos, edições e campanhas de eventos de todas as organizações.';
CREATE TYPE eventos.situacao_evento AS ENUM ('RASCUNHO', 'PUBLICADO', 'CANCELADO', 'REALIZADO');
CREATE TYPE eventos.publico_campanha AS ENUM ('CAMPISTA', 'SERVO');

CREATE TABLE eventos.tipos_evento (
    tipo_evento_id UUID NOT NULL,
    organizacao_id UUID NOT NULL,
    nome TEXT NOT NULL,
    CONSTRAINT tipos_evento_pk PRIMARY KEY (tipo_evento_id),
    CONSTRAINT tipos_evento_organizacao_nome_uk UNIQUE (organizacao_id, nome),
    CONSTRAINT tipos_evento_organizacao_fk FOREIGN KEY (organizacao_id)
        REFERENCES organizacoes.organizacoes (organizacao_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT tipos_evento_nome_valido CHECK (length(btrim(nome)) BETWEEN 2 AND 80)
);

CREATE TABLE eventos.eventos (
    evento_id UUID NOT NULL,
    organizacao_id UUID NOT NULL,
    tipo_evento_id UUID NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT NOT NULL,
    url_arte TEXT,
    bucket_arte TEXT,
    chave_arte TEXT,
    local TEXT NOT NULL,
    cidade TEXT NOT NULL,
    inicio_em DATE NOT NULL,
    termino_em DATE NOT NULL,
    situacao eventos.situacao_evento NOT NULL DEFAULT 'RASCUNHO',
    criado_em TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    CONSTRAINT eventos_pk PRIMARY KEY (evento_id),
    CONSTRAINT eventos_organizacao_fk FOREIGN KEY (organizacao_id)
        REFERENCES organizacoes.organizacoes (organizacao_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT eventos_tipo_fk FOREIGN KEY (tipo_evento_id)
        REFERENCES eventos.tipos_evento (tipo_evento_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT eventos_periodo_valido CHECK (termino_em >= inicio_em),
    CONSTRAINT eventos_nome_valido CHECK (length(btrim(nome)) BETWEEN 3 AND 150),
    CONSTRAINT eventos_arte_completa CHECK (
        (bucket_arte IS NULL AND chave_arte IS NULL) OR
        (bucket_arte IS NOT NULL AND chave_arte IS NOT NULL AND url_arte IS NOT NULL)
    )
);
CREATE INDEX eventos_organizacao_situacao_idx ON eventos.eventos (organizacao_id, situacao);

CREATE TABLE eventos.campanhas (
    campanha_id UUID NOT NULL,
    evento_id UUID NOT NULL,
    publico eventos.publico_campanha NOT NULL,
    abertura_em TIMESTAMPTZ(3) NOT NULL,
    encerramento_em TIMESTAMPTZ(3) NOT NULL,
    pausada BOOLEAN NOT NULL DEFAULT FALSE,
    capacidade INTEGER,
    permite_lista_espera BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT campanhas_pk PRIMARY KEY (campanha_id),
    CONSTRAINT campanhas_evento_publico_uk UNIQUE (evento_id, publico),
    CONSTRAINT campanhas_evento_fk FOREIGN KEY (evento_id)
        REFERENCES eventos.eventos (evento_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT campanhas_periodo_valido CHECK (encerramento_em > abertura_em),
    CONSTRAINT campanhas_capacidade_valida CHECK (capacidade IS NULL OR capacidade > 0)
);
COMMENT ON COLUMN eventos.eventos.url_arte IS 'URL permanente de arte de divulgação pública. Nunca reutilizar o bucket privado de identificação.';
COMMENT ON COLUMN eventos.eventos.chave_arte IS 'Chave do objeto no Storage, necessária para substituir a arte. Não armazena URL temporária.';
COMMENT ON COLUMN eventos.campanhas.abertura_em IS 'Instante com fuso; a interface exibe e recebe horários de America/Sao_Paulo.';
COMMENT ON COLUMN eventos.campanhas.capacidade IS 'Pode ficar pendente na preparação. A campanha de campistas exige capacidade antes da publicação.';

ALTER TABLE eventos.tipos_evento ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos.eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos.campanhas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA eventos FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA eventos FROM PUBLIC;
REVOKE ALL ON TYPE eventos.situacao_evento, eventos.publico_campanha FROM PUBLIC;
DO $$ DECLARE papel TEXT; BEGIN
    FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
            EXECUTE format('REVOKE ALL ON SCHEMA eventos FROM %I', papel);
            EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA eventos FROM %I', papel);
            EXECUTE format('REVOKE ALL ON TYPE eventos.situacao_evento, eventos.publico_campanha FROM %I', papel);
        END IF;
    END LOOP;
END $$;
COMMIT;

SELECT table_schema, table_name FROM information_schema.tables
WHERE table_schema = 'eventos' ORDER BY table_name;
