# Edição das fichas pela organização

## Fluxo de uso

O organizador abre a ficha de uma pessoa e escolhe **Editar ficha** no próprio modal. Corrige os campos e usa **Salvar alterações**. **Cancelar** volta à consulta sem salvar. Não há seção separada de correções nem justificativa manual obrigatória.

A edição atende inscrições feitas pela aplicação e candidaturas importadas. Os campos e as perguntas seguem a versão da ficha vinculada à inscrição. Os catálogos, máscaras e limites da aplicação são mantidos; preferências importadas podem conservar mais de três departamentos, sem alterar a alocação.

Dados cadastrais, contatos, camiseta, disponibilidade e respostas gerais podem ser corrigidos. A correção do e-mail altera o contato da ficha, preservando o endereço original usado para comprovação do vínculo e a conta de acesso. Foto, saúde, aceites, autorizações, situação, departamento alocado e respostas de presença mantêm seus fluxos próprios.

## Histórico automático

**Histórico e vínculo → Edições da ficha** mostra quem editou, quando, quais campos mudaram e os valores anteriores e novos. O registro é gravado na mesma transação da alteração; salvar sem alterações não cria uma edição. A razão técnica padrão é registrada automaticamente, sem exigir texto do organizador.

Os originais da importação, o rascunho enviado, a versão da ficha e os documentos assinados permanecem preservados. Quando a pessoa está compartilhada por mais de uma inscrição, a correção não é propagada silenciosamente para as outras fichas.

## Proteções

- Somente organizadores da organização podem editar. A consulta mantém as permissões existentes.
- Uma edição concorrente retorna conflito e preserva o texto digitado; é necessário consultar a versão atual antes de salvar novamente.
- Nome, nascimento e CPF ligados a um termo do responsável já emitido exigem revisão desse documento pelo fluxo próprio. O editor não reescreve a autorização.
- A correção de nascimento que transforma uma participação nativa já confirmada em participação de menor exige reabrir a análise antes da mudança.
- Salvar não envia mensagens, muda decisões, ocupa vagas, registra presença ou modifica a conta/perfil de acesso.

## Contrato e banco

`PATCH /organizations/:organizationId/registrations/:registrationId/corrections` recebe `updatedAt`, `overrides` e a razão automática da interface. A rota anterior `imported-data` continua compatível para candidaturas importadas.

A etapa `database/manual/21_correcoes_fichas.sql` acrescenta `organizacoes.auditoria.detalhes` e atualiza a proteção das respostas para permitir somente correções acompanhadas do registro auditado correspondente. Não cria tabelas, não depende da etapa 20 e não altera respostas existentes. O SQL aceita reaplicação e instalação gradual.

O roteiro `scripts/browser-registration-corrections-check.mjs` utiliza pessoas e serviços fictícios para verificar computador e celular, edição das duas origens, histórico, cancelamento, alterações não salvas, conflito e permissões. As suítes da API também verificam o banco descartável, a proteção dos originais, o isolamento das pessoas compartilhadas e a transação da auditoria.
