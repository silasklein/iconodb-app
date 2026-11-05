import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { escreverNota } from './notasNaTela'

/**
 * Notas SKC no navegador de verdade (worker, sqlite-wasm, IndexedDB), pela tela, nos dois tamanhos: escrever num objeto
 * com `[[` e a lista de sugestões, o rascunho que sobrevive a recarregar a página, salvar, o link reverso no verbete e
 * Minhas notas. Com SHOTS_DIR definido, guarda capturas da tela nessa pasta.
 */
const celular = (page: Page) => (page.viewportSize()?.width ?? 0) < 768
const semRolagemHorizontal = async (page: Page, tela: string) => {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}
async function foto(page: Page, nome: string, ver?: Locator) {
  const pasta = process.env.SHOTS_DIR
  if (!pasta) return
  mkdirSync(pasta, { recursive: true })
  // A parte da tela que interessa (as notas ficam abaixo da leitura): a rolagem a traz para a foto.
  await ver?.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: join(pasta, `${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}

test('escrever uma nota num objeto, ligá-la a um verbete, perder a aba sem perder o texto e achá-la nos links reversos', async ({ page, dropbox }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
  expect(dropbox.autorizacoes).toBe(1)

  // 1. O objeto: a voz "SKC notas" ainda sem nota, com o caminho para escrever.
  await page.goto('#/item/CA00001')
  const leituras = page.getByRole('region', { name: 'Leituras' })
  const voz = leituras.getByRole('group', { name: 'SKC notas' })
  await expect(voz).toBeVisible()
  await foto(page, 'nota-1-item-sem-nota')

  // 2. Escrever: celular na tela da nota, computador no lugar.
  if (celular(page)) {
    await voz.getByRole('link', { name: 'Escrever nota' }).click()
    await expect(page).toHaveURL(/#\/nota\/nova\?alvoTipo=objeto&alvo=CA00001/)
  } else {
    await voz.getByRole('button', { name: 'Escrever nota' }).click()
  }
  const campo = page.getByRole('textbox', { name: /^Nota \[1\] · \d\d\/\d\d\/\d{4}$/ })
  await expect(campo).toBeFocused()
  await campo.pressSequentially('O leão aparece também em [[lea', { delay: 20 })
  const sugestoes = page.getByRole('listbox', { name: /Sugestões para/ })
  await expect(sugestoes).toBeVisible()
  await expect(sugestoes.getByRole('option', { name: /^leão-de-teste/ })).toBeVisible()
  // A lista abre abaixo do campo e vem inteira para a vista (no computador o editor está no meio da página).
  await expect(sugestoes).toBeInViewport({ ratio: 0.99 })
  await foto(page, 'nota-2-colchetes-abertos')
  await sugestoes.getByRole('option', { name: /^leão-de-teste/ }).click()
  await expect(sugestoes).toHaveCount(0)
  await expect(campo).toHaveValue('O leão aparece também em [[GL-900001|leão-de-teste]]')
  await campo.pressSequentially(' e no pingente.')

  // 3. O rascunho chega ao IndexedDB sem "Salvar": recarregar a página não o perde.
  await expect(page.getByText('rascunho salvo')).toBeVisible({ timeout: 5000 })
  await page.reload()
  await page.goto('#/notas')
  const rascunho = page.getByRole('link', { name: /rascunho/ })
  await expect(rascunho).toBeVisible()
  await expect(rascunho).toContainText('O leão aparece também em leão-de-teste e no pingente.')
  await expect(rascunho).toContainText('Ligada a leão-de-teste')
  await foto(page, 'nota-3-minhas-notas-rascunho')
  await semRolagemHorizontal(page, 'Minhas notas')

  // 4. Abrir o rascunho: ele abre para LER (o texto como no quadro, o link só com o rótulo, sem o código); tocar no texto
  //    passa ao campo, com o código [[…]]; Esc volta à leitura; Salvar encerra.
  await rascunho.click()
  const leitura = page.getByRole('group', { name: /^Nota \[1\]/ })
  await expect(leitura).toBeVisible()
  await expect(leitura).toHaveText('O leão aparece também em leão-de-teste e no pingente.')
  await expect(leitura.getByRole('link', { name: 'leão-de-teste' })).toHaveAttribute('href', /\/verbete\/GL-900001$/)
  await expect(page.getByRole('textbox', { name: /^Nota \[1\]/ })).toHaveCount(0)
  const editar = page.getByRole('button', { name: 'Editar', exact: true })
  await expect(editar).toBeVisible()
  expect((await editar.boundingBox())!.height, 'o botão Editar tem pelo menos o alvo de toque').toBeGreaterThanOrEqual(celular(page) ? 44 : 36)
  await foto(page, 'nota-4b-leitura')
  await leitura.getByText('e no pingente.').click()
  const reaberto = page.getByRole('textbox', { name: /^Nota \[1\]/ })
  await expect(reaberto).toBeFocused()
  await expect(reaberto).toHaveValue('O leão aparece também em [[GL-900001|leão-de-teste]] e no pingente.')
  await foto(page, 'nota-4c-edicao')
  await page.keyboard.press('Escape')
  await expect(leitura).toBeVisible()
  await expect(page.getByRole('textbox', { name: /^Nota \[1\]/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Salvar nota' }).click()
  // Celular: a tela da nota fecha e volta a Minhas notas. Computador: a nota fica aberta, agora "salva".
  if (celular(page)) await expect(page).toHaveURL(/#\/notas$/)
  else await expect(page.getByText('nota salva')).toBeVisible()
  const salva = page.getByRole('link', { name: /O leão aparece também/ })
  await expect(salva).toBeVisible()
  await expect(salva).not.toContainText('rascunho')

  // 5. A nota no objeto: o link leva ao verbete; o verbete mostra a nota como link reverso.
  await page.goto('#/item/CA00001')
  const notaNoItem = page.getByRole('region', { name: 'Leituras' }).getByRole('group', { name: 'SKC notas' }).getByRole('article')
  await expect(notaNoItem).toContainText('O leão aparece também em leão-de-teste e no pingente.')
  await foto(page, 'nota-5-item-com-nota', notaNoItem)
  await notaNoItem.getByRole('link', { name: 'leão-de-teste' }).click()
  await expect(page).toHaveURL(/#\/verbete\/GL-900001/)
  const reversos = page.getByRole('region', { name: 'Notas SKC' })
  const reversa = reversos.getByRole('article')
  await expect(reversa).toContainText('O leão aparece também em leão-de-teste')
  await expect(reversa.getByRole('link', { name: /^em CA00001/ })).toBeVisible()
  await foto(page, 'nota-6-verbete-links-reversos', reversos)
  await semRolagemHorizontal(page, 'Verbete com notas')

  // 7. Do verbete, o "em CA00001" volta ao objeto.
  await reversa.getByRole('link', { name: /^em CA00001/ }).click()
  await expect(page).toHaveURL(/#\/item\/CA00001/)
})

test('digitar e recarregar a página logo em seguida não perde o texto (pagehide grava sem esperar o "rascunho salvo")', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()

  await page.goto('#/item/CA00002')
  const voz = page.getByRole('region', { name: 'Leituras' }).getByRole('group', { name: 'SKC notas' })
  if (celular(page)) await voz.getByRole('link', { name: 'Escrever nota' }).click()
  else await voz.getByRole('button', { name: 'Escrever nota' }).click()
  const campo = page.getByRole('textbox', { name: /^Nota \[\d+\]/ })
  await expect(campo).toBeFocused()
  // Menos de um segundo de digitação e a página recarrega: nada de esperar o "rascunho salvo".
  await campo.pressSequentially('Escrito e recarregado na hora.', { delay: 4 })
  await expect(page.getByText('rascunho salvo')).toHaveCount(0)
  await page.reload()
  await page.goto('#/notas')
  await expect(page.getByRole('link', { name: /Escrito e recarregado na hora\./ })).toBeVisible()
})

test('o que se escreve chega ao Dropbox (em usuario/) depois de gravado no aparelho', async ({ page, dropbox }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()

  await page.goto('#/obra/BIB-900001')
  await expect(page.getByRole('region', { name: 'Notas SKC' })).toBeVisible()
  await escreverNota(page, 'Anotação para o Dropbox.')
  await expect(page.getByRole('region', { name: 'Notas SKC' }).getByText('Anotação para o Dropbox.')).toBeVisible()
  // Primeiro o IndexedDB (a nota já está na tela e na lista), depois a rede: o envio vem na próxima rodada de sincronização.
  await expect.poll(() => dropbox.enviados.size, { timeout: 30_000 }).toBeGreaterThan(0)
  expect([...dropbox.enviados.keys()].every((c) => c.startsWith('usuario/'))).toBe(true)
  expect([...dropbox.enviados.values()].map((b) => b.toString('utf8')).join('\n')).toContain('Anotação para o Dropbox.')
})
