# Feature Specification: Assistente local para clientes e contratos

**Feature**: `001-assistente-local` (diretório de especificação; sem branch Git criada)

**Created**: 2026-11-13

**Status**: Implementado com CRUD, chat flutuante, lotes, configurações e ditado; verificações em [execution.md](execution.md).

**Input**: User description: "MVP local com login fixo, criar/listar clientes e contratos e chat persistente que navega, preenche formulários, pergunta dados faltantes e exige confirmação antes de salvar. Preparar todas as especificações antes de desenvolver. Extensões autorizadas: editar, excluir/restaurar, chat flutuante com transição e lote dependente de clientes e contratos."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Acessar o ambiente local (Priority: P1)

Como usuário único, quero entrar com credenciais fixas e sair para controlar o acesso ao ambiente demonstrativo.

**Why this priority**: O acesso precede o uso dos cadastros e do assistente.

**Independent Test**: Entrar com credenciais válidas, acessar uma página protegida e sair, sem depender de cadastros ou de uma resposta de IA.

**Acceptance Scenarios**:

1. **Given** o login aberto, **When** informo as credenciais fixas válidas, **Then** acesso a tela do assistente e posso abrir a lista de clientes pelo chat ou menu.
2. **Given** credenciais incorretas ou sessão ausente, **When** tento entrar ou acessar uma página protegida, **Then** continuo no login, sem acesso às telas protegidas e às funções de IA. Os dados locais pertencem ao perfil do navegador e não são isolados pelo login demonstrativo.
3. **Given** sessão ativa e uma resposta pendente, **When** saio, **Then** retorno ao login, a resposta perde validade e nenhum cadastro é salvo; após novo login, os registros e a conversa locais permanecem disponíveis.

---

### User Story 2 - Conversar e navegar sem perder o contexto (Priority: P1)

Como usuário, quero manter o chat disponível entre páginas e pedir que o assistente navegue e preencha o formulário visível.

**Why this priority**: Demonstra a interação central: a conversa produz mudanças observáveis na aplicação.

**Independent Test**: Com sessão ativa e listas vazias, pedir para abrir clientes, iniciar um cadastro com nome e navegar para a lista, conferindo o histórico e o rascunho.

**Acceptance Scenarios**:

1. **Given** sessão ativa, **When** peço para abrir clientes, contratos ou um dos formulários, **Then** vejo a página correspondente e o mesmo chat continua disponível.
2. **Given** nenhum rascunho ativo, **When** digo "cadastre a cliente Ana, e-mail ana@example.com", **Then** vejo o formulário de cliente com esses campos preenchidos durante a conversa, antes de qualquer salvamento.
3. **Given** um rascunho já preenchido, **When** navego entre listas e volto ao formulário, **Then** encontro os valores atuais e o histórico da conversa.
4. **Given** um rascunho de cliente, **When** peço para iniciar um contrato, **Then** escolho manter o rascunho atual ou descartá-lo antes de trocar; recusar o descarte preserva seus dados.
5. **Given** uma resposta em andamento, **When** edito manualmente um campo, **Then** uma proposta baseada nos valores anteriores não sobrescreve a edição e o assistente informa que preciso tentar novamente com os dados atuais.
6. **Given** o assistente em processamento, **When** ocorre falha, demora superior a 60 segundos ou cancelamento, **Then** o estado fica explícito, posso tentar novamente e ações tardias não são aplicadas.
7. **Given** resposta com ação ou campo não permitido, **When** ela é recebida, **Then** a proposta inválida não altera a aplicação e aparece uma mensagem de erro recuperável.
8. **Given** quarenta mensagens no histórico, **When** uma nova mensagem é acrescentada, **Then** permanecem visíveis e recuperáveis as quarenta mais recentes; a interface informa que mensagens anteriores saem do histórico.

---

### User Story 3 - Criar e listar clientes (Priority: P1)

Como usuário, quero cadastrar clientes manualmente ou pelo chat e conferir os registros salvos.

**Why this priority**: É o primeiro fluxo completo e fornece os clientes necessários aos contratos.

**Independent Test**: Em uma lista vazia, cadastrar um cliente pelo formulário e outro pelo chat, confirmar ambos e conferir a lista após recarregar.

**Acceptance Scenarios**:

