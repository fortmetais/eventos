# Retorno do cartaz inicial — 25/11/2026

Esta entrega altera somente a arte pública, seus estilos, rotas estáticas, testes e documentação. Não executa SQL, altera campanhas, reabre inscrições internas ou troca variáveis da hospedagem.

A referência anterior é `cc4c769126e06deaec32eb88f9dd24dac8c0ad3b`, preservada na tag `rollback/20261125-before-panorama-home`. Ela já contém as atualizações de segurança do React Router e do express-rate-limit. Não retornar às versões anteriores à correção de segurança.

Se houver erro específico nesta entrega, criar um commit de reversão da tag `release/20261125-panorama-home` sobre `main`, sem reescrever seu histórico, e publicar esse commit. A publicação automática da Hostinger usará a configuração existente. Confirmar o SHA da compilação concluída e conferir a raiz, `/entrar` e a saúde da API. Não modificar as variáveis de ambiente nem executar migrações durante esse retorno.

Uma cópia ZIP do código anterior fica localmente em `.local/glowing-poster-20261125/before-panorama-home-cc4c769.zip`, sem arquivos de ambiente ou dependências instaladas. Os arquivos de arte antigos também permanecem disponíveis para compatibilidade com caches.
