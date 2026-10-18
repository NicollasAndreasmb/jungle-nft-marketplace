# Jungle NFT Marketplace

Solução do desafio de Front-end da Jungle Gaming: um marketplace de NFTs em React e TypeScript que cobre descoberta, compra e conta do colecionador, em desktop e mobile. A aplicação funciona de ponta a ponta contra um **backend simulado no navegador com MSW**, cujos handlers respondem aos endpoints REST da aplicação (sob `/api`) e à conexão Socket.IO. Não há API real, blockchain, extensão de carteira nem gateway de pagamento: carteiras, transações e pagamentos são simulados.

## Links

| Recurso | Link |
| --- | --- |
| Demonstração | https://jungle-nft-marketplace-silk.vercel.app/ |
| Repositório | https://github.com/NicollasAndreasmb/jungle-nft-marketplace |
| Arquitetura e decisões | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Enunciado original | [`docs/ENUNCIADO.md`](docs/ENUNCIADO.md) |

## Principais funcionalidades

- **Catálogo:** destaques, busca, filtros combináveis, ordenação e paginação mantidos na URL (sobrevivem a refresh e ao histórico do navegador).
- **Detalhe do NFT:** galeria, edições, quantidade com limite por pedido e favoritos. Também trata acesso direto, NFT inexistente e edição esgotada.
- **Carrinho:**
  - mantido para visitante e para usuário, inclusive após refresh, e unido ao do usuário no login;
  - cupom válido, inválido ou expirado;
  - subtotal, desconto, taxa e total calculados pelo servidor simulado.
- **Pagamento em três etapas:**
  - dados do colecionador;
  - carteira e rede, com conexão, recusa e desconexão simuladas;
  - revisão com cotação revalidada antes da confirmação.
- **Pedido:**
  - estados pendente, confirmado e recusado;
  - recuperação após refresh ou reconexão;
  - recibo exibido somente para pedido confirmado, a partir do snapshot da compra.
- **Conta:** cadastro, login, logout, sessão recuperada após refresh e tratamento de expiração. Inclui edição de perfil, avatar e senha, e carteiras principal e secundária.
- **Tempo real:** `nft.updated` atualiza preço e disponibilidade no catálogo, no detalhe e no carrinho; `order.updated` atualiza o estado do pedido.

## Stack

| Responsabilidade | Tecnologia |
| --- | --- |
| Interface e linguagem | React 19, TypeScript 5.9 |
| Build | Vite 7 |
| Roteamento | TanStack Router |
| Estado remoto | TanStack Query |
| HTTP | Axios |
| Tempo real | socket.io-client |
| Estilo e componentes | Tailwind CSS 4, shadcn/ui (Radix) |
| Validação de contratos | Zod |
| Mocking | MSW 2 e `@mswjs/socket.io-binding` |
| Testes | Vitest, Playwright |
| Auditoria | Lighthouse |

