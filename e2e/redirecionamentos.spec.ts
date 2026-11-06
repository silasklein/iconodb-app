import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Locator, Page, TestInfo } from '@playwright/test'
import type { DropboxSimulado } from './dropboxSimulado'
import { expect, test } from './fixtures'

/**
 * Tarefa 16 no navegador de verdade, nos dois tamanhos, sobre o pacote sintético (schema 6, com a tabela
 * `redirecionamento`): o endereço antigo de um verbete e de um sítio do usuário que o pipeline publicou leva ao do livro
 * (o antigo sai do histórico); um id do usuário sem redirecionamento continua no endereço dele. E a decisão 50: na página do
 * livro que veio de um registro do usuário, «Este verbete (sítio) veio de você», «Excluir o seu verbete (sítio)», o aviso e
 * «Restaurar». Com SHOTS_DIR definido, guarda capturas.
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
/** Cada botão do bloco: alvo de 44 px no toque e 36 px com o mouse; texto de 12 px ou mais. */
async function alvosEFontes(page: Page, bloco: Locator) {
  const minimo = (page.viewportSize()?.width ?? 0) < 768 ? 44 : 36
  for (const b of await bloco.getByRole('button').all()) {
    const caixa = (await b.boundingBox())!
    expect(Math.min(caixa.width, caixa.height), await b.innerText()).toBeGreaterThanOrEqual(minimo - 0.5)
  }
  const menor = await bloco.evaluate((el) => Math.min(...[el, ...el.querySelectorAll('*')].filter((x) => (x.textContent ?? '').trim() && !(x instanceof SVGElement)).map((x) => parseFloat(getComputedStyle(x).fontSize))))
  expect(menor).toBeGreaterThanOrEqual(12)
}
/** N-3: entre dois elementos do bloco, ao menos 8 px: lado a lado (na mesma linha) ou um embaixo do outro (quebrou). */
async function comEspaco(a: Locator, b: Locator, rotulo: string) {
  const x = (await a.boundingBox())!
  const y = (await b.boundingBox())!
  const mesmaLinha = y.y < x.y + x.height && x.y < y.y + y.height
  if (mesmaLinha) expect(y.x - (x.x + x.width), `${rotulo}: espaço horizontal`).toBeGreaterThanOrEqual(8 - 0.5)
  else expect(y.y - (x.y + x.height), `${rotulo}: espaço vertical`).toBeGreaterThanOrEqual(8 - 0.5)
}
/** m-UI1: a caixa de confirmação tem a borda e o texto da de «Excluir o sítio» (`.sitio-confirmar`). */
async function mesmaCaixaDoSitio(confirmar: Locator) {
  const { borda, controle, fonte, largura } = await confirmar.evaluate((el) => {
    const sonda = document.createElement('span')
    sonda.style.color = 'var(--controle)'
    document.body.append(sonda)
    const controle = getComputedStyle(sonda).color
    sonda.remove()
    return { borda: getComputedStyle(el).borderTopColor, controle, fonte: getComputedStyle(el.querySelector('p')!).fontSize, largura: getComputedStyle(el).maxWidth }
  })
  expect(borda).toBe(controle)
  expect(fonte).toBe('14px')
  expect(largura).toBe('420px')
}
async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}

