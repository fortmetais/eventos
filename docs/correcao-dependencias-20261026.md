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

A última publicação utilizou o repositório `fortmetais/eventos`, mas a configuração de associação e implantação automática foi removida depois da publicação para atender à preferência de sincronização manual. Essa remoção pode explicar o aviso de GitHub desconectado no painel; não significa que o código deixou de existir no GitHub. A associação precisa ser restaurada e seu estado confirmado no painel, preservando a preferência de publicar somente sob pedido.

O conector oficial hospedado da Hostinger foi adicionado e autenticado nesta sessão. A conexão do GitHub no site e a publicação desta correção ainda precisam ser verificadas com as ferramentas de hospedagem; o cadastro do conector, por si só, não altera o site nem suas dependências em produção. Não há alteração de tabelas ou dados do Supabase nesta correção.

## Verificação

Em 26/10/2026, `npm audit --json` retornou zero vulnerabilidades, incluindo dependências de desenvolvimento. Os 305 testes da API/PostgreSQL isolado e os 194 da interface passaram, assim como tipos, compilação, inicialização pelo carregador da Hostinger e percurso de visitas/cliques em computador e celular. Duas verificações de contagem de eventos foram limitadas às organizações do próprio teste para evitar interferência de outros testes executados em paralelo.

A automação do painel pelo navegador foi interrompida pela ferramenta por não conseguir determinar a URL atual com segurança. O novo servidor `hostinger` está registrado e autenticado no perfil real do usuário, mas a sessão atual ainda não expõe suas operações de hospedagem. O guia do conector pede reiniciar o aplicativo para carregar um servidor recém-adicionado. A reconexão do repositório e a publicação devem ser concluídas após esse reinício; não considerar a auditoria do código local como confirmação da versão atualmente hospedada.
