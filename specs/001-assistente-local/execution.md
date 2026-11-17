# Execução e evidências

**Data local:** 2026-11-15. **Escopo:** localhost, uma pessoa/aba, dados fictícios.

## Entregue

- Nuxt 4.6.4, Vue 3.5.45, TypeScript e Genkit/compat-oai 1.44.0; Node 24.22.3.
- Login local configurável; cookie HttpOnly de 8h, sessão/origem/corpo validados.
- CRUD completo de clientes/contratos. Edição preserva ID e dados não alterados.
- Lixeira com soft delete; exclusão de cliente inclui contratos ativos vinculados.
  Revisão explica impacto. Restaurar respeita exclusões independentes anteriores.
- Chat flutuante persistente, responsivo, recolhível por botão/Escape; fonte,
  negrito seguro e cartões compactos. Navegação mostra destino antes da transição.
- Cinco ferramentas com proposta/ACK; nenhuma salva. Confirmação sempre por botão,
  revisão atual e gravação local concluída antes de declarar sucesso.
- Lote de até dez registros, clientes e contratos novos/existentes, com vínculos por
  ref. Complementos combinam campos sem apagar dados omitidos. Uma revisão e uma
  escrita no storage; falha não deixa cadastros parciais.
- Baseline inicial: DeepSeek V4.1 Flash e fallback GPT-6 Luna. A configuração atual
  usa ERNIE gratuito, sem fallback pago, em avaliação. Modelo efetivo aparece no
  chat; regras e limites em [contracts/assistant.md](contracts/assistant.md).

## Baseline validado — DeepSeek/Luna

Comandos executados com `rtk proxy fnm exec --using 24`.

| Verificação | Evidência |
| --- | --- |
| Spec Kit e links Markdown | Pré-requisitos e links locais passaram |
| Typecheck | Passou |
| Unitários | 117 testes, dez arquivos, passaram |
| E2E com IA interceptada | Oito passaram; um de chave ausente foi pulado porque a chave está configurada |
| OpenRouter real / Chrome externo | Cinco cenários passaram em 58,8s: CRUD/restauração, nome faltante, homônimos, lote complementado e lote 2+2 |
| Build | Passou; bundle Nitro de produção gerado |

Os E2E interceptam apenas o endpoint IA, mantendo login e persistência reais. Os
unitários também exercitam Genkit/compat-oai/SDK reais com fetch controlado, sem
custo. A suíte `npm run test:live` (sem interceptação/trace na execução final) chama OpenRouter e abre Chrome instalado com
Playwright em janelas isoladas; não altera o perfil pessoal. Dados de teste são
fictícios; credenciais são lidas do `.env` sem impressão. Não há modo falso no app.

Falhas encontradas e corrigidas: ACK usando snapshot de rota anterior na primeira
navegação; ações antes da hidratação; campos default apagando patches; referências
obsoletas em edição; perda de campos omitidos no complemento de lote; contexto
JSON posicionado depois da mensagem atual; erros de stream sem mensagem útil;
proposta do modelo com campos omitidos ou vínculo quebrado. O fallback real para
Luna completou valor/data e preservou os campos anteriores.
A execução final usou DeepSeek nos quatro cenários completos e na preparação do
lote; Luna foi selecionado no complemento do lote, indicado no rodapé.
Rascunhos e revisões foram preservados nos casos de quota/erro; zero gravação parcial.

## Ambiente e segredos

A chave foi configurada pelo usuário e usada com sucesso em chamadas reais.
`.env` local tem permissão 0600, ignorado pelo Git. Chave, credenciais, segredo de
sessão e cookie não foram gravados em código, relatórios ou respostas. O servidor
permanece em http://localhost:3000. Nenhuma publicação foi feita.

## Dependências e limites

