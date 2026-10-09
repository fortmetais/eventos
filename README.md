# Encontro — plataforma de acampamentos e eventos

Aplicação web em português, com React/TypeScript e API Node.js/Express organizada em MVC com services e repositories. A vitrine segue a referência de cards por paróquia. Inscrições de campistas e candidaturas de servos funcionam sem conta obrigatória.

## O que está implementado

- Administração de organizações, convites com prazo e uso único, membros, suspensão e permissões por organização.
- Edições, tipos de evento, campanhas independentes de campistas/servos, períodos no horário de Brasília, pausa e capacidade.
- Departamentos e vagas definidos ao criar o evento, preferências vinculadas à ficha e alocação com limite transacional. Ative com o SQL 08; veja o [guia de departamentos](docs/departamentos-e-vagas.md).
- Fichas com base comum, perguntas adicionais, prévia, versões e publicação imutável.
- Ficha de intenção para servos baseada no PDF de referência, com experiência, sacramentos, formação, paróquia, camiseta, até três equipes e aceites de preparação e regras; disponível também na instalação gradual.
- Vitrine com busca por evento/paróquia, cidade, paginação, página do evento e links próprios das campanhas.
- Inscrição em cinco etapas, rascunho no servidor, foto com enquadramento, saúde condicional, emergência, responsável para menores, termos e protocolo idempotente.
- Análise, histórico de decisões, confirmação com controle transacional de vagas, lista de espera, equipes e alocação de servos.
- Avisos de aceite/recusa por e-mail, mensagem pronta para WhatsApp e link pessoal para confirmação de presença pelo candidato. Consulte o [guia de mensagens e confirmação](docs/avisos-e-presenca.md) para ativar o SQL 07.
- Área de saúde separada e autorizada por evento, com auditoria das consultas.
- Perfil opcional com acesso por código, vínculo individual comprovado, inscrições próprias e foto independente das fichas antigas.
- Vínculo manual pela API, restrito ao organizador, após comprovação documentada. Nenhum histórico é agrupado por CPF ou telefone.

As integrações reais de autenticação, e-mail e fotos precisam de um projeto Supabase e configuração de envio de e-mails. Não há credenciais embutidas nem autenticação fictícia na aplicação.

## 1. Preparar o ambiente

Use Node.js 24 LTS e npm. Execute na raiz:

```powershell
npm install
if (-not (Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
npm run db:generate
```

Edite `apps/api/.env`:

| Variável                    | Finalidade                                                                        |
| --------------------------- | --------------------------------------------------------------------------------- |
| `DATABASE_URL`              | Conexão PostgreSQL utilizada pela API                                             |
| `DIRECT_URL`                | Conexão de migrations; pode utilizar o session pooler se a máquina não tiver IPv6 |
| `SUPABASE_URL`              | Endereço do projeto                                                               |
| `SUPABASE_ANON_KEY`         | Chave pública de autenticação                                                     |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave privada, somente no servidor                                                |
| `SUPABASE_PRIVATE_BUCKET`   | Bucket de identificação; padrão `identificacao`                                   |
| `WEB_URL`                   | Origem da interface; localmente `http://localhost:5173`                           |
| `SMTP_*`                    | Envio dos convites da organização                                                 |

Utilize a conexão do PostgreSQL como `postgres` ou outro papel do servidor que possa operar as tabelas protegidas. Não use as credenciais `anon` ou `authenticated` como usuário de banco. No Supabase, prefira session pooling na porta 5432 para desenvolvimento e migrations. Não compartilhe `.env`.

### Banco local criado pelo DBeaver

A configuração privada local fica em `apps/api/.env`, com `DATABASE_URL` e `DIRECT_URL` apontando para `eventos_beta`, no PostgreSQL local. O arquivo é ignorado pelo Git; não copie a senha para exemplos, telas ou documentação. `apps/api/.env.example` contém apenas o formato para referência.

Confirme a conexão na raiz com:

```powershell
npm run db:check
```

Esse comando verifica as seis tabelas e executa consultas pelos seis modelos Prisma mapeados. O Prisma já usa os nomes em português de `acesso`, `organizacoes` e `pessoas`. Não aplica migrations nem altera registros. **Não execute `db:deploy`, `db:migrate`, `db:push` ou a carga demonstrativa nessa base parcial criada no DBeaver.** A baseline das migrations será definida para esse percurso antes de adotá-las nessa base. O bootstrap de administrador pode ser usado após configurar e confirmar a identidade no Auth.

O `.env` local usa a porta 3086 e a origem `http://localhost:5174`. Com `EVENTS_ENABLED=false`, organizações, membros, convites e perfil básico funcionam sem consultar tabelas futuras. O cadastro gradual de eventos é habilitado separadamente por `EVENT_MANAGEMENT_ENABLED=true` (padrão). Execute `database/manual/05_eventos_e_periodos.sql` no DBeaver para criar `eventos.tipos_evento`, `eventos.eventos` e `eventos.campanhas`, já mapeadas no Prisma. Siga o [roteiro de configuração e teste dos eventos](docs/eventos-etapa-inicial.md). A API reconhece a estrutura sem migrations ou reinício.

