# Histórico agregado de acessos ao cartaz

Publicação autorizada em 26/10/2026 para o repositório `fortmetais/eventos` e o site `facnsaloanda.com.br`. A tabela foi aplicada ao Supabase, com as cinco colunas, RLS e bloqueio de acesso direto pelos papéis do navegador conferidos. As 50 colunas da conferência de atualizações passaram. As sincronizações seguintes continuam sob pedido do usuário.

Quando a pessoa abre o cartaz em uma aba visível, o navegador registra uma visualização. Ao clicar em **INSCRIÇÃO**, registra um clique e mantém a abertura normal do Google Forms. Recarregar a página conta outra visita; alternar entre abas não duplica a visualização. A contagem representa visitas e cliques, não pessoas únicas nem inscrições concluídas.

## Informações armazenadas

A tabela `acesso.visitas_site` mantém apenas totais por dia de Brasília e faixa de largura da tela:

- `SMALL`: até 767 pixels.
- `MEDIUM`: de 768 a 1023 pixels.
- `LARGE`: a partir de 1024 pixels.

Colunas: `dia`, `tela`, `visualizacoes`, `cliques_inscricao`, `atualizado_em`. A chave é `(dia, tela)`. São no máximo três linhas por dia, independentemente da quantidade de acessos, com incrementos atômicos para visitas simultâneas. A faixa de tela é uma aproximação de apresentação, não identificação do aparelho.

Não são gravados IP, localização, nome, e-mail, identificador, navegador, referência de origem, caminho ou parâmetros da URL. O script não usa cookies, armazenamento local, identificadores de sessão ou solicitações periódicas. A requisição de contagem omite cookies e referência da página. A tabela tem RLS e acesso direto revogado para `PUBLIC`, `anon` e `authenticated`; somente a API grava pelo banco configurado no servidor.

## Funcionamento e limites

O coletor público recebe `POST /api/v1/public/site-visits` com apenas `event` (`view` ou `registration_click`) e `screen`. Rejeita campos extras e requisições de outras origens. Limita a 30 requisições por minuto por IP em memória; o IP não é salvo no histórico. Descarta pré-carregamento e robôs reconhecidos. Robôs que executam JavaScript ou pessoas que recarregam a página ainda podem influenciar as contagens. Bloqueadores, falhas de rede ou limites também podem reduzir os totais.

A CSP permite apenas conexões ao próprio site para o cartaz com contagem ativa. Nenhuma chave Supabase é enviada ao script. Se o banco estiver indisponível ou a tabela ainda não existir, o coletor falha sem interromper o cartaz ou a inscrição; não cria filas ou tentativas automáticas. A API registra um aviso sem detalhes privados. Se o Supabase já estiver pausado, esse histórico não reativa o projeto.

No modo temporário totalmente isolado (`APPLICATION_TEST_ACCESS=false`), o cartaz continua sem instanciar o banco e sem coletar visitas. Na configuração atual de testes da aplicação (`APPLICATION_TEST_ACCESS=true`), `SITE_VISIT_TRACKING_ENABLED` controla o recurso (padrão `true`). Definir `false` desativa o script e o coletor, sem excluir o histórico existente.

## Supabase gratuito

As visitas reais passam a gerar gravações úteis no banco e podem contribuir para a atividade considerada pelo Supabase. Não é garantia de evitar a pausa: se houver poucas visitas, ou nenhuma, o projeto ainda poderá ser pausado. Não há cron ou tráfego artificial. Consulte a [política oficial de pausas](https://supabase.com/docs/guides/platform/free-project-pausing).

## Ativação e consulta

Antes da publicação, aplicar `database/manual/15_historico_acessos_site.sql` após a etapa 01. O script é aditivo e repetível; cria somente a tabela de contagens, sem alterar cadastros existentes. A migração equivalente atende instalações completas e testes isolados. Não repetir todo o histórico Prisma sobre a base Supabase importada manualmente.

A conferência de atualizações inclui as cinco colunas. Para consultar o histórico no DBeaver, usar `deploy/supabase/CONFERIR_ACESSOS.sql`. Não há painel de estatísticas nesta etapa.

## Conferência manual

1. Abrir o cartaz: aparece uma visualização no dia e faixa correspondentes.
2. Alternar entre abas: não conta outra visualização. Recarregar: conta outra visita.
3. Clicar em INSCRIÇÃO: abre o formulário e incrementa somente o contador de cliques.
4. Conferir em computador e celular, sem envio de cookies no coletor.
5. Interromper o coletor ou simular falha no banco: cartaz, música e link continuam utilizáveis.
6. Confirmar que a tabela não contém dados pessoais e que requisições inválidas ou de outra origem não alteram os totais.

Verificação local em 26/10/2026: 301 testes da API e do banco isolado, 194 da interface, compilação e verificação de tipos aprovados. `npm run test:browser:visits` confirmou visitas e cliques em computador e celular, com a origem correta e sem envio de cookies. A verificação de gravação em produção será realizada após a publicação, sem criar inscrições ou enviar e-mails.
