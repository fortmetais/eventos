# Autorização do responsável por menores

A ficha identifica menoridade na data do preenchimento (horário de Brasília) ou no início do evento. O contato do responsável é solicitado na etapa Saúde e emergência. Ao enviar, a inscrição é recebida e um termo separado fica pendente; marcar um aceite na ficha não autoriza o menor.

O responsável abre `/autorizacao/:id#token=...` sem login, confere o participante, informa cidade, CPF, contato familiar, medicamentos e alergias, preenche sua identificação, aceita o termo e desenha a assinatura com dedo, mouse ou caneta. A imagem/voz tem autorização opcional. A inscrição só pode passar para Confirmada depois da assinatura; aprovação e análise continuam disponíveis.

**Celular do contato com DDD** e **Celular do responsável com DDD** usam a máscara `(00) 00000-0000`, incluindo telefone fixo e colagem com código `55`. Os CPFs do participante e do responsável usam `000.000.000-00`; o do participante permanece opcional e a API conserva a verificação dos dígitos. O comprovante também apresenta os documentos e telefones formatados.

**Cidade da assinatura** reutiliza a busca de cidades brasileiras da inscrição, com sugestões **Cidade - UF**, seleção por toque ou teclado e possibilidade de informar o texto se as sugestões falharem. **Parentesco / vínculo legal** reutiliza as opções **Pai, Mãe, Tutor(a) legal e Responsável com guarda judicial**; uma resposta anterior fora da lista é preservada até ser substituída. As alterações estão incluídas nesta atualização e usam os campos existentes, sem tabelas ou colunas novas.

Verificação da entrega em **12/10/2026**: **260 testes da API e 169 da interface** aprovados com PostgreSQL temporário, incluindo identificação da organização, imutabilidade, renovação, assinatura e hash do comprovante. Tipos, compilação e inicialização da Hostinger aprovados. O roteiro `scripts/browser-guardian-check.mjs` verificou computador e celular com serviços simulados: dados legais, máscaras, CPF opcional, cidade por teclado/toque, parentesco, assinatura explícita, envio, comprovante e retomada sem duplicação. No Supabase de produção, a conferência somente leitura validou **22 tabelas, 185 colunas, 4 enums, 39 chaves, 36 relações, 3 triggers**, RLS em todas as tabelas, bloqueio de acesso direto pelo navegador e os buckets de fotos/artes. Nenhuma DDL adicional foi necessária.

O termo usa o PDF fornecido como referência: identificação do participante e equipe, contato familiar, medicamentos/alergias, identificação e CPF do responsável, autorização de permanência, responsabilidade, imagem/voz, tratamento de dados, cidade, data e assinatura. Organização, contato, evento, local e período vêm dos dados atuais no momento da emissão, junto com os termos publicados da ficha. Para servos, a equipe consta como "A definir pela organização", pois a candidatura ainda não representa alocação. Para campistas, a participação consta como "Campista".

Os novos termos incluem o cabeçalho **Organização responsável**, com nome cadastrado, razão social, nome fantasia, CNPJ, endereço (logradouro, número, complemento, bairro, cidade/UF), CEP e contato. CNPJ e CEP são formatados, mantendo também CNPJ alfanumérico. Informações opcionais vazias são omitidas; quando não há endereço de rua, a localização cadastrada aparece como **Cidade / UF**. A razão social, quando preenchida, também identifica a organização no parágrafo do evento. O endereço da organização e o local do evento permanecem distintos.

A identificação é armazenada junto ao texto e em `snapshot.event.organizationDetails`, no JSON existente da autorização. Isso permite conferi-la no formulário público, no comprovante, na impressão e no painel da organização, sem nova tabela ou coluna. Nome, contato e endereço não são buscados novamente para alterar um documento já emitido. Termos anteriores, inclusive pendentes, conservam sua versão; renovar o link modifica a validade e a credencial, preservando texto e dados. A identificação completa está incluída nesta atualização.

O conteúdo apresentado fica congelado; mudar o cadastro da organização, o evento ou a ficha depois não muda o documento solicitado ou assinado. O comprovante registra dados confirmados, desenho da assinatura, texto, identificação inicial, horário, IP, navegador e hash SHA-256, abrangendo também a identificação da organização persistida no documento. O responsável pode imprimir/salvar o comprovante pelo navegador. Este fluxo registra uma assinatura desenhada e o aceite pelo link; não usa certificado ICP-Brasil nem valida automaticamente a identidade ou o parentesco informado.

## Ativação na instalação gradual

1. Execute [SQL 09](../database/manual/09_autorizacao_responsavel.sql) inteiro pelo DBeaver na base `eventos_beta`, após os scripts 05 e 06. Não execute `db:deploy` ou `db:migrate` nessa base gradual.
2. Configure `REGISTRATION_LINK_SECRET` privado com pelo menos 32 caracteres. Reutiliza a infraestrutura dos links de resposta, com finalidade criptográfica diferente. Trocar esse segredo exige renovar links pendentes.
3. Configure `WEB_URL` para a origem pública acessível ao responsável e `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` e, se necessário, usuário/senha SMTP na API.
4. Atualize o cliente Prisma com `npm run db:generate` e reinicie a API após alterar ambiente ou código compilado.

Sem as tabelas ou o segredo, envio de ficha de menor devolve uma orientação e preserva o rascunho. Inscrições de adultos continuam funcionando. A migração equivalente está incluída para instalações completas em base nova.

## Envio e acompanhamento

E-mail informado pelo candidato é enviado automaticamente após persistir a inscrição. Falhas ou SMTP ausente não apagam a inscrição: o status é exibido no painel. WhatsApp usa `wa.me` com o telefone do responsável e a mensagem pronta; o usuário confirma o envio no aplicativo. Não há envio automático por API de WhatsApp.

A confirmação da ficha oferece o botão do WhatsApp e a cópia do link. Organização/secretaria também acompanham o termo no detalhe da inscrição, reenviam e-mail e renovam links. Os links expiram em 14 dias; renovar invalida o anterior. Envios de e-mail concorrentes têm proteção por janela de um minuto. O envio SMTP não fornece garantia de entrega na caixa de entrada.

Assinaturas repetidas são idempotentes e não substituem o primeiro documento. Termos assinados não podem ser renovados. Links de inscrições recusadas/canceladas ou de evento/organização inativos não permitem preenchimento.

Os dados de saúde permanecem no esquema `saude`; o painel de inscrições não recebe medicamentos/alergias do termo. Após assinar, as informações de medicamentos e alergias confirmadas pelo responsável atualizam a ficha de saúde, preservando as demais respostas. As tabelas têm RLS e nenhum acesso direto por `anon`, `authenticated` ou `PUBLIC`.

Para inscrições antigas de menores sem termo, a confirmação é bloqueada. A organização pode iniciar a solicitação pelo botão de criar o termo no painel, usando os dados preservados da ficha e os dados atuais do evento; é necessário já possuir contato válido do responsável.

## Verificação

`npm run typecheck`, `npm run build`, `npm test` e `npm run test:database` verificam compilação, regras, telas e integração em PostgreSQL isolado. `node scripts/browser-guardian-check.mjs`, após compilar a API e com a prévia local em execução, verifica desktop/celular, assinatura por mouse/toque, limpeza, aceites, envio, comprovante e retomada. Os testes substituem o envio SMTP e não enviam mensagens reais.
