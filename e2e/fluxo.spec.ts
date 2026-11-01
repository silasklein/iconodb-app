import type { Page } from '@playwright/test'
import { baseDoEndereco, enderecoPublicado } from '../src/app/endereco.ts'
import { expect, test } from './fixtures'

const BASE = baseDoEndereco(enderecoPublicado(process.env.VITE_ENDERECO))

const celular = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

/** Sem rolagem horizontal na tela em que o teste está (375 × 812 e 1280 × 800). */
async function semRolagemHorizontal(page: Page, tela: string) {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}

/** A imagem está desenhada (carregou de verdade), não só presente no DOM. */
async function imagemCarregou(page: Page, nome: string | RegExp) {
  const img = page.getByRole('img', { name: nome }).first()
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
}

/**
 * "Voltar à busca" / "Voltar ao grupo": no celular é o botão Voltar do topo; no computador (768 px em diante),
 * a origem no cabeçalho de posição ("Posição na busca" ou "Posição no grupo").
 */
async function voltarParaOrigem(page: Page, origem: 'busca' | 'grupo') {
  const celular = (page.viewportSize()?.width ?? 0) < 768
  if (celular) await page.getByRole('link', { name: origem === 'busca' ? 'Voltar à busca' : 'Voltar ao grupo' }).click()
  else await page.getByRole('navigation', { name: origem === 'busca' ? 'Posição na busca' : 'Posição no grupo' }).locator('.item-posicao-rotulo').click()
}

