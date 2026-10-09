ALTER TABLE eventos.equipes ADD COLUMN vagas INTEGER;
ALTER TABLE eventos.equipes ADD CONSTRAINT equipes_vagas_check
  CHECK (vagas IS NULL OR vagas BETWEEN 0 AND 100000);
CREATE UNIQUE INDEX equipes_evento_nome_normalizado_idx ON eventos.equipes
  (evento_id, upper(regexp_replace(btrim(nome), '\s+', ' ', 'g')));
