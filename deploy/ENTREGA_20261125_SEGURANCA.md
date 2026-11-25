# Atualização de segurança — 25/11/2026

Atualiza `react-router-dom` e sua dependência `react-router` de 7.18.4 para **7.18.7**, e `express-rate-limit` de 8.7.1 para **8.7.5**. As duas dependências diretas ficam com versões exatas nos manifestos. O lockfile inclui a atualização transitiva de `set-cookie-parser` para 2.7.3, requerida pelo Router.

Avisos relacionados:

- [GHSA-2rq8-3rm6-2w8f](https://github.com/remix-run/react-router/security/advisories/GHSA-2rq8-3rm6-2w8f).
- [GHSA-qhgm-jj2j-75wj](https://github.com/remix-run/react-router/security/advisories/GHSA-qhgm-jj2j-75wj).
- [GHSA-cppf-2hm6-mrvm](https://github.com/express-rate-limit/express-rate-limit/security/advisories/GHSA-cppf-2hm6-mrvm).

## Verificação automática

`npm run build` continua executando `npm run dependencies:check` antes de compilar. O guard agora verifica as versões aprovadas de Router, Router DOM e Rate Limit, todas as cópias presentes no lockfile e as bibliotecas efetivamente resolvidas por cada consumidor. Também detecta divergência entre instalação e lockfile e rejeita prereleases. A linha 8 do Router abaixo de 8.5.1 não é aceita como segura simplesmente por ser numericamente maior que a linha 7.

As verificações anteriores de UUID/ExcelJS, body-parser, ip-address, multer, nodemailer e zod foram preservadas. Para atualizar dependências, usar npm **11.19.0 ou superior**, conforme o requisito já existente do projeto; versões anteriores podem desconsiderar overrides de dependências internas dos workspaces.

Testes do guard: `node --test scripts/check-dependency-security.test.mjs`. Além dos cenários de versões antigas e cópias aninhadas, existe um teste em subprocesso isolado que simula `Object.prototype.max` contaminado e comprova cinco respostas 200 e a sexta 429 com o limitador real. A simulação não acessa a API nem o banco de produção.

O teste do aviso do WhatsApp passou a aguardar a atualização assíncrona da interface, mantendo as mesmas verificações de texto, ausência de chamada à API e ausência de modal. Não houve mudança no comportamento da página.

## Entrega e retorno

Validação local aprovada: 601 testes da API com PostgreSQL descartável, 552 da interface e 31 do guard de segurança, além de tipos, compilação e inicialização compatível com a Hostinger. Os cinco percursos de navegador de inscrições, acesso/senha, convites, mensagens e dashboard passaram em computador e telas móveis, com serviços fictícios, preservando os controles de lista/cards e o comportamento do WhatsApp.

Esta entrega não modifica variáveis de ambiente, regras de negócio, perguntas, campanhas, cartaz ou estruturas do banco. Não executar SQL ou migrations para publicá-la.

Referência da nova versão: `release/20261125-security-updates`. A versão ativa anterior foi conferida na Hostinger como `b06f7703770d81778156cbfa94d2d3beb7f87917`; sua referência de retorno é `rollback/20261125-before-security-updates`. Cópias do código e relatórios de verificação ficam localmente em `.local/security-release-20261125`, fora do Git.

Em caso de falha que exija retorno, republicar a referência anterior sem restaurar ou apagar dados do banco. Esse retorno reintroduz as versões antigas dos pacotes; deve ser temporário, até corrigir a incompatibilidade e reaplicar a atualização de segurança.

Conferir o commit e o resultado efetivamente ativo na Hostinger depois do envio. O painel de vulnerabilidades pode continuar mostrando a análise anterior até a próxima varredura; o resultado isolado de `npm audit` também não substitui a conferência das versões e dos avisos dos mantenedores.
