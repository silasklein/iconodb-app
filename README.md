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
npm run build   # confere os tipos e gera dist/
npm run preview # serve dist/ localmente
```

O app é publicado em `https://silasklein.github.io/iconodb-app/`. O `base` do Vite é `/iconodb-app/` no build (e `/` no `npm run dev`, que serve em `http://localhost:5173/`) e as rotas usam `HashRouter`, porque o GitHub Pages não reescreve caminhos.

## Login com o Dropbox (passo manual, uma vez)

O app entra no Dropbox por OAuth 2 com PKCE: só a app key (`erkchv20ri1l2at`, pública por natureza), **nunca** o App secret. No console do Dropbox (https://www.dropbox.com/developers/apps, app do IconoDB):

1. Em **Settings → OAuth 2 → Redirect URIs**, registre e adicione:
   - `https://silasklein.github.io/iconodb-app/` (produção);
   - `http://localhost:5173/` (só se for rodar `npm run dev` e entrar por ele).
2. Em **Settings → OAuth 2**, deixe ligada a opção **Allow public clients (Implicit Grant & PKCE)**.
3. Em **Permissions**, o app é do tipo **App folder**: os arquivos ficam na raiz da pasta do app (`/nucleo/…`, `/imagens/…`).

Sem o item 1, o Dropbox recusa o login com "redirect_uri mismatch".

O login alternativo "Entrar com código" não usa redirect URI: o Dropbox mostra um código que se cola no app. Serve para o iPhone, onde o retorno do Dropbox pode abrir no Safari em vez do app instalado (os dois guardam dados separados).

O token (refresh token, access token e validade) fica no IndexedDB, nunca no `localStorage`. Se o Dropbox revogar o acesso, o app continua abrindo e consultando o que já está no aparelho, e a próxima sincronização pede para entrar de novo, sem apagar dados locais.

## Estrutura

- `src/app/`: `App.tsx` (roteador) e `routes.tsx` (as telas).
- `src/dropbox/`: login do Dropbox.
  - `auth.ts`: `iniciarLogin`, `concluirLogin`, `iniciarLoginComCodigo`, `concluirLoginComCodigo`, `cliente()` (renova o access token), `estadoLogin()` (`sem-login`, `ativo` ou `expirado`) e `sair()`.
  - `tokenStore.ts`: token e login em andamento (`code_verifier` e `state`) no IndexedDB `iconodb-login`.
  - `retorno.ts`: trata o `?code=…&state=…` na abertura do app (a query, e não o hash, porque o app usa `HashRouter`).
- `src/telas/`: telas (por ora, `Entrar.tsx`).
- `src/ui/`: elementos de interface compartilhados.
  - `tokens.css`: cores, fontes e medidas. Telas de consulta têm fundo claro (padrão); item e imagem usam o tema escuro.
  - `useTema.ts`: `useTema("item")` vai no componente de cada tela de item e de imagem. Ele põe a classe `tema-item` em `<html>` enquanto a tela está montada, para o fundo escuro cobrir o `<body>` e a rolagem elástica do iOS. Telas de consulta não chamam nada. Para pintar só um contêiner, use a classe `tema-item` nele (ela define fundo e texto).
  - `Logo.tsx`: logo SKC na grade 19 × 11, só em escalas inteiras (1 a 4).
  - `Icon.tsx`: todos os glifos do design, um por conceito.
  - `IconButton.tsx`: botão de ícone, sem rótulo visível, com `aria-label`, dica ao passar o mouse e ao receber foco (`data-tip`) e `aria-keyshortcuts`.
  - `useBreakpoint.ts`: `"celular"` abaixo de 768 px, `"computador"` de 768 px em diante.

## Publicação

O fluxo `.github/workflows/pages.yml` roda `npm ci`, `npm test` e `npm run build` e publica `dist/` no GitHub Pages a cada push em `main`.
