-- Somente leitura: executar na nova conexão PostgreSQL do Supabase.
SELECT current_database() AS banco,
       current_setting('server_version') AS versao,
       to_regclass('auth.users') IS NOT NULL AS auth_encontrado;

-- Para a cópia preparada, esta consulta deve retornar zero linhas.
SELECT nspname AS esquema_existente_da_aplicacao
FROM pg_catalog.pg_namespace
WHERE nspname IN (
    'acesso', 'organizacoes', 'pessoas', 'eventos',
    'inscricoes', 'saude', 'arquivos'
)
ORDER BY nspname;

-- Consulta adicional para detectar tabelas de negócio já presentes.
SELECT table_schema AS esquema, table_name AS tabela
FROM information_schema.tables
WHERE table_schema IN (
    'acesso', 'organizacoes', 'pessoas', 'eventos',
    'inscricoes', 'saude', 'arquivos'
)
  AND table_type = 'BASE TABLE'
ORDER BY table_schema, table_name;
