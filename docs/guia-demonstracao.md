# Guia de demonstração e gravação

## O que a demonstração deve comprovar

Mostrar um pedido que vira rascunho, uma revisão que depende da pessoa e um resultado persistido de verdade. O vídeo deve permitir acompanhar a passagem entre chat, formulários, listas e lixeira. O projeto usa dados fictícios e inferência remota; não apresentar como modelo executado offline.

## Gravação publicada

A [demonstração em vídeo](media/demonstracao.mp4) tem 59,04 segundos, oito capítulos e legendas incorporadas, sem áudio. Foi gravada em Chromium isolado, com armazenamento vazio e login realizado antes da captura. A chamada ao OpenRouter foi real, usando `baidu/ernie-5.5-flash-preview:free` e fallback desativado. O turno observado levou 2,458 segundos; esse tempo pertence apenas a essa execução.

| Arquivo | Conteúdo |
| --- | --- |
| [Vídeo completo](media/demonstracao.mp4) | Pedido, revisão, gravação, edição manual, exclusão, restauração, catálogo e persistência. |
| [Cadastro em lote](media/cadastro-lote.gif) | Pedido, revisão e salvamento de cliente com contrato vinculado. |
| [Exclusão e restauração](media/revisao-exclusao.gif) | Impacto da exclusão, confirmação e restauração. |
| [Legendas](media/demonstracao.srt) | Texto dos oito capítulos em formato SRT. |
| [Evidências](media/evidencias.json) | Modelo, duração, timestamp, verificações e distinção entre inferência real e simulação. |

O pedido gravado criou **Ana Souza**, `ana@example.com`, e o contrato **Consultoria de automações**, de **R$ 2.500,00**, com início em **2026-11-20**. Nome e demais dados são fictícios. Edição, exclusão e restauração foram demonstradas pelos controles da aplicação; o vídeo não atribui essas etapas a novas inferências.

As verificações da gravação conferiram armazenamento inicial vazio, ausência de gravação antes da confirmação, vínculo do lote, edição, exclusão em cascata, restauração, persistência após recarregar e ausência de erros de página no navegador. A execução bem-sucedida não mede confiabilidade geral do modelo.

### Reproduzir a gravação

Com o servidor em `http://localhost:3000`, `.env` configurado e Chromium instalado:

```bash
node scripts/record-demo.mjs
python3 scripts/render-demo.py
```

A gravação usa Playwright já presente no projeto; o renderizador requer `ffmpeg`, `ffprobe` e Pillow. O renderizador usa Arial em `/System/Library/Fonts/Supplemental/Arial.ttf`, caminho do macOS; ajuste para uma fonte instalada antes de executá-lo em outro sistema. O arquivo bruto e o manifesto ficam em `test-results/demo-recording/`, ignorado pelo Git; os artefatos finais vão para `docs/media/`.

O gravador aceita apenas ID com sufixo `:free` e desativa fallback. Isso não garante disponibilidade ou quota; confira a oferta atual do provedor antes de executar. Ele inicia um contexto descartável e não apaga registros do navegador pessoal.

## Preparar um ambiente limpo

1. Execute a aplicação conforme o [README](../README.md), em localhost.
2. Use perfil ou contexto de navegador dedicado à gravação. Inicie com clientes, contratos, rascunhos e chat vazios. Não apague dados pessoais de outro perfil.
3. Entre antes de iniciar a captura, para não registrar usuário, senha ou preenchimento de credenciais.
4. Confira o modelo selecionado e deixe o alternativo desativado, salvo escolha explícita. Verifique a tarifa antes de enviar pedidos.
5. Desative notificações que possam aparecer na gravação. Não mostre `.env`, cookies, DevTools de rede ou respostas brutas do provedor.
6. Grave apenas a área da aplicação, em resolução que permita ler formulários e cartões. Dados de exemplo usam `example.com`.

Na aplicação, os registros representam **clientes**, não usuários com conta. Há somente um login configurado no ambiente. Um contexto novo oferece uma base vazia sem alterar as credenciais.

## Roteiro sugerido para apresentações futuras

### 1. Apresentação e navegação

Explique: “Este assistente prepara cadastros a partir de pedidos em linguagem natural. Eu reviso e confirmo antes de salvar.”

Envie:

> Abra a lista de clientes.

