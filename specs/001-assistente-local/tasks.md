# Tasks: Assistente local

**Input**: spec.md, plan.md, research.md, data-model.md e contracts/ desta feature.
**Status**: 75 tarefas concluídas, incluindo remap visual isolado do chat e esfera vetorial animada. A paridade dos modelos gratuitos não foi aprovada; resultados em execution.md.
Evidências e limites em [execution.md](execution.md).

## Phase 1: Setup

- [x] T001 Criar scaffold Nuxt estável em `package.json` e `nuxt.config.ts`, conferir engines Node, preservar specs/ e .specify/, e registrar versões no `package-lock.json`.
- [x] T002 Configurar shadcn-vue/Tailwind em `nuxt.config.ts` e `app/components/ui/`, gerando somente componentes usados por login, chat, listas, formulários e revisão.
- [x] T003 Configurar Vitest/Playwright e scripts dev/typecheck/test/test:e2e/build em `package.json`, `vitest.config.ts` e `playwright.config.ts`.

## Phase 2: Foundational

- [x] T004 Definir schemas estritos e tipos em `shared/schemas.ts` e `shared/types.ts`: UUIDs; name de 1 a 120 após trim; email vazio ou válido até 254; phone até 30; title de 1 a 160; clientId existente; valueCents inteiro seguro de 1 a 99999999999; datas reais YYYY-MM-DD e término igual/posterior ao início; status draft/active/closed com padrão draft. Derivar campos parciais dos mesmos schemas, conforme `data-model.md`.
- [x] T005 Implementar documento local versionado e estado compartilhado em `app/utils/storage.ts` e `app/composables/useWorkspace.ts`: hidratação somente cliente, limites 200/200/40, persistência de rascunho e mensagens, erro sem sobrescrever dados corrompidos ou perder edição em memória.
- [x] T006 [P] Definir runtimeConfig privado em `nuxt.config.ts` e variáveis vazias em `.env.example`, incluindo origem permitida; bloquear login/IA sem configuração conforme `contracts/auth.md`.
- [x] T007 Cobrir regras dos campos e armazenamento em `tests/unit/schemas.test.ts` e `tests/unit/storage.test.ts`, incluindo quota, JSON inválido, versão desconhecida, centavos, datas e ausência de campos obrigatórios em rascunho.

## Phase 3: US1 — Acesso local (P1)

**Goal**: Entrar e proteger a API de IA sem banco.
**Independent Test**: Credenciais válidas entram; sessão ausente/expirada bloqueia página e API.

- [x] T008 [US1] Implementar sessão H3/Nitro e validação de origem/limites em `server/utils/auth.ts` e endpoints `server/api/auth/login.post.ts`, `session.get.ts`, `logout.post.ts`; aplicar 8h de validade e cinco falhas por IP/minuto conforme `contracts/auth.md`.
- [x] T009 [US1] Criar login e navegação protegida em `app/pages/login.vue`, `app/pages/index.vue`, `app/composables/useSession.ts` e `app/middleware/auth.ts`; logout aborta execução e invalida revisão sem apagar cadastros.
- [x] T010 [US1] Verificar login inválido, expiração, origem externa, configuração ausente e limite de falhas em `tests/unit/auth.test.ts`, sem chamar OpenRouter.

## Phase 4: US2 — Chat e navegação (P1)

**Goal**: Conversar e trocar de rota sem desmontar o assistente.
**Independent Test**: Pedir lista de clientes muda rota e mantém conversa; sucesso exige ACK.

- [x] T011 [US2] Criar layout autenticado com painel persistente, sidebar e página do assistente em `app/layouts/default.vue`, `app/components/AssistantPanel.vue` e `app/pages/assistente.vue`; botão recolhível acessível em telas pequenas e aviso da retenção de 40 mensagens.
- [x] T012 [US2] Implementar provider privado e flow Genkit em `server/ai/genkit.ts` e `server/ai/assistant.ts`, com returnToolRequests, cinco tools de `contracts/assistant.md`, uma ferramenta por rodada, perguntas por campos faltantes e fallback autorizado DeepSeek/Luna indicado na interface.
- [x] T013 [US2] Implementar `server/api/chat.post.ts`: sessão/origem antes de inferência, corpo até 256 KiB, schemas/histórico restritos, texto/SSE, ACK e toolResponse, até seis rodadas e orçamento total de 60s por turno.
- [x] T014 [US2] Implementar leitura incremental/AbortController em `app/composables/useAssistant.ts` e executor enum de navegação em `app/utils/actions.ts`; descartar eventos tardios, esperar navigateTo e devolver ACK com contexto atualizado.
- [x] T015 [US2] Testar SSE fragmentado/UTF-8, tool parcial, múltiplas ferramentas, ACK negativo, evento duplicado, timeout, falta de terminal e limites em `tests/unit/stream.test.ts` e `tests/unit/actions.test.ts`.

