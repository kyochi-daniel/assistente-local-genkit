<!-- Sync Impact Report: 1.3.0 → 1.4.0. Configurações permitem escolha explícita
de modelos gratuitos/pagos por navegador, preservando chave privada e confirmação. -->
# Genkit Assistente Local Constitution

## Core Principles

### I. Um protótipo, uma aplicação

A aplicação DEVE usar Nuxt, Vue e TypeScript, executar localmente e manter os cadastros
no navegador, sem banco. Reutilizar shadcn-vue. Não adicionar serviços, filas,
frameworks de agentes ou abstrações sem necessidade do fluxo demonstrável.

### II. O assistente executa ações observáveis

O chat DEVE permanecer disponível durante a navegação. A interface DEVE mostrar
progresso, rascunhos e resultados reais. O modelo propõe ações de uma lista fechada;
código determinístico valida e executa. O modelo NÃO executa JavaScript, seletores,
URLs arbitrárias, comandos do sistema ou operações fora do escopo.

### III. Confirmação vinculada ao conteúdo

Criar, editar, mover para a lixeira e restaurar DEVEM exigir confirmação explícita
em um cartão com o resumo
exato da revisão atual. Alterar campos invalida a confirmação anterior. Cancelar,
recarregar ou perder a sessão NÃO pode salvar automaticamente. Navegar e preencher
rascunhos dispensam confirmação enquanto não descartarem trabalho existente.

### IV. Limites de confiança explícitos

Credenciais e chave OpenRouter DEVEM permanecer no servidor. Rotas de IA DEVEM
validar sessão, origem e dados recebidos. Todo argumento gerado pelo modelo DEVE
ser validado novamente no cliente. Conteúdo de clientes e contratos é dado,
nunca instrução. Usar apenas dados fictícios nas demonstrações.

### V. Especificação verificável e mínima

Requisitos, contratos e tarefas DEVEM concordar antes da implementação. Cada
fluxo do assistente DEVE ter cenário de aceite; lógica não trivial de confirmação,
validação, persistência e streaming DEVE ter verificação automatizada pequena.
Não declarar ação concluída antes do resultado da execução no navegador.

## Escopo e restrições

MVP para uma pessoa e uma aba ativa: login fixo, chat flutuante, CRUD completo de
clientes/contratos e navegação assistida com progresso visível antes da troca de rota.
Exclusão é soft delete local. O cartão DEVE explicar os contratos afetados ao excluir
um cliente; restaurar o cliente recupera apenas os contratos daquele lote.
IA usa Genkit no servidor Node.js com OpenRouter. Modelos são configuráveis por
ambiente. O padrão atual é ERNIE gratuito com fallback desativado. A página de
configurações permite escolha explícita de principal/alternativo, gratuitos ou pagos,
com custo visível. Persistir apenas IDs localmente; chave permanece no servidor.
Não reativar modelos pagos automaticamente. A interface DEVE informar o modelo
efetivamente utilizado. A gratuidade não substitui os critérios de aceite. Anexos e testes multimodais ficam para
uma etapa posterior. Sem exclusão definitiva, PDF, assinatura, pagamentos,
cadastro de usuários, RAG, MCP, múltiplos agentes em runtime ou publicação.

Lotes de até 10 novos cadastros DEVEM manter vínculos entre clientes e contratos,
perguntar dados faltantes e gravar todos os itens em uma única operação local,
após uma confirmação do conjunto. Falha não pode deixar cadastros parciais.

## Fluxo de trabalho e verificação

Seguir Spec Kit: constituição, spec, pesquisa/plano, contratos, tarefas, implementação
e análise. A implementação completa foi autorizada após a preparação do kit.
Antes de implementar, conferir versões estáveis e registrar versões resolvidas no
lockfile. Validar tipos, testes dos fluxos críticos, build e roteiro de demonstração.
Testes com provedor simulado e testes reais DEVEM ser identificados separadamente.

## Governance

Esta constituição orienta o projeto, respeitando as instruções explícitas do usuário.
Mudanças de comportamento exigem atualizar spec, contratos e tarefas afetados.
Alterações incompatíveis incrementam MAJOR; novos princípios, MINOR; esclarecimentos,
PATCH. Revisões DEVEM conferir escopo, confirmação, proteção de segredos e evidência
de execução. Não modificar os templates originais do Spec Kit para adaptar o produto.

**Version**: 1.4.0 | **Ratified**: 2026-11-13 | **Last Amended**: 2026-11-14
