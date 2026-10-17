# Jungle NFT Marketplace

Marketplace de NFTs em React + TypeScript com catálogo, detalhe, carrinho, pagamento, confirmação, conta e carteiras. As APIs REST e os eventos Socket.IO são simulados com MSW na camada de rede.

| Documento | Conteúdo |
| --- | --- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | contratos REST e de eventos, sessão, carrinho, cache, reconciliação REST/Socket.IO, testes, Lighthouse, segurança, limitações e desvios do Figma |
| [`docs/ENUNCIADO.md`](docs/ENUNCIADO.md) | enunciado original do desafio, sem alterações |

## Requisitos

- Node.js ≥ 20.19 (testado com 26.10) e npm.
- Para E2E e Lighthouse: Chromium do Playwright (`npx playwright install chromium`).

## Setup

```bash
npm ci
npm run dev                  # http://localhost:5173 com mocks
```

O worker do MSW já está versionado em `public/mockServiceWorker.js`. O npm 11+ pode avisar que bloqueou o `postinstall` do `msw`; o aviso é inofensivo, pois nenhum script de instalação é necessário. Se o worker for removido, regenere-o com `npx msw init public --save`.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `VITE_ENABLE_MOCKS` | `true` | ativa o backend simulado (REST + Socket.IO); obrigatório na demonstração |
| `VITE_API_BASE_URL` | `/api` | base das chamadas Axios |
| `VITE_SOCKET_URL` | `wss://realtime.jungle.mock` | servidor Socket.IO (interceptado pelo MSW) |

Os valores estão em `.env.development`, `.env.production` e `.env.example`. Nenhum deles é secreto, pois todas as variáveis `VITE_*` chegam ao bundle do navegador.

## Credenciais fictícias

| Usuário | E-mail | Senha | Observação |
| --- | --- | --- | --- |
| Ana Ribeiro | `ana@jungle.test` | `Jungle@2026` | 2 carteiras, 2 favoritos |
| Bruno Lima | `bruno@jungle.test` | `Jungle@2026` | sem carteiras nem favoritos |

Cupons: `JUNGLE10` (10%), `GENESIS25` (25%), `EXPIRED20` (expirado). Qualquer outro código é inválido.

## Comandos

| Comando | Descrição |
| --- | --- |
| `npm run dev` | desenvolvimento com mocks |
| `npm run build` | verificação de tipos + build otimizado (inclui mocks para a demonstração) |
| `npm run preview` | serve o build em http://localhost:4173 com os cabeçalhos de segurança |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run test:unit` | Vitest (aritmética ETH, gate de eventos, redirecionamento seguro) |
| `npm run test:e2e` | Playwright em Chromium desktop e mobile, com relatório em `playwright-report/` e traces das falhas em `test-results/` |
| `npm run test:e2e:update` | regrava as baselines visuais |
| `npm run build && npm run lighthouse` | auditoria Lighthouse: 3 execuções por página e perfil, relatórios em `lighthouse/reports/` |

O `test:e2e` faz o build e sobe o preview sozinho. Fora de CI, o Playwright reutiliza um servidor que já esteja na porta 4173, então encerre `npm run preview` antes para não testar um build antigo. Para abrir o relatório: `npx playwright show-report`.

## Cenários de simulação

Selecione pelo painel **Cenários** (faixa no fim da página), pela URL `?mock-scenario=<id>` ou pelo console com `window.__jungleMock.setScenario('<id>')` seguido de recarga. **Restaurar dados** volta ao seed determinístico e limpa o cookie jar do MSW e o `sessionStorage`.

| Id | O que simula |
| --- | --- |
| `default` | sucesso, latência de 120 ms |
| `empty-catalog` | catálogo e destaques vazios |
| `slow` | 2,5 s por resposta (skeletons) |
| `variable-latency` | 0,2–2 s determinístico por URL (respostas fora de ordem) |
| `offline` | falha de conexão em todo o REST |
| `server-error` | HTTP 500 no catálogo e no detalhe |
| `flaky` | 503 na primeira chamada do catálogo (retry automático) |
| `favorite-failure` | 503 ao favoritar (rollback otimista) |
| `unauthorized` | 403 em perfil e carteiras |
| `price-change` | preço sobe ao enviar o pedido (409 `QUOTE_STALE`) |
| `sold-out` | edição esgota ao enviar o pedido |
| `order-timeout` | pedido criado, resposta além do timeout (recuperado pela idempotência) |
| `payment-declined` | pagamento recusado |
| `wallet-rejects` | conexão da carteira recusada |

## Como reproduzir os fluxos de falha

1. **Tempo real no checkout:** entre como Ana, adicione um NFT e vá até a revisão. No painel, escolha o mesmo NFT e clique em "Aumentar preço 15%". A revisão bloqueia a confirmação até "Atualizar revisão".
2. **Timeout com recuperação:** aplique `order-timeout` e confirme a compra. Após cerca de 8 s, o cliente reenvia com a mesma `Idempotency-Key` e abre o mesmo pedido. `window.__jungleMock.orders()` mostra um único pedido.
3. **Desconexão com pedido pendente:** no console, rode `__jungleMock.setPaymentDelay(60000)` e confirme a compra. Clique em "Derrubar tempo real (10 s)" e depois em "Resolver pedidos pendentes". Na reconexão, o pedido aparece confirmado.
4. **Eventos duplicados ou antigos:** altere o preço duas vezes e use "Reenviar evento antigo" ou "Reenviar evento (duplicado)". O valor exibido não regride.
5. **Sessão expirada:** clique em "Expirar sessão" no painel e navegue por uma tela privada. O app redireciona ao login e retorna ao fluxo após entrar.

## Deploy

`vercel.json` configura build, rewrite de SPA (acesso direto e refresh) e cabeçalhos de segurança. O rewrite exclui `/assets/` e `/nfts/`, então um arquivo estático ausente responde 404 em vez de `index.html`. O `vite preview` local não reproduz essa regra e ainda devolve `index.html` para qualquer caminho. `public/_redirects` e `public/_headers` cobrem Netlify e Cloudflare Pages; nesses dois, o fallback de SPA ainda responde `index.html` para assets ausentes. O build de produção inclui os mocks (`VITE_ENABLE_MOCKS=true`).

## Limitações

- **Backend simulado no navegador:** sessão, autorização e rate limit rodam no navegador. O banco simulado (`jungle-mock-db`) e o cookie jar do MSW ficam em `localStorage`. Por isso, `HttpOnly` não protege o token nesta demonstração, e `window.__jungleMock` permite alterar o estado.
- **Tempo real por aba:** cada aba tem seu próprio broker Socket.IO. Uma mudança feita em uma aba chega às outras por reconciliação REST (foco, polling ou reconexão), não por evento.
- **Service worker obrigatório:** a demonstração depende do service worker do MSW. Se o navegador bloqueá-lo (por exemplo, em algumas janelas privadas), a página mostra um aviso com instruções em vez da loja.
- **Testes:** os testes automatizados cobrem as larguras de 1440 e 390 px; a de 768 px foi verificada apenas manualmente.
- **Identidade visual provisória:** ver Pendências.

Detalhes em [`ARCHITECTURE.md`](ARCHITECTURE.md), seções 4, 13, 14 e 15.

## Pendências

- **Deploy:** ainda não publicado. A URL pública será adicionada aqui após a publicação.
- **Figma:** o arquivo não pôde ser lido pela integração disponível, e a identidade visual atual é provisória (ver seção 11 de [`ARCHITECTURE.md`](ARCHITECTURE.md)).
