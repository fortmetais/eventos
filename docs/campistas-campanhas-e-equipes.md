# Campanhas de campistas e servos

## Organização da gestão

Cada evento tem acessos próprios para Servos e Campistas. A campanha selecionada faz parte da URL e define inscrições, equipes, capacidade e mensagem de aceite. A lista e os cards de participantes continuam usando os controles existentes.

Departamentos de servos permanecem no armazenamento legado. As equipes de campistas usam `eventos.equipes_campistas`, vinculadas à campanha, e `inscricoes.inscricoes.equipe_campista_id`. O contrato de inscrições continua apresentando `teamId` e `team`, normalizados pelo público, sem expor as duas referências internas.

Apenas a organização distribui os campistas. Recebidos, em análise e em espera podem ter indicação sem reserva; aprovados e confirmados alocados ocupam vagas na equipe. Campistas podem confirmar a vaga ou permanecer confirmados sem equipe. A capacidade geral da campanha continua independente e contabiliza confirmações administrativas. A capacidade de cada equipe não pode ser reduzida abaixo da ocupação; equipes com vínculos não podem ser excluídas.

Mensagens de campistas usam `eventos.mensagens_aceite_campistas`, sem substituir os modelos de servos. `{{equipe}}` é opcional, e `{{departamento}}` é aceito como alias no modelo de campistas. Não há envio automático. A espiritualidade configurada anteriormente continua exclusiva dos servos.

## Preparação e abertura pública

Em 24/11/2026, a campanha de campistas do 3º FAC foi pausada por solicitação do usuário. A conferência imediatamente após a pausa encontrou uma inscrição e sete rascunhos, preservados. Não foram alterados formulários publicados, respostas, termos, equipes de servos ou a configuração do cartaz inicial.

Enquanto pausada, a campanha não aceita novos envios. Os rascunhos existentes permanecem armazenados; convites e autorizações de inscrições já recebidas mantêm seus próprios controles. A publicação de uma nova versão da ficha não retoma a campanha. A abertura posterior exige uma ação explícita do organizador, ficha publicada, período válido e os demais requisitos existentes.

## Matriz inicial do Google Forms

Fonte consultada em 24/11/2026: [Inscrição para CAMPISTAS](https://docs.google.com/forms/d/e/1FAIpQLSe3R2cm8qVkqIzQhNlwC7PQH1s92pFVwJ8iMwcisBKeUAAgnA/viewform). Foram observados quinze campos. Esta matriz é documentação para uma futura importação, não um mapeamento validado de colunas de CSV/Excel.

| Campo de origem                            | Tipo observado     | Destino possível               | Conferência ou pendência futura                                                                |
| ------------------------------------------ | ------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Nome completo                              | Texto              | Nome do participante           | Normalizar espaços e preservar original.                                                       |
| Número de celular                          | Texto              | Telefone/WhatsApp              | Validar DDD e quantidade de dígitos, sem inferir números ausentes.                             |
| Rede social e identificador                | Texto              | Informação complementar        | Destino/obrigatoriedade ainda não definidos.                                                   |
| Idade informada                            | Texto              | Conferência histórica          | Comparar com nascimento; não substituir a data nem criar elegibilidade por inferência.         |
| Nascimento                                 | Data               | Data de nascimento             | Conferir valor real exportado e idade na data do evento.                                       |
| Cidade                                     | Texto              | Cidade onde mora               | Relacionar ao catálogo de cidades/UF, com revisão de ambiguidades.                             |
| Paróquia                                   | Texto              | Paróquia informada             | Padronizar opções reconhecidas sem perder preenchimento livre.                                 |
| Nome e telefone de mãe, pai ou responsável | Texto único        | Dados separados do responsável | Não assumir parentesco, vínculo legal ou contato de emergência; revisar a separação.           |
| Alergia e descrição                        | Texto              | Área protegida de saúde        | Separar resposta/descrição com revisão; ausência não significa “Não”.                          |
| Medicação e descrição                      | Texto              | Área protegida de saúde        | Não armazenar conteúdo de saúde no histórico geral acessível aos demais perfis.                |
| Condição de saúde                          | Texto              | Área protegida de saúde        | Preservar a informação, sem diagnóstico ou resposta negativa presumida.                        |
| Camiseta, do 14 ao G4                      | Texto              | Tamanho da camiseta            | G1–G4 já existem; o tamanho 14 precisa de definição própria, sem equivalência automática a PP. |
| Ciência do responsável                     | Escolha única      | Evidência histórica do Forms   | Não representa assinatura ou aceite do termo vigente na aplicação.                             |
| Comprovante de pagamento                   | Arquivo, até 10 MB | Pendente                       | Sem cobrança, upload de comprovantes ou importação automática de arquivos nesta entrega.       |
| Previsão de pagamento e telefone           | Texto longo        | Pendente                       | Preservar contexto; não converter texto em pagamento realizado ou data presumida.              |

O formulário também informa uma faixa etária e um valor de inscrição. Esses textos não alteram as regras da aplicação nesta entrega. O CSV/Excel poderá trazer colunas automáticas, como carimbo de envio e e-mail; sua quantidade e nomes dependem do arquivo real.

Não foi implementada importação de campistas. Não foram alteradas perguntas, termos ou obrigatoriedades da ficha existente, nem criada integração de pagamentos. As definições acima precisarão de revisão quando a exportação estiver disponível.

## Instalação e compatibilidade

Aplicar o SQL aditivo `database/manual/22_gestao_campistas_por_campanha.sql` antes da nova API. A migration Prisma equivalente atende instalações novas e bancos de teste. A instalação gradual do Supabase não deve receber o histórico completo de migrations.

O SQL não move inscrições nem renomeia departamentos existentes. Ele verifica vínculos legados inesperados de campistas e interrompe a instalação caso seja necessária revisão, em vez de reclassificar dados silenciosamente. As novas estruturas têm restrições por campanha/público, índices de relacionamento, RLS e revogação de acesso aos papéis públicos.

Rotas novas por campanha convivem com as antigas rotas de departamentos e mensagens de servos. Fichas publicadas e inscrições mantêm suas versões originais.

## Retorno de código

Preservar as novas estruturas, inscrições, respostas e auditoria. Antes de voltar a `5c0ed05` ou outra versão que desconheça equipes de campistas, suspender a gestão desse público. Na configuração de preparação, verificar `EVENTS_ENABLED=false` e `CAMPER_REGISTRATIONS_ENABLED=false` em conjunto; a flag de campistas isolada não restringe o código antigo se eventos completos estiverem ativos.

Durante o retorno, servos permanecem disponíveis e campistas aguardam uma versão compatível. A estrutura separada impede os antigos formulários de eventos de alterar as novas equipes, mas o código antigo não valida a capacidade dessas equipes nas decisões. Não executar operações administrativas de campistas nesse intervalo. Antes de reabilitar, conferir vínculos, ocupação e liberações pretendidas. O retorno de código não desfaz senhas, respostas ou alterações de cadastro.
