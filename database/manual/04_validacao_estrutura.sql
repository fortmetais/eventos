-- VALIDAÇÃO DA ESTRUTURA INICIAL — somente leitura.
-- Execute conectado a eventos_beta no DBeaver.
-- Não cria contas, não altera tabelas e não consulta dados pessoais.

SELECT current_database() AS banco;

-- Esperado: seis linhas, todas com tabela_existe e chave_primaria_ok = true.
-- rls_habilitada deve ser true de acordo com os scripts fornecidos.
WITH esperadas (esquema, tabela, coluna_pk) AS (
    VALUES
        ('acesso', 'contas', 'conta_id'),
        ('organizacoes', 'organizacoes', 'organizacao_id'),
        ('organizacoes', 'membros', 'membro_id'),
        ('organizacoes', 'convites', 'convite_id'),
        ('organizacoes', 'auditoria', 'auditoria_id'),
        ('pessoas', 'pessoas', 'pessoa_id')
)
SELECT e.esquema,
       e.tabela,
       c.oid IS NOT NULL AS tabela_existe,
       EXISTS (
           SELECT 1 FROM pg_constraint k
           WHERE k.conrelid = c.oid
             AND k.contype = 'p'
             AND pg_get_constraintdef(k.oid) = format('PRIMARY KEY (%I)', e.coluna_pk)
       ) AS chave_primaria_ok,
       coalesce(c.relrowsecurity, FALSE) AS rls_habilitada
FROM esperadas e
LEFT JOIN pg_class c ON c.oid = to_regclass(format('%I.%I', e.esquema, e.tabela))
                      AND c.relkind = 'r'
ORDER BY e.esquema, e.tabela;

-- Relações esperadas (7): membros -> contas/organizações;
-- convites -> contas/organizações; auditoria -> contas/organizações;
-- pessoas -> organizações.
SELECT n.nspname AS esquema,
       c.relname AS tabela,
       k.conname AS restricao,
       pg_get_constraintdef(k.oid) AS definicao
FROM pg_constraint k
JOIN pg_class c ON c.oid = k.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('acesso', 'organizacoes', 'pessoas') AND k.contype = 'f'
ORDER BY n.nspname, c.relname, k.conname;

-- Esperado para o enum: ORGANIZER, SECRETARY, HEALTH.
-- Esses são os códigos técnicos usados pela API atual.
SELECT en.enumlabel AS funcao
FROM pg_enum en
JOIN pg_type t ON t.oid = en.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'organizacoes' AND t.typname = 'funcao_membro'
ORDER BY en.enumsortorder;