Para ativar a ficha de servos após a etapa de eventos, execute `database/manual/06_fichas_servos_e_inscricoes.sql` no DBeaver e prepare as fotos com `npm run storage:setup`. Mantenha `EVENTS_ENABLED=false`; `VOLUNTEER_REGISTRATIONS_ENABLED=true` é o padrão e libera esta etapa quando suas tabelas existirem. Atualize a página para carregar a nova navegação. Siga o [roteiro da ficha e avaliação de servos](docs/ficha-servos.md).

O proxy da interface lê apenas a porta da API; credenciais não entram no bundle. Os 19 modelos de negócio já estão mapeados nos esquemas em português. As migrations de adaptação de esquemas servem para instalações completas legadas/testes; não devem ser aplicadas à base parcial criada no DBeaver. `db:check` confere também os modelos de eventos, inscrições e avisos quando essas etapas já foram criadas.

Para uma instalação completa seguindo as migrations originais em uma base nova separada:

```powershell
npm run db:deploy
npm run storage:setup
npm run dev
```

Interface: `http://localhost:5173`. API: `http://localhost:3085/api/v1`.

Na configuração local atual, a API usa 3086 e a interface usa 5174, conforme `PORT`/`WEB_URL` do `.env` da API. O Vite mantém a porta da interface fixa para corresponder aos redirecionamentos do Auth; se estiver ocupada, ajuste a configuração conscientemente. `API_PROXY_TARGET` pode sobrescrever o destino do proxy. A prévia atual usa `eventos_beta` e a etapa administrativa; não há autenticação fictícia. Confira a configuração do Supabase em cada ambiente com `npm run auth:check`.

## 2. Configurar o Supabase

Siga o [passo a passo de criação do projeto e ativação do Auth](deploy/supabase/CONFIGURAR_AUTH.txt), que inclui os testes iniciais e o primeiro administrador. O PostgreSQL de negócio continua local em `eventos_beta`. Para as chaves atuais, preencha `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY` apenas no `.env` privado da API; as variáveis legadas também são aceitas. O comando `npm run auth:check` verifica a configuração por consultas somente leitura, sem criar contas nem enviar e-mails.

No Auth, habilite e-mail. A tela aceita senha, link de acesso e código. Para enviar código, o template de Magic Link precisa apresentar `{{ .Token }}`; projetos gratuitos novos precisam de SMTP próprio para personalizar esse template. Configure o Site URL e os redirecionamentos permitidos, incluindo `/nova-senha` e `/entrar` com o parâmetro `next` descrito no guia. Configure o SMTP do Supabase para entrega confiável de códigos e recuperação; esse envio é separado do SMTP de convites da API.

O convidado volta ao convite após o login e confirma o aceite antes de receber o vínculo. Ao aceitar, entra no painel da organização que o convidou. Na etapa administrativa, um membro com apenas um vínculo entra diretamente no seu painel; vários vínculos abrem a seleção de organizações. A mensagem de cadastro de paróquias é exclusiva do administrador da plataforma. Uma conta sem vínculo recebe orientação para aceitar o convite, sem acesso à administração global.

Uma conta nova também mantém o retorno ao convite durante a confirmação por e-mail e a definição de senha. A URL carrega `next`; uma credencial de retorno válida por 24 horas permite retomar em outra aba do mesmo navegador e origem. O contexto só é removido após aceitar ou escolher **Continuar depois**. A confirmação do e-mail não cria um vínculo administrativo automaticamente. Para testar esse fluxo no navegador sem enviar e-mails nem criar usuários reais, execute `npm run test:browser:invitation` com a aplicação local em execução; o script usa respostas simuladas apenas no teste.

O comando `storage:setup` cria/verifica um bucket **privado**, limitado a imagens WebP otimizadas. Ele recusa um bucket existente público. Não crie políticas que permitam ao navegador acessar diretamente fotos de identificação.

As migrations habilitam RLS e retiram acesso de `PUBLIC`, `anon` e `authenticated` às tabelas de negócio. React acessa os dados pela API; autenticação usa o cliente Supabase. URLs de fotos são assinadas por dois minutos e emitidas após verificação de escopo.

## 3. Provisionar o primeiro administrador

1. Entre na interface com seu e-mail e confirme o código, criando a conta Supabase.
2. Localize o ID dessa conta no painel Auth do Supabase.
3. Preencha `BOOTSTRAP_ADMIN_USER_ID` no `.env` da API.
4. Execute `npm run admin:bootstrap` na raiz.
5. Atualize a sessão na interface e abra **Administração**.

O comando valida a conta e seu e-mail confirmado. Não existe endpoint público para promover administradores. Cadastrar-se por conta própria concede somente uma conta pessoal.

## 4. Validar o primeiro fluxo

Para a etapa administrativa atual, use o roteiro no arquivo `deploy/supabase/CONFIGURAR_AUTH.txt`. A sequência completa abaixo depende das tabelas dos próximos módulos e de `EVENTS_ENABLED=true`; mantenha esse recurso desabilitado na base parcial.

