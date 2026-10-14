# Ficha de inscrição para campistas

A ficha usa o modelo completo escolhido, com o mesmo editor e o mesmo preenchimento em cinco etapas da ficha de servos. No painel da organização, abra **Eventos → Ficha de campistas** no evento desejado.

## Configurar e publicar

O organizador pode editar descrição, regras, orientações de chegada, termos, banner, vagas e lista de espera, além de reordenar e ocultar os campos permitidos em cada etapa. Nome, telefone, nascimento, responsável para menores e aceite geral permanecem protegidos. A prévia permite conferir os campos de adulto e menor antes de publicar.

O período de campistas é definido ao criar/editar o evento. É obrigatório informar uma quantidade positiva de vagas antes de publicar a ficha. Campistas não precisam de departamentos ou preferências de equipe. Publicar gera uma nova versão imutável e disponibiliza o evento; cada campanha tem seus próprios períodos e sua própria ficha. O envio só funciona com organização/evento ativos, dentro do período e sem pausa.

O link público segue `/inscricao/:campaignId`. A pausa/retomada acontece na mesma tela de configuração da ficha.

## Campos do modelo 2

| Etapa              | Campos                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identificação      | Nome, telefone/WhatsApp, nascimento, e-mail opcional, apelido, cidade, UF e idade calculada                                                                                           |
| Sua foto           | Foto com envio, enquadramento e otimização                                                                                                                                            |
| Sobre você         | Endereço opcional, camiseta, paróquia/comunidade, grupo/pastoral, experiência anterior, encontros já vividos, expectativas, chegada, transporte e observações                         |
| Saúde e emergência | Alergias, medicamentos e horários, alimentação, condições de saúde, acessibilidade/apoio, contato familiar, vínculo, telefone principal e alternativo; responsável legal para menores |
| Revisão e envio    | Respostas, regras, orientações, conferência das informações, aceite dos termos e autorização de imagem opcional para adultos                                                          |

CPF do participante pode ser habilitado no editor, quando necessário para a organização. Perguntas de saúde mostram os detalhes apenas para respostas **Sim**. Informações de saúde ficam no módulo protegido e não são devolvidas no detalhe administrativo da inscrição.

## Inscrição e avaliação

O candidato preenche sem conta obrigatória. O rascunho é salvo no servidor e pode ser retomado no mesmo navegador. Rascunhos e inscrições preservam a ficha original quando uma nova versão é publicada; campos ocultos da nova versão não são gravados nem exigidos em novos rascunhos.

A inscrição recebe um protocolo, com proteção contra duplicação no reenvio. A organização consulta campistas e servos em **Inscrições**, filtra a campanha e registra análise, aprovação/recusa e confirmação. Uma confirmação que encontra as vagas esgotadas encaminha para lista de espera quando habilitada. Campistas não precisam ser alocados em departamentos.

Com a infraestrutura de avisos configurada, aprovação/recusa gera e-mail e mensagem pronta para WhatsApp com texto de campista. Na aprovação, o participante responde ao link de presença antes da confirmação final pela organização. Para menores, também é obrigatório o termo assinado pelo responsável. A assinatura e o aceite de imagem seguem o [fluxo de autorização](autorizacao-responsavel.md).

## Disponibilidade e configuração

`CAMPER_REGISTRATIONS_ENABLED=true` é o padrão e habilita campistas também com `EVENTS_ENABLED=false`, mantendo a administração gradual dos eventos. Não é necessário habilitar o modo completo de administração nem aplicar migrations antigas à base gradual. O recurso utiliza as tabelas existentes dos scripts 05/06; os scripts 07 e 09 habilitam, respectivamente, os avisos de presença e os termos dos responsáveis. Fotos e banners usam os serviços existentes de armazenamento.

Ao definir `CAMPER_REGISTRATIONS_ENABLED=false` com `EVENTS_ENABLED=false`, a etapa gradual volta a atender somente servos. A disponibilidade é informada em `/api/v1/config` e `/api/v1/readiness`.

## Verificação

`npm run typecheck`, `npm run build` e `npm run test:database` cobrem compilação, regressão dos servos e integração com PostgreSQL temporário, incluindo publicação, isolamento entre organizações, versões, dados de saúde, assinaturas e controle de vagas. `node scripts/browser-camper-check.mjs` verifica a configuração e a inscrição em desktop/celular, com respostas simuladas somente no navegador de teste. Nenhuma mensagem real é enviada durante esses testes.
