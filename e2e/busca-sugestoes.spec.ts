import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Busca com sugestões e buscas recentes (decisão 32), no navegador de verdade (worker, sqlite-wasm, IndexedDB,
 * localStorage): o Início e a barra superior, no celular (toque) e no computador (teclado). Um objeto e uma coleção
 * do usuário (eventos de outro aparelho no IndexedDB) entram nas sugestões com a marca SKC.
 * Com SHOTS_DIR definido, guarda as capturas dos dois estados: (a) digitando e (b) campo vazio em foco.
 */
const AP = 'e2eaaaaa'
let seq = 0
const evento = (tipo: string, reg: string, campos: Record<string, unknown>) => {
  seq++
  return {
    id: `${AP}-${seq}-0`,
    aparelho: AP,
    seq,
    n: 0,
    enviado: 1,
    evento: { v: 1, id: `${AP}-${seq}-0`, hlc: `${String(1_790_000_000_000 + seq * 1000)}-0000-${AP}`, aparelho: AP, tipo, reg, op: 'criar', campos },
  }
}

const celular = (page: Page) => (page.viewportSize()?.width ?? 0) < 768
const campo = (page: Page) => page.getByRole('combobox', { name: 'Buscar' })

async function semRolagemHorizontal(page: Page) {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll).toBeLessThanOrEqual(janela)
}

async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}

async function gravarEventos(page: Page, linhas: ReturnType<typeof evento>[]) {
  await page.evaluate(
    (rows) =>
      new Promise<void>((ok, falha) => {
        const abrir = indexedDB.open('iconodb-usuario')
        abrir.onerror = () => falha(abrir.error)
        abrir.onsuccess = () => {
          const db = abrir.result
          const tx = db.transaction('eventos', 'readwrite')
          for (const r of rows) tx.objectStore('eventos').put(r)
          tx.oncomplete = () => {
            db.close()
            ok()
          }
          tx.onerror = () => falha(tx.error)
        }
      }),
    linhas,
  )
}