1. **Given** a lista sem clientes, **When** abro a página, **Then** vejo o estado vazio e a opção de criar um cliente.
2. **Given** o formulário de cliente, **When** informo nome e, opcionalmente, e-mail e telefone válidos, reviso e confirmo, **Then** o cliente aparece uma única vez na lista com os dados informados.
3. **Given** nome ausente ou composto apenas de espaços, **When** peço um cadastro pelo chat, **Then** o assistente pergunta o nome sem inventá-lo e sem salvar.
4. **Given** e-mail informado em formato inválido, **When** peço revisão, **Then** vejo o erro no campo e nenhuma confirmação habilita o salvamento até a correção.
5. **Given** um rascunho preenchido, **When** altero seus campos manualmente ou pelo chat antes de confirmar, **Then** a revisão usa os mesmos valores exibidos no formulário.
6. **Given** duzentos clientes salvos, **When** tento salvar outro, **Then** vejo o limite do protótipo, nenhum registro adicional é criado e o rascunho permanece disponível.

---

### User Story 4 - Criar e listar contratos (Priority: P2)

Como usuário, quero registrar um contrato relacionado a um cliente existente e conferir seus dados na lista.

**Why this priority**: Amplia o mesmo fluxo de cadastro com vínculo, valor e datas, após o cadastro de clientes estar definido.

**Independent Test**: Com um cliente fictício previamente cadastrado, criar um contrato pelo formulário e outro pelo chat, confirmar e conferir a lista.

**Acceptance Scenarios**:

1. **Given** um cliente cadastrado, **When** informo cliente, título, valor positivo em BRL e data de início, reviso e confirmo, **Then** o contrato aparece na lista com o cliente correto, status inicial "rascunho" e término opcional.
2. **Given** dados obrigatórios faltantes, **When** peço um contrato pelo chat, **Then** o assistente pergunta somente os obrigatórios restantes, preserva os valores conhecidos e não inventa valores, datas ou clientes.
3. **Given** nenhum cliente cadastrado ou cliente solicitado inexistente, **When** inicio um contrato, **Then** recebo orientação para cadastrar ou selecionar um cliente e nenhum contrato é salvo.
4. **Given** dois clientes com o mesmo nome, **When** o pedido informa apenas esse nome, **Then** escolho um dos registros antes de o contrato poder ser revisado.
5. **Given** valor zero, negativo ou com mais de duas casas decimais, data inválida ou término anterior ao início, **When** peço revisão, **Then** os campos inválidos são indicados e nenhum contrato é salvo.
6. **Given** nenhum contrato salvo, **When** abro contratos, **Then** vejo o estado vazio e a opção de criar um contrato.
7. **Given** um contrato ainda não salvo, **When** escolho status "ativo" ou "encerrado", **Then** a revisão e o registro confirmado usam esse status; qualquer outro status é recusado.
8. **Given** duzentos contratos salvos, **When** tento salvar outro, **Then** vejo o limite do protótipo, nenhum registro adicional é criado e o rascunho permanece disponível.

---

### User Story 5 - Confirmar, cancelar e recuperar com segurança (Priority: P1)

Como usuário, quero revisar o conteúdo exato antes de salvar e recuperar meu trabalho quando houver falha ou interrupção.

**Why this priority**: Evita cadastros indevidos, repetidos ou diferentes do conteúdo aprovado.

**Independent Test**: Com um rascunho válido, testar revisão, edição posterior, cancelamento, confirmação repetida, falha de gravação e recarregamento; conferir registros e mensagens.

**Acceptance Scenarios**:

1. **Given** um rascunho válido, **When** peço para salvar pelo chat ou formulário, **Then** vejo um cartão com todos os valores que serão gravados e os botões "Confirmar salvamento" e "Cancelar"; ainda não existe um novo registro.
2. **Given** revisão pendente, **When** digo "sim" ou o modelo afirma que pode salvar, **Then** nenhum registro é criado; a aplicação orienta usar o botão de confirmação.
3. **Given** cartão pendente, **When** qualquer campo muda, **Then** a confirmação anterior perde validade e uma nova revisão é necessária.
4. **Given** cartão válido, **When** pressiono "Confirmar salvamento", inclusive repetidamente, **Then** aquele salvamento gera um único registro e a mensagem de sucesso aparece somente após a confirmação da gravação efetiva.
5. **Given** cartão pendente, **When** cancelo, **Then** o cartão perde validade, nenhum registro é criado e o rascunho permanece para correção.
6. **Given** falha ao gravar, **When** confirmo, **Then** vejo que o cadastro não foi salvo, preservo o rascunho e posso tentar novamente sem duplicar um registro já gravado.
7. **Given** conversa, rascunho e revisão pendente, **When** recarrego a página ou perco a sessão, **Then** nenhum salvamento automático ocorre; após acesso válido recupero conversa e rascunho, mas preciso revisar novamente.
8. **Given** armazenamento indisponível ou dados locais ilegíveis, **When** tento recuperar ou salvar, **Then** vejo a falha, o conteúdo legível e o rascunho atual são preservados e dados anteriores não são substituídos silenciosamente.

