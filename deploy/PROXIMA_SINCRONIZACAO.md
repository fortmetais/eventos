# Pacotes de sincronização com GitHub e Hostinger

## Publicação autorizada em 19/11/2026

O usuário autorizou o envio do estado local validado para `fortmetais/eventos` e `facnsaloanda.com.br`, incluindo a padronização de interface, a refatoração e o acesso temporário abaixo. As restrições anteriores de manter somente local estão substituídas por esta autorização. O SQL 20 deve ser conferido/aplicado antes da atualização da API; preservar o histórico e os dados existentes. O plano de retorno está em [RETORNO_VERSAO_20261119.md](RETORNO_VERSAO_20261119.md). O resultado efetivo do envio e da publicação será registrado após a verificação da Hostinger.

## Membros e convites — liberação individual com senha temporária

**Incluído na publicação autorizada em 19/11/2026.** Conferir o SQL 20 no Supabase antes da API e da interface. Isso não altera a publicação anterior do acesso por senha e troca obrigatória.

Solicitado em 12/11/2026. Inclui ação exclusiva do administrador global para liberar o acesso do destinatário de um convite pendente válido com senha temporária. Exige motivo e reconhecimento explícito da dispensa individual de confirmação do e-mail, encerramento de sessões anteriores e troca obrigatória de senha. As credenciais são exibidas para compartilhamento manual somente no resultado e limpas ao fechar. Não aceita o convite, não cria vínculo organizacional e não envia e-mail. Repetição de solicitação retorna conflito sem revelar novamente a senha. Publicar API e interface juntas; conferir o contrato em `docs/api.md` e executar `scripts/browser-temporary-access-check.mjs` com respostas fictícias antes da sincronização. Nenhuma conta real ou credencial integra os testes ou o repositório.

Na instalação gradual, aplicar somente `database/manual/20_auditoria_acesso_temporario.sql` para acrescentar os detalhes da auditoria (migration equivalente `202611120003_temporary_access_audit`). Preservar os registros existentes; não executar o histórico completo de migrations. Sem nova variável de ambiente. A reserva auditada ocorre antes da alteração no Auth e registra o resultado ou falha parcial sem guardar senhas, impedindo repetição automática.

Verificação local no navegador aprovada em computador e celular com serviços fictícios: ação apenas para administrador global, confirmação explícita, cópia de credenciais, limpeza ao fechar, ausência de senha no armazenamento/URL e resposta de conflito sem repetição automática. Capturas em `.local/screenshots/temporary-access-{desktop,mobile}.png`.

Validação final local: **892 testes passaram** (470 da API e 422 da interface), incluindo concorrência em PostgreSQL isolado; verificação de tipos e compilação aprovadas. Evidências em `.local/temporary-admin-tests-passed.log`, `.local/temporary-admin-types.log` e `.local/temporary-admin-build.log`. Reservas pendentes ou de resultado indeterminado bloqueiam novas alterações para o mesmo e-mail, inclusive a troca pessoal, até conclusão ou revisão. O banco de desenvolvimento local recebeu somente o SQL 20, preservando os registros existentes; evidência em `.local/temporary-admin-local-schema.json`. O Supabase de produção permanece sem esse script, e o pacote continua sem commit ou envio.

## Acesso por senha e troca obrigatória

Solicitado em 12/11/2026. Inclui cadastro com senha e confirmação de e-mail, definição de senha por contas que já acessam por e-mail e retorno ao convite preservado. Contas liberadas individualmente com senha temporária administrativa ficam bloqueadas para o painel e o aceite de convites até definir uma senha pessoal e entrar novamente. A configuração individual não altera a confirmação dos demais usuários.

Publicar API e interface juntas antes de marcar uma conta real com troca obrigatória. Sem nova migration, tabela ou variável de ambiente. O contrato e os limites estão em `docs/api.md`. O teste de navegador é `scripts/browser-password-access-check.mjs` e não cria contas nem envia e-mails reais. Credenciais e operações administrativas individuais ficam fora do repositório.

Validação: 840 testes passaram (439 da API e 401 da interface), verificação de tipos e compilação aprovadas. Cadastro com senha, troca obrigatória e retorno ao convite conferidos no navegador em computador e celular com dados simulados. Evidências locais: `.local/password-access-tests-final.log`, `.local/screenshots/password-*.png` e, após a publicação, `.local/hostinger/password-access-live.json`.

## Membros e convites — copiar link

Solicitado em 12/11/2026 e incluído nesta sincronização. Novos convites permitem copiar o mesmo link enviado por e-mail. Convites anteriores oferecem geração explícita de substituto, com aviso de invalidação do link antigo, preservando o prazo e sem novo envio de e-mail. Convites inativos não oferecem cópia. Se a área de transferência for bloqueada, há exibição explícita para cópia manual.

A API e a interface devem ser publicadas juntas. Não há nova migration ou variável de ambiente: usa o segredo já configurado `REGISTRATION_LINK_SECRET`. A listagem não expõe links nem hashes; a obtenção e a geração são restritas aos gestores autorizados, com auditoria. Consulte `docs/api.md`. O teste no navegador é `scripts/browser-invitation-links-check.mjs`; o resultado publicado fica em `.local/hostinger/invitation-copy-live.json`.

## Mensagens do evento — editor e primeiro nome

Solicitado em 11/11/2026 e incluído nesta sincronização com `fortmetais/eventos` e `facnsaloanda.com.br`. O commit que atualiza este registro contém o pacote completo abaixo, junto dos estilos já presentes no histórico.

- Alinhar o texto da mensagem com a prévia no computador, com apresentação empilhada no celular.
- Colocar os botões de inserção automática abaixo do editor e da prévia.
- Oferecer **Inserir primeiro nome do candidato** (`{{primeiro_nome}}`), mantendo a opção de nome completo (`{{nome}}`).
- Aceitar qualquer uma das duas opções de nome ao salvar e renderizar o primeiro nome na prévia e nas mensagens de WhatsApp/e-mail.

### Arquivos do pacote

- `apps/api/src/modules/registrations/event-messages.service.ts`
- `apps/api/tests/event-message-template.test.ts`
- `apps/api/tests/event-messages.test.ts`
- `apps/web/src/pages/EventMessages.tsx`
- `apps/web/src/pages/EventMessages.test.tsx`
- `apps/web/src/styles.css` — estilos `.message-editor`, `.message-preview-label` e `.message-insertions`; já presentes no histórico local, devem acompanhar a publicação.
- `scripts/browser-event-messages-check.mjs`
- `docs/avisos-e-presenca.md`

### Validação e publicação

A compilação, os 651 testes da suíte e o percurso no navegador em computador/celular passaram em 11/11/2026. Evidência local: `.local/message-layout-tests-final.log` e `.local/screenshots/event-messages-{desktop,mobile}.png` (arquivos ignorados pelo Git).

Publicar a API e a interface juntas. Este pacote não exige novo script SQL ou nova variável de ambiente; usa a estrutura existente das mensagens do evento (SQL 17). Preservar as outras alterações do projeto e revisar o estado do repositório antes do envio.

Confirmar a versão ativa na Hostinger e testar o alinhamento e a opção de primeiro nome após o envio. O resultado da conferência, com commit e data, fica em `.local/hostinger/message-layout-sync-live.json` (evidência local ignorada pelo Git).
