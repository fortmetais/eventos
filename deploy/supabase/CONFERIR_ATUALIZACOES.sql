-- Somente leitura. Execute na conexão do Supabase que contém a aplicação.
-- Pode ser usado antes e depois dos SQLs 10, 11 e 12, sem alterar registros.
-- O SQL 09 já estava na cópia importada: não o execute novamente se as
-- tabelas de autorização já existirem. Esta consulta verifica suas colunas.
-- OK confirma coluna, tipo e nulabilidade; não substitui a execução completa
-- dos SQLs 10/11, que também criam relações, índices e funções iniciais.
WITH esperado (etapa, esquema, tabela, coluna, tipo, aceita_nulo) AS (
    VALUES
    ('09 - autorização já importada', 'inscricoes', 'autorizacoes_responsavel', 'autorizacao_id', 'uuid', 'NO'),
    ('09 - autorização já importada', 'inscricoes', 'autorizacoes_responsavel', 'inscricao_id', 'uuid', 'NO'),
    ('09 - autorização já importada', 'inscricoes', 'autorizacoes_responsavel', 'hash_token', 'text', 'NO'),
    ('09 - autorização já importada', 'inscricoes', 'autorizacoes_responsavel', 'expira_em', 'timestamp', 'NO'),
    ('09 - autorização já importada', 'inscricoes', 'autorizacoes_responsavel', 'texto_termo', 'text', 'NO'),
    ('09 - autorização já importada', 'inscricoes', 'autorizacoes_responsavel', 'identificacao', 'jsonb', 'NO'),
    ('09 - autorização já importada', 'inscricoes', 'autorizacoes_responsavel', 'dados_assinados', 'jsonb', 'YES'),
    ('09 - autorização já importada', 'inscricoes', 'autorizacoes_responsavel', 'assinatura', 'jsonb', 'YES'),
    ('09 - autorização já importada', 'inscricoes', 'autorizacoes_responsavel', 'assinado_em', 'timestamp', 'YES'),
    ('09 - autorização já importada', 'inscricoes', 'autorizacoes_responsavel', 'hash_comprovante', 'text', 'YES'),
    ('09 - autorização já importada', 'inscricoes', 'autorizacoes_responsavel', 'ip', 'text', 'YES'),
    ('09 - autorização já importada', 'inscricoes', 'autorizacoes_responsavel', 'navegador', 'text', 'YES'),
    ('09 - autorização já importada', 'inscricoes', 'autorizacoes_responsavel', 'situacao_email', 'text', 'NO'),
    ('09 - autorização já importada', 'inscricoes', 'autorizacoes_responsavel', 'envio_iniciado_em', 'timestamp', 'YES'),
    ('09 - autorização já importada', 'inscricoes', 'autorizacoes_responsavel', 'criado_em', 'timestamp', 'NO'),
    ('09 - autorização já importada', 'saude', 'termos_responsavel', 'autorizacao_id', 'uuid', 'NO'),
    ('09 - autorização já importada', 'saude', 'termos_responsavel', 'respostas', 'jsonb', 'NO'),
    ('10 - ficha da organização', 'organizacoes', 'organizacoes', 'cnpj', 'text', 'YES'),
    ('10 - ficha da organização', 'organizacoes', 'organizacoes', 'razao_social', 'text', 'YES'),
    ('10 - ficha da organização', 'organizacoes', 'organizacoes', 'nome_fantasia', 'text', 'YES'),
    ('10 - ficha da organização', 'organizacoes', 'organizacoes', 'cep', 'text', 'YES'),
    ('10 - ficha da organização', 'organizacoes', 'organizacoes', 'logradouro', 'text', 'YES'),
    ('10 - ficha da organização', 'organizacoes', 'organizacoes', 'numero', 'text', 'YES'),
    ('10 - ficha da organização', 'organizacoes', 'organizacoes', 'complemento', 'text', 'YES'),
    ('10 - ficha da organização', 'organizacoes', 'organizacoes', 'bairro', 'text', 'YES'),
    ('10 - ficha da organização', 'organizacoes', 'organizacoes', 'bucket_logotipo', 'text', 'YES'),
    ('10 - ficha da organização', 'organizacoes', 'organizacoes', 'chave_logotipo', 'text', 'YES'),
    ('11 - funções da organização', 'organizacoes', 'funcoes', 'funcao_id', 'uuid', 'NO'),
    ('11 - funções da organização', 'organizacoes', 'funcoes', 'organizacao_id', 'uuid', 'NO'),
    ('11 - funções da organização', 'organizacoes', 'funcoes', 'nome', 'text', 'NO'),
    ('11 - funções da organização', 'organizacoes', 'funcoes', 'nome_chave', 'text', 'NO'),
    ('11 - funções da organização', 'organizacoes', 'funcoes', 'descricao', 'text', 'YES'),
    ('11 - funções da organização', 'organizacoes', 'funcoes', 'perfil_acesso', 'funcao_membro', 'NO'),
    ('11 - funções da organização', 'organizacoes', 'funcoes', 'funcao_padrao', 'funcao_membro', 'YES'),
    ('11 - funções da organização', 'organizacoes', 'funcoes', 'ativo', 'bool', 'NO'),
    ('11 - funções da organização', 'organizacoes', 'funcoes', 'criado_em', 'timestamp', 'NO'),
    ('11 - funções da organização', 'organizacoes', 'funcoes', 'atualizado_em', 'timestamp', 'NO'),
    ('11 - funções da organização', 'organizacoes', 'membros', 'funcao_id', 'uuid', 'YES'),
    ('11 - funções da organização', 'organizacoes', 'convites', 'funcao_id', 'uuid', 'YES'),
    ('12 - miniaturas', 'organizacoes', 'organizacoes', 'chave_miniatura_logotipo', 'text', 'YES'),
    ('12 - miniaturas', 'eventos', 'eventos', 'chave_miniatura_arte', 'text', 'YES')
)
SELECT current_database() AS banco,
       e.etapa,
       e.esquema,
       e.tabela,
       e.coluna,
       e.tipo AS tipo_esperado,
       c.udt_name AS tipo_encontrado,
       CASE
           WHEN c.column_name IS NULL THEN 'FALTANDO'
           WHEN c.udt_name <> e.tipo
             OR (e.tipo = 'funcao_membro' AND c.udt_schema <> 'organizacoes')
             THEN 'TIPO DIVERGENTE'
           WHEN c.is_nullable <> e.aceita_nulo THEN 'NULABILIDADE DIVERGENTE'
           WHEN e.tipo = 'timestamp' AND c.datetime_precision <> 3
             THEN 'PRECISÃO DIVERGENTE'
           ELSE 'OK'
       END AS situacao
FROM esperado e
LEFT JOIN information_schema.columns c
    ON c.table_schema = e.esquema
   AND c.table_name = e.tabela
   AND c.column_name = e.coluna
ORDER BY e.etapa, e.esquema, e.tabela, e.coluna;