### User Story 6 - Editar, excluir e restaurar cadastros (Priority: P1)

Como usuário, quero CRUD completo de clientes e contratos, com confirmação das
alterações e possibilidade de desfazer a exclusão pela lixeira.

**Independent Test**: Carregar um cadastro antigo, editar sem duplicar, mover cliente
e contratos vinculados para a lixeira e restaurar apenas os itens daquele lote.

**Acceptance Scenarios**:

1. **Given** um cliente ou contrato existente, **When** abro Editar pelo menu ou chat,
   **Then** vejo os valores atuais e a confirmação preserva identificador e data de criação.
2. **Given** uma edição pendente, **When** outro estado invalida o registro ou sua revisão,
   **Then** a gravação é bloqueada, sem recriar um cadastro excluído.
3. **Given** cliente com contratos ativos, **When** peço exclusão, **Then** vejo nome,
   quantidade e lista dos contratos afetados antes de confirmar a ida à lixeira.
4. **Given** confirmação de exclusão, **When** cancelo, **Then** nenhum registro é alterado.
5. **Given** cliente na lixeira, **When** confirmo restaurar, **Then** voltam o cliente
   e apenas os contratos movidos junto com ele; contratos excluídos antes continuam lá.
6. **Given** contrato cujo cliente está na lixeira, **When** acesso a restauração,
   **Then** vejo a orientação para restaurar primeiro o cliente.
7. **Given** dados locais da versão anterior, **When** abro a aplicação atual,
   **Then** os registros são preservados e podem ser editados sem reset.

### User Story 7 - Conversar em um painel flutuante e acompanhar a navegação (Priority: P1)

Como usuário, quero um chat organizado que possa minimizar e um feedback suave
antes de o assistente mudar de página.

**Independent Test**: Minimizar/reabrir mantém uma mensagem não enviada; pedir
clientes mostra progresso antes da troca de rota e abre a confirmação compacta.

**Acceptance Scenarios**:

1. **Given** chat aberto, **When** minimizo ou pressiono Escape, **Then** aparece um
   botão flutuante; reabrir conserva conversa, mensagem não enviada e tarefa em curso.
2. **Given** uma navegação solicitada, **When** a ação começa, **Then** vejo o destino
   no cartão de progresso antes da mudança, sem recarregar ou remontar o chat.
3. **Given** preferência por movimento reduzido, **When** abro painel ou navego,
   **Then** o feedback continua disponível sem deslocamento animado.
4. **Given** texto da IA com negrito ou HTML, **When** é exibido, **Then** negrito
   simples é formatado e HTML permanece texto, sem execução.
5. **Given** viewport mobile, **When** recebo revisão, **Then** o painel abre e seus
   botões de confirmação ficam acessíveis sem corte horizontal.

### User Story 8 - Cadastrar um conjunto com dependências (Priority: P1)

Como usuário, quero pedir clientes e contratos na mesma mensagem e confirmar o
conjunto, sem cadastrar manualmente o cliente antes de criar seu contrato.

**Independent Test**: Pedir um cliente novo e um contrato associado sem informar
valor/data; completar os dados na conversa e confirmar ambos de uma única vez.

**Acceptance Scenarios**:

1. **Given** cliente ainda inexistente, **When** peço cliente e contrato juntos,
   **Then** vejo um único lote com o vínculo e nenhum cadastro é salvo antecipadamente.
2. **Given** dados obrigatórios incompletos, **When** o lote é preparado,
   **Then** vejo pendências por item e o assistente pergunta o dado que falta,
   preservando as informações já fornecidas.
3. **Given** lote completo, **When** confirmo uma vez, **Then** todos os registros
   são criados com seus vínculos corretos e aparecem nas listas após recarregar.
4. **Given** falha de armazenamento ou validação, **When** confirmo,
   **Then** nenhum item é criado; o lote continua disponível para correção/tentativa.
5. **Given** confirmação cancelada ou lote alterado, **When** tento salvar,
   **Then** uma revisão atual é exigida; duplo clique não duplica registros.
6. **Given** vários clientes/contratos, **When** preparo até dez itens no total,
   **Then** cada contrato aponta para o cliente correto do lote ou para um cliente ativo existente.

### User Story 9 - Escolher modelos pela aplicação (Priority: P1)

Como usuário, quero configurar o modelo principal e um alternativo opcional,
buscando nome ou ID/tag do OpenRouter, com custo visível e uma lista leve.

