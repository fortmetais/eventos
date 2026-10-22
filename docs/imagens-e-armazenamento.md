# Imagens e armazenamento

Fotos de identificação continuam privadas no bucket `identificacao`: 500 × 500 pixels, WebP com qualidade 82. Orientação EXIF, recorte e redução são executados antes da única codificação final. O navegador prepara o enquadramento em PNG de até 1.000 × 1.000 quando isso reduz o arquivo enviado; caso contrário, envia o original e suas coordenadas. Mantêm-se os limites de 10 MB e 40 megapixels e o salvamento automático da foto junto ao perfil.

Banners de computador ficam dentro de 1920 × 1920, qualidade 88, e banners de celular dentro de 960 × 1280, qualidade 84; logotipos completos em até 800 × 800, qualidade 90. No mesmo envio são geradas miniaturas WebP: artes dentro de 320 × 570, qualidade 82; logotipos dentro de 160 × 160, qualidade 88. Proporções e transparência são preservadas, sem ampliar originais pequenos. As listas usam `imageThumbnailUrl` e os avatares usam `logoThumbnailUrl`, com alternativa para a imagem completa quando ainda não existe miniatura. Novas imagens públicas têm nomes exclusivos e cache de um ano.

O cartaz inicial oferece WebP com qualidade 84 em 1041 e 720 pixels de largura, selecionado pelo navegador conforme espaço disponível e densidade de pixels. O JPEG permanece como alternativa. As versões `v1` têm cache de um ano; alterações futuras da arte devem usar novos nomes de versão. A inscrição e o controle de música mantêm suas posições.

## Atualização do banco

Aplicar `database/manual/12_miniaturas_imagens.sql` após as etapas 10 e 11 e antes de implantar o novo código. O script acrescenta `organizacoes.organizacoes.chave_miniatura_logotipo` e `eventos.eventos.chave_miniatura_arte`, ambas opcionais. O banco guarda referências; as imagens permanecem no Storage. A conferência de estrutura `deploy/supabase/CONFERIR_ATUALIZACOES.sql` inclui também as quatro colunas da etapa 14. Não aplicar o histórico completo de migrations Prisma à base importada manualmente.

A etapa 14 acrescenta banner de celular e endereço personalizado do evento. Aplicar `database/manual/14_banners_e_url_evento.sql` antes de publicar essa atualização. Consulte [banners e endereço do evento](banners-e-endereco-evento.md).

## Miniaturas de imagens existentes

No ambiente da base desejada, a execução padrão apenas identifica candidatos:

```sh
npm run images:thumbnails
npm run images:thumbnails -- --apply
```

Cada execução atende no máximo 100 organizações e 100 eventos. Repetir até não haver candidatos. O comando baixa somente arquivos do bucket gerenciado, mantém a imagem completa e verifica se ela ainda é a imagem vigente antes de associar a miniatura. URLs externas antigas não são baixadas nem modificadas. Cada lote informa quantidade de candidatos, imagens geradas e falhas, sem divulgar credenciais.

## Limpeza de fotos substituídas

A troca do perfil confirma a nova foto antes de limpar a anterior. A limpeza verifica referências em todos os perfis, rascunhos e respostas enviadas. Escritores do perfil compartilham o bloqueio da conta e validam a existência da foto dentro da transação. Fotos de inscrição e imagens ainda referenciadas são preservadas. Uma falha de limpeza mantém o novo perfil salvo e o registro antigo para nova tentativa.

Para verificar arquivos antigos e repetir limpezas pendentes:

```sh
npm run images:cleanup
npm run images:cleanup -- --apply
```

A execução padrão simula a limpeza. Cada lote verifica até 500 fotos de perfil. O modo `--apply` apaga somente fotos sem referência; não oferece recuperação de versões anteriores. As fotos vigentes permanecem protegidas, inclusive em trocas simultâneas.