test('entrar, preparar, consultar e, sem internet, abrir de novo', async ({ page, context, dropbox }) => {
  // Arquivos do sqlite-wasm que ficam fora do precache (vite.config.ts): o app nunca pode pedi-los.
  const naoUsados: string[] = []
  context.on('request', (r) => {
    if (/sqlite3-worker1|opfs-async-proxy/.test(r.url())) naoUsados.push(r.url())
  })

  // O que o app faz sem pacote: manda para a entrada.
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'IconoDB', level: 1 })).toBeVisible()
  await semRolagemHorizontal(page, 'Entrar')

  // Entrar: o Dropbox simulado devolve o código direto; o app troca pelo token e começa a preparar.
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await expect(page.getByRole('heading', { name: 'Preparando este aparelho' })).toBeVisible()
  await semRolagemHorizontal(page, 'Preparando')
  expect(dropbox.autorizacoes).toBe(1)

  // Preparar: o primeiro download termina e o app abre no Início.
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'O que há no banco' })).toContainText('Objetos')
  await semRolagemHorizontal(page, 'Início')
  // O service worker precisa estar ativo para o app abrir sem internet depois.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))

  // Buscar "mahras" (acha "Maḥraṣ Teste") e abrir o item.
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('mahras')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/busca\?q=mahras/)
  const resultados = page.getByRole('region', { name: 'Resultados' })
  await expect(resultados.getByRole('link', { name: /CA00002/ })).toBeVisible()
  await semRolagemHorizontal(page, 'Busca')
  await resultados.getByRole('link', { name: /CA00002/ }).click()
  await expect(page.getByTestId('item-cabeca')).toContainText('CA00002')
  await semRolagemHorizontal(page, 'Item')
  // No toque, "Voltar à busca" da faixa de posição é um alvo de 44 px de altura (não só a linha do texto).
  if (celular(page)) {
    const caixa = await page.locator('.item-posicao-rotulo').boundingBox()
    expect(caixa?.height ?? 0, 'altura do alvo "Voltar à busca"').toBeGreaterThanOrEqual(44)
  }

  // Abrir uma hipótese pela âncora do texto; ela abre na folha (celular) ou no painel (computador).
  await page.locator('[data-hipotese="HY-900003"]').first().click()
  const painel = page.getByRole('dialog', { name: 'Hipótese leão-de-teste' })
  await expect(painel).toBeVisible()
  await semRolagemHorizontal(page, 'Hipótese')
  await page.keyboard.press('Escape')
  await expect(painel).toBeHidden()

  // Voltar à busca: de volta à lista, com a consulta.
  await voltarParaOrigem(page, 'busca')
  await expect(page).toHaveURL(/#\/busca\?q=mahras/)
  await expect(resultados.getByRole('link', { name: /CA00001/ })).toBeVisible()

  // Um item com duas imagens: a primeira é vista (e fica guardada no aparelho); a segunda, não.
  await resultados.getByRole('link', { name: /CA00001/ }).click()
  await expect(page.getByTestId('item-cabeca')).toContainText('CA00001')
  await imagemCarregou(page, /^Imagem 1 de CA00001/)
  await semRolagemHorizontal(page, 'Item com imagem')

  // Um grupo da obra, um item dele e o Voltar ao grupo.
  await page.goto('#/colecoes')
  await semRolagemHorizontal(page, 'Coleções')
  await page.getByRole('navigation', { name: 'Obras' }).getByRole('link', { name: /TESTE/ }).click()
  await semRolagemHorizontal(page, 'Coleções de uma obra')
  await page.locator('a.colecoes-grupo').first().click()
  const grade = page.getByRole('region', { name: 'Objetos do grupo' })
  await expect(grade.getByRole('link', { name: /CA0000/ }).first()).toBeVisible()
  await semRolagemHorizontal(page, 'Grupo')
  await grade.getByRole('link', { name: /CA0000/ }).first().click()
  await expect(page.getByTestId('item-cabeca')).toContainText('CA0000')
  await voltarParaOrigem(page, 'grupo')
  await expect(page.getByRole('region', { name: 'Objetos do grupo' })).toBeVisible()

  // Computador: em Glossário, Bibliografia e Sítios só os dois painéis rolam, nunca a página,
  // mesmo com listas e detalhes bem mais longos que a tela.
  if (!celular(page)) {
    for (const tela of ['#/glossario', '#/bibliografia', '#/sitios']) {
      await page.goto(tela)
      await expect(page.locator('.lista-rolagem')).toBeVisible()
      const medida = await page.evaluate(() => {
        for (const seletor of ['.lista-rolagem', '.lista-principal']) {
          const longo = document.createElement('div')
          longo.style.height = '4000px'
          document.querySelector(seletor)!.append(longo)
        }
        const rolagem = document.querySelector('.lista-rolagem')!
        return { pagina: document.documentElement.scrollHeight, janela: window.innerHeight, lista: rolagem.scrollHeight - rolagem.clientHeight }
      })
      expect(medida.pagina, `a página de ${tela} rola além dos painéis`).toBeLessThanOrEqual(medida.janela)
      expect(medida.lista, `a lista de ${tela} rola sozinha`).toBeGreaterThan(0)
    }
  }

  // Foco 2: sem internet, o app abre direto no Início, a busca funciona e a imagem já vista aparece.
  const baixadosComRede = dropbox.baixados.length
  await context.setOffline(true)
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
  await semRolagemHorizontal(page, 'Início offline')
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('mahras')
  await page.keyboard.press('Enter')
  await expect(resultados.getByRole('link', { name: /CA00001/ })).toBeVisible()
  await semRolagemHorizontal(page, 'Busca offline')
  await resultados.getByRole('link', { name: /CA00001/ }).click()
  await imagemCarregou(page, /^Imagem 1 de CA00001/)
  await semRolagemHorizontal(page, 'Item offline')

  // Uma imagem nunca vista mostra o marcador, sem quebrar.
  await page.getByRole('button', { name: 'Imagem seguinte' }).click()
  await expect(page.getByText('Imagem disponível quando houver internet')).toBeVisible()
  await semRolagemHorizontal(page, 'Item com imagem indisponível')

  // Sem internet o app não tentou o Dropbox: nenhum download novo desde que a rede caiu.
  expect(dropbox.baixados.length).toBe(baixadosComRede)

  // O service worker guarda só o app (shell, worker, .wasm, fontes): nada do Dropbox.
  const caches = await page.evaluate(async () => {
    const saida: Record<string, string[]> = {}
    for (const nome of await globalThis.caches.keys()) saida[nome] = (await (await globalThis.caches.open(nome)).keys()).map((r) => new URL(r.url).pathname)
    return saida
  })
  const todos = Object.values(caches).flat()
  expect(Object.keys(caches).sort()).toEqual(['iconodb-imagens', expect.stringMatching(/^workbox-precache/)])
  expect(todos.filter((u) => /dropbox/i.test(u))).toEqual([])
  expect(todos.some((u) => u.endsWith('.wasm'))).toBe(true)
  expect(todos.some((u) => /\/assets\/worker-.*\.js$/.test(u))).toBe(true)
  expect(todos.filter((u) => /sqlite3-worker1|opfs-async-proxy/.test(u))).toEqual([])
  expect(naoUsados, 'arquivos do sqlite-wasm fora do precache que foram pedidos').toEqual([])
})

test('o manifesto, os ícones e as metas de instalação', async ({ page }) => {
  await page.goto('./')
  // A Content-Security-Policy vem no próprio index.html publicado (o GitHub Pages não deixa pôr cabeçalhos).
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /^default-src 'none'; script-src 'self' 'wasm-unsafe-eval';/)
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  const manifesto = await (await page.request.get(new URL(href!, page.url()).toString())).json()
  expect(manifesto).toMatchObject({
    name: 'IconoDB',
    short_name: 'IconoDB',
    lang: 'pt-BR',
    theme_color: '#111111',
    background_color: '#FFFFFF',
    display: 'standalone',
    id: BASE,
    start_url: BASE,
    scope: BASE,
  })
  const icones = manifesto.icons as { src: string; sizes: string; purpose: string }[]
  expect(icones.map((i) => `${i.sizes} ${i.purpose}`).sort()).toEqual(['192x192 any', '512x512 any', '512x512 maskable'])
  for (const i of icones) expect((await page.request.get(new URL(i.src, page.url()).toString())).ok(), i.src).toBe(true)
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
  expect((await page.request.get(new URL(apple!, page.url()).toString())).ok()).toBe(true)
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'IconoDB')
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/)
})
