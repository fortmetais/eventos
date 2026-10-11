-- Somente o banco temporário de testes, antes do SQL 11.
INSERT INTO acesso.contas (conta_id,email) VALUES
('10000000-0000-4000-8000-000000000001','legacy-organizer@example.test'),
('10000000-0000-4000-8000-000000000002','legacy-health@example.test');
INSERT INTO organizacoes.organizacoes (organizacao_id,nome,cidade,uf,contato)
VALUES ('20000000-0000-4000-8000-000000000001','Organização legada de teste','Loanda','PR','Teste');
INSERT INTO organizacoes.membros (membro_id,organizacao_id,conta_id,funcao,ativo,eventos_saude_ids) VALUES
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','ORGANIZER',true,ARRAY[]::text[]),
('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','HEALTH',false,ARRAY['evento-legado']::text[]);
INSERT INTO organizacoes.convites (convite_id,organizacao_id,email,funcao,hash_token,expira_em,criado_por)
VALUES ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','legacy-invite@example.test','SECRETARY',repeat('a',64),CURRENT_TIMESTAMP+interval '7 days','10000000-0000-4000-8000-000000000001');
