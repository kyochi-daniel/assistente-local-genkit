# Modelo de dados — Assistente local

Sem banco ou API de cadastros. Um documento local `genkit-assistant:v1` contém
`schemaVersion: 1`, `clients`, `contracts`, `messages` e `draft`. IDs são UUIDs;
instantes usam ISO 8601 UTC. A confirmação e ações em execução NÃO são persistidas.

## Cliente

| Campo | Regra |
| --- | --- |
| id | UUID, gerado como draftId; imutável |
| name | Texto obrigatório após trim, de 1 a 120 caracteres |
| email | Texto opcional, vazio ou e-mail válido, até 254 caracteres |
| phone | Texto opcional, até 30 caracteres; preservar formato informado |
| createdAt | Instante gerado pela aplicação ao confirmar |

Nome repetido é permitido. Resolver referências por ID; se houver homônimos,
pedir ao usuário para escolher usando nome e identificador curto.

## Contrato

| Campo | Regra |
| --- | --- |
| id | UUID, gerado como draftId; imutável |
| clientId | UUID obrigatório de cliente existente no documento local |
| title | Texto obrigatório após trim, de 1 a 160 caracteres |
| valueCents | Inteiro seguro obrigatório, de 1 a 99999999999, em centavos BRL |
| startDate | Data real obrigatória em YYYY-MM-DD |
| endDate | Vazio ou data real em YYYY-MM-DD, igual ou posterior a startDate |
| status | Enum obrigatório: draft, active, closed; padrão draft |
| createdAt | Instante gerado pela aplicação ao confirmar |

Rótulos: draft = Rascunho; active = Ativo; closed = Encerrado. Esse status comercial
não é o estado de execução do assistente. Sem assinatura, efeito jurídico ou PDF.
Um cliente tem zero ou mais contratos; cada contrato tem exatamente um cliente.
O formulário apresenta BRL, mas converte uma única vez para centavos; não persistir
valores monetários como ponto flutuante. O modelo recebe a descrição dessa unidade.

## Rascunho ativo

`draft = null | { draftId, entity, revision, fields }`.

- entity: client ou contract. draftId: novo UUID criado pelo navegador ao abrir
  um formulário novo. revision: inteiro não negativo, começa em 0.
- fields: somente name/email/phone para cliente; somente
  clientId/title/valueCents/startDate/endDate/status para contrato. Campos obrigatórios
  ainda não preenchidos podem estar ausentes. O cliente preenche status=draft.
- Todo patch efetivo ou edição manual incrementa revision e invalida a revisão
  pendente. Valores idênticos não incrementam a revisão.
- Validar formato/tamanho em cada patch. Aceitar campos obrigatórios ainda ausentes;
  exigir o conjunto completo somente na revisão e no salvamento. Datas cruzadas
  inválidas mostram erro e impedem revisão, sem apagar o que a pessoa digitou.
- Patch do modelo exige draftId, entity e expectedRevision iguais aos atuais.
  Patch obsoleto, campos extras e troca implícita de entidade são rejeitados.
- Sair para uma lista preserva draft. Abrir o mesmo formulário retoma draft.
  Iniciar outro rascunho exige escolha explícita se o atual tem campos preenchidos.
- Depois de salvar, draft vira null e o registro usa id=draftId. Repetir a gravação
  desse ID retorna o registro existente, sem inserir outra linha.

## Revisão e execução (apenas memória)

`review = null | { draftId, revision, snapshot }`: snapshot validado e imutável
dos campos exibidos no cartão. Só o botão “Confirmar salvamento” consome esse objeto;
um “sim” no chat pede o cartão, sem equivaler a um clique. Verificar draftId/revision,
dados e sessão atual novamente no clique. Cancelar revisão limpa review e mantém
draft; descartar rascunho é outra ação explícita. Reload ou logout limpa review.

Estados visíveis: idle, thinking, executing, awaiting_input, awaiting_confirmation,
completed, error, cancelled. Apenas um turno ativo. IDs de ações já executadas são
deduplicados em memória; eventos de turno cancelado são ignorados. O resultado real
da ação determina completed. Falhas mantêm draft e permitem nova tentativa explícita.

## Mensagem

`{ id, role: user | assistant, text, createdAt }`. Persistir apenas mensagens
visíveis, no máximo 40, com até 4000 caracteres cada. Chunks, credenciais, histórico
interno Genkit/tool calls e payloads de confirmação não entram no documento local.
O histórico técnico vive só no turno em memória e respeita contracts/assistant.md.

## Persistência e limites

- Até 200 clientes e 200 contratos. Bloquear nova inclusão ao atingir o limite,
  explicar a restrição e manter o rascunho. Sem expiração automática de cadastros.
- Ler somente no cliente após hidratação; validar versão e estrutura com schema.
  JSON inválido/versão desconhecida bloqueia escrita e informa recuperação; NÃO
  substituir silenciosamente dados existentes por documento vazio.
- Gravar um novo documento completo com setItem; só atualizar listas e anunciar
  sucesso após a escrita retornar. Se quota/acesso falhar, manter estado anterior
  e rascunho. Formulários e assistente compartilham o mesmo estado reativo.
