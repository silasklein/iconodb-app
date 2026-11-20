import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Etapa 4, Tarefa 26: o livro em parágrafos (o `TESTEG`, modelo do GGG, e o `TESTEGEN`, modelo do GGIG) nas Coleções, na Busca,
 * na Bibliografia, no «No livro» e no mapa, no navegador de verdade, nos dois tamanhos, sobre o pacote sintético (telas 3–7
 * aprovadas). O mapa abre a figura sintética `TESTEG-0002` (objeto F200002), cujo achado «do texto» vem do § 3 (decisão 90.1).
 * Tudo inventado (repositório público).
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

test('Coleções: a aba do livro, o capítulo com «Ler o capítulo», a seção com «Ler a seção» e os §§ em sequência', async ({ page }) => {
  await entrar(page)
  await page.goto('#/colecoes')
  const abas = page.getByRole('navigation', { name: 'Obras' })
  // a tradução (TESTEGEN) não é aba
  await expect(abas.getByRole('link')).toHaveText(['SKC', 'TESTE I', 'TESTEG'])
  await abas.getByRole('link', { name: 'TESTEG' }).click()
  const capitulo = page.getByRole('link', { name: /I\. Época de teste e imagens de prova/ })
  await expect(capitulo).toContainText('3 figuras · 1 seção · §§ 1–3')
  await semRolagemHorizontal(page, 'a aba do livro')
  await capitulo.click()

  await expect(page.getByRole('heading', { level: 1, name: 'I. Época de teste e imagens de prova' })).toBeVisible()
  await expect(page.getByText('TESTEG · Capítulo I')).toBeVisible()
  const ler = page.getByRole('link', { name: /^Ler o capítulo/ })
  await expect(ler).toContainText('§§ 1–3, em sequência')
  await semRolagemHorizontal(page, 'o capítulo')

  // a seção: no computador, escolhida na lista ao lado; no celular, a página dela
  await page.getByRole(celular(page) ? 'region' : 'navigation', { name: 'Seções' }).getByRole('link', { name: /Selos de prova da fase de teste/ }).click()
  await expect(page.getByText('TESTEG · Seção 1')).toBeVisible()
  const paragrafos = page.getByRole('list', { name: '§§ desta seção' })
  await expect(paragrafos.getByRole('link')).toHaveCount(2)
  await expect(paragrafos.getByRole('link').first()).toContainText('Dois selos de prova de Maḥteṣ Teste')
  const cartao = page.getByRole('region', { name: 'Figuras da seção' }).getByRole('link', { name: /F200002/ })
  await expect(cartao).toBeVisible()
  // fix 1 (I1): a figura sem tipo mostra o rótulo dela na linha do tipo, nos dois tamanhos
  await expect(cartao.locator('.cartao-tipo')).toHaveText('TESTEG: 2')
  await expect(cartao.locator('.cartao-sitio')).toHaveText('Tell Achado Teste')
  await semRolagemHorizontal(page, 'a seção')

  // «Ler a seção» abre o primeiro § da seção, e › segue em ordem (a8)
  await page.getByRole('link', { name: 'Ler a seção' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TESTEG § 2')
  await expect(page.getByTestId('paragrafo-meta')).toContainText('primeiro de 2 §§ da seção')
  await page.getByRole('navigation', { name: '§§ vizinhos' }).getByRole('link', { name: '§ 3' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TESTEG § 3')

  // e «Ler o capítulo» abre o § 1
  await page.goto('#/grupo/GR-TESTEG-01')
  await page.getByRole('link', { name: /^Ler o capítulo/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TESTEG § 1')
})

test('Busca: o bloco «Nos §§» no «Tudo», a aba «Texto» e o § aberto com «‹ Busca»', async ({ page }) => {
  await entrar(page)
  await page.goto('#/busca?q=Probenote')
  const bloco = page.getByRole('region', { name: 'Nos §§' })
  await expect(bloco.getByRole('listitem')).toHaveCount(2)
  const primeira = bloco.getByRole('listitem').first()
  await expect(primeira).toContainText('TESTEG')
  await expect(primeira).toContainText('nota 1')
  await expect(primeira.locator('strong')).toHaveText('Probenote')
  await expect(primeira).toContainText('I. Época de teste e imagens de prova')
  await semRolagemHorizontal(page, 'a Busca com §§')

  const texto = page.getByRole('button', { name: 'Texto, 2 §§' })
  await texto.click()
  await expect(texto).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/escopo=texto/)
  const lista = page.getByRole('region', { name: '§§ achados' })
  await expect(lista.getByRole('listitem')).toHaveCount(2)
  await lista.getByRole('link').nth(1).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TESTEG § 2')
  if (celular(page)) await expect(page.getByRole('link', { name: 'Voltar (Busca)' })).toBeVisible()
  else await expect(page.getByRole('link', { name: 'Busca', exact: true })).toBeVisible()

  // «do texto» na faceta «Certeza do sítio» (no computador, a coluna dos filtros)
  if (!celular(page)) {
    await page.goto('#/busca?q=Testkredit')
    const filtros = page.getByRole('complementary', { name: 'Filtros' })
    await expect(filtros.getByRole('checkbox', { name: /do texto/ })).toBeVisible()
  }
})

test('Bibliografia: o livro como obra, «Este livro no IconoDB» e «Ler o § 1»', async ({ page }) => {
  await entrar(page)
  await page.goto('#/bibliografia')
  const livro = page.getByRole('link', { name: /Autorin 2021/ })
  await expect(livro.locator('.obra-linha-livro')).toHaveText('TESTEG')
  await livro.click()
  const bloco = page.getByRole('region', { name: 'Este livro no IconoDB' })
  await expect(bloco).toContainText('1 capítulo · 3 §§ · 3 figuras')
  await expect(bloco.getByRole('link', { name: 'Autorin 2022' })).toBeVisible()
  await semRolagemHorizontal(page, 'a obra do livro')
  await bloco.getByRole('link', { name: 'Ler o § 1' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TESTEG § 1')
})

test('«No livro» do objeto em dois livros: as duas linhas, cada uma com o nome do livro', async ({ page }) => {
  await entrar(page)
  await page.goto('#/item/CA00004')
  const noLivro = page.getByRole('region', { name: 'No livro' })
  const linhas = noLivro.locator('p')
  await expect(linhas).toHaveCount(2)
  await expect(linhas.nth(0)).toHaveText(/^TESTE I · /)
  await expect(linhas.nth(1)).toHaveText('TESTEG · I. Época de teste e imagens de prova › 1. Selos de prova da fase de teste')
  // fix 1: a legenda de cada imagem diz de que livro ela é (desenho 6)
  await expect(page.locator('.imagem-item-credito')).toHaveText(/^TESTE I: 4 · /)
  await page.getByRole('button', { name: 'Imagem seguinte' }).click()
  await expect(page.locator('.imagem-item-credito')).toHaveText(/^TESTEG: 1b · /)
  await linhas.nth(1).getByRole('link', { name: '1. Selos de prova da fase de teste' }).click()
  await expect(page.getByText('TESTEG · Seção 1')).toBeVisible()
})

test('o § 2: a chamada da nota 2 leva à nota, e a figura citada na nota é um link', async ({ page }) => {
  await entrar(page)
  await page.goto('#/paragrafo/TESTEG/2')
  const pt = page.getByRole('region', { name: 'Português' })
  await pt.getByRole('link', { name: 'nota 2', exact: true }).click()
  const nota = pt.getByRole('list', { name: 'Notas' }).getByRole('listitem')
  await expect(nota).toBeFocused()
  const figura = nota.getByRole('link', { name: 'Abb. 1b' })
  await expect(figura).toHaveAttribute('href', /#\/item\/CA00004$/)
  await nota.getByRole('link', { name: 'Voltar à chamada da nota 2' }).click()
  await expect(pt.getByRole('link', { name: 'nota 2', exact: true })).toBeFocused()
})

test('o mapa: a figura TESTEG-0002 no cartão de «Tell Achado Teste», com a marca «do texto» que leva ao § 3', async ({ page }) => {
  await entrar(page)
  await page.goto('#/sitios')
  if (celular(page)) await page.getByRole('group', { name: 'Modo de exibição' }).getByRole('button', { name: 'Mapa' }).click()
  const palco = page.getByRole('group', { name: 'Mapa dos sítios' })
  await expect(palco).toHaveAttribute('data-pronto', '')
  // o ponto é um ponto comum (decisão 91, a7)
  const ponto = page.getByRole('button', { name: /^Tell Achado Teste, 1 objeto/ })
  await ponto.click()
  const cartao = page.getByRole('dialog', { name: 'Sítio selecionado: Tell Achado Teste' })
  await expect(cartao).toContainText('1 objeto, 1 do texto do TESTEG')
  const lista = cartao.getByRole('list', { name: 'Objetos de Tell Achado Teste' })
  await expect(lista.getByRole('link', { name: 'Abrir F200002' })).toBeVisible()
  const marca = lista.getByRole('link', { name: 'F200002: do texto, pelo § 3' })
  await expect(marca).toHaveText('do texto')
  await semRolagemHorizontal(page, 'o mapa com o cartão')

  // «Abrir sítio»: a página do sítio explica a marca e o cartão da figura diz «do texto · pelo § 3»
  await cartao.getByRole('link', { name: /Abrir sítio/ }).click()
  const secao = page.getByRole('region', { name: 'Objetos deste sítio' })
  await expect(secao).toContainText('«do texto»: o lugar vem da frase do § que cita a figura')
  await expect(secao.getByTestId('marca-do-texto')).toHaveText(/do texto\s+pelo § 3/)
  await semRolagemHorizontal(page, 'o sítio do achado')
  await secao.getByTestId('marca-do-texto').getByRole('link', { name: '§ 3' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TESTEG § 3')
})
