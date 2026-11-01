# IconoDB (app)

App de consulta, somente leitura, do IconoDB: uma base iconográfica pessoal e fechada. Mostra a literatura de referência em português, com as traduções à mão e busca rápida. É um PWA (Vite, React e TypeScript) que roda no navegador, instalado na Tela de Início do iPhone ou no Dock do Mac, e também no Chrome.

## O que este repositório contém, e o que não contém

Só código. **O conteúdo dos livros não está aqui**: nem textos, nem imagens, nem bancos de dados. O conteúdo fica no Dropbox do próprio usuário, na pasta do app, e o app o baixa depois do login.

Os testes usam um pacote sintético (`tests/fixtures/pacote/`), sem nada dos livros. Nenhum teste acessa a rede.

## Como rodar

Requer Node 22.18 ou mais novo (o `npm run icones` roda TypeScript direto no Node).

```sh
npm ci          # instala as dependências nas versões fixadas
npm run dev     # servidor de desenvolvimento
npm test        # testes (Vitest)
npm run build   # confere os tipos e gera dist/ (com o service worker)
npm run preview # serve dist/ localmente
npm run e2e     # testes de ponta a ponta (Playwright, Chromium), sobre o build e com o Dropbox simulado
npm run icones  # gera de novo os PNG de public/ a partir do logo (ver "Ícones")
```

`npm run e2e` constrói o app, serve `dist/` com `vite preview` e usa o Chromium já instalado (`PLAYWRIGHT_BROWSERS_PATH`); em uma máquina nova, rode antes `npx playwright install chromium`. O Dropbox é simulado com `page.route` (login, token e download servindo `tests/fixtures/pacote/`); qualquer pedido a outro servidor externo, ou qualquer violação da Content-Security-Policy, derruba o teste. **A e2e roda só localmente** (`npm run e2e`), não no GitHub Actions: rode-a antes de mandar para a `main`.

O app é publicado em `https://silasklein.github.io/iconodb-app/`. Esse endereço é **uma só configuração**, `VITE_ENDERECO` (padrão em `src/app/endereco.ts`): dele saem o `base` do Vite (`/iconodb-app/` no build; `/` no `npm run dev`, que serve em `http://localhost:5173/`), o `id`, o `start_url` e o `scope` do manifesto, o redirect do Dropbox em produção e a base da e2e. As rotas usam `HashRouter`, porque o GitHub Pages não reescreve caminhos.

O `index.html` publicado traz uma Content-Security-Policy (`scripts/csp.ts`, só no build): nada por padrão; scripts, workers, estilos e fontes do próprio app; o `.wasm` do sqlite (`'wasm-unsafe-eval'`); conexões só com o app e as APIs do Dropbox; imagens do app, `blob:` e `data:`.

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

**Versão nova do app:** aparece "Nova versão disponível". **Feche as outras abas e janelas do app antes de tocar em Recarregar**: a versão nova só assume quando nenhuma janela usa mais a antiga.

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

O tipo de acesso **App folder** (os arquivos ficam na raiz da pasta do app, `/nucleo/…`, `/imagens/…`) é escolhido **ao criar o app** no console e não muda depois.

1. Em **Settings → OAuth 2 → Redirect URIs**, registre e adicione:
   - o endereço publicado, `https://silasklein.github.io/iconodb-app/` (produção; o mesmo de `VITE_ENDERECO`);
   - `http://localhost:5173/` (só se for rodar `npm run dev` e entrar por ele).
2. Em **Settings → OAuth 2**, deixe ligada a opção **Allow public clients (Implicit Grant & PKCE)**.
3. Na aba **Permissions**, marque **`files.content.read`** (o app só lê o pacote) e clique em **Submit** no fim da página. Se o console pedir, marque também `files.metadata.read` (a listagem de arquivos). Nenhuma permissão de escrita.

Sem o item 1, o Dropbox recusa o login com "redirect_uri mismatch". Sem o item 2, o login falha antes de começar. Sem o item 3 (ou sem o **Submit**), o login funciona mas o download falha por falta de permissão; depois de mudar as permissões, entre de novo no app.

Os segredos do OAuth (o código, o `code_verifier` e o refresh token) vão sempre no corpo do POST, nunca na URL. Ao sair, o app revoga o token no Dropbox (se houver rede).

O login alternativo "Entrar com código" não usa redirect URI: o Dropbox mostra um código que se cola no app. Serve para o iPhone, onde o retorno do Dropbox pode abrir no Safari em vez do app instalado (os dois guardam dados separados).