**Independent Test**: Buscar Ling pelo nome/ID, aplicar, recarregar e verificar os
IDs enviados em todas as rodadas do próximo turno, sem chave no navegador.

**Acceptance Scenarios**:

1. **Given** sessão ativa, **When** abro Configurações, **Then** consulto catálogo
   paginado de 40 resultados, com custo antes do nome e filtros Todos/Gratuitos/Pagos.
2. **Given** busca por nome, provedor, ID ou tag, **When** digito, **Then** resultados
   são pesquisados no catálogo completo, após debounce, sem carregar todos no DOM.
3. **Given** seleção de principal/alternativo, **When** aplico, **Then** apenas IDs
   são persistidos neste navegador; fallback vazio desativa o alternativo do ambiente.
4. **Given** um ID manual válido não catalogado, **When** escolho e aplico, **Then**
   preço e compatibilidade aparecem como não confirmados; URL ou ID malformado é recusado.
5. **Given** modelo catalogado sem texto/ferramentas, **When** o encontro, **Then**
   vejo o motivo da incompatibilidade ao filtrar Todos/Incompatíveis e não posso
   ativá-lo para o assistente.
6. **Given** requisição ou aplicação de ação em andamento, **When** altero a seleção
   na tela, **Then** não posso aplicá-la até o turno terminar; todas as rodadas usam
   o snapshot do início. Próximo turno usa a configuração aplicada.
7. **Given** erro de storage, rede ou catálogo indisponível, **When** tento carregar
   ou aplicar, **Then** recebo erro seguro e mantenho a seleção anterior e a edição.
8. **Given** escolha explícita de modelo pago, **When** aplico, **Then** custo continua
   visível e somente esse ID/alternativo escolhido passa a ser utilizado. Não ativar
   fallback pago oculto. Restaurar padrão recupera as opções do ambiente.

---

**Ajuste de densidade e compatibilidade**: O catálogo inicia em Compatíveis e permite
Todos/Incompatíveis, combinados com preço e busca. Resumos e linhas compactos
mostram mais modelos na primeira dobra, sem remover identificação/custo. Instruções
e entrada manual podem ser recolhidas, mantendo ações acessíveis por teclado.

### User Story 10 - Entender custo em reais e capacidades do modelo (Priority: P1)

Como usuário, quero comparar um volume de tokens em reais/centavos com cotação
atualizada e consultar os detalhes do modelo no ícone de informação.

**Acceptance Scenarios**:

1. **Given** Configurações visível, **When** a cotação USD/BRL é consultada, **Then**
   vejo fonte e horário real da cotação; o cache público de um minuto não é descrito
   como tick instantâneo. Consulta atualiza por minuto e pausa quando a página some.
2. **Given** tarifas de entrada/saída por token, **When** altero os volumes, **Then**
   USD e BRL são recalculados localmente, sem inferência e sem fetch por modelo.
3. **Given** valor positivo muito pequeno, **When** a estimativa aparece, **Then**
   uso centavos curtos, inclusive <0,01 cent, sem transformá-lo em grátis/zero.
4. **Given** câmbio indisponível, **When** comparo modelos, **Then** mantenho USD e
   seleção funcional. Cotação anterior válida fica identificada; taxa expirada ou
   desconhecida nunca é inventada nem substituída por 1.
5. **Given** ícone i, **When** passo o mouse, foco com teclado ou toco, **Then** vejo
   descrição, modalidades reais de entrada/saída, contexto, suporte, tarifas e exemplo.
   Escape/toque/fora fecham, o painel fica dentro da viewport e só um aparece por vez.
6. **Given** modelo de imagem/áudio ou tarifas extras, **When** simulo tokens, **Then**
   não apresento a base textual como cobrança completa da modalidade. Valores são
   estimativas agregadas, sem IOF/spread/extras, e o chat pode executar várias etapas.
7. **Given** volume inválido ou zero, **When** preencho, **Then** inválidos mostram
   erro e zeros não se confundem com gratuidade do modelo. Descrição externa é escapada.

---

### User Story 11 - Ditar uma mensagem e revisar antes de enviar (Priority: P1)

Como usuário, quero iniciar o ditado pelo microfone, acompanhar a captura e revisar
seu texto no campo do chat, sem envio automático nem transcrição pelo modelo.

**Acceptance Scenarios**:

1. **Given** navegador compatível e permissão, **When** clico no microfone,
   **Then** vejo ativação e depois Ouvindo, com barras que refletem áudio real.
   Pausas e ausência de fala não concluem. Somente um novo clique conclui; soltar
   o botão não finaliza. Se o serviço encerrar normalmente, a captura é retomada
   mantendo os trechos finais em memória, sem preencher o campo.
