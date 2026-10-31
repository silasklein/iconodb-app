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

O app é publicado em `https://silasklein.github.io/iconodb-app/`. O `base` do Vite é `/iconodb-app/` e as rotas usam `HashRouter`, porque o GitHub Pages não reescreve caminhos.

## Estrutura

- `src/app/`: `App.tsx` (roteador) e `routes.tsx` (as telas).
- `src/ui/`: elementos de interface compartilhados.
  - `tokens.css`: cores, fontes e medidas. Telas de consulta têm fundo claro; item e imagem usam a classe `tema-item`.
  - `Logo.tsx`: logo SKC na grade 19 × 11, só em escalas inteiras (1 a 4).
  - `Icon.tsx`: todos os glifos do design, um por conceito.
  - `IconButton.tsx`: botão de ícone, sem rótulo visível, com `aria-label`, dica ao passar o mouse e ao receber foco (`data-tip`) e `aria-keyshortcuts`.
  - `useBreakpoint.ts`: `"celular"` abaixo de 768 px, `"computador"` de 768 px em diante.

## Publicação

O fluxo `.github/workflows/pages.yml` roda `npm ci`, `npm test` e `npm run build` e publica `dist/` no GitHub Pages a cada push em `main`.
