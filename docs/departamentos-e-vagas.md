# Departamentos e vagas de servos

O organizador cadastra os departamentos ao criar o evento, por exemplo MANUTENÇÃO, ANJO e LÍDER. Cada departamento pertence àquela edição e possui sua própria capacidade. Não há departamentos globais compartilhados entre paróquias.

## Ativação pelo DBeaver

1. Conecte ao banco `eventos_beta`.
2. Depois dos SQLs 05 e 06, execute **08_departamentos_e_vagas.sql** inteiro, uma única vez. O SQL 07 de avisos pode ser aplicado separadamente.
3. Atualize a página da aplicação. Se estiver rodando uma versão anterior, reinicie a API e a interface.

O script acrescenta `vagas` à tabela existente `eventos.equipes`. Esses cadastros passam a representar os departamentos de trabalho. O vínculo existente `inscricoes.inscricoes.equipe_id` é preservado. Não são criadas tabelas duplicadas nem removidos dados. O Prisma usa `Team.capacity` com `@map("vagas")`; os nomes internos das rotas permanecem compatíveis.

Departamentos antigos ficam com `vagas = NULL`, pois não há como deduzir sua capacidade real. Na tela **Candidaturas de servos**, selecione o evento e preencha as vagas de cada departamento. Enquanto a capacidade não estiver definida, novas alocações e novas publicações da ficha são bloqueadas. A consulta de inscrições e de fichas antigas continua funcionando antes de aplicar o SQL 08.

O índice impede nomes repetidos por evento, ignorando maiúsculas e espaços repetidos. Caso existam duplicados anteriores, o script falhará sem alterar a base. Faça `ROLLBACK`, confira os nomes e corrija os duplicados antes de executá-lo novamente. Não reaplique os SQLs anteriores nem execute migrations completas sobre a base gradual.

## Utilização

1. **Organização → Eventos → Novo evento:** informe os dados, períodos e os departamentos, com nome e vagas. Use **Adicionar departamento** para incluir mais linhas. É obrigatório pelo menos um departamento; máximo de 30. Zero vagas bloqueia novas alocações naquele departamento.
2. Salve o evento. Em preparação, a edição dos departamentos preserva seus identificadores. Não se permite excluir um departamento com inscrições nem renomear/remover departamentos de fichas publicadas.
3. Abra **Ficha de servos**. As preferências são obtidas dos departamentos do evento. O candidato pode escolher até três; a escolha não reserva vaga.
4. Depois de aprovar uma candidatura, escolha o departamento e clique em **Salvar departamento**. A alocação ocupa uma vaga imediatamente.
5. Na avaliação, selecione o evento para ver as vagas totais, ocupadas e disponíveis e para ajustar os limites. Diminuir abaixo do número de servos alocados é bloqueado. Ao adicionar outro departamento após publicar a ficha, publique uma nova versão para oferecer a opção aos novos candidatos.
6. Confirme a participação conforme o fluxo de presença já existente. Um servo aprovado e alocado, ao ser confirmado, continua ocupando a mesma vaga. Recusa, cancelamento ou entrada em lista de espera liberam a alocação. Trocar o departamento libera a vaga anterior somente se houver espaço no destino.

As capacidades dos departamentos são independentes da capacidade de campistas. Quando houver capacidade geral para a campanha de servos, a confirmação também respeita esse limite. Não são enviados avisos nem aceitas candidaturas automaticamente ao cadastrar um departamento.

## Roteiro de validação

1. Crie um evento com MANUTENÇÃO: 1 vaga, ANJO: 2 vagas e LÍDER: 1 vaga. Confira o total de 4 vagas e os mesmos departamentos ao reabrir a edição.
2. Tente repetir um nome com espaços/maiúsculas diferentes e informar uma quantidade negativa ou fracionada: o evento não deve ser salvo.
3. Publique a ficha e confirme que as opções correspondem aos departamentos do evento. Verifique também um evento com somente um departamento.
4. Aprove dois servos. Aloque o primeiro em MANUTENÇÃO e tente alocar o segundo: a segunda alocação deve ser impedida. Repita com duas sessões simultâneas; apenas uma deve ocupar a última vaga.
5. Tente reduzir MANUTENÇÃO a zero com um servo alocado: a alteração deve ser impedida. Aumente para duas vagas e aloque o segundo.
6. Troque um servo para ANJO e confira a disponibilidade nos dois departamentos. Confirme e cancele essa participação: a vaga em ANJO deve ser liberada.
7. Acesse por um organizador de outra paróquia e por uma conta de secretaria: não devem conseguir criar departamentos, modificar vagas nem alocar servos dessa organização.
8. Confira que mudar a capacidade não altera a preferência registrada nem a versão de fichas anteriores.

## Verificação técnica

`npm run test:database` executa migrations e SQLs em bases temporárias, com concorrência e isolamento entre organizações. Não utiliza `eventos_beta`. Os testes de navegador usam dados fictícios, sem criar eventos reais ou enviar mensagens.

`GET /api/v1/readiness` informa `departmentsReady`. O comando `npm run db:check` também informa se o SQL 08 está pendente, sem modificar o banco.