test('sugestões por categoria, teclado e toque, e as buscas recentes', async ({ page }) => {
  await entrar(page)
  await gravarEventos(page, [
    evento('objeto', 'OB-e2eaaaaa-1', { numero: 'CA00005', titulo: 'Escaraveu leonino.', obraRotulo: 'Autor 1999', figura: '3' }),
    evento('colecao', 'CO-e2eaaaaa-1', { nome: 'Leões do meu estudo', membros: ['CA00001'] }),
  ])
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()

  const pasta = process.env.SHOTS_DIR
  const largura = page.viewportSize()?.width ?? 0
  const foto = async (nome: string) => {
    if (!pasta) return
    mkdirSync(pasta, { recursive: true })
    await page.screenshot({ path: join(pasta, `${nome}-${largura}${process.env.SHOTS_SUFFIX ?? ''}.png`) })
  }

  // O Início é o campo grande (computador) ou o da página (celular). Sem recentes, o campo vazio em foco não abre nada.
  await campo(page).click()
  await expect(page.getByRole('listbox')).toHaveCount(0)

  // (a) Digitando: as categorias, o negrito, a miniatura, a marca SKC.
  await campo(page).fill('le')
  const lista = page.getByRole('listbox', { name: 'Sugestões para «le»' })
  await expect(lista).toBeVisible()
  await expect(lista.getByRole('group', { name: 'Verbetes' })).toBeVisible()
  const objetos = lista.getByRole('group', { name: 'Objetos' })
  await expect(objetos.getByRole('option', { name: /CA00001/ })).toContainText('Pingente com leão-de-teste')
  await expect(objetos.getByRole('option', { name: /CA00005/ })).toContainText('SKC')
  await expect(lista.getByRole('group', { name: 'Coleções' }).getByRole('option', { name: /Leões do meu estudo/ })).toContainText('SKC')
  // a miniatura do objeto do pacote carrega de verdade
  const img = objetos.getByRole('option', { name: /CA00001/ }).locator('img')
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(lista.locator('.forte').first()).toHaveCSS('font-weight', '600')
  await semRolagemHorizontal(page)

  // A lista cabe na janela e as linhas têm o alvo mínimo (44 px no toque, 40 no mouse).
  const janela = page.viewportSize()!
  const caixa = (await page.locator('.sugestoes').boundingBox())!
  expect(caixa.x).toBeGreaterThanOrEqual(0)
  expect(caixa.x + caixa.width).toBeLessThanOrEqual(janela.width)
  expect(caixa.y + Math.min(caixa.height, 120)).toBeLessThanOrEqual(janela.height)
  const minimo = celular(page) ? 44 : 40
  for (const o of await lista.getByRole('option').all()) expect((await o.boundingBox())!.height).toBeGreaterThanOrEqual(minimo - 0.5)
  await foto('sug-a-digitando')

  // Teclado: ↓ marca a primeira opção (aria-activedescendant); Esc fecha a lista e o texto fica.
  await campo(page).press('ArrowDown')
  const primeira = lista.getByRole('option').first()
  await expect(primeira).toHaveAttribute('aria-selected', 'true')
  await expect(campo(page)).toHaveAttribute('aria-activedescendant', (await primeira.getAttribute('id'))!)
  await campo(page).press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(campo(page)).toHaveValue('le')

  // Tocar (clicar) numa sugestão vai direto ao destino e a põe nas recentes.
  await campo(page).fill('lea')
  await page.getByRole('listbox').getByRole('option', { name: /^leão-de-teste/ }).click()
  await expect(page).toHaveURL(/#\/verbete\/GL-900001/)
  const recentes = await page.evaluate(() => JSON.parse(localStorage.getItem('iconodb:buscas-recentes') ?? '[]'))
  expect(recentes).toEqual(['leão-de-teste'])

  // Enter sem seleção vai aos resultados e guarda a busca; a segunda busca já tem recentes para mostrar.
  await page.goto('#/')
  await campo(page).fill('mahtes')
  await campo(page).press('Enter')
  await expect(page).toHaveURL(/#\/busca\?q=mahtes/)
  // O endereço muda ANTES de a tela da Busca aparecer (a navegação é uma transição do React: enquanto ela não termina,
  // o Início fica na tela, com «mahtes» no campo e o foco nele). Ir ao Início nesse intervalo cancela a transição e o
  // MESMO Início continua montado, com o texto digitado: o campo não fica vazio e as recentes não aparecem (a falha
  // intermitente no computador). Esperar a tela da Busca, e depois um Início novo, com o campo vazio.
  await expect(page.locator('h1')).toHaveText('Busca')
  await page.evaluate(() => localStorage.setItem('iconodb:buscas-recentes', JSON.stringify(['mahtes', 'leão-de-teste', 'CA00001', 'tell', 'Autor'])))

  // (b) Campo vazio em foco: as buscas recentes (só neste aparelho).
  await page.goto('#/')
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
  await expect(campo(page)).toHaveValue('')
  await campo(page).click()
  const recentesLista = page.getByRole('listbox', { name: 'Buscas recentes' })
  await expect(recentesLista.getByRole('option')).toHaveCount(5)
  // O aviso de que ficam só neste aparelho: a nota no celular, o rodapé de teclas no computador.
  await expect(celular(page) ? page.locator('.recentes-nota') : page.locator('.sugestoes-rodape')).toContainText(/só neste aparelho/i)
  await semRolagemHorizontal(page)
  await foto('sug-b-recentes')
  // × remove uma; Limpar remove todas
  await page.getByRole('button', { name: 'Remover «tell» das buscas recentes' }).click()
  await expect(recentesLista.getByRole('option')).toHaveCount(4)
  await recentesLista.getByRole('option', { name: 'CA00001' }).click()
  await expect(page).toHaveURL(/#\/busca\?q=CA00001/)
  // As mesmas esperas de antes: a tela da Busca, e depois um Início novo, com o campo vazio (veja acima).
  await expect(page.locator('h1')).toHaveText('Busca')
  await page.goto('#/')
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
  await expect(campo(page)).toHaveValue('')
  await campo(page).click()
  await expect(page.getByRole('listbox', { name: 'Buscas recentes' }).getByRole('option')).toHaveCount(4)
  await page.getByRole('button', { name: 'Limpar' }).click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('iconodb:buscas-recentes') ?? 'null'))).toEqual([])
})

