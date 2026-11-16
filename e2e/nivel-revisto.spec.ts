import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Parte 2C, bloco 3, Tarefa 13 no navegador de verdade, nos dois tamanhos, sobre o pacote sintético (TESTE): no painel da
 * hipótese do livro, a pessoa revê o nível (o seletor das hipóteses SKC); o nível dela vale no cabeçalho, no marcador do texto,
 * nos blocos e contagens de «Hipóteses por nível» e na faceta Nível da busca; a nota «Nível revisto por você · o automático
 * era …» e «Voltar ao nível automático». Sem rolagem horizontal; alvos de 44 px no toque e 36 com o mouse. Com SHOTS_DIR
 * definido, guarda capturas.
 */
async function foto(page: Page, nome: string, ver?: Locator) {
  const pasta = process.env.SHOTS_DIR
  if (!pasta) return
  mkdirSync(pasta, { recursive: true })
  await ver?.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: join(pasta, `${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}
const semRolagemHorizontal = async (page: Page, tela: string) => {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}
const cheios = (l: Locator) => l.locator('rect[data-cheio="true"]')

test('rever o nível de uma hipótese do livro: o painel, o texto, as contagens, a busca e voltar ao automático', async ({ page }) => {
  const celular = (page.viewportSize()?.width ?? 0) < 768
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()

  // A busca antes: CA00001 não tem hipótese iconológica.
  await page.goto('#/busca?q=mahtes&nivel=iconological')
  await expect(page.getByRole('link', { name: /CA00002/ }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /CA00001/ })).toHaveCount(0)

  await page.goto('#/item/CA00001?hipotese=HY-900001')
  const painel = page.getByRole('dialog', { name: 'Hipótese leão-de-teste' })
  await expect(painel).toBeVisible()
  const grupo = painel.getByRole('radiogroup', { name: 'Nível' })
  await expect(grupo.getByRole('radio', { name: 'iconográfico', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(painel.getByText('Só o nível muda: o trecho, o termo e a certeza continuam os do livro.', { exact: false })).toBeVisible()
  await foto(page, 'nivel-livro-antes', grupo)

  await grupo.getByRole('radio', { name: 'iconológico', exact: true }).click()
  const nota = painel.getByText('Nível revisto por você · o automático era iconográfico.')
  await expect(nota).toBeVisible()
  await expect(cheios(painel.locator('.painel-hipotese-etiqueta'))).toHaveCount(3)
  await expect(painel.locator('.painel-hipotese-etiqueta')).toContainText('Iconológico')
  const voltar = painel.getByRole('button', { name: 'Voltar ao nível automático' })
  await expect(voltar).toBeVisible()
  const alvo = await voltar.boundingBox()
  expect(alvo!.height).toBeGreaterThanOrEqual(celular ? 44 : 36)
  for (const radio of await grupo.getByRole('radio').all()) expect((await radio.boundingBox())!.height).toBeGreaterThanOrEqual(celular ? 44 : 36)
  await semRolagemHorizontal(page, 'o painel com o nível revisto')
  await foto(page, 'nivel-livro-revisto', voltar)

  // O texto e a seção, atrás do painel.
  await expect(page.locator('a.ancora[data-hipotese="HY-900001"] .so-leitor')).toContainText('hipótese: iconológico')
  if (celular) await painel.getByRole('button', { name: 'Fechar o painel' }).click()
  const botao = page.getByRole('button', { name: /Hipóteses por nível/ })
  if ((await botao.getAttribute('aria-expanded')) !== 'true') await botao.click()
  const secao = page.getByRole('region', { name: 'Hipóteses por nível' })
  const iconologico = secao.getByRole('region', { name: 'Iconológico', exact: true })
  await expect(iconologico.locator('[data-hipotese-linha="HY-900001"]')).toBeVisible()
  await expect(iconologico.getByText('1 hipótese', { exact: true })).toBeVisible()
  await expect(secao.getByRole('region', { name: 'Iconográfico', exact: true })).toHaveCount(0)
  await semRolagemHorizontal(page, 'a seção com o nível revisto')
  await foto(page, 'nivel-livro-secao', iconologico)

  // A busca depois: o filtro iconológico acha CA00001.
  await page.goto('#/busca?q=mahtes&nivel=iconological')
  await expect(page.getByRole('link', { name: /CA00001/ }).first()).toBeVisible()

  // Voltar ao nível automático.
  await page.goto('#/item/CA00001?hipotese=HY-900001')
  await expect(painel.getByText('Nível revisto por você · o automático era iconográfico.')).toBeVisible()
  await painel.getByRole('button', { name: 'Voltar ao nível automático' }).click()
  await expect(painel.getByText('Nível revisto por você', { exact: false })).toHaveCount(0)
  await expect(grupo.getByRole('radio', { name: 'iconográfico', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(grupo.getByRole('radio', { name: 'iconográfico', exact: true })).toBeFocused()
  await expect(cheios(painel.locator('.painel-hipotese-etiqueta'))).toHaveCount(2)
  await expect(page.locator('a.ancora[data-hipotese="HY-900001"] .so-leitor')).toContainText('hipótese: iconográfico')

  // Depois de publicado: HY-900006 (CA00003) vem com `level_auto`; sem o registro vivo da pessoa, vale o automático, sem nota.
  await page.goto('#/item/CA00003?hipotese=HY-900006')
  const publicada = page.getByRole('dialog', { name: /^Hipótese / })
  const seletor = publicada.getByRole('radiogroup', { name: 'Nível' })
  await expect(seletor.getByRole('radio', { name: 'pré-iconográfico', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(publicada.getByText('Nível revisto por você', { exact: false })).toHaveCount(0)
  // O nível da pessoa (o que o pacote publicou) volta com a nota; «Voltar» o exclui.
  await seletor.getByRole('radio', { name: 'iconográfico', exact: true }).click()
  await expect(publicada.getByRole('status')).toHaveText('Nível revisto por você · o automático era pré-iconográfico.')
  await foto(page, 'nivel-livro-publicado', seletor)
  await publicada.getByRole('button', { name: 'Voltar ao nível automático' }).click()
  await expect(seletor.getByRole('radio', { name: 'pré-iconográfico', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(publicada.getByText('Nível revisto por você', { exact: false })).toHaveCount(0)
})