O token (refresh token, access token e validade) fica no IndexedDB, nunca no `localStorage`. Se o Dropbox revogar o acesso, o app continua abrindo e consultando o que já está no aparelho, e a próxima sincronização pede para entrar de novo, sem apagar dados locais.

## Estrutura

- `src/app/`: `App.tsx` (roteador), `routes.tsx` (as telas) e `endereco.ts` (o endereço publicado, `VITE_ENDERECO`).
- `scripts/csp.ts`: a Content-Security-Policy do build.
- `src/dropbox/`: login do Dropbox.
  - `auth.ts`: `iniciarLogin`, `concluirLoginDetalhado`, `iniciarLoginComCodigo`, `tentarLoginComCodigo`, `cliente()` (renova o access token), `estadoLogin()` (`sem-login`, `ativo` ou `expirado`) e `sair()` (revoga e limpa).
  - `prazo.ts`: prazo de inatividade nas chamadas ao Dropbox (conexão pendurada vira "sem conexão").
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

O service worker (`vite-plugin-pwa`, gerado no `npm run build`) guarda no aparelho só o **app**: o shell (HTML, JS e CSS), o worker do banco, o `.wasm` do sqlite e as fontes (woff2). Ele **não** guarda nada do Dropbox: o pacote mora no OPFS (`blobs/` e `estado.json`) e as imagens no Cache Storage `iconodb-imagens` (ver `src/pacote/`). O manifesto chama-se "IconoDB", com `theme_color` `#111111`, `display: standalone` e `id`/`start_url`/`scope` iguais à base do endereço publicado (`/iconodb-app/`). Do sqlite-wasm ficam fora do precache o worker da API "Worker1" e o proxy da VFS "opfs", que o app não usa (o banco usa a VFS `opfs-sahpool`).

Versão nova do app: o service worker novo espera; aparece "Nova versão disponível" e o app recarrega só quando o usuário toca em Recarregar (feche antes as outras abas do app).

Os ícones (192, 512, 512 "maskable" e o `apple-touch-icon` de 180) são o logo SKC, preto sobre quadrado branco, em escala inteira e com margens iguais (decisão 21: pixel perfeito). Para refazê-los: `npm run icones`.

## Publicação

No GitHub, em **Settings → Pages**, a fonte (**Source**) deve ser **GitHub Actions**. O fluxo `.github/workflows/pages.yml` roda `npm ci --ignore-scripts`, `npm test` e `npm run build` (também em pull requests) e publica `dist/` no GitHub Pages só a cada push em `main`. O token do fluxo só lê o repositório; só o job que publica recebe `pages: write` e `id-token: write`.

### Mudar para o domínio próprio

Para publicar em `https://icono.silasklein.com/` (ou outro endereço):

1. **DNS (Locaweb)**: na zona de `silasklein.com`, crie um registro **CNAME** `icono` → `silasklein.github.io`.
2. **Verificar o domínio no GitHub** (evita que outra conta o tome): no seu perfil, **Settings → Pages → Add a domain**, `silasklein.com`, e crie na Locaweb o registro TXT que o GitHub pedir.
3. **Pages do repositório**: **Settings → Pages → Custom domain** = `icono.silasklein.com`, **Save**; quando o certificado sair, marque **Enforce HTTPS**.
4. **O endereço do app**: em **Settings → Secrets and variables → Actions → Variables**, crie a variável `VITE_ENDERECO` = `https://icono.silasklein.com/` (ou troque `ENDERECO_PADRAO` em `src/app/endereco.ts`). Rode o fluxo de novo (push na `main` ou **Run workflow**): a base passa a ser `/`, e o manifesto e o redirect do Dropbox acompanham. Para a e2e local no novo endereço: `VITE_ENDERECO=https://icono.silasklein.com/ npm run e2e`.
5. **Dropbox**: em **Settings → OAuth 2 → Redirect URIs**, adicione `https://icono.silasklein.com/` (o antigo pode ficar até a troca terminar).
6. **Instale o app de novo em cada aparelho**, pelo endereço novo, e entre no Dropbox: o armazenamento (login, pacote e imagens) é por endereço, então o app novo começa vazio e baixa o pacote outra vez.
7. **Apague o app antigo** (o da Tela de Início ou do Dock que abre `silasklein.github.io`) e, no Safari, os dados do site antigo, para liberar o espaço.
