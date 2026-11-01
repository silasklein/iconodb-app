# IconoDB (app)

App de consulta, somente leitura, do IconoDB: uma base iconográfica pessoal e fechada. Mostra a literatura de referência em português, com as traduções à mão e busca rápida. É um PWA (Vite, React e TypeScript) que roda no navegador, instalado na Tela de Início do iPhone ou no Dock do Mac, e também no Chrome.

## O que este repositório contém, e o que não contém

Só código. **O conteúdo dos livros não está aqui**: nem textos, nem imagens, nem bancos de dados. O conteúdo fica no Dropbox do próprio usuário, na pasta do app, e o app o baixa depois do login.

Os testes usam um pacote sintético (`tests/fixtures/pacote/`), sem nada dos livros. Nenhum teste acessa a rede.

## Como rodar

Requer Node 22.

```sh
npm ci          # instala as dependências nas versões fixadas
npm run dev     # servidor de desenvolvimento
npm test        # testes (Vitest)
npm run build   # confere os tipos e gera dist/ (com o service worker)
npm run preview # serve dist/ localmente
npm run e2e     # testes de ponta a ponta (Playwright, Chromium), sobre o build e com o Dropbox simulado
npm run icones  # gera de novo os PNG de public/ a partir do logo (ver "Ícones")
```

`npm run e2e` constrói o app, serve `dist/` com `vite preview` e usa o Chromium já instalado (`PLAYWRIGHT_BROWSERS_PATH`); em uma máquina nova, rode antes `npx playwright install chromium`. O Dropbox é simulado com `page.route` (login, token e download servindo `tests/fixtures/pacote/`) e qualquer pedido a outro servidor externo derruba o teste.

O app é publicado em `https://silasklein.github.io/iconodb-app/`. O `base` do Vite é `/iconodb-app/` no build (e `/` no `npm run dev`, que serve em `http://localhost:5173/`) e as rotas usam `HashRouter`, porque o GitHub Pages não reescreve caminhos.

## Instalar no iPhone e no Mac

O app é um PWA: depois de instalado, abre em tela cheia, guarda os dados no aparelho e funciona sem internet.

**iPhone (Safari)**

1. Abra `https://silasklein.github.io/iconodb-app/` no Safari.
2. Toque em **Compartilhar** e em **Adicionar à Tela de Início**; confirme o nome "IconoDB".
3. Feche o Safari e abra o IconoDB **pela Tela de Início**.
4. **Entre no Dropbox de dentro do app instalado**, não da aba do Safari. O app da Tela de Início guarda os dados separados do Safari: se o login for feito na aba, o app instalado não o enxerga. Se o Dropbox terminar o login no Safari em vez de voltar ao app, use **Entrar com código**: o Dropbox mostra um código, que se cola na tela do app.
5. **Mantenha o app aberto durante o primeiro download** (tela "Preparando este aparelho"). O iPhone suspende apps em segundo plano; se isso acontecer, abra o app de novo: o download continua de onde parou, sem baixar outra vez o que já foi conferido.

**Mac (Safari)**

1. Abra `https://silasklein.github.io/iconodb-app/` no Safari.
2. No menu, **Arquivo → Adicionar ao Dock**.
3. Abra o IconoDB pelo Dock e entre com o Dropbox (ou com **Entrar com código**).

No Chrome do Mac o app também funciona (menu **Instalar IconoDB**, no ícone da barra de endereço).

Depois da primeira sincronização o app abre direto no Início, mesmo em modo avião: a busca funciona e as imagens já vistas aparecem. Uma imagem que nunca foi aberta mostra "Imagem disponível quando houver internet".

## Onde fica o pacote no Dropbox

O pacote (gerado com `app-export`, no repositório privado) vai na **raiz** da pasta do app, `Aplicativos/IconoDB-Silas/`, com estas duas pastas:

```text
Aplicativos/IconoDB-Silas/
  nucleo/     manifest.json, os bancos .sqlite e as tabelas de busca
  imagens/    miniaturas e imagens de tela, por publicação
```

A pasta `usuario/` não é lida nem escrita por esta versão do app.

## Login com o Dropbox (passo manual, uma vez)

