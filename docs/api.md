# Contratos da API

Prefixo `/api/v1`. Dados JSON. Fotos multipart. Erros: `{ "error": { "code": "...", "message": "...", "fields": {} } }`. Validação usa 422, autenticação 401, falta de permissão 403, recurso fora do escopo 404 e conflito 409.

Histórico do cartaz: `POST /public/site-visits` recebe exclusivamente `event` (`view` ou `registration_click`) e `screen` (`SMALL`, `MEDIUM`, `LARGE`), da origem configurada. Mantém totais diários no servidor, sem dados pessoais. Requer SQL 15 e `SITE_VISIT_TRACKING_ENABLED=true`. Ver [histórico de acessos](historico-acessos-site.md) para limites, comportamento em falhas e consulta restrita dos totais.

Autenticação: `Authorization: Bearer <access_token Supabase>`. Inscrições anônimas: `X-Draft-Token: <token do rascunho>`. Credenciais de rascunho nunca vão na URL. Respostas são `Cache-Control: no-store`.

Com `TEMPORARY_SITE=true` e `APPLICATION_TEST_ACCESS=true`, o cartaz permanece na raiz e os caminhos `/eventos`, `/inscricao/:campaignId`, `/resposta/:noticeId` e `/autorizacao/:authorizationId` usam React. A API `/api/v1/public/*` é encaminhada para os serviços e preserva validação, períodos, tokens e limites de requisições. A documentação `/api/v1/openapi` continua bloqueada nesse modo. Com `APPLICATION_TEST_ACCESS=false`, o modo temporário isolado continua bloqueando a API de negócio. A liberação está incluída nesta atualização.

## Plataforma e organização

Criação de versão em POST `/organizations/:organizationId/campaigns/:campaignId/forms` e publicação de servos em POST `/organizations/:organizationId/events/:eventId/volunteer-form` aceitam JSON como antes ou multipart com `data` (JSON da configuração) e `banner` (arquivo opcional). Banner JPEG/PNG/WebP até 10 MB, horizontal 2:1–6:1, sem animação e no máximo 40 milhões de pixels de origem. O arquivo é convertido em WebP e o servidor grava `config.banner={url,bucket,key,width,height}`. Para reaproveitar, envie o objeto já salvo em uma versão do mesmo evento; referências externas/adulteradas são rejeitadas. `banner:null` remove apenas da nova versão. Somente organizadores podem enviar, antes do processamento do arquivo. Em falha de publicação, o upload novo é removido; arquivos de versões anteriores permanecem preservados.

GET `/public/parishes` retorna somente `{ id, name, city, state }` das organizações ativas de tipo `PARISH`, ordenadas por nome. É público e limitado a 120 requisições por minuto. Não retorna contatos, CNPJ, endereço completo, membros nem convites. O campo **Qual paróquia frequenta?** carrega a lista ao focar e filtra no navegador, sem consulta por letra; a inscrição continua salvando uma resposta textual, selecionada ou livre. Não cria organizações e não requer SQL adicional.

| Método e caminho                                                  | Permissão                                                  |
| ----------------------------------------------------------------- | ---------------------------------------------------------- |
| GET `/config`                                                     | Público; somente URL e chave pública do Auth               |
| GET `/me/access`                                                  | Conta; suas organizações ativas                            |
| GET/POST `/admin/organizations`                                   | Administrador global                                       |
| PUT `/admin/organizations/:organizationId`                        | Administrador global; dados e estado ativo                 |
| PUT `/organizations/:organizationId`                              | Organizador ativo da própria organização; dados e logotipo |
| GET `/organizations/:organizationId/members`                      | Organizador ou administrador global                        |
| POST `/organizations/:organizationId/invitations`                 | Organizador ou administrador global                        |
| DELETE `/organizations/:organizationId/invitations/:invitationId` | Revogação                                                  |
| PATCH `/organizations/:organizationId/members/:memberId`          | Função, suspensão e eventos de saúde                       |
| POST `/invitations/:token/accept`                                 | Conta com e-mail confirmado correspondente                 |

Organização: `name`, `kind` (PARISH/COMMUNITY/ORGANIZATION), `city`, `state` (UF), `contact`. A atualização administrativa em `/admin/organizations/:organizationId` também exige `active`. A atualização pelo organizador em `/organizations/:organizationId` rejeita esse campo e preserva o estado ativo. Dados complementares opcionais: `cnpj`, `legalName` (razão social), `tradeName` (nome fantasia), `postalCode` (CEP), `street` (logradouro), `number`, `complement` e `neighborhood` (bairro). CNPJ numérico ou alfanumérico é validado pelos dígitos verificadores e salvo sem pontuação; CEP é salvo com oito dígitos. Campos opcionais vazios são salvos como `null`; campos omitidos na edição são preservados.

