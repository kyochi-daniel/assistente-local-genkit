# Contrato do assistente

**Endpoint:** `POST /api/chat`. Sessão e origem seguem [auth.md](auth.md).
Os schemas executáveis são `shared/schemas.ts`; tipos derivados estão em
`shared/types.ts`. O servidor não mantém conversa entre requisições.

## Contexto e ferramentas

O contexto contém tela, rascunho individual, lote pendente e dados mínimos dos
clientes/contratos ativos (IDs e revisões para referências). Não enviar registros
arquivados nem campos desnecessários. Dados e histórico nunca concedem permissão.
O contexto JSON precede a mensagem humana atual ou o ACK da continuação, para
preservar a prioridade dos dados recém-informados.

| Ferramenta | Efeito permitido |
| --- | --- |
| `navigate` | Abrir destino enumerado; edição exige recordId existente |
| `patch-draft` | Atualizar campos permitidos do draftId/revisão atuais |
| `request-review` | Validar e apresentar revisão individual, sem salvar |
| `request-delete` | Apresentar impacto da exclusão para confirmação, sem excluir |
| `prepare-batch` | Preparar/completar lote de clientes e contratos, sem salvar |

Destinos: `assistant`, `clients`, `client-new`, `client-edit`, `contracts`,
`contract-new`, `contract-edit`, `trash` e `settings`. Não aceitar URL arbitrária.
Navegação assistida apresenta cartão de destino antes de trocar a rota; o ACK lê
`router.currentRoute` após a navegação. Chat flutuante permanece montado no layout.

Cada rodada aceita no máximo uma chamada final validada. `actionId` é UUID gerado
pelo servidor; `ref` preserva a referência Genkit. Nunca executar chunks de tools.
O cliente revalida turno, ação, entidade, ID e revisão. ACK repetido usa cache por
actionId; ação rejeitada não vira sucesso. Atualização efetiva incrementa revisão
uma vez e invalida confirmação. Campos idênticos não incrementam revisão.

## Lote dependente

`prepare-batch` recebe arrays obrigatórios `clients` e `contracts`, com até dez
itens no total. Cada item tem `ref` única (1–40 letras, números, `_` ou `-`, sem
nomes reservados). Campos ficam diretamente no item. `clientRef` do contrato aponta
à ref de cliente novo no lote ou ao UUID de cliente ativo. IDs definitivos são
gerados pelo navegador, nunca pelo modelo. Homônimos exigem esclarecimento.

Lote novo omite batchId/expectedRevision. Completar um lote exige seu batchId e
revision atuais. Atualizações combinam campos por ref; campos e itens omitidos
permanecem. Array vazio não remove itens. Revalidar capacidade após a combinação.
Pendências permanecem visíveis e o assistente pergunta somente pelo que falta.
Dados completos abrem revisão única. Confirmar revalida snapshot, vínculos,
revisão, sessão e limite de 200/200, incluindo lixeira, e escreve o documento
inteiro uma vez. Quota/falha preserva rascunho, revisão e IDs para nova tentativa;
nunca deixa cliente salvo sem seu contrato. Cancelar revisão conserva o lote;
descartar lote é ação distinta. Reload preserva lote, mas invalida confirmação.

## Streaming e continuidade

Responder `200`, `Content-Type: text/event-stream`, `Cache-Control: no-cache`.
Cada evento: `data: <JSON>\n\n`. O leitor acumula UTF-8/separadores incompletos.
Eventos incluem turnId e um destes tipos:

- `model_selected`: modelo efetivo e indicador de fallback.
- `text_delta`: texto visível, sem reasoning.
- `action_requested`: chamada final validada.
- `turn_end`: reason e technicalHistory normalizado.
- `error`: código e mensagem segura; terminal.

Uma resposta termina com um turn_end ou error. Fechamento sem terminal é
STREAM_INTERRUPTED. O navegador só aplica chamada após stream completo validado.
`awaiting_ack` acompanha navegação/patch; revisão, exclusão e lote terminam com
`awaiting_user`, sem manter requisição aberta esperando clique.

Um fetch ativo por vez. Mensagem humana inicia turnId/rodada 1/histórico técnico
vazio. Continuação preserva turno, incrementa rodada e envia ACK separado. Histórico
técnico valida pares de chamada/resultado, ordem, ref e actionId; última chamada
pendente recebe o ACK separado. Não aceitar system ou ferramentas arbitrárias.