2. **Given** ditado iniciado, **When** concluo pelo botão, **Then** vejo o botão e
   cartão em Transcrevendo até receber o resultado final, inclusive em texto longo, e o texto
   final entra na seleção/cursor original, preservando o restante. Nenhum pedido ao
   chat, cadastro ou histórico é criado antes de eu apertar Enviar.
3. **Given** captura ou processamento, **When** aperto X/Escape, minimizo, oculto
   a aba ou saio, **Then** o ditado é descartado e recursos próprios são liberados.
   Respostas tardias não alteram o campo; texto anterior permanece.
4. **Given** falta de suporte, permissão recusada ou erro, **When** tento ditar,
   **Then** recebo orientação curta e a digitação continua disponível. O aviso
   informa que o reconhecimento pode usar o serviço do navegador, sem prometer offline.
5. **Given** resultado acima de 4000 caracteres, **When** ele é inserido,
   **Then** o texto completo permanece para edição e o envio fica bloqueado até reduzir.
   Teclado, toque e movimento reduzido mantêm estados e controles compreensíveis.

---

### User Story 12 - Renovar apenas o visual do chat (Priority: P1)

Como usuário, quero testar no chat a direção visual da referência fornecida,
antes de mudar o restante da aplicação.

**Acceptance Scenarios**:

1. **Given** chat aberto no desktop, **When** vejo a tela inicial, **Then** encontro
   painel claro arredondado próximo de 736x780, cabeçalho compacto com estrela/X,
   esfera verde translúcida, pergunta central discreta, sugestões brancas à direita
   e composer branco em duas faixas. Menu e demais telas mantêm seu visual.
2. **Given** esfera vetorial decorativa, **When** o chat está visível, **Then** há
   movimento orgânico suave, sem vídeo, bibliotecas novas ou chamadas de IA. Ao
   ocultar/minimizar ou preferir movimento reduzido, a animação pausa.
3. **Given** sugestões iniciais, **When** aciono Mostrar mais, **Then** vejo opções
   adicionais reais. Tópicos permite reencontrar opções durante uma conversa,
   preservando mensagens, texto não enviado e cartões de revisão.
4. **Given** novo visual, **When** uso teclado, toque, ditado, navegação e revisão,
   **Then** os mesmos limites e confirmações continuam válidos. Em 375 e 320px,
   chat/composer/controles ficam dentro da viewport e o histórico rola internamente.

---

### Edge Cases

