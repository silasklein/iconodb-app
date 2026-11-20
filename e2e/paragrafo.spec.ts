import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Etapa 4, Tarefa 25: a página do § no navegador de verdade, nos dois tamanhos, sobre o pacote sintético (o TESTEG, modelo do
 * GGG, e o TESTEGEN, modelo do GGIG). Da figura F200001 («Discutida em») ao § 2: o português, as figuras citadas, o alemão e o
 * inglês (trilhos no computador, abas no celular), «Mostrar o que foi corrigido» com o cartão do lido, ‹ › até o § 3 e o
 * «‹ Figura TESTEG: 1a» de volta à figura (decisão 85). Tudo inventado (repositório público).
 */
const celular = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

const semRolagemHorizontal = async (page: Page, tela: string) => {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}

async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}

/** Abre o alemão: o trilho no computador, a aba DE no celular. */
async function abrirAlemao(page: Page) {
  if (celular(page)) await page.getByRole('tab', { name: 'DE' }).click()
  else await page.getByRole('button', { name: 'Abrir o alemão' }).click()
  const de = page.getByRole('region', { name: 'Alemão' })
  await expect(de).toBeVisible()
  return de
}

test('da figura ao § 2: o português, o alemão corrigido com o cartão do lido, ‹ › e a volta à figura', async ({ page }) => {
  await entrar(page)
  await page.goto('#/item/F200001')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TESTEG: 1a')
  const voz = page.getByRole('region', { name: 'Leituras' }).getByRole('group', { name: 'TESTEG: 1a' })
  // a referência à figura destacada na frase e o caminho do § em português (Tarefa 25)
  await expect(voz.locator('.discutida-fig')).toHaveText('(Abb. 1a)')
  await expect(voz.locator('.discutida-onde')).toHaveText('I. Época de teste e imagens de prova › 1. Selos de prova da fase de teste')
  await voz.getByRole('link', { name: /§ 2/ }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TESTEG § 2')
  await expect(page).toHaveURL(/#\/paragrafo\/TESTEG\/2$/)
  await expect(page.getByTestId('paragrafo-caminho')).toHaveText('TESTEG · I. Época de teste e imagens de prova › 1. Selos de prova da fase de teste')
  await expect(page.getByTestId('paragrafo-meta')).toHaveText('p. 6 · primeiro de 2 §§ da seção')
  // fundo claro, como as telas de consulta (decisão 91, a5)
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  const figuras = page.getByRole('region', { name: 'Figuras citadas' })
  await expect(figuras.getByRole('link')).toHaveCount(2)
  const pt = page.getByRole('region', { name: 'Português' })
  await expect(pt).toContainText('Dois selos de prova de Maḥteṣ Teste mostram um leão-de-teste (Abb. 1a)')
  await expect(pt.getByRole('link', { name: 'leão-de-teste' })).toBeVisible()
  await expect(pt.getByRole('list', { name: 'Notas' })).toContainText('Nota de prova sobre a gravação de teste')
  if (celular(page)) {
    await expect(page.getByRole('tablist', { name: 'Língua' }).getByRole('tab')).toHaveText(['PT', 'DE', 'EN'])
    await expect(page.getByRole('link', { name: 'Voltar (Figura TESTEG: 1a)' })).toBeVisible()
  } else {
    // abre só com o português (a4): os trilhos fechados ao lado
    await expect(page.getByRole('region', { name: 'Alemão' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Abrir o inglês' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Origem' }).getByRole('link', { name: 'Figura TESTEG: 1a' })).toBeVisible()
  }
  await semRolagemHorizontal(page, 'o § em português')

  const de = await abrirAlemao(page)
  await expect(de).toContainText('Zwei Probesiegel aus Maḥteṣ Teste zeigen einen Testlöwen (Abb. 1a)')
  const chave = de.getByRole('switch', { name: /Mostrar o que foi corrigido/ })
  await chave.click()
  await expect(chave).toHaveAttribute('aria-checked', 'true')
  const corrigidas = de.locator('.paragrafo-corrigido')
  await expect(corrigidas).toHaveText(['Maḥteṣ', 'Pl.'])
  // o sublinhado duplo (o estilo das correções)
  await expect(corrigidas.first()).toHaveCSS('text-decoration-style', 'double')
  await de.getByRole('button', { name: 'Pl.' }).click()
  const cartao = page.getByRole('dialog', { name: 'O que foi lido' })
  await expect(cartao).toBeVisible()
  await expect(cartao.getByRole('definition')).toHaveText(['«PI.»', '«Pl.»', '«I» maiúsculo lido no lugar de «l» em «Pl.»'])
  // o cartão fica dentro da janela
  const caixa = (await cartao.boundingBox())!
  const largura = page.viewportSize()!.width
  expect(caixa.x).toBeGreaterThanOrEqual(0)
  expect(caixa.x + caixa.width).toBeLessThanOrEqual(largura)
  await semRolagemHorizontal(page, 'o cartão do lido')
  await page.keyboard.press('Escape')
  await expect(cartao).toHaveCount(0)

  if (!celular(page)) {
    // as três línguas lado a lado, o primeiro trecho na mesma altura nas três
    await page.getByRole('button', { name: 'Abrir o inglês' }).click()
    const en = page.getByRole('region', { name: 'Inglês' })
    await expect(en).toContainText('Two probe seals from Mahtes Teste')
    // a página do inglês vem do banco da tradução (fix 1)
    await expect(en).toContainText('TESTEGEN 2022 § 2, p. 6 · lido e corrigido')
    const topos = await Promise.all(['Alemão', 'Português', 'Inglês'].map(async (n) => (await page.getByRole('region', { name: n }).locator('.paragrafo-trecho').first().boundingBox())!.y))
    expect(Math.max(...topos) - Math.min(...topos)).toBeLessThan(2)
    const colunas = await Promise.all(['Alemão', 'Português', 'Inglês'].map(async (n) => (await page.getByRole('region', { name: n }).boundingBox())!.x))
    expect(colunas[0]).toBeLessThan(colunas[1]!)
    expect(colunas[1]).toBeLessThan(colunas[2]!)
    await semRolagemHorizontal(page, 'as três línguas')
    // o aparelho lembra a escolha
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('TESTEG § 2')
    await expect(page.getByRole('region', { name: 'Alemão' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Inglês' })).toBeVisible()
    await page.getByRole('button', { name: 'Fechar o inglês' }).click()
    await page.getByRole('button', { name: 'Fechar o alemão' }).click()
    await expect(page.getByRole('button', { name: 'Abrir o alemão' })).toBeVisible()
  }

  // ‹ › anda em ordem: o § 3, com «ler a seção do começo»
  await page.getByRole('navigation', { name: '§§ vizinhos' }).getByRole('link', { name: '§ 3' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TESTEG § 3')
  await expect(page.getByTestId('paragrafo-meta')).toHaveText('p. 7 · segundo de 2 §§ da seção · ler a seção do começo')
  await expect(page.getByRole('region', { name: 'Figuras citadas' }).getByRole('link')).toHaveText([/TESTEG: 2/])
  await semRolagemHorizontal(page, 'o § 3')

  // a volta à figura (decisão 85)
  if (celular(page)) await page.getByRole('link', { name: 'Voltar (Figura TESTEG: 1a)' }).click()
  else await page.getByRole('navigation', { name: 'Origem' }).getByRole('link', { name: 'Figura TESTEG: 1a' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TESTEG: 1a')
  await expect(page).toHaveURL(/#\/item\/F200001$/)
})

test('o § aberto por link direto: sem origem; no celular o Voltar vai à seção', async ({ page }) => {
  await entrar(page)
  await page.goto('#/paragrafo/TESTEG/1')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TESTEG § 1')
  await expect(page.getByTestId('paragrafo-meta')).toHaveText('p. 5 · o único § do capítulo')
  await expect(page.getByRole('navigation', { name: 'Origem' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Figuras citadas' })).toHaveCount(0)
  const pe = page.getByRole('navigation', { name: '§ anterior e seguinte' })
  await expect(pe.getByRole('link')).toHaveCount(1)
  await expect(pe.getByRole('link')).toContainText('§ 2 ›')
  if (celular(page)) await expect(page.getByRole('link', { name: 'Voltar ao capítulo' })).toHaveAttribute('href', '#/grupo/GR-TESTEG-01')
  await semRolagemHorizontal(page, 'o § 1')
})
