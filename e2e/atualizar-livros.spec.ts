import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Locator, Page, TestInfo } from '@playwright/test'
import type { DropboxSimulado } from './dropboxSimulado'
import { expect, test } from './fixtures'
import { escreverNota } from './notasNaTela'

/**
 * «Atualizar os livros» no navegador de verdade, nos dois tamanhos: o aparelho já tem o pacote sintético (TESTE I) e uma
 * nota da pessoa; um pacote mais novo (o mesmo, com um verbete a mais no comum.sqlite) chega ao Dropbox simulado. Ao
 * abrir o app, o Início mostra a faixa; «Atualizar os livros» baixa só o que mudou, volta ao Início sem a faixa, com o
 * verbete novo, e a nota continua lá. A tela de Sincronização procura a pedido. Com SHOTS_DIR, guarda capturas.
 */
async function foto(page: Page, nome: string, ver?: Locator) {
  const pasta = process.env.SHOTS_DIR
  if (!pasta) return
  mkdirSync(pasta, { recursive: true })
  await ver?.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: join(pasta, `${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}
async function semRolagemHorizontal(page: Page, tela: string) {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}
const verbetes = (page: Page) => page.getByRole('group', { name: 'O que há no banco' }).locator('div', { hasText: 'Verbetes' }).locator('dd')
const manifestos = (dropbox: DropboxSimulado) => dropbox.baixados.filter((c) => c === 'nucleo/manifest.json').length

/** O pacote mais novo: o comum.sqlite sintético com um verbete a mais, e o manifesto que o anuncia. Nada de livro real. */
function pacoteMaisNovo(dropbox: DropboxSimulado, info: TestInfo) {
  const raiz = join(import.meta.dirname, '..', 'tests', 'fixtures', 'pacote', 'nucleo')
  mkdirSync(info.outputPath(), { recursive: true })
  const copia = info.outputPath('comum.sqlite')
  copyFileSync(join(raiz, 'comum.sqlite'), copia)
  const db = new DatabaseSync(copia)
  db.exec(`INSERT INTO glossary_entry (id, kind, pt, status) VALUES ('GL-900099', 'concept', 'verbete do pacote novo', 'approved')`)
  db.close()
  const comum = readFileSync(copia)
  const manifesto = JSON.parse(readFileSync(join(raiz, 'manifest.json'), 'utf8')) as { gerado_em: string; arquivos: Record<string, { sha256: string; bytes: number }> }
  manifesto.gerado_em = '2026-11-14T13:55:59+00:00'
  manifesto.arquivos['nucleo/comum.sqlite'] = { sha256: createHash('sha256').update(comum).digest('hex'), bytes: comum.length }
  dropbox.pacoteTrocado.set('nucleo/comum.sqlite', comum)
  dropbox.pacoteTrocado.set('nucleo/manifest.json', Buffer.from(JSON.stringify(manifesto)))
}

test('um pacote novo no Dropbox: a faixa no Início, «Atualizar os livros», só o que mudou, a nota fica', async ({ page, dropbox }, info) => {
  // 1. O primeiro download, como sempre. Esta abertura acabou de baixar o pacote: o Início não procura de novo.
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
  await expect(verbetes(page)).toHaveText('10')
  await page.waitForTimeout(300)
  expect(manifestos(dropbox)).toBe(1)
  await expect(page.getByRole('button', { name: 'Atualizar os livros' })).toHaveCount(0)

  // 2. Algo da pessoa no aparelho.
  await page.goto('#/obra/BIB-900001')
  await expect(page.getByRole('region', { name: 'Notas SKC' })).toBeVisible()
  await escreverNota(page, 'Nota de antes da atualização.')

  // 3. O pacote novo chega ao Dropbox; o app é aberto de novo: a faixa, uma procura só.
  pacoteMaisNovo(dropbox, info)
  await page.goto('./') // sem o #/obra/…: carrega a página de novo (uma abertura nova do app)
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
  const faixa = page.getByRole('status').filter({ hasText: 'Há uma versão nova dos livros no Dropbox: TESTE I, TESTEG, TESTEGEN.' })
  await expect(faixa).toBeVisible()
  expect(manifestos(dropbox)).toBe(2)
  await expect(verbetes(page)).toHaveText('10')
  await semRolagemHorizontal(page, 'Início com a faixa')
  await foto(page, 'inicio-faixa', faixa)

  // 4. A tela de Sincronização já mostra o que a abertura achou; «Procurar livros novos» confirma.
  await page.goto('#/sincronizacao')
  const livros = page.getByRole('region', { name: 'Livros' })
  await expect(livros.getByRole('button', { name: 'Atualizar os livros' })).toBeVisible()
  await livros.getByRole('button', { name: 'Procurar livros novos' }).click()
  await expect.poll(() => manifestos(dropbox)).toBe(3)
  await expect(livros.getByText('Há uma versão nova dos livros no Dropbox: TESTE I, TESTEG, TESTEGEN.')).toBeVisible()
  await semRolagemHorizontal(page, 'Sincronização com livros novos')
  await foto(page, 'sincronizacao-livros-novos', livros)

  // 5. «Atualizar os livros»: «Atualizando os livros», só o comum.sqlite (e o manifesto) baixados, de volta ao Início.
  const antes = dropbox.baixados.length
  await livros.getByRole('button', { name: 'Atualizar os livros' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Atualizando os livros' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible({ timeout: 30_000 })
  expect(dropbox.baixados.slice(antes).sort()).toEqual(['nucleo/comum.sqlite', 'nucleo/manifest.json'])
  await expect(verbetes(page)).toHaveText('11')
  await expect(page.getByRole('button', { name: 'Atualizar os livros' })).toHaveCount(0)
  await foto(page, 'inicio-depois')

  // 6. O que é da pessoa ficou.
  await page.goto('#/obra/BIB-900001')
  await expect(page.getByRole('region', { name: 'Notas SKC' }).getByText('Nota de antes da atualização.')).toBeVisible()

  // 7. Em dia: a Sincronização diz, e abrir o app de novo não mostra a faixa.
  await page.goto('#/sincronizacao')
  await livros.getByRole('button', { name: 'Procurar livros novos' }).click()
  await expect(livros.getByText('Os livros estão em dia.')).toBeVisible()
  await foto(page, 'sincronizacao-em-dia', livros)
  const vistos = manifestos(dropbox)
  await page.goto('./')
  await expect(verbetes(page)).toHaveText('11')
  await expect.poll(() => manifestos(dropbox)).toBe(vistos + 1)
  await page.waitForTimeout(300)
  await expect(page.getByRole('button', { name: 'Atualizar os livros' })).toHaveCount(0)
})

test('um pacote que esta versão não abre (outro schema): nada no Início; «Procurar livros novos» diz que não abre', async ({ page, dropbox }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()

  // Um pacote do schema 99 (só o manifesto muda) chega ao Dropbox; o app é aberto de novo.
  const raiz = join(import.meta.dirname, '..', 'tests', 'fixtures', 'pacote', 'nucleo')
  const manifesto = JSON.parse(readFileSync(join(raiz, 'manifest.json'), 'utf8')) as { schema: number }
  manifesto.schema = 99
  dropbox.pacoteTrocado.set('nucleo/manifest.json', Buffer.from(JSON.stringify(manifesto)))
  await page.goto('#/glossario')
  await page.goto('./')
  await expect(verbetes(page)).toHaveText('10')
  await expect.poll(() => manifestos(dropbox)).toBe(2)
  await page.waitForTimeout(300)
  await expect(page.getByText(/versão nova dos livros|não abre/)).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)

  await page.goto('#/sincronizacao')
  const livros = page.getByRole('region', { name: 'Livros' })
  await livros.getByRole('button', { name: 'Procurar livros novos' }).click()
  await expect(
    livros.getByText('O pacote que está no Dropbox não abre nesta versão do app (é de outra versão do banco ou está com defeito). Os livros do aparelho continuam valendo.'),
  ).toBeVisible()
  await expect(livros.getByRole('button', { name: 'Atualizar os livros' })).toHaveCount(0)
  await semRolagemHorizontal(page, 'Sincronização com pacote incompatível')
  await foto(page, 'sincronizacao-incompativel', livros)
})