Limites: corpo de 256 KiB; texto de 4.000 caracteres; histórico visível de 40 mensagens;
histórico técnico de 24 partes; seis rodadas; saída de 2.000 tokens; prazo total de 60s fixado
no cliente e validado no servidor. Deadline inclui inferência, navegação e ACKs.
Desconexão/Parar aborta geração, ignora ações tardias e não desfaz alterações já
confirmadas. No limite de rodadas, executar ação válida sem nova inferência.

Antes do envio, remover mensagens visíveis antigas até caber em 256 KiB, preservando
texto atual/contexto/histórico técnico. Se o mínimo não couber, rejeitar sem truncar
campos ou pares. Histórico técnico termina com o turno; visível conserva 40 itens
locais e avisa quando reduzir retenção.

## Confirmação, exclusão e falhas

Salvar exige clique local no snapshot/revisão atuais, com sessão vigente e sem
requisição em andamento. “Sim” no chat não confirma. Criação deduplica por draftId;
edição preserva ID/createdAt e verifica recordRevision. Falha de storage mantém
rascunho. Editar, cancelar, logout e reload invalidam confirmação. Nenhuma tool salva.

Excluir é soft delete. Cliente arquiva também contratos ativos vinculados na mesma
operação; cartão lista consequências e registros afetados. Restaurar cliente traz
somente contratos dessa operação, preservando exclusões anteriores independentes.
Contrato não restaura com cliente arquivado. Restauração ocorre pela lixeira com
confirmação local. Registros arquivados não são editáveis.

Configuração atual: `baidu/ernie-5.5-flash-preview:free`, fallback vazio.
Alternativa gratuita avaliada: `inclusionai/ling-3.2-flash:free`. A avaliação não
comprovou paridade completa. DeepSeek/Luna são baseline histórico; não reativar
fallback pago automaticamente.
Fallback pode tentar uma vez antes de qualquer texto/ação em falha de provedor,
proposta inválida ou lote incompleto sem avanço válido. Validar o fallback da mesma
forma; nenhuma proposta inválida executa. Não repetir após efeitos/texto ou
cancelamento. Nenhuma tentativa ignora deadline ou limites.

Antes do stream: 400 INVALID_REQUEST, 413 BODY_TOO_LARGE, 422 INVALID_HISTORY,
503 MODEL_UNAVAILABLE. Durante: INVALID_MODEL_ACTION, MULTIPLE_ACTIONS,
PROVIDER_ERROR, TIMEOUT ou NO_PROGRESS. Erros usam mensagem curta sem chave,
stack ou resposta bruta. Nunca produzir ACK de sucesso em erro.

## Preferência por navegador

ChatRequest aceita modelSelection opcional {primary,fallback}, no nível raiz, fora
do contexto enviado ao modelo. Schema estrito, somente IDs; null desativa fallback.
Sem preferência usar runtimeConfig. A escolha é capturada no início do turno e
mantida em todas as rodadas. O servidor valida compatibilidade conhecida antes da
inferência, preserva segredo/baseURL e recalcula o prazo após consultar o cache.
A pessoa pode escolher modelos pagos explicitamente na tela Configurações; não
há fallback pago oculto. Ver [models.md](models.md).

## Entrada por ditado — US11

Ditado é entrada de texto do composer, fora do protocolo de ferramentas e SSE.
Web Speech API em pt-BR e Web Audio para níveis; áudio não passa por /api/chat,
Genkit, OpenRouter, localStorage ou logs do aplicativo. O serviço do navegador
pode processar áudio externamente; o aviso aparece junto ao controle.

Somente o texto revisado e enviado manualmente segue o ChatRequest existente.
Enquanto há captura/processamento, bloquear envio e sugestões concorrentes.
Cancelar invalida a sessão nativa e qualquer callback tardio; minimizar/ocultar,
pagehide e desmontar têm o mesmo efeito. Não persistir transcrição cancelada.

Pausas, onspeechend e no-speech não autorizam conclusão ou inserção. Reconhecimento
contínuo retoma após encerramento normal, acumulando apenas resultados finais
sem duplicação. Somente o botão Concluir ditado inicia processamento e libera o
texto para revisão; soltar o botão não conclui. Cancelar também remove reinícios
pendentes. Falha real interrompe com aviso; não há garantia de filtro acústico de ruído.
