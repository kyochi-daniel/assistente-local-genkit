# Contrato de acesso local

Escopo: um usuário configurado no ambiente, sem cadastro, recuperação de senha ou banco.

## Configuração privada

Nuxt runtimeConfig privado: loginUser, loginPassword, sessionSecret, openrouterApiKey,
openrouterModel, openrouterFallbackModel e allowedOrigin. Variáveis equivalentes NUXT_LOGIN_USER, NUXT_LOGIN_PASSWORD,
NUXT_SESSION_SECRET, NUXT_OPENROUTER_API_KEY, NUXT_OPENROUTER_MODEL,
NUXT_OPENROUTER_FALLBACK_MODEL e NUXT_ALLOWED_ORIGIN. `.env.example`
deve conter valores vazios e orientações; nunca credenciais reais ou NEXT_PUBLIC/NUXT_PUBLIC
para segredos. Configuração de login ausente bloqueia autenticação com mensagem de setup.

## Endpoints

| Endpoint | Entrada | Saída |
| --- | --- | --- |
| POST /api/auth/login | JSON estrito { username, password } | 200 { authenticated: true }, Set-Cookie |
| GET /api/auth/session | Cookie de sessão | 200 { authenticated: true } ou 401 |
| POST /api/auth/logout | Cookie de sessão | 204 e cookie expirado |

Login: username entre 1 e 120 caracteres e password entre 1 e 256; não aplicar trim
na senha. Corpo até 2 KiB. Erros: 400 entrada inválida; 401 credenciais incorretas
(mensagem genérica); 403 origem inválida; 503 configuração ausente. Nunca retornar
senha, segredo ou conteúdo do cookie no corpo. Usar mecanismo de sessão do H3/Nitro,
sem criptografia própria; comparação de credenciais deve evitar comparação insegura
de segredos. Cinco falhas por IP em um minuto retornam 429 por um minuto; contador
em memória, suficiente para localhost e limpo ao reiniciar. Não publicar esse login.

## Sessão e proteção

Cookie `genkit-session`, HttpOnly, SameSite=Strict, Path=/, validade absoluta de 8h;
Secure em HTTPS. Desenvolvimento em http://localhost usa Secure=false. Segredo
aleatório local de pelo menos 32 bytes, gerado no setup e não versionado.
Sessão assinada/selada expirada ou inválida equivale a ausência de sessão.
O logout remove o cookie; não há revogação remota de cópias de cookie neste MVP local.

Validar sessão no servidor em todas as chamadas de /api/chat. As rotas POST de
auth e chat aceitam apenas JSON e Origin igual à origem local configurada
(http://localhost:3000 por padrão). Não derivar origem permitida de header arbitrário.
Não habilitar CORS aberto. O middleware de páginas consulta a sessão no servidor;
não usa flag em localStorage como prova de autenticação.

Rotas públicas: /login. Protegidas: /assistente, /clientes, /clientes/novo,
/contratos, /contratos/novo. / redireciona para /assistente se autenticado ou /login
caso contrário. Destino pós-login é /assistente, sem redirect arbitrário por query.
Logout aborta fetch ativo e invalida review/IDs de execução em memória.

## Limite deliberado

LocalStorage pertence ao perfil do navegador, não a uma sessão segura. Login serve
para demonstrar acesso à UI/API de IA; não protege dados locais contra a pessoa
que controla a máquina. Usar apenas dados fictícios. Cadastros continuam locais
e não precisam de endpoints CRUD no servidor.
