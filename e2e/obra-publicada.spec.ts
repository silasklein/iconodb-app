import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Parte 2C, bloco 3, Tarefa 14 no navegador de verdade, nos dois tamanhos, sobre o pacote sintético (TESTE): a obra sua
 * `BIB-teste123-1`, criada noutro aparelho, foi publicada como `BIB-900090` («Imaginária 2010»). O endereço antigo vai para
 * a obra dos livros; a página dela tem «Esta obra veio de você», com «Excluir a sua obra» e «Restaurar»; e ela continua
 * editável, com a edição valendo depois de recarregar. Com SHOTS_DIR definido, guarda capturas.
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
async function alvoOk(el: Locator, toque: boolean, nome: string) {
  const caixa = (await el.boundingBox())!
  expect(Math.min(caixa.width, caixa.height), `alvo de ${nome}`).toBeGreaterThanOrEqual((toque ? 44 : 36) - 0.5)
}
async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}

/** O CSL que o pacote sintético publicou para o BIB-900090 (sem o `id`): o da obra de origem. */
const CSL = {
  type: 'book',
  author: [{ family: 'Imaginária', given: 'Cicrana' }],
  title: 'Selos sonhados no planalto fictício',
  'publisher-place': 'Cidade Fictícia',
  issued: { 'date-parts': [[2010]] },
  language: 'und',
}

test('a obra publicada que veio de você: o endereço antigo, o bloco com excluir e restaurar, e a edição', async ({ page, dropbox }) => {
  const celular = (page.viewportSize()?.width ?? 0) < 768
  const nivel = celular ? 1 : 2
  dropbox.usuarioReal = true
  // O aparelho que criou a obra que o pipeline publicou (BIB-teste123-1 → BIB-900090 no pacote sintético).
  const hlc = `${String(Date.now() - 60_000).padStart(13, '0')}-0000-teste123`
  const linha = { v: 1, id: 'teste123-1-0', hlc, aparelho: 'teste123', tipo: 'obra', reg: 'BIB-teste123-1', op: 'criar', campos: { csl: CSL, curta: 'Imaginária 2010' } }
  dropbox.enviados.set('usuario/diario/teste123/000001.jsonl', Buffer.from(`${JSON.stringify(linha)}\n`))
  await entrar(page)

  // 1. O endereço da obra sua vai para o da obra dos livros (com o ?…)
  await page.goto('#/obra/BIB-teste123-1?ordem=ano')
  await expect(page).toHaveURL(/#\/obra\/BIB-900090\?ordem=ano$/)
  await expect(page.getByRole('heading', { level: nivel, name: 'Imaginária 2010' })).toBeVisible()

  // 2. O bloco (quando o registro de origem chega pela sincronização)
  const bloco = page.getByRole('region', { name: 'Esta obra veio de você' })
  await expect(bloco).toBeVisible({ timeout: 30_000 })
  await expect(bloco).toContainText('Publicada a partir da sua obra «Imaginária 2010». Se você a excluir, ela sai dos livros na próxima importação.')
  const excluir = bloco.getByRole('button', { name: 'Excluir a sua obra' })
  await alvoOk(excluir, celular, 'Excluir a sua obra')
  await semRolagemHorizontal(page, 'a obra publicada')
  await foto(page, 'obra-publicada-1-bloco', bloco)
  await excluir.click()
  const confirmar = bloco.getByRole('group', { name: 'Excluir a sua obra «Imaginária 2010»?' })
  await expect(confirmar).toContainText('BIB-900090 fica reservado para ela.')
  await expect(confirmar.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await foto(page, 'obra-publicada-2-confirmar', confirmar)
  await confirmar.getByRole('button', { name: 'Excluir' }).click()
  await expect(bloco.getByRole('status')).toHaveText('Você excluiu a sua obra «Imaginária 2010». Sai dos livros na próxima importação. Até lá, «Restaurar» fica aqui.')
  const restaurar = bloco.getByRole('button', { name: 'Restaurar' })
  await expect(restaurar).toBeFocused()
  await expect(page.getByRole('link', { name: 'Editar a obra' })).toHaveCount(0)
  await foto(page, 'obra-publicada-3-excluida', bloco)
  await restaurar.click()
  await expect(bloco.getByRole('button', { name: 'Excluir a sua obra' })).toBeFocused()

  // 3. A obra publicada continua editável: a edição vale sobre o pacote, também depois de recarregar
  await page.getByRole('link', { name: 'Editar a obra' }).click()
  await expect(page).toHaveURL(/#\/obra\/BIB-900090\/editar$/)
  await expect(page.getByRole('heading', { level: 1, name: /^Editar a obra/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^É esta/ })).toHaveCount(0)
  const tituloDaObra = page.getByRole('textbox', { name: 'Título', exact: true })
  await expect(tituloDaObra).toHaveValue('Selos sonhados no planalto fictício')
  await tituloDaObra.fill('Selos sonhados revistos')
  await page.getByRole('button', { name: 'Salvar as mudanças' }).first().click()
  await expect(page).toHaveURL(/#\/obra\/BIB-900090$/)
  await expect(page.locator('.obra-chicago')).toContainText('Selos sonhados revistos')
  await expect(page.getByText(/As suas mudanças valem aqui e entram nos livros na próxima importação/)).toBeVisible()
  await semRolagemHorizontal(page, 'a obra publicada editada')
  await foto(page, 'obra-publicada-4-editada', page.locator('.obra-chicago'))

  await page.reload()
  await expect(page.getByRole('heading', { level: nivel, name: 'Imaginária 2010' })).toBeVisible()
  await expect(page.locator('.obra-chicago')).toContainText('Selos sonhados revistos')

  // 4. O endereço antigo de «Editar a obra» também vai para o da obra dos livros
  await page.goto('#/obra/BIB-teste123-1/editar')
  await expect(page).toHaveURL(/#\/obra\/BIB-900090\/editar$/)
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Selos sonhados revistos')
})
