# Implementation Plan: Assistente local com ações visíveis

**Feature**: `001-assistente-local` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Requisitos de `specs/001-assistente-local/spec.md`.
**Status**: MVP implementado. Verificações e limite do smoke real em [execution.md](execution.md).
Não foi criada branch Git; o identificador acima seleciona a feature no Spec Kit.

## Summary

Uma aplicação Nuxt com login demonstrativo, listas e formulários de clientes/contratos
e um chat no layout. Genkit interpreta pedidos e solicita ferramentas tipadas;
o navegador navega e atualiza rascunhos, devolvendo resultados reais. Salvar exige
clique explícito em resumo da revisão atual. Não haverá banco ou serviço separado.

## Technical Context

**Language/Version**: TypeScript, Vue 3, Nuxt estável mais recente no scaffold.
Consulta em 2026-11-13: Nuxt 4.6.4, Vue 3.5.45. Node 24.15+ LTS compatível;
revalidar engines do pacote ao instalar e registrar versões exatas no package-lock.json.

**Primary Dependencies**: Nuxt/Nitro/H3; shadcn-vue via shadcn-nuxt e Tailwind;
Genkit e @genkit-ai/compat-oai; Zod para schemas. Reutilizar mecanismos nativos
de sessão H3/Nitro. Sem Pinia: useState/composables bastam ao escopo.

**Storage**: Um documento localStorage versionado; somente o cliente acessa.
Estado do turno e confirmação só em memória. Sem APIs CRUD remotas.

**Testing**: Vitest para schemas, executor/estado, persistência e autenticação;
Playwright para um percurso completo com IA simulada. Smoke real separado e
dependente de chave/modelo explicitamente configurados.

**Target Platform**: Servidor Node.js em localhost e navegador moderno; uma aba ativa.
**Project Type**: Aplicação web full-stack única.
**Performance Goals**: Indicador em até 300 ms após enviar; ação local visível
em até 1 s após evento completo. Latência de inferência é externa e não garantida.
**Constraints**: Sem banco, segredos no servidor, confirmação obrigatória para gravar,
uma requisição ativa, até 6 rodadas IA por mensagem e prazo total de 60 segundos
por turno, incluindo ações e ACKs. Sem chamada paga implícita.
**Scale/Scope**: Uma pessoa, até 200 clientes, 200 contratos e 40 mensagens visíveis.

## Constitution Check

| Princípio | Antes da pesquisa | Após contratos |
| --- | --- | --- |
| Aplicação única e mínima | Passa: Nuxt, sem banco | Passa: estado local sem serviço extra |
| Ações observáveis | Passa: ferramentas fechadas | Passa: ACK antes de sucesso |
| Confirmação por revisão | Passa: salvar fora do modelo | Passa: snapshot e ID estável |
| Limites de confiança | Passa: segredo privado e sessão | Passa: schemas, origem, enum de rotas |
| Verificação do comportamento | Passa: histórias testáveis | Passa: tarefas e roteiro dedicados |

Nenhuma exceção de complexidade. Pesquisa e contratos não exigem aprovação adicional
para produzir estas specs, pois o usuário autorizou concluir toda a preparação.

## Project Structure

### Documentation (this feature)

```text
.specify/memory/constitution.md
specs/001-assistente-local/
  spec.md
  plan.md
  research.md
  data-model.md
  contracts/auth.md
  contracts/assistant.md
  quickstart.md
  tasks.md
  checklists/requirements.md
  checklists/readiness.md
```

### Source Code

```text
app/
  layouts/default.vue
  pages/{index,login,assistente}.vue
  pages/clientes/{index,novo}.vue
  pages/contratos/{index,novo}.vue
  components/{AssistantPanel,ReviewCard,ClientForm,ContractForm}.vue
  components/ui/                         # shadcn-vue gerado
  composables/{useWorkspace,useAssistant,useSession}.ts
  middleware/auth.ts
  utils/{storage,actions,review}.ts
server/
  api/auth/{login.post,session.get,logout.post}.ts
  api/chat.post.ts
  ai/{genkit,assistant}.ts
  utils/auth.ts
shared/{schemas,types}.ts
tests/unit/{schemas,actions,review,storage,auth,stream}.test.ts
tests/e2e/assistant.spec.ts
nuxt.config.ts
package.json
```

**Structure Decision**: Convenções Nuxt 4, sem monorepo, repository pattern ou API separada.
Na criação do scaffold preservar `.specify/`, `.agents/`, `AGENTS.md` e `specs/`;
se o CLI exigir pasta vazia, gerar em diretório temporário e copiar somente os
arquivos do app, sem sobrescrever os documentos existentes.

