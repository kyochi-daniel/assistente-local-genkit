# Quickstart — desenvolvimento e demonstração

## Estado e atualização desta entrega

Spec Kit 1.2.5 inicializado para Codex. O MVP foi implementado após autorização
do usuário; comandos, versões e evidências atuais estão em [execution.md](execution.md).
O trecho de scaffold abaixo documenta como o projeto foi preparado, não uma etapa
a repetir sobre o código existente. Não há segredos reais versionados; credenciais
geradas somente no `.env` local. Para executar, siga o README da raiz.

## Abrir a preparação

Leia [spec.md](spec.md), [plan.md](plan.md) e [tasks.md](tasks.md).
As skills locais são `$speckit-analyze`, `$speckit-implement` e `$speckit-converge`.
Use `$speckit-analyze` para revisar os artefatos ou `$speckit-implement` para desenvolver
a feature selecionada em `.specify/feature.json`. Não é necessário trocar de branch.

Checagem disponível agora, a partir da raiz:

```bash
rtk proxy specify version
rtk proxy .specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks
```

## Preparar a aplicação (durante implementação)

1. Conferir Node 24.15+ LTS e engines da versão Nuxt mais recente.
2. Criar scaffold com `npm create nuxt@latest`, usando template mínimo. Preservar
   a preparação existente; usar pasta temporária se o gerador não aceitar a raiz ocupada.
3. Instalar dependências do plan.md e configurar componentes shadcn-vue necessários.
   Não instalar Spec Kit como dependência de runtime do app: ele é ferramenta do projeto.
4. Criar scripts npm: dev, typecheck (`nuxt typecheck`), test (`vitest run`),
   test:e2e (`playwright test`) e build (`nuxt build`). Registrar o lockfile.
5. Criar `.env.example` com nomes de [contracts/auth.md](contracts/auth.md),
   copiar localmente para `.env` e preencher credenciais/segredo. Gerar segredo
   com gerador criptográfico local; não colar segredo em logs ou no chat.
6. Preencher chave e ID real OpenRouter apenas quando testar inferência. Sem
   configuração, chat informa indisponibilidade; demais telas continuam funcionando.
   Os defaults atuais usam baidu/ernie-5.5-flash-preview:free com fallback vazio.
   inclusionai/ling-3.2-flash:free também foi avaliado. Não reativar DeepSeek/Luna
   pagos automaticamente. Os gratuitos ainda não passaram em todos os cenários.

Depois de implementados os scripts:

```bash
rtk proxy fnm exec --using 24 npm run typecheck
rtk proxy fnm exec --using 24 npm test
rtk proxy fnm exec --using 24 npm run test:e2e
rtk proxy fnm exec --using 24 npm run build
rtk proxy fnm exec --using 24 npm run dev -- --host localhost
```

Abrir http://localhost:3000. Usar dados fictícios e uma aba ativa.

## Roteiro mínimo de aceite

1. **US1 / acesso:** abrir /clientes sem sessão; ver login. Senha incorreta deve
   falhar. Entrar com credenciais locais; acessar /assistente. Logout deve invalidar
   cookie, abortar turno e impedir novas chamadas de chat.
2. **US2 / navegação:** pedir “Abra a lista de clientes”. A rota muda para /clientes,
   o painel e a conversa permanecem, e “aberto” só aparece após navegação concluir.
3. **US3 / cliente:** pedir “Cadastre uma cliente chamada Ana”. Ver formulário
   /clientes/novo com Ana. E-mail é opcional; dizer “adicione ana@example.com”.
   O campo muda visivelmente. Pedir “pode salvar”; ainda não deve haver cadastro.
4. **US5 / confirmação:** revisar cartão com Ana/e-mail. Confirmar pelo botão.
   Ver exatamente um cliente na lista. Duplo clique não duplica. Recarregar a página
   conserva cliente/conversa. Gerar outra revisão, editar nome e tentar confirmar
   a antiga; deve exigir novo resumo. Cancelar revisão conserva o rascunho.
5. **US4 / contrato:** pedir “Crie um contrato para Ana”. Assistente pede título,
   valor e início; informar “Consultoria, R$ 1.500, início em 2026-11-15”. Ver
   cliente vinculado, 150000 centavos no estado e R$ 1.500,00 na UI. Revisar e
   confirmar. Ver contrato com status Rascunho e cliente correto.
6. **US3/US4 / uso manual:** pelo menu, criar cliente Bruno com nome e telefone.
   Preencher manualmente contrato de Bruno com título Suporte, R$ 250,00 e início
   em 2026-11-16. Revisar e confirmar cada formulário. Recarregar: devem existir
   dois clientes (Ana/Bruno) e dois contratos (Consultoria/Suporte), correspondentes
   aos quatro resumos aprovados. Nenhuma chamada IA é necessária neste percurso.
7. **Ambiguidade:** cadastrar outra Ana; pedir contrato para Ana. O assistente
   precisa pedir a escolha, sem selecionar a primeira ocorrência silenciosamente.

## Falhas que precisam de evidência

- IA simulada envia rota externa, campo extra, UUID inexistente ou revisão antiga:
  nenhuma ação inválida executa e o rascunho permanece.
- Cancelar a geração: ignorar chunks e ações tardias; impedir retry automático.
- Interromper stream sem turn_end: indicar falha, nunca repetir ação já aplicada.
- Simular chunks SSE partidos, inclusive caracteres UTF-8 e tool calls incompletas:
  não executar JSON parcial. Atingir limite de rodadas termina sem loop infinito.
