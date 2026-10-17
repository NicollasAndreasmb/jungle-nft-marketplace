# Arquitetura — Jungle NFT Marketplace

Este documento registra as decisões técnicas, os contratos REST e de eventos, a política de sessão, o estado do carrinho, a estratégia de cache, a reconciliação entre REST e Socket.IO, as limitações conhecidas e os desvios em relação ao Figma.

## 1. Stack e versões

| Responsabilidade | Tecnologia | Versão | Observação |
| --- | --- | --- | --- |
| Interface | React | 19.3.1 | |
| Linguagem | TypeScript | 5.9.3 | `typescript-eslint` 8.71 exige `<6.1` |
| Build | Vite | 7.3.7 | com `@vitejs/plugin-react` 5.2 |
| Roteamento | TanStack Router | 1.170.45 | rotas em código, search params tipados |
| Estado remoto | TanStack Query | 5.104.4 | |
| HTTP | Axios | 1.20.0 | |
| Tempo real | socket.io-client | 4.8.4 | |
| Estilo | Tailwind CSS | 4.3.3 | tokens em `src/styles/globals.css` |
| Componentes | shadcn/ui (Radix) | CLI 4.22 | componentes em `src/components/ui` |
| Validação | Zod | 4.6.7 | contratos compartilhados entre cliente e mock |
| Mocking | MSW | 2.15.0 | 2.x porque `@mswjs/socket.io-binding` 0.2 exige `msw ^2.10.2` |
| Socket.IO mock | @mswjs/socket.io-binding | 0.2.0 | |
| E2E e visual | Playwright | 1.64.1 | Chromium desktop e mobile |
| Auditoria | Lighthouse | 13.5.0 | runner versionado em `scripts/lighthouse.mjs` |
| Unitários | Vitest | 5.0.5 | aritmética ETH, gate de eventos e redirecionamento |

## 2. Organização

```
src/
  api/          contratos Zod, transporte Axios, endpoints por recurso, query keys
  app/          bootstrap do router, layout raiz, QueryClient, search params
  components/   ui (shadcn), layout, feedback, formulários, cards
  features/     catalog, nft, cart, checkout, orders, session, profile, wallets, favorites
  realtime/     cliente Socket.IO, gate de eventos, aplicação no cache, barramento interno
  lib/          eth (decimais exatos), safe-redirect, utilitários
  mocks/        servidor simulado: db, domínio, handlers REST, realtime, cenários, painel
tests/e2e/      Playwright (fluxos, falhas, tempo real, acessibilidade, regressão visual)
lighthouse/     configuração versionada e relatórios
docs/           enunciado original do desafio (ENUNCIADO.md)
```

Os componentes, hooks e o cliente Axios não contêm respostas fictícias nem caminhos alternativos de negócio. Toda simulação está em `src/mocks`, na camada de rede.

## 3. Contratos REST

Base: `VITE_API_BASE_URL` (padrão `/api`). JSON em UTF-8. Mutations exigem o cabeçalho `X-Requested-With: jungle-web`; sem ele, a resposta é 403 `CSRF_REJECTED`. Os schemas estão em `src/api/contracts.ts` e são usados nos dois lados: o cliente valida as respostas e o mock valida as requisições, removendo campos desconhecidos (proteção contra mass assignment).

