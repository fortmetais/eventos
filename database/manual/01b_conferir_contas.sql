-- CONFERÊNCIA SOMENTE LEITURA — depois da etapa 1 já executada no DBeaver.
-- Conecte-se a eventos_beta e execute este arquivo inteiro como script.
-- Não cria, altera ou apaga tabelas nem consulta e-mails/dados das contas.

SELECT current_database() AS banco,
       current_schema() AS esquema_padrao,
       current_setting('TimeZone') AS fuso_da_conexao;

SELECT column_name AS coluna,
       data_type AS tipo,
       datetime_precision AS precisao_temporal,
       is_nullable AS aceita_nulo,
       column_default AS valor_padrao
FROM information_schema.columns
WHERE table_schema = 'acesso' AND table_name = 'contas'
ORDER BY ordinal_position;

SELECT conname AS restricao,
       pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conrelid = to_regclass('acesso.contas')
ORDER BY conname;

SELECT indexname AS indice, indexdef AS definicao
FROM pg_indexes
WHERE schemaname = 'acesso' AND tablename = 'contas'
ORDER BY indexname;

SELECT n.nspname AS esquema,
       c.relname AS tabela,
       c.relrowsecurity AS rls_habilitada,
       c.relforcerowsecurity AS rls_forcada
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'acesso' AND c.relname = 'contas' AND c.relkind = 'r';
