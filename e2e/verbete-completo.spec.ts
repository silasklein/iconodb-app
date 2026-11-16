import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { apertarAteAparecer } from './teclas'
import { expect, test } from './fixtures'

/**
 * Parte 2C, bloco 3, Tarefa 12 no navegador de verdade, nos dois tamanhos, sobre o pacote sintético (TESTE): um termo novo
 * criado numa hipótese ganha os campos completos («Editar os dados»: tipo, gênero, número, as línguas, «Outra língua»,
 * variantes, termo mais geral, Iconclass e SSSL), cada um gravado na hora; o hebraico e o árabe correm da direita para a
 * esquerda no campo e na página; a busca do Glossário acha a forma em árabe sem os sinais vocálicos (foco 5); e o verbete
 * dos livros mostra as outras línguas. Com SHOTS_DIR definido, guarda capturas.
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
const direcao = (l: Locator) => l.evaluate((el) => getComputedStyle(el).direction)

async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}

test('o verbete do usuário completo: editar na hora, rtl no campo e na página, achar pelo árabe; o verbete dos livros com outras línguas', async ({ page }) => {
  const celular = (page.viewportSize()?.width ?? 0) < 768
  const nivel = celular ? 1 : 2
  await entrar(page)

  // 1. Um termo novo, criado numa hipótese (decisão 41).
  await page.goto('#/item/CA00003')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const nova = page.getByRole('dialog', { name: 'Nova hipótese' })
  await apertarAteAparecer(page, 'Shift+H', nova)
  await nova.getByRole('combobox', { name: 'Termo' }).fill('sacerdote de prova')
  await nova.getByRole('listbox', { name: 'Termo' }).getByRole('option', { name: /^Criar termo «sacerdote de prova»/ }).click()
  await nova.getByRole('button', { name: 'Registrar hipótese' }).click()
  await expect(nova).toHaveCount(0)

  await page.goto('#/glossario')
  await page.locator('a.lista-linha').filter({ hasText: 'sacerdote de prova' }).click()
  await expect(page.getByRole('heading', { level: nivel, name: 'sacerdote de prova' })).toBeVisible()
  await expect(page.getByText('Verbete do SKC · a revisar')).toBeVisible()

  // 2. «Editar os dados»: cada campo grava na hora.
  await page.getByRole('button', { name: 'Editar os dados' }).click()
  const form = page.getByRole('region', { name: 'Dados do verbete' })
  await form.getByRole('radio', { name: 'Conceito' }).click()
  await expect(page.getByText('Conceito · SKC · a revisar')).toBeVisible()
  await form.getByLabel('Gênero').selectOption('m')
  await form.getByLabel('Número').selectOption('sg')
  await form.getByLabel('Alemão').fill('Prüfpriester')
  await form.getByLabel('Inglês').fill('trial priest')
  const hebraico = form.getByLabel('Hebraico')
  const arabe = form.getByLabel('Árabe')
  await hebraico.fill('כֹּהֵן נִסָּיוֹן')
  await arabe.fill('كَاهِن تَجْرِبَة')
  expect(await direcao(hebraico)).toBe('rtl')
  expect(await direcao(arabe)).toBe('rtl')
  expect(await direcao(form.getByLabel('Alemão'))).toBe('ltr')
  const outra = form.getByRole('group', { name: 'Outra língua' })
  await outra.getByRole('button', { name: 'Outra língua' }).click()
  await outra.getByRole('textbox', { name: 'Outra língua 1: a língua' }).fill('francês')
  await outra.getByRole('textbox', { name: 'Outra língua 1: a forma' }).fill('prêtre d’essai')
  await outra.getByRole('button', { name: 'Outra língua' }).click()
  await outra.getByRole('textbox', { name: 'Outra língua 2: a língua' }).fill('persa')
  await outra.getByRole('textbox', { name: 'Outra língua 2: a forma' }).fill('کاهن آزمایشی')
  expect(await direcao(outra.getByRole('textbox', { name: 'Outra língua 2: a forma' }))).toBe('rtl') // dir="auto"
  await form.getByLabel('Variantes (uma por linha)').fill('Pruefpriester\nProbepriester')
  const pai = form.getByRole('combobox', { name: 'Termo mais geral' })
  await pai.fill('leão')
  await form.getByRole('option', { name: /^leão-de-teste/ }).click()
  await expect(pai).toHaveValue('leão-de-teste')
  await form.getByLabel('Iconclass').fill('11Q7')
  await form.getByLabel('SSSL').fill('9.9.9')
  await form.getByLabel('SSSL').press('Tab')
  await semRolagemHorizontal(page, 'o verbete em edição')
  await foto(page, 'verbete-1-edicao', form.getByRole('radiogroup', { name: 'Tipo' }))
  await foto(page, 'verbete-2-edicao-linguas', outra)

  // 3. A leitura, como a do verbete dos livros; o hebraico e o árabe da direita para a esquerda. Recarregar não perde nada.
  await page.reload()
  await expect(page.getByRole('heading', { level: nivel, name: 'sacerdote de prova' })).toBeVisible()
  const dados = page.getByRole('region', { name: 'Dados do verbete' })
  await expect(dados.locator('dd', { hasText: 'Prüfpriester' })).toBeVisible()
  const ddHe = dados.locator('dd[lang="he"] bdi')
  const ddAr = dados.locator('dd[lang="ar"] bdi')
  await expect(ddHe).toHaveText('כֹּהֵן נִסָּיוֹן')
  await expect(ddAr).toHaveText('كَاهِن تَجْرِبَة')
  expect(await direcao(ddHe)).toBe('rtl')
  expect(await direcao(ddAr)).toBe('rtl')
  await expect(dados.getByRole('link', { name: 'leão-de-teste' })).toBeVisible()
  await expect(dados.getByText('prêtre d’essai')).toBeVisible()
  await expect(page.locator('dt', { hasText: 'Gênero' }).locator('xpath=following-sibling::dd[1]')).toHaveText('masculino')
  await semRolagemHorizontal(page, 'a leitura do verbete do usuário')
  await foto(page, 'verbete-3-leitura', dados)

  // 4. A busca dobrada do Glossário acha o árabe sem os sinais vocálicos (foco 5) e a forma em persa.
  for (const consulta of ['تجربة', 'آزمایشی']) {
    await page.goto('#/glossario')
    await page.getByRole('searchbox', { name: 'Buscar no glossário' }).fill(consulta)
    const linhas = page.locator('a.lista-linha')
    await expect(linhas).toHaveCount(1)
    await expect(linhas.first()).toContainText('sacerdote de prova')
  }
  await foto(page, 'verbete-4-busca-arabe')
  await page.goto('#/glossario?tipo=conceitos')
  await expect(page.locator('a.lista-linha').filter({ hasText: 'sacerdote de prova' })).toHaveCount(1)

  // 5. O verbete dos livros mostra as outras línguas (other_forms).
  await page.goto('#/verbete/GL-900010')
  await expect(page.getByRole('heading', { level: nivel, name: 'amuleto de prova' })).toBeVisible()
  const outras = page.locator('dt', { hasText: 'Outras línguas' }).locator('xpath=following-sibling::dd[1]')
  await expect(outras.getByRole('listitem')).toHaveText(['grego φυλακτήριον δοκιμῆς', 'latim amuletum probationis'])
  await semRolagemHorizontal(page, 'o verbete dos livros com outras línguas')
  await foto(page, 'verbete-5-livro-outras-linguas', outras)
})

test('fix round 1: o verbete publicado que veio de você continua editável, e a edição vale sobre o pacote depois de recarregar', async ({ page, dropbox }) => {
  const nivel = (page.viewportSize()?.width ?? 0) < 768 ? 1 : 2
  dropbox.usuarioReal = true
  // O aparelho que criou o verbete que o pipeline publicou (GL-teste123-1 → GL-900010 no pacote sintético).
  const hlc = `${String(Date.now() - 60_000).padStart(13, '0')}-0000-teste123`
  const linha = { v: 1, id: 'teste123-1-0', hlc, aparelho: 'teste123', tipo: 'verbete', reg: 'GL-teste123-1', op: 'criar', campos: { forma: 'amuleto de prova', status: 'proposed' } }
  dropbox.enviados.set('usuario/diario/teste123/000001.jsonl', Buffer.from(`${JSON.stringify(linha)}\n`))
  await entrar(page)

  await page.goto('#/verbete/GL-900010')
  await expect(page.getByRole('heading', { level: nivel, name: 'amuleto de prova' })).toBeVisible()
  const editar = page.getByRole('button', { name: 'Editar os dados' })
  await expect(editar).toBeVisible({ timeout: 30_000 })
  await editar.click()
  const form = page.getByRole('region', { name: 'Dados do verbete' })
  await expect(form.getByLabel('Árabe')).toHaveValue('تميمة تجريبية')
  await form.getByLabel('Alemão').fill('Probeamulett')
  await form.getByLabel('Alemão').press('Tab')
  await semRolagemHorizontal(page, 'o verbete publicado em edição')
  await foto(page, 'verbete-6-publicado-edicao', form.getByLabel('Alemão'))

  await page.reload()
  await expect(page.getByRole('heading', { level: nivel, name: 'amuleto de prova' })).toBeVisible()
  const dados = page.getByRole('region', { name: 'Dados do verbete' })
  await expect(dados.locator('dd[lang="de"]')).toHaveText('Probeamulett')
  expect(await direcao(dados.locator('dd[lang="ar"] bdi'))).toBe('rtl')
  await foto(page, 'verbete-7-publicado-leitura', dados)
})
