import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Page, TestInfo } from '@playwright/test'
import type { DropboxSimulado } from './dropboxSimulado'
import { expect, test } from './fixtures'

/**
 * Tarefa 6c e o fix round 1, no navegador de verdade (computador): a Bibliografia com 5 000 obras sintéticas (o comum.sqlite
 * do pacote sintético com obras inventadas a mais, servido pelo Dropbox simulado) desenha uma janela de linhas.
 * - A obra do meio aberta a frio: a janela em volta dela, a linha marcada e à vista no painel.
 * - Rolando para cima, as linhas de cima se desenham e as da tela não pulam.
 * - Arrastar até o fim desenha no máximo um passo (1 000 linhas) por quadro.
 * Nada de livro real.
 */

const TOTAL = 5000

function pacoteComMuitasObras(dropbox: DropboxSimulado, info: TestInfo) {
  const raiz = join(import.meta.dirname, '..', 'tests', 'fixtures', 'pacote', 'nucleo')
  mkdirSync(info.outputPath(), { recursive: true })
  const copia = info.outputPath('comum.sqlite')
  copyFileSync(join(raiz, 'comum.sqlite'), copia)
  const db = new DatabaseSync(copia)
  db.exec(`
    WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${TOTAL})
    INSERT INTO bib_entry (id, csl_json, chicago, chicago_html, short_cites, origin)
    SELECT printf('BIB-T%05d', i),
      json_object('id', printf('BIB-T%05d', i), 'type', 'book', 'title', 'Obra sintética ' || i, 'author', json_array(json_object('family', 'Sintética'))),
      NULL, NULL, json_object('TESTE', json_array(printf('Sintética %04d', i))), 'TESTE I'
    FROM n`)
  db.close()
  const comum = readFileSync(copia)
  const manifesto = JSON.parse(readFileSync(join(raiz, 'manifest.json'), 'utf8')) as { arquivos: Record<string, { sha256: string; bytes: number }> }
  manifesto.arquivos['nucleo/comum.sqlite'] = { sha256: createHash('sha256').update(comum).digest('hex'), bytes: comum.length }
  dropbox.pacoteTrocado.set('nucleo/comum.sqlite', comum)
  dropbox.pacoteTrocado.set('nucleo/manifest.json', Buffer.from(JSON.stringify(manifesto)))
}

async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}

const painel = (page: Page) => page.getByRole('complementary', { name: 'Lista de obras' }).locator('.lista-rolagem')
const linhas = (page: Page) => painel(page).locator('a.obra-linha')
/** O número da obra sintética de uma linha (`BIB-T02500` → 2500); as do pacote antes delas valem 0. */
const numeroDe = (href: string | null) => Number(/BIB-T(\d+)/.exec(href ?? '')?.[1] ?? 0)
const quadros = (page: Page, n = 2) =>
  page.evaluate(
    (n) =>
      new Promise<void>((ok) => {
        const um = (k: number) => (k === 0 ? ok() : requestAnimationFrame(() => um(k - 1)))
        um(n)
      }),
    n,
  )

test.beforeEach(({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 768, 'a lista e a obra lado a lado: só no computador')
})

test('a obra do meio aberta a frio: a janela em volta dela; subindo, as de cima entram sem pular', async ({ page, dropbox }, info) => {
  pacoteComMuitasObras(dropbox, info)
  await entrar(page)
  await page.goto('#/obra/BIB-T02500')
  const atual = painel(page).locator('a[aria-current="page"]')
  await expect(atual).toHaveAttribute('href', /BIB-T02500/)
  await expect(page.getByText(`${(TOTAL + 5).toLocaleString('pt-BR')} obras · Chicago autor-data`)).toBeVisible()
  // a janela, não a lista toda; a linha marcada à vista no painel
  expect(await linhas(page).count()).toBeLessThanOrEqual(300)
  await expect(atual).toBeInViewport()

  // subir: a linha da tela fica onde a rolagem a põe, e as de cima se desenham
  const primeiraAntes = numeroDe(await linhas(page).first().getAttribute('href'))
  const antes = (await atual.boundingBox())!.y
  const subida = 4500
  await painel(page).evaluate((el, d) => (el.scrollTop -= d), subida)
  await quadros(page, 6)
  await expect.poll(async () => numeroDe(await linhas(page).first().getAttribute('href'))).toBeLessThan(primeiraAntes)
  await quadros(page, 4)
  const depois = (await atual.boundingBox())!.y
  expect(Math.abs(depois - (antes + subida))).toBeLessThanOrEqual(1)
})

