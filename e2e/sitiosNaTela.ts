import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Locator, type Page } from '@playwright/test'

/**
 * O que os specs do bloco Sítios (Parte 2C, bloco 2) usam em comum: entrar, o tamanho dos alvos (44 px no toque, 36 com o
 * mouse), a falta de rolagem horizontal, o título do sítio (h1 na página do celular, h2 no painel do computador) e as capturas
 * (com SHOTS_DIR definido; SHOTS_PREFIX opcional).
 */
export const celular = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

export async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}

export async function alvoOk(el: Locator, page: Page, nome: string) {
  const caixa = (await el.boundingBox())!
  expect(Math.min(caixa.width, caixa.height), `alvo de ${nome}`).toBeGreaterThanOrEqual((celular(page) ? 44 : 36) - 0.5)
}

export async function semRolagemHorizontal(page: Page, tela: string) {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}

export async function foto(page: Page, nome: string, ver?: Locator | 'topo') {
  const pasta = process.env.SHOTS_DIR
  if (!pasta) return
  mkdirSync(pasta, { recursive: true })
  if (ver === 'topo') await page.evaluate(() => window.scrollTo(0, 0))
  else await ver?.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: join(pasta, `${process.env.SHOTS_PREFIX ?? ''}${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}

/** O título do sítio: h1 na página (celular), h2 no painel à direita da lista (computador). */
export const tituloDoSitio = (page: Page, nome: string) => page.getByRole('heading', { level: celular(page) ? 1 : 2, name: nome, exact: true })

/** O código sob o título: «TESTE-2 · 3 objetos, 1 nas partes». */
export const codigoDoSitio = (page: Page) => page.locator('.detalhe-codigo')

/** Abre a página de um sítio e espera o título. */
export async function abrirSitio(page: Page, id: string, nome: string) {
  await page.goto(`#/sitio/${id}`)
  await expect(tituloDoSitio(page, nome)).toBeVisible()
}
