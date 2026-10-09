-- Instalações completas e testes. Na base gradual, execute o SQL manual 07.
CREATE TABLE inscricoes.avisos_decisao (
  aviso_id UUID NOT NULL,
  inscricao_id UUID NOT NULL,
  historico_id UUID NOT NULL,
  autor_id UUID NOT NULL,
  tipo TEXT NOT NULL,
  hash_token TEXT NOT NULL,
  expira_em TIMESTAMP(3) NOT NULL,
  presenca_confirmada_em TIMESTAMP(3),
  revogado_em TIMESTAMP(3),
  situacao_email TEXT NOT NULL DEFAULT 'PENDENTE',
  tentativas_email INTEGER NOT NULL DEFAULT 0,
  envio_iniciado_em TIMESTAMP(3),
  email_enviado_em TIMESTAMP(3),
  whatsapp_enviado_em TIMESTAMP(3),
  criado_em TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  atualizado_em TIMESTAMP(3) NOT NULL,
  CONSTRAINT avisos_decisao_pkey PRIMARY KEY (aviso_id),
  CONSTRAINT avisos_decisao_inscricao_id_fkey FOREIGN KEY (inscricao_id) REFERENCES inscricoes.inscricoes(inscricao_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT avisos_decisao_historico_id_fkey FOREIGN KEY (historico_id) REFERENCES inscricoes.historico(historico_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT avisos_decisao_autor_id_fk FOREIGN KEY (autor_id) REFERENCES acesso.contas(conta_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT avisos_decisao_tipo_valido CHECK (tipo IN ('ACEITE','RECUSA')),
  CONSTRAINT avisos_decisao_hash_valido CHECK (hash_token ~ '^[0-9a-f]{64}$'),
  CONSTRAINT avisos_decisao_email_valido CHECK (situacao_email IN ('PENDENTE','EM_ENVIO','ENVIADA','FALHA','SEM_CONFIGURACAO','SEM_EMAIL','INCERTO')),
  CONSTRAINT avisos_decisao_tentativas_validas CHECK (tentativas_email >= 0),
  CONSTRAINT avisos_decisao_resposta_aceite CHECK (presenca_confirmada_em IS NULL OR tipo='ACEITE')
);
CREATE UNIQUE INDEX avisos_decisao_historico_id_key ON inscricoes.avisos_decisao(historico_id);
CREATE UNIQUE INDEX avisos_decisao_hash_token_key ON inscricoes.avisos_decisao(hash_token);
CREATE INDEX avisos_decisao_inscricao_id_criado_em_idx ON inscricoes.avisos_decisao(inscricao_id, criado_em);
CREATE UNIQUE INDEX avisos_decisao_um_ativo_por_inscricao_idx ON inscricoes.avisos_decisao(inscricao_id) WHERE revogado_em IS NULL;
ALTER TABLE inscricoes.avisos_decisao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE inscricoes.avisos_decisao FROM PUBLIC;
DO $$ DECLARE papel TEXT; BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=papel) THEN
      EXECUTE format('REVOKE ALL ON TABLE inscricoes.avisos_decisao FROM %I', papel);
    END IF;
  END LOOP;
END $$;
COMMENT ON TABLE inscricoes.avisos_decisao IS 'Um aviso por decisão; envio, link temporário e confirmação explícita de presença pelo candidato.';
COMMENT ON COLUMN inscricoes.avisos_decisao.hash_token IS 'Hash SHA-256 da credencial. O token não é armazenado em texto puro.';
COMMENT ON COLUMN inscricoes.avisos_decisao.whatsapp_enviado_em IS 'Declaração manual do organizador; abrir o WhatsApp não comprova envio.';
COMMENT ON COLUMN inscricoes.avisos_decisao.presenca_confirmada_em IS 'Resposta do candidato; a confirmação final da inscrição exige equipe e vagas.';