Mostre o indicador de destino, a mudança de página e a conversa preservada. A lista vazia estabelece o ponto de partida.

### 2. Cliente e contrato em um pedido

Envie:

> Cadastre uma cliente chamada Ana Demo, com e-mail ana@example.com, e um contrato de Consultoria para ela, no valor de R$ 1.500, com início em 2026-12-01.

Acompanhe o lote preparado. Confira nome, e-mail, título, valor, data e vínculo. Mostre que os registros ainda não aparecem como salvos antes da confirmação. Clique no botão de confirmar e então abra as listas para verificar cliente e contrato.

Explique: “O modelo propõe os dados. O código valida os campos e grava o conjunto depois da minha confirmação.”

### 3. Complemento de dados

Em uma segunda execução ou trecho separado:

> Cadastre Bruno Demo, bruno@example.com, e um contrato de Suporte para ele.

Aguarde as pendências. Responda:

> O valor é R$ 750 e a data de início é 2026-12-10.

Confira se o complemento preservou nome, e-mail, título e referência do cliente. Se o modelo falhar, não confirme dados incorretos. Mostre a limitação ou refaça o pedido, deixando claro que houve nova tentativa.

### 4. Edição e revisão

Peça para abrir a edição de Ana e alterar um contato fictício, ou faça a edição pelo formulário. Mostre o cartão com a alteração atual antes de confirmar. Recarregue a página depois de salvar e confira que o valor permanece.

Se alterar um campo após gerar a revisão, a aplicação deve exigir revisão atualizada. Esse trecho demonstra por que um “sim” solto na conversa não equivale a autorização de gravação.

### 5. Exclusão reversível

Peça para mover Ana para a lixeira. Mostre o impacto sobre o contrato vinculado antes de confirmar. Abra a lixeira, solicite restauração e confirme. Verifique o retorno do cliente e do contrato às listas.

Explique que a exclusão é reversível e que contratos excluídos anteriormente em outra operação não são restaurados junto por engano.

### 6. Configurações e custo

Abra Configurações. Mostre busca, filtros de compatibilidade/preço e o modelo principal. Abra os detalhes e a estimativa de custo por volume de tokens. Não é necessário trocar para um modelo pago nem fazer inferência para demonstrar a tela.

Explique que as tarifas vêm do catálogo, a cotação BRL é uma referência e a estimativa não é a cobrança real da conversa.

### 7. Persistência e encerramento

Minimize e reabra o chat. Recarregue a página para mostrar a permanência dos cadastros. Encerre esclarecendo que os dados ficam nesse navegador, o modelo é remoto e o protótipo não é multiusuário.

Ditado pode ser um trecho adicional, quando houver suporte e uma gravação real autorizada. Se for mostrado com reconhecimento controlado de teste, identifique a simulação; não atribua precisão de fala real ao teste.

## Gravação fiel à execução

- Capture as interações reais, incluindo o botão de confirmação e o resultado nas listas.
- Pode cortar períodos de espera, mas identifique aceleração e não atribua ao modelo um tempo de resposta alterado na edição.
- Não monte cartões ou mensagens falsos para substituir uma chamada que falhou.
- O nome do modelo efetivo deve estar visível em pelo menos um trecho.
- Registre separadamente qualquer cenário com resposta interceptada. Ele demonstra a interface e as regras, não inferência real.
- Não exiba credenciais nem dados de terceiros; confira também miniaturas, primeiro e último frames e áudio.

## Critérios de revisão antes de publicar

1. Cliente e contrato mostrados no vídeo existem após a confirmação e têm o vínculo correto.
2. O cadastro não é anunciado como persistido enquanto há apenas rascunho.
3. As gravações começam sem histórico ou registros de uso anterior.
4. Exclusão e restauração exibem o impacto e o resultado correto.
5. Títulos, datas e valores são legíveis; nenhuma chave ou cookie aparece.
6. Os trechos apresentados como IA real usam o provedor real, sem interceptação.
7. O README identifica os limites do armazenamento local, do modelo e da avaliação.

O roteiro ampliado inclui cenários que não aparecem no vídeo publicado, como complemento de dados e ditado. Esses exemplos não são evidência de execução. Ao gravar novos trechos, registre resultado, modelo, data e eventuais falhas após conferir os arquivos finais.
