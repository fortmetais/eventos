# Importação guiada de candidaturas de servos

Na organização, **Cadastros anteriores → Candidaturas de um evento** abre o assistente de CSV/Excel. O modo **Cadastros anteriores para autopreenchimento** continua independente: não cria inscrições e não recebe automaticamente os candidatos do novo modo.

## Instalação

Aplicar `database/manual/16_importacao_candidaturas.sql` depois das etapas 06 e 13, antes de publicar o novo código. É uma atualização aditiva e repetível: mantém os lotes antigos como HISTORY e as inscrições existentes como PUBLIC_FORM. Não executar o histórico completo de migrations Prisma na instalação gradual do Supabase. A migration equivalente atende bancos novos e testes descartáveis. Conferir os novos campos com `deploy/supabase/CONFERIR_ATUALIZACOES.sql`.

O código permite rascunho nulo somente na origem IMPORT, mantendo as candidaturas importadas na tabela de inscrições existente. O lote informa campanha e versão de destino; a linha registra a candidatura gerada ou a atualização explicitamente aprovada. Não são criados conta, foto, ficha de saúde ou aceite artificial.

## Assistente

1. Escolher evento/campanha de servos e versão da ficha. Enviar CSV ou XLSX de até 10 MB, 100 colunas e 5.000 respostas. O conteúdo lido fica salvo para retomada. A abertura pública da campanha não limita a importação administrativa; eventos cancelados/concluídos não aceitam incorporações.
2. Associar todas as colunas. Sugestões exigem conferência; informações sem destino compatível podem ser preservadas somente no histórico. A versão de destino não é uma declaração de que o candidato viu essa ficha na origem.
3. Conferir equivalências. Conversões em lote são explícitas e não substituem correções individuais. Não inventar DDD, cidade, ano de nascimento ou resposta negativa. As preferências antigas reconhecidas são preservadas mesmo acima de três; novas inscrições públicas mantêm o limite atual.
4. Conferir linhas, respostas originais, possíveis duplicidades e candidaturas existentes. Identidade inválida impede incorporação; informações complementares incompletas ficam como pendências. Nome/nascimento/telefone localizam correspondências, sem comprovar titularidade de conta.
5. Confirmar as linhas prontas escolhidas. A operação é transacional e repetível; o restante continua em revisão. Linhas incorporadas ficam congeladas. Uma edição simultânea exige recarregar a versão atual, evitando sobrescrita silenciosa.
6. Acessar o resultado e a gestão de inscrições. Cancelamento de lote não incorporado não remove cadastros. Depois da incorporação, usar as ações auditadas de candidatura, sem exclusão automática do lote.

Reenvio de arquivo atualizado ou reordenado deve ser comparado com a campanha existente. Número de linha e nome do arquivo não identificam a pessoa. Atualizar exige escolher a candidatura correspondente; aprovação, departamento, conta e alterações posteriores são preservados. O original e as informações de origem permanecem disponíveis no painel autorizado.

Inscrições já enviadas pela ficha da aplicação mantêm suas respostas imutáveis: selecionar uma delas associa a linha importada, sem substituir a ficha. Atualizações de candidaturas importadas exigem a mesma versão de destino. No detalhe da candidatura, o organizador pode corrigir dados básicos e perguntas disponíveis, informando motivo. A edição verifica a última atualização, grava histórico e conserva a primeira evidência da origem; termos, saúde e autorizações não são inventados por esse recurso.

## Vagas e pendências

A confirmação da importação cria candidaturas **Recebidas**, sem envio de mensagens. A gestão permite analisar, aprovar e alocar nos departamentos, respeitando as vagas. Aprovar/rejeitar explicitamente segue os avisos existentes; ausência de e-mail é informada e não é substituída por contato inventado.

As candidaturas importadas têm origem e pendências identificadas na lista e no detalhe. A confirmação final exige complementação e aceite efetivo, além das regras de presença e autorização aplicáveis. A primeira entrega não inclui a tela de complementação: as reservas podem ser feitas e a confirmação permanece bloqueada enquanto faltarem os requisitos.

Data/idade da origem servem para conferência. A idade no evento e as proteções atuais de menores continuam sendo verificadas. Respostas sobre formação profissional não são respostas sobre a saúde do participante. Concordâncias antigas do Google Forms não são aceites dos termos atuais. Campos ocultos/excluídos permanecem no original, separados das respostas vigentes.

## Recuperação futura

O novo modo não alimenta a consulta pública de autopreenchimento. A segunda entrega terá comprovação por link específico de uso único ou revisão documentada, vínculo à conta e complementação da mesma candidatura. Nome/nascimento não liberarão dados privados. O vínculo deverá manter protocolo, situação e vaga; não confirmará presença, autorização, aprovação ou medalha.

## Contratos administrativos

Todos os caminhos ficam sob `/api/v1`, exigem sessão e organizador da organização. O prefixo do assistente é `/organizations/:organizationId/participant-imports`.

| Operação                            | Corpo/resultado                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `POST .../inspect`                  | Multipart `file`; inspeciona abas CSV/XLSX                                                        |
| `POST .../event`                    | Multipart `file`, `campaignId`, `formVersionId`, `sheet` opcional; salva o lote e devolve revisão |
| `GET .../:importId?page=&pageSize=` | Contexto, catálogo, associações, equivalências, contagens e linhas paginadas                      |
| `PUT .../:importId/settings`        | `revision`, `mapping`/`rules`/`step`; devolve lote atualizado                                     |
| `PUT .../:importId/rows/:rowId`     | `revision` da linha, `decision`, `overrides`, `replaceId` e `distinctReason` quando aplicáveis    |
| `POST .../:importId/review`         | `revision` do lote e `rowIds`; confirma conferência explícita das linhas sem conflitos            |
| `POST .../:importId/confirm`        | `revision` do lote e `rowIds`; confirmação parcial transacional                                   |
| `POST .../:importId/cancel`         | `revision`; apenas lote não incorporado                                                           |

`mapping` contém `{ column, target, confirmed }`; `rules` contém `{ target, from, to }`. Índices de coluna começam em zero. Valores dos destinos `question:<id>` são tipados; preferências usam IDs dos departamentos. `overrides` é um objeto de destinos e valores explícitos. Revisões desatualizadas devolvem 409. `KEEP`, `DISCARD`, `REPLACE` e `PENDING` mantêm os significados de conservar, descartar, atualizar/associar explicitamente e deixar pendente.

`PATCH /organizations/:organizationId/registrations/:registrationId/imported-data` recebe `{ updatedAt, overrides, reason }`, somente para importadas. `GET .../registrations` aceita `origin=IMPORT|PUBLIC_FORM` e `completeness=PENDING|COMPLETE` além dos filtros atuais.

## Verificação

`npm run test:database` prepara PostgreSQL descartável e ensaia tanto a migration completa quanto o SQL aditivo e sua reaplicação. Os testes usam dados sintéticos; não versionar o CSV real nem respostas pessoais em fixtures. Testar confirmação parcial, reenvio, concorrência, isolamento, diferenças com candidaturas existentes, capacidade e bloqueio de confirmação. A prévia do arquivo real deve ser feita sem confirmar linhas nem enviar mensagens.