## Phase 5: US5 — Revisão e recuperação (P1)

**Goal**: Garantir confirmação exata e salvamento único antes de ligar os cadastros.
**Independent Test**: Usar rascunho válido de fixture; confirmar salva uma vez, editar invalida cartão.

- [x] T016 [US5] Implementar snapshot de revisão e commit em `app/utils/review.ts`: sessão vigente, draftId/revision atuais, validação final, record.id=draftId, escrita atômica do documento local, nenhuma conclusão antes do retorno do storage.
- [x] T017 [US5] Criar `app/components/ReviewCard.vue` e integração em `app/components/AssistantPanel.vue`; distinguir cancelar revisão de descartar rascunho, bloquear confirmação durante execução e exigir novo resumo após edição/reload.
- [x] T018 [US5] Integrar request-review e estados awaiting_input/awaiting_confirmation/error/cancelled em `app/utils/actions.ts` e `app/composables/useAssistant.ts`; encerrar loop ao abrir revisão e exibir resultado factual do commit sem ferramenta save.
- [x] T019 [US5] Testar confirmação, edição manual concorrente, duplo clique, retry, falha de escrita, cancelamento e reload em `tests/unit/review.test.ts`, preservando rascunho e rejeitando revisão obsoleta.

## Phase 6: US3 — Clientes por formulário e conversa (P1)

**Goal**: Criar/listar clientes usando o mesmo rascunho manual e assistido.
**Independent Test**: Cadastrar Ana pelo chat, confirmar e recarregar; uma linha persiste na lista.

- [x] T020 [US3] Criar `app/components/ClientForm.vue`, `app/pages/clientes/index.vue` e `app/pages/clientes/novo.vue` com campos/limites de `data-model.md`, lista vazia, revisão compartilhada e mensagens de erro acessíveis.
- [x] T021 [US3] Completar patch-draft de cliente em `app/utils/actions.ts` e `app/composables/useWorkspace.ts`, exigindo draftId/revision e fields allowlisted; toda edição efetiva invalida cartão e incrementa revisão uma vez.
- [x] T022 [US3] Ligar dados mínimos de clientes e rascunho atual ao contexto em `app/composables/useAssistant.ts`; perguntar campos obrigatórios faltantes e preservar edição manual contra resposta obsoleta.
- [x] T023 [US3] Acrescentar casos cliente/homônimos/limite200 e troca de formulário com rascunho em `tests/unit/actions.test.ts` e `tests/unit/review.test.ts`, usando os mesmos schemas do formulário.

## Phase 7: US4 — Contratos vinculados (P2)

**Goal**: Criar/listar contrato com cliente correto e valores válidos.
**Independent Test**: Com cliente de fixture, pedir contrato, informar título/valor/data e confirmar.

