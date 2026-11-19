# Refatoração e limpeza da base de código

Data: 19/11/2026. Entrega local, sem publicação ou operações de produção.

## Escopo e referência de comparação

A limpeza foi realizada incrementalmente sobre o estado local existente, preservando regras de negócio, permissões, contratos HTTP, configurações, variáveis de ambiente e migrações. A referência desta entrega é o snapshot `.local/refactor-20261119-baseline`, criado antes da refatoração.

O projeto já continha alterações locais da padronização de interface e de outras funcionalidades. Elas foram preservadas e revalidadas; não são apresentadas como novas alterações desta limpeza. O diff contra o último commit inclui esse trabalho anterior e, isoladamente, não delimita esta entrega.

A apresentação da lista/grid de inscrições e os botões disponíveis nessa área foram mantidos. Nenhuma candidatura foi incorporada, mensagem enviada ou dado de produção alterado durante a validação.

## Remoções comprovadas

| Item                                                              | Evidência e preservação da funcionalidade                                                                                                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/ImportedRegistrationCorrection.tsx`      | Componente antigo de correção com justificativa manual, sem referência no fluxo ativo. A edição vigente continua em `RegistrationCorrection`, com sua API e histórico preservados. |
| `apps/web/src/components/ImportedRegistrationCorrection.test.tsx` | Três testes exclusivos da interface antiga removida. Os testes da edição vigente permanecem.                                                                                       |
| `buildImportCatalog`                                              | Alias sem uso de `eventImportCatalog`, em `event-import-domain.ts`. A função efetivamente utilizada permanece.                                                                     |
| `suggestedEventMapping`                                           | Alias sem uso de `suggestEventMapping`, no mesmo módulo. A função efetivamente utilizada permanece.                                                                                |
| Imports e declarações sem uso                                     | Remoção apoiada pelo compilador e revisão de referências; sem remover propriedades de DTOs ou endpoints por ausência de consumidor no frontend.                                    |

Não foram removidos endpoints públicos, arquivos operacionais, configurações, migrações ou dependências. Foram preservados 26 exports de tipos/helpers com uso local ou relevância de compatibilidade: ausência de import externo não foi tratada como prova de código morto.

## Abstrações e organização do código

| Área                           | Alteração                                                                                                                                                 | Limite preservado                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Requisições do frontend        | `ApiRequestOptions` nomeia o contrato existente; `apiFieldErrorMessage` reúne a extração das mensagens de validação por campo.                            | Método, corpo, credenciais, sinal de cancelamento e fallback de erro dos consumidores permanecem equivalentes.                         |
| Entrada HTTP                   | `core/http-input.ts` concentra a leitura de JSON em requisições multipart.                                                                                | Cada consumidor conserva sua mensagem de erro e a validação posterior.                                                                 |
| Objetos históricos             | `core/json-object.ts` fornece `asJsonObject`, com retorno seguro para valores desconhecidos.                                                              | Arrays e valores primitivos não passam a ser tratados como registros históricos.                                                       |
| SMTP                           | `core/smtp-transport.ts` reúne host, porta, segurança e autenticação.                                                                                     | Timeouts específicos e os contratos de resultado dos remetentes foram mantidos.                                                        |
| Erros e registros operacionais | `core/operational-log.ts` centraliza eventos estruturados.                                                                                                | O tratamento HTTP e a restrição de registrar dados pessoais, corpos ou tokens permanecem.                                              |
| Correção de identidade         | `registration-corrections.identity.ts` isola a montagem da identidade após validação dos campos alterados.                                                | Apenas campos explicitamente corrigidos modificam a pessoa.                                                                            |
| Correspondência na importação  | `event-import-matching.ts` concentra identidade, comparação e mesclagem protegida.                                                                        | Correções posteriores da organização não são sobrescritas pelo reenvio do arquivo; identidade não provoca união automática de pessoas. |
| Contratos de fichas            | `FormConfiguration` e `FormQuestion` compartilhados em `@fac/form-layout`; aliases `FormConfig` e `Question` preservados para os consumidores existentes. | Consolidação em tempo de compilação, sem mudar o JSON transmitido nem substituir a validação da API.                                   |

### Separação de componentes extensos

- `Organization.tsx`: de **1.130 para 238 linhas**, extraindo dashboard, administração, membros, convites e o contexto da organização para módulos coesos. Os exports anteriores continuam disponíveis pelo mesmo caminho de importação.
- `ManageEvents.tsx`: de **891 para 399 linhas**, extraindo `CampaignEditor` e `FormVersionEditor`. A comparação dos corpos por AST confirmou equivalência, considerando a renomeação do antigo `FormBuilder`.
- `organization-context.ts` mantém o mesmo contrato de contexto e o mesmo hook, sem dependência circular de volta ao módulo de navegação.

A separação melhora a manutenção e a revisão sem introduzir novas telas, regras ou endpoints.

## Auditoria conservadora

Foi criado `scripts/audit-codebase.mjs`, que utiliza o TypeScript já instalado e funciona em modo somente leitura. A opção `--out` permite escrever apenas um relatório JSON sob `.local`; caminhos fora dessa pasta são rejeitados.

O inventário considera imports estáticos e dinâmicos, reexports, referências a assets, entrypoints públicos, scripts operacionais, testes e o pacote compartilhado. Referências operacionais a `apps/api/dist` são associadas às fontes correspondentes. Rotas HTTP são registradas como contratos protegidos, não como candidatas à remoção.

Resultados da revisão:

- Nenhum `any` explícito no código de produção. Permanecem 20 ocorrências em fixtures/mocks de testes legados; não são usadas na execução da aplicação. Ocorrências de `expect.any` e atributos como `step="any"` não foram contadas como tipagem genérica.
- Nenhuma declaração sem uso no código-fonte apontada pela verificação adicional do compilador. O parâmetro `mode` em `apps/web/vite.config.ts` permanece, por se tratar de configuração preservada.
- Nenhum candidato seguro à remoção de dependências.
- Nove arquivos CSS analisados com parser: nenhuma declaração idêntica repetida no mesmo bloco e nenhuma regra inteira idêntica no mesmo arquivo e escopo que justificasse remoção. Os estilos foram preservados.
- Hashes de **53 arquivos protegidos** conferidos sem alteração em relação ao snapshot de limpeza.

O relatório diferencia candidatos de constatações comprovadas. Imports dinâmicos não literais, consumidores externos e contratos de compatibilidade exigem revisão humana; a ferramenta não faz exclusões automáticas.

## Dependências sem import literal

Nenhum pacote foi removido do manifesto ou do lockfile. Os itens abaixo não aparecem como import literal de aplicação, mas têm uso identificado:

| Local          | Pacotes                                                                                                  | Motivo para manter                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| API            | `@types/cors`, `@types/express`, `@types/multer`, `@types/node`, `@types/nodemailer`, `@types/supertest` | Declarações de tipos consumidas pelo TypeScript e pelas bibliotecas correspondentes. |
| Frontend       | `@types/node`, `@types/react`, `@types/react-dom`                                                        | Tipagem do ambiente, do React e do DOM.                                              |
| API            | `prisma`                                                                                                 | Comandos de geração, migração e seed.                                                |
| API            | `tsx`                                                                                                    | Execução de desenvolvimento e scripts operacionais.                                  |
| API e frontend | `typescript`                                                                                             | Verificação de tipos e compilação.                                                   |
| Frontend       | `vite`                                                                                                   | Desenvolvimento, compilação e prévia.                                                |
| Frontend       | `jsdom`                                                                                                  | Ambiente de navegador configurado para os testes.                                    |
| Raiz           | `concurrently`                                                                                           | Inicialização conjunta da API e do frontend pelo comando de desenvolvimento.         |
| Raiz           | `prettier`                                                                                               | Comando de formatação do projeto.                                                    |

Ausência de import literal, portanto, não equivale a dependência dispensável. Overrides de segurança também foram preservados.

## Validação e situação da entrega

| Verificação                                     | Resultado registrado                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend isolado, com concorrência limitada     | **533 testes aprovados em 57 arquivos**. A base tinha 534 testes; foram acrescentados dois testes do helper de erros e removidos os três testes exclusivos da interface morta.                                                                                                                                                                                                                                                       |
| API, incluindo integração com banco descartável | **580 testes aprovados em 43 arquivos**. São 43 verificações adicionais de fronteiras/contratos em relação aos 537 testes da referência. A execução isolada da referência registrou 286 aprovados e 251 ignorados por dependerem do ambiente de integração, sem falhas.                                                                                                                                                              |
| Tipos normais dos workspaces                    | Aprovados.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Compilação de produção                          | Aprovada.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Auditor de código                               | Sintaxe, execução, ajuda e rejeição de saída fora de `.local` verificadas.                                                                                                                                                                                                                                                                                                                                                           |
| Pipeline completo com banco descartável         | **Aprovado: 580 testes da API e 533 da interface, total de 1.113 testes, sem falhas.** Também foram exercitadas instalação e reaplicação do SQL no banco descartável. A primeira execução teve um timeout no frontend com concorrência sem limite; a repetição completa com três workers passou, sem alterar testes ou limites de tempo. Log em `.local/refactor-database-final.log`. A instância temporária foi encerrada ao final. |
| Percursos locais de navegador                   | **11 rotinas Chromium aprovadas**, com serviços simulados e 154 capturas de tela. Resultados em `.local/refactor-browser/results.json`.                                                                                                                                                                                                                                                                                              |
| Preservação da lista/grid de inscrições         | **Sete variantes idênticas à referência**, tanto nos contratos de texto/controles quanto nos bytes das capturas PNG: lista desktop; cards desktop com três, quatro e cinco colunas; celular com 320, 390 e 430 pixels. Comparação em `.local/refactor-protected-comparison.json`, usando a referência anterior à limpeza em `.local/ui-ux-after/protected`.                                                                          |
| Safari/iPhone e Android reais                   | **Não executados em aparelhos reais.** Permanecem como validação manual. Emulação de navegador não substitui essa conferência.                                                                                                                                                                                                                                                                                                       |

O resultado isolado do frontend está em `.local/refactor-web-final.json`. A compilação final gerou os mesmos 37 arquivos, byte a byte, da versão utilizada nos percursos de navegador.

### Comandos para reproduzir

Na raiz do projeto, em PowerShell:

```powershell
npm run typecheck
npm run build
$env:VITEST_MAX_WORKERS = "3"
npm run test:database
node scripts/audit-codebase.mjs --out .local/refactor-codebase-audit.json
```

O teste de banco cria uma instância local descartável e deve ser executado com os binários PostgreSQL disponíveis. Ele não deve apontar para o Supabase de produção. A limitação de workers é aplicada à execução de testes, sem alterar a configuração do projeto.

## Pontos de atenção

- **Formato de log:** `form_banner_cleanup_failed` passa a ser emitido como JSON estruturado. Consumidores que dependam da antiga linha textual precisam ser conferidos. Não há alteração correspondente na resposta HTTP.
- **Bundle:** a compilação mantém aviso de entrada com aproximadamente **511,59 KB**, acima do limiar de 500 KB. A configuração e o limiar foram preservados. Uma otimização futura de carregamento deverá ser avaliada separadamente, com comparação visual e funcional.
- **Contratos públicos:** nenhuma mudança incompatível de HTTP foi identificada. Os aliases removidos não tinham consumidores identificados no repositório; integrações que importem diretamente esses detalhes internos devem ser verificadas antes da publicação.
- **Conferência manual:** revisar menus e retorno de navegação, lista/grid e ações do WhatsApp, edição da ficha e histórico, importação, criação/publicação de fichas e fluxo de convites em dispositivos reais.
- **Entrega:** sem push ao GitHub, sincronização com Hostinger, envio de mensagens ou alteração de dados e configurações de produção. A revisão visual local anterior à publicação permanece pendente de aprovação do usuário.