- Interromper uma resposta preserva as alterações de rascunho já exibidas, ignora as restantes e nunca salva.
- Tentar enviar outra mensagem durante uma resposta informa que é necessário aguardar ou cancelar a atual.
- Repetir a entrega da mesma ação não repete seus efeitos; repetir uma confirmação não duplica o cadastro.
- Sair, recarregar, trocar o rascunho ou editar campos invalida ações pendentes vinculadas ao estado anterior.
- Não é possível descartar um rascunho preenchido ao iniciar outro sem uma decisão explícita do usuário.
- Nomes de clientes podem se repetir; a seleção do contrato deve distinguir os registros pelos dados disponíveis e pelo identificador.
- Campos de texto com instruções para o assistente continuam sendo dados e não autorizam novas ações.
- Ausência de configuração, indisponibilidade ou limite de uso do modelo resulta em erro recuperável; os formulários manuais continuam disponíveis.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE permitir entrada com um único conjunto de credenciais fixas, sem criação de usuários, e bloquear páginas protegidas e funções de IA sem sessão válida. Aceite: US1.1–3.
- **FR-002**: Sair DEVE encerrar o acesso, invalidar respostas e confirmações pendentes e preservar os dados locais para o próximo login. Aceite: US1.3 e US5.7.
- **FR-003**: O chat DEVE permanecer disponível durante a navegação autenticada, mantendo uma única conversa. Aceite: US2.1 e US2.3.
- **FR-004**: O sistema DEVE recuperar registros, rascunho e as últimas quarenta mensagens no mesmo navegador após recarregamento, sem restaurar uma autorização de salvamento. A interface deve avisar que mensagens anteriores saem do histórico. Aceite: US2.8, US3, teste independente, e US5.7–8.
- **FR-005**: O assistente DEVE propor somente `navigate`, `patch-draft`, `request-review`, `request-delete` e `prepare-batch`. Nenhuma ferramenta grava dados sozinha. Aceite: US2, US5, US6 e US8.
- **FR-006**: A aplicação DEVE validar ações, campos, valores, referências e atualidade do rascunho antes de aplicar propostas; deve rejeitar propostas inválidas ou obsoletas sem alterar os campos. Aceite: US2.5 e US2.7.
- **FR-007**: Navegação, preenchimento e resultado DEVEM ser visíveis durante a conversa. Uma mensagem do assistente não pode declarar uma ação concluída antes de receber o resultado real da aplicação. Aceite: US2.1–2 e US5.4–6.
- **FR-008**: DEVE existir somente um rascunho ativo, compartilhado pelo formulário e pelo assistente; uma troca que descarte conteúdo exige decisão explícita. Aceite: US2.3–5 e US3.5.
- **FR-009**: O assistente DEVE perguntar os campos obrigatórios faltantes e ambiguidades, preservar dados já conhecidos e nunca inventar informações de cadastro. Aceite: US3.3 e US4.2–4.
- **FR-010**: O sistema DEVE permitir criar e listar clientes com nome obrigatório de até 120 caracteres, e-mail opcional válido de até 254 caracteres e telefone opcional de até 30 caracteres. Nome sem conteúdo não é válido. Aceite: US3.1–5; conferir também os limites dos campos.
- **FR-011**: O sistema DEVE permitir criar e listar contratos com cliente existente, título não vazio de até 160 caracteres, valor positivo de até R$ 999.999.999,99 com até duas casas decimais e início válido; término é opcional e não pode anteceder o início. Status aceita "rascunho", "ativo" ou "encerrado", com "rascunho" como padrão. Aceite: US4.1–7; conferir também os limites dos campos.
- **FR-012**: Cliente ambíguo ou inexistente DEVE bloquear a revisão válida do contrato até a seleção de um registro existente. Aceite: US4.3–4.
- **FR-013**: Formulário manual e assistente DEVEM obedecer às mesmas regras de validação e expor erros nos campos correspondentes. Aceite: US3.3–5 e US4.2–5.
- **FR-014**: Todo salvamento DEVE exigir cartão com o conteúdo exato da revisão atual e clique explícito em "Confirmar salvamento". Texto no chat e decisões do modelo não autorizam gravar. Aceite: US5.1–2.
- **FR-015**: Qualquer mudança no rascunho DEVE invalidar o cartão anterior; confirmar uma revisão desatualizada não pode salvar. Aceite: US5.3.
- **FR-016**: A confirmação DEVE gravar exatamente os valores revisados, gerar no máximo um registro por salvamento e atualizar a lista e a conversa somente após confirmação da gravação. Aceite: US5.4 e US5.6.
- **FR-017**: Cancelar o cartão DEVE impedir seu uso posterior e preservar o rascunho; descartar o rascunho DEVE exigir ação explícita separada. Aceite: US2.4 e US5.5.
- **FR-018**: A aplicação DEVE permitir cancelar a resposta de IA, ignorar resultados tardios e aceitar nova tentativa; falha ou ausência de conclusão em 60 segundos deve encerrar a tentativa com erro recuperável. Aceite: US2.6 e Edge Cases.
- **FR-019**: Falhas de persistência ou recuperação DEVEM ser informadas, preservar trabalho disponível e não produzir sucesso falso nem substituição silenciosa de dados anteriores. Aceite: US5.6–8.
- **FR-020**: A aplicação NÃO DEVE revelar credenciais configuradas ou chave do provedor nas páginas, conversa ou mensagens de erro. Pedidos sem sessão válida, com origem não autorizada ou conteúdo inválido devem ser recusados. Textos de cadastro não autorizam ações. Aceite: US1.2 e Edge Cases; verificar também exposição visível e recusa desses pedidos.
- **FR-021**: O modelo de IA DEVE ser configurável pelo responsável pelo ambiente. Configuração ausente ou falha do provedor deve ser informada, preservando o uso manual. Os testes atuais usam ERNIE 5.5 Flash Preview gratuito como padrão, sem fallback; Ling 3.2 Flash gratuito também foi autorizado para avaliação. A tela permite escolher modelos gratuitos ou pagos explicitamente. DeepSeek/Luna pertencem à validação inicial e não podem ser reativados automaticamente. O modelo utilizado deve estar visível. Aceite: Edge Cases; verificar ausência de configuração, falha do modelo principal e indicação de fallback.
- **FR-022**: Login, chat, formulários, listas e cartões DEVEM funcionar por teclado, apresentar nomes compreensíveis para os controles e comunicar erros e progresso sem depender apenas de cor. Aceite: executar US1–5 sem mouse e conferir os avisos.
- **FR-023**: O protótipo DEVE aceitar até duzentos clientes e duzentos contratos; atingir um limite bloqueia somente a nova inclusão correspondente, informa o motivo e preserva o rascunho. Aceite: US3.6 e US4.8.
- **FR-024**: Clientes e contratos DEVEM permitir edição com confirmação, mantendo ID e criação e incrementando a revisão. Aceite: US6.1–2.
- **FR-025**: Exclusão DEVE ser reversível pela lixeira, com impactos exibidos antes de confirmar. Cliente leva somente seus contratos ativos no mesmo lote. Aceite: US6.3–4.
- **FR-026**: Restauração de cliente DEVE recuperar somente contratos daquele lote; contrato exige cliente ativo. Aceite: US6.5–6.
- **FR-027**: Cadastros da versão local anterior DEVEM continuar legíveis sem reset. O limite de 200 inclui itens na lixeira. Aceite: US6.7.
- **FR-028**: O chat DEVE flutuar, minimizar e reabrir sem perder estado ou interromper tarefa; confirmações abrem o painel. Aceite: US7.1 e US7.5.
- **FR-029**: Navegação DEVE mostrar progresso antes da mudança de rota e usar transição curta, respeitando movimento reduzido e cancelamento. Aceite: US7.2–3.
- **FR-030**: Mensagens DEVEM ser curtas e formatar negrito simples sem executar HTML; cartões compactos mantêm todos os valores e impactos. Aceite: US7.4–5.
- **FR-031**: A conversa DEVE preparar até dez novos clientes/contratos juntos, resolvendo dependências sem criar o cliente antes da confirmação do conjunto. Aceite: US8.1 e US8.6.
- **FR-032**: Lote incompleto DEVE preservar os valores conhecidos e informar pendências por item, aceitando complementação na conversa. Aceite: US8.2.
- **FR-033**: Confirmar lote DEVE validar todo o conjunto e gravá-lo atomicamente, sem registros parciais, duplicação ou revisão desatualizada. Aceite: US8.3–5.