test('arrastar a barra até o fim: no máximo 1 000 linhas a mais por quadro; rolando até o fim, chega-se à última', async ({ page, dropbox }, info) => {
  pacoteComMuitasObras(dropbox, info)
  await entrar(page)
  await page.goto('#/bibliografia')
  await expect(linhas(page).first()).toBeVisible()
  const comeco = await linhas(page).count()
  expect(comeco).toBeLessThanOrEqual(300)
  // mede a contagem a cada quadro, a partir da rolagem até o fim
  const contagens = await painel(page).evaluate(
    (el) =>
      new Promise<number[]>((ok) => {
        const vistas: number[] = []
        el.scrollTop = el.scrollHeight
        const medir = () => {
          vistas.push(el.querySelectorAll('a.obra-linha').length)
          if (vistas.length < 40) requestAnimationFrame(medir)
          else ok(vistas)
        }
        requestAnimationFrame(medir)
      }),
  )
  const saltos = contagens.map((c, i) => c - (i === 0 ? comeco : contagens[i - 1]!))
  expect(Math.max(...saltos)).toBeLessThanOrEqual(1000)
  // a altura das linhas de verdade difere da estimada: rolando até o fim de novo (End outra vez), chega-se à última
  await expect
    .poll(
      async () => {
        await painel(page).evaluate((el) => (el.scrollTop = el.scrollHeight))
        await quadros(page, 3)
        return linhas(page).count()
      },
      { timeout: 15_000 },
    )
    .toBe(TOTAL + 5)
  await expect(linhas(page).last()).toHaveAttribute('href', /BIB-T05000/)
})

test('voltando (POP) a uma obra com a lista rolada: a lista volta à mesma posição, com as mesmas linhas à vista', async ({ page, dropbox }, info) => {
  pacoteComMuitasObras(dropbox, info)
  await entrar(page)
  await page.goto('#/bibliografia')
  await expect(linhas(page).first()).toBeVisible()
  // rola a lista até umas 1 500 linhas abaixo (passo a passo, como quem rola) e abre uma obra à vista
  await expect
    .poll(
      async () => {
        await painel(page).evaluate((el) => (el.scrollTop += 6000))
        await quadros(page, 3)
        return painel(page).evaluate((el) => el.scrollTop)
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(80_000)
  const visivel = await painel(page).evaluate((el) => {
    const topo = el.getBoundingClientRect().top + 100
    const a = [...el.querySelectorAll<HTMLAnchorElement>('a.obra-linha')].find((x) => x.getBoundingClientRect().top >= topo)!
    return a.getAttribute('href')!
  })
  await painel(page).locator(`a[href="${visivel}"]`).click()
  await expect(page).toHaveURL(new RegExp(`${visivel.replace(/[?]/g, '\\?')}$`))
  // a obra aberta (o app já está nela, não só o endereço): a linha marcada e o detalhe com a referência
  await expect(painel(page).locator('a[aria-current="page"]')).toHaveAttribute('href', visivel)
  await expect(page.locator('.obra-chicago')).toContainText('Obra sintética')
  const rolagem = await painel(page).evaluate((el) => el.scrollTop)
  const ondeEstava = (await painel(page).locator(`a[href="${visivel}"]`).boundingBox())!.y

  // outra tela, e o Voltar do navegador
  await page.goto('#/glossario')
  await expect(page.getByRole('heading', { level: 1, name: 'Glossário' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`${visivel.replace(/[?]/g, '\\?')}$`))
  await expect.poll(() => painel(page).evaluate((el) => el.scrollTop)).toBe(rolagem)
  await quadros(page, 4)
  expect((await painel(page).locator(`a[href="${visivel}"]`).boundingBox())!.y).toBeCloseTo(ondeEstava, 0)
})
