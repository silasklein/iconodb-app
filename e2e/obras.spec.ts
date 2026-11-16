import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Parte 2C, bloco 3, Tarefa 10 no navegador de verdade, nos dois tamanhos, sobre o pacote sintético (TESTE): Bibliografia →
 * «Nova obra» → «Colar do Zotero» com um CSL TESTE → salvar → a obra aparece na Bibliografia, com a marca SKC. E a «quase
 * igual» a uma obra dos livros em destaque, com «É esta». Com SHOTS_DIR definido, guarda capturas.
 */
const semRolagemHorizontal = async (page: Page, tela: string) => {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}
async function foto(page: Page, nome: string, ver?: Locator | 'topo') {
  const pasta = process.env.SHOTS_DIR
  if (!pasta) return
  mkdirSync(pasta, { recursive: true })
  if (ver === 'topo') await page.evaluate(() => window.scrollTo(0, 0))
  else await ver?.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: join(pasta, `${process.env.SHOTS_PREFIX ?? ''}${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}
async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}
/** O alvo é grande o bastante: 44 px no toque, 36 com o mouse. */
async function alvoOk(el: Locator, celular: boolean, nome: string) {
  const caixa = (await el.boundingBox())!
  expect(Math.min(caixa.width, caixa.height), `alvo de ${nome}`).toBeGreaterThanOrEqual((celular ? 44 : 36) - 0.5)
}
const colar = (campo: Locator, texto: string) =>
  campo.evaluate((el, t) => {
    const dt = new DataTransfer()
    dt.setData('text', t)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, texto)

/** Um CSL JSON como o Zotero copia, inventado (TESTE), com campos de fora do formulário. */
const CSL_TESTE = JSON.stringify([
  {
    id: 'http://zotero.org/users/0/items/TESTE',
    type: 'book',
    title: 'Selos inventados do vale de teste',
    author: [
      { family: 'Probe', given: 'Ana' },
      { family: 'Exemplo', given: 'Bruno' },
    ],
    issued: { 'date-parts': [[2015, 3]] },
    publisher: 'Editora Imaginária',
    'publisher-place': 'Cidade Fictícia',
    ISBN: '000-0-00-000000-0',
    language: 'pt',
    URL: 'https://exemplo.invalid/teste',
  },
])

test('Bibliografia → «Nova obra» → colar um CSL TESTE → salvar → a obra aparece na Bibliografia', async ({ page }) => {
  const celular = (page.viewportSize()?.width ?? 0) < 768
  await entrar(page)
  await page.goto('#/bibliografia')
  await expect(page.getByRole('heading', { level: 1, name: 'Bibliografia' })).toBeVisible()
  const nova = page.getByRole('link', { name: 'Nova obra' })
  await alvoOk(nova, celular, 'o botão Nova obra')
  await foto(page, 'obra-0-bibliografia-com-nova-obra', 'topo')
  await nova.click()
  await expect(page.getByRole('heading', { level: 1, name: /^Nova obra/ })).toBeVisible()
  await semRolagemHorizontal(page, 'a Nova obra vazia')
  await foto(page, 'obra-1-nova-obra-vazia', 'topo')

  const botaoColar = page.getByRole('button', { name: 'Colar do Zotero' })
  await alvoOk(botaoColar, celular, 'Colar do Zotero')
  await botaoColar.click()
  const caixa = page.getByRole('textbox', { name: 'Cole aqui o que o Zotero copiou' })
  await expect(caixa).toBeFocused()
  await foto(page, 'obra-2-colar-do-zotero', caixa)
  await colar(caixa, CSL_TESTE)

  await expect(page.getByRole('radio', { name: 'Livro' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('textbox', { name: /^Autores/ })).toHaveValue('Probe, Ana\nExemplo, Bruno')
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Selos inventados do vale de teste')
  await expect(page.getByRole('textbox', { name: 'Citação curta' })).toHaveValue('Probe/Exemplo 2015')
  const lido = page.getByRole('status', { name: 'Lido do Zotero' })
  await expect(lido).toContainText('Preenchido do CSL JSON')
  await expect(lido).toContainText('fora do formulário: ISBN, language, URL')
  const previa = page.getByTestId('previa')
  await expect(previa).toHaveText('Probe, Ana, and Bruno Exemplo. 2015. Selos inventados do vale de teste. Editora Imaginária.')
  await expect(previa.locator('i')).toHaveText('Selos inventados do vale de teste')
  await semRolagemHorizontal(page, 'a Nova obra preenchida')
  await foto(page, 'obra-3-preenchida', 'topo')
  await foto(page, 'obra-3-preenchida-previa', previa)

  // recarregar no meio não perde nada: o rascunho volta (fix round 1, R1)
  await page.reload()
  await expect(page.getByRole('status', { name: 'Rascunho recuperado' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Selos inventados do vale de teste')
  await expect(page.getByTestId('previa')).toHaveText('Probe, Ana, and Bruno Exemplo. 2015. Selos inventados do vale de teste. Editora Imaginária.')
  await foto(page, 'obra-3b-rascunho-recuperado', 'topo')

  const salvar = page.getByRole('button', { name: 'Salvar a obra' })
  await alvoOk(salvar, celular, 'Salvar a obra')
  await salvar.click()
  await expect(page).toHaveURL(/#\/obra\/BIB-[a-z0-9]{8}-[0-9]+$/)
  await expect(page.getByRole('heading', { level: celular ? 1 : 2, name: 'Probe/Exemplo 2015' })).toBeVisible()
  await expect(page.getByText('Obra do SKC')).toBeVisible()
  await semRolagemHorizontal(page, 'a página da obra nova')
  await foto(page, 'obra-4-obra-salva', 'topo')

  // na Bibliografia, com a marca SKC
  await page.goto('#/bibliografia')
  const linha = page.locator('a.lista-linha').filter({ hasText: 'Probe/Exemplo 2015' })
  await expect(linha).toContainText('SKC')
  await expect(linha).toContainText('Selos inventados do vale de teste')
  // a obra publicada (BIB-900090) aparece uma vez só
  await expect(page.locator('a.lista-linha').filter({ hasText: 'Imaginária 2010' })).toHaveCount(1)
  await semRolagemHorizontal(page, 'a Bibliografia com a obra nova')
  await foto(page, 'obra-5-bibliografia-com-a-obra', linha)
})

test('a «quase igual» a uma obra dos livros aparece em destaque, com «É esta»', async ({ page }) => {
  const celular = (page.viewportSize()?.width ?? 0) < 768
  await entrar(page)
  await page.goto('#/obra/nova')
  await page.getByRole('radio', { name: 'Livro' }).click()
  await page.getByRole('textbox', { name: /^Autores/ }).fill('Autor, Fulano Teste')
  await page.getByRole('textbox', { name: 'Ano' }).fill('1999')
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Achados de teste no vale de prova')
  const quase = page.getByRole('region', { name: 'Quase igual a uma obra que já existe' })
  await expect(quase).toBeVisible()
  const eEsta = quase.getByRole('button', { name: 'É esta: Autor 1999' })
  await alvoOk(eEsta, celular, 'É esta')
  await semRolagemHorizontal(page, 'a quase igual')
  await foto(page, 'obra-6-quase-igual', quase)
  await eEsta.click()
  await expect(page).toHaveURL(/#\/obra\/BIB-900001$/)
})
