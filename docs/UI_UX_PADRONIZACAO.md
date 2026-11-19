# Relatório local de padronização UI/UX

Gera HTML navegável, imagens locais e metadados em uma pasta ignorada de .local. Não modifica nem publica a aplicação.

## Gerar

Na raiz do repositório:

    node scripts/generate-ui-ux-report.mjs

Abra .local/ui-ux-audit/index.html. As capturas anteriores vêm de .local/ui-ux-before/screenshots. O baseline padrão é eb9f157.

Atualizar depois da implementação:

    node scripts/generate-ui-ux-report.mjs --before-dir .local/ui-ux-before/screenshots --after-dir .local/ui-ux-after/screenshots --implementation-sha SHA --capture-manifest .local/ui-ux-after/capture-manifest.json

Também aceita --out pasta dentro de .local, --findings arquivo.json e --validation arquivo.json. Consulte --help.

## Comparações e evidências

O gerador nunca trata nomes proposed, prototype, experiment, experimento ou ensaio como implementação. As imagens antigas de ensaio aparecem em um grupo próprio.

Sem depois real, SHA de implementação, largura equivalente ou confirmação da mesma fixture, a comparação permanece pendente. A altura pode mudar com o layout. Captura não comprova teste funcional.

O manifesto é um objeto indexado pelo nome da captura anterior:

    {
      "audit-before-event-desktop.png": {
        "afterFile": "evento-formulario-desktop.png",
        "sameFixture": true,
        "kind": "implemented"
      }
    }

Marque sameFixture apenas após confirmar os mesmos dados fictícios, estado, largura e condições de captura. Não basta semelhança visual.

Por padrão, nomes iguais são associados entre antes/depois. Para audit-before-event-desktop/celular também são reconhecidos audit-after-event-* e evento-formulario-desktop/celular. O campo afterFile permite outra associação explícita, com nome simples de PNG. Nenhuma proposta vira depois automaticamente.

## Atualizar achados e testes

--findings aceita um array ou objeto com findings. Cada achado usa id, module, severity, classification, title, reproduction, evidence, proposal, testStatus, code e sourceIds. Classificações: reproduzido, codigo, sugestao, pendente. Prioridades: alta, media, baixa, informativa.

Módulos: access, profile, events, organization, members, functions, forms, imports, messages, health, admin e registrations.

--validation aceita textos baselineTests, implementationTests e limits. Não declarar nova versão aprovada sem resultados efetivos. Os resultados iniciais do baseline foram informados pela coordenação; não equivalem a todos os estados ou navegadores testados.

Não inventar linhas, reprodução, tecnologias assistivas ou Safari/iPhone reais testados. Acesso temporário ainda pendente deve ficar separado do baseline publicado.

## Contrato protegido

Preservar exatamente a apresentação dos dados e os botões da lista e grid de inscrições. Não redesenhar ReviewRegistrations, cards ou ações de compartilhamento. O modal da ficha pode evoluir em escopo próprio sem alterar dados ou permissões.

Conferir regressão com as mesmas fixtures em PC e larguras 320px, 390px e 430px.

## Privacidade

Usar apenas fixtures fictícias. O HTML não carrega bibliotecas, fontes, analytics ou imagens externas. Links oficiais W3C/GOV.UK só abrem mediante ação da pessoa. A saída fica em .local para evitar commit de capturas por engano.

## Implementação sem commit

Uma árvore local não deve receber um SHA Git inventado. Use rótulo e digest do build/manifesto:

    node scripts/generate-ui-ux-report.mjs --implementation-label "árvore local sobre eb9f157" --implementation-digest SHA256 --capture-manifest .local/ui-ux-after/capture-manifest.json --validation .local/ui-ux-after/validation.json

O manifesto também aceita { implementation: { label, digest }, captures: { nomeDaCaptura: { beforeFile, afterFile, sameFixture: true, kind: "implemented" } } }. Digest deve ser SHA-256 hexadecimal de 64 caracteres (com ou sem prefixo sha256:). A identidade local, digest, largura PNG igual e equivalência de fixture declarada permitem comparações documentadas sem commit. O digest é fornecido pela coordenação, não representa validação funcional.

## Demonstração interativa local

Depois de npm run build -w @fac/web, execute node scripts/preview-ui-ux.mjs e abra http://127.0.0.1:5196/__demo/. O relatório é servido em /__audit/. A demonstração usa somente dados fictícios em memória; reiniciar ou resetar elimina as alterações, sem envio de mensagens ou conexão de produção.

## Resultados da implementação por achado

O JSON de --validation pode conter findings indexado por ID, com implementationStatus: "localImplemented", implementationEvidence e testStatus. Isso acrescenta o estado da árvore local sem apagar a classificação ou evidência do baseline e sem afirmar publicação. Exemplo: { "findings": { "UX-01": { "implementationStatus": "localImplemented", "implementationEvidence": "Guarda confirmada com fixtures fictícias.", "testStatus": "Resultado efetivo e limites da rodada." } } }. Os campos baselineTests, implementationTests e limits continuam textos.

Uma exceção preexistente em área protegida pode usar implementationStatus: "protectedDeferred". O relatório mostra "Mantido por restrição de escopo" sem esconder o achado ou tratá-lo como implementado. UX-11 registra o alinhamento preexistente da ordenação no WebKit, preservado conforme a restrição da lista/grid.