- [x] T024 [P] [US4] Criar `app/components/ContractForm.vue`, `app/pages/contratos/index.vue` e `app/pages/contratos/novo.vue` com seleção de cliente, título, BRL em centavos, datas e status Rascunho/Ativo/Encerrado conforme `data-model.md`.
- [x] T025 [US4] Completar patch-draft de contrato em `app/utils/actions.ts` e contexto em `app/composables/useAssistant.ts`; bloquear IDs inexistentes, orientar cadastro quando não houver clientes e desambiguar homônimos.
- [x] T026 [US4] Integrar formulário, revisão e lista em `app/composables/useWorkspace.ts` e `app/utils/review.ts`, preservando campos obrigatórios ausentes até a revisão e sem arredondamento silencioso de dinheiro.
- [x] T027 [US4] Cobrir contrato, datas cruzadas, cliente inexistente, centavos e limite200 em `tests/unit/schemas.test.ts` e `tests/unit/review.test.ts`.

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T028 Implementar E2E com IA interceptada em `tests/e2e/assistant.spec.ts` cobrindo login, cinco destinos de navegação, um cliente e um contrato pelo chat e outro de cada manualmente, confirmação, quatro registros após recarga e cancelamento; nenhuma resposta falsa habilitada no app real.
- [x] T029 Revisar erros sem segredos, foco, teclado, aria-live, formulário mobile e falhas de provedor em `app/components/AssistantPanel.vue`, `ReviewCard.vue`, `ClientForm.vue` e `ContractForm.vue`.
- [x] T030 Executar typecheck, testes, E2E e build definidos em `package.json`; registrar resultados e ambiente em `specs/001-assistente-local/checklists/readiness.md`, separando checks do app dos checks documentais.
- [x] T031 Executar smoke real de streaming/tools somente com chave e modelo disponíveis, conforme `specs/001-assistente-local/quickstart.md`; registrar modelo, resultado e limites em `checklists/readiness.md`, ou registrar bloqueio sem inventar aprovação de modelo pago.
- [x] T032 Atualizar `README.md` com setup real e evidência do roteiro de `specs/001-assistente-local/quickstart.md`; conferir FR/SC contra implementação antes de marcar a feature concluída.

## Dependencies & Execution Order

Setup T001–T003; base T004–T007; US1 T008–T010; US2 T011–T015;
US5 T016–T019; US3 T020–T023; US4 T024–T027; final T028–T032.
US5 vem antes dos formulários para testar confirmação isolada com fixtures.
US2 pode demonstrar só conversa/navegação; cliente exige US5; contrato exige
um cliente válido (real ou fixture) e os validadores comuns.

T006 pode ocorrer em paralelo a T005 após configuração inicial. Após T019,
T020 e T024 podem ser delegadas a agentes diferentes, com ownership dos arquivos
Vue de cada cadastro. T024 é paralelo à UI de cliente, mas T025/T026 aguardam
a integração de cliente T021/T022. Não editar actions.ts/useWorkspace.ts ao mesmo
tempo em agentes diferentes: esses pontos permanecem com o integrador principal.

## Implementation Strategy

Primeira demonstração: login e chat que abre uma rota com ACK. Segunda: criar
cliente com cartão de revisão, salvamento e recarga. Terceira: contrato por conversa.
Cada fase tem verificação própria; não usar conclusão do login como conclusão do MVP.
As tarefas concluídas têm evidências em execution.md. O checklist readiness preserva a revisão histórica anterior à implementação.

## Phase 9: Extensões autorizadas — CRUD e assistente flutuante

- [x] T033 Corrigir ACK da primeira navegação usando router.currentRoute após navigateTo; repetir cenário com modelo real.
- [x] T034 Evoluir schemas/tipos com metadados opcionais compatíveis com dados existentes.
- [x] T035 Implementar edição compartilhada, revisão obsoleta e preservação de ID/createdAt.
- [x] T036 Implementar soft delete, cascata e restauração seletiva atômicos.
- [x] T037 Criar telas de edição/lixeira e cartões de impacto com confirmação explícita.
- [x] T038 Ampliar contexto e tools para editar/excluir sem gravar por IA.
- [x] T039 Testar dados legados, conflitos de revisão, cascata e restauração.
- [x] T040 Transformar chat em popover flutuante persistente, responsivo e acessível.
- [x] T041 Mostrar cartão de destino antes da navegação, com animação e reduced-motion.
- [x] T042 Reduzir mensagens e renderizar negrito seguro, sem HTML executável.
- [x] T043 Criar suíte Playwright real em Chrome externo isolado, sem expor credenciais.

## Phase 10: US8 — Lote de clientes e contratos

- [x] T044 Definir schemas de lote, refs únicas, limite10 e vínculos novos/existentes.
- [x] T045 Implementar combinação por ref, revisão e gravação única, sem efeito parcial em falha.
- [x] T046 Criar BatchCard com campos, pendências, vínculos e confirmação única.
- [x] T047 Integrar prepare-batch, contexto antes da mensagem atual e dados complementares.
- [x] T048 Validar fallback sem avanço válido, com testes de preservação e erro seguro.
- [x] T049 Repetir lote incompleto/complementado e múltiplos vínculos com OpenRouter real.
- [x] T050 Concluir typecheck, testes, build e documentos finais com evidências atuais.

