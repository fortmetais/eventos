BEGIN;
ALTER TABLE organizacoes.auditoria ADD COLUMN IF NOT EXISTS detalhes JSONB;
CREATE INDEX IF NOT EXISTS auditoria_acesso_temporario_pendente_idx
  ON organizacoes.auditoria (entidade_id)
  WHERE acao = 'TEMPORARY_ACCESS' AND detalhes->>'status' = 'PENDING';
COMMIT;