- Sem cliente cadastrado: preparar cliente e contrato juntos se solicitado, ou perguntar qual cliente usar. Data final anterior
  ao início e valor inválido bloqueiam revisão e salvamento.
- Storage indisponível/quota cheia: indicar falha e manter rascunho; não dizer “salvo”.
  JSON local corrompido: não apagar nem sobrescrever o conteúdo automaticamente.
- Reload com revisão aberta: manter dados/rascunho, descartar confirmação anterior.
- Chave ausente, 429 ou erro OpenRouter: mostrar erro compreensível; fallback desativado no modo gratuito atual; não chamar Luna pago automaticamente.
- POST /api/chat sem sessão ou com origem diferente: rejeitar antes de chamar provedor.

## Provedor simulado e teste real

E2E usa interceptação do endpoint e fixtures apenas em tests/, sem modo falso
habilitado na aplicação. Esse teste verifica interface e protocolo, não qualidade
do modelo. Smoke real: repetir navegação, cliente e contrato com modelo configurado
e registrar ID do modelo, resultado e latência, sem tokens ou dados completos.
Sem chave/aceite de modelo pago, registrar smoke como não executado.

## Extensões: CRUD, chat flutuante e lote

1. Editar cliente/contrato por formulário e por chat; confirmar mantém ID e altera
   somente os campos solicitados. Recarregar conserva a edição.
2. Excluir cliente com contratos: cartão informa o impacto. Confirmar envia à
   lixeira. Restaurar traz somente os contratos dessa exclusão conjunta.
3. Recolher/reabrir chat preserva conversa e rascunho. Pedir navegação mostra
   destino e transição antes da rota. Resumos usam cartão e texto curto.
4. Pedir “Cadastre Ana, ana@example.com, e um contrato Consultoria para ela”.
   O lote conserva os dois rascunhos e pergunta valor/início. Responder
   “R$ 2.500,00, início em 2026-11-15”. Revisar uma vez e confirmar: cliente e
   contrato aparecem juntos, corretamente vinculados. Falha de quota salva zero.
5. Repetir com dois clientes e seus contratos: uma revisão, vínculos distintos.
   Limite de dez registros inclui clientes e contratos; não omitir excedentes.

Com chave local configurada, o comando abaixo usa OpenRouter real. O custo depende
do modelo; os defaults atuais são gratuitos e sujeitos a quota. Abre Chrome externo em janelas isoladas, sem alterar os dados do perfil
pessoal. Não registra chave, senha ou cookie.

```bash
rtk proxy fnm exec --using 24 npm run test:live
```

A suíte real cobre CRUD, campos faltantes, homônimos e lotes dependentes.
A evidência atual, incluindo limitações, fica em [execution.md](execution.md).

## Configurações — US9

Abrir /configuracoes pelo menu, buscar Ling por nome ou ID/tag, selecionar principal
e aplicar. Adicionar um alternativo pago (somente nos testes interceptados), conferir
selo e preços e aplicar; reload deve conservar seleção. Desativar alternativo grava
null; restaurar padrão remove apenas preferência, preservando os cadastros.

Verificar quarenta resultados por página, filtros de preço/compatibilidade e paginação.
O padrão Compatíveis esconde incompatíveis; Todos/Incompatíveis permitem vê-los
com seleção bloqueada. Abrir Informar ID manual para usar a entrada direta. ID manual malformado
é bloqueado; ID ausente mostra preço/compatibilidade não confirmados. Modelo somente
de imagem aparece indisponível. Erro de quota conserva configuração anterior.
O teste tests/live/settings.spec.ts usa somente Ling gratuito e confirma no rodapé
que o Genkit recebeu a escolha da tela, sem fallback pago. Não pressupõe paridade
de qualidade com outros modelos.

## Ditado — US11

1. No Chrome em localhost, permita o microfone após clicar em Ditar mensagem.
2. Fale em português; confira Ouvindo e barras. Faça pausas: a captura deve
   continuar sem inserir texto. Clique novamente para concluir. Veja Transcrevendo
   e depois o texto no campo, sem envio automático. Soltar não conclui.
3. Edite/revise e envie manualmente. Repita com texto anterior/seleção para conferir
   preservação; X/Escape descarta, minimizar/ocultar a aba interrompe a captura.
4. Recuse permissão ou use navegador sem suporte: a digitação deve continuar.
5. Para o teste automatizado sem microfone pessoal nem inferência, execute
   `npx playwright test tests/e2e/dictation.spec.ts`. Ele abre Chrome externo com
   reconhecimento controlado e áudio sintético; não comprova precisão de fala real.

## Remap do chat — US12

1. Abra o assistente em viewport de 1440x1000: painel de 736x780, esfera verde animada,
   pergunta em duas linhas e três sugestões à direita, sem rolagem inicial.
2. Mostrar mais revela duas sugestões; Mostrar menos recolhe. Digite sem enviar,
   recolha/abra Tópicos e minimize/abra o chat: texto e histórico devem permanecer.
3. Com histórico longo, abra Tópicos e confira os atalhos na área visível. Selecionar
   um usa o fluxo normal do chat, com as mesmas regras de confirmação.
4. Ative movimento reduzido ou minimize: a esfera para. SVG é decorativo e não
   deve receber foco/leitura. Digite, dite e confirme uma revisão como antes.
5. Confira 375x812 e 320x568: header/composer/controles dentro da viewport; somente
   conteúdo do chat rola quando necessário. O azul e layout do menu não mudaram.
6. Teste automatizado sem inferência: `npx playwright test tests/e2e/chat-design.spec.ts`.