A revisão de dependências reportou 75 alertas no npm audit: 6 low, 63 moderate e 6 high.
Os high incluem Zod 3 interno do Genkit e Jaeger/OTel transitivo de produção.
Zod direto está em 4.6.7. Não aplicar override de Zod 3→4 ou OTel 1→2 sem validar APIs
internas. O dry-run de audit fix não resolveu os high; não houve audit fix --force,
downgrade do Nuxt ou publicação. Revisar/atualizar Genkit antes de expor o serviço.

Fontes: [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
[Jaeger](https://github.com/advisories/GHSA-45rx-2jwx-cxfr).

Não verificados: Safari, leitor de tela e concorrência entre abas. Dados locais não
são isolados por login e dependem do perfil/storage do navegador. Qualidade e
latência do modelo podem variar; limites são 60s/turno e seis rodadas. Sem deploy.
Os checklists de preparação mantêm seus marcadores históricos; tasks.md e este
arquivo registram a evidência de execução atual.

## Comparação gratuita — 2026-11-14

Consulta ao catálogo público e às páginas oficiais confirmou prompt/completion 0 e
suporte a tools/tool_choice em ambos os IDs. Sem chamada paga nesta comparação.
Cada modelo rodou isoladamente, com fallback vazio, no Google Chrome externo via
Playwright e contextos de navegador isolados. As configurações do provider foram
mantidas: saída de 2.000 tokens, seis rodadas, 60s por turno.

| Cenário | Ling 3.2 Flash free | ERNIE 5.5 Flash Preview free |
| --- | --- | --- |
| CRUD completo e restauração | Falhou ao criar contrato: narrou abertura sem tool; cliente criado/editado corretamente | Falhou na edição: afirmou atualizar telefone sem executar ação |
| Cliente+contrato, dados complementares | Salvou 1+1 e vínculo, mas mudou título literal de Conjunta para Conjunto | Não aplicou valor/data da mensagem complementar; confirmação ficou bloqueada |
| Dois clientes+dois contratos completos | Passou; vínculos distintos corretos | Passou; vínculos distintos corretos |
| Resultado | 1/3 cenários completos; execução de 2,2min | 1/3 cenários completos; execução de 39,9s |

Tempos por mensagem observados: Ling 8,5–30,3s; ERNIE 1,4–8,0s. A amostra é pequena,
sem benchmark estatístico ou garantia de disponibilidade. Esses tempos incluem
respostas sem ação e ensaios interrompidos por falha; não medem o mesmo trabalho
concluído. O primeiro ensaio Ling
teve duas falhas artificiais pelo timeout de 15s do teste; a espera foi ajustada para 70s,
respeitando o prazo de 60s do produto. A tabela usa a nova execução; o ensaio anterior
não entra na contagem. Nesse ensaio também houve e-mail mascarado pelo modelo,
corretamente rejeitado pela validação.

Os testes reais agora têm nome neutro OpenRouter, medem duração e conferem o modelo
configurado quando não há fallback. Nenhum teste foi flexibilizado para aceitar
campos incorretos ou sucesso sem ação.

**Estado final:** `.env`, runtimeConfig e `.env.example` usam
`baidu/ernie-5.5-flash-preview:free` como principal, com fallback vazio. ERNIE fica
ativo apenas como opção de experimento gratuito; não aprovado como equivalente ao
baseline. Chave e credenciais foram preservadas. Dados reais do perfil pessoal não
foram alterados; gravações dos testes usam contextos isolados.

Não testados nesta comparação: imagens do Ling, os dois cenários adicionais de
homônimos/nome ausente, carga, quotas diárias ou repetibilidade estatística. Como o
CRUD falhou antes, exclusão/restauração não foram alcançadas nesses modelos; foram
validadas no baseline anterior. Gratuitos estão sujeitos a rate limits.

Fontes: [Ling](https://openrouter.ai/inclusionai/ling-3.2-flash:free),
[ERNIE](https://openrouter.ai/baidu/ernie-5.5-flash-preview:free),
[catálogo](https://openrouter.ai/api/v1/models).

Após a troca dos defaults: typecheck passou, 117 testes unitários passaram e build
passou. A suíte E2E simulada não foi repetida nesta troca de configuração; sua última
execução continua oito passados e um skip. Nenhuma lógica de ferramenta foi alterada.

## Configurações de modelos — US9

Rota /configuracoes implementada e incluída na navegação, inclusive mobile. Busca por
nome/ID/provedor/tag, filtros Todos/Gratuitos/Pagos, custo antes do nome, página de
vinte resultados e gratuitos primeiro. Modelo incompatível fica visível e bloqueado;
ID manual válido tem aviso de preço/suporte não confirmados. Principal e alternativo
opcional são aplicados por clique e persistem em chave local separada, sem segredos.

O catálogo público completo é consultado pelo servidor (output_modalities=all), sem
chave. Payload reduzido, cache de 30min, single-flight, timeout de 10s, stale e backoff de 30s em
falha. Preço desconhecido nunca vira gratuito; encargos adicionais de imagem/áudio/
requisição são considerados na classificação. A tela busca somente ao abrir, com
debounce de 275ms e cancelamento de resposta antiga; não traz todo o catálogo ao cliente.
Metadados dos IDs selecionados são consultados uma vez por montagem, se necessários.

ChatRequest mantém preferência opcional; requests antigos continuam aceitos.
Snapshot por turno e fallback null prevalecem sobre o ambiente. Sessão/origem,
limites e compatibilidade conhecida são validados antes da inferência. APIkey e
baseURL do cliente são rejeitados. Modelos pagos só entram por escolha explícita.

Verificações:

- Typecheck passou; 148 testes unitários em 12 arquivos passaram (26 de catálogo e
  seleção, cinco de persistência de modelos adicionados).
- E2E completo: 11 passaram, um skip de chave ausente porque a chave está configurada.
- Três cenários de configurações em Chrome externo passaram, incluindo catálogo
  real autenticado/origem, filtro/paginação/debounce, seleção paga sem inferência,
  reload, snapshot em duas rodadas, ID manual, erro de storage e reset.
- Desktop 1440 e mobile 375 inspecionados; sem overflow. SASS compilado.
- Smoke Chrome com catálogo e Genkit reais: escolha Ling gratuito pela tela, Apply,
  chamada de texto e modelo efetivo correto no rodapé, sem fallback. Passou em 6,8s.
  A primeira tentativa de smoke falhou ao ler body SSE pelo DevTools; o teste passou
  a verificar o rodapé alimentado pelo evento real, sem interceptar a inferência.
- Build final passou; bundle Nitro de produção gerado em 9,17s.

Não foram feitas inferências pagas para testar esta página. API pública do catálogo
não gera conteúdo. Imagens, leitor de tela/Safari, quotas/carga e qualidade dos demais
modelos permanecem fora da verificação; as limitações dos gratuitos acima continuam.

## Ajuste de densidade e compatibilidade — US9

O usuário pediu separar compatíveis/incompatíveis e reduzir o tamanho da tela.
Catálogo agora inicia em Compatíveis e oferece Todos/Incompatíveis, combinados com
preço e busca. API aceita compatibility all/compatible/incompatible, com default all
para preservar lookup/chamadas existentes. Filtros são aplicados antes de total e
paginação, que passou de 20 para 40. Cache, custos, auth e inferência foram preservados.

Resumos compactos, ações no cabeçalho, toolbar única com selects de preço e
compatibilidade, linhas de 64px no desktop e entrada manual em details. Nomes, IDs,
preços e motivo de bloqueio permanecem visíveis; controles mobile mantêm 44px.
Em 1440x1000, a primeira linha saiu de aproximadamente y=980 para y=490, com cerca de
oito linhas visíveis (sete completas). Em 375px não houve overflow horizontal.

Verificação: typecheck passou, 149 testes unitários passaram e build passou em 9,10s.
Os oito cenários das demais rotas passaram; os três de Configurações passaram no
reteste Chrome, cobrindo os três modos de compatibilidade, padrão Compatíveis,
combinação com busca/preço, página de 40, debounce, seleção/snapshot, manual e quota.
Um teste ainda esperava a frase antiga conjunta de preço/compatibilidade; foi
atualizado para exigir os dois avisos separados e repetido com sucesso. O cenário
de chave ausente segue skip, pois a chave está configurada. Nenhuma inferência ou
chamada paga foi executada neste ajuste. Contratos, README e tarefas atualizados.

## BRL e informação de modelos — US10

AwesomeAPI pública foi verificada com HTTP 200, sem chave. /api/exchange-rate usa ASK
USD/BRL com timestamp real, cache de 60s, single-flight, timeout de 5s e backoff de 30s. Aceita
somente USD/BRL, taxa positiva finita e data válida (até 5min no futuro, no máximo de 7 dias).
Cache anterior só é usado dentro desse limite e sinalizado; após 24h a cotação já
aparece como última disponível. A data do fetch nunca substitui a data da negociação.
Frontend atualiza por minuto enquanto visível, aborta ao ocultar/sair e mantém USD
quando não há cotação. Não foi adicionada outra chave ou dependência.

Simulador de volumes agregados, padrão 1000+1000, calcula USD das tarifas originais
por token e converte para BRL. Custo positivo pequeno nunca aparece como gratuito:
formata reais, centavos ou <0,01 cent; inválidos/overflow ficam não estimados e valores
positivos abaixo da precisão mantêm indicador mínimo. Zero volume é distinguido da
gratuidade oficial. Sem saída textual mostra Ver tarifas; cache/outras modalidades
podem ter tarifas próprias que não entram nesta base, sem afirmar que todas somam.

Ícone Info em linha e resumo abre painel por hover/foco/clique/toque, com descrição
original escapada, tipo Somente texto/Multimodal quando informado, entradas/saídas,
contexto, suporte a ações, valores por 1M e exemplo. Um painel por vez, via portal
Reka existente e colisão com viewport. Escape/fora/novo toque fecham. Primeiro toque
no mobile fechava após scroll ao sair da busca: foi reproduzido com eventos públicos
e corrigido com pin explícito de clique/toque, preservando hover/foco nativos.

Verificações finais até o build:

- Typecheck passou; 211 unitários em 14 arquivos passaram (55 catálogo/cotação e 34
  formatação/estimativa/modalidades nos testes relevantes).
- Suíte completa E2E: 14 passaram e um skip de chave ausente. Seis casos de
  Configurações usam Chrome externo, incluindo API FX real com auth/origem/query,
  dados financeiros controlados, cache defasado/indisponível e tooltip desktop/mobile.
- Com dólar controlado a R$5,00 e tarifas de 1/2 USD por 1M, 1000+1000 tokens =>1,5 cent;
  1000+2500 =>3 cent. Um token mostra <0,01 cent e 1M de entrada mostra R$5,00.
- Cálculos locais não aumentam requisições de FX nem iniciam inferência. Conteúdo
  externo com marcação HTML permaneceu texto, sem img executável.
- Interação desktop e toque repetidos três vezes pelo agente: 6/6 passaram; full
  posterior também passou. Capturas desktop/mobile inspecionadas sem overflow.
- Build passou em 10,9s. Após ajuste final apenas de redação sobre cache/tarifas,
  um hover automatizado falhou isoladamente. O caso original passou depois 3/3 sem
  instrumentação e 5/5 com diagnóstico, sem scroll/fechamento observado. Causa não
  confirmada; implementação e critérios foram preservados, sem atrasos artificiais.

Limites: cotação comercial de venda é referência, não câmbio de cobrança; API pública
pode ter cache de um minuto/indisponibilidade. Sem IOF, spread, tarifas específicas ou
garantia de qualidade/latência dos modelos. Não foram feitas inferências pagas,
consulta de saldo ou cobrança real. Safari/leitor de tela não foram verificados.

Fontes: [cotação](https://docs.awesomeapi.com.br/api-de-moedas),
[tarifas de cache](https://openrouter.ai/docs/guides/best-practices/prompt-caching).

## Ditado nativo — US11 (2026-11-15)

Registro da primeira versão. O ajuste de captura contínua está na seção seguinte.

Entrega frontend sem dependência nova: SpeechRecognition/webkitSpeechRecognition
pt-BR, Web Audio AnalyserNode em cinco faixas úteis à voz e componente isolado.
Clique inicia/conclui; pressionar e soltar também conclui. Estados de ativação,
escuta e transcrição, barras reais e X de cancelamento. Movimento reduzido congela
as barras e remove giro. Campo preserva texto/seleção, recebe a transcrição para
revisão e nunca envia sozinho; resultado acima de 4000 permanece íntegro para edição.

Cancelamento, ocultação, pagehide, minimizar e desmontar invalidam a sessão e
liberam tracks/AudioContext/RAF/timers, inclusive streams que chegam tarde.
Timeout de captura 60s e de finalização 10s. Falhas de permissão, rede, ausência de
fala ou suporte mantêm digitação manual. Aviso prévio informa possível serviço
externo do navegador; não há promessa de offline. Sem áudio no backend/storage,
sem inferência OpenRouter/Genkit para ditado e sem créditos consumidos nestes testes.

- 22 testes unitários novos; suíte completa: 233 testes aprovados.
- Nove cenários de ditado no Google Chrome externo: clique, hold/release, toque,
  teclado, áudio sintético real no medidor, cursor/texto existente, texto extenso,
  X/Escape/minimizar, eventos tardios, erros, ausência de suporte, logout e
  visibilidade controlada. Nenhuma requisição /api/chat durante esses fluxos.
- Web Speech API nativa presente no Chrome instalado; reconhecimento substituído
  somente no teste por eventos controlados. Microfone pessoal e qualidade de
  transcrição de fala real NÃO foram testados. Permissões/dispositivos do teste
  são sintéticos em contexto isolado; não alteram o perfil pessoal.
- Abrir outra página do contexto manteve ambas janelas visíveis neste ambiente,
  inclusive após bringToFront. O teste de ocultação controla document.hidden e
  visibilitychange explicitamente; não declara cobertura de troca real de aba.
- QA por capturas desktop e 375x812: aviso final inicialmente cobria textarea;
  corrigido para feedback no fluxo e card ativo acima do composer. Revisão fica livre.
  Capturas em /tmp/nexo-dictation-{listening,review,mobile}.png (fora do repositório).
- Resultado final com Node 24.22.3: typecheck passou, 233 testes unitários passaram,
  E2E completo passou com 24 aprovados e 1 ignorado (cenário sem chave, pois há chave
  configurada), build aprovado em 5,10s. Pré-requisitos Spec Kit e links locais passaram.
- A primeira regressão completa encontrou uma falha de toque no tooltip de modelos.
  Experimento público focus + microtask + click comprovou a corrida: o foco abria
  antes do clique, e o clique negava o estado aberto e fechava o painel. Agora o
  clique alterna a fixação explícita. Novo teste falhou no código anterior e passou
  com a correção; teste original de toque preservado e aprovado na suíte final.
  Instrumentação temporária removida. Nenhum teste live de modelos foi executado.

## Ditado contínuo e conclusão manual — US11 (2026-11-15)

Ajuste após teste do usuário: a versão anterior usava continuous=false e concluía
em onspeechend. Agora continuous=true; pausa/fim de fala não conclui. Encerramento
normal ou no-speech rearma outra instância após 250ms mantendo sessão e medidor.
Somente resultados finais são combinados por índice/instância, sem duplicação e
sem inserir parciais no campo. Somente o botão conclui, inclusive após pausa.

Removidos gesto de segurar/soltar e timeout de captura de 60s. Botão alterna
iniciar/concluir; durante finalização, fica desabilitado com ícone de carregamento,
aria-busy e nome Transcrevendo. X permanece disponível e recebe foco enquanto
aguarda; Escape, ocultar e sair continuam cancelando, inclusive reinícios pendentes.
Watchdog de finalização permanece 10s. Não há atraso artificial para simular demora.

Dez E2E de ditado passaram no Chrome externo com áudio sintético e reconhecimento
controlado. Novo cenário atravessa pausa, encerramento normal e no-speech, combina
frases finais sem repetição, ignora parcial e só preenche após clique. Resultado
longo mantém spinner/X e campo intacto até end nativo. Captura visual conferida:
/tmp/nexo-dictation-processing.png. Sem requisições /api/chat, sem créditos e sem
usar o microfone pessoal. Ruído reconhecido como fala ainda depende do navegador;
não há filtro acústico próprio nem teste de precisão real de voz.

Verificação final: 236 testes unitários aprovados; suíte E2E completa com 25 aprovados
(incluindo 10 de ditado) e 1 ignorado, pois o cenário sem chave não se aplica ao
ambiente configurado. Typecheck passou, build passou em 9,11s, sem dependência nova.
Spec Kit e links locais preservados. Nenhum teste live de modelo executado.

## Remap visual isolado do chat — US12 (2026-11-15)

Visual aplicado somente ao painel: 736x780 no desktop, cinza-claro com tokens
locais teal, título compacto/X, esfera verde de 120px em SVG, pergunta em duas linhas,
chips brancos à direita, Mostrar mais/menos (3/5) e composer branco em duas faixas.
Tópicos reabre opções ao final do histórico, com scroll até o bloco e sem remover
mensagens/revisões. Nenhuma mudança de rotas, storage, sessão ou provedor.

Esfera usa gradientes, manchas recortadas e filtros estáticos; anima somente
transform/opacity por CSS, sem vídeo, imagem remota, pacote novo ou RAF de UI.
Data-active/orb-active pausa ao minimizar/ocultar; prefers-reduced-motion remove
loops. SVG decorativo fora da árvore acessível. Corrigida colisão inicial com
classe global active, que desenhava quadrado verde atrás da esfera. Classes de
status existentes foram preservadas. O texto cinza usa contraste AA calculado
4,56:1 no painel e 5,28:1 no branco. Foco do textarea contorna composer inteiro;
botões mantêm foco individual. Aviso sobre ditado pelo navegador continua visível.

Verificação com Node 24.22.3:

- Typecheck passou; 236 testes unitários aprovados.
- E2E completo: 29 aprovados e 1 ignorado (sem chave não se aplica ao ambiente).
  Quatro casos novos: proporções/tema/atalhos/esfera, Tópicos com oito mensagens
  longas e envio interceptado, 375x812 e 320x568. Controles de pelo menos 44px dentro da viewport;
  sem overflow horizontal nem rolagem inicial no desktop com três sugestões.
- Asserções de esfera vetorial/transparente, pausa ao minimizar, animação ativa e
  movimento reduzido passaram. Menu manteve --primary azul original.
- Suítes de CRUD, streaming/confirmação, navegação e dez casos de ditado passaram.
- Build passou em 10,6s. Sem teste live ou inferência OpenRouter para o remap.
- Capturas visuais conferidas em /tmp/nexo-chat-remap-desktop.png,
  /tmp/nexo-chat-remap-375.png e /tmp/nexo-chat-remap-320.png. Arquivos fora do repo.
  Comparação visual humana com a referência, sem afirmar igualdade de pixels.
- Mobile foi emulado no Chrome externo. Não foi testado aparelho físico, Safari
  ou Firefox. A esfera é uma aproximação vetorial da referência, não o vídeo original.
