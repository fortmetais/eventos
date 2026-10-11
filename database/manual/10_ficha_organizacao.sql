-- Execute na mesma base que já contém organizacoes.organizacoes.
-- Atualização aditiva e repetível, sem substituir dados já cadastrados.
BEGIN;
ALTER TABLE organizacoes.organizacoes
    ADD COLUMN IF NOT EXISTS cnpj TEXT,
    ADD COLUMN IF NOT EXISTS razao_social TEXT,
    ADD COLUMN IF NOT EXISTS nome_fantasia TEXT,
    ADD COLUMN IF NOT EXISTS cep TEXT,
    ADD COLUMN IF NOT EXISTS logradouro TEXT,
    ADD COLUMN IF NOT EXISTS numero TEXT,
    ADD COLUMN IF NOT EXISTS complemento TEXT,
    ADD COLUMN IF NOT EXISTS bairro TEXT,
    ADD COLUMN IF NOT EXISTS bucket_logotipo TEXT,
    ADD COLUMN IF NOT EXISTS chave_logotipo TEXT;
COMMIT;
