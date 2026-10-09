-- Conecte ao eventos_beta e execute este arquivo inteiro no DBeaver.
-- Requer os scripts 05 e 06. Não depende do script 07 de avisos.
-- Departamentos reutilizam eventos.equipes e inscricoes.inscricoes.equipe_id.
-- Nenhum cadastro, ficha, resposta ou vínculo existente é removido.
BEGIN;

ALTER TABLE eventos.equipes ADD COLUMN vagas INTEGER;
ALTER TABLE eventos.equipes ADD CONSTRAINT equipes_vagas_check
  CHECK (vagas IS NULL OR vagas BETWEEN 0 AND 100000);

-- Nomes diferentes por evento, ignorando maiúsculas e espaços repetidos.
-- Caso existam nomes duplicados antigos, a transação falha sem alterar a base.
-- Faça ROLLBACK, confira os duplicados e corrija-os antes de repetir o script.
CREATE UNIQUE INDEX equipes_evento_nome_normalizado_idx ON eventos.equipes
  (evento_id, upper(regexp_replace(btrim(nome), '\s+', ' ', 'g')));

COMMENT ON TABLE eventos.equipes IS
  'Departamentos de trabalho do evento, utilizados na alocação de servos.';
COMMENT ON COLUMN eventos.equipes.vagas IS
  'Capacidade total do departamento. Aprovados alocados e confirmados ocupam vagas; NULL identifica cadastro antigo ainda não configurado; zero fecha novas alocações.';

-- Cadastros antigos permanecem com vagas NULL: a quantidade real será
-- preenchida pelo organizador na tela de candidaturas. Não inventar limites.
COMMIT;

-- Conferência opcional, sem dados pessoais:
SELECT e.nome AS evento, d.nome AS departamento, d.vagas
FROM eventos.equipes d
JOIN eventos.eventos e ON e.evento_id = d.evento_id
ORDER BY e.nome, d.nome;
