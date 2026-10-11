# Ficha de intenção para servos

O organizador publica uma ficha para a campanha de servos do evento. O candidato preenche sem criar conta e recebe um protocolo. O envio inicia a avaliação; não concede acesso administrativo nem confirma a participação.

## Ativar no banco gradual

1. No DBeaver, conectado a `eventos_beta`, confira se existem `eventos.tipos_evento`, `eventos.eventos` e `eventos.campanhas`. Se não existirem, execute inteiro, uma única vez, `database/manual/05_eventos_e_periodos.sql`.
2. Execute inteiro, uma única vez, `database/manual/06_fichas_servos_e_inscricoes.sql`. O script usa uma transação e cria nove tabelas adicionais, sem alterar registros anteriores. Se falhar, execute `ROLLBACK` antes de corrigir o problema. Não reexecute scripts que já concluíram.
   Para publicar a ficha com os departamentos do evento, execute depois `database/manual/08_departamentos_e_vagas.sql`. Confira o [guia de departamentos e vagas](departamentos-e-vagas.md). Cadastros antigos precisam ter suas vagas definidas pelo organizador.
3. Na raiz do projeto, execute `npm run db:check`. A verificação é somente leitura. Os seis modelos iniciais, três de eventos e nove da ficha precisam estar disponíveis.
4. Execute `npm run storage:setup` para preparar/verificar o bucket privado `identificacao` no Supabase. As fotos passam pela API, que otimiza para WebP 500 × 500 e emite URLs temporárias mediante autorização. As artes dos eventos continuam em outro bucket.
5. Mantenha `EVENTS_ENABLED=false` e `EVENT_MANAGEMENT_ENABLED=true`. O padrão `VOLUNTEER_REGISTRATIONS_ENABLED=true` libera apenas esta etapa quando suas tabelas estiverem disponíveis. Se alterar o `.env`, reinicie a aplicação. Após criar as tabelas, basta atualizar a página inteira para atualizar a navegação.
6. Inicie com `npm run dev`. Nesta instalação, a interface usa `http://localhost:5174` e a API usa a porta 3086.

Não execute `db:deploy`, `db:migrate`, `db:push` ou a carga demonstrativa no banco gradual. Os scripts SQL são executados por você no DBeaver; a aplicação não os aplica automaticamente.

## Organização das tabelas

| Esquema      | Tabelas novas                                                      |
| ------------ | ------------------------------------------------------------------ |
| `inscricoes` | `versoes_ficha`, `rascunhos`, `inscricoes`, `aceites`, `historico` |
| `saude`      | `rascunhos_saude`, `fichas_saude`                                  |
| `arquivos`   | `arquivos`                                                         |
| `eventos`    | `equipes`                                                          |

As tabelas e colunas seguem o padrão em português do banco existente. O Prisma preserva os nomes internos do código com mapeamentos. As respostas enviadas e versões publicadas têm proteção de imutabilidade no PostgreSQL; publicar alterações cria uma nova versão. Rascunhos existentes permanecem na versão em que foram iniciados.

A configuração inclui **Descrição**, antes de **Regras e requisitos para servir**, tanto na primeira publicação quanto na preparação de nova versão. O campo é opcional, aceita até 5.000 caracteres e preserva quebras de linha na prévia, na abertura da ficha pública e na revisão do candidato. O texto fica em `config.volunteer.description` da versão da ficha; não exige coluna nova nem atualização SQL. Fichas antigas sem descrição continuam funcionando, e versões anteriores mantêm seu texto original.

## Informações aproveitadas do PDF

