# Banners e endereço do evento

Em **Minha organização → Eventos → Editar evento**, o organizador pode enviar dois banners e escolher um endereço público, por exemplo `3-fac-2027`. O mesmo editor aparece no cadastro de uma nova edição e na gestão completa de eventos.

## Imagens

- Computador: recomendado **1920 × 640 pixels**, horizontal.
- Celular: recomendado **768 × 960 pixels**, vertical; opcional.
- JPEG, PNG ou WebP estático, até **10 MB por arquivo**, origem de até 40 megapixels.

O servidor preserva a proporção e todo o conteúdo. Gera WebP dentro de 1920 × 1920 (qualidade 88) para computador e 960 × 1280 (qualidade 84) para celular, sem ampliar imagens pequenas. A miniatura para listas continua em até 320 × 570. Os arquivos ficam no bucket público de artes; o PostgreSQL guarda somente referências.

A página `/eventos/:endereco` usa `<picture>`: até 767 pixels, carrega o banner de celular; nas demais larguras, carrega o de computador. Sem banner de celular, usa a imagem de computador. O editor permite remover o banner de celular ou desfazer essa decisão antes de salvar. A troca só remove imagens anteriores depois de confirmar o evento; em caso de falha, mantém os dados e remove os novos arquivos, registrando limpeza pendente se o Storage falhar. Banners versionados das fichas de inscrição permanecem independentes.

## Endereço compartilhável

O campo **Endereço personalizado do evento (opcional)** aceita de 3 a 80 letras, números e hífens. Espaços viram hífens, letras viram minúsculas e acentos são removidos. Barras, símbolos de URL, hífens duplicados e endereços no formato UUID são recusados. O endereço é exclusivo em toda a aplicação: um conflito retorna 409 e preserva o formulário para correção.

A página pública aceita o endereço personalizado e o UUID original; os links gerados na aplicação preferem o endereço personalizado. O UUID continua funcionando após alterar ou remover o endereço. Ao alterar o endereço personalizado, o endereço personalizado anterior deixa de funcionar. A prévia do link aparece no editor; o evento só fica público no estado publicado ou realizado, com organização ativa.

## Banco e publicação

Atualização do Supabase aplicada em **22/10/2026**, após autorização para sincronizar o banco, o GitHub e a Hostinger. As 45 colunas da conferência de atualizações, o índice e as restrições foram validados; o evento existente foi preservado. Em outras bases graduais/Supabase, aplicar inteiro `database/manual/14_banners_e_url_evento.sql`, depois da etapa 05, antes de implantar o código. É uma atualização aditiva e repetível da tabela existente `eventos.eventos`:

| Coluna nova           | Uso                                                                    |
| --------------------- | ---------------------------------------------------------------------- |
| `url_personalizada`   | Endereço público opcional, com índice exclusivo e validação de formato |
| `url_arte_celular`    | URL permanente do banner de celular                                    |
| `bucket_arte_celular` | Bucket público do arquivo                                              |
| `chave_arte_celular`  | Chave do arquivo                                                       |

Não há tabelas novas. A imagem atual é mantida como banner de computador. Eventos existentes começam com as quatro colunas nulas. As três referências do celular devem ser todas preenchidas ou todas nulas. A conferência de atualizações do Supabase inclui essas colunas. Para instalações completas novas e bancos isolados, a migração equivalente é `202610220001_event_presentation`; não aplicar todo o histórico Prisma na base importada manualmente.

POST/PUT de eventos completos continuam aceitando JSON, com `slug` opcional e `removeMobileArtwork` booleano. Com arquivos, usar multipart `data` com o mesmo JSON, `artwork` e/ou `mobileArtwork`. No fluxo gradual, `slug` fica dentro de `event`; `removeMobileArtwork` fica na raiz. Somente organizadores ativos podem alterar. O cliente não pode definir bucket/chave internos.

## Conferência

1. Editar evento publicado, enviar os dois banners, salvar e recarregar. Conferir desktop e celular sem cortes e sem transbordamento.
2. Salvar sem arquivos: imagens anteriores permanecem. Remover apenas o banner de celular e conferir a alternativa de computador.
3. Escolher `3-fac-2027`, salvar e abrir o link novo e o UUID antigo. Outro evento não pode repetir o endereço, inclusive em outra organização.
4. Remover ou alterar o endereço: UUID continua disponível. Evento em preparação, cancelado ou de organização inativa permanece indisponível publicamente.
5. Testar arquivo inválido, falha de gravação e conflito de endereço: nenhum evento parcial ou nova referência deve ser salvo; imagens anteriores permanecem.
6. Secretaria e outra organização não podem alterar. Datas com inscrições, períodos e fichas continuam sujeitos às regras existentes.

`npm run test:database` cobre API, banco temporário, otimização, conflitos simultâneos, limpeza e interface. `npm run test:browser:events` verifica o formulário e a imagem efetivamente selecionada pelo navegador em computador e celular, com serviços simulados, sem alterar dados reais.

Verificação local em 22/10/2026: 289 testes da API com bancos PostgreSQL temporários aprovados, incluindo migrações completas e SQL gradual repetido; 194 testes da interface aprovados; verificações de tipos, compilação e inicialização para Hostinger aprovadas. Percurso no Chrome com serviços simulados aprovado em 1366 e 390 pixels, confirmando `currentSrc` de cada banner e ausência de transbordamento. As verificações de produção são realizadas separadamente, após a publicação autorizada.
