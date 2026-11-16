import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Parte 2C, bloco 3, Tarefa 11 no navegador de verdade, nos dois tamanhos, sobre o pacote sintético (TESTE): Revisão →
 * uma citação não resolvida → «Nova obra com esta citação» → salvar → a citação (e a igual) some da fila → o objeto mostra a
 * obra, com «ligada por você», e o «‹ Revisão» volta ao caso. E «Ligar» pela busca, com o U que desfaz (no computador). Só
 * citações e obras inventadas. Com SHOTS_DIR definido, guarda capturas.
 */
const celular = (page: Page) => (page.viewportSize()?.width ?? 0) < 768
async function foto(page: Page, nome: string, ver?: Locator | 'topo') {
  const pasta = process.env.SHOTS_DIR
  if (!pasta) return
  mkdirSync(pasta, { recursive: true })
  if (ver === 'topo') await page.evaluate(() => window.scrollTo(0, 0))
  else await ver?.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: join(pasta, `${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}
async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}
async function alvoOk(el: Locator, toque: boolean, nome: string) {
  const caixa = (await el.boundingBox())!
  expect(Math.min(caixa.width, caixa.height), `alvo de ${nome}`).toBeGreaterThanOrEqual((toque ? 44 : 36) - 0.5)
}
const semRolagemHorizontal = async (page: Page, tela: string) => {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}
const total = async (page: Page) => Number(/^([\d.]+) casos?/.exec((await page.getByText(/ · o que o processamento não decidiu sozinho/).textContent()) ?? '')![1]!.replace('.', ''))
const citacoes = (page: Page) => page.getByRole('list', { name: 'Casos de Citações não resolvidas' })
/** O detalhe do caso: à direita no computador; a página do caso no celular. */
const detalhe = (page: Page) => (celular(page) ? page.locator('main') : page.getByRole('region', { name: 'O caso escolhido' }))

/** Abre o caso da citação pela lista (no computador, escolhe; no celular, abre a página do caso). */
async function abrirCaso(page: Page, texto: string) {
  await citacoes(page).getByRole('link', { name: new RegExp(`^${texto}`) }).click()
  await expect(page).toHaveURL(/[?&]caso=citacao_nao_resolvida/)
  await expect(detalhe(page).getByRole('heading', { level: 2, name: texto })).toBeVisible()
}

test('Revisão → citação → «Nova obra com esta citação» → salvar → a citação sai da fila → o objeto mostra a obra', async ({ page }) => {
  const toque = celular(page)
  await entrar(page)
  await page.goto('#/revisao?abrir=citacoes-nao-resolvidas')
  await expect(citacoes(page)).toContainText('Inventado 2001: 5')
  const antes = await total(page)
  await foto(page, 'revisao-citacao-1-lista', 'topo')
  await semRolagemHorizontal(page, 'a Revisão com as citações')

  await abrirCaso(page, 'Inventado 2001: 5')
  const d = detalhe(page)
  await expect(d.getByText('Citação não resolvida · 2 de 4')).toBeVisible()
  await expect(d.locator('mark')).toHaveText('Inventado 2001: 5')
  await expect(d.getByText('Nenhuma obra da Bibliografia tem este autor e este ano.')).toBeVisible()
  if (toque) await expect(page.getByRole('link', { name: 'Voltar à Revisão' })).toBeVisible()
  else await expect(citacoes(page).getByRole('link', { name: /^Inventado 2001: 5/ })).toHaveAttribute('aria-current', 'true')
  const nova = d.getByRole('link', { name: 'Nova obra com esta citação' })
  await alvoOk(nova, toque, 'Nova obra com esta citação')
  await alvoOk(d.getByRole('button', { name: 'Marcar como resolvida sem ligar' }), toque, 'Marcar como resolvida sem ligar')
  await semRolagemHorizontal(page, 'o detalhe da citação')
  await foto(page, 'revisao-citacao-2-detalhe', 'topo')

  // a Nova obra começa com a citação e volta ligada
  await nova.click()
  await expect(page.getByRole('heading', { level: 1, name: /^Nova obra/ })).toBeVisible()
  await expect(page.getByText('Ao salvar, a citação «Inventado 2001» passa a abrir esta obra, e as iguais também.')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Citação curta' })).toHaveValue('Inventado 2001')
  await page.getByRole('radio', { name: 'Livro' }).click()
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Selos inventados de teste')
  await foto(page, 'revisao-citacao-3-nova-obra', 'topo')
  await page.getByRole('button', { name: 'Salvar e ligar a citação' }).first().click()

  // de volta ao caso: ligado, fora da fila, e a igual também
  await expect(page).toHaveURL(/#\/revisao\?.*caso=citacao_nao_resolvida/)
  await expect(detalhe(page).getByText('Citação ligada por você')).toBeVisible()
  await expect(detalhe(page).getByRole('link', { name: 'Inventado 2001' })).toHaveAttribute('href', /#\/obra\/BIB-[a-z0-9]{8}-\d+$/)
  await foto(page, 'revisao-citacao-4-ligada', 'topo')
  // Tarefa 14 (N3 da Tarefa 11): a obra ligada abre com «‹ Revisão», que volta ao mesmo caso
  const doCaso = page.url()
  await detalhe(page).getByRole('link', { name: 'Inventado 2001' }).click()
  await expect(page).toHaveURL(/#\/obra\/BIB-[a-z0-9]{8}-\d+$/)
  await expect(page.getByRole('heading', { level: toque ? 1 : 2, name: 'Inventado 2001' })).toBeVisible()
  const aRevisao = page.getByRole('navigation', { name: 'Origem' }).getByRole('link', { name: 'Revisão', exact: true })
  await expect(aRevisao).toHaveText(/^‹\s*Revisão$/)
  await alvoOk(aRevisao, toque, '‹ Revisão na obra')
  await semRolagemHorizontal(page, 'a obra aberta da Revisão')
  await foto(page, 'revisao-citacao-4b-obra-com-volta', 'topo')
  await aRevisao.click()
  await expect(page).toHaveURL(doCaso)
  await expect(detalhe(page).getByText('Citação ligada por você')).toBeVisible()
  if (toque) await page.getByRole('link', { name: 'Voltar à Revisão' }).click()
  await expect(page.getByText(new RegExp(`^${antes - 2} casos · `))).toBeVisible()
  await expect(citacoes(page)).not.toContainText('Inventado 2001')
  await expect(page.getByText('2 citações ligadas por você a obras, fora da fila.')).toBeVisible()

  // o objeto: a referência abre a obra (também no texto), com a marca discreta
  await page.goto('#/item/CA00004')
  await page.getByRole('button', { name: /^Bibliografia/ }).click()
  const ref = page.locator('.bibliografia-item li').filter({ hasText: 'Inventado 2001: 5' })
  await expect(ref.getByRole('link', { name: 'Inventado 2001: 5' })).toHaveAttribute('href', /#\/obra\/BIB-[a-z0-9]{8}-\d+$/)
  await expect(ref.getByText('ligada por você')).toBeVisible()
  await expect(ref).toContainText('Selos inventados de teste')
  await expect(ref.getByRole('button', { name: 'Desligar esta citação: Inventado 2001: 5' })).toBeVisible()
  await foto(page, 'revisao-citacao-5-objeto', ref)
})

test('do detalhe, «Abrir o objeto» leva «‹ Revisão», que volta ao mesmo caso; «Ligar» liga as iguais e U desfaz', async ({ page }) => {
  const toque = celular(page)
  await entrar(page)
  await page.goto('#/revisao?abrir=citacoes-nao-resolvidas')
  await abrirCaso(page, 'Inventado 2001: 9')
  const casoUrl = page.url()
  await detalhe(page).getByRole('link', { name: 'Abrir o objeto BA00001' }).click()
  await expect(page).toHaveURL(/#\/item\/BA00001/)
  const volta = page.getByRole('navigation', { name: 'Origem' }).getByRole('link', { name: 'Revisão', exact: true })
  await expect(volta).toBeVisible()
  await volta.click()
  expect(page.url()).toBe(casoUrl)
  await expect(detalhe(page).getByRole('heading', { level: 2, name: 'Inventado 2001: 9' })).toBeVisible()

  // «Ligar» pela busca: as 2 iguais de uma vez
  const antes = await (toque ? Promise.resolve(0) : total(page))
  await detalhe(page).getByRole('searchbox', { name: 'Procurar por autor, ano ou título' }).fill('Autora 2004')
  const ligar = detalhe(page).getByRole('button', { name: /^Ligar as 2 citações “Inventado 2001”/ })
  await expect(ligar).toBeVisible()
  await alvoOk(ligar, toque, 'Ligar')
  await semRolagemHorizontal(page, 'a busca de obras do detalhe')
  await foto(page, 'revisao-citacao-6-ligar', ligar)
  await ligar.click()
  await expect(page.locator('.revisao-aviso')).toContainText('«Inventado 2001»: as 2 citações ligadas a «Autora 2004».')
  if (toque) await expect(page).not.toHaveURL(/caso=/) // volta à lista
  await expect(citacoes(page)).not.toContainText('Inventado 2001')
  await foto(page, 'revisao-citacao-7-ligada-aviso', 'topo')
  if (!toque) {
    expect(await total(page)).toBe(antes - 2)
    // o detalhe passou ao caso seguinte que continua na fila
    await expect(detalhe(page).getByRole('heading', { level: 2, name: '1999: 12' })).toBeFocused()
    await page.keyboard.press('u')
    await expect(citacoes(page)).toContainText('Inventado 2001: 9')
    await expect(detalhe(page).getByRole('heading', { level: 2, name: 'Inventado 2001: 9' })).toBeVisible()
    expect(await total(page)).toBe(antes)
  }
})

test('no computador, ↑ ↓ andam pela lista e Enter abre o caso no detalhe', async ({ page }) => {
  test.skip(celular(page), 'o teclado da lista e do detalhe é do computador')
  await entrar(page)
  await page.goto('#/revisao?abrir=citacoes-nao-resolvidas')
  const cabeca = page.getByRole('button', { name: /^Citações não resolvidas/ })
  await cabeca.focus()
  await page.keyboard.press('ArrowDown')
  await expect(citacoes(page).getByRole('link', { name: /^Fantasma 1888: 3/ })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(detalhe(page).getByRole('heading', { level: 2, name: 'Inventado 2001: 5' })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(detalhe(page).getByRole('heading', { level: 2, name: 'Inventado 2001: 5' })).toBeFocused()
  await foto(page, 'revisao-citacao-8-teclado', 'topo')
})