| Informação do PDF                      | Aplicação                                                           |
| -------------------------------------- | ------------------------------------------------------------------- |
| Nome, sexo e celular                   | Obrigatórios                                                        |
| Idade e nascimento                     | Nascimento obrigatório; idade calculada no início do evento         |
| Cidade                                 | Obrigatória; busca de municípios com sugestões no formato Cidade - UF |
| Já participou/serviu no tipo de evento | Sim/não obrigatório, adaptado ao tipo cadastrado                    |
| Acampamento e edição já realizados     | Texto obrigatório; pode informar que ainda não participou           |
| Formação/cursando na área da saúde     | Texto opcional sobre qualificação profissional                      |
| Cônjuge também inscrito                | Nome opcional                                                       |
| Paróquia frequentada                   | Opcional                                                            |
| Sacramentos                            | Seleção múltipla obrigatória; “nenhum” exclui as outras escolhas    |
| Departamentos de preferência           | De uma a três escolhas; opções obtidas dos departamentos do evento   |
| Camiseta                               | Obrigatória: PP, P, M, G, GG, XG, XGG ou ESP                        |
| Foto                                   | Obrigatória conforme a base comum já definida para a plataforma     |
| Aceite de preparação e regras          | Duas confirmações obrigatórias, associadas à versão da ficha        |

A base comum acrescenta disponibilidade, contato de emergência, informações de saúde, termos e autorização independente de imagem. E-mail é opcional para se candidatar. Para menores de 18 anos no início do evento, exige responsável e autorização.

Na versão local, **Cidade onde mora** apresenta sugestões a partir de duas letras, sem exigir acentos. É possível refinar pelo nome e pela UF, clicar/tocar na opção ou usar as setas e Enter. A resposta selecionada é salva em `payload.answers.cidade`, por exemplo `Loanda - PR`. Rascunhos antigos conservam seu texto; não é necessária atualização SQL. Se a lista não carregar, o campo continua permitindo preenchimento manual e oferece uma nova tentativa.

