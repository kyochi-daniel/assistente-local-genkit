# Catálogo e seleção de modelos

Schemas/tipos executáveis: shared/models.ts e campo modelSelection de ChatRequest.

## GET /api/models

Requer sessão. Sem chave na consulta pública OpenRouter. Origin, quando informado,
deve coincidir com o ambiente. Query estrita: q opcional até 200 caracteres;
pricing all/free/paid; compatibility all/compatible/incompatible (padrão all para
preservar consultas existentes); page inteiro positivo. Página fixa de 40.
Resposta privada/no-store: {items,total,page,pageSize,updatedAt,stale,defaults}.
Cada item contém id,name,cost,promptPrice,completionPrice,contextLength,
inputModalities,outputModalities,description,hasAdditionalCosts,compatible.
Descrição é texto compacto até 240 caracteres, não HTML; modalidades são as
reportadas na arquitetura. hasAdditionalCosts marca outras tarifas positivas fora das de entrada/saída,
inclusive alternativas de cache; não significa que todas serão somadas. defaults contém primary e fallback string/null, sem
outros dados do runtimeConfig. Preços originais por token em USD; a UI apresenta
por milhão. A tela começa com compatibility=compatible e permite Todos/Incompatíveis. Ausente/inválido/negativo vira preço não confirmado, nunca gratuito.

Cache por processo por 30min e requisição única compartilhada durante renovação; limite de 10s
para fetch remoto. Falha com cache preserva dados e sinaliza stale. Sem cache, erro
seguro e botão de tentar novamente. Endpoint remoto fixo, sem URLs do usuário.
Catálogo completo inclui modalidades incompatíveis; compatible exige saída texto e
suporte a tools. Busca normaliza nome/id; ID já inclui provedor/tag. Ordena gratuitos
primeiro, depois nome/ID. Busca, preço e compatibilidade são aplicados antes do total e da paginação no servidor.

## Aplicação local e chat

A pessoa escolhe principal e alternativo opcional, com custo visível antes de Aplicar
configurações. Escolha paga explícita é permitida; não adicionar outro modelo pago.
Persistir somente {primary,fallback} na chave nexo:model-settings:v1. Revalidar schema
na leitura; falha de escrita conserva a configuração anterior. Restaurar padrão remove
a preferência somente após sucesso do storage. Chave OpenRouter permanece no servidor.

ChatRequest recebe modelSelection opcional, no nível raiz, com schema estrito.
Se ausente, usar runtimeConfig. Presente: primary vence o principal e fallback null
desativa o alternativo do ambiente. Não aceitar apiKey/baseURL ou parâmetros extras.
O navegador captura a seleção no início do turno e mantém a mesma em continuações;
aplicar/restaurar configurações fica bloqueado durante geração/ação.

Modelo conhecido sem text/tools é recusado antes da inferência. ID manual ausente
é permitido com aviso de preço/compatibilidade desconhecidos. Sintaxe exige
provedor/modelo[:tag], trim, máximo de 200, sem URL, espaços ou query string. O ID é
apenas campo JSON no provedor fixo, nunca caminho/URL a acessar.

Carregar catálogo, pesquisar e aplicar configurações não faz inferência e não consome
tokens do modelo. Não prometer disponibilidade, gratuidade futura ou qualidade só
porque há suporte a ferramentas no catálogo.

## GET /api/exchange-rate

Requer sessão; Origin explícita deve ser permitida. Rejeita toda query. Resposta
private/no-store: {rate,quotedAt,fetchedAt,source:'AwesomeAPI',stale}. Rate é ASK
USD/BRL finito positivo; quotedAt é ISO do timestamp UTC original, fetchedAt é o fetch.
A API externa pública tem cache de um minuto, sem necessidade de outra chave.

Fetch fixo com timeout de 5s, single-flight, cache de 60s e backoff de 30s. Validar par USD/BRL,
rate e timestamp (até 5min no futuro e no máximo de 7 dias anterior). Em falha, cache
anterior válido vem stale; cotação com mais de 24h também é identificada. Sem cache
válido, 503 seguro; nunca fallback fixo de 1. O frontend descarta seu cache após 7 dias.

A conversão é referência aproximada, sem IOF/spread/taxas. Simulação usa volumes
agregados de 0 a 10 milhões por campo. Modelo pago com base textual 0 e extras não é
gratuito. Sem saída textual, informar Ver tarifas em vez de simular preço por imagem.
Fonte de cotação e horário permanecem visíveis. Não houve consulta de saldo/cobrança.

Fonte: [AwesomeAPI](https://docs.awesomeapi.com.br/api-de-moedas).
