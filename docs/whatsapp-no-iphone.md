# Abertura do WhatsApp na listagem

## Correção de 12/11/2026

A listagem abria `about:blank` antes de consultar o convite e redirecionava essa aba depois da resposta da API. No vídeo recebido de um iPhone, a aba permanecia vazia. O vídeo não permite concluir se houve bloqueio do navegador, falha de rede ou falha na abertura do aplicativo.

O botão agora prepara a mensagem dentro da própria listagem, sem abrir outra aba. Quando a consulta termina, o mesmo ícone se torna um link nativo para o WhatsApp, acompanhado da orientação **Mensagem pronta. Toque no WhatsApp para abrir.** O toque seguinte solicita a abertura da conversa. Não há modal adicional.

O link é consultado apenas para o candidato escolhido e permanece em memória por até um minuto, limitado também à validade do convite. Trocas de candidato, organização, situação, departamento, atualização da inscrição ou renovação do aviso descartam a preparação anterior. Links vencidos ou indisponíveis não são renovados automaticamente.

Preparar a mensagem e tocar no link não comprovam o envio. **Marcar como enviado** continua sendo uma ação explícita, disponível após solicitar a abertura. A cópia do link pessoal mantém seu funcionamento atual.

## Verificação

- No primeiro toque, conferir a indicação de preparação e a ausência de aba nova, inclusive com rede lenta ou erro na consulta.
- Quando a mensagem estiver pronta, conferir o link nativo, o telefone e a mensagem correspondentes à pessoa escolhida, usando dados fictícios.
- Abrir o link por toque ou teclado; conferir que nenhum envio é registrado antes de **Marcar como enviado**.
- Testar consulta indisponível, repetição, telefone inválido, convite vencido, mudança de candidato/departamento e expiração da preparação entre os dois toques.
- Conferir que os demais botões e filtros da listagem continuam funcionando no computador e celular.
- Repetir no iPhone físico com WhatsApp instalado, tanto na rede habitual quanto em outra rede. A simulação de navegador não comprova a abertura de um aplicativo externo no iOS.

Referência técnica: [ativação por interação do usuário no WebKit](https://webkit.org/blog/13862/the-user-activation-api/). O fluxo usa um novo toque no link final para evitar depender da ativação que existia antes da consulta assíncrona.