1. Administrador cadastra a paróquia e envia um convite de organizador.
2. Organizador entra com o e-mail convidado e aceita o link de uso único.
3. Em **Eventos e fichas**, cria a edição e configura separadamente as campanhas.
4. Configura e publica a ficha de cada campanha; depois publica a edição.
5. Compartilha o link da campanha ou abre a vitrine pública.
6. Pessoa preenche a ficha, usa uma foto e recebe o protocolo, sem login obrigatório.
7. Secretaria encaminha a ficha para análise e aprovação. Organizador cria equipes e aloca servos aprovados.
8. Confirmações de campistas respeitam a capacidade, inclusive quando feitas simultaneamente.
9. Quem informou e-mail pode entrar por código e voltar à confirmação para vincular a inscrição ao perfil.

Uma confirmação que encontra a capacidade esgotada gera lista de espera quando habilitada. Sem lista, devolve um erro e preserva o estado anterior. Ser aprovado ainda não ocupa uma vaga.

## Testes e dados demonstrativos

```powershell
npm run typecheck
npm run build
npm test
npm run test:database
```

`npm run test:browser` confere desktop/celular, busca e retomada do rascunho na prévia demonstrativa local. Configure `PREVIEW_URL` se necessário. Ele abre um navegador de teste separado e salva imagens em `.local/screenshots`; no Windows usa o Chrome instalado e aceita `CHROME_PATH`. Antes de iniciar a ficha, confira que o banco contém somente demonstrações. Em outras plataformas, instale o navegador com `npx playwright install chromium`.

`npm run test:browser:initial` confere a etapa administrativa, API pronta e login protegido no desktop/celular, sem autenticar, cadastrar dados ou enviar e-mails. Use essa checagem com `EVENTS_ENABLED=false`.

`npm test` executa testes de regras e da interface. Os testes de integração são ignorados quando `TEST_DATABASE_URL` não está presente. `npm run test:database` cria um PostgreSQL local **isolado**, aplica as migrations, executa toda a suíte e encerra esse servidor. Ele não utiliza bases existentes. No Windows, procura os binários em `C:/Program Files/PostgreSQL/12/bin`; use `PG_BIN` para outro local. Em outras plataformas, instale os binários e configure `PG_BIN`.

Também é possível executar a suíte com `TEST_DATABASE_URL` apontando para um banco exclusivo chamado `fac_tests`. Os testes usam PostgreSQL real; Auth, Storage e e-mail são substituídos somente por dependências injetadas no teste. Não há rotas de teste ou alternativa de autenticação no servidor de produção.

Para demonstrar a vitrine em uma base de desenvolvimento:

```powershell
$env:SEED_DEMO = 'true'
npm run db:seed
```

A carga é idempotente, cria duas organizações e seis eventos identificados como demonstração e não cria contas administrativas. Não permite execução com `NODE_ENV=production`.

## Arquitetura e manutenção

`apps/web` contém as telas React. `apps/api/src/modules` contém os módulos de organizações, eventos, inscrições, mídia e perfis. Cada um separa rotas/controller, service e repository. As validações específicas acompanham o módulo. `core` concentra autenticação, erros, banco e integrações.

Controllers traduzem HTTP. Services aplicam regras e escopo. Repositories acessam o banco. Transações que envolvem várias entidades ficam no service, usando o Prisma disponibilizado pelo repository. Nenhuma tela faz consultas diretas às tabelas Supabase.

Consulte `docs/desenvolvimento.md` para o guia de continuidade e `docs/api.md` para os contratos e exemplos. A API também publica sua descrição em `/api/v1/openapi`.

## Operação

- Rascunhos expiram em 14 dias; o navegador guarda somente ID, token e vencimento. Saúde fica no servidor.
- `npm run drafts:cleanup` remove rascunhos expirados não enviados e seus arquivos. Inscrições enviadas são preservadas. Programe a execução na infraestrutura escolhida.
- Fotos originais não são persistidas; as versões de identificação são WebP de 500 × 500.
- Alterações de estado e leituras de saúde têm auditoria. Logs de falhas não incluem corpos, consultas SQL, tokens ou dados pessoais.
- `/health` verifica o processo; `/readiness` verifica a conexão do banco. Monitoramento externo pode consultar esses caminhos.
- Em produção, configure `NODE_ENV=production`, `WEB_URL` HTTPS e `HOST=0.0.0.0` quando em container. `TRUST_PROXY=1` somente atrás do proxy único preparado.
- Dockerfile e Compose preparam API e interface com Nginx; HTTPS e o provedor devem ser configurados no ambiente de publicação. Não foram publicados serviços externos.
- Faça backups independentes do banco e dos arquivos; restaure uma cópia em homologação e confira protocolos, fichas e fotos antes do piloto. Nunca teste migrations na base com inscrições reais.

Antes do piloto real, configure Supabase e e-mails, execute a homologação com duas organizações, revise os termos com os responsáveis, teste HTTPS, recuperação de acesso e restauração de backup. Pagamentos, galerias, check-in, alojamentos, rede social e aplicativo nativo permanecem fora desta versão.
