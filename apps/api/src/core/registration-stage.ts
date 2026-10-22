import type { PrismaClient } from "@prisma/client";
import { AppError } from "./errors.js";

export class RegistrationStage {
  constructor(private db: PrismaClient) {}
  async ready() {
    const result = await this.db.$queryRaw<{ ready: boolean }[]>`
      SELECT bool_and(to_regclass(nome) IS NOT NULL)
        AND (SELECT count(*) = 4 FROM information_schema.columns
          WHERE table_schema = 'eventos' AND table_name = 'eventos'
          AND column_name IN ('url_personalizada','url_arte_celular','bucket_arte_celular','chave_arte_celular')) AS ready FROM unnest(ARRAY[
        'eventos.eventos','eventos.campanhas','eventos.equipes','inscricoes.versoes_ficha',
        'inscricoes.rascunhos','inscricoes.inscricoes','inscricoes.aceites','inscricoes.historico',
        'saude.rascunhos_saude','saude.fichas_saude','arquivos.arquivos'
      ]) AS tabelas(nome)`;
    return result[0]?.ready === true;
  }
  async requireReady() {
    if (!(await this.ready()))
      throw new AppError(
        503,
        "As fichas de inscrição aguardam a configuração inicial do banco. Após a configuração, atualize esta página.",
        "REGISTRATION_SETUP_REQUIRED",
      );
  }
}
