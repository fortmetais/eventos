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
7. Conferir possíveis duplicidades de todo o lote, inclusive respostas já incorporadas. A etapa pode ser aberta também durante a revisão e retomada pela URL. A filtragem ocorre antes da paginação. Cada resposta mostra as linhas relacionadas, nome, nascimento, telefone, protocolo/situação da candidatura e arquivo/aba/linha de origem, com acesso à linha e à candidatura. A justificativa para pessoas distintas continua visível depois da criação. Linhas associadas à mesma candidatura não são contadas como duas pessoas. Ajustes após incorporação seguem a gestão auditada de inscrições.

A correspondência automática atual usa nome normalizado e nascimento, incluindo identidades anteriores registradas nas candidaturas importadas. O telefone é exibido para conferência; a coincidência não comprova que se trata da mesma pessoa. A revisão individual mostra as referências mesmo quando a decisão é **Criar candidatura**, antes da justificativa. A etapa 7 é uma consulta, sem união, exclusão ou cancelamento automático.

Reenvio de arquivo atualizado ou reordenado deve ser comparado com a campanha existente. Número de linha e nome do arquivo não identificam a pessoa. Atualizar exige escolher a candidatura correspondente; aprovação, departamento, conta e alterações posteriores são preservados. O original e as informações de origem permanecem disponíveis no painel autorizado.

Inscrições já enviadas pela ficha da aplicação mantêm suas respostas imutáveis: selecionar uma delas associa a linha importada, sem substituir a ficha. Atualizações de candidaturas importadas exigem a mesma versão de destino. No detalhe da candidatura, o organizador pode corrigir dados básicos e perguntas disponíveis, informando motivo. A edição verifica a última atualização, grava histórico e conserva a primeira evidência da origem; termos, saúde e autorizações não são inventados por esse recurso.

### Padrão dos campos na conferência

As equivalências, a revisão por linha e a correção posterior compartilham os mesmos controles. Cidade usa a pesquisa da inscrição e a escolha grava `Cidade - UF`; a UF não é inferida a partir do nome. Paróquia oferece os cadastros existentes e permite texto livre para locais ainda não cadastrados. Telefone usa máscara com DDD e a API conserva os dígitos; valores originais inválidos longos ficam inteiramente visíveis até correção explícita. Datas e números usam seus tipos próprios. Camiseta e sexo mantêm opções fechadas, e seleções múltiplas usam caixas de seleção, com exclusividade de “nenhum” quando definida na ficha. As preferências históricas de equipes podem continuar acima de três.

Os textos de nomes, edições, formação e cônjuge não são convertidos automaticamente em categorias nem recebem capitalização inferida. A resposta original permanece preservada. A pesquisa de cidades é uma ajuda para conferência, não uma conversão automática de todos os registros antigos: o organizador precisa selecionar a correspondência correta, especialmente nos municípios homônimos.

## Vagas e pendências

A confirmação da importação cria candidaturas **Recebidas**, sem envio de mensagens. A gestão permite analisar, aprovar e alocar nos departamentos, respeitando as vagas. Aprovar/rejeitar explicitamente segue os avisos existentes; ausência de e-mail é informada e não é substituída por contato inventado.

As candidaturas importadas podem ter a **vaga confirmada mesmo com complementação pendente**, mantendo confirmação de presença pelo link ativo, departamento válido e capacidade disponível. O botão de WhatsApp está disponível para aceitos/confirmados com aviso válido, independentemente da origem e das pendências; links expirados precisam de renovação explícita. Aprovar, confirmar ou compartilhar não preenche respostas nem registra aceites que não foram obtidos.

A exclamação antes do nome abre as informações pendentes por clique, toque ou teclado, substituindo o texto repetido na listagem. Para menores importados, a vaga também pode ser confirmada com termo pendente, mas a autorização do responsável continua obrigatória antes do evento e sinalizada no aviso. A confirmação administrativa da vaga não equivale à autorização do responsável. Inscrições nativas mantêm a exigência de assinatura antes da confirmação. A tela de complementação permanece fora desta entrega.

Data/idade da origem servem para conferência. A idade no evento e as proteções atuais de menores continuam sendo verificadas. Respostas sobre formação profissional não são respostas sobre a saúde do participante. Concordâncias antigas do Google Forms não são aceites dos termos atuais. Campos ocultos/excluídos permanecem no original, separados das respostas vigentes.