## Decisões de execução

1. Abrir chat em /assistente; manter painel no layout das páginas autenticadas.
   Em telas pequenas, usar painel recolhível acessível por botão. Usar componentes
   prontos, rótulos PT-BR, foco no destino após navegação e avisos aria-live.
2. Um único useWorkspace contém documento local e rascunho. Formulários e executor
   usam os mesmos schemas e funções. Persistência após hidratação evita divergência SSR.
3. useAssistant faz POST via fetch, interpreta SSE incremental e aplica somente
   ações completas validadas. Await de navegação e escrita local precede ACK.
4. Fluxo Genkit usa ferramentas reais com returnToolRequests, sem interrupts Beta
   ou Agents API. Cada continuação inclui resultados validados das ações anteriores;
   não é necessário WebSocket, fila, servidor de sessão de IA ou armazenamento remoto.
5. request-review abre ReviewCard e termina o loop esperando a pessoa. O cartão
   implementa o commit local; depois do resultado, a interface inclui mensagem factual
   no chat. Nenhum modelo recebe uma ferramenta de gravação.
6. Sem chave/modelo, cadastros e login funcionam e chat mostra instrução de configuração.
   Não disfarçar respostas simuladas como IA real. O usuário autorizou
   `baidu/ernie-5.5-flash-preview:free` como principal atual de testes e fallback vazio.
   `inclusionai/ling-3.2-flash:free` foi comparado; DeepSeek/Luna ficam como baseline histórico pago.
   Usar fallback antes de texto/ação em falha de provedor, proposta inválida ou lote sem avanço válido; informar modelo
   na interface. Multimodal fica fora do MVP.

## Entregas incrementais

### Ampliações autorizadas em 2026-11-13/14

- CRUD local: páginas de edição, metadados de revisão, lixeira, impacto de cascata
  e restauração por lote de exclusão. Compatibilidade com dados anteriores sem reset.
- Chat flutuante de 480×680px, limitado ao viewport, minimizar/abrir e estado preservado.
  Negrito simples por nós Vue escapados, sem HTML ou dependência de Markdown.
- Antes de navegar, exibir cartão de destino, aguardar pintura e consultar a rota
  efetiva do roteador no ACK. Transições CSS de 180ms, com movimento reduzido.
- Criação em lote de até 10 itens: prepare-batch, BatchCard e batchDraft persistido;
  revisão única, dependências por alias e escrita atômica validada. Cinco ferramentas
  no provider; max_tokens de 2000 para comportar os conjuntos. Atualizações de lote
  mesclam por ref e preservam dados omitidos pelo modelo. Contexto é enviado antes
  da mensagem humana atual, conservando a ordem da conversa e dos resultados de ferramentas.
- Tests/live e playwright.live.config.ts executam Chrome externo com DeepSeek real,
  separados dos testes interceptados. Nenhum segredo é incluído nos relatórios.

Base e login; chat com navegação; cliente por conversa; revisão e gravação;
contrato vinculado ao cliente; falhas, cancelamento e demonstração.
As tarefas e suas evidências são atualizadas conforme a verificação real.

## Configurações de modelos — US9

Nova rota /configuracoes, incluída na navegação autenticada e no enum settings.
Catálogo público OpenRouter consultado somente pelo servidor, sem chave. Cache em
memória por 30min, fetch compartilhado para requisições concorrentes, timeout de 10s e cache
stale em falha. Respostas reduzidas e paginadas em 40 itens; nenhuma lista completa no bundle,
SSR ou localStorage. Busca por nome/ID/tag com filtros de preço e compatibilidade, gratuitos primeiro.
A UI começa em Compatíveis; API conserva default all para chamadas existentes.

A tela consulta apenas ao abrir, usa debounce/AbortController e ignora respostas
antigas. IDs são guardados em chave própria nexo:model-settings:v1. Sem nova
biblioteca ou banco. O usuário aplica a seleção; não há inferência ao escolher.
O chat captura ModelSelection uma vez por turno e envia como campo opcional externo
ao contexto. Fallback null vence qualquer fallback do runtimeConfig. Configuração
omitida conserva padrão do ambiente. Chave/baseURL nunca vêm do cliente.

Catálogo completo inclui modelos incompatíveis para explicitar o motivo do bloqueio.
ID manual sintaticamente válido é permitido fora do catálogo, com preço e suporte
não confirmados. O servidor bloqueia modelos conhecidos sem texto/tools; indisponibilidade
do catálogo não bloqueia um ID manual. Ver contrato models.md.