- **FR-034**: Configurações DEVE buscar no catálogo completo por nome/ID/tag, paginar quarenta resultados e usar cache no servidor com single-flight, timeout e recuperação stale. Compatibilidade deve filtrar o catálogo completo antes da paginação.
- **FR-035**: A seleção principal/alternativo opcional DEVE persistir localmente apenas IDs validados, ser aplicada por clique e permanecer fixa durante um turno.
- **FR-036**: Custo e compatibilidade DEVEM estar visíveis antes da escolha. IDs manuais válidos são permitidos com aviso de metadados desconhecidos; modelos conhecidos incompatíveis são bloqueados. A chave e configurações do provedor permanecem privadas.

- **FR-037**: Cotação USD/BRL DEVE vir de endpoint autenticado no servidor com cache, timeout e recuperação limitada, mantendo horário real e indicação de defasagem/indisponibilidade.
- **FR-038**: Estimativa DEVE multiplicar tarifas por volumes de entrada/saída e cotação, preservar valores positivos subcentavo, indicar limites e nunca afetar cobrança ou iniciar inferência.
- **FR-039**: Detalhes DEVEM aparecer em ícone acessível por hover/foco/toque, com modalidades reportadas e conteúdo externo escapado, preservando a tabela compacta.

- **FR-040**: Ditado DEVE usar a API nativa do navegador, em pt-BR, sem dependência nova nem Genkit/OpenRouter para transcrever; ativação ocorre apenas por gesto explícito, com aviso sobre possível serviço do navegador.
- **FR-041**: Captura DEVE permanecer ativa durante pausas/ausência de fala, rearmar após encerramento normal do serviço e concluir somente pelo botão. Mostrar estado real, nível de áudio e carregamento até o resultado; liberar recursos e reinícios ao cancelar/ocultar/sair. Cancelamento ignora eventos tardios e preserva texto existente. Apenas resultados finais do navegador compõem o texto, sem duplicação entre segmentos.
- **FR-042**: Transcrição final DEVE apenas preencher o campo para revisão, sem envio automático ou persistência de áudio. Resultado extenso fica íntegro e exige edição antes do envio.

- **FR-043**: Remap visual DEVE se limitar ao chat/painel flutuante, seguindo a referência fornecida e preservando as funções existentes; nenhum fundo modal deve bloquear o restante do espaço de trabalho.
- **FR-044**: Esfera DEVE ser vetorial/decorativa com animação leve, pausada em estado oculto e movimento reduzido, sem mídia remota ou dependência nova.
- **FR-045**: Sugestões DEVEM ser chips funcionais, com Mostrar mais/recolher e acesso Tópicos também durante uma conversa; não descartar texto ou revisões.

### Key Entities *(include if feature involves data)*

