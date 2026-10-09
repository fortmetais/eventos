# Guia de continuidade por fluxo

## Ordem para desenvolver e revisar

Para cada mudança: dados e migration → repository → service e validação → controller/rotas → tela → teste do fluxo. Uma migration publicada não deve ser alterada; crie uma nova. Não acrescente regras específicas de FAC, Juvenil ou Sênior: utilize configurações do evento e da ficha.

| Fluxo                                             | Módulo da API        | Tela principal         | Critério de conclusão                                                          |
| ------------------------------------------------- | -------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| Administrador cria paróquia e convida responsável | organizations        | Administração, Membros | Conta não privilegiada não cria organizações; convite é de uso único           |
| Organizador configura a edição                    | events               | Eventos e fichas       | Identificadores de outra organização não são aceitos                           |
| Campanhas e fichas são preparadas                 | events               | Configuração do evento | Cada campanha tem período próprio; versões publicadas são imutáveis            |
| Visitante escolhe participar ou servir            | events               | Explorar, Detalhes     | Somente campanhas abertas possuem ação de inscrição                            |
| Pessoa envia ficha sem conta                      | registrations, media | Inscrição              | Saúde separada, responsável para menores, foto privada e protocolo idempotente |
| Organização analisa e confirma                    | registrations        | Inscrições e equipes   | Capacidade transacional; servo confirmado somente com equipe                   |
| Equipe autorizada cuida dos participantes         | registrations        | Cuidados de saúde      | Escopo de evento e auditoria de leitura                                        |
| Pessoa cria acesso e consulta histórico           | profiles             | Minha área             | Vínculo individual com token e e-mail validado; perfil não altera fichas       |

## Identidade e isolamento

Conta global é diferente de pessoa da organização. Inscrição sem conta cria cadastro local e preserva o retrato dos dados fornecidos. CPF/telefone não são prova de identidade. Os identificadores podem sinalizar duplicidade dentro de uma campanha, mas não autorizam leitura ou mesclagem de históricos.

Toda nova operação administrativa precisa receber `organizationId` e passar pelo middleware de organização. Na consulta, inclua novamente o escopo, inclusive ao percorrer relações de campanha, edição, equipe e arquivos. Administrador global gerencia organizações e membros; não recebe acesso automático a participantes ou saúde.

No primeiro envio, a credencial de rascunho prova o controle daquela ficha. O perfil só recebe o vínculo se o e-mail confirmado da conta corresponder ao fornecido na inscrição. Vínculos posteriores são individuais. A revisão manual exige organizador, inscrição da sua organização, conta pessoal previamente verificada e registro do motivo.

## Preservação e concorrência

FormVersion representa uma configuração completa. Não atualizar uma versão publicada. A ficha antiga permanece vinculada aos rascunhos iniciados e às inscrições enviadas; somente novos rascunhos usam a publicação mais recente.

O snapshot da inscrição e sua origem são protegidos no banco. Saúde é registrada separadamente. O aceite registra o texto e a versão dos termos, a data e escolhas independentes de imagem/responsável.

O envio bloqueia o rascunho durante a transação e utiliza `draftId` único, tornando reenvios idempotentes. Confirmações bloqueiam a campanha; depois contam confirmados e decidem vaga ou espera. Diminuir capacidade utiliza o mesmo bloqueio, evitando corrida com confirmações.

## Testes que novas mudanças precisam preservar

- Conta sem vínculo e membro suspenso não acessam a organização.
- Identificadores de outra paróquia falham nas consultas e mutações.
- Cadastro de participante não eleva seu papel.
- Convite simultaneamente aceito por duas requisições produz somente um vínculo.
- Rascunho/foto são acessíveis somente com credencial correspondente.
- Respostas administrativas comuns não contêm saúde.
- E-mail ausente não impede inscrição, mas impede vínculo automático de perfil.
- Aprovar não confirma vaga; confirmar simultaneamente não ultrapassa capacidade.
- Escolher equipe como preferência não equivale à alocação definitiva.
- Publicar nova ficha não exige respostas novas de rascunhos antigos.
- Perfil pessoal não altera dados, fotos nem termos de fichas históricas.

## Evolução posterior

Pagamentos devem acrescentar um processo próprio sem substituir o estado da inscrição. Galerias precisam de autorização independente das fotos de identificação. Check-in e alojamentos devem se associar à edição e à participação confirmada. Aplicativo nativo poderá consumir a mesma API. Funcionalidades sociais devem nascer sobre contas e vínculos autorizados, sem tornar cadastros das paróquias públicos.
