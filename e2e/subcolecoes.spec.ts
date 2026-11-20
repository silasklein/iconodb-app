import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Subcoleções do pacote sintético 9 (GR-TESTE-I-01 com «1.1» e a faixa «1.2–1.3») no navegador de verdade, nos dois
 * tamanhos. Com SHOTS_DIR definido, guarda capturas da tela nessa pasta.
 */
const semRolagemHorizontal = async (page: Page, tela: string) => {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}
async function foto(page: Page, nome: string, ver?: Locator) {
  const pasta = process.env.SHOTS_DIR
  if (!pasta) return
  mkdirSync(pasta, { recursive: true })
  await ver?.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await page.screenshot({ path: join(pasta, `${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}

/**
 * Põe a faixa mais longa do sumário real («1.19–1.23», 9 caracteres) na célula do número e diz em quantas linhas ela fica
 * e se passa da sua coluna. O pacote TESTE só tem «1.2–1.3» (7).
 */
async function faixaLonga(numero: Locator) {
  return numero.evaluate((el) => {
    el.textContent = '1.19–1.23'
    const r = document.createRange()
    r.selectNodeContents(el)
    return { linhas: r.getClientRects().length, transborda: el.scrollWidth > el.clientWidth }
  })
}

async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}

test('Coleções → grupo com subcoleções: a linha diz «2 subcoleções», e o grupo lista as duas', async ({ page }) => {
  await entrar(page)

  // A aba da obra: o grupo com subcoleções diz quantas; o outro, não.
  await page.goto('#/colecoes?obra=TESTE-I')
  const linha = page.getByRole('link', { name: /Animais de teste e figuras de prova/ })
  await expect(linha).toContainText('2 subcoleções')
  await expect(page.getByRole('link', { name: /Selos de prova e padrões denteados/ })).not.toContainText('subcole')
  // decisão 81: o número do livro antes do título só no grupo com subcoleções
  await expect(linha.locator('.colecoes-grupo-nome')).toHaveText('1. Animais de teste e figuras de prova')
  await expect(page.getByRole('link', { name: /Selos de prova e padrões denteados/ }).locator('.colecoes-grupo-nome')).toHaveText('Selos de prova e padrões denteados')
  await semRolagemHorizontal(page, 'Coleções')
  await foto(page, 'subcolecoes-1-colecoes')

  // O grupo: a seção «Subcoleções» com as duas, em ordem, e a grade «Todos os objetos».
  await linha.click()
  await expect(page.getByRole('heading', { level: 1, name: '1. Animais de teste e figuras de prova', exact: true })).toBeVisible()
  if ((page.viewportSize()?.width ?? 0) >= 768) {
    // No computador, o grupo é o dividido: «Todos» e as duas na lista à esquerda, a grade do grupo à direita.
    const lista = page.getByRole('navigation', { name: 'Subcoleções' })
    await expect(lista.getByRole('link')).toHaveCount(3)
    await expect(lista.getByRole('link').nth(0)).toHaveAccessibleName('Todos os objetos do grupo, 3 objetos')
    await expect(lista.getByRole('link').nth(1)).toHaveAccessibleName('1.1 Animais de prova, 1 objeto')
    await expect(lista.getByRole('link').nth(2)).toHaveAccessibleName('1.2–1.3 Figuras de prova e sinais de teste, 1 objeto')
    await expect(page.getByRole('heading', { level: 2, name: 'Todos os objetos 3' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Objetos do grupo' }).getByRole('link', { name: /CA\d{5}/ })).toHaveCount(3)
    await semRolagemHorizontal(page, 'Grupo dividido')
    // A faixa mais longa do sumário cabe numa linha, sem quebrar o número.
    expect(await faixaLonga(lista.getByRole('link').nth(1).locator('.grupo-dividido-linha-numero'))).toEqual({ linhas: 1, transborda: false })
    return
  }
  const secao = page.getByRole('region', { name: 'Subcoleções' })
  const subs = secao.getByRole('link')
  await expect(subs).toHaveCount(2)
  await expect(subs.nth(0)).toHaveAccessibleName('1.1 Animais de prova, 1 objeto')
  await expect(subs.nth(1)).toHaveAccessibleName('1.2–1.3 Figuras de prova e sinais de teste, 1 objeto')
  await expect(page.getByRole('heading', { level: 2, name: 'Todos os objetos 3' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Objetos do grupo' }).getByRole('link')).toHaveCount(3)
  await semRolagemHorizontal(page, 'Grupo')
  await foto(page, 'subcolecoes-2-grupo-topo')
  await foto(page, 'subcolecoes-3-grupo-lista', secao)
  // A faixa mais longa do sumário cabe numa linha, sem quebrar o número.
  expect(await faixaLonga(subs.nth(0).locator('.grupo-subcolecao-numero'))).toEqual({ linhas: 1, transborda: false })

  // A linha leva à subcoleção.
  await subs.nth(1).click()
  await expect(page).toHaveURL(/#\/grupo\/GR-TESTE-I-01-02$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Figuras de prova e sinais de teste' })).toBeVisible()
})

test('celular: a subcoleção pelo grupo, a introdução, «←» até a 1.1 e de volta ao grupo', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'no computador a subcoleção abre dentro do grupo (Tarefa 12)')
  await entrar(page)

  // Coleções → o grupo → a «1.2–1.3».
  await page.goto('#/colecoes?obra=TESTE-I')
  await page.getByRole('link', { name: /Animais de teste e figuras de prova/ }).click()
  await page.getByRole('region', { name: 'Subcoleções' }).getByRole('link', { name: /^1\.2–1\.3 / }).click()
  await expect(page).toHaveURL(/#\/grupo\/GR-TESTE-I-01-02$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Figuras de prova e sinais de teste' })).toBeVisible()
  await expect(page.getByText('TESTE I · Calcolítico (fase de teste) · 1.2–1.3')).toBeVisible()
  await expect(page.getByText('1 objeto · subcoleção 2 de 2')).toBeVisible()
  await expect(page.getByRole('main')).toHaveCount(1)
  await semRolagemHorizontal(page, 'Subcoleção')
  await foto(page, 'subcolecoes-4-subcolecao-topo')

  // A introdução: um trecho; «Ler a introdução» abre os dois.
  const caixa = page.getByRole('region', { name: 'Introdução · o texto do autor sobre 1.2–1.3' })
  await expect(caixa.locator('p')).toHaveCount(1)
  await caixa.getByRole('button', { name: 'Ler a introdução' }).click()
  await expect(caixa.locator('p')).toHaveCount(2)
  await expect(caixa.getByRole('button', { name: 'Recolher a introdução' })).toHaveAttribute('aria-expanded', 'true')
  await semRolagemHorizontal(page, 'Subcoleção, introdução aberta')
  await foto(page, 'subcolecoes-5-subcolecao-introducao', caixa)

  // A grade e o pé: só a anterior.
  await expect(page.getByRole('region', { name: 'Objetos da subcoleção' }).getByRole('link')).toHaveCount(1)
  const vizinhas = page.getByRole('navigation', { name: 'Subcoleções vizinhas' })
  await expect(vizinhas.getByRole('link', { name: /^Próxima subcoleção/ })).toHaveCount(0)
  await foto(page, 'subcolecoes-6-subcolecao-pe', vizinhas)

  // «←» até a 1.1: a introdução volta fechada, e o pé só tem a próxima.
  await vizinhas.getByRole('link', { name: 'Subcoleção anterior: 1.1 Animais de prova' }).click()
  await expect(page).toHaveURL(/#\/grupo\/GR-TESTE-I-01-01$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Animais de prova' })).toBeVisible()
  await expect(page.getByText('1 objeto · subcoleção 1 de 2')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ler a introdução' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('link', { name: 'Próxima subcoleção: 1.2–1.3 Figuras de prova e sinais de teste' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Subcoleção anterior/ })).toHaveCount(0)
  await semRolagemHorizontal(page, 'Subcoleção 1.1')
  await foto(page, 'subcolecoes-7-subcolecao-primeira')
  await foto(page, 'subcolecoes-8-subcolecao-primeira-pe', page.getByRole('navigation', { name: 'Subcoleções vizinhas' }))

  // E de volta ao grupo pelo link do topo: ele volta no histórico (não empilha o grupo), então o «Voltar às coleções»
  // do grupo chega às Coleções, e não à subcoleção (o laço da revisão da Tarefa 10).
  const volta = page.getByRole('link', { name: '1. Animais de teste e figuras de prova', exact: true })
  await expect(volta).toHaveCSS('column-gap', '4.5px') // o espaço depois do «‹» (0,3em de 15px)
  await volta.click()
  await expect(page).toHaveURL(/#\/grupo\/GR-TESTE-I-01$/)
  await expect(page.getByRole('heading', { level: 1, name: '1. Animais de teste e figuras de prova', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Voltar às coleções' }).click()
  await expect(page).toHaveURL(/#\/colecoes\?obra=TESTE-I$/)
})

test('objeto: da subcoleção, «1 / 1» dentro dela; o «No livro» leva ao grupo; pelo endereço, o grupo de cima', async ({ page }) => {
  const celular = (page.viewportSize()?.width ?? 0) < 768
  await entrar(page)

  // O grupo → a «1.2–1.3» → o objeto dela: a posição anda dentro da subcoleção. (No computador, a lista do grupo
  // dividido; no celular, a seção «Subcoleções».)
  await page.goto('#/colecoes?obra=TESTE-I')
  await page.getByRole('link', { name: /Animais de teste e figuras de prova/ }).click()
  await page.getByRole(celular ? 'region' : 'navigation', { name: 'Subcoleções' }).getByRole('link', { name: /^1\.2–1\.3 / }).click()
  await page.getByRole('link', { name: /CA00002/ }).click()
  await expect(page).toHaveURL(/#\/item\/CA00002$/)
  const posicao = page.getByRole('navigation', { name: 'Posição na subcoleção' })
  await expect(posicao.getByText('1 / 1')).toBeVisible()
  await expect(posicao.getByRole('link', { name: 'Figuras de prova e sinais de teste' })).toHaveAttribute(
    'href',
    celular ? '#/grupo/GR-TESTE-I-01-02' : '#/grupo/GR-TESTE-I-01?sub=GR-TESTE-I-01-02',
  )
  if (celular) await expect(page.getByRole('link', { name: 'Voltar à subcoleção' })).toBeVisible()

  // «No livro»: o nome do livro · o período › o grupo › a subcoleção; o nome em texto, o caminho em links.
  const noLivro = page.getByRole('region', { name: 'No livro' })
  await expect(noLivro.locator('p').first()).toHaveText(/^TESTE I · Calcolítico \(fase de teste\) › /)
  // os links do caminho (embaixo dele, desde a Tarefa 5 da leitura, «Ler no livro»)
  await expect(noLivro.locator('p').first().getByRole('link')).toHaveText(['Calcolítico (fase de teste)', '1. Animais de teste e figuras de prova', '1.2–1.3 Figuras de prova e sinais de teste'])
  await expect(noLivro.getByRole('link', { name: 'Ler no livro' })).toBeVisible()
  await semRolagemHorizontal(page, 'Objeto da subcoleção')
  await foto(page, 'subcolecoes-9-objeto-topo')
  await foto(page, 'subcolecoes-10-objeto-no-livro', noLivro)

  // Com o original alemão, os títulos do livro.
  await page.getByRole('button', { name: 'Mostrar o original alemão' }).click()
  await expect(noLivro.getByRole('link', { name: '1.2–1.3 Prüfgestalten und Testzeichen' })).toBeVisible()
  await foto(page, 'subcolecoes-11-objeto-no-livro-alemao', noLivro)
  await page.getByRole('button', { name: 'Mostrar o original alemão' }).click()

  // O link do grupo abre o grupo.
  await noLivro.getByRole('link', { name: '1. Animais de teste e figuras de prova', exact: true }).click()
  await expect(page).toHaveURL(/#\/grupo\/GR-TESTE-I-01$/)
  await expect(page.getByRole('heading', { level: 1, name: '1. Animais de teste e figuras de prova', exact: true })).toBeVisible()

  // Pelo endereço, sem estado: o contexto é o grupo de cima.
  await page.goto('#/item/CA00002')
  const noGrupo = page.getByRole('navigation', { name: 'Posição no grupo' })
  await expect(noGrupo.getByText('2 / 3')).toBeVisible()
  await expect(noGrupo.getByRole('link', { name: '1. Animais de teste e figuras de prova', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Posição na subcoleção' })).toHaveCount(0)
  if (celular) await expect(page.getByRole('link', { name: 'Voltar ao grupo' })).toBeVisible()
})

test('computador: a lista e a grade lado a lado; ?sub= sobrevive ao objeto, ao voltar e ao recarregar', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 768, 'no celular a subcoleção tem a sua página')
  await entrar(page)

  await page.goto('#/colecoes?obra=TESTE-I')
  await page.getByRole('link', { name: /Animais de teste e figuras de prova/ }).click()
  await expect(page).toHaveURL(/#\/grupo\/GR-TESTE-I-01$/)
  const lista = page.getByRole('navigation', { name: 'Subcoleções' })
  await expect(lista.getByRole('link', { name: /^Todos / })).toHaveAttribute('aria-current', 'true')
  await expect(page.getByText('3 objetos · 2 subcoleções')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Coleções · TESTE I', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Coleções · TESTE I', exact: true })).toHaveCSS('column-gap', /^4\.2\d*px$/) // o espaço depois do «‹» (0,3em de 14px)
  await expect(page.getByRole('main')).toHaveCount(1)
  // A 1280, a grade tem 5 colunas.
  const colunas = await page.locator('.grupo-dividido-grade').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(colunas).toBe(5)
  await semRolagemHorizontal(page, 'Grupo dividido')
  await foto(page, 'subcolecoes-12-mac-todos')
  await page.getByRole('button', { name: 'Ler a introdução', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Introdução do grupo' })).toBeVisible()
  await semRolagemHorizontal(page, 'Grupo dividido, introdução do grupo')
  await foto(page, 'subcolecoes-16-mac-introducao-do-grupo')
  await page.getByRole('button', { name: 'Recolher a introdução', exact: true }).click()

  // Escolher «1.2–1.3»: a grade troca, a rota não; o endereço ganha ?sub= no lugar (sem entrada nova no histórico).
  const entradas = await page.evaluate(() => history.length)
  const escolhida = lista.getByRole('link', { name: /^1\.2–1\.3 / })
  await escolhida.click()
  await expect(page).toHaveURL(/#\/grupo\/GR-TESTE-I-01\?sub=GR-TESTE-I-01-02$/)
  expect(await page.evaluate(() => history.length)).toBe(entradas)
  await expect(escolhida).toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('heading', { level: 2, name: 'Figuras de prova e sinais de teste' })).toBeVisible()
  await expect(page.getByText('1 objeto', { exact: true })).toBeVisible()
  const grade = page.getByRole('region', { name: 'Objetos da subcoleção 1.2–1.3' })
  await expect(grade.getByRole('link', { name: /CA\d{5}/ })).toHaveCount(1)
  await semRolagemHorizontal(page, 'Grupo dividido, 1.2–1.3')
  await foto(page, 'subcolecoes-13-mac-subcolecao')

  // A introdução dela abre à direita.
  await page.getByRole('button', { name: 'Ler a introdução da subcoleção' }).click()
  await expect(page.getByRole('region', { name: 'Introdução da subcoleção' }).locator('p')).toHaveCount(2)
  await foto(page, 'subcolecoes-14-mac-subcolecao-introducao')

  // O objeto: «1 / 1» na subcoleção; voltar devolve o grupo com a mesma escolhida.
  await grade.getByRole('link', { name: /CA00002/ }).click()
  await expect(page).toHaveURL(/#\/item\/CA00002$/)
  await expect(page.getByRole('navigation', { name: 'Posição na subcoleção' }).getByText('1 / 1')).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/#\/grupo\/GR-TESTE-I-01\?sub=GR-TESTE-I-01-02$/)
  await expect(lista.getByRole('link', { name: /^1\.2–1\.3 / })).toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('heading', { level: 2, name: 'Figuras de prova e sinais de teste' })).toBeVisible()

  // Recarregar: continua nela.
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'Figuras de prova e sinais de teste' })).toBeVisible()
  await expect(lista.getByRole('link', { name: /^1\.2–1\.3 / })).toHaveAttribute('aria-current', 'true')

  // «Todos» volta aos 3 e tira o ?sub=.
  await lista.getByRole('link', { name: /^Todos / }).click()
  await expect(page).toHaveURL(/#\/grupo\/GR-TESTE-I-01$/)
  await expect(page.getByRole('region', { name: 'Objetos do grupo' }).getByRole('link', { name: /CA\d{5}/ })).toHaveCount(3)

  // O endereço da subcoleção vira o do grupo com ?sub=.
  await page.goto('#/grupo/GR-TESTE-I-01-02')
  await expect(page).toHaveURL(/#\/grupo\/GR-TESTE-I-01\?sub=GR-TESTE-I-01-02$/)
  await expect(page.getByRole('heading', { level: 1, name: '1. Animais de teste e figuras de prova', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Figuras de prova e sinais de teste' })).toBeVisible()

  // Um sub que não é do grupo vale «Todos».
  await page.goto('#/grupo/GR-TESTE-I-01?sub=GR-TESTE-I-02')
  await expect(page.getByRole('heading', { level: 2, name: 'Todos os objetos 3' })).toBeVisible()
  await expect(lista.getByRole('link', { name: /^Todos / })).toHaveAttribute('aria-current', 'true')
})

test('computador, janela baixa: ao chegar com ?sub= e ao voltar do objeto, a escolhida aparece na lista', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 768, 'no celular a subcoleção tem a sua página')
  await entrar(page)
  // 360 px de altura: a lista começa abaixo da dobra da coluna, e a «1.2–1.3» fica fora da vista sem o ajuste.
  await page.setViewportSize({ width: 1280, height: 360 })
  await page.goto('#/grupo/GR-TESTE-I-01-02')
  await expect(page).toHaveURL(/#\/grupo\/GR-TESTE-I-01\?sub=GR-TESTE-I-01-02$/)
  const escolhida = page.getByRole('navigation', { name: 'Subcoleções' }).getByRole('link', { name: /^1\.2–1\.3 / })
  await expect(escolhida).toHaveAttribute('aria-current', 'true')
  await expect(escolhida).toBeInViewport({ ratio: 1 })
  // Só a coluna rolou: a janela, não; e o foco não foi para a linha.
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await expect(escolhida).not.toBeFocused()
  await foto(page, 'subcolecoes-17-mac-janela-baixa')

  // O objeto e de volta: a coluna monta de novo e a escolhida aparece outra vez.
  await page.getByRole('region', { name: 'Objetos da subcoleção 1.2–1.3' }).getByRole('link', { name: /CA00002/ }).click()
  await expect(page).toHaveURL(/#\/item\/CA00002$/)
  await page.goBack()
  await expect(page).toHaveURL(/#\/grupo\/GR-TESTE-I-01\?sub=GR-TESTE-I-01-02$/)
  await expect(escolhida).toBeInViewport({ ratio: 1 })
})

test('celular: o grupo com ?sub= vira a página da subcoleção', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'no computador ?sub= escolhe na lista do grupo')
  await entrar(page)
  await page.goto('#/grupo/GR-TESTE-I-01?sub=GR-TESTE-I-01-02')
  await expect(page).toHaveURL(/#\/grupo\/GR-TESTE-I-01-02$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Figuras de prova e sinais de teste' })).toBeVisible()
  await expect(page.getByText('1 objeto · subcoleção 2 de 2')).toBeVisible()
  await semRolagemHorizontal(page, 'Subcoleção pelo ?sub=')
  await foto(page, 'subcolecoes-15-celular-sub')
})
