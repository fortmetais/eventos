-- Alteração aditiva: executar após as etapas 10 e 11, antes do novo código.
BEGIN;
ALTER TABLE organizacoes.organizacoes ADD COLUMN IF NOT EXISTS chave_miniatura_logotipo TEXT;
ALTER TABLE eventos.eventos ADD COLUMN IF NOT EXISTS chave_miniatura_arte TEXT;
COMMIT;
