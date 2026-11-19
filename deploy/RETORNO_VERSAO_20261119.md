# Publicação de 19/11/2026 e retorno de versão

Destino: `fortmetais/eventos`, branch `main`, site `facnsaloanda.com.br`.

Esta publicação reúne a padronização de interface, a refatoração e o acesso administrativo temporário já testados localmente. Foi autorizada pelo usuário em 19/11/2026. As flags de liberação, variáveis privadas e configurações da Hostinger serão preservadas.

## Referência anterior

- Commit anterior: `eb9f1570dc0109af7f6881e0cd702c1e619963d6`.
- Build anterior confirmado como concluído: `01a1e42e-b099-7360-a2f5-74f2e3b239ad`.
- Tag de recuperação: `rollback/20261119-before-ui-refactor`.
- Branch de recuperação: `codex/rollback-20261119`.
- Tag da nova entrega: `release/20261119-ui-refactor`.
- Evidências locais de execução: `.local/releases/20261119/` (ignoradas pelo Git).

As referências devem estar no GitHub antes de atualizar `main`. A Hostinger publica automaticamente os novos commits de `main`; acompanhar a conclusão e conferir o commit ativo, as páginas públicas e a API.

## Pré-requisitos e validação

- Conferir `database/manual/20_auditoria_acesso_temporario.sql` no Supabase antes da nova API. É aditivo: coluna JSONB nullable e índice; não executar o histórico completo de migrations na instalação gradual.
- Preservar dados, uploads, links existentes e os segredos configurados. Não enviar anexos, dumps, `.env` ou conteúdo de `.local` ao repositório.
- Verificações locais: 580 testes da API e 533 da interface; tipos, compilação e carregador da Hostinger aprovados. Onze percursos de navegador e a verificação adicional de acesso temporário passaram com serviços simulados.
- Lista/grid de inscrições: sete variantes com textos, controles e PNGs idênticos à referência anterior à limpeza.
- Em produção, conferir raiz/cartaz, entrada, eventos, saúde da API, arquivos do frontend e disponibilidade das estruturas. Não testar envio de mensagens nem alterar candidaturas reais para validar o deploy.

## Retorno preferencial, preservando o histórico

Não executar este procedimento preventivamente. Usar somente se houver falha atribuída à nova versão, numa cópia de trabalho limpa e depois de conferir eventuais commits posteriores.

```text
git fetch origin --tags
git switch main
git pull --ff-only origin main
git rev-list -n 1 release/20261119-ui-refactor
git revert --no-edit SHA_DA_ENTREGA
git push origin main
```

Substituir `SHA_DA_ENTREGA` pelo resultado do comando anterior. O revert deve desfazer apenas a entrega; interromper para revisão se houver conflitos ou mudanças posteriores relacionadas. Não usar reset destrutivo ou push forçado. A publicação automática permanece ligada a `main` e fará a compilação do retorno; aguardar e conferir o resultado na Hostinger. O retorno exige uma nova compilação, não é uma troca instantânea.

Se o Git principal estiver indisponível, a branch `codex/rollback-20261119` permite uma publicação explícita pelo painel/conector da Hostinger com as configurações Node/Express já existentes. Esse caminho pode mudar a branch da publicação automática: conferir e restabelecer `main` quando a correção estiver pronta.

## Banco e operações administrativas

O retorno é do código. Manter a coluna, o índice e os registros de auditoria acrescentados; não desfazer inscrições, respostas ou senhas por restauração de uma cópia antiga do banco.

Antes de retornar, conferir operações `TEMPORARY_ACCESS` com status `PENDING` ou `POSSIBLY_APPLIED`. Havendo alguma, interromper novas liberações e reconciliar o resultado com o Auth: o código anterior não consulta o novo bloqueio dessas operações. Senhas temporárias já concedidas continuam sujeitas à troca obrigatória existente na versão anterior; não tentar revertê-las automaticamente.

## Limites conhecidos

- Conferência em aparelhos iPhone/Android reais permanece uma validação manual; os percursos automatizados usam navegadores com serviços fictícios.
- O aviso `form_banner_cleanup_failed` agora é JSON estruturado; conferir consumidores externos desse log, se existirem.
- A compilação emite o aviso já documentado de bundle acima de 500 KB. Não altera o sucesso da compilação.
