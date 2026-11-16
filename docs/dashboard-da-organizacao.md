# Dashboard do evento na organização

A página **Visão geral** da organização reúne os indicadores de um evento. O seletor **Evento** permite consultar outras edições; a seleção fica nos parâmetros `evento` e `campaign` da URL.

## Seleção inicial

Sem seleção explícita, o painel considera a data de Brasília e escolhe um evento publicado em andamento. Havendo vários, escolhe o de início mais recente. Em seguida, prioriza o próximo publicado pela data; sem evento atual ou futuro, utiliza o anterior mais recente publicado ou concluído. Rascunhos e cancelados ficam disponíveis para escolha manual.

O filtro **Campanha** aparece apenas quando há mais de uma campanha disponível para consulta. A liberação de servos e campistas segue as regras atuais da aplicação.

## Indicadores

| Indicador | Regra |
| --- | --- |
| Inscritos | Todas as inscrições enviadas ou incorporadas, inclusive recusadas e canceladas. |
| Aceitos | Situação administrativa `APPROVED`, sem somar `CONFIRMED`. |
| Recusados | Situação administrativa `REJECTED`. |
| Vagas confirmadas | Situação administrativa `CONFIRMED`. |
| Vou participar | Resposta positiva no aviso de aceite não revogado, para candidatura aceita ou confirmada. |

Rascunhos e linhas de importação ainda não incorporadas não entram nos totais. Vencimento do link e conclusão do evento não apagam respostas já registradas. Os números são independentes: **Vou participar** não equivale à confirmação administrativa nem ao check-in no evento.

Cada indicador abre a listagem do mesmo evento e campanha com o filtro correspondente. A navegação começa sem pesquisa, departamento ou paginação anterior. Inscritos e Recusados incluem inscrições encerradas.

## Consulta e atualização

`GET /organizations/:organizationId/events/:eventId/registration-summary` exige autenticação e a mesma permissão de leitura da gestão de inscrições. O perfil Saúde não ganha acesso a esse endpoint.

O retorno contém `eventId`, `generatedAt`, `presenceAvailable`, `totals` e `campaigns`. Cada resumo contém `total`, `byStatus` com os sete estados e `candidateGoing`. A consulta agrega as inscrições no servidor; não baixa fichas, nomes, fotos, dados de saúde ou tokens. As somas são calculadas a partir dos mesmos agrupamentos por campanha, sem depender da paginação.

Se a estrutura de respostas ainda não estiver disponível, `presenceAvailable` é falso e `candidateGoing` é nulo. A interface apresenta **Indisponível**, em vez de uma contagem falsa de zero.

O botão **Atualizar resumo**, o retorno à página e a atualização periódica de 30 segundos mantêm os números atualizados enquanto o painel estiver visível. Trocar de evento não deve exibir os números anteriores durante o carregamento. Falhas são apresentadas com opção de tentar novamente.

Não são necessárias tabelas, colunas ou migrações novas. A implementação usa os índices e as liberações existentes.

## Verificação

As suítes da API verificam o agregado em banco descartável, permissões, campanhas, estados, respostas vencidas/revogadas e isolamento entre organizações. O percurso `scripts/browser-event-dashboard-check.mjs` utiliza sessão e serviços fictícios para conferir computador e celular, seletores, atalhos, atualização, indisponibilidade e ausência de dados antigos durante uma troca de evento.
