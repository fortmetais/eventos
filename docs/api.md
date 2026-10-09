# Contratos da API

Prefixo `/api/v1`. Dados JSON. Fotos multipart. Erros: `{ "error": { "code": "...", "message": "...", "fields": {} } }`. Validação usa 422, autenticação 401, falta de permissão 403, recurso fora do escopo 404 e conflito 409.

Autenticação: `Authorization: Bearer <access_token Supabase>`. Inscrições anônimas: `X-Draft-Token: <token do rascunho>`. Credenciais de rascunho nunca vão na URL. Respostas são `Cache-Control: no-store`.

## Plataforma e organização

| Método e caminho                                                  | Permissão                                    |
| ----------------------------------------------------------------- | -------------------------------------------- |
| GET `/config`                                                     | Público; somente URL e chave pública do Auth |
| GET `/me/access`                                                  | Conta; suas organizações ativas              |
| GET/POST `/admin/organizations`                                   | Administrador global                         |
| PUT `/admin/organizations/:organizationId`                        | Administrador global; dados e estado ativo   |
| GET `/organizations/:organizationId/members`                      | Organizador ou administrador global          |
| POST `/organizations/:organizationId/invitations`                 | Organizador ou administrador global          |
| DELETE `/organizations/:organizationId/invitations/:invitationId` | Revogação                                    |
| PATCH `/organizations/:organizationId/members/:memberId`          | Função, suspensão e eventos de saúde         |
| POST `/invitations/:token/accept`                                 | Conta com e-mail confirmado correspondente   |

Organização: `name`, `kind` (PARISH/COMMUNITY/ORGANIZATION), `city`, `state` (UF), `contact`, `logoUrl` HTTPS opcional. Atualização também exige `active`.

Convite: `email`, `role` (ORGANIZER/SECRETARY/HEALTH). Retorna prazo, link de uso único e `delivery` (sent/manual). Falha de SMTP mantém o convite disponível para compartilhamento manual pela tela autorizada. Prazo: sete dias.

Membro: `role`, `active`, `healthEventIds`. O último organizador ativo não pode ser suspenso. Eventos de autorização precisam pertencer à organização.

## Eventos e fichas

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
- POST `/organizations/:organizationId/events/:eventId/teams` — `name`.
- PUT `.../registrations/:registrationId/team` — `teamId`; somente servo aprovado/confirmado, equipe da mesma edição.
- GET `.../registrations/:registrationId/photo` — foto com autorização da organização.
- GET `/organizations/:organizationId/events/:eventId/health` — lista mínima para equipe autorizada.
- GET `.../registrations/:registrationId/health` — informações médicas, autorização explícita por evento e auditoria.
- POST `.../registrations/:registrationId/link` — organizador; `email` da conta verificada existente e `reason` com pelo menos dez caracteres, após comprovação.

Fluxo: RECEIVED → REVIEW → APPROVED → CONFIRMED. REVIEW/APPROVED podem ir para WAITLIST quando habilitada. Recebida/em análise/aprovada/espera podem ser recusadas ou canceladas. Confirmada pode ser cancelada. Recusada e cancelada são finais.

As listagens paginadas retornam `{ items, total, page, pageSize }`. Padrão: 20; máximo: 100. Listagens não exportam saúde. Não há exclusão definitiva de eventos com inscrições.

## Perfil pessoal

- GET/PUT `/me/profile` — nome, telefone, nascimento, cidade e foto próprios; não permite alterar papéis ou e-mail verificado.
- GET `/me/registrations` — somente vínculos dessa conta, sem saúde.
- POST `/me/drafts/:draftId/claim` — token do rascunho e conta autenticada com e-mail correspondente.
- POST `/me/photo` — foto de perfil independente.
- GET `/me/photos/:assetId` e `/me/registrations/:registrationId/photo` — arquivo próprio, URL temporária.

## Monitoramento

GET `/health`: processo. GET `/readiness`: conexão com banco, sem expor configurações privadas. Cadastro, autenticação e armazenamento retornam erro claro quando a infraestrutura necessária ainda não foi configurada. Testes injetam serviços externos somente dentro da suíte.
