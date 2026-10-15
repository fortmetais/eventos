# Cadastros anteriores e autopreenchimento

No painel da organização, **Cadastros anteriores** é acessível somente ao organizador. A base é independente das pessoas e inscrições atuais: não vincula contas, históricos ou aceites.

## Instalar e ativar

Na instalação gradual, aplicar **somente** `database/manual/13_cadastros_anteriores.sql`, após as etapas 01/02/03. O script é aditivo e pode ser reaplicado. Não executar o histórico de migrations na base gradual. A migration equivalente existe para instalações completas e testes novos.

As APIs administrativas funcionam quando as novas tabelas existem, mesmo com `REGISTRATION_PREFILL_ENABLED=false`, que é o padrão. Primeiro importe um lote, revise as pendências e confira os cadastros. Depois defina `REGISTRATION_PREFILL_ENABLED=true` no ambiente da API e reinicie a aplicação. `/api/v1/config` informa a disponibilidade efetiva; sem a etapa de banco, a consulta permanece desativada.

## Importar

1. Envie `.xlsx` de até 10 MB, até 100 colunas e 5.000 respostas somadas entre as abas. Arquivos com macros e arquivos descompactados acima de 50 MB são recusados.
2. Escolha a aba e confira as colunas de nome completo, nascimento e celular, obrigatórias. Cidade, sexo e camiseta são opcionais. As demais respostas ficam preservadas no painel.
3. Prepare a prévia. Nenhum cadastro fica disponível publicamente nesta etapa. O endereço do lote permite retomar a revisão.
4. Corrija os campos inválidos. Nas coincidências de nome/nascimento, decida manter como cadastro distinto, descartar a linha ou atualizar explicitamente um cadastro existente. Duas linhas com a mesma identificação completa não podem ser confirmadas juntas.
5. Confirme após resolver todas as pendências. A confirmação é transacional e idempotente. Reenviar exatamente o mesmo arquivo/aba retoma o mesmo lote, mesmo com outro nome de arquivo. Uma nova versão do arquivo passa por nova revisão, comparando os cadastros já importados.

Cada cadastro aprovado recebe um UUID. Atualização explicitamente aprovada conserva esse UUID; as linhas e lotes anteriores continuam preservados. Respostas completas e links de fotos aparecem como texto somente ao organizador. Não são baixadas fotos externas nem executadas fórmulas ou links; fórmulas usam somente resultados já salvos.

Nomes ignoram acentos, caixa e espaços extras. Não são inferidas abreviações, apelidos ou erros de escrita. Nascimento usa datas reais de Excel, ISO ou DD/MM/AAAA; não se calcula a partir da idade. Telefones são comparados sem formatação e com equivalência entre números brasileiros com ou sem +55. Não se inventa DDD ou nono dígito. Camisetas são normalizadas para as opções atuais; valores desconhecidos ficam na resposta original e não são sugeridos.

## Ficha pública

Depois de preencher nome, nascimento e celular, uma correspondência única na organização da campanha permite preencher campos vazios de cidade, sexo e camiseta. O candidato vê **“Dados anteriores preenchidos. Confira antes de continuar”** e pode editar tudo.

Campos ocultos, inexistentes ou com opções incompatíveis não são sugeridos. Respostas já digitadas ou retomadas não são substituídas. Resultados atrasados de outra identificação são ignorados. Falhas na consulta não impedem o preenchimento normal.

Paróquia, sacramentos, saúde, foto, contatos de terceiros, preferências do evento e aceites nunca integram a resposta pública. Não há código no celular, login automático, confirmação de identidade ou união de pessoas/históricos nesta versão.

## Contratos

- `GET /organizations/:organizationId/participant-imports`: disponibilidade e últimos lotes.
- `POST .../participant-imports/inspect`: multipart `file`; abas, cabeçalhos e mapeamento sugerido.
- `POST .../participant-imports/preview`: multipart `file`, `sheet`, `mapping` JSON. Mapeamento por índices começando em zero; `name`, `birthDate`, `phone` obrigatórios; `city`, `sex`, `shirt` podem ser `null`.
- `GET .../participant-imports/:importId?page=1&pageSize=50`: resumo e revisão paginada.
- `PUT .../participant-imports/:importId/rows/:rowId`: `{ values: { name,birthDate,phone,city,sex,shirt }, decision: KEEP|DISCARD|REPLACE|PENDING, replaceId: UUID|null }`.
- `POST .../participant-imports/:importId/confirm`: confirmação idempotente.
- `GET /organizations/:organizationId/previous-participants?search=&page=1&pageSize=20`: cadastros aprovados.
- `GET .../previous-participants/:profileId`: respostas completas e origens.
- `POST /public/drafts/:draftId/prefill`: exige `X-Draft-Token`; corpo `{ name,birthDate,phone }`; retorno limitado a `{ payload: { shirt?, answers?: { cidade?, sexo? } } }`. Sem correspondência ou recurso desativado: `{ payload: {} }`. A campanha precisa estar aberta e o rascunho não pode estar enviado/expirado. Limite: 20 consultas/minuto por IP.

As tabelas usam RLS sem políticas de leitura pelo navegador e revogam acesso de `PUBLIC`, `anon` e `authenticated`. Somente a API entrega dados administrativos; não registrar corpos, respostas ou telefones em logs.

## Verificação

`npm run test:database` cria bases descartáveis, incluindo `fac_import_tests`, sem tocar nas bases existentes. Os testes cobrem leitura, duplicidades, atualização explícita, isolamento, confirmação concorrente, versões, campos ocultos e conteúdo público. Testes de interface cobrem a revisão e a preservação das respostas na inscrição.

`node scripts/browser-camper-check.mjs` valida o painel de importação, correção, confirmação, consulta privada e sugestões na ficha em desktop/celular, incluindo menor de idade. As integrações externas são simuladas somente no navegador de teste; não há mensagens ou cadastros reais criados por esse teste.