## Phase 11: Avaliação de modelos gratuitos

- [x] T051 Verificar catálogo e preço de Ling/ERNIE gratuitos, executar os mesmos três cenários reais no Chrome sem fallback, registrar falhas sem flexibilizar aceite e configurar ERNIE gratuito com fallback vazio nos defaults. Validar tipos/testes/build após a troca. A tarefa conclui a avaliação, não declara paridade dos modelos.

## Phase 12: US9 — Configurações de modelos

- [x] T052 Definir seleção estrita, modelos reduzidos, screen settings e campo opcional no ChatRequest, preservando requests existentes.
- [x] T053 Implementar catálogo autenticado paginado/cacheado, busca/filtros, classificação segura de custo e seleção validada no servidor.
- [x] T054 Criar tela e composable de preferência local, busca com debounce/cancelamento, ID manual e snapshot por turno.
- [x] T055 Estilizar a tela e acomodar cinco itens na navegação mobile, sem dependência nova.
- [x] T056 Validar cache/single-flight/erros/auth/storage, seleção aplicada no chat e desktop/mobile; concluir tipos/build/docs com evidências.

## Phase 13: Catálogo compacto e filtro de compatibilidade

- [x] T057 Filtrar compatibilidade no servidor antes da paginação, preservar default all e aumentar página para 40 com testes combinados.
- [x] T058 Iniciar UI em Compatíveis, permitir Todos/Incompatíveis, compactar resumos/toolbar/linhas e recolher ID manual sem perder custo/ações.
- [x] T059 Verificar filtros, paginação de 40, densidade desktop/mobile, tipos/testes/build e atualizar evidências sem inferências pagas.

## Phase 14: US10 — Cotação BRL e detalhes de modelos

- [x] T060 Implementar cotação autenticada/cacheada com ASK, datas reais, defasagem e recuperação limitada; ampliar metadados de modalidade/descrição/extras.
- [x] T061 Implementar e testar estimativas puras, precisão antes de formatar, centavos curtos e modalidades sem gratuidade falsa.
- [x] T062 Integrar simulador, consulta FX visível, fallback USD e tooltip acessível sem alterar seleção/chat.
- [x] T063 Estilizar faixa de simulação e portal de detalhes preservando densidade e alvos mobile.
- [x] T064 Validar API real sem inferência, conversões controladas, erros/defasagem, hover/foco/toque/escape e desktop/mobile; tipos/build/docs.

## Phase 15: US11 — Ditado nativo no chat

- [x] T065 Implementar ciclo de reconhecimento pt-BR e medição real, cleanup/cancelamento e inserção preservando texto, com testes unitários.
- [x] T066 Integrar controle de ditado ao composer, revisão sem autoenvio, teclado/toque/hold, limite e visibilidade do chat.
- [x] T067 Estilizar badge, medidor e processamento compacto com mobile e movimento reduzido.
- [x] T068 Verificar em Chrome externo com reconhecimento controlado e áudio sintético, incluindo erros/cancelamento/nenhuma inferência; tipos/build/documentação.

- [x] T069 [US10] Corrigir corrida foco/clique no tooltip, comprovar red/green com APIs públicas e preservar teste original de toque.

## Phase 16: US11 — Captura contínua e conclusão manual

- [x] T070 Manter captura em pausas/no-speech, rearmar sem duplicação e concluir apenas por gesto explícito, com testes de ciclo/cancelamento/reinícios/resultados finais.
- [x] T071 Simplificar botão para iniciar/concluir, remover finalização ao soltar e manter carregamento enquanto resultado extenso estiver pendente.
- [x] T072 Atualizar E2E Chrome com pausas, ruído sem resultado, múltiplos segmentos e processamento longo; verificar tipos/testes/build e documentos.

## Phase 17: US12 — Remap visual do chat

- [x] T073 Refazer markup do chat/composer e sugestões Mostrar mais/Tópicos preservando lógica/ditado/confirmação; criar esfera SVG decorativa local.
- [x] T074 Aplicar tema claro/verde isolado, proporções da referência, animação orgânica com pausa/reduced-motion e responsividade.
- [x] T075 Atualizar testes visuais/contrato de dimensões e verificar sugestões, foco, pausa da esfera e desktop/mobile; regressão/tipos/build/documentação.