## Recuperação futura

O novo modo não alimenta a consulta pública de autopreenchimento. A etapa futura de complementação terá link individual com validade padrão de **15 dias**, renovação explícita e invalidação da credencial anterior. O acesso será separado do link de presença; não foi implementado nesta entrega. A complementação deverá manter protocolo, situação, vaga e respostas originais, registrando somente os dados e aceites efetivamente fornecidos. Nome/nascimento não liberarão dados privados nem provocarão vínculo automático com conta. Recuperação e vínculo de conta continuarão exigindo comprovação, sem gerar presença, autorização, aprovação ou medalha.

## Contratos administrativos

Todos os caminhos ficam sob `/api/v1`, exigem sessão e organizador da organização. O prefixo do assistente é `/organizations/:organizationId/participant-imports`.

| Operação                                            | Corpo/resultado                                                                                                                  |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `POST .../inspect`                                  | Multipart `file`; inspeciona abas CSV/XLSX                                                                                       |
| `POST .../event`                                    | Multipart `file`, `campaignId`, `formVersionId`, `sheet` opcional; salva o lote e devolve revisão                                |
| `GET .../:importId?page=&pageSize=`                 | Contexto, catálogo, associações, equivalências, contagens e linhas paginadas                                                     |
| `GET .../:importId?view=duplicates&page=&pageSize=` | Etapa 7, com `duplicateCount`, `filteredTotal`, referências de linhas e origens das candidaturas; disponível em lotes encerrados |
| `PUT .../:importId/settings`                        | `revision`, `mapping`/`rules`/`step`; devolve lote atualizado                                                                    |
| `PUT .../:importId/rows/:rowId`                     | `revision` da linha, `decision`, `overrides`, `replaceId` e `distinctReason` quando aplicáveis                                   |
| `POST .../:importId/review`                         | `revision` do lote e `rowIds`; confirma conferência explícita das linhas sem conflitos                                           |
| `POST .../:importId/confirm`                        | `revision` do lote e `rowIds`; confirmação parcial transacional                                                                  |
| `POST .../:importId/cancel`                         | `revision`; apenas lote não incorporado                                                                                          |

`mapping` contém `{ column, target, confirmed }`; `rules` contém `{ target, from, to }`. Índices de coluna começam em zero. Valores dos destinos `question:<id>` são tipados; preferências usam IDs dos departamentos. `overrides` é um objeto de destinos e valores explícitos. Revisões desatualizadas devolvem 409. `KEEP`, `DISCARD`, `REPLACE` e `PENDING` mantêm os significados de conservar, descartar, atualizar/associar explicitamente e deixar pendente.

`PATCH /organizations/:organizationId/registrations/:registrationId/imported-data` recebe `{ updatedAt, overrides, reason }`, somente para importadas. `GET .../registrations` aceita `origin=IMPORT|PUBLIC_FORM` e `completeness=PENDING|COMPLETE` além dos filtros atuais.

O GET do lote aceita `rowId` para localizar diretamente a página de uma linha desse lote e filtro; não permite consultar linhas de outra organização. O painel de inscrições aceita `inscricao` na URL para abrir o detalhe autorizado da candidatura. A etapa 7 usa `view=duplicates` sem mudar a etapa gravada ou a revisão do lote, dispensando migração.

## Verificação

`npm run test:database` prepara PostgreSQL descartável e ensaia tanto a migration completa quanto o SQL aditivo e sua reaplicação. Os testes usam dados sintéticos; não versionar o CSV real nem respostas pessoais em fixtures. Testar confirmação parcial, reenvio, concorrência, isolamento, diferenças com candidaturas existentes, capacidade e bloqueio de confirmação. A prévia do arquivo real deve ser feita sem confirmar linhas nem enviar mensagens.

Na etapa 7, testar duas linhas coincidentes separadas por mais de 50 respostas, acesso direto à linha, duplicidade com candidatura nativa/importada de outro lote, falta de justificativa bloqueando a confirmação, preservação das referências/justificativas após incorporação, lote encerrado, ausência de coincidências, paginação do filtro e isolamento por organização. No navegador de computador e celular, abrir o resultado, ir à etapa 7, recarregar e consultar uma linha incorporada; conferir links das candidaturas e ausência de nova confirmação.