- Persistir draft e mensagens durante o uso; em erro manter a edição em memória e
  exibir aviso. LocalStorage pode ser limpo pelo usuário/navegador.
- Uma aba por vez, sem sincronização ou isolamento entre usuários locais. Logout
  encerra sessão e execução, mas conserva cadastros e conversa desse navegador.

## Schemas compartilhados

Implementar validações em `shared/schemas.ts` e tipos derivados em `shared/types.ts`.
Schemas estritos rejeitam campos extras. Contratos HTTP e ações referenciam esses
mesmos tipos; não manter validações diferentes para chat e formulário.

## Extensão compatível: CRUD e lixeira

schemaVersion permanece 1; os campos novos são opcionais, preservando documentos
anteriores sem reset: revision (inteiro não negativo; ausência equivale a 0),
updatedAt, deletedAt (instantes ISO) e deletionBatchId (UUID).

Editar usa um novo draftId com recordId e recordRevision do alvo. A revisão inclui
esses campos; confirmar substitui somente os valores editáveis, mantém id/createdAt
e incrementa a revisão do registro. Registro arquivado ou revisão alterada invalida o commit.

Soft delete preenche deletedAt/deletionBatchId; cliente e contratos ativos vinculados
recebem o mesmo lote. Contratos já arquivados conservam seu lote anterior. Restore
remove os marcadores apenas dos registros daquele lote e atualiza revision/updatedAt.
Restaurar contrato requer cliente ativo. As listas e o contexto da IA filtram ativos;
a lixeira mostra os arquivados. A capacidade de 200 por entidade inclui arquivados.

MutationReview vive só em memória: action delete/restore, entity, recordId,
recordRevision, label, batchId e affected (contratos em cascata com ID/revisão/label).
Antes do commit, recalcular e comparar impacto/revisões. Cancelar ou perder sessão
invalida confirmação; persistir todo o lote em um único documento local.

## Criação em lote com dependências

Workspace adiciona batchDraft opcional/nulo, compatível com documentos existentes.
Um lote substitui o rascunho individual somente com aceite de descarte de trabalho
pendente; não manter os dois ativos. A confirmação não é persistida.

BatchDraft: batchId UUID, revision não negativa, clients e contracts. Até dez itens
somados; cada item tem ref interno único de 1–40 caracteres alfanuméricos, hífen
ou underscore, sem nomes de propriedades reservadas. Cliente tem campos parciais
name/email/phone; contrato tem clientRef e campos parciais de contrato. clientRef
é um ref de cliente novo daquele lote ou UUID de cliente ativo existente.

prepare-batch novo não recebe IDs definitivos. Atualização exige batchId e
expectedRevision atuais. A atualização mescla itens por ref: campos e itens
omitidos são preservados; valores explícitos substituem os anteriores. Arrays
vazios não removem itens. O limite é conferido após a mesclagem.
Pendências são calculadas por item com os mesmos schemas dos cadastros individuais.

BatchReview: batchId, revision, snapshot congelado e ids (ref para UUID gerado
pelo navegador). Ao confirmar, validar snapshot, campos, vínculos, IDs e capacidades;
resolver clientId dos contratos e gerar um documento com todos os registros. Fazer
um único setItem; só depois atualizar UI e anunciar sucesso. Falha mantém rascunho,
revisão e IDs de tentativa, sem cadastro parcial. Cancelar/reload exige nova revisão.

## ModelSelection

Preferência separada do documento de clientes/contratos: chave local
`nexo:model-settings:v1`, com {primary:string,fallback:string|null}. Valores são IDs
no formato provedor/modelo[:tag], sem chave, URL ou parâmetros arbitrários. Ausência
usa defaults do ambiente; fallback null representa alternativo explicitamente
desativado. Aplicar grava antes de atualizar estado; falha preserva seleção anterior.
Leitura inválida preserva o conteúdo até reset explícito somente desta chave.
Catálogo/preços ficam em memória no servidor, nunca neste armazenamento local.

## Custos e cotação

CatalogModel mantém tarifas USD por token, descrição original limitada, modalidades
de entrada/saída e indicador de encargos adicionais. ExchangeRate é somente cache
em memória, não localStorage: {rate,quotedAt,fetchedAt,source,stale}. Rate é referência
ASK USD/BRL, sem vínculo com cobrança real. Os volumes da simulação são estado da
página, não parte do cadastro nem da preferência enviada ao chat.

## Ditado (somente memória do componente)

Phase idle/starting/listening/processing, texto transcrito provisório e níveis de
áudio. Não serializar objetos nativos, áudio, permissões ou resultados cancelados.
Ao concluir, texto é inserido no composer, que só integra histórico/contexto depois
do envio manual. Cancelamento não modifica o texto anterior.

Ditado contínuo mantém os trechos finais consolidados entre instâncias nativas.
Resultados finais usam índice por instância para evitar duplicação; resultados
provisórios são descartáveis. Reinício pendente pertence à sessão em memória e é
cancelado junto com ela. O campo só recebe o conjunto após concluir pelo botão.
