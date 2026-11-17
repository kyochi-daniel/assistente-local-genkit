# Genkit — Assistente local

## Objetivo e fonte de verdade

Protótipo Nuxt/Vue com chat Genkit que navega e preenche cadastros locais.
Leia `.specify/memory/constitution.md` e `specs/001-assistente-local/` antes de implementar.
Spec Kit 1.2.5 inicializado para Codex; skills em `.agents/skills/speckit-*/SKILL.md`.
O MVP está implementado; evidências e limitações ficam em `specs/001-assistente-local/execution.md`.

## Decisões

- Nuxt estável mais recente, Vue, TypeScript, Nitro Node.js, shadcn-vue e Tailwind.
- Sem banco. Estado reativo compartilhado e localStorage validado no cliente.
- Genkit + OpenRouter somente no servidor. Principal atual de teste: baidu/ernie-5.5-flash-preview:free;
  fallback vazio. Ling gratuito também foi avaliado. Não reativar modelos pagos
  automaticamente; conferir limitações reais em execution.md.
- O modelo propõe navigate, patch-draft, request-review, request-delete e prepare-batch. Nunca grava sozinho.
- CRUD de clientes/contratos com soft delete em lote, impacto visível e restauração.
- Chat flutuante persistente; visual claro/verde limitado ao painel, seguindo a referência
  do usuário. Esfera SVG local animada, pausada em estado oculto/movimento reduzido.
  Mostrar progresso antes da navegação real; preservar o tema das demais telas.
- Lotes de até 10 clientes/contratos novos usam uma confirmação e escrita atômica;
  contratos podem referenciar clientes novos por aliases ou clientes ativos por UUID.
- Configurações de modelos em /configuracoes: catálogo server-side cacheado/paginado,
  busca por nome/ID/tag, custo visível e preferência local somente de IDs. A escolha
  explícita pode incluir modelo pago; nunca adicionar fallback pago oculto.
- Ditado usa Web Speech API nativa e Web Audio; pausas não concluem, somente o botão
  encerra e preenche texto para revisão,
  sem autoenvio nem transcrição Genkit/OpenRouter. O navegador pode usar serviço remoto.
  Testes de ditado usam reconhecimento controlado e áudio sintético, nunca microfone pessoal.
- Gravação determinística com cartão de confirmação da revisão atual.
- Chat preservado pelo layout. Sem DOM automation, URLs arbitrárias ou eval.
- Uma pessoa, uma aba, dados fictícios; não preparar deploy sem pedido.

## Desenvolvimento

Siga `tasks.md`; marque tarefas apenas após implementar e verificar. Use versões
estáveis resolvidas na implementação e mantenha lockfile. Prefira a menor mudança
completa. Não acrescente ORM, banco, RAG, framework de agentes, PDF ou anexos.
Código Nuxt/Vue, estilização e lógica complexa devem usar especialistas conforme
as instruções do usuário quando houver vantagem concreta. Não reverta trabalho alheio.
Mantenha PT-BR na interface e documentação; nomes técnicos dos contratos são estáveis.

## Verificação

Use Node compatível com `.node-version` (`fnm use`) e os scripts npm
dev/typecheck/test/test:e2e/test:live/build. `test:live` abre Chrome externo e usa
OpenRouter real, podendo consumir créditos conforme configuração; não executar sem autorização. Use o roteiro em `quickstart.md`.
Valide confirmação, deduplicação, escrita local, sessão e streaming. Nunca grave
tokens ou senhas no repositório ou logs. Não exiba payloads completos em erros.