Em **Minha Organização → Visão geral → Informações da organização → Editar informações**, organizadores ativos editam a ficha e o logotipo. O vínculo é verificado antes do upload e novamente na transação que salva os dados. Secretaria, Saúde, membros suspensos e organizadores de outra organização não podem editar. Atualizações são registradas na auditoria com a ação `ORGANIZATION_UPDATED`. Após salvar, a interface atualiza os dados da organização no acesso e na barra lateral.

Para cadastrar ou editar com logotipo, envie `multipart/form-data`: `data` contém o JSON acima e `logo` contém um arquivo JPEG, PNG ou WebP estático de até 10 MB. Sem arquivo, JSON continua aceito. A interface usa envio de arquivo; `logoUrl` permanece na resposta e no contrato legado HTTPS. As imagens são convertidas para WebP, com até 800 × 800 pixels, sem corte, mantendo proporção e transparência, no armazenamento público de artes separado das fotos privadas. Cadastro e logotipo são confirmados juntos: falha de envio não grava os novos dados; falha de gravação remove a nova imagem; a substituição só remove a imagem anterior após salvar. Edição sem arquivo mantém o logotipo existente. Bucket/chave internos não podem ser enviados pelo cliente.

Para bases existentes, aplique `database/manual/10_ficha_organizacao.sql` antes de executar a versão com esses campos. O script é aditivo e repetível. A migração equivalente está em `202610100001_organization_details`; não é necessário recriar organizações.

Convite: `email`, `functionId` de uma função ativa desta organização. Retorna prazo, link de uso único e `delivery` (sent/manual). Falha de SMTP mantém o convite disponível para compartilhamento manual pela tela autorizada. Prazo: sete dias. O contrato legado aceita `role` (ORGANIZER/SECRETARY/HEALTH) no lugar de `functionId` e o resolve para uma função ativa do mesmo perfil; enviar os dois é recusado.

Membro: `functionId`, `active`, `healthEventIds`. O perfil efetivo `role` vem da função selecionada. O contrato legado aceita `role` no lugar do ID. O último organizador ativo não pode ser suspenso ou rebaixado. Eventos de autorização precisam pertencer à organização. Listas e acesso incluem `functionId` e `function` (nome, perfil e disponibilidade), preservando `role` para autorização.

## Funções por organização

GET/POST `/organizations/:organizationId/functions` lista/cadastra funções. PUT `.../functions/:functionId` atualiza e DELETE inativa, sem exclusão física. Somente organizador ativo da organização ou administrador global pode gerenciar o catálogo. Cadastro e edição recebem `name`, `description` opcional, `role` (perfil ORGANIZER/SECRETARY/HEALTH) e `active` (padrão true). Nomes são normalizados por espaços e Unicode e não se repetem na mesma organização.

Alterar o perfil atualiza, na mesma transação, todos os membros vinculados (inclusive suspensos) e os convites pendentes ainda válidos. Convites aceitos, revogados e expirados mantêm o perfil histórico. Ao mudar o perfil, as autorizações individuais de saúde são limpas e devem ser concedidas explicitamente por evento. Uma função inativa não pode receber novos vínculos ou convites; os membros existentes continuam com seu acesso, o vínculo atual pode ser mantido ao editar o membro e os convites válidos anteriores continuam aceitando. O aceite usa o perfil atual da função.

A alteração de função, o convite, o aceite, a revogação e a edição de membro compartilham o bloqueio da organização e revalidam o acesso de gestão na transação. Isso protege o último organizador e a consistência do perfil em operações simultâneas. GET `.../members` também retorna `functions` para os seletores. GET `.../functions` inclui contagens de membros e convites pendentes válidos.

Em bases graduais, aplique `database/manual/11_funcoes_organizacao.sql` antes desta versão. A atualização é aditiva e repetível, cria Organizador, Secretaria e Saúde por organização e associa os vínculos e convites antigos sem mudar seus perfis, suspensão ou autorizações. Novas organizações recebem esses padrões automaticamente. A migração equivalente é `202610100002_organization_functions`. A versão local foi preparada; produção e Hostinger aguardam solicitação do usuário.

## Eventos e fichas

