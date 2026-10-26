-- Contagens agregadas do cartaz, sem identificar visitantes. Pode ser repetido.
-- Aplicar depois do SQL 01, antes de ativar o registro de acessos.
BEGIN;
CREATE TABLE IF NOT EXISTS acesso.visitas_site (
  dia date NOT NULL,
  tela text NOT NULL CHECK (tela IN ('SMALL', 'MEDIUM', 'LARGE')),
  visualizacoes integer NOT NULL DEFAULT 0 CHECK (visualizacoes >= 0),
  cliques_inscricao integer NOT NULL DEFAULT 0 CHECK (cliques_inscricao >= 0),
  atualizado_em timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT visitas_site_pk PRIMARY KEY (dia, tela)
);
ALTER TABLE acesso.visitas_site ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON acesso.visitas_site FROM PUBLIC;
DO $$
DECLARE browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      EXECUTE format('REVOKE ALL ON acesso.visitas_site FROM %I', browser_role);
    END IF;
  END LOOP;
END $$;
COMMENT ON TABLE acesso.visitas_site IS 'Totais diários de visitas e cliques no cartaz por faixa de tela; sem dados pessoais ou identificadores.';
COMMIT;
