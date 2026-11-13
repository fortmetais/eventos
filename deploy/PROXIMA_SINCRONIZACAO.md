# Pacotes de sincronização com GitHub e Hostinger

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
