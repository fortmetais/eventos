# Avisos de aceite, recusa e confirmação de presença

Ao aceitar uma candidatura de servo, a aplicação registra a decisão e cria um aviso com link pessoal. Quando o candidato informou e-mail e o SMTP da API está configurado, tenta enviar o aviso automaticamente. O painel também oferece **Abrir mensagem no WhatsApp**, com destinatário, texto e link preenchidos.

O candidato abre o link e clica em **Confirmar minha presença**, sem obrigação de criar conta. Abrir o link não confirma automaticamente, inclusive quando um serviço de e-mail gera uma prévia. A confirmação final da inscrição permanece com o organizador, depois da resposta do candidato e da alocação em equipe. As regras de vagas continuam aplicadas.

## Ativar a estrutura gradual

1. Conectado a `eventos_beta` no DBeaver, execute uma única vez `database/manual/07_avisos_e_confirmacao_servos.sql`, depois de concluir o SQL 06. O novo script cria somente `inscricoes.avisos_decisao`. Não altera fichas nem inscrições antigas. Se houver erro, faça `ROLLBACK` antes de corrigir.
2. O segredo `REGISTRATION_LINK_SECRET` já foi preparado no `.env` privado local. Em outros ambientes, gere um segredo aleatório de pelo menos 32 caracteres, exclusivo do servidor, e mantenha-o estável e protegido. Ele não deve entrar no React nem ser compartilhado. Links possuem prazo, e apenas o hash da credencial é armazenado no banco.
3. Para e-mails reais, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `SMTP_FROM` em `apps/api/.env`. Este SMTP é o da API, separado do SMTP do Supabase Auth. Sem ele, a decisão continua salva e o painel indica que o envio está indisponível; o WhatsApp permanece como alternativa.
4. Para candidatos acessarem de outro computador ou celular, `WEB_URL` deve ser um endereço acessível a eles. `localhost` funciona apenas na própria máquina. Na publicação, use o domínio HTTPS da aplicação e ajuste também os redirecionamentos do Auth/origem da interface.
5. Reinicie depois de alterar variáveis do `.env`, atualize a página e execute `npm run db:check` para conferir o mapeamento. Não execute migrations completas na instalação manual existente.

A tabela guarda decisão de origem, autoria, prazo/revogação do link, tentativas/resultado do e-mail, declaração de envio pelo WhatsApp e data da resposta do candidato. Há um aviso ativo por inscrição. A criação do aviso e o histórico da decisão ficam na mesma transação.

## Textos e canais

**Aceite:** “Sua candidatura para servir no [evento] foi aceita!” seguido de organização, data e link de confirmação. O aviso informa que a organização finalizará a equipe e a participação.

Quando o servo já está alocado, o texto de aceite inclui **Departamento alocado: [nome do departamento]** e informa que a organização finalizará a confirmação da participação. Usa somente a alocação efetiva, sem confundir preferências com departamento. O painel atualiza a mensagem ao salvar uma troca de departamento. Sem alocação, mantém o texto de equipe a definir. A recusa e os avisos de campistas mantêm seus textos próprios.

WhatsApp e e-mail utilizam o mesmo texto. A mensagem preparada considera a alocação atual; mensagens já enviadas permanecem com o conteúdo do momento do envio. Alocar ou trocar um departamento não envia mensagens automaticamente nem renova o link ou declara envio de WhatsApp. Confira a mensagem no painel após alocar e antes de abrir a conversa.

**Recusa:** “Não foi dessa vez!” seguido de agradecimento pela disponibilidade e convite acolhedor para uma próxima oportunidade. O link abre o resultado, sem botão de confirmar presença. O motivo interno da decisão, contatos de emergência e dados de saúde não são enviados na mensagem.

No WhatsApp, o organizador precisa enviar a mensagem na conversa e depois clicar em **Marcar como enviado pelo WhatsApp**. Abrir a conversa sozinho não marca envio. Esse registro é uma declaração do organizador, não uma confirmação de entrega/leitura do WhatsApp. Não é necessária integração com WhatsApp Business para esta opção.

As mensagens de WhatsApp/e-mail e o botão **Copiar link** usam `/r#<código>` no domínio da aplicação. O código compacto transporta o UUID e a credencial completa de 256 bits em 64 caracteres; não trunca o segredo, não usa encurtador externo e não exige coluna nova. O fragmento não é enviado ao servidor; o navegador o remove, guarda a credencial na sessão da aba e abre a página de resposta. Abrir continua sendo somente consulta: a confirmação depende do botão explícito. Expiração, renovação, revogação e isolamento seguem as mesmas verificações. Links antigos `/resposta/:id#token=...` continuam funcionando e o campo `link` da API permanece compatível; `shortLink` fornece o novo endereço.

