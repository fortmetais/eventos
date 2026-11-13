-- Correções administrativas auditadas, sem alterar as evidências dos envios.
-- Execute inteiro. Pode ser reaplicado; não depende da etapa 20.
BEGIN;
ALTER TABLE organizacoes.auditoria ADD COLUMN IF NOT EXISTS detalhes JSONB;
DO $migration$
BEGIN
  IF to_regclass('inscricoes.inscricoes') IS NOT NULL
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='inscricoes' AND table_name='inscricoes' AND column_name='origem') THEN
    EXECUTE $definition$
      CREATE OR REPLACE FUNCTION inscricoes.proteger_respostas_inscricao() RETURNS trigger LANGUAGE plpgsql AS $guard$
      DECLARE
        correction_id TEXT := current_setting('fac.registration_correction', true);
        audited BOOLEAN := false;
      BEGIN
        IF correction_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          SELECT EXISTS (
            SELECT 1 FROM organizacoes.auditoria a
            JOIN eventos.campanhas c ON c.campanha_id=OLD.campanha_id
            JOIN eventos.eventos e ON e.evento_id=c.evento_id
            WHERE a.auditoria_id=correction_id::uuid
              AND a.acao='REGISTRATION_DATA_CORRECTED'
              AND a.entidade_id=OLD.inscricao_id::text
              AND a.organizacao_id=e.organizacao_id
              AND a.detalhes->>'actorId'=a.autor_id::text
              AND length(btrim(a.detalhes->>'reason')) >= 3
              AND a.detalhes #> '{before,snapshot}' = OLD.respostas
              AND a.detalhes #> '{after,snapshot}' = NEW.respostas
              AND a.detalhes #>> '{before,personId}' = OLD.pessoa_id::text
              AND a.detalhes #>> '{after,personId}' = NEW.pessoa_id::text
              AND a.detalhes #> '{before,importData}' = coalesce(OLD.dados_importacao, 'null'::jsonb)
              AND a.detalhes #> '{after,importData}' = coalesce(NEW.dados_importacao, 'null'::jsonb)
              AND EXISTS (SELECT 1 FROM pessoas.pessoas p WHERE p.pessoa_id=NEW.pessoa_id AND p.organizacao_id=e.organizacao_id)
          ) INTO audited;
        END IF;
        IF NEW.versao_ficha_id IS DISTINCT FROM OLD.versao_ficha_id OR
           NEW.campanha_id IS DISTINCT FROM OLD.campanha_id OR
           NEW.rascunho_id IS DISTINCT FROM OLD.rascunho_id OR
           NEW.origem IS DISTINCT FROM OLD.origem OR
           (NEW.pessoa_id IS DISTINCT FROM OLD.pessoa_id AND NOT audited) THEN
          RAISE EXCEPTION 'A identidade e a origem da inscrição são imutáveis fora da correção auditada.';
        END IF;
        IF audited THEN
          IF NEW.respostas->'email' IS DISTINCT FROM OLD.respostas->'email' THEN
            RAISE EXCEPTION 'O e-mail original comprova o envio; corrija somente o e-mail de contato.';
          END IF;
          IF NEW.protocolo IS DISTINCT FROM OLD.protocolo OR
             NEW.situacao IS DISTINCT FROM OLD.situacao OR
             NEW.equipe_id IS DISTINCT FROM OLD.equipe_id OR
             NEW.conta_id IS DISTINCT FROM OLD.conta_id THEN
            RAISE EXCEPTION 'Uma correção não altera protocolo, decisão, vaga ou vínculo de conta.';
          END IF;
          IF OLD.origem='IMPORT' THEN
            IF NEW.dados_importacao->'source' IS DISTINCT FROM OLD.dados_importacao->'source' OR
               NEW.dados_importacao->'original' IS DISTINCT FROM OLD.dados_importacao->'original' OR
               NEW.dados_importacao->'baseline' IS DISTINCT FROM OLD.dados_importacao->'baseline' THEN
              RAISE EXCEPTION 'A evidência original e a base da importação são imutáveis na correção.';
            END IF;
          ELSIF NEW.dados_importacao IS DISTINCT FROM OLD.dados_importacao THEN
            RAISE EXCEPTION 'Uma ficha nativa não pode receber uma origem de importação na correção.';
          END IF;
        END IF;
        IF NEW.respostas IS DISTINCT FROM OLD.respostas OR NEW.dados_importacao IS DISTINCT FROM OLD.dados_importacao THEN
          IF NOT audited THEN
            IF OLD.origem <> 'IMPORT' OR current_setting('fac.import_correction', true) IS DISTINCT FROM 'on' THEN
              RAISE EXCEPTION 'As respostas enviadas e sua origem são imutáveis fora da correção auditada.';
            END IF;
            IF NEW.dados_importacao->'source' IS DISTINCT FROM OLD.dados_importacao->'source' OR
               NEW.dados_importacao->'original' IS DISTINCT FROM OLD.dados_importacao->'original' THEN
              RAISE EXCEPTION 'A evidência original da importação é imutável.';
            END IF;
          END IF;
        END IF;
        RETURN NEW;
      END;
      $guard$;
    $definition$;
  END IF;
END;
$migration$;
COMMIT;