O catálogo foi obtido da [API de localidades do IBGE](https://servicodados.ibge.gov.br/api/docs/localidades) em 11/10/2026, com 5.571 municípios nas 27 unidades da federação. O arquivo compacto `apps/web/src/data/brazil-cities.json` é carregado somente ao focar o campo e reaproveitado durante a navegação. A pesquisa ocorre no navegador, sem enviar a digitação ao IBGE e sem ocupar tabelas do banco. Para atualizar a lista, execute `node scripts/update-brazil-cities.mjs`; o script valida os dados antes de substituir o arquivo. A publicação segue dependendo de solicitação explícita.

O PDF é uma referência de campos. Suas datas de julho de 2026, prazo de inscrição, taxa de R$ 150, restrição regional, idade acima de 21 anos e programação de encontros não foram transformados em regras universais. Informe os critérios e a preparação do evento na configuração da ficha. Esses textos serão apresentados ao candidato e aceitos explicitamente; idade mínima/região específicas são avaliadas pelo organizador. Cobrança não faz parte desta etapa.

## Roteiro de teste

### Organização e ocultação de campos

Em **Organizar campos da ficha**, cada etapa apresenta campos básicos, perguntas adicionais e perguntas de saúde. Arraste pela alça, use Espaço/setas/Espaço no teclado ou os botões de mover. Escape cancela; no celular, mantenha a alça pressionada por 250 ms antes de arrastar. Fora da alça, a página continua permitindo rolagem. A movimentação fica limitada à etapa atual.

**Ocultar/Mostrar** conserva a posição do item e remove sua exigência na inscrição. Nome, telefone, nascimento, termos gerais e o bloco do responsável não podem ser ocultados; a indicação explica o motivo. Cada pergunta médica inclui sua descrição condicional. A prévia alterna entre **Pessoa adulta** e **Menor de idade**, respeitando a configuração e o bloco exclusivo de menores. Na ficha pública, etapas sem campos aplicáveis são puladas e o progresso se ajusta.

As alterações entram em vigor somente ao publicar uma nova versão. Rascunhos e inscrições anteriores mantêm a versão original. As regras/aceites ocultos não são apresentados nem registrados como aceitos; textos introdutórios e termos permanecem separados. A configuração também está disponível no editor de campistas, respeitando a liberação existente dessa funcionalidade. Não é necessário SQL adicional: o layout está no JSON da versão.

A sincronização foi solicitada em 11/10/2026. A conferência do Supabase encontrou as 41 colunas previstas presentes; o layout usa o JSON existente e não exige SQL adicional.

Verificação desta entrega: **247 testes da API** com PostgreSQL temporário, **123 testes da interface**, tipos e compilação aprovados. O percurso no navegador validou arraste por mouse, teclado, cancelamento, toque prolongado em tela móvel, rolagem fora da alça, isolamento entre etapas, publicação da segunda versão, envio sem campos ocultos, retomada e etapa obrigatória do responsável. Serviços externos foram simulados; aparelhos e armazenamento reais ficam para homologação.

### Percurso básico

1. **Organizador:** aceite o convite e entre na organização. Em **Preparar eventos**, crie ou escolha uma edição com período de servos, por exemplo da data atual até amanhã para este teste.
2. No card do evento, abra **Ficha de servos**. Preencha **Descrição** se desejar apresentar o evento e a proposta de servir. Revise **Regras e requisitos**, **Preparação e formações**, **Departamentos para preferência** e **Termos**. As opções vêm do cadastro do evento. Use **Visualizar campos**.
3. Clique em **Publicar ficha de servos**. A edição passa de rascunho para publicada; o link aparece. O botão público só permite iniciar durante o período de servos e sem pausa. A campanha de campistas permanece indisponível nesta etapa gradual.
4. **Candidato:** abra o link em uma janela privada ou no celular, sem login. Preencha as cinco etapas: identificação, foto, informações pessoais/experiência, saúde/emergência e revisão. Escolha até três departamentos, aceite preparação e regras e envie.
5. Confira o protocolo e a mensagem de que a candidatura depende de análise. A autorização de imagem pode permanecer desmarcada. Uma segunda tentativa de envio do mesmo rascunho devolve a mesma inscrição.
6. **Organizador:** abra **Candidaturas de servos**, filtre pela edição e clique em **Abrir ficha**. Confira foto, respostas, disponibilidade e preferências. As respostas médicas não aparecem nessa consulta.
7. Selecione **Em análise**, registre um motivo e salve. Depois escolha **Aceitar candidatura** ou **Recusar candidatura**, também com motivo. Confira o histórico de decisões. Secretaria pode consultar; nesta etapa, apenas organizador decide.
8. Para concluir a participação de um aceito, selecione o evento, confira as vagas, aloque o candidato aprovado em um departamento e então escolha **Confirmada**. A aprovação sozinha não faz essa confirmação. Com o SQL 07 ativo, o candidato também precisa responder ao aviso de presença.
9. **Período fechado:** pause as inscrições ou aguarde o encerramento enquanto um candidato preenche. O envio deve ser impedido e o rascunho preservado. Retomando o período, pode continuar com a mesma credencial.
10. **Versões e isolamento:** publique uma nova versão e confirme que rascunhos antigos mantêm a anterior. Teste outro organizador de uma segunda paróquia: não pode consultar candidatos, arquivos nem decidir inscrições da primeira.

Dados de saúde exigem autorização explícita por evento na gestão de membros. Ser administrador da plataforma ou organizador não concede esse acesso automaticamente. Não inclua informações médicas nos motivos de análise.

## Verificações automatizadas

- `npm run typecheck` e `npm run build` verificam a aplicação.
- `npm run test:database` cria bancos PostgreSQL temporários e testa os scripts manuais e migrations completas, envio anônimo, validação, isolamento, decisões e imutabilidade. Não utiliza `eventos_beta`.
- Com a aplicação local ligada e após `npm run build`, `npm run test:browser:volunteers` percorre publicação, preenchimento no celular, protocolo e aprovação. Auth/API/Storage são simulados apenas nesse navegador; não envia e-mails nem cria inscrições reais.

A inclusão da busca de cidades passou pelos **113 testes da interface**, pelas verificações de tipos e pela compilação. O roteiro automatizado no navegador verificou a busca sem acentos, seleção com setas/Enter, toque em **Loanda - PR** no celular e envio dessa resposta na inscrição; as chamadas de serviços foram simuladas.

Os testes simulam o serviço externo de fotos. O envio real depende do Supabase configurado e do bucket privado preparado.

## Avisos após a decisão

O próximo script, `database/manual/07_avisos_e_confirmacao_servos.sql`, adiciona o aviso de aceite/recusa e a resposta de presença pelo candidato. Siga o [guia de mensagens e confirmação](avisos-e-presenca.md). Com essa etapa ativa, o aceite cria o link, permite envio por e-mail e prepara WhatsApp; a confirmação final de novos aceites exige a resposta ao aviso e a equipe definida.