- **Sessão**: Permissão temporária de acesso do usuário único; encerrá-la invalida respostas e confirmações pendentes, sem apagar os registros locais.
- **Cliente**: Identificador único, nome, e-mail e telefone. Nomes iguais são permitidos.
- **Contrato**: Identificador único, cliente relacionado, título, valor em BRL, início, término opcional e status. O status "rascunho" é um estado do contrato salvo, distinto do formulário ainda não salvo.
- **Conversa**: Histórico ordenado de mensagens do usuário, respostas do assistente e resultados reais apresentados pela aplicação.
- **Rascunho**: Cadastro de cliente ou contrato ainda não salvo, com identidade própria, campos atuais e revisão que muda a cada alteração.
- **Revisão de salvamento**: Resumo vinculado a um rascunho e à sua revisão exata; pode estar pendente, cancelado, invalidado ou concluído.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em todos os cenários de US1, somente credenciais válidas dão acesso; sair impede novas ações até novo login.
- **SC-002**: Em uma demonstração, o usuário navega pelos nove destinos permitidos e vê os campos informados pelo chat no formulário correto, mantendo a mesma conversa em todas as transições.
- **SC-003**: O roteiro cria e lista um cliente e um contrato por formulário e outro de cada pelo chat; os quatro registros permanecem após recarregar, sem divergência em relação aos resumos confirmados.
- **SC-004**: Em todos os cenários de campo obrigatório ausente, inválido ou cliente ambíguo, nenhum cadastro é salvo até a correção e a confirmação explícita.
- **SC-005**: Em todos os cenários de revisão desatualizada, cancelamento, recarregamento, perda de sessão e resposta tardia, o total de salvamentos indevidos é zero.
- **SC-006**: Repetir uma ação ou clicar dez vezes na mesma confirmação cria no máximo um registro para aquele salvamento; falha de gravação não apresenta sucesso.
- **SC-007**: Na resposta de IA, falha, cancelamento ou ausência de conclusão em 60 segundos deixa o usuário com uma indicação clara e a possibilidade de tentar novamente, preservando o rascunho disponível.
- **SC-008**: Todo o roteiro de login, navegação, criação, revisão, confirmação e cancelamento é executável por teclado, com erros e estados compreensíveis sem depender de cor.
- **SC-009**: Ao ultrapassar quarenta mensagens, somente as quarenta mais recentes são recuperadas; atingir duzentos clientes ou duzentos contratos bloqueia a próxima inclusão correspondente sem perda do rascunho.

## Assumptions

- Este MVP atende uma pessoa, em uma aba ativa de navegador de desktop e em português do Brasil. Não é uma entrega para publicação.
- Os dados demonstrativos são fictícios e permanecem neste navegador; não há banco, sincronização, backup ou recuperação se o próprio usuário apagar os dados do navegador.
- A conversa é única, retém somente as últimas quarenta mensagens visíveis e não oferece gestão de múltiplos históricos. Cada mensagem admite até quatro mil caracteres; conteúdo excedente é recusado com aviso. Telefone é texto opcional, sem exigência de formato nacional. E-mail vazio é permitido; se preenchido, exige formato válido.
- Datas representam dias do calendário, sem horário. Término igual ao início é permitido. O valor deve ser estritamente positivo.
- O status inicial do contrato é "rascunho"; escolher "ativo" ou "encerrado" é permitido antes de salvar, sem efeitos financeiros ou documentais.
- O assistente pode abrir sua tela principal, listas e formulários de clientes/contratos, edição, lixeira e configurações. Navegar não exige confirmação enquanto preservar o rascunho.
- O usuário utiliza o botão "Confirmar salvamento" mesmo quando o pedido inicial ocorre pelo chat. Cancelar o cartão mantém o rascunho; descartar elimina somente o cadastro ainda não salvo.
- Uma resposta de IA por vez é suficiente. O limite de 60 segundos vale para a conclusão da tentativa, sem promessa sobre a velocidade do provedor externo.
- A IA depende de acesso à internet, credenciais válidas e disponibilidade do modelo configurado. Nenhum modelo específico ou modalidade gratuita é presumido.
- O escopo foi ampliado pelo usuário para CRUD, lixeira e chat flutuante. Anexos,
  multimodalidade, PDF, assinatura, pagamentos, cadastro de usuários, execução de
  código pelo modelo, exclusão definitiva e múltiplos agentes continuam fora do MVP.
- A implementação e as verificações, inclusive IA real, são registradas em execution.md.
- Lotes abrangem criação de até dez registros no total. Edição, exclusão e restauração
  continuam com suas confirmações individuais. Não há exclusão definitiva em lote.