O app entra no Dropbox por OAuth 2 com PKCE: só a app key (`erkchv20ri1l2at`, pública por natureza), **nunca** o App secret. No console do Dropbox (https://www.dropbox.com/developers/apps, app do IconoDB):

1. Em **Settings → OAuth 2 → Redirect URIs**, registre e adicione:
   - `https://silasklein.github.io/iconodb-app/` (produção);
   - `http://localhost:5173/` (só se for rodar `npm run dev` e entrar por ele).
2. Em **Settings → OAuth 2**, deixe ligada a opção **Allow public clients (Implicit Grant & PKCE)**.
3. Em **Permissions**, o app é do tipo **App folder**: os arquivos ficam na raiz da pasta do app (`/nucleo/…`, `/imagens/…`).

Sem o item 1, o Dropbox recusa o login com "redirect_uri mismatch". Sem o item 2, o login falha antes de começar.

O login alternativo "Entrar com código" não usa redirect URI: o Dropbox mostra um código que se cola no app. Serve para o iPhone, onde o retorno do Dropbox pode abrir no Safari em vez do app instalado (os dois guardam dados separados).

O token (refresh token, access token e validade) fica no IndexedDB, nunca no `localStorage`. Se o Dropbox revogar o acesso, o app continua abrindo e consultando o que já está no aparelho, e a próxima sincronização pede para entrar de novo, sem apagar dados locais.

## Estrutura

- `src/app/`: `App.tsx` (roteador) e `routes.tsx` (as telas).
- `src/dropbox/`: login do Dropbox.
  - `auth.ts`: `iniciarLogin`, `concluirLogin`, `iniciarLoginComCodigo`, `concluirLoginComCodigo`, `cliente()` (renova o access token), `estadoLogin()` (`sem-login`, `ativo` ou `expirado`) e `sair()`.
  - `tokenStore.ts`: token e login em andamento (`code_verifier` e `state`) no IndexedDB `iconodb-login`.
  - `retorno.ts`: trata o `?code=…&state=…` na abertura do app (a query, e não o hash, porque o app usa `HashRouter`).
- `src/telas/`: telas (por ora, `Entrar.tsx`).
- `src/pwa/`: o app instalável.
  - `atualizacao.ts`: registra o service worker (só no build publicado) e guarda se há versão nova esperando.
  - `AvisoDeAtualizacao.tsx`: a faixa "Nova versão disponível", com o botão Recarregar. O app só recarrega quando o usuário toca nele, e a faixa fica escondida durante o primeiro download.
  - `icones.test.ts`: confere, pixel a pixel, os PNG de `public/`.
- `public/`: ícones do app (PNG), gerados por `scripts/gerar-icones.ts`.
- `scripts/gerar-icones.ts`: desenha os ícones direto em pixels a partir da grade 19 × 11 de `src/ui/Logo.tsx`.
- `e2e/`: testes de ponta a ponta (`fluxo.spec.ts`) e o Dropbox simulado (`dropboxSimulado.ts`).
- `src/ui/`: elementos de interface compartilhados.
  - `tokens.css`: cores, fontes e medidas. Telas de consulta têm fundo claro (padrão); item e imagem usam o tema escuro.
  - `useTema.ts`: `useTema("item")` vai no componente de cada tela de item e de imagem. Ele põe a classe `tema-item` em `<html>` enquanto a tela está montada, para o fundo escuro cobrir o `<body>` e a rolagem elástica do iOS. Telas de consulta não chamam nada. Para pintar só um contêiner, use a classe `tema-item` nele (ela define fundo e texto).
  - `Logo.tsx`: logo SKC na grade 19 × 11, só em escalas inteiras (1 a 4).
  - `Icon.tsx`: todos os glifos do design, um por conceito.
  - `IconButton.tsx`: botão de ícone, sem rótulo visível, com `aria-label`, dica ao passar o mouse e ao receber foco (`data-tip`) e `aria-keyshortcuts`.
  - `useBreakpoint.ts`: `"celular"` abaixo de 768 px, `"computador"` de 768 px em diante.

## Offline e ícones

O service worker (`vite-plugin-pwa`, gerado no `npm run build`) guarda no aparelho só o **app**: o shell (HTML, JS e CSS), o worker do banco, o `.wasm` do sqlite e as fontes (woff2). Ele **não** guarda nada do Dropbox: o pacote mora no OPFS (`blobs/` e `estado.json`) e as imagens no Cache Storage `iconodb-imagens` (ver `src/pacote/`). O manifesto chama-se "IconoDB", com `theme_color` `#111111`, `display: standalone` e `start_url`/`scope` `/iconodb-app/`.

Versão nova do app: o service worker novo espera; aparece "Nova versão disponível" e o app recarrega só quando o usuário toca em Recarregar.

Os ícones (192, 512, 512 "maskable" e o `apple-touch-icon` de 180) são o logo SKC, preto sobre quadrado branco, em escala inteira e com margens iguais (decisão 21: pixel perfeito). Para refazê-los: `npm run icones`.

## Publicação

No GitHub, em **Settings → Pages**, a fonte (**Source**) deve ser **GitHub Actions**. O fluxo `.github/workflows/pages.yml` roda `npm ci`, `npm test` e `npm run build` e publica `dist/` no GitHub Pages a cada push em `main`.