Ajuste de densidade: resumo de seleção em faixa compacta, controles em toolbar única,
40 modelos por página e ID manual recolhido. Fontes legíveis, preços/IDs preservados,
botões desktop compactos e alvos de 44px no mobile. Sem container de scroll interno.

## USD/BRL, estimativas e detalhes — US10

AwesomeAPI pública /json/last/USD-BRL, sem chave, usando ask (venda) como referência.
Endpoint interno /api/exchange-rate com sessão/origem, cache de 60s/single-flight,
timeout de 5s, backoff de 30s e cache anterior no máximo de 7 dias. Timestamp UTC do provedor é
preservado; cotação com mais de 24h ou fallback vem stale, nunca com horário de fetch fingindo
cotação atual. Sem taxa válida, usar USD. Frontend consulta uma vez na entrada e
por minuto só enquanto visível, com abort/cleanup; nunca por linha.

Simulador único de volumes agregados, padrão 1000+1000, inteiros de 0 a 10 milhões. Helpers
puros calculam USD por tarifas sem arredondar antes e convertem por rate. BRL usa
centavos curtos abaixo de 1 real, mínimo positivo <0,01 cent; sem transformar underflow
em gratuito. Modelo sem saída texto não tem cobrança de modalidade estimada por
estes tokens; extras são explícitos. Não estimar IOF/spread ou custo real do chat.

ModelInfo usa Reka UI já instalado, sem dependência nova: TooltipProvider único,
portal e conteúdo só quando ativo, chaves únicas por instância, hover/foco/toque,
Escape/fora, posicionamento com colisão e viewport. Descrição é trecho original do
provedor, escapado; modalidades vêm da arquitetura, não do nome. Remover preços e
contexto extensos da linha, deixando custo curto e i. Anexos/IA multimodal continuam
fora do escopo; informar capacidades não ativa essas funções no aplicativo.

## Ditado nativo — US11

Web Speech API (SpeechRecognition/webkitSpeechRecognition), pt-BR, modo contínuo por
acionamento; sem pacote de transcrição, chamadas Genkit ou upload pelo aplicativo.
O mecanismo do navegador pode processar áudio em serviço externo. Não prometer offline
nem instalar modelos experimentais locais. Web Audio AnalyserNode mede o microfone
sem saída de áudio; atualiza apenas o componente isolado de ditado.

Composer preserva texto/seleção anteriores. Resultados ficam em memória até concluir;
X descarta. Somente o botão Enviar aciona o chat. Eventos tardios são invalidados e
tracks, AudioContext, RAF e timers encerrados ao cancelar, concluir ou ocultar.
Chrome externo nos testes usa SpeechRecognition controlado e dispositivo sintético;
não testar o microfone pessoal nem atribuir precisão real de fala a esses testes.

Ajuste US11: pausas/onspeechend não finalizam. Encerramento normal do serviço e
no-speech rearmam reconhecimento com intervalo curto, sem nova solicitação de
getUserMedia. Cada instância acumula resultados finais por índice, sem repetir
revisões, e agrega seus trechos uma vez no término. Somente concluir pelo botão
para o reconhecimento, mostra Transcrevendo e insere texto; não há limite de 60s
que conclua automaticamente o ditado. Watchdog de finalização mantém 10s. Erros
reais continuam explícitos e cancelam. Timers de reinício também são liberados.
Não afirmar filtragem perfeita de ruído: a interpretação acústica é do navegador.

## Remap visual isolado do chat — US12

Referência enviada pelo usuário: painel 733x779 com fundo neutro, esfera verde
orgânica, título compacto, chips à direita e composer branco com barra inferior.
Aplicar dimensão desktop próxima de 736x780 com limites da viewport; manter
posição flutuante e sem backdrop para preservar uso das telas existentes.

Tokens de cor, raios e sombras próprios do chat, sem alterar tema global/menu.
SVG local com gradientes/ellipses recortados e movimento de transform/opacity;
sem vídeo, canvas, raster externo ou novo pacote. Pausar CSS por visibilidade e
prefers-reduced-motion. SVG oculto da árvore de acessibilidade.

AssistantPanel reutiliza todo o ciclo de mensagens, ditado e confirmação. Somente
markup/apresentação e controles de Mostrar mais/Tópicos; sugestões usam os destinos
já permitidos. Não alterar rotas, ferramentas, storage, sessão ou provedor.
Validar comparação visual desktop/mobile, teclado, sugestões, animação e todos os
fluxos existentes com IA interceptada, sem consumir créditos.
