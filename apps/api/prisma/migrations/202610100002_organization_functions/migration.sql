-- Funções por organização. Atualização aditiva e repetível.
-- Execute na base da aplicação antes de usar esta versão. Não remove vínculos.
BEGIN;
CREATE TABLE IF NOT EXISTS organizacoes.funcoes (
    funcao_id UUID NOT NULL,
    organizacao_id UUID NOT NULL,
    nome TEXT NOT NULL,
    nome_chave TEXT NOT NULL,
    descricao TEXT,
    perfil_acesso organizacoes.funcao_membro NOT NULL,
    funcao_padrao organizacoes.funcao_membro,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    atualizado_em TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    CONSTRAINT funcoes_pk PRIMARY KEY (funcao_id),
    CONSTRAINT funcoes_organizacao_fk FOREIGN KEY (organizacao_id)
        REFERENCES organizacoes.organizacoes (organizacao_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT funcoes_id_organizacao_uk UNIQUE (funcao_id, organizacao_id),
    CONSTRAINT funcoes_organizacao_nome_uk UNIQUE (organizacao_id, nome_chave),
    CONSTRAINT funcoes_organizacao_padrao_uk UNIQUE (organizacao_id, funcao_padrao),
    CONSTRAINT funcoes_nome_obrigatorio CHECK (length(btrim(nome)) BETWEEN 2 AND 80)
);
ALTER TABLE organizacoes.membros ADD COLUMN IF NOT EXISTS funcao_id UUID;
ALTER TABLE organizacoes.convites ADD COLUMN IF NOT EXISTS funcao_id UUID;

-- Os UUIDs padrão são estáveis por organização; repetir não recria nem renomeia funções.
INSERT INTO organizacoes.funcoes (funcao_id, organizacao_id, nome, nome_chave, perfil_acesso, funcao_padrao)
SELECT md5(o.organizacao_id::text || ':funcao:' || p.perfil)::uuid,
       o.organizacao_id, p.nome, p.chave,
       p.perfil::organizacoes.funcao_membro, p.perfil::organizacoes.funcao_membro
FROM organizacoes.organizacoes o
CROSS JOIN (VALUES ('ORGANIZER','Organizador','ORGANIZADOR'), ('SECRETARY','Secretaria','SECRETARIA'), ('HEALTH','Saúde','SAÚDE')) p(perfil,nome,chave)
ON CONFLICT (organizacao_id, funcao_padrao) DO NOTHING;

UPDATE organizacoes.membros m SET funcao_id = f.funcao_id
FROM organizacoes.funcoes f
WHERE m.funcao_id IS NULL AND f.organizacao_id = m.organizacao_id AND f.funcao_padrao = m.funcao AND f.perfil_acesso = m.funcao;
UPDATE organizacoes.convites c SET funcao_id = f.funcao_id
FROM organizacoes.funcoes f
WHERE c.funcao_id IS NULL AND f.organizacao_id = c.organizacao_id AND f.funcao_padrao = c.funcao AND f.perfil_acesso = c.funcao;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='organizacoes.membros'::regclass AND conname='membros_funcao_organizacao_fk') THEN
        ALTER TABLE organizacoes.membros ADD CONSTRAINT membros_funcao_organizacao_fk
          FOREIGN KEY (funcao_id, organizacao_id) REFERENCES organizacoes.funcoes (funcao_id, organizacao_id) ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='organizacoes.convites'::regclass AND conname='convites_funcao_organizacao_fk') THEN
        ALTER TABLE organizacoes.convites ADD CONSTRAINT convites_funcao_organizacao_fk
          FOREIGN KEY (funcao_id, organizacao_id) REFERENCES organizacoes.funcoes (funcao_id, organizacao_id) ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS membros_organizacao_funcao_idx ON organizacoes.membros (organizacao_id, funcao_id);
CREATE INDEX IF NOT EXISTS convites_organizacao_funcao_idx ON organizacoes.convites (organizacao_id, funcao_id);

-- Novas organizações também recebem as três funções iniciais.
CREATE OR REPLACE FUNCTION organizacoes.criar_funcoes_iniciais() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
    INSERT INTO organizacoes.funcoes (funcao_id, organizacao_id, nome, nome_chave, perfil_acesso, funcao_padrao)
    SELECT md5(NEW.organizacao_id::text || ':funcao:' || p.perfil)::uuid,
           NEW.organizacao_id, p.nome, p.chave,
           p.perfil::organizacoes.funcao_membro, p.perfil::organizacoes.funcao_membro
    FROM (VALUES ('ORGANIZER','Organizador','ORGANIZADOR'), ('SECRETARY','Secretaria','SECRETARIA'), ('HEALTH','Saúde','SAÚDE')) p(perfil,nome,chave)
    ON CONFLICT (organizacao_id, funcao_padrao) DO NOTHING;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS organizacao_funcoes_iniciais ON organizacoes.organizacoes;
CREATE TRIGGER organizacao_funcoes_iniciais AFTER INSERT ON organizacoes.organizacoes
    FOR EACH ROW EXECUTE FUNCTION organizacoes.criar_funcoes_iniciais();

ALTER TABLE organizacoes.funcoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON organizacoes.funcoes FROM PUBLIC;
REVOKE ALL ON FUNCTION organizacoes.criar_funcoes_iniciais() FROM PUBLIC;
DO $$ DECLARE papel TEXT; BEGIN
    FOREACH papel IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=papel) THEN
            EXECUTE format('REVOKE ALL ON organizacoes.funcoes FROM %I', papel);
            EXECUTE format('REVOKE ALL ON FUNCTION organizacoes.criar_funcoes_iniciais() FROM %I', papel);
        END IF;
    END LOOP;
END $$;
COMMENT ON TABLE organizacoes.funcoes IS 'Catálogo por organização. Inativação impede novas atribuições e convites; preserva membros e convites válidos existentes.';
COMMENT ON COLUMN organizacoes.membros.funcao IS 'Perfil efetivo de acesso, mantido em sincronia com a função pela API. Vínculos legados continuam válidos.';
COMMIT;
