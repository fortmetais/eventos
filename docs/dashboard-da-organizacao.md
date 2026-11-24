# Dashboard do evento na organização

A página **Visão geral** da organização reúne os indicadores de um evento. O seletor **Evento** permite consultar outras edições; a seleção fica nos parâmetros `evento` e `campaign` da URL.

## Seleção inicial

Sem seleção explícita, o painel considera a data de Brasília e escolhe um evento publicado em andamento. Havendo vários, escolhe o de início mais recente. Em seguida, prioriza o próximo publicado pela data; sem evento atual ou futuro, utiliza o anterior mais recente publicado ou concluído. Rascunhos e cancelados ficam disponíveis para escolha manual.

O filtro **Campanha** aparece apenas quando há mais de uma campanha disponível para consulta. A liberação de servos e campistas segue as regras atuais da aplicação.

## Indicadores

| Indicador         | Regra                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Inscritos         | Todas as inscrições enviadas ou incorporadas, inclusive recusadas e canceladas.           |
| Aceitos           | Situação administrativa `APPROVED`, sem somar `CONFIRMED`.                                |
| Recusados         | Situação administrativa `REJECTED`.                                                       |
| Vagas confirmadas | Situação administrativa `CONFIRMED`.                                                      |
| Vou participar    | Resposta positiva no aviso de aceite não revogado, para candidatura aceita ou confirmada. |

Rascunhos e linhas de importação ainda não incorporadas não entram nos totais. Vencimento do link e conclusão do evento não apagam respostas já registradas. Os números são independentes: **Vou participar** não equivale à confirmação administrativa nem ao check-in no evento.

Cada indicador abre a listagem do mesmo evento e campanha com o filtro correspondente. A navegação começa sem pesquisa, departamento ou paginação anterior. Inscritos e Recusados incluem inscrições encerradas.

## Gráficos clicáveis

**Situação das inscrições** compara os sete estados administrativos em barras horizontais, com quantidade e proporção do total da campanha selecionada. Cada linha abre a listagem no mesmo evento/campanha e na situação correspondente. Total e resposta “Vou participar” permanecem nos indicadores, pois não são situações administrativas exclusivas.

O gráfico de ocupação mostra vagas ocupadas por candidaturas aceitas ou confirmadas, junto das disponíveis. Com servos selecionados, apresenta **Ocupação dos departamentos**; com campistas, **Ocupação das equipes**; em Todos, reúne as equipes e departamentos e identifica o público de cada linha. Indicações em inscrições recebidas, em análise ou em espera não reservam vaga e não entram na ocupação.

A capacidade é separada por público e campanha: departamentos de servos usam os vínculos existentes da campanha de servos, enquanto equipes de campistas pertencem à sua campanha. As barras apresentam somente ocupação e vagas livres do proprietário, sem parcela de outras campanhas. Cada linha abre as inscrições da campanha proprietária, inclusive em Todos, colocando aceitos e confirmados primeiro; a lista também pode conter indicações sem reserva. Nomes iguais em públicos diferentes não unem suas capacidades. Departamentos antigos sem campanha de servos correspondente não aparecem como equipes de campistas.

Departamentos sem capacidade definida exibem essa condição, sem inventar um limite. Capacidade zero, ocupação acima da capacidade e ausência de departamentos são tratados explicitamente. Quando a estrutura ainda não estiver disponível, o gráfico informa indisponibilidade. Valores e rótulos visíveis acompanham as cores, e as linhas funcionam por teclado e toque. Os gráficos ficam lado a lado no computador e empilhados no celular.

## Consulta e atualização

`GET /organizations/:organizationId/events/:eventId/registration-summary` exige autenticação e a mesma permissão de leitura da gestão de inscrições. O perfil Saúde não ganha acesso a esse endpoint.

O retorno contém `eventId`, `generatedAt`, `presenceAvailable`, `totals`, `campaigns`, `departmentsAvailable` e `departments`. Cada resumo contém `total`, `byStatus` com os sete estados e `candidateGoing`. O nome `departments` permanece por compatibilidade e reúne as linhas de equipes/departamentos com `id`, `campaignId`, `kind`, `name`, `capacity`, `occupied`, `available` e `occupiedByCampaign`. O mapa contém somente a campanha proprietária e sua ocupação. A consulta inclui apenas campanhas liberadas, sem somar nem expor a ocupação de outros públicos.

A consulta agrega as inscrições no servidor; não baixa fichas, nomes, fotos, dados de saúde ou tokens. As somas são calculadas na mesma transação, sem depender da paginação nem executar uma consulta individual por departamento.

Se a estrutura de respostas ainda não estiver disponível, `presenceAvailable` é falso e `candidateGoing` é nulo. A interface apresenta **Indisponível**, em vez de uma contagem falsa de zero.

O botão **Atualizar resumo**, o retorno à página e a atualização periódica de 30 segundos mantêm os números atualizados enquanto o painel estiver visível. Trocar de evento não deve exibir os números anteriores durante o carregamento. Falhas são apresentadas com opção de tentar novamente.

O dashboard não cria tabelas de agregados. A separação de equipes de campistas em 24/11/2026 exige a estrutura aditiva da etapa 22 antes da nova API. O resumo usa seus vínculos e os índices/liberações existentes; a estrutura de respostas continua opcional e sua ausência é apresentada como indisponibilidade.

## Verificação

As suítes da API verificam o agregado em banco descartável, permissões, campanhas, estados, respostas vencidas/revogadas e isolamento entre organizações. O percurso `scripts/browser-event-dashboard-check.mjs` utiliza sessão e serviços fictícios para conferir computador e celular, seletores, atalhos, atualização, indisponibilidade e ausência de dados antigos durante uma troca de evento.