test('o endereço antigo de um verbete e de um sítio do usuário publicados leva ao do livro', async ({ page }) => {
  await entrar(page)

  await page.goto('#/verbete/GL-teste123-1')
  await expect(page).toHaveURL(/#\/verbete\/GL-900010$/)
  await expect(page.getByRole('heading', { name: 'amuleto de prova' })).toBeVisible()

  // o verbete do usuário que é o mesmo de um verbete que já existia
  await page.goto('#/verbete/GL-teste123-2')
  await expect(page).toHaveURL(/#\/verbete\/GL-900002$/)
  await expect(page.getByRole('heading', { name: 'figura denteada' })).toBeVisible()

  await page.goto('#/sitio/SI-teste123-2')
  await expect(page).toHaveURL(/#\/sitio\/TESTE-2$/)
  await expect(page.getByRole('heading', { name: 'Tell Probe Teste' })).toBeVisible()

  await page.goto('#/sitio/SI-teste123-1')
  await expect(page).toHaveURL(/#\/sitio\/TESTE-3$/)
  await expect(page.getByRole('heading', { name: 'Tell Usuário Teste' })).toBeVisible()

  // o Voltar não volta ao endereço antigo (replace): volta à página anterior
  await page.goBack()
  await expect(page).toHaveURL(/#\/sitio\/TESTE-2$/)

  // um sítio do usuário sem redirecionamento (aqui, que este aparelho não tem) fica no endereço dele
  await page.goto('#/sitio/SI-aaaaaaaa-9')
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect(page).toHaveURL(/#\/sitio\/SI-aaaaaaaa-9$/)
})

test('decisão 50: na página do livro que veio de você, excluir o seu verbete e o seu sítio, o aviso e Restaurar', async ({ page, dropbox }) => {
  dropbox.usuarioReal = true
  // O aparelho que criou o verbete e o sítio que o pipeline publicou (GL-900010 e TESTE-3 no pacote sintético).
  const hlc = (n: number) => `${String(Date.now() - 60_000 + n).padStart(13, '0')}-0000-teste123`
  const linhas = [
    { v: 1, id: 'teste123-1-0', hlc: hlc(1), aparelho: 'teste123', tipo: 'verbete', reg: 'GL-teste123-1', op: 'criar', campos: { forma: 'amuleto de prova', status: 'proposed' } },
    { v: 1, id: 'teste123-1-1', hlc: hlc(2), aparelho: 'teste123', tipo: 'sitio', reg: 'SI-teste123-1', op: 'criar', campos: { nome: 'Tell Usuário Teste' } },
  ]
  dropbox.enviados.set('usuario/diario/teste123/000001.jsonl', Buffer.from(linhas.map((l) => `${JSON.stringify(l)}\n`).join('')))
  await entrar(page)

  for (const { url, titulo, nome, excluir, oSeu, livro, ligado } of [
    { url: '#/verbete/GL-900010', titulo: 'Este verbete veio de você', nome: 'amuleto de prova', excluir: 'Excluir o seu verbete', oSeu: 'verbete', livro: 'GL-900010', ligado: 'as notas e hipóteses ligadas a este verbete ficam guardadas' },
    { url: '#/sitio/TESTE-3', titulo: 'Este sítio veio de você', nome: 'Tell Usuário Teste', excluir: 'Excluir o seu sítio', oSeu: 'sitio', livro: 'TESTE-3', ligado: 'os objetos, as notas e as correções ligados a este sítio ficam guardados' },
  ]) {
    await page.goto(url)
    const bloco = page.getByRole('region', { name: titulo })
    await expect(bloco).toBeVisible({ timeout: 30_000 })
    await expect(bloco).toContainText(`«${nome}»`)
    await alvosEFontes(page, bloco)
    await semRolagemHorizontal(page, `${oSeu}: o bloco`)
    await foto(page, `r3-d50-${oSeu}-1-antes`, bloco)

    // A confirmação: o foco vai a Cancelar; Excluir exclui o registro de origem
    await bloco.getByRole('button', { name: excluir }).click()
    const confirmar = bloco.getByRole('group', { name: `${excluir} «${nome}»?` })
    await expect(confirmar.getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await expect(confirmar).toContainText(`${livro} fica reservado para ele. Nada se apaga: ${ligado}, mas sem ele até você restaurar. Ao restaurar, ele volta com o mesmo ${livro} e tudo volta a se ligar a ele.`)
    await alvosEFontes(page, bloco)
    await semRolagemHorizontal(page, `${oSeu}: a confirmação`)
    await mesmaCaixaDoSitio(confirmar)
    await foto(page, `r3-d50-${oSeu}-2-confirmar`, bloco)
    await confirmar.getByRole('button', { name: 'Excluir', exact: true }).click()

    // Excluído: o aviso e Restaurar (com o foco); a página continua a do livro
    await expect(bloco.getByRole('status')).toContainText('Sai dos livros na próxima importação. Até lá, «Restaurar» fica aqui.')
    const restaurar = bloco.getByRole('button', { name: 'Restaurar' })
    await expect(restaurar).toBeFocused()
    await expect(bloco.getByRole('button', { name: excluir })).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`${url}$`))
    await alvosEFontes(page, bloco)
    await semRolagemHorizontal(page, `${oSeu}: excluído`)
    await foto(page, `r3-d50-${oSeu}-3-depois`, bloco)
    // o foco se vê
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(restaurar).toBeFocused()
    expect(await restaurar.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none')

    // Restaurar desfaz
    await restaurar.click()
    await expect(bloco.getByRole('button', { name: excluir })).toBeVisible()
    // a região viva continua montada, vazia (revisão 3, m-UI2)
    await expect(bloco.getByRole('status')).toHaveText('')
  }

  // O que já era do livro (o seu só leva a ele) não tem o bloco
  await page.goto('#/verbete/GL-900002')
  await expect(page.getByRole('heading', { name: 'figura denteada' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Hipóteses com este termo' })).toBeVisible()
  await expect(page.getByRole('region', { name: /veio de você/ })).toHaveCount(0)
})

/** O pacote sintético com uma segunda origem (de outro aparelho) para GL-900010 e para TESTE-3: ainda sem diário de ninguém. */
function pacoteComSegundaOrigem(dropbox: DropboxSimulado, info: TestInfo) {
  dropbox.usuarioReal = true
  const raiz = join(import.meta.dirname, '..', 'tests', 'fixtures', 'pacote', 'nucleo')
  const copia = info.outputPath('comum.sqlite')
  mkdirSync(info.outputPath(), { recursive: true })
  copyFileSync(join(raiz, 'comum.sqlite'), copia)
  const db = new DatabaseSync(copia)
  db.exec(`INSERT INTO redirecionamento (de, para, tipo, criado) VALUES ('GL-teste456-1', 'GL-900010', 'verbete', 1), ('SI-teste456-1', 'TESTE-3', 'sitio', 1)`)
  db.close()
  const comum = readFileSync(copia)
  const manifesto = JSON.parse(readFileSync(join(raiz, 'manifest.json'), 'utf8')) as { arquivos: Record<string, { sha256: string; bytes: number }> }
  manifesto.arquivos['nucleo/comum.sqlite'] = { sha256: createHash('sha256').update(comum).digest('hex'), bytes: comum.length }
  dropbox.pacoteTrocado.set('nucleo/comum.sqlite', comum)
  dropbox.pacoteTrocado.set('nucleo/manifest.json', Buffer.from(JSON.stringify(manifesto)))
}
const hlcDe = (n: number, ap: string) => `${String(Date.now() - 60_000 + n).padStart(13, '0')}-0000-${ap}`
/** O diário de um aparelho (sintético) no Dropbox simulado: o verbete e o sítio dele, mais o que se pedir. */
function diarioDe(dropbox: DropboxSimulado, ap: 'teste123' | 'teste456', extras: object[] = []) {
  const base = ap === 'teste123' ? { forma: 'amuleto de prova', nome: 'Tell Usuário Teste', n: 1 } : { forma: 'amuleto', nome: 'Tell Usuário', n: 3 }
  const linhas = [
    { v: 1, id: `${ap}-1-0`, hlc: hlcDe(base.n, ap), aparelho: ap, tipo: 'verbete', reg: `GL-${ap}-1`, op: 'criar', campos: { forma: base.forma, status: 'proposed' } },
    { v: 1, id: `${ap}-1-1`, hlc: hlcDe(base.n + 1, ap), aparelho: ap, tipo: 'sitio', reg: `SI-${ap}-1`, op: 'criar', campos: { nome: base.nome } },
    ...extras,
  ]
  dropbox.enviados.set(`usuario/diario/${ap}/000001.jsonl`, Buffer.from(linhas.map((l) => `${JSON.stringify(l)}\n`).join('')))
}

test('decisão 51: duas origens geraram a mesma entrada; «Excluir os seus 2 …» exclui as duas, e a confirmação diz que saem juntas', async ({ page, dropbox }, info) => {
  pacoteComSegundaOrigem(dropbox, info)
  diarioDe(dropbox, 'teste123')
  diarioDe(dropbox, 'teste456')
  await entrar(page)

  for (const { url, titulo, plural, oSeu, este } of [
    { url: '#/verbete/GL-900010', titulo: 'Este verbete veio de você', plural: 'verbetes', oSeu: 'verbete', este: 'este verbete' },
    { url: '#/sitio/TESTE-3', titulo: 'Este sítio veio de você', plural: 'sítios', oSeu: 'sitio', este: 'este sítio' },
  ]) {
    await page.goto(url)
    const bloco = page.getByRole('region', { name: titulo })
    await expect(bloco.getByRole('button', { name: `Excluir os seus 2 ${plural}` })).toBeVisible({ timeout: 30_000 })
    await expect(bloco.getByRole('button', { name: /Excluir o seu / })).toHaveCount(0)
    await bloco.getByRole('button', { name: `Excluir os seus 2 ${plural}` }).click()
    const confirmar = bloco.getByRole('group', { name: `Excluir os seus 2 ${plural}?` })
    await expect(confirmar.getByRole('paragraph')).toHaveText(new RegExp(`^Os 2 ${plural} seus \\(«.+», «.+»\\) são excluídos juntos: enquanto um deles existir, ${este} continua nos livros\\. `))
    await alvosEFontes(page, bloco)
    await semRolagemHorizontal(page, `${oSeu}: a confirmação de duas origens`)
    await mesmaCaixaDoSitio(confirmar)
    await foto(page, `r3-d50-${oSeu}-duas-2-confirmar`, bloco)
    await confirmar.getByRole('button', { name: 'Excluir', exact: true }).click()
    await expect(bloco.getByRole('status')).toHaveText(`Você excluiu os seus 2 ${plural}. Sai dos livros na próxima importação. Até lá, «Restaurar» fica aqui.`)
    await bloco.getByRole('button', { name: 'Restaurar' }).click()
    await expect(bloco.getByRole('button', { name: `Excluir os seus 2 ${plural}` })).toBeVisible()
  }
})

/** O que a tela diz de cada vez, para o verbete e para o sítio (a mesma estrutura, outras palavras). */
const DOIS_TIPOS = [
  { url: '#/verbete/GL-900010', titulo: 'Este verbete veio de você', singular: 'verbete', plural: 'verbetes', oSeu: 'verbete', este: 'este verbete', nome: 'amuleto de prova', nomeB: 'amuleto', reg: 'GL-teste123-1', tipo: 'verbete' },
  { url: '#/sitio/TESTE-3', titulo: 'Este sítio veio de você', singular: 'sítio', plural: 'sítios', oSeu: 'sitio', este: 'este sítio', nome: 'Tell Usuário Teste', nomeB: 'Tell Usuário', reg: 'SI-teste123-1', tipo: 'sitio' },
] as const

test('T17-C-20: uma origem ainda não chegou e a sincronização está em dia: o texto e «Retirar dos livros mesmo assim» (2C, bloco 1, Tarefa 4); sem Excluir', async ({ page, dropbox }, info) => {
  pacoteComSegundaOrigem(dropbox, info)
  diarioDe(dropbox, 'teste123') // o diário de teste456 não existe neste aparelho
  await entrar(page)
  for (const t of DOIS_TIPOS) {
    await page.goto(t.url)
    const bloco = page.getByRole('region', { name: t.titulo })
    await expect(bloco).toBeVisible({ timeout: 30_000 })
    await expect(bloco).toContainText(
      `Falta neste aparelho 1 ${t.singular} seu que leva a esta entrada. Se ele não chegou depois de sincronizar, pode ter se perdido. Você pode retirar a entrada dos livros mesmo assim: os seus ${t.plural} que levam a ela vão para Excluídos, e ela sai dos livros na próxima importação.`,
    )
    await expect(bloco.getByRole('button', { name: /Excluir/ })).toHaveCount(0) // sem Excluir
    await alvosEFontes(page, bloco)
    await semRolagemHorizontal(page, `${t.oSeu}: origem que não chegou`)
    await foto(page, `t4-${t.oSeu}-1-texto`, bloco)
    await bloco.getByRole('button', { name: 'Retirar dos livros mesmo assim' }).click()
    const confirmar = bloco.getByRole('group', { name: 'Retirar dos livros mesmo assim?' })
    await expect(confirmar.getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await expect(confirmar.getByRole('button', { name: 'Retirar', exact: true })).toBeVisible()
    await alvosEFontes(page, bloco)
    await semRolagemHorizontal(page, `${t.oSeu}: confirmação de retirar`)
    await mesmaCaixaDoSitio(confirmar)
    await foto(page, `t4-${t.oSeu}-2-confirmar`, bloco)
    await confirmar.getByRole('button', { name: 'Cancelar' }).click()
    await expect(bloco.getByRole('button', { name: 'Retirar dos livros mesmo assim' })).toBeFocused()
  }
})

test('T17-C-20: a única origem presente já foi excluída e outra ainda não chegou: o aviso diz que continua nos livros, com Restaurar', async ({ page, dropbox }, info) => {
  pacoteComSegundaOrigem(dropbox, info)
  diarioDe(dropbox, 'teste123', [
    { v: 1, id: 'teste123-1-2', hlc: hlcDe(10, 'teste123'), aparelho: 'teste123', tipo: 'verbete', reg: 'GL-teste123-1', op: 'excluir', campos: {} },
    { v: 1, id: 'teste123-1-3', hlc: hlcDe(11, 'teste123'), aparelho: 'teste123', tipo: 'sitio', reg: 'SI-teste123-1', op: 'excluir', campos: {} },
  ])
  await entrar(page)
  for (const t of DOIS_TIPOS) {
    await page.goto(t.url)
    const bloco = page.getByRole('region', { name: t.titulo })
    await expect(bloco).toBeVisible({ timeout: 30_000 })
    // revisão 1 da Tarefa 4: com a sincronização em dia, o aviso é o texto da §5 (estado sem desenho aprovado), com Restaurar e a retirada
    await expect(bloco.getByRole('status')).toHaveText(
      `Falta neste aparelho 1 ${t.singular} seu que leva a esta entrada. Se ele não chegou depois de sincronizar, pode ter se perdido. Você pode retirar a entrada dos livros mesmo assim: os seus ${t.plural} que levam a ela vão para Excluídos, e ela sai dos livros na próxima importação.`,
    )
    await expect(bloco).not.toContainText('Sincronize para vê-lo')
    await expect(bloco.getByRole('button', { name: 'Restaurar' })).toBeVisible()
    await expect(bloco.getByRole('button', { name: /Excluir/ })).toHaveCount(0)
    await expect(bloco.getByRole('button', { name: 'Retirar dos livros mesmo assim' })).toBeVisible()
    await comEspaco(bloco.getByRole('button', { name: 'Restaurar' }), bloco.getByRole('button', { name: 'Retirar dos livros mesmo assim' }), `${t.oSeu}: Restaurar e Retirar`)
    await alvosEFontes(page, bloco)
    await semRolagemHorizontal(page, `${t.oSeu}: excluída, outra por chegar`)
    await foto(page, `t4-r1-${t.oSeu}-excluida-faltando-1-texto`, bloco)
    await bloco.getByRole('button', { name: 'Retirar dos livros mesmo assim' }).click()
    const confirmar = bloco.getByRole('group', { name: 'Retirar dos livros mesmo assim?' })
    await expect(confirmar.getByRole('button', { name: 'Cancelar' })).toBeFocused()
    // a caixa fica embaixo de «Restaurar», com espaço
    const restaurar = (await bloco.getByRole('button', { name: 'Restaurar' }).boundingBox())!
    expect((await confirmar.boundingBox())!.y - (restaurar.y + restaurar.height), `${t.oSeu}: espaço sob Restaurar`).toBeGreaterThanOrEqual(8 - 0.5)
    await alvosEFontes(page, bloco)
    await semRolagemHorizontal(page, `${t.oSeu}: excluída, outra por chegar, confirmação`)
    await foto(page, `t4-r1-${t.oSeu}-excluida-faltando-2-confirmar`, bloco)
    await confirmar.getByRole('button', { name: 'Cancelar' }).click()
    await expect(bloco.getByRole('button', { name: 'Retirar dos livros mesmo assim' })).toBeFocused()
  }
})

test('N-1 (revisão final): nenhuma origem chegou; retirar e depois restaurar: o bloco fica, pede para sincronizar, e o foco vai ao texto', async ({ page, dropbox }, info) => {
  pacoteComSegundaOrigem(dropbox, info) // nenhum diário: as duas origens de GL-900010 faltam neste aparelho
  await entrar(page)
  await page.goto('#/verbete/GL-900010')
  const bloco = page.getByRole('region', { name: 'Este verbete veio de você' })
  await bloco.getByRole('button', { name: 'Retirar dos livros mesmo assim' }).click({ timeout: 30_000 })
  await bloco.getByRole('group', { name: 'Retirar dos livros mesmo assim?' }).getByRole('button', { name: 'Retirar', exact: true }).click()
  await expect(bloco.getByRole('status')).toHaveText('Você excluiu os seus 2 verbetes. Sai dos livros na próxima importação. Até lá, «Restaurar» fica aqui.')
  await bloco.getByRole('button', { name: 'Restaurar' }).click()
  // o restaurar está por enviar: o bloco não some; diz o que falta e pede para sincronizar, com o foco no texto
  const texto = bloco.getByText(/^Faltam neste aparelho 2 verbetes seus/)
  await expect(texto).toHaveText('Faltam neste aparelho 2 verbetes seus que levam a esta entrada. Sincronize para vê-los; enquanto um deles existir, este verbete continua nos livros.')
  await expect(texto).toBeFocused()
  await semRolagemHorizontal(page, 'N-1 depois de restaurar')
  await foto(page, 't4-n1-depois-de-restaurar', bloco)
})

test('P7 (aprovação): duas origens com o mesmo nome: o nome aparece uma vez («de 2 verbetes seus («amuleto de prova»)»)', async ({ page, dropbox }, info) => {
  pacoteComSegundaOrigem(dropbox, info)
  for (const ap of ['teste123', 'teste456'] as const) {
    const linha = { v: 1, id: `${ap}-1-0`, hlc: hlcDe(ap === 'teste123' ? 1 : 2, ap), aparelho: ap, tipo: 'verbete', reg: `GL-${ap}-1`, op: 'criar', campos: { forma: 'amuleto de prova', status: 'proposed' } }
    dropbox.enviados.set(`usuario/diario/${ap}/000001.jsonl`, Buffer.from(`${JSON.stringify(linha)}\n`))
  }
  await entrar(page)
  await page.goto('#/verbete/GL-900010')
  const bloco = page.getByRole('region', { name: 'Este verbete veio de você' })
  await expect(bloco.getByText(/^Publicado a partir/)).toHaveText(
    'Publicado a partir de 2 verbetes seus («amuleto de prova»). Se você os excluir, ele sai dos livros na próxima importação.',
    { timeout: 30_000 },
  )
  await bloco.getByRole('button', { name: 'Excluir os seus 2 verbetes' }).click()
  const confirmar = bloco.getByRole('group', { name: 'Excluir os seus 2 verbetes?' })
  await expect(confirmar).toContainText('Os 2 verbetes seus («amuleto de prova») são excluídos juntos')
  await semRolagemHorizontal(page, 'P7: nome único')
  await foto(page, 't4-p7-nome-unico', bloco)
})

test('T17-C-20: duas origens presentes, uma já excluída: o texto diz qual, e «Excluir o seu …» exclui só a viva', async ({ page, dropbox }, info) => {
  pacoteComSegundaOrigem(dropbox, info)
  diarioDe(dropbox, 'teste123', [
    { v: 1, id: 'teste123-1-2', hlc: hlcDe(10, 'teste123'), aparelho: 'teste123', tipo: 'verbete', reg: 'GL-teste123-1', op: 'excluir', campos: {} },
    { v: 1, id: 'teste123-1-3', hlc: hlcDe(11, 'teste123'), aparelho: 'teste123', tipo: 'sitio', reg: 'SI-teste123-1', op: 'excluir', campos: {} },
  ])
  diarioDe(dropbox, 'teste456')
  await entrar(page)
  for (const t of DOIS_TIPOS) {
    await page.goto(t.url)
    const bloco = page.getByRole('region', { name: t.titulo })
    await expect(bloco).toBeVisible({ timeout: 30_000 })
    await expect(bloco).toContainText(`Publicado a partir de 2 ${t.plural} seus (`)
    await expect(bloco).toContainText(`Você já excluiu «${t.nome}»; se excluir «${t.nomeB}», ele sai dos livros na próxima importação.`)
    const excluir = bloco.getByRole('button', { name: `Excluir o seu ${t.singular}` })
    await expect(excluir).toBeVisible()
    await alvosEFontes(page, bloco)
    await semRolagemHorizontal(page, `${t.oSeu}: duas origens, uma excluída`)
    await foto(page, `E-2-${t.oSeu}-misto-antes`, bloco)
    await excluir.click()
    const confirmar = bloco.getByRole('group', { name: `Excluir o seu ${t.singular} «${t.nomeB}»?` })
    await expect(confirmar).toBeVisible()
    await semRolagemHorizontal(page, `${t.oSeu}: misto, confirmação`)
    await foto(page, `E-2-${t.oSeu}-misto-confirmar`, bloco)
    await confirmar.getByRole('button', { name: 'Excluir', exact: true }).click()
    await expect(bloco.getByRole('status')).toContainText('Sai dos livros na próxima importação.')
    await foto(page, `E-3-${t.oSeu}-misto-depois`, bloco)
    // «Restaurar» devolve as duas (o comportamento de hoje, a decisão E-3 do usuário): fica registrado aqui
    await bloco.getByRole('button', { name: 'Restaurar' }).click()
    await expect(bloco.getByRole('button', { name: /^Excluir os seus 2 / })).toBeVisible()
  }
})
