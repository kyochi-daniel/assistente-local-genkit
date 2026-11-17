# Pesquisa técnica

**Data:** 2026-11-13. **Escopo original:** decisões anteriores à implementação, sem chamadas de inferência.
**Atualização:** o usuário autorizou implementar e usar `deepseek/deepseek-v4.1-flash`
como principal e `openai/gpt-6-luna` como fallback. Implementação e evidências em
[execution.md](execution.md); a pesquisa original abaixo explica as decisões.

## Stack e execução

Usar uma aplicação Nuxt com Vue e TypeScript; páginas e chat no mesmo processo, com Genkit apenas em `server/`. O chat vive no layout e seu estado num composable compartilhado. Trocar páginas não cancela nem recria a conversa. Nitro executa em Node, sem servidor Express separado.

O registro npm oficial retornou Nuxt 4.6.4, Vue 3.5.45, Genkit e `@genkit-ai/compat-oai` 1.44.0 e `shadcn-nuxt` 2.9.0. Nuxt exige Node `^22.22.3 || ^24.15.0 || >=26.0.0`; adotar Node 24.15+ LTS. Conferir as versões novamente ao implementar e registrar as resolvidas no lockfile. A documentação geral informa Node 22+, mas o requisito do pacote é mais preciso.

Fontes: [registro Nuxt](https://registry.npmjs.org/nuxt/latest), [registro Genkit](https://registry.npmjs.org/genkit/latest), [instalação Nuxt](https://nuxt.com/docs/4.x/getting-started/installation), [shadcn-vue para Nuxt](https://www.shadcn-vue.com/docs/installation/nuxt).

## Genkit e ações no navegador

Usar `generateStream({ returnToolRequests: true })`. O servidor entrega texto incremental; ferramentas completas são propostas ao cliente. Após o ACK real, uma nova requisição acrescenta o `toolResponse`, preservando `name` e `ref`, e continua a geração. Esse loop explícito evita o sucesso fictício de uma ferramenta servidor que apenas devolvesse “solicitado” antes da execução no navegador.

As únicas ferramentas são `navigate`, `patch-draft` e `request-review`. Nenhuma grava registros. A última apresenta revisão e encerra o loop, aguardando a pessoa. O botão local de confirmação salva exatamente a revisão exibida. Campos ausentes ou identificação ambígua de cliente geram perguntas em texto, sem inventar dados.

O transporte será `POST /api/chat` com SSE, lido por `fetch` e `ReadableStream`. Não usar `EventSource`, pois precisamos enviar corpo JSON e abortar a requisição. O contrato separa streaming de texto, proposta de ação e resultado confirmado. Chunks parciais nunca acionam ferramentas.

Alternativas rejeitadas: Genkit Agents API e `defineInterrupt` estão Beta; ambos podem mudar em versões menores. Não são necessários para as ações locais permitidas. MCP, múltiplos agentes, filas e sessões persistidas também não atendem uma necessidade do MVP.

Fontes: [geração e streaming](https://genkit.dev/docs/js/models/), [loop explícito e partes de ferramentas](https://genkit.dev/docs/js/tool-calling/), [interrupts e aviso Beta](https://genkit.dev/docs/js/interrupts/), [Agents API](https://genkit.dev/docs/agents/run/).

## OpenRouter e modelos

Configurar `openAICompatible` de `@genkit-ai/compat-oai`, com nome `openrouter`, chave privada e `baseURL: 'https://openrouter.ai/api/v1'`. O identificador Genkit acrescenta o prefixo do plugin ao ID OpenRouter, por exemplo `openrouter/openai/gpt-6-luna`.

O catálogo público consultado retornou `openai/gpt-6-luna`, `deepseek/deepseek-v4.1-flash` e `deepseek/deepseek-v4.1-flash-1017`, todos com `tools`. Os dois IDs DeepSeek têm preço positivo. Não apareceu qualquer DeepSeek `:free`; portanto “DeepSeek V4.1 Free” não é um ID confirmado. Configuração inválida deve produzir erro legível, sem substituição paga silenciosa. Custos e disponibilidade precisam ser conferidos antes de um teste real.

Fontes: [plugin compatível](https://genkit.dev/docs/js/integrations/openai-compatible/), [catálogo autoritativo](https://openrouter.ai/api/v1/models), [GPT-6 Luna](https://openrouter.ai/openai/gpt-6-luna/), [client tools OpenRouter](https://openrouter.ai/docs/guides/features/tool-calling).

## Limites e verificação

localStorage mantém cadastros, rascunho e mensagens visíveis; revisão, histórico técnico e ações pendentes ficam em memória. Reload invalida confirmação. Histórico vindo do cliente é dado não confiável: validar formato, limites, nomes, argumentos e pares solicitação/resultado; nunca aceitar mensagens de sistema ou código. Isso não autentica a origem histórica, mas nenhuma ferramenta tem privilégios no servidor.

Verificar com provedor simulado: streaming fragmentado, ACK negativo, revisão obsoleta, deduplicação, limite de rodadas e interrupção. Na implementação, realizar um teste integrado explícito de streaming e ferramentas com o modelo configurado. Nesta pesquisa não houve inferência paga nem validação ponta a ponta.

## Atualização — avaliação gratuita em 2026-11-14

O usuário pediu evitar gastos e verificar Ling e ERNIE gratuitos. Ambos aparecem
no catálogo com prompt/completion zero, tools e tool_choice. Ling aceita texto e
imagens (contexto 1.048.576); ERNIE recebe texto (contexto 1.024.000). Recraft V4.1
Flash V2 gratuito gera imagens e não substitui o assistente com ferramentas.

Cada modelo foi testado isoladamente no Chrome, sem fallback pago, com o mesmo
provider/limites do app. Ambos passaram no lote 2+2 e falharam nos outros dois casos;
ERNIE foi mais rápido e ficou ativo para experimentos. Não declarar equivalência
com o baseline DeepSeek/Luna. Detalhes e dados observados em execution.md.

Fontes: [Ling](https://openrouter.ai/inclusionai/ling-3.2-flash:free),
[ERNIE](https://openrouter.ai/baidu/ernie-5.5-flash-preview:free),
[Recraft](https://openrouter.ai/recraft/recraft-v4.1-flash-v2:free),
[catálogo](https://openrouter.ai/api/v1/models).

## Ditado nativo — 2026-11-15

- Web Speech API evita SDK, modelo do chat e dependência de transcrição.
  SpeechRecognition tem disponibilidade limitada e o Chrome pode usar serviço
  remoto: [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).
- Web Audio fornece níveis reais sem reproduzir o áudio:
  [MDN AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode).
- Permissão só por gesto; localhost é contexto seguro. Pedido de permissão pode
  ficar sem resolução, exigindo cancelamento que também descarte streams tardias:
  [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
- Reconhecimento local experimental exige suporte/pacotes de idioma e não serve
  de garantia geral de offline. Não incluir downloads ou WASM neste protótipo.
- Playwright com addInitScript controla eventos nativos; Chrome externo usa
  flags de dispositivo/áudio sintéticos. Validar ciclo e interface sem microfone
  pessoal, sem alegar medir qualidade real de transcrição.

## Ajuste contínuo — US11

SpeechRecognition.continuous=true permite vários resultados por reconhecimento;
onend representa desconexão do serviço, mesmo sem conclusão pelo usuário. Por isso
onspeechend não finaliza e onend normal rearma enquanto o ditado estiver ativo.
no-speech é recuperável. Apenas resultados isFinal entram no acumulador por índice;
revisões de um mesmo resultado não repetem a frase. Não há classificador acústico
próprio: ruído que o serviço reconhecer como palavra ainda depende dele.

- [MDN continuous](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/continuous)
- [MDN end](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/end_event)
- [MDN isFinal](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionResult/isFinal)

## Referência visual do chat — US12

A imagem fornecida pelo usuário orienta apenas a apresentação do chat; não buscar
outras referências nem ampliar o tema para a aplicação. Reprodução em SVG com
radiais, manchas recortadas, brilho e sombra, animando transform/opacity. Evitar
mídia remota, geração de imagem e bibliotecas de vídeo para um elemento decorativo.

Tokens locais preservam o azul global. Texto cinza da referência foi escurecido
para #5c7069: contraste calculado de 4,56:1 sobre #eeeef0 e 5,28:1 sobre branco. Classes
da esfera usam orb-active para não herdar o fundo da classe global de status active.