Os detalhes públicos aceitam UUID ou `slug` em `/public/events/:eventId`. Edições incluem `slug` opcional e `mobileImageUrl`. Cadastro e edição aceitam multipart `data` e arquivos `artwork` (computador) e `mobileArtwork` (celular), ou o JSON anterior sem arquivos. `removeMobileArtwork:true` remove somente o banner do celular; não pode acompanhar um novo arquivo de celular. No fluxo gradual, `slug` fica dentro de `event` e a opção de remoção na raiz. Consulte [banners e endereço do evento](banners-e-endereco-evento.md) para regras e atualização aditiva do banco.

| Método e caminho                                                                  | Uso                                                  |
| --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| GET `/public/events?q=&city=&organizationId=&page=&pageSize=`                     | Vitrine de edições com campanhas abertas             |
| GET `/public/events/:eventId`                                                     | Detalhes publicados                                  |
| GET `/public/campaigns/:campaignId`                                               | Campanha e ficha publicada mais recente              |
| GET/POST `/organizations/:organizationId/events`                                  | Listar / cadastrar edição                            |
| PUT `/organizations/:organizationId/events/:eventId`                              | Editar dados; datas preservadas quando há inscrições |
| PATCH `/organizations/:organizationId/events/:eventId/status`                     | DRAFT/PUBLISHED/CANCELLED/COMPLETED                  |
| PUT `/organizations/:organizationId/events/:eventId/campaigns`                    | Criar/atualizar campanha por tipo                    |
| POST `/organizations/:organizationId/campaigns/:campaignId/forms`                 | Criar versão em rascunho                             |
| POST `/organizations/:organizationId/campaigns/:campaignId/forms/:formId/publish` | Publicar versão                                      |

Edição: `typeName`, `name`, `description`, `imageUrl` HTTPS opcional, `location`, `city`, `startsAt`, `endsAt`. Datas do evento: `YYYY-MM-DD`.

No modo gradual (`EVENTS_ENABLED=false`), o organizador edita o evento publicado por PUT `/organizations/:organizationId/event-setups/:eventId/details`, com JSON `{ event }` ou multipart `data` e `artwork` opcional. A rota preserva estado, períodos, departamentos, fichas e candidatos; não aceita esses campos no corpo. A imagem é otimizada pelas mesmas regras do cadastro e mantida quando não há arquivo novo. Datas do evento ficam protegidas quando há inscrições, com verificação e bloqueio das campanhas na transação. GET `/organizations/:organizationId/event-setups` inclui `hasRegistrations` para a interface apresentar essa restrição. O formulário completo de preparação continua limitado a eventos DRAFT.

Campanha: `kind` (CAMPER/VOLUNTEER), `opensAt`, `closesAt` (ISO com offset), `paused`, `capacity`, `allowWaitlist`. Campistas exigem capacidade positiva. Intervalo inclui abertura e exclui encerramento. Datas são armazenadas como instantes; a interface mostra America/Sao_Paulo.

Ficha: `askCpf`, `askAddress`, `askShirt`, `terms`, `questions`. Pergunta: `id`, `label`, `type` (text/number/date/boolean/single/multiple), `required`, `options`. IDs e opções precisam ser únicos. Até 30 perguntas. Base de foto, saúde, emergência e responsável não pode ser removida.

## Inscrição pública

1. POST `/public/campaigns/:campaignId/drafts` retorna `id`, `token`, `expiresAt`.
2. GET `/public/drafts/:draftId` retoma pelo header de credencial. Retorna ficha da versão original, `payload` e `health` separados.
3. PUT `/public/drafts/:draftId` salva `{ payload, health }`.
4. POST `/public/drafts/:draftId/photo`: multipart com `photo` e `crop` JSON opcional (`left`, `top`, `size` normalizados). Retorna ID do arquivo e URL temporária.
5. GET `/public/drafts/:draftId/photos/:assetId` reemite URL somente para o arquivo do rascunho.
6. POST `/public/drafts/:draftId/submit` valida e retorna `id`, `protocol`, `status`. Reenvio retorna a mesma inscrição.

`payload`: identificação, telefone, nascimento, e-mail opcional, CPF/endereço/camiseta habilitados, `photoAssetId`, emergência, responsável, disponibilidade/preferência para servo, termos, autorização de imagem e `answers` por ID de pergunta.

`health`: pares `hasAllergies/allergies`, `hasMedication/medication`, `hasDiet/diet`, `hasCondition/condition`, `hasNeeds/needs`. Flags são obrigatórias no envio; detalhes são obrigatórios quando Sim.

O navegador guarda somente a credencial do rascunho. Token expira em 14 dias. Depois do envio, o GET retorna a confirmação, sem repetir saúde. `DUPLICATE_REGISTRATION` não revela IDs nem dados do registro anterior. Não existe consulta pública por CPF, telefone ou protocolo.

