# Correção das dependências — 26/10/2026

A auditoria inicial apontou sete avisos em cinco pacotes: Multer e body-parser com negação de serviço, Zod com consumo excessivo de memória, ip-address com custo excessivo na leitura de IPv6 e três avisos no interpretador de destinatários do Nodemailer.

| Pacote      | Versão anterior no lockfile | Versão corrigida instalada |
| ----------- | --------------------------- | -------------------------- |
| body-parser | 2.3.0                       | 2.4.0                      |
| ip-address  | 10.7.3                      | 10.7.5                     |
| multer      | 2.4.0                       | 2.5.0                      |
| nodemailer  | 10.0.16                     | 10.2.1                     |
| zod         | 3.25.76                     | 4.6.7                      |

O `package-lock.json` registra as versões e integridades verificadas. Multer, Nodemailer e Zod também têm suas versões mínimas atualizadas no manifesto da API. A atualização transitiva de body-parser trouxe a versão compatível corrigida do qs. A verificação `dependencies:check` passa a recusar cópias vulneráveis desses cinco pacotes, inclusive quando aninhadas, preservando a proteção anterior de UUID/ExcelJS. Uma auditoria atual continua necessária para detectar avisos futuros.

## Compatibilidade do Zod

- Respostas dinâmicas passam a declarar explicitamente chaves de texto em `z.record`.
- O aceite obrigatório preserva a mensagem em português com a nova configuração `error`.
- Identificadores do PostgreSQL usam `z.guid()` para preservar os UUIDs determinísticos gerados pela etapa SQL 11. A validação continua exigindo o formato hexadecimal 8-4-4-4-12; não exige bits de versão/variante RFC que os cadastros existentes não possuem.
- Foram adicionadas verificações para tipos de respostas, aceite, identificadores existentes e rejeição de uma coleção excessiva em processo isolado com memória limitada.

Essas adaptações seguem o [guia oficial de migração do Zod](https://zod.dev/v4/changelog). As correções correspondem aos avisos [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [Multer](https://github.com/advisories/GHSA-q7qp-rjg7-q26m), [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [ip-address](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5) e Nodemailer ([comentários](https://github.com/advisories/GHSA-8c8m-p3m8-cjg8), [grupos](https://github.com/advisories/GHSA-m943-m63m-w62w), [endereços entre delimitadores](https://github.com/advisories/GHSA-85x2-q946-cp5h)).

## Hospedagem e GitHub

A configuração de associação com o repositório havia sido removida depois da publicação anterior para atender à preferência de sincronização manual. Essa remoção explicava o aviso de GitHub desconectado no painel; o código continuava no GitHub.

Em 26/10/2026, a associação com `fortmetais/eventos`, branch `main`, foi restaurada e conferida pela API da Hostinger. A opção `is_enabled: false` mantém o repositório conectado e ignora novos pushes, preservando a preferência de publicar somente sob pedido. Não remover novamente a associação para desligar publicações automáticas.

A versão `18fdb4087ecdb68a38d3a80b0e5f21b1531d1cbe` foi publicada em `facnsaloanda.com.br` pelo build `01a17825-e31f-73a2-a834-3cdefc8d23ee`, com estado final `completed`. A instalação na Hostinger e a verificação das versões corrigidas passaram. Não foi necessária alteração de tabelas ou colunas do Supabase.

## Verificação

Em 26/10/2026, `npm audit --json` retornou zero vulnerabilidades, incluindo dependências de desenvolvimento. Os 305 testes da API/PostgreSQL isolado e os 194 da interface passaram, assim como tipos, compilação, inicialização pelo carregador da Hostinger e percurso de visitas/cliques em computador e celular. Duas verificações de contagem de eventos foram limitadas às organizações do próprio teste para evitar interferência de outros testes executados em paralelo.

Na publicação, a auditoria da própria Hostinger retornou zero vulnerabilidades e a consulta de vulnerabilidades do site retornou lista vazia. Foram conferidos os 26 arquivos publicados da interface contra os arquivos compilados localmente, a página inicial, login, perfil, evento por UUID e endereço personalizado, banners para computador e celular, proteção da administração e prontidão da API/banco. Os percursos no navegador terminaram sem erros de página ou rolagem horizontal. Visitas e clique de diagnóstico foram confirmados no histórico agregado; não foram criadas inscrições nem enviados e-mails.