### Envelope de erro

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Revise os campos destacados.", "fieldErrors": { "email": "..." }, "details": [] } }
```

| HTTP | Códigos |
| --- | --- |
| 400 | `BAD_REQUEST`, `INVALID_QUERY`, `IDEMPOTENCY_KEY_REQUIRED` |
| 401 | `UNAUTHENTICATED`, `SESSION_EXPIRED` (limpa o cookie), `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN`, `CSRF_REJECTED` |
| 404 | `NFT_NOT_FOUND`, `EDITION_NOT_FOUND`, `CART_ITEM_NOT_FOUND`, `WALLET_NOT_FOUND`, `QUOTE_NOT_FOUND`, `ORDER_NOT_FOUND` |
| 409 | `EMAIL_TAKEN`, `PROFILE_CONFLICT`, `SOLD_OUT`, `QUANTITY_LIMIT`, `AVAILABILITY_CONFLICT`, `WALLET_SLOT_TAKEN`, `WALLET_DUPLICATE`, `WALLET_REJECTED`, `WALLET_NOT_CONNECTED`, `NETWORK_MISMATCH`, `CART_EMPTY`, `QUOTE_STALE`, `QUOTE_EXPIRED`, `QUOTE_ALREADY_USED`, `IDEMPOTENCY_CONFLICT` |
| 422 | `VALIDATION_ERROR`, `COUPON_INVALID`, `COUPON_EXPIRED`, `INVALID_CURRENT_PASSWORD`, `AVATAR_TOO_LARGE`, `AVATAR_INVALID_TYPE`, `NETWORK_UNSUPPORTED` |
| 429 | `RATE_LIMITED` (com `Retry-After`) |
| 5xx | `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`, `BAD_GATEWAY` (falhas transitórias) |

### Recursos

| Método e rota | Corpo / parâmetros | Resposta |
| --- | --- | --- |
| `POST /auth/register` | `{ name, email, password }` | 201 `Session`, define cookie de sessão; une o carrinho de visitante |
| `POST /auth/login` | `{ email, password }` | 200 `Session`; une o carrinho de visitante |
| `GET /auth/session` | — | 200 `Session` ou `{ user: null, expiresAt: null }`; 401 se o cookie for inválido ou expirado |
| `POST /auth/logout` | — | 200; invalida a sessão, as conexões de carteira e os sockets do usuário |
| `POST /realtime/ticket` | — | `{ ticket, expiresAt }` (uso único, 60 s) |
| `GET /nfts` | `q`, `category` (repetível), `collection`, `minPrice`, `maxPrice`, `availability`, `sort`, `page` | `{ items: NftSummary[], page, pageSize: 12, total, totalPages }` |
| `GET /nfts/highlights` | — | `NftSummary[]` |
| `GET /collections` | — | `{ id, name }[]` |
| `GET /nfts/:id` | — | `NftDetail` (galeria, edições com preço, estoque e limite por pedido) |
| `GET /favorites` | — | `{ nftIds, items }` |
| `PUT/DELETE /favorites/:nftId` | — | 204 |
| `GET /cart` | — | `Cart` (do visitante via cookie `jg_cart`, ou do usuário autenticado) |
| `POST /cart/items` | `{ nftId, editionId, quantity }` | `Cart`; 409 para limite ou estoque |
| `PATCH /cart/items/:id` | `{ quantity }` | `Cart` |
| `DELETE /cart/items/:id` | — | `Cart` |
| `PUT /cart/coupon` · `DELETE /cart/coupon` | `{ code }` | `Cart`; 422 para cupom inválido ou expirado |
| `POST /wallets/:id/connect` | `{ network }` | `WalletSession`; 409 `WALLET_REJECTED` |
| `DELETE /wallet-sessions/:id` | — | 204 |
| `POST /checkout/quote` | `{ network }` | `Quote` (vinculante, expira em 10 min); 409 com `details: QuoteChange[]` |
| `POST /orders` | header `Idempotency-Key`; `{ quoteId, walletSessionId, collector }` | 201 `Order` (`pending`); 200 em replay com a mesma chave; 409 `IDEMPOTENCY_CONFLICT` se o conteúdo for diferente; 409 `QUOTE_STALE` com as mudanças |
| `GET /orders?status=pending` | — | `Order[]` do usuário |
| `GET /orders/:id` | — | `Order` (snapshot imutável); 404 para pedidos de outro usuário |
| `GET/PATCH /profile` | `{ name, username, email, bio }` | `User`; 409 com `fieldErrors` para conflitos |
| `POST/DELETE /profile/avatar` | multipart `avatar` (PNG/JPEG/WebP, até 512 KB, validação por assinatura binária) | `{ avatarUrl }` |
| `PUT /profile/password` | `{ currentPassword, newPassword }` | 204; encerra as outras sessões |
| `GET /wallets` · `POST /wallets` · `PATCH /wallets/:id` | `{ slot?, label, address, provider, networks }` | `Wallet` |

Valores em ETH trafegam como strings decimais (`^(0|[1-9]\d*)(\.\d{1,18})?$`). Todo cálculo usa `bigint` em wei (`src/lib/eth.ts`). As quantidades são inteiras. Totais, descontos e taxas são sempre calculados pelo servidor; o cliente apenas os exibe.

## 4. Eventos em tempo real

Transporte: `socket.io-client` com `transports: ['websocket']`, conectado a `VITE_SOCKET_URL`. Na simulação, a conexão WebSocket é interceptada pelo MSW (`ws.link`) e o protocolo Socket.IO é tratado por `@mswjs/socket.io-binding`.

Envelope:

```ts
{ eventId: string; type: 'nft.updated' | 'order.updated'; resource: { type: 'nft' | 'order'; id: string }; version: number; occurredAt: string; data: ... }
```

| Evento | Público | `data` | Efeito no cliente |
| --- | --- | --- | --- |
| `nft.updated` | todos | `{ editions: [{ id, priceEth, available }], fromPriceEth, totalAvailable }` | atualiza o detalhe, as listas do catálogo, os destaques e os favoritos (guardado por `version`); invalida o carrinho se o NFT estiver nele e mostra um aviso; marca a cotação do checkout como desatualizada |
| `order.updated` | somente o dono | `{ status, userId }` | invalida o pedido e os pedidos pendentes; após confirmação, recarrega o carrinho |

**Autenticação do socket.** O cliente obtém um ticket de uso único via REST (o cookie `HttpOnly` não é legível por JavaScript) e o envia no `auth` do pacote CONNECT. Cada reconexão solicita um novo ticket. Sockets sem ticket recebem apenas eventos públicos.

**Ordenação e idempotência.** `src/realtime/event-gate.ts` descarta `eventId` repetidos e versões menores ou iguais à última aplicada por recurso. Além disso, cada patch no cache compara a versão do evento com a versão do dado REST em cache, então nunca há regressão. Eventos de `order.updated` com `userId` diferente do usuário atual são ignorados.

**Ciclo de vida.** Há um socket por identidade (visitante ou usuário). Trocar de usuário, fazer logout ou desmontar o componente remove todos os listeners e fecha a conexão. Os handlers verificam uma flag `active`, o que impede que eventos atrasados de uma sessão anterior alterem o cache.

**Reconciliação.** No `connect` posterior a uma desconexão, o cliente invalida NFT, catálogo, destaques, carrinho e pedidos do usuário, reconciliando com o REST. Pedidos pendentes também fazem polling a cada 5 s, como fallback até atingir um estado terminal.

### Limitações do transporte simulado

- O binding não implementa acks, namespaces nem rooms. A autorização por usuário é feita pelo broker do mock (`src/mocks/realtime.ts`).
- O binding não envia heartbeats do engine.io. O mock envia `ping` a cada 20 s; sem isso o cliente derrubaria a conexão por `ping timeout` a cada cerca de 30 s.
- Apenas o transporte WebSocket é suportado (sem long-polling).
- O `engine.io-client` captura `globalThis.WebSocket` ao ser avaliado. Por isso `src/main.ts` importa a aplicação dinamicamente **depois** de iniciar o MSW.
- O "servidor" roda em cada aba. Os dados são sincronizados entre abas por eventos `storage` (sessões revogadas valem para todas), mas cada aba tem seu próprio broker de Socket.IO: um evento gerado na aba A não é entregue por socket à aba B, que o recebe por reconciliação REST (foco, polling ou reconexão).

## 5. Política de sessão

- A sessão usa um token opaco em cookie `jg_session` (`HttpOnly; SameSite=Strict; Path=/`, com `Secure` em HTTPS) e TTL de 2 h. O mock guarda apenas o SHA-256 do token.
- No navegador, o MSW mantém os cookies simulados em um cookie jar próprio (persistido em `localStorage`). O código da aplicação nunca lê nem grava o token.
- As senhas usam PBKDF2-SHA256 com 120.000 iterações e salt aleatório (Web Crypto). Nenhuma senha em texto puro é persistida; as credenciais de demonstração só existem nas fixtures, para derivar o hash no seed.
- O login tem limite de 5 falhas por e-mail a cada 5 min (429). A mensagem é a mesma para usuário inexistente e senha incorreta.
- A sessão é recuperada após refresh: `GET /auth/session` responde 200 com o usuário ou `user: null`, sem erro no console para visitantes.
- Expiração: qualquer 401 `SESSION_EXPIRED` também limpa o cookie. O `SessionWatcher` purga o cache privado, avisa o usuário e, em rota privada, redireciona para `/login?redirect=<rota atual>&reason=expired`. Após o novo login, o fluxo retoma no mesmo lugar.
- No checkout, o rascunho do colecionador, a carteira conectada e a tentativa em andamento (chave de idempotência + corpo + cotação) ficam em `sessionStorage` por usuário. Eles são **preservados** na expiração e **apagados** no logout ou quando outro usuário entra.
- No logout e na troca de usuário, o cliente cancela e remove as queries `['user', …]` e `['cart', …]`, fecha o socket da identidade anterior e limpa os rascunhos. O servidor invalida a sessão, as conexões de carteira e os sockets do usuário.
- O parâmetro `redirect` passa por `safeRedirectPath`, que aceita apenas caminhos relativos da própria aplicação (proteção contra open redirect).

## 6. Estado do carrinho

- O carrinho vive no servidor. O visitante é identificado pelo cookie `HttpOnly` `jg_cart`, com id aleatório; o usuário autenticado tem um carrinho próprio. A query key é `['cart', userId | 'guest']`.
- No login e no cadastro, o carrinho do visitante é unido ao do usuário, respeitando estoque e limite por pedido, e o carrinho de visitante é esvaziado.
- Cada linha guarda o preço reconhecido. O servidor informa `status`: `ok`, `price-changed` (com o preço anterior), `insufficient` ou `sold-out`. O checkout fica bloqueado enquanto houver linha indisponível.
- As mutations substituem o cache pela resposta do servidor (sem cálculo local). O resumo mostra a taxa estimada na rede Ethereum; a taxa final depende da rede escolhida e é fixada na cotação.
- Após a confirmação, o servidor remove do carrinho apenas as quantidades compradas. Em falha ou recusa, os itens são preservados.

## 7. Estratégia de cache, retries e sincronização

| Item | Política |
| --- | --- |
| `staleTime` | 30 s (sessão: 60 s; coleções: 10 min) |
| `gcTime` | 5 min |
| Refetch | ao focar a janela e ao reconectar a rede |
| Retries de query | até 2 tentativas extras, somente para falhas transitórias (rede, timeout, 5xx, 429), com backoff exponencial de até 4 s; 4xx nunca são repetidos |
| Mutations | sem retry automático; criação de pedido tem retry próprio e idempotente |
| Listagem | uma entrada de cache por combinação de parâmetros + `keepPreviousData`; o `AbortSignal` do Query cancela requisições obsoletas, então respostas fora de ordem nunca sobrescrevem a consulta atual |
| Otimista | favoritos: `onMutate` aplica, `onError` faz rollback do snapshot, `onSettled` reconcilia |
| Invalidação | mutations de carrinho gravam a resposta; eventos atualizam por versão ou invalidam; reconexão invalida recursos ativos |
| Isolamento | dados privados em `['user', userId, …]`; logout remove tudo |

## 8. Checkout e idempotência

1. **Dados:** validados com o mesmo schema da API.
2. **Carteira e rede:** carteiras cadastradas, redes suportadas por carteira, conexão simulada (aprovação, recusa, desconexão).
3. **Revisão:** `POST /checkout/quote` gera uma cotação vinculante (itens, cupom, taxa da rede, total, validade).
4. **Confirmação:** gera a chave de idempotência e persiste `{ chave, corpo, cotação }` **antes** do envio. Um guarda por `ref` ignora cliques repetidos. Timeout (8 s), falha de rede ou 5xx → até 2 reenvios com a **mesma** chave e o **mesmo** corpo. Após refresh ou novo login, a revisão retoma a tentativa salva em vez de criar outra.
5. O servidor revalida preço, estoque, cupom e taxa. Se algo mudou, responde 409 `QUOTE_STALE` com a lista de mudanças; a UI exige "Atualizar revisão" e uma nova confirmação. Eventos `nft.updated` que afetem a cotação também bloqueiam a confirmação no cliente.
6. O pedido nasce `pending`, com estoque reservado. A resolução simulada leva `confirmed` (hash e bloco simulados) ou `rejected` (estoque liberado). Pedidos pendentes são reagendados quando o mock reinicia, então o refresh recupera o mesmo pedido. Estados terminais não mudam.
7. O recibo é renderizado apenas a partir do snapshot do pedido e somente com `status === 'confirmed'`.

## 9. Mocks

- O mock é ativado por `VITE_ENABLE_MOCKS=true` (`.env.development` e `.env.production`) e está incluído no build de demonstração.
- Falha de inicialização: se o service worker do MSW não puder ser registrado (navegador ou janela privada que bloqueia service workers), se o início demorar mais de 20 s ou se o bundle da aplicação não carregar, `src/main.ts` não renderiza a loja. Em vez disso, `src/app/boot-failure.ts` mostra um alerta acessível em pt-BR, com foco no título, a causa provável e o botão "Recarregar a página". Não há nova tentativa automática, então não há loop nem mensagem duplicada.
- O banco simulado fica persistido em `localStorage` (`jungle-mock-db`). "Restaurar dados" refaz o seed determinístico e limpa o cookie jar e o `sessionStorage`.
- Fixtures: 36 NFTs, 6 coleções, 5 categorias, 1 a 3 edições por NFT (inclusive esgotadas), 3 cupons e 2 usuários.
- Cenários (`src/mocks/scenarios.ts`), selecionáveis por `?mock-scenario=<id>`, pelo painel "Cenários" ou por `window.__jungleMock.setScenario(id)`: `default`, `empty-catalog`, `slow`, `variable-latency`, `offline`, `server-error`, `flaky`, `favorite-failure`, `unauthorized`, `price-change`, `sold-out`, `order-timeout`, `payment-declined`, `wallet-rejects`.
- A latência variável é determinística (hash da URL, de 0,2 s a 2 s), o que permite reproduzir respostas fora de ordem.
- `window.__jungleMock` permite ajustar latência, falhas por rota (`addFault`), preço e estoque (emitindo `nft.updated`), reenvio de eventos duplicados ou antigos, queda e retorno do tempo real, expiração de sessão e resolução de pedidos pendentes. Todas as ações alteram o estado do servidor simulado; a aplicação só as percebe via REST e Socket.IO.

## 10. Interface, acessibilidade e UX

- Tema escuro com tokens CSS (`:root`), acento verde-lima e raio de 8 px, sem gradientes nem glow. Tipografia Space Grotesk (títulos) e Inter (texto), hospedadas localmente via Fontsource.
- Os skeletons usam shimmer (`.skeleton-shimmer`) com dimensões iguais às do conteúdo. Com `prefers-reduced-motion`, as animações são desativadas.
- Acessibilidade:
  - Skip link e foco movido ao `h1` após cada navegação.
  - Drawers e diálogos Radix com foco controlado e retorno ao gatilho.
  - Rótulos, `aria-describedby` e `aria-invalid` nos campos; o foco vai ao primeiro campo inválido.
  - Mudanças assíncronas e de tempo real anunciadas por toasts em região `aria-live`.
  - Os estados não dependem só de cor (texto e ícone).
- O painel de cenários é uma faixa no fim da página, e não um botão flutuante, para não cobrir conteúdo em telas pequenas.

## 11. Desvios do Figma e substituição de assets

- **O arquivo Figma não pôde ser lido neste ambiente.** O MCP do Figma exige acesso de edição, e a conta conectada tem apenas visualização. Por isso, cores, tipografia, espaçamentos e composição seguem uma identidade provisória, documentada acima, e **precisam ser reconciliados com o Figma** (ver Pendências no [`README.md`](README.md)).
- As artes dos NFTs são SVGs generativos determinísticos (`scripts/generate-artwork.mjs` → `public/nfts`), usados no lugar dos assets do Figma. Eles mantêm as baselines visuais estáveis e não dependem de hosts externos.
- O link "explorador" do recibo abre um diálogo de transação simulada, em vez de levar a um explorador real que não encontraria o hash.

## 12. Performance

Relatórios em `lighthouse/reports` (HTML e JSON por execução, mais `summary.json` e `summary.md`). Mediana de 3 execuções no build otimizado com o cenário padrão:

| Página | Perfil | Perf. | A11y | BP | SEO | LCP | CLS | TBT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Início | mobile | 93 | 100 | 100 | 100 | 3024 ms | 0 | 102 ms |
| Início | desktop | 99 | 100 | 100 | 100 | 841 ms | 0 | 0 ms |
| Detalhe | mobile | 93 | 100 | 100 | 100 | 2933 ms | 0 | 93 ms |
| Detalhe | desktop | 99 | 100 | 100 | 100 | 757 ms | 0 | 0 ms |

Medição de 2026-10-17 (Lighthouse 13.5.0, Chromium do Playwright `chromium-1248`, Node 26.10, Linux x64, i5-1235U). As medições usam `vite preview` com a mesma CSP do deploy. O Zod roda em modo `jitless`: sem isso, a sonda `new Function` do Zod gerava uma violação de CSP e reduzia Best Practices para 96. O LCP mobile (cerca de 3 s com throttling simulado) é o principal ponto de melhoria. A renderização espera o boot do MSW (registro do service worker e seed do banco com PBKDF2), que é parte da entrega de demonstração e não foi removido para melhorar a pontuação.

## 13. Segurança

Revisão manual, `npm audit` (0 vulnerabilidades em dependências de produção e de desenvolvimento) e uma auditoria independente somente leitura feita por um agente revisor. Corrigido a partir dos achados:

| Achado | Severidade | Correção |
| --- | --- | --- |
| Socket autenticado sobrevivia à revogação da sessão (troca de senha, expiração, novo login) | Média | O ticket e a conexão ficam vinculados ao hash da sessão emissora; entregas privadas revalidam a sessão; revogações fecham os sockets (`disconnectRevokedConnections`). Teste: `session-security.spec.ts` |
| Ticket de tempo real utilizável após logout | Baixa | O resgate do ticket exige sessão ativa |
| Diferença de tempo no login revelava e-mails inexistentes | Baixa | PBKDF2 executado também para usuário inexistente |
| Cadastro mantinha a sessão anterior válida | Baixa | Sessão anterior revogada no cadastro, como no login |
| Senhas permaneciam no cache de mutations | Baixa | `getMutationCache().clear()` em toda troca de identidade |
| Logout não refletia em outras abas | Baixa | `BroadcastChannel` + recarga do banco simulado por evento `storage`. Teste: `session-security.spec.ts` |
| HSTS ausente em `public/_headers` | Info | Adicionado |

Controles verificados: escopo por `userId` em todos os handlers (404 para recursos de terceiros), carrinho de visitante com id aleatório de 128 bits, remoção de campos desconhecidos pelos schemas, preços recalculados no servidor, upload com validação de tamanho e assinatura binária, CSRF por cabeçalho obrigatório, `safeRedirectPath`, ausência de `dangerouslySetInnerHTML`, CSP e cabeçalhos de segurança no deploy, `.env` sem segredos.

Riscos inerentes ao mock no navegador (aceitos e documentados): o banco simulado (com hashes de senha) e o cookie jar do MSW ficam em `localStorage`, então `HttpOnly` não protege o token nesta demonstração; `window.__jungleMock` e o painel permitem manipular o estado; as credenciais de demonstração são públicas por definição.

## 14. Testes

- **Isolamento:** cada teste usa um contexto de navegador novo, então o banco simulado, o cookie jar do MSW e o cenário partem do seed determinístico.
- **Controle de tempo e eventos:** latência e falhas são fixadas por cenário. Os eventos Socket.IO, a queda e o retorno da conexão, a expiração de sessão e a resolução de pedidos pendentes são disparados explicitamente via `window.__jungleMock`, e o atraso de pagamento é ajustado com `setPaymentDelay`. O relógio do navegador não é falsificado (`page.clock`): os timeouts do cliente correm em tempo real (o teste de timeout do pedido leva cerca de 8 s), e dois testes usam esperas fixas curtas para provar que uma resposta atrasada ou um evento antigo não alteram a tela.
- **Viewports:** Playwright cobre 1440 px (todos os specs) e 390 px (inicialização, catálogo, carrinho, compra, autenticação e visual). A largura de 768 px foi verificada manualmente em 2026-10-17, sem overflow horizontal em início, detalhe, carrinho, pagamento, login, cadastro, perfil, carteiras e 404, mas não tem projeto automatizado.
- **Inicialização:** `boot.spec.ts` cobre a inicialização normal, o service worker bloqueado (`serviceWorkers: 'block'`) e a falha do bundle da aplicação (requisição abortada), incluindo a recuperação por recarga.
- **Relatórios:** HTML em `playwright-report/` e traces das falhas em `test-results/` (`retain-on-failure`).

## 15. Limitações conhecidas

- Não há backend real: autorização, cookies e rate limit são simulados no navegador. Qualquer usuário pode inspecionar ou alterar o estado do mock pelo DevTools ou por `window.__jungleMock`; isso é inerente a um mock client-side e não representa a segurança de produção.
- O endereço de carteira é validado apenas por formato (`0x` + 40 hex), sem checksum EIP-55.
- Brokers de tempo real independentes por aba (ver seção 4).
- A troca de e-mail no perfil não exige a senha atual (não especificado no desafio; recomendado para produção).
- O cadastro informa e-mail já cadastrado (`EMAIL_TAKEN`), conforme o requisito de "tratamento de conflito". Isso permite enumeração de contas; em produção, combine com rate limit por cliente e confirmação por e-mail.
