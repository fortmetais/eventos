CREATE TABLE inscricoes.autorizacoes_responsavel (
  autorizacao_id UUID PRIMARY KEY,
  inscricao_id UUID NOT NULL UNIQUE REFERENCES inscricoes.inscricoes(inscricao_id),
  hash_token TEXT NOT NULL UNIQUE,
  expira_em TIMESTAMP(3) NOT NULL,
  texto_termo TEXT NOT NULL,
  identificacao JSONB NOT NULL,
  dados_assinados JSONB,
  assinatura JSONB,
  assinado_em TIMESTAMP(3),
  hash_comprovante TEXT,
  ip TEXT,
  navegador TEXT,
  situacao_email TEXT NOT NULL DEFAULT 'PENDENTE',
  envio_iniciado_em TIMESTAMP(3),
  criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT autorizacao_assinatura_check CHECK (
    (assinado_em IS NULL AND assinatura IS NULL AND dados_assinados IS NULL AND hash_comprovante IS NULL)
    OR (assinado_em IS NOT NULL AND assinatura IS NOT NULL AND dados_assinados IS NOT NULL AND hash_comprovante IS NOT NULL)
  )
);
CREATE TABLE saude.termos_responsavel (
  autorizacao_id UUID PRIMARY KEY REFERENCES inscricoes.autorizacoes_responsavel(autorizacao_id),
  respostas JSONB NOT NULL
);
ALTER TABLE inscricoes.autorizacoes_responsavel ENABLE ROW LEVEL SECURITY;
ALTER TABLE saude.termos_responsavel ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inscricoes.autorizacoes_responsavel, saude.termos_responsavel FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON inscricoes.autorizacoes_responsavel, saude.termos_responsavel FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON inscricoes.autorizacoes_responsavel, saude.termos_responsavel FROM authenticated;
  END IF;
END $$;