As versões exatas estão em `package.json`, `package-lock.json` e na seção 1 de [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Destaques técnicos

- **Contratos tipados:** os mesmos schemas Zod validam as respostas no cliente e as requisições no mock, e removem campos desconhecidos.
- **Valores em ETH:** trafegam como strings decimais; todo cálculo usa `bigint` em wei, sem ponto flutuante.
- **Pedido idempotente:**
  - A chave de idempotência, o corpo e a cotação são persistidos antes do envio, e cliques repetidos são ignorados.
  - Timeout ou falha transitória geram reenvio com a mesma `Idempotency-Key`, recuperando o mesmo pedido.
  - A mesma chave com conteúdo diferente gera conflito.
- **Cotação vinculante:** mudanças de preço, estoque, cupom ou taxa respondem 409 `QUOTE_STALE` e exigem nova confirmação. Eventos em tempo real que afetem a cotação também bloqueiam a confirmação.
- **Reconciliação REST/Socket.IO:**
  - Eventos carregam identidade, recurso e versão; duplicatas e versões antigas são descartadas, sem regressão de estado.
  - Ao reconectar, os recursos ativos são recarregados pela API.
  - Eventos de pedido só chegam ao dono.
- **Isolamento por usuário:** dados privados ficam no cache sob o id do usuário. Logout e troca de usuário limpam cache, mutations, rascunhos e o socket da sessão anterior, inclusive em outras abas.
- **Atualização otimista:** favoritos, com rollback em caso de falha.
- **Segurança:**
  - A sessão usa cookie `HttpOnly` simulado, o mock guarda só o hash do token e as senhas usam PBKDF2.
  - O login tem limite de tentativas, e mutations exigem um cabeçalho anti-CSRF.
  - Redirecionamentos passam por validação, e o upload de avatar confere a assinatura binária.
  - A CSP e os cabeçalhos de segurança estão em `vercel.json`.
- **Inicialização robusta:** se o service worker do MSW não puder ser registrado ou o bundle não carregar, a página mostra um aviso acessível com orientação de recarga, em vez de ficar em branco.
- **Acessibilidade:** skip link e foco movido ao título a cada navegação. Diálogos têm foco controlado, os campos têm rótulos e erros associados, e as mudanças assíncronas são anunciadas. Os skeletons com shimmer respeitam `prefers-reduced-motion`.

## Testes e qualidade

Última execução local, em 2026-10-17:

- **Playwright:** 74 testes em Chromium, desktop (1440 px) e mobile (390 px).
  - Cobrem os 12 cenários do enunciado, a inicialização e o isolamento de sessão.
  - Incluem regressão visual de início, detalhe, carrinho e pagamento, com baselines versionadas.
- **Vitest:** 15 testes unitários (aritmética ETH, gate de eventos e redirecionamento seguro).
- **Lighthouse:** mediana de 3 execuções por página e perfil, no build otimizado com o cenário padrão. Os relatórios HTML/JSON, as versões e o ambiente estão em `lighthouse/reports/`.

| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP | CLS |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Início | mobile | 93 | 100 | 100 | 100 | 3,0 s | 0 |
| Início | desktop | 99 | 100 | 100 | 100 | 0,8 s | 0 |
| Detalhe | mobile | 93 | 100 | 100 | 100 | 2,9 s | 0 |
| Detalhe | desktop | 99 | 100 | 100 | 100 | 0,8 s | 0 |

Todos esses resultados são de execuções locais: o Playwright e o Lighthouse rodaram contra o build servido por `vite preview` em localhost, e o Vitest roda localmente. Nenhum deles foi obtido no ambiente publicado. O ambiente e as condições do Lighthouse estão em `lighthouse/reports/summary.json`.

## Como executar localmente

Requisitos:
- Node.js ≥ 20.19 (testado com 26.10) e npm.
- Para E2E e Lighthouse: Chromium do Playwright (`npx playwright install chromium`).

```bash
git clone https://github.com/NicollasAndreasmb/jungle-nft-marketplace.git
cd jungle-nft-marketplace
npm ci
npm run dev                  # http://localhost:5173 com mocks
```

O worker do MSW já está versionado em `public/mockServiceWorker.js`. O npm 11+ pode avisar que bloqueou o `postinstall` do `msw`; o aviso é inofensivo, pois nenhum script de instalação é necessário. Se o worker for removido, regenere-o com `npx msw init public --save`.

### Variáveis de ambiente

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `VITE_ENABLE_MOCKS` | `true` | ativa o backend simulado (REST + Socket.IO); obrigatório na demonstração |
| `VITE_API_BASE_URL` | `/api` | base das chamadas Axios |
| `VITE_SOCKET_URL` | `wss://realtime.jungle.mock` | servidor Socket.IO (interceptado pelo MSW) |

Os valores estão em `.env.development`, `.env.production` e `.env.example`. Nenhum deles é secreto, pois todas as variáveis `VITE_*` chegam ao bundle do navegador.

## Credenciais fictícias para demonstração

Estas contas existem apenas no banco simulado da demonstração e não dão acesso a nenhum serviço real.

| Usuário | E-mail | Senha | Observação |
| --- | --- | --- | --- |
| Ana Ribeiro | `ana@jungle.test` | `Jungle@2026` | 2 carteiras, 2 favoritos |
| Bruno Lima | `bruno@jungle.test` | `Jungle@2026` | sem carteiras nem favoritos |

Cupons fictícios: `JUNGLE10` (10%), `GENESIS25` (25%), `EXPIRED20` (expirado). Qualquer outro código é inválido.

## Cenários de simulação

Há três formas de selecionar um cenário:
- pelo painel **Cenários** (faixa no fim da página);
- pela URL `?mock-scenario=<id>`;
- pelo console, com `window.__jungleMock.setScenario('<id>')` seguido de recarga.

**Restaurar dados** volta ao seed determinístico e limpa o cookie jar do MSW e o `sessionStorage`.

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

### Como reproduzir fluxos importantes

1. **Tempo real no checkout:** entre como Ana, adicione um NFT e vá até a revisão. No painel, escolha o mesmo NFT e clique em "Aumentar preço 15%". A revisão bloqueia a confirmação até "Atualizar revisão".
2. **Timeout com recuperação:** aplique `order-timeout` e confirme a compra. Após cerca de 8 s, o cliente reenvia com a mesma `Idempotency-Key` e abre o mesmo pedido. `window.__jungleMock.orders()` mostra um único pedido.
3. **Desconexão com pedido pendente:** no console, rode `__jungleMock.setPaymentDelay(60000)` e confirme a compra. Clique em "Derrubar tempo real (10 s)" e depois em "Resolver pedidos pendentes". Na reconexão, o pedido aparece confirmado.
4. **Eventos duplicados ou antigos:** altere o preço duas vezes e use "Reenviar evento antigo" ou "Reenviar evento (duplicado)". O valor exibido não regride.
5. **Sessão expirada:** clique em "Expirar sessão" no painel e navegue por uma tela privada. O app redireciona ao login e retorna ao fluxo após entrar.

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

## Deploy

A aplicação está publicada na Vercel em https://jungle-nft-marketplace-silk.vercel.app/, com os mocks incluídos no build de produção (`VITE_ENABLE_MOCKS=true`). O backend continua sendo o MSW rodando no navegador do visitante; não há API real por trás do deploy.

O `vercel.json` configura o build, o rewrite de SPA (acesso direto e refresh) e os cabeçalhos de segurança. O rewrite exclui `/assets/` e `/nfts/`, para que um arquivo estático ausente responda 404 em vez de `index.html`.

### Validação no ambiente publicado

Testes funcionais manuais feitos no deploy, com resultado positivo:
- login com as contas fictícias de Ana e Bruno;
- navegação principal e carregamento das imagens;
- acesso direto a uma rota interna e atualização com F5;
- busca, filtros, ordenação e paginação do catálogo;
- navegação do detalhe do NFT até o checkout.

Ainda não validado em produção:
- conclusão da compra, estados do pedido e recibo;
- tempo real (`nft.updated`, `order.updated`) e reconciliação após reconexão;
- resposta 404 para assets inexistentes em `/assets/` e `/nfts/`;
- cabeçalhos de segurança (CSP, HSTS e demais) entregues pela Vercel;
- cenários de falha do painel de simulação;
- Lighthouse e testes automatizados contra a URL publicada (os resultados em [Testes e qualidade](#testes-e-qualidade) são locais).

O `vite preview` local não reproduz a exclusão de assets e devolve `index.html` para qualquer caminho. `public/_redirects` e `public/_headers` cobrem Netlify e Cloudflare Pages; nesses dois, o fallback de SPA ainda responde `index.html` para assets ausentes.

## Arquitetura, limitações e documentação

[`ARCHITECTURE.md`](ARCHITECTURE.md) documenta:
- os contratos REST e de eventos;
- a política de sessão, o estado do carrinho e a estratégia de cache e retries;
- o checkout idempotente e a reconciliação REST/Socket.IO;
- os mocks, os testes, a performance e a segurança;
- os desvios do Figma.

O enunciado original do desafio está preservado em [`docs/ENUNCIADO.md`](docs/ENUNCIADO.md).

### Limitações conhecidas

- **Backend simulado no navegador:** não há API real, blockchain nem gateway de pagamento. Os handlers do MSW respondem aos endpoints REST sob `VITE_API_BASE_URL` (`/api`) e à conexão Socket.IO em `VITE_SOCKET_URL`; os arquivos estáticos (HTML, JavaScript, CSS, fontes e imagens) continuam sendo servidos pelo host. Sessão, autorização e rate limit rodam no navegador. O banco simulado (`jungle-mock-db`) e o cookie jar do MSW ficam em `localStorage`. Por isso, `HttpOnly` não protege o token nesta demonstração, e `window.__jungleMock` permite alterar o estado.
- **Tempo real por aba:** cada aba tem seu próprio broker Socket.IO. Uma mudança feita em uma aba chega às outras por reconciliação REST (foco, polling ou reconexão), não por evento.
- **Service worker obrigatório:** a demonstração depende do service worker do MSW. Se o navegador bloqueá-lo (por exemplo, em algumas janelas privadas), a página mostra um aviso com instruções em vez da loja.
- **Testes:** os testes automatizados cobrem as larguras de 1440 e 390 px; a de 768 px foi verificada apenas manualmente.
- **Identidade visual provisória:** o arquivo do Figma não pôde ser lido pela integração disponível. Cores, tipografia, espaçamentos e composição são provisórios, e as artes dos NFTs são SVGs gerados (ver seção 11 de [`ARCHITECTURE.md`](ARCHITECTURE.md)).

Mais detalhes nas seções 4, 13, 14 e 15 de [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Pendências

- **Validação em produção:** conferir os itens listados como ainda não validados em [Validação no ambiente publicado](#validação-no-ambiente-publicado).
- **Figma:** reconciliar a identidade visual quando o arquivo original estiver acessível.
