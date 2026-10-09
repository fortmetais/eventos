# Cadastro de eventos — etapa inicial

O organizador que aceitou o convite agora encontra **Eventos** no painel da sua organização. A secretaria consulta os eventos; somente organizadores ativos podem criar ou editar. A função de administrador da plataforma não concede esse acesso automaticamente.

## Ativar no banco atual

1. No DBeaver, conecte ao banco **eventos_beta**, que já tem `acesso`, `organizacoes` e `pessoas`.
2. Abra e execute **inteiro e uma única vez** o arquivo `database/manual/05_eventos_e_periodos.sql`.
3. Atualize os esquemas no DBeaver. O novo esquema **eventos** terá `tipos_evento`, `eventos` e `campanhas`.
4. No site, entre com o organizador, abra **Eventos** e clique em **Atualizar eventos**. A API reconhece as tabelas sem reiniciar.

Para o cadastro atual com departamentos e vagas, execute também `06_fichas_servos_e_inscricoes.sql` e depois `08_departamentos_e_vagas.sql`, caso ainda não tenham sido aplicados. Não repita etapas concluídas. A tabela existente `eventos.equipes` representa os departamentos de trabalho. Consulte o [guia de departamentos](departamentos-e-vagas.md).

Não execute `db:migrate`, `db:deploy`, `db:seed` ou `db push` na base criada gradualmente. A migration correspondente atende instalações completas e bancos de teste.

`EVENT_MANAGEMENT_ENABLED` tem padrão `true`. Mantenha `EVENTS_ENABLED=false` nesta etapa: fichas, inscrições, equipes e divulgação pública ainda dependem das próximas tabelas.

## Arte do evento

O envio utiliza o projeto Supabase já configurado na API, em um bucket público separado chamado `artes-eventos`. A API prepara esse bucket no primeiro envio, se a chave de servidor tiver permissão. Não precisa configurar SMTP para enviar imagens. É possível definir outro nome com `SUPABASE_ARTWORK_BUCKET` no `.env` da API.

Aceita JPEG, PNG e WebP de até 10 MB, sem animação. O servidor verifica a imagem real e gera WebP de até 1080 × 1920, preservando a proporção, sem cortar textos. A proporção recomendada é **9:16 vertical**. O arquivo original não é armazenado. A prévia usa somente uma URL temporária do navegador.

A arte é material de divulgação pública, inclusive durante a preparação. Fotos de identificação permanecem no bucket privado `identificacao`. No PostgreSQL são gravados a URL permanente, o nome do bucket e a chave do arquivo. Se houver falha ao guardar o evento, a API tenta remover a nova arte; se a substituição for concluída, tenta remover a anterior. Falhas de remoção são registradas sem dados pessoais e podem exigir limpeza posterior do Storage.

## Roteiro de teste

1. Entre como organizador convidado, abra sua organização e escolha **Eventos → Novo evento**.
2. Preencha nome, tipo, local, cidade e descrição. Deixe a opção de vários dias desmarcada para testar um evento de um dia.
3. Informe abertura e encerramento de servos e campistas. Os horários são de Brasília; pode abrir campistas antes de servos e sobrepor os períodos.
4. Cadastre os departamentos e as vagas, por exemplo MANUTENÇÃO: 5, ANJO: 3 e LÍDER: 2. Escolha uma arte vertical e confira a prévia. Salve. O evento deve aparecer **Em preparação**, com departamentos, períodos e imagem.
5. Recarregue a página. As informações devem permanecer. Edite para vários dias, altere um período e salve sem escolher outra arte: a imagem anterior deve permanecer.
6. Edite novamente e selecione outra arte: a nova deve substituir a anterior.
7. Teste um encerramento anterior ou igual à abertura: o envio deve ser impedido e os campos preservados.
8. Entre com secretaria: poderá consultar, sem botão de criação. Outra organização, participante comum, membro suspenso e administrador sem vínculo não podem criar ou alterar esses eventos, inclusive pela API.
9. No celular, os períodos ficam um abaixo do outro e a arte deve aparecer inteira.

O evento e as duas campanhas são salvos na mesma transação. Vagas e lista de espera podem ser preparadas agora; vagas podem ficar pendentes, mas precisarão ser definidas antes de publicar campistas. Salvar não abre inscrições nem publica o evento. O próximo fluxo será configurar e publicar as fichas.

## API e organização MVC

- `GET /api/v1/organizations/:organizationId/event-setups`: consulta administrativa.
- `POST /api/v1/organizations/:organizationId/event-setups`: cria evento e dois períodos.
- `PUT /api/v1/organizations/:organizationId/event-setups/:eventId`: edita um evento em preparação e seus períodos.

POST e PUT recebem JSON `{ event, campaigns }` ou `multipart/form-data` com `data` (esse JSON) e `artwork` (arquivo opcional). A organização é determinada pelo endereço e pelo vínculo verificado no servidor. Rotas → controller → service (validação, imagem, transação e regras) → repository/Prisma → PostgreSQL; a View é o React.

`npm run test:database` valida as seis tabelas iniciais, as nove desta etapa e as migrations completas em bases temporárias separadas. Nenhuma base existente é usada.