## Organização e análise

- GET `/organizations/:organizationId/registrations?eventId=&campaignId=&status=&page=&pageSize=`.
- GET `/organizations/:organizationId/registrations/:registrationId` — ficha comum e histórico, sem saúde.
- PATCH `.../:registrationId/status` — `status` e `reason` obrigatório.
- POST `/organizations/:organizationId/events/:eventId/teams` — `name` e `capacity`; organizador.
- PUT `/organizations/:organizationId/events/:eventId/teams/:teamId` — `capacity`; organizador, respeitando vagas ocupadas.
- DELETE `/organizations/:organizationId/events/:eventId/teams/:teamId` — organizador ativo da própria organização; exclui departamento e vagas sem participantes vinculados e sem preferência em fichas publicadas. Bloqueia eventos concluídos/cancelados e registra `DEPARTMENT_DELETED`; retorna `{ deleted: true }`.
- PUT `.../registrations/:registrationId/team` — `teamId`; somente servo aprovado/confirmado, equipe da mesma edição.
- GET `.../registrations/:registrationId/photo` — foto com autorização da organização.
- GET `/organizations/:organizationId/events/:eventId/health` — lista mínima para equipe autorizada.
- GET `.../registrations/:registrationId/health` — informações médicas, autorização explícita por evento e auditoria.
- POST `.../registrations/:registrationId/link` — organizador; `email` da conta verificada existente e `reason` com pelo menos dez caracteres, após comprovação.

Fluxo: RECEIVED → REVIEW → APPROVED → CONFIRMED. REVIEW/APPROVED podem ir para WAITLIST quando habilitada. Recebida/em análise/aprovada/espera podem ser recusadas ou canceladas. Confirmada pode ser cancelada. Recusada e cancelada são finais.

As listagens paginadas retornam `{ items, total, page, pageSize }`. Padrão: 20; máximo: 100. Listagens não exportam saúde. Não há exclusão definitiva de eventos com inscrições.

## Ordem e visibilidade das fichas

Os endpoints existentes de criação e publicação de ficha aceitam `FormConfig.layout` opcional no JSON da versão. Não há endpoint separado de ordenação nem nova tabela/coluna. Estrutura: `{ version: 1, kind: "VOLUNTEER" | "CAMPER", steps: [{ step, fields: [{ key, hidden }] }] }`.

As cinco etapas são `identification`, `photo`, `about`, `care` e `review`. Cada campo consta exatamente uma vez na sua etapa original, inclusive quando oculto. Chaves básicas usam `base:` (por exemplo `base:name` e `base:photoAssetId`); perguntas adicionais usam `question:<id>`; saúde usa `health:<flag>`, incluindo a descrição condicional no mesmo item. O catálogo compartilhado fica em `apps/form-layout`.

A API rejeita campos desconhecidos, repetidos, ausentes, transferências entre etapas, tipo de campanha incompatível e ocultação de nome, telefone, nascimento, termos ou responsável. CPF/endereço/camiseta derivam sua visibilidade do layout; `askCpf`, `askAddress` e `askShirt` são sincronizados ao salvar. A publicação de servos conserva departamentos, capacidades, identificadores e regras originais das perguntas, mesmo ocultas.

Rascunhos e envios usam a versão vinculada originalmente. Nas versões com layout, dados de campos ocultos são descartados antes da persistência e não são exigidos; foto oculta também impede upload nesse rascunho. Saúde omitida permanece ausente (`Não perguntado` na consulta). O consentimento de imagem continua falso se não houve autorização explícita. O termo independente do responsável pode completar emergência, medicamentos e alergias e preserva esses dados na consulta de saúde. Fichas sem layout conservam o percurso anterior.

## Perfil pessoal

- GET/PUT `/me/profile` — nome, telefone, nascimento, cidade e foto próprios; não permite alterar papéis ou e-mail verificado.
- GET `/me/registrations` — somente vínculos dessa conta, sem saúde.
- POST `/me/drafts/:draftId/claim` — token do rascunho e conta autenticada com e-mail correspondente.
- POST `/me/photo` — foto de perfil independente.
- GET `/me/photos/:assetId` e `/me/registrations/:registrationId/photo` — arquivo próprio, URL temporária.

## Monitoramento

GET `/health`: processo. GET `/readiness`: conexão com banco, sem expor configurações privadas. Cadastro, autenticação e armazenamento retornam erro claro quando a infraestrutura necessária ainda não foi configurada. Testes injetam serviços externos somente dentro da suíte.
