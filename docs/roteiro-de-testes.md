# Roteiro de testes da aplicação Encontro

Revisão de 11/10/2026. Este roteiro verifica o percurso da organização até a participação no evento e distingue recursos disponíveis no site, recursos bloqueados pela publicação e alterações que ainda estão somente no desenvolvimento.

**Conclusão da análise:** o fluxo principal já está implementado. A versão local libera inscrições públicas, respostas de presença e autorização do responsável mesmo com o cartaz no início; mantém os controles de período, ficha publicada e tokens. O site publicado ainda usa a versão anterior com bloqueio desses caminhos. Autorização do responsável, ficha completa da organização, edição de eventos publicados e funções cadastráveis estão no código local; a sincronização com a Hostinger aguarda solicitação do usuário.

## Situação atual

| Área | Situação encontrada | O que falta verificar ou concluir |
| --- | --- | --- |
| Página inicial | Cartaz, botão INSCRIÇÃO para Google Forms, música e favicon publicados | Conferir apresentação e som em aparelhos reais; o Google Forms não alimenta automaticamente as inscrições internas |
| Acesso e perfil | Login por e-mail, senha, recuperação, perfil e câmera publicados | Confirmar novos links no domínio correto, persistência da foto e câmeras físicas |
| Organizações e convites | Cadastro, membros, papéis, aceite e revogação implementados | Repetir o convite real com uma conta nova e conferir a atualização de Aguardando aceite |
| Eventos e departamentos | Cadastro, períodos independentes, arte, departamentos e vagas implementados; estrutura pronta no site | Percurso manual do organizador, imagem real e horários |
| Ficha de servos | Modelo, publicação e versionamento implementados; estrutura pronta no site | Comparar a ficha do evento com os requisitos desejados e testar o preenchimento público em homologação |
| Inscrição pública | Liberada localmente no modo com cartaz; bloqueada no site atual | Executar percurso local com dados de teste e publicar somente quando solicitado |
| Avaliação e vagas | Decisões, histórico, alocação e limites implementados | Executar com candidaturas de teste, inclusive duas pessoas disputando a última vaga |
| Avisos e presença | E-mail, mensagem pronta de WhatsApp, recusa e confirmação implementados; página de resposta liberada localmente | Validar entrega real e publicar quando solicitado |
| Campistas e vitrine | Código existente na versão completa; etapa atual desabilitada | Disponibilizar a versão completa para homologação e configurar/publicar a ficha de campistas |
| Saúde e histórico | Permissões por evento, separação dos dados e vínculos ao perfil implementados | Conferir papéis e preservação dos dados no percurso real |
| Responsável por menor | Termo, assinatura e comprovante no desenvolvimento; página liberada e banco local pronto | Validar o percurso local e publicar o módulo/estrutura quando solicitado |

### Evidência da revisão

- `npm run typecheck`: API e interface passaram.
- Após liberar as rotas públicas no modo com cartaz, a suíte isolada aprovou **203 testes da API e 90 da interface**, sem testes ignorados; a compilação também passou. A suíte de servos usa agora o mesmo servidor que mantém o cartaz, verificando o percurso público sem gravações em bases existentes ou mensagens reais.
- Após implementar funções por organização, a suíte com PostgreSQL isolado aprovou **190 testes da API**, e a suíte da interface aprovou **88 testes**, sem testes ignorados. O catálogo e seu uso em membros e convites também passaram no navegador em larguras de computador e celular. Esses testes não enviam convites reais.
- `npm test`, com integrações de banco desabilitadas: 91 testes da API e 54 da interface passaram; 70 de integração ficaram ignorados nessa primeira execução.
- `npm run test:database`: **161 testes da API e 54 da interface passaram**, sem testes ignorados. O PostgreSQL foi criado temporariamente, somente para a suíte, e encerrado ao final. Nenhuma base existente foi utilizada.
- Nos testes automatizados, Auth, armazenamento e envio de mensagens utilizam substitutos de teste. Eles não comprovam entrega na caixa de entrada, envio pelo aplicativo WhatsApp ou uso de uma câmera física.
- A captura de foto também foi verificada com câmera simulada no navegador, nas larguras de celular e computador, incluindo cancelamento e liberação da câmera.
- No site publicado, início, login, recuperação e perfil responderam normalmente; o servidor e o banco estavam prontos. Perfil sem autenticação devolveu bloqueio de acesso.
- A prontidão publicada confirmou eventos, fichas de servos, avisos e departamentos. Isso confirma a estrutura disponível, não a aprovação de todo o percurso manual.

Departamentos migrados podem ter vagas ainda não definidas, mesmo com a estrutura pronta. A prontidão dos avisos também não comprova configuração SMTP nem entrega do e-mail; esses pontos são verificados pela rodada real.

A publicação atual usa a versão de acesso para testes mais a correção de câmera. As alterações locais de autorização do responsável não fazem parte dessa publicação. Por isso, um teste local aprovado não deve ser registrado automaticamente como aprovado no site.