E-mail **Enviado** indica aceitação pelo servidor SMTP; não comprova entrega ou leitura pelo destinatário. Falhas ficam visíveis e permitem uma nova tentativa. Repetir uma solicitação já enviada não envia outra mensagem. Envios com resultado incerto após interrupção podem exigir nova tentativa manual; SMTP não oferece garantia de entrega exatamente uma vez.

## Roteiro de teste

### Personalização por evento

Em **Minha organização → Mensagens**, escolha o evento e edite o aceite de servos. Também há acesso no cartão do evento. Os botões inserem informações automáticas no cursor e a prévia usa uma pessoa fictícia. Salvar exige `{{nome}}`, `{{evento}}`, um único `{{link}}` e `{{validade}}`. Os campos opcionais são `{{organizacao}}`, `{{data_evento}}` e `{{departamento}}`; sem alocação, este último informa “A definir pela organização”. Não há execução de expressões, HTML ou fórmulas. O conteúdo é texto simples.

Aplicar somente `database/manual/17_mensagens_aceite.sql` na instalação gradual (depois de acesso e eventos). A tabela `eventos.mensagens_aceite` guarda o modelo por evento, revisão e autoria, com RLS e sem acesso direto pelas funções públicas do Supabase. O SQL é aditivo e reaplicável. Há migration equivalente para instalações novas; não executar todas as migrations na produção gradual. O script `deploy/supabase/CONFERIR_ATUALIZACOES.sql` confere os campos. Sem a tabela, o envio usa o texto padrão e a edição informa a atualização pendente.

Somente organizadores podem consultar ou salvar o modelo. `GET/PUT /api/v1/organizations/:organizationId/events/:eventId/accept-message` devolve/recebe a revisão; o PUT aceita `{ revision, template }`, com `template: null` restaurando o padrão. Escritas concorrentes com revisão antiga devolvem 409. Cada salvamento é auditado. Não há alteração de fichas, candidaturas, links, validade ou presença. Salvar não dispara envio; a mensagem personalizada vale para as próximas consultas/compartilhamentos e envios do aceite de servos desse evento. Recusas e campistas mantêm seus textos atuais.

Testar inclusão de informações no cursor, prévia, salvar, restaurar padrão, revisão desatualizada, isolamento entre eventos/organizações, exigência de informações essenciais e fluxo sem migração. Conferir no WhatsApp e e-mail simulados se nome/departamento/link/validade são os do candidato. Usar `scripts/browser-event-messages-check.mjs` para o percurso no computador e celular, incluindo a abertura do link compacto e confirmação explícita. Nenhum envio real é realizado nos testes.

1. Com um candidato fictício e contato de teste, passe a candidatura de **Recebida** para **Em análise** e depois para **Aceitar candidatura**. Confira o aviso, link e situação do e-mail na ficha.
2. Clique em **Abrir mensagem no WhatsApp** e confira destinatário, nome do evento e link. O painel deve continuar sem registrar envio até você clicar na ação de declaração. Durante testes, envie somente a um número controlado por você.
3. Abra o link em janela privada. Antes de clicar em confirmar, atualize o painel: a presença deve continuar pendente. Clique em **Confirmar minha presença** e atualize novamente: o painel deve registrar a resposta.
4. Clique/reenvie a mesma confirmação: deve preservar a primeira resposta. Aloque o candidato aprovado em uma equipe e confirme a inscrição no painel. Sem resposta ao aviso ativo, a confirmação final deve ser impedida.
5. Use outra candidatura para **Recusar candidatura**. Confira a mensagem “Não foi dessa vez!” tanto no texto preparado para WhatsApp quanto no e-mail de teste. O link deve mostrar a recusa e não oferecer confirmação.
6. Recuse ou cancele uma candidatura antes aprovada: o link de aceite anterior deve ficar indisponível. Teste outra paróquia e um membro suspenso: não podem acessar nem enviar esses avisos.
7. Simule falha no SMTP: a decisão deve ficar salva, com envio pendente/falha. Após corrigir a configuração, use **Enviar por e-mail**. Abrir/recarregar a ficha não envia novamente.
8. Para link expirado, use **Renovar link** e compartilhe o novo. A credencial anterior deixa de funcionar. O aceite vence em até sete dias, limitado ao início do evento no horário de Brasília; a recusa tem sete dias. Uma resposta já confirmada é preservada.

**Inscrições antigas:** decisões feitas antes da ativação desta tabela não ganham aviso retroativamente. Elas preservam a confirmação manual já existente. Novos aceites que possuem aviso ativo exigem a resposta do candidato antes da confirmação final.

## Validação automatizada

`npm run test:database` aplica os scripts em bases temporárias e testa geração/envio, ausência de e-mail, falhas, reenvios simultâneos, links, recusas, expiração e isolamento. Mensagens usam um provedor simulado, sem enviar e-mails reais. `npm run test:browser:volunteers` testa também WhatsApp preparado, confirmação explícita no celular e página de recusa, com a aplicação local ligada e após `npm run build`.
