import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { escreverNota } from './notasNaTela'

/**
 * Decisão 40 no navegador de verdade, nos dois tamanhos, sobre o pacote sintético (TESTE): uma nota com
 * "TESTE I: 1-3, 5" mostra cada número como link e o intervalo com travessão curto; o intervalo abre a folha (celular)
 * ou o diálogo (computador) com os objetos; Esc fecha e devolve o foco; um objeto aberto pela folha lista a nota em
 * "SKC notas" ("em BA00002"). Com SHOTS_DIR definido, guarda capturas.
 */
const semRolagemHorizontal = async (page: Page, tela: string) => {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}
async function foto(page: Page, nome: string, ver?: Locator) {
  const pasta = process.env.SHOTS_DIR
  if (!pasta) return
  mkdirSync(pasta, { recursive: true })
  await ver?.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: join(pasta, `${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}

test('uma citação com intervalo numa nota: links, a folha do intervalo, abrir um objeto e achar a nota nele', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()

  // 1. A nota, escrita em texto puro (sem [[ ]]), num objeto.
  await page.goto('#/item/BA00002')
  await escreverNota(page, 'Série parecida: TESTE I: 1-3, 5.')
  const voz = page.getByRole('region', { name: 'Leituras' }).getByRole('group', { name: 'SKC notas' })
  const nota = voz.getByRole('article').filter({ hasText: 'Série parecida' })
  // 2. A leitura: o hífen aparece como travessão curto; cada número é link, o intervalo abre a lista.
  await expect(nota).toContainText('Série parecida: TESTE I: 1–3, 5.')
  const cinco = nota.getByRole('link', { name: 'TESTE I: 5 (BA00001)' })
  await expect(cinco).toHaveAttribute('href', /#\/item\/BA00001$/)
  const intervalo = nota.getByRole('button', { name: 'TESTE I: 1–3, lista dos objetos' })
  await expect(intervalo).toHaveText('1–3')
  await semRolagemHorizontal(page, 'a nota com a citação')
  await foto(page, 'citacao-1-nota', nota)

  // 3. A folha do intervalo: os três objetos, Comparar ainda não; Esc fecha e o foco volta ao intervalo.
  await intervalo.click()
  const folha = page.getByRole('dialog', { name: 'TESTE I: 1–3' })
  await expect(folha).toBeVisible()
  const objetos = folha.getByRole('link')
  await expect(objetos).toHaveCount(3)
  await expect(objetos.nth(0)).toContainText('CA00001')
  await expect(folha.getByRole('button', { name: 'Comparar todos' })).toBeVisible()
  await expect(folha).toBeInViewport()
  await foto(page, 'citacao-2-folha')
  await page.keyboard.press('ArrowDown')
  await expect(objetos.nth(0)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(objetos.nth(1)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(folha).toHaveCount(0)
  await expect(intervalo).toBeFocused()
  // A página volta a rolar.
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('')

  // 4. Abrir um objeto do meio do intervalo pela folha: a nota está em "SKC notas" dele, dizendo de onde vem.
  await intervalo.click()
  await folha.getByRole('link', { name: /CA00002/ }).click()
  await expect(page).toHaveURL(/#\/item\/CA00002$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const citada = page.getByRole('region', { name: 'Leituras' }).getByRole('group', { name: 'SKC notas' }).getByRole('article').filter({ hasText: 'Série parecida' })
  await expect(citada).toHaveCount(1)
  await expect(citada.getByRole('link', { name: /^em BA00002/ })).toHaveAttribute('href', /#\/item\/BA00002$/)
  await semRolagemHorizontal(page, 'o objeto citado')
  await foto(page, 'citacao-3-citado-em', citada)

  // 5. O número solto também leva ao objeto.
  await page.goBack()
  await page.getByRole('region', { name: 'Leituras' }).getByRole('link', { name: 'TESTE I: 5 (BA00001)' }).click()
  await expect(page).toHaveURL(/#\/item\/BA00001$/)
})