Na versão local atual, `TEMPORARY_SITE=true` com `APPLICATION_TEST_ACCESS=true` mantém o cartaz na raiz e libera `/eventos`, `/inscricao/:campaignId`, `/resposta/:noticeId`, `/autorizacao/:authorizationId` e `/api/v1/public/*`. Não abre períodos nem publica fichas automaticamente. Os links de resposta e autorização exigem seus tokens; rascunhos exigem a credencial própria e painéis continuam exigindo login e permissão. O modo isolado `APPLICATION_TEST_ACCESS=false` continua indisponibilizando a API de negócio.

## Onde executar

| Ambiente | Endereço e uso | Limites atuais |
| --- | --- | --- |
| Site atual | [facnsaloanda.com.br/entrar](https://facnsaloanda.com.br/entrar). Acesso, organizações, membros, perfil e preparação administrativa | A página inicial continua sendo o cartaz. `/inscricao`, `/resposta` e `/autorizacao` não estão liberadas; a API pública de eventos/inscrições está bloqueada |
| Versão local atual | `/eventos` e links gerados pela organização em `localhost`; para conferir o cartaz com os fluxos, iniciar o servidor compilado no modo de prévia | Usar registros de teste e links completos válidos. A configuração gradual libera servos; campistas depende da versão completa |
| Homologação completa | Ambiente separado com o percurso público liberado e massa de teste | Necessário para inscrição, resposta de presença, campistas, saúde e histórico completo |
| Homologação do responsável | Versão que inclua o módulo local de autorização e sua estrutura de banco | Necessário para os testes M01 a M04; ainda não disponível na publicação atual |

Na configuração atual, preparar o período de campistas não libera a ficha de campistas. O editor completo está na versão de eventos habilitados. Alterar somente essa opção também não remove o bloqueio da página temporária: a liberação das rotas públicas precisa fazer parte da preparação da homologação.

O botão **INSCRIÇÃO** do cartaz abre o Google Forms informado. Para testar a aplicação interna, use o link gerado na ficha de servos ou campistas, no ambiente de homologação. A revisão não encontrou uma importação automática das respostas desse Google Forms.

## Preparação da rodada

**Busca de cidades (somente local):** na identificação da inscrição, digite `loanda` e selecione **Loanda - PR**; teste `sao paulo` sem acento e refine com `SP`. Para municípios de mesmo nome, confira a UF. Teste toque no celular e setas/Enter no computador, sem enviar a ficha ao selecionar. Avance, retorne à identificação e reabra o rascunho para conferir a resposta preservada. Rascunhos antigos com texto livre devem continuar funcionando.

Use endereços de e-mail e números de WhatsApp controlados pela equipe de teste. Identifique organizações, eventos e pessoas fictícias com o prefixo **TESTE**. Não use dados de saúde de pessoas reais na massa fictícia.

Prepare estes acessos:

| Acesso | Finalidade |
| --- | --- |
| Administrador da plataforma | Cadastrar organizações e gerenciar seus responsáveis |
| Organizador A | Administrar a organização TESTE A |
| Organizador B | Administrar a organização TESTE B e verificar isolamento |
| Secretaria | Consultar eventos e candidaturas da organização A |
| Saúde | Ter autorização explícita para somente um dos eventos da organização A |
| Conta pessoal sem organização | Verificar que um cadastro comum não cria privilégios |
| Novo convidado sem conta | Reproduzir o primeiro acesso e o retorno ao convite |

Prepare um evento futuro na organização A, com um segundo evento para verificar isolamento. Para o primeiro, use MANUTENÇÃO: 1 vaga, ANJO: 2 vagas e LÍDER: 1 vaga. Prepare duas candidaturas adultas para disputa de vaga, uma para recusa, uma sem e-mail e, na versão apropriada, uma de menor com responsável.

Execute os testes em Chrome ou Edge no computador, em Android e, se houver disponibilidade, em iPhone. Para câmera, música, assinatura e WhatsApp, registre o resultado separadamente por aparelho. Uma câmera simulada não substitui essa rodada.

## Como marcar o resultado

**P0** é indispensável antes de aceitar inscrições reais pelo sistema. **P1** verifica comportamento e recuperação de falhas. **P2** cobre operação e acompanhamento.

Use **Passou**, **Falhou**, **Bloqueado** ou **Não executado**. Quando uma rota estiver bloqueada pelo modo de publicação, registre **Bloqueado**, com o ambiente, em vez de concluir que o recurso não existe.

Para cada falha, registre o código do caso, aparelho/navegador, papel utilizado, ação, resultado esperado e resultado obtido. Capturas devem ocultar credenciais e dados pessoais. Não copie links completos de sessão ou de confirmação para o registro compartilhado.

## Primeira rodada no site atual

Faça I01 a I03, A01 a A06, O01 a O07, E01 a E06, F01 a F04 e P01 a P04. Essa rodada verifica os recursos acessíveis agora. Os resultados da inscrição pública e da presença permanecem pendentes de homologação completa.

### Página inicial

| Caso | Prioridade | O que fazer | Resultado esperado |
| --- | --- | --- | --- |
| I01 | P1 | Abrir o início no computador e celular; clicar em INSCRIÇÃO | Cartaz legível, imagem sem corte indevido, favicon da aplicação e botão cobrindo o aviso antigo. O botão abre o Google Forms correto |
| I02 | P1 | Abrir em uma visita nova; usar o ícone de som duas vezes | Música tenta iniciar em 30%. Se o navegador bloquear a reprodução automática, clicar no ícone inicia o som; o mesmo ícone permite silenciar e reativar |
| I03 | P0 | Entrar pelo endereço `/entrar`; depois usar o link do logotipo para voltar ao início | A página de acesso abre sem ser substituída pelo cartaz; ao voltar ao início, o cartaz aparece |

### Acesso e primeiro cadastro

| Caso | Prioridade | O que fazer | Resultado esperado |
| --- | --- | --- | --- |
| A01 | P0 | Sem sessão, abrir perfil e painéis administrativos por endereço direto | Solicitar login e preservar o destino; nenhum dado privado aparece |
| A02 | P0 | Clicar em Receber acesso por e-mail; abrir somente o e-mail mais recente | Remetente `contato@facnsaloanda.com.br`; retorno ao domínio público, sem localhost. O destino final respeita os vínculos da conta |
| A03 | P0 | Repetir com um endereço que ainda não possua conta | Primeiro acesso por e-mail cria o acesso pessoal conforme o Auth; não concede administração da plataforma nem organização automaticamente |
| A04 | P1 | Usar Entrar com senha com uma senha correta e outra incorreta | Senha correta concede acesso; incorreta mostra orientação sem autenticar |
| A05 | P0 | Usar Esqueci minha senha, Enviar instruções e Salvar senha | Link abre `/nova-senha` no domínio público. Exige pelo menos 12 caracteres. Nova senha funciona; contexto do convite é preservado quando houver |
| A06 | P0 | Sair da conta e abrir novamente perfil/organização; entrar com conta pessoal sem vínculo | Após sair, as áreas privadas pedem acesso. Conta comum permanece pessoal e não recebe cadastro global de organizações |

Não há uma tela independente de “criar conta com senha”. O primeiro cadastro ocorre pelo acesso por e-mail; definir senha utiliza o fluxo disponível. Uma tela tradicional de cadastro é um requisito adicional caso a equipe queira esse modelo.

### Organizações, convites e membros

CNPJ, razão social, nome fantasia, endereço completo e envio de logotipo estão implementados localmente. Os casos O08 a O10 devem ser executados nessa versão; a publicação na Hostinger aguarda solicitação do usuário. A base existente precisa da atualização aditiva `database/manual/10_ficha_organizacao.sql` antes de receber essa versão.

Funções por organização também estão disponíveis localmente, em **Minha Organização → Funções**. Os casos O11 a O14 devem ser executados nessa versão. A atualização aditiva `database/manual/11_funcoes_organizacao.sql` já foi aplicada ao banco local com backup e preservação dos dados existentes; ainda precisa acompanhar uma futura publicação no banco de produção. Cada função escolhe um perfil de acesso existente: Organizador, Secretaria ou Saúde.

| Caso | Prioridade | O que fazer | Resultado esperado |
| --- | --- | --- | --- |
| O01 | P0 | Como administrador, Nova organização; preencher nome, tipo, cidade, UF e contato; Cadastrar organização | Organização aparece e os dados persistem ao atualizar. Conta comum não consegue cadastrar uma organização global |
| O02 | P0 | Gerir membros e enviar convite; informar endereço de teste e função Organizador; Enviar convite | Registro fica Aguardando aceite. A tela informa envio por e-mail ou disponibiliza o link para compartilhamento manual |
| O03 | P0 | Abrir o convite sem sessão e com endereço ainda sem conta; Entrar para aceitar; concluir o e-mail em outra aba | Voltar ao convite correto. Não aceitar automaticamente nem encaminhar o convidado para cadastrar paróquias |
| O04 | P0 | Aceitar convite; voltar à aba que o enviou; Atualizar lista | Convidado entra na organização correta. Aparece uma única vez em Membros e o convite passa a Aceito, deixando de aguardar aceite |
| O05 | P0 | Testar convite com outro e-mail, revogado, expirado e reutilizado | Impedir vínculo indevido. Nenhum desses testes cria um segundo membro. Use convites separados para as variações |
| O06 | P0 | Com dois organizadores ativos de teste, suspender um; tentar o acesso com sua sessão aberta. Tentar suspender o último organizador | Suspenso perde acesso na próxima consulta, mesmo mantendo a sessão. A aplicação impede remover o último organizador ativo |
| O07 | P0 | Entrar como Organizador B e acessar endereços da organização A; testar Secretaria e Saúde | Outra organização não recebe dados nem altera registros. Na etapa atual de servos, Secretaria consulta e o Organizador decide; Saúde exige autorização específica por evento |
| O08 | P1 | Cadastrar CNPJ válido, razão social, nome fantasia, CEP, rua, número, complemento, bairro, cidade e UF; atualizar a página e editar | Todos os dados persistem. CNPJ e CEP ficam normalizados; dados complementares são opcionais e organizações antigas continuam editáveis |
| O09 | P1 | Escolher logotipo JPEG, PNG ou WebP; conferir a prévia, salvar, atualizar e substituir a imagem | Upload substitui o campo de URL. A imagem inteira e sua transparência são preservadas. Editar sem outro arquivo mantém o logotipo; descartar a seleção também mantém o anterior |
| O10 | P1 | Informar CNPJ/CEP inválido; tentar imagem corrompida, SVG e arquivo acima de 10 MB; repetir após corrigir | Validação orienta a correção. Falha no envio mantém dados para nova tentativa e não substitui o cadastro/logotipo anteriores; conta comum não tem permissão para upload |
| O11 | P0 | Minha Organização → Funções; conferir Organizador, Secretaria e Saúde; criar Coordenação de inscrições com perfil Secretaria; abrir Membros e convites | Função aparece no seletor, com nome e perfil. Nome repetido é recusado na mesma organização, mas permitido em outra |
| O12 | P0 | Vincular membros e enviar convites de teste; mudar o perfil da função; aceitar um convite pendente | Todos os membros vinculados e convites válidos recebem o novo perfil. Suspensos continuam suspensos; autorizações de saúde são limpas e precisam ser concedidas explicitamente por evento |
| O13 | P0 | Inativar função com membros e convite válido; tentar novo convite/atribuição; aceitar o convite anterior e reativar a função | Novas atribuições são impedidas; membros e convites existentes permanecem válidos. Reativação volta a disponibilizar a função |
| O14 | P0 | Tentar rebaixar a função do último organizador; repetir com dois organizadores da mesma função e de funções distintas; testar outra organização e Secretaria | Sempre permanece ao menos um organizador ativo. Alterações recusadas não mudam vínculos parcialmente. Outra organização e Secretaria não gerenciam funções |
| O15 | P0 | Como Organizador ativo, Minha Organização → Visão geral → Informações da organização → Editar informações; editar nome, endereço, CNPJ/CEP e substituir o logotipo; salvar e atualizar a página | Dados e imagem persistem; nome e logotipo na barra lateral são atualizados. CNPJ/CEP aparecem com máscara. Não há controle de ativação/desativação para o organizador |
| O16 | P0 | Repetir a edição como Secretaria, Saúde, membro suspenso ou Organizador de outra organização; tentar alterar o estado ativo pela API do organizador | Botão indisponível nos demais perfis; API impede a alteração sem permissão. Estado ativo e campos internos de armazenamento não podem ser alterados pelo organizador |

### Evento, períodos e arte

| Caso | Prioridade | O que fazer | Resultado esperado |
| --- | --- | --- | --- |
| E01 | P0 | Organizador: Eventos, Novo evento; nome, tipo, data de um dia, local, cidade e descrição; departamentos e períodos; Salvar evento | Edição criada Em preparação; evento, dois períodos e departamentos permanecem após atualizar. Salvar não abre automaticamente as inscrições |
| E02 | P1 | Editar; marcar O evento dura mais de um dia; alterar início e término | Período correto persiste. Término anterior ao início impede salvar e mantém os campos para correção |
| E03 | P0 | Configurar servos e campistas com horários distintos e períodos sobrepostos; testar encerramento antes/igual à abertura | Horários de Brasília e períodos independentes. Datas inválidas são recusadas sem cadastro parcial |
| E04 | P0 | Adicionar departamento: MANUTENÇÃO 1, ANJO 2, LÍDER 1; testar nome repetido, vaga negativa/fracionada e ausência de departamento | Total de 4 vagas. Pelo menos um departamento; nomes equivalentes não se repetem; vagas são números inteiros não negativos. Zero vaga impede novas alocações |
| E05 | P1 | Selecionar arte vertical JPEG/PNG/WebP; salvar, atualizar e substituir; testar arquivo inválido e acima de 10 MB | Imagem inteira, com proporção preservada. A edição sem nova imagem preserva a anterior; substituição apresenta a nova. Arquivos inválidos são recusados |
| E06 | P0 | Testar criação/edição com Secretaria, outra organização e administrador sem vínculo de organizador | Consulta e ações respeitam o papel. Administração global não concede criação de eventos automaticamente |
| E07 | P0 | Publicar ficha; em Eventos clicar Editar evento; alterar nome, local e arte, salvar e atualizar, incluindo um evento com inscritos | Botão permanece disponível ao organizador. Dados e arte persistem; estado, períodos, vagas, fichas e candidatos permanecem iguais. Sem inscritos as datas podem mudar, mesmo com período aberto; com inscritos ficam protegidas. Secretaria não edita |

A proporção recomendada da arte é **9:16 vertical**. A arte é opcional no cadastro atual. Se passar a ser obrigatória para publicar, essa regra deve ser acrescentada como requisito.

### Ficha de servos

| Caso | Prioridade | O que fazer | Resultado esperado |
| --- | --- | --- | --- |
| F01 | P0 | Ficha de servos; preencher Descrição antes das regras; revisar requisitos, preparação e termos; Visualizar campos | Descrição aparece na prévia e na ficha pública, com quebras de linha. O campo é opcional. Campos básicos da referência, regras e departamentos corretos. Revisar texto próprio do evento, sem assumir as datas e a taxa do PDF de referência |
| F02 | P0 | Publicar ficha de servos com departamentos de capacidade definida; repetir em cadastro antigo com capacidade pendente | Publicação válida apresenta versão e link. Capacidade ainda não definida impede publicação; um evento com somente um departamento também funciona |
| F03 | P1 | Preparar nova versão; conferir que a Descrição publicada veio preenchida; alterar descrição e regras; publicar e comparar inscrições/rascunhos iniciados antes e depois | Novos rascunhos usam a nova versão e a descrição atualizada. Respostas, aceites, descrição e versão antigos permanecem preservados. Fichas antigas sem descrição continuam editáveis |
| F04 | P0 | Copiar o link; Pausar inscrições de servos; Retomar inscrições de servos; testar abertura e encerramento | No ambiente completo, somente o período aberto e não pausado aceita início/envio. No site atual, o link público permanece bloqueado pelo modo de publicação |

## Rodada com o percurso público liberado

Os casos a seguir precisam do ambiente de homologação completo. Use sempre novas candidaturas fictícias. O site atual não permite concluir esse percurso.

### Inscrição e rascunho

| Caso | Prioridade | O que fazer | Resultado esperado |
| --- | --- | --- | --- |
| S01 | P0 | Sem conta, Abrir ficha pública e Começar inscrição; concluir as cinco etapas | Inscrição de servo não exige criar conta. Campos de identificação, foto, perguntas, saúde/emergência e revisão funcionam |
| S02 | P0 | Preencher campos da referência: experiência, edição anterior, sacramentos, paróquia, formação, cônjuge, camiseta, disponibilidade e departamentos | Obrigatórios são exigidos. Resposta Não é aceita. Nenhum sacramento exclui as outras escolhas. Selecionar até três departamentos não reserva uma vaga |
| S03 | P0 | Informar alergia/medicação e testar detalhes vazios; preencher emergência; revisar regras, preparação e termos | Detalhes são exigidos quando a resposta é Sim. Aceites obrigatórios impedem envio se faltarem; autorização de imagem continua independente e opcional |
| S04 | P0 | Preencher parte da ficha, aguardar Rascunho salvo, fechar e retornar no mesmo navegador | Dados e foto são retomados. Nada é enviado automaticamente. A retomada depende da credencial do rascunho daquele navegador |
| S05 | P0 | Enviar inscrição; repetir o envio da mesma ficha e atualizar a confirmação | Um protocolo e uma inscrição Recebida. O envio não confirma a participação nem duplica a candidatura |
| S06 | P1 | Criar um segundo rascunho com os mesmos dados ativos na campanha; depois testar uma pessoa sem e-mail | Duplicidade é tratada sem expor dados da inscrição anterior. E-mail ausente não impede candidatura; não cria conta nem vínculo automático |
| S07 | P0 | Usar Pausar inscrições de servos enquanto um candidato preenche; tentar enviar. Em outro teste, preparar previamente um período que termine durante o preenchimento | Impedir envio fora do período; preservar o rascunho e mostrar orientação. Retomar somente quando as regras permitirem |
| S08 | P0 | Inscrição de menor: na etapa 4, tentar continuar com responsável vazio; preencher nome, telefone com DDD e selecionar o parentesco; avançar e retomar o rascunho | Menu obrigatório oferece Pai, Mãe, Tutor(a) legal e Responsável com guarda judicial. Telefone mostra máscara; dados são salvos e retomados. Fichas anteriores sem layout também usam os controles; respostas antigas de parentesco são preservadas até substituição |

### Análise, comunicação e vagas

| Caso | Prioridade | O que fazer | Resultado esperado |
| --- | --- | --- | --- |
| D01 | P0 | Candidaturas de servos; filtrar evento/situação; abrir candidatura; Em análise e motivo; Salvar decisão | Identificação, foto e respostas ficam disponíveis. Histórico registra motivo e estado; informações médicas não aparecem no bloco comum |
| D02 | P0 | Aceitar candidatura e salvar motivo | Estado Aprovada, sem confirmar a participação nem escolher departamento automaticamente. Aviso de aceite criado e tentativa de e-mail quando houver endereço/configuração |
| D03 | P0 | Abrir mensagem no WhatsApp; conferir destinatário/texto/link; enviar pelo aplicativo; Marcar como enviado pelo WhatsApp | Mensagem pronta usa o domínio correto. Abrir a conversa não registra envio; declaração acontece somente na ação explícita do organizador |
| D04 | P0 | Conferir o e-mail real; abrir o link em janela privada, primeiro sem confirmar; depois Confirmar minha presença duas vezes | Link público funciona sem cadastro. Só abrir não confirma. Clique registra a presença uma vez, sem duplicação |
| D05 | P0 | Aprovar dois candidatos; tentar alocar ambos na única vaga de MANUTENÇÃO, inclusive em duas sessões; Salvar departamento | Somente um ocupa a vaga. Preferência do candidato não equivale à alocação. Repetir a alocação vencedora não ocupa outra vaga |
| D06 | P0 | Antes e depois da resposta do candidato, tentar Confirmada com motivo; reduzir capacidade abaixo dos alocados; trocar departamento e cancelar | Confirmação exige alocação e resposta ao aviso ativo. Não reduz capacidade abaixo dos ocupantes. Troca bem-sucedida/cancelamento libera a vaga correta |
| D07 | P0 | Recusar candidatura com motivo; conferir e-mail/WhatsApp e abrir o aviso; testar cancelamento de uma aprovada | Mensagem Não foi dessa vez!; sem botão de confirmar presença. Motivo interno e saúde não são enviados. Aviso de aceite anterior deixa de permitir confirmação |
| D08 | P1 | Em homologação, simular falha SMTP; depois Enviar por e-mail; testar Renovar link e a credencial antiga | Decisão permanece salva. Estado de envio mostra falha/indisponibilidade corretamente; nova tentativa funciona. Renovação invalida link antigo. Abrir/recarregar a ficha não envia outra mensagem |

O registro de presença do candidato e a confirmação administrativa são ações distintas. Aprovação, alocação e confirmação também são distintas: a vaga do departamento é ocupada na alocação de uma candidatura aprovada; a confirmação não deve contá-la novamente. A capacidade geral de campistas é independente dessas vagas.

Inscrições antigas que não receberam aviso pelo fluxo atual conservam a confirmação administrativa manual. A exigência de resposta descrita em D06 se aplica ao aviso ativo e válido, não deve ser aplicada retroativamente a todas as inscrições antigas.

### Perfil, foto, histórico e saúde

P01 a P04 podem ser feitos no site atual. P05, P06, H01 e H02 precisam das candidaturas fictícias e do fluxo completo de homologação.

| Caso | Prioridade | O que fazer | Resultado esperado |
| --- | --- | --- | --- |
| P01 | P0 | Editar meu perfil; nome, telefone, nascimento e cidade; Salvar perfil e atualizar | Dados próprios persistem. O perfil não altera permissões nem o e-mail verificado |
| P02 | P1 | No computador/notebook: Tirar foto, permitir webcam, Capturar foto, enquadrar, Usar esta foto, Salvar perfil; atualizar | Foto real capturada e persistida. A câmera fecha após captura, cancelamento ou saída da página |
| P03 | P1 | Repetir no Android/iPhone; testar negar permissão, cancelar e Escolher foto | Prévia e captura utilizáveis no aparelho. Permissão negada mostra orientação e permite arquivo. Arquivo inválido/acima de 10 MB é recusado |
| P04 | P0 | Entrar com outra conta e conferir seu perfil. Com apoio técnico, tentar solicitar pela aplicação o link de uma foto que pertence à conta anterior. Depois sair e abrir perfil novamente | Cada conta vê seu próprio perfil; emissão de link da foto de outro dono é bloqueada. Depois de sair, perfil exige login |
| P05 | P0 | Na confirmação da ficha, Criar meu perfil ou entrar; usar e-mail confirmado correspondente; Vincular ao meu perfil; repetir com e-mail diferente | Só a conta correspondente, com credencial válida, vincula a inscrição. Meus encontros apresenta o vínculo; conta diferente é bloqueada |
| P06 | P1 | Usar outra inscrição ainda sem vínculo com conta. Organizador: Vincular ao perfil após comprovação; conta verificada e motivo; Vincular esta inscrição. Depois mudar nome/foto do perfil | Vínculo individual registrado. Mudança do perfil preserva ficha histórica, foto e aceites originais |
| H01 | P0 | Abrir Cuidados de saúde como usuário autorizado para um único evento; tentar outro evento e outra organização | Dados apenas dos eventos explicitamente autorizados. Papel global ou de organizador sozinho não concede saúde |
| H02 | P0 | Abrir candidatura, listagem e perfil com papel administrativo comum; comparar com a área autorizada de saúde | Saúde permanece separada; a consulta autorizada é auditada. Não há consulta pública de histórico por CPF/telefone/protocolo |

Uma URL assinada de foto já emitida é uma credencial temporária e pode abrir para quem possuir o endereço enquanto estiver válida. Reutilizar esse endereço em outro navegador não verifica as permissões da conta. P04 verifica se a aplicação permite **emitir um novo link** para a pessoa errada.

### Campistas e vitrine completa

| Caso | Prioridade | O que fazer | Resultado esperado |
| --- | --- | --- | --- |
| C01 | P0 | Na versão completa, configurar/publicar ficha de campistas e evento; buscar por nome, organização e cidade | Evento publicado e campanha aberta aparecem na vitrine. Preparação, evento cancelado e campanha indisponível não oferecem inscrição válida |
| C02 | P0 | Preencher inscrição de campista; testar período próprio, pausa e capacidade geral | O período de servos não determina o de campistas. A ficha e os termos corretos são usados; limites da campanha são respeitados |
| C03 | P0 | Dois campistas disputam a última vaga; repetir com lista de espera ligada e desligada | Não ultrapassar capacidade. Com lista habilitada, o excedente entra em espera; sem lista, erro preserva o estado anterior |

### Responsável por menor

Executar somente na versão que inclua o módulo de autorização e sua estrutura. Não registrar estes casos como disponíveis no site publicado hoje.

| Caso | Prioridade | O que fazer | Resultado esperado |
| --- | --- | --- | --- |
| M01 | P0 | Inscrever menor, informar contato do responsável e enviar; abrir a mensagem destinada ao responsável | Inscrição recebida com termo pendente. Um aceite marcado pelo candidato não substitui a assinatura do responsável |
| M02 | P0 | Abrir link do responsável no celular e computador; conferir dados, identificação, CPF e aceites; assinar com dedo/mouse; enviar | Valida campos e assinatura; registra o primeiro documento, mostra comprovante e permite impressão pelo navegador |
| M03 | P0 | Antes da assinatura, tentar confirmar participação; assinar e repetir; enviar novamente a mesma autorização | Sem assinatura, confirmação bloqueada. Após assinatura, ainda respeita as demais condições de participação/vagas. Repetição não substitui o documento original |
| M04 | P1 | Testar link expirado, renovado, de inscrição recusada/cancelada; abrir o painel comum e a saúde autorizada | Link antigo deixa de funcionar após renovação. Casos inválidos não permitem assinatura. Medicamentos/alergias permanecem fora da avaliação administrativa comum |
| M05 | P1 | Na autorização, editar/colar os celulares e CPFs; buscar Cidade da assinatura e selecionar por teclado/toque; trocar Parentesco / vínculo legal; assinar e abrir novamente o comprovante | Celulares usam `(00) 00000-0000` e CPFs `000.000.000-00`. CPF do participante continua opcional. Cidade mostra sugestões Cidade - UF. Parentesco usa os padrões da etapa 4 e mantém resposta antiga até substituição. Envio é explícito e comprovante conserva os dados formatados |
| M06 | P0 | Completar os dados da organização e emitir um termo novo; conferir CNPJ, razão social, nome fantasia, endereço, CEP e contato. Alterar o cadastro depois e renovar/assinar o termo anterior; emitir outro termo | Cabeçalho usa somente dados cadastrados na emissão, separa endereço da organização do local do evento e omite campos opcionais vazios. Documento anterior e seu comprovante mantêm texto/identificação originais; termo novo utiliza o cadastro atualizado. CNPJ alfanumérico conserva as letras |

### Operação

| Caso | Prioridade | O que fazer | Resultado esperado |
| --- | --- | --- | --- |
| R01 | P1 | Interromper a conexão durante salvamento/envio, restaurar e tentar novamente; atualizar página com rascunho existente | Informar falha sem declarar sucesso indevido; retomada preserva o que já foi salvo; reenvio não gera uma segunda inscrição |
| R02 | P2 | Na infraestrutura de homologação, restaurar uma cópia de backup e conferir evento, protocolo, versão de ficha e foto | Cópia restaurada utilizável, sem alterar a base principal. Limpeza de rascunhos expirados preserva inscrições enviadas |

## Organizar e ocultar campos

| Caso | Prioridade | O que fazer | Resultado esperado |
| --- | --- | --- | --- |
| L01 | P0 | Preparar nova versão de servos e campistas; ordenar campos básicos/adicionais com alça e setas | Ordem muda somente dentro da etapa. Identificadores, opções e obrigatoriedade ficam preservados |
| L02 | P0 | Ocultar e reexibir foto, camiseta, disponibilidade, emergência, saúde e aceites | Item oculto permanece na mesma posição no editor e some da prévia/inscrição. Reexibir restaura posição e regras |
| L03 | P0 | Tentar ocultar nome, telefone, nascimento, termos e responsável; enviar layout adulterado à API | Controle protegido explica o motivo. API rejeita ocultação, referências desconhecidas/repetidas/ausentes e mudança de etapa |
| L04 | P0 | Ocultar todos os campos não protegidos; inscrever adulto sem foto/saúde; retomar rascunho | Apenas identificação e revisão. Envio funciona; dados ocultos não são persistidos nem revisados |
| L05 | P0 | Repetir L04 com menor; preencher e assinar o termo independente | Etapa do responsável reaparece e é obrigatória. Responsável completa emergência/saúde; consulta preserva esses dados |
| L06 | P0 | Deixar foto, saúde, camiseta, disponibilidade e perguntas obrigatórias visíveis e tentar enviar sem responder | Regras e validações existentes continuam exigidas. Saúde omitida por ocultação aparece como **Não perguntado**, nunca como “Não” |
| L07 | P0 | Iniciar rascunho e enviar inscrição; publicar versão com ordem/visibilidade diferentes | Novos candidatos usam a nova versão. Rascunho e inscrição anteriores conservam ordem, regras e respostas |
| L08 | P1 | Arrastar com mouse; teclado Espaço/setas/Espaço; Escape; toque prolongado Android/iPhone; rolar fora da alça | Arraste e cancelamento funcionam; não muda de etapa; rolagem permanece disponível fora da alça |
| L09 | P1 | Ocultar preferência de equipes e aprovar/alocar candidato | Cadastro de departamentos, capacidades e alocação continuam necessários e seus limites são respeitados |

Automação: `npm run test:database` usa PostgreSQL temporário e valida versões, ocultação, envio sem foto, autorização e concorrência. `npm run test:browser:volunteers` percorre a interface real com serviços simulados: mouse, teclado, cancelamento, toque, isolamento de etapas, nova versão, rascunho retomado, etapas vazias e menor. Também executar `npm run typecheck` e `npm run build`. A sincronização depende de solicitação explícita; testes em aparelhos e integrações reais permanecem necessários na homologação autorizada.

## Pendências priorizadas

| Prioridade | Ação | Tipo de pendência | Critério de conclusão |
| --- | --- | --- | --- |
| P0 | Preparar ambiente de homologação com inscrições e páginas de resposta liberadas | Configuração/publicação | Um adulto conclui S01 a D07, do convite ao evento e à confirmação, com contatos de teste |
| P0 | Publicar e homologar o módulo do responsável antes de usar esse fluxo com menores | Publicação/ativação de código existente | M01 a M04 passam no mesmo ambiente; estrutura, mensagem, assinatura e bloqueio de confirmação funcionam |
| P0 | Validar a entrega real dos avisos e o retorno de todos os links | Integrações reais | Convite, acesso, recuperação, aceite, recusa e autorização aplicável retornam ao domínio certo e chegam aos destinatários de teste |
| P0 | Disponibilizar campistas na etapa escolhida | Configuração ou adaptação da interface da etapa atual | Editor, publicação, inscrição e limite/lista de espera de campistas passam em C01 a C03 |
| P1 | Validar webcam, Android/iPhone, som e WhatsApp reais | Homologação em aparelhos | Resultados registrados por aparelho, incluindo negação de permissão e cancelamento |
| P1 | Alinhar documentos e versionamento à produção atual | Documentação/publicação rastreável | Guias distinguem Supabase de produção, ambiente local e autorização ainda não publicada; correção da câmera registrada no versionamento usado para futuras implantações |
| Conforme decisão da equipe | Permitir editar informações/períodos de eventos já publicados na etapa atual | Disponibilização da interface | Hoje Eventos só oferece edição Em preparação; depois de publicar, a ficha permite pausar/retomar. Se essa edição posterior for necessária, disponibilizar o editor existente da versão completa, preservando as regras de inscrições já enviadas |
| Conforme decisão da equipe | Integrar/importar respostas do Google Forms, se elas precisarem entrar na aplicação | Implementação adicional | Definir importação, correspondência dos campos e tratamento de duplicados; hoje o botão somente abre o formulário externo |

Pagamentos/taxas, check-in, alojamentos, galerias, recursos sociais e aplicativo nativo estão fora desta versão. Não foram encontrados como recursos completos. Só devem entrar no plano de implementação se a equipe confirmar que fazem parte da próxima entrega.

Regras específicas de idade mínima, região e cobrança do PDF não foram transformadas em bloqueios automáticos universais. Os requisitos e a preparação são apresentados na ficha e avaliados pelo organizador. Caso se deseje recusa automática por esses critérios, precisamos definir e implementar essas regras.

## Registro da execução

Copie uma linha para cada caso executado. Há **66 casos** neste roteiro; variações de aparelho, papel ou cenário podem gerar mais de um registro por caso.

| Data | Caso | Ambiente/versão | Papel e aparelho | Resultado | Observação ou falha | Responsável pelo próximo passo |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | Não executado | | |

Para encerrar a homologação, todos os P0 aplicáveis à entrega devem passar no ambiente que será publicado, com entrega de mensagens e aparelhos reais verificados. Casos bloqueados ou não executados continuam pendentes, mesmo com testes automatizados aprovados.

## Referências do projeto

- [Eventos e períodos](eventos-etapa-inicial.md)
- [Ficha de servos e campos da referência](ficha-servos.md)
- [Departamentos e vagas](departamentos-e-vagas.md)
- [Avisos e presença](avisos-e-presenca.md)
- [Autorização do responsável em desenvolvimento](autorizacao-responsavel.md)
- [Fluxos e regras de manutenção](desenvolvimento.md)
- [Contratos da API](api.md)

Os guias anteriores ainda contêm instruções para a instalação gradual local. Eles não autorizam repetir scripts já aplicados nem representam, sozinhos, o estado do ambiente publicado.
