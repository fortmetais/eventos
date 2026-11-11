CREATE TABLE eventos.mensagens_aceite (
  evento_id uuid PRIMARY KEY REFERENCES eventos.eventos(evento_id),
  conteudo text CHECK (conteudo IS NULL OR char_length(conteudo) BETWEEN 20 AND 5000),
  revisao integer NOT NULL DEFAULT 0 CHECK (revisao >= 0),
  atualizado_por uuid NOT NULL REFERENCES acesso.contas(conta_id),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE eventos.mensagens_aceite ENABLE ROW LEVEL SECURITY;
