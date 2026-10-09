-- ETAPA 0 — somente para um PostgreSQL próprio, fora do Supabase.
-- No DBeaver, conecte-se ao banco "postgres" e ative o auto-commit.
-- Execute este comando isoladamente, fora de BEGIN/COMMIT.
-- Depois abra uma NOVA conexão apontando para eventos_beta.
-- No Supabase, use o banco existente do projeto e pule este arquivo.
-- Não é necessário criar um banco separado para cada paróquia.

CREATE DATABASE eventos_beta
    WITH ENCODING = 'UTF8'
    TEMPLATE = template0;
