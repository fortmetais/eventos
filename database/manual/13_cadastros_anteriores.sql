-- Somente esta etapa. Não recria cadastros, inscrições ou aceites existentes.
BEGIN;
CREATE TABLE IF NOT EXISTS pessoas.lotes_importacao (
  lote_id uuid PRIMARY KEY,
  organizacao_id uuid NOT NULL REFERENCES organizacoes.organizacoes(organizacao_id),
  hash_arquivo text NOT NULL, nome_arquivo text NOT NULL, aba text NOT NULL,
  mapeamento jsonb NOT NULL, situacao text NOT NULL DEFAULT 'PREVIEW' CHECK (situacao IN ('PREVIEW','CONFIRMED')),
  criado_por uuid NOT NULL REFERENCES acesso.contas(conta_id),
  criado_em timestamptz(3) NOT NULL DEFAULT now(), atualizado_em timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, hash_arquivo, aba), UNIQUE (lote_id, organizacao_id)
);
CREATE TABLE IF NOT EXISTS pessoas.cadastros_anteriores (
  cadastro_id uuid PRIMARY KEY,
  organizacao_id uuid NOT NULL REFERENCES organizacoes.organizacoes(organizacao_id),
  nome text NOT NULL, nome_normalizado text NOT NULL, data_nascimento date NOT NULL,
  telefone text NOT NULL, telefone_normalizado text NOT NULL,
  cidade text, sexo text, camiseta text, respostas_originais jsonb NOT NULL,
  criado_em timestamptz(3) NOT NULL DEFAULT now(), atualizado_em timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, nome_normalizado, data_nascimento, telefone_normalizado),
  UNIQUE (cadastro_id, organizacao_id)
);
CREATE INDEX IF NOT EXISTS cadastros_anteriores_nome_nascimento_idx
  ON pessoas.cadastros_anteriores(organizacao_id, nome_normalizado, data_nascimento);
CREATE TABLE IF NOT EXISTS pessoas.linhas_importacao (
  linha_id uuid PRIMARY KEY, lote_id uuid NOT NULL, organizacao_id uuid NOT NULL,
  numero_linha integer NOT NULL, respostas_originais jsonb NOT NULL, valores jsonb NOT NULL,
  decisao text NOT NULL DEFAULT 'PENDING' CHECK (decisao IN ('KEEP','DISCARD','REPLACE','PENDING')),
  revisada boolean NOT NULL DEFAULT false, substituir_id uuid, cadastro_id uuid,
  FOREIGN KEY (lote_id, organizacao_id) REFERENCES pessoas.lotes_importacao(lote_id, organizacao_id),
  FOREIGN KEY (substituir_id, organizacao_id) REFERENCES pessoas.cadastros_anteriores(cadastro_id, organizacao_id),
  FOREIGN KEY (cadastro_id, organizacao_id) REFERENCES pessoas.cadastros_anteriores(cadastro_id, organizacao_id),
  UNIQUE (lote_id, numero_linha)
);
ALTER TABLE pessoas.lotes_importacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE pessoas.linhas_importacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE pessoas.cadastros_anteriores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pessoas.lotes_importacao, pessoas.linhas_importacao, pessoas.cadastros_anteriores FROM PUBLIC;
DO $$
DECLARE browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      EXECUTE format('REVOKE ALL ON pessoas.lotes_importacao, pessoas.linhas_importacao, pessoas.cadastros_anteriores FROM %I', browser_role);
    END IF;
  END LOOP;
END $$;
COMMIT;