test('na barra superior (computador) e na Busca (celular), a lista sai por cima sem mexer no resultado', async ({ page }) => {
  await entrar(page)
  await page.evaluate(() => localStorage.setItem('iconodb:buscas-recentes', JSON.stringify(['mahtes', 'leão-de-teste', 'CA00001', 'tell', 'Autor'])))
  const pasta = process.env.SHOTS_DIR
  const largura = page.viewportSize()?.width ?? 0
  const foto = async (nome: string) => {
    if (!pasta) return
    mkdirSync(pasta, { recursive: true })
    await page.screenshot({ path: join(pasta, `${nome}-${largura}${process.env.SHOTS_SUFFIX ?? ''}.png`) })
  }

  await page.goto('#/busca?q=mahtes')
  const resultados = page.getByRole('region', { name: 'Resultados' })
  await expect(resultados.getByRole('link', { name: /CA00002/ })).toBeVisible()
  const antes = (await resultados.boundingBox())!

  // (b) o campo (o da barra no computador, o da página no celular) vazio em foco: as recentes por cima do resultado
  await campo(page).fill('')
  await campo(page).click()
  await expect(page.getByRole('listbox', { name: 'Buscas recentes' })).toBeVisible()
  await foto('busca-sug-b-recentes')
  await campo(page).press('Escape')

  // (a) digitando: o resultado atualiza (a URL acompanha) e a lista aparece sem empurrá-lo
  await campo(page).fill('tell')
  await expect(page).toHaveURL(/#\/busca\?q=tell/)
  const lista = page.getByRole('listbox', { name: 'Sugestões para «tell»' })
  await expect(lista).toBeVisible()
  await expect(lista.getByRole('group', { name: 'Sítios' }).getByRole('option', { name: /Tell Probe Teste/ })).toBeVisible()
  await semRolagemHorizontal(page)
  const durante = (await resultados.boundingBox())!
  expect(durante.y).toBeCloseTo(antes.y, 0)
  await foto('busca-sug-a-digitando')

  // Clicar fora fecha
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await campo(page).click()
  await expect(lista).toBeVisible()
  await campo(page).press('ArrowDown')
  await campo(page).press('ArrowDown')
  await campo(page).press('ArrowDown')
  await campo(page).press('Enter')
  await expect(page).toHaveURL(/#\/(verbete|sitio|item|obra)\//)
})

test('celular com o teclado aberto: o campo sobe ao topo e a lista rola até "Ver todos"', async ({ page }) => {
  test.skip(!celular(page), 'o teclado do celular')
  await entrar(page)
  await page.evaluate(() => localStorage.setItem('iconodb:buscas-recentes', JSON.stringify(['mahtes', 'leão-de-teste', 'CA00001', 'tell', 'Autor'])))
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
  const janela = page.viewportSize()!
  const teclado = 336 // um teclado de iPhone: a parte visível (visualViewport) encolhe, a página não
  const visivel = janela.height - teclado
  const foto = async (nome: string) => {
    const pasta = process.env.SHOTS_DIR
    if (!pasta) return
    mkdirSync(pasta, { recursive: true })
    await page.screenshot({ path: join(pasta, `${nome}-${janela.width}${process.env.SHOTS_SUFFIX ?? ''}.png`) })
  }

  // O campo do Início fica abaixo do título; ao focar o teclado abre (a janela visível encolhe) e a lista abre.
  expect((await campo(page).boundingBox())!.y).toBeGreaterThan(200)
  await campo(page).click()
  await page.setViewportSize({ width: janela.width, height: visivel })
  await expect(page.getByRole('listbox', { name: 'Buscas recentes' })).toBeVisible()
  await expect.poll(async () => (await campo(page).boundingBox())!.y).toBeLessThanOrEqual(120)

  // Digitando: a lista não passa da parte visível; "Ver todos" se alcança rolando a lista
  await campo(page).fill('le')
  const lista = page.getByRole('listbox', { name: 'Sugestões para «le»' })
  await expect(lista).toBeVisible()
  await expect.poll(async () => (await campo(page).boundingBox())!.y).toBeLessThanOrEqual(120)
  const campoCx = (await campo(page).boundingBox())!
  const caixaLista = (await lista.boundingBox())!
  expect(caixaLista.y).toBeGreaterThanOrEqual(campoCx.y + campoCx.height)
  expect(caixaLista.y + caixaLista.height).toBeLessThanOrEqual(visivel)
  await foto('sug-teclado-a')
  const todos = lista.getByRole('option', { name: /Ver todos os resultados/ })
  await todos.scrollIntoViewIfNeeded()
  const caixaTodos = (await todos.boundingBox())!
  expect(caixaTodos.y).toBeGreaterThanOrEqual(campoCx.y + campoCx.height)
  expect(caixaTodos.y + caixaTodos.height).toBeLessThanOrEqual(visivel)
  await foto('sug-teclado-b-ver-todos')
  await semRolagemHorizontal(page)
})
