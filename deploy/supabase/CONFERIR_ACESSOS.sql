-- Somente leitura. Aplicar SQL 15 antes desta consulta.
SELECT dia,
       sum(visualizacoes) AS visitas,
       sum(cliques_inscricao) AS cliques_inscricao
FROM acesso.visitas_site
GROUP BY dia
ORDER BY dia DESC;

SELECT dia, tela, visualizacoes, cliques_inscricao, atualizado_em
FROM acesso.visitas_site
ORDER BY dia DESC, tela;
