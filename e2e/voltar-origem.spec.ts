import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Decisão 85, no navegador de verdade, nos dois tamanhos, sobre o pacote sintético (TESTE): a página do objeto mostra
 * «‹ <tela de onde se veio>» (verbete, sítio, Busca…), que volta no histórico para ela como estava (a rolagem junto). Sem
 * origem no app (link guardado, aba nova), o objeto fica como sempre foi.
 */

const celular = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}

/** A rolagem de quem rola: a janela no celular; no computador, o painel do detalhe (a lista e o detalhe têm a sua). */
const rolagem = (page: Page) =>
  page.evaluate((pc) => (pc ? (document.querySelector('.lista-principal')?.scrollTop ?? -1) : window.scrollY), !celular(page))

/** Rola até o fim (do painel do detalhe no computador, da janela no celular) e devolve onde parou. */
async function rolarAteOFim(page: Page): Promise<number> {
  await page.evaluate((pc) => {
    if (pc) {
      const p = document.querySelector('.lista-principal')!
      p.scrollTop = p.scrollHeight
    } else window.scrollTo(0, document.documentElement.scrollHeight)
  }, !celular(page))
  // o evento `scroll` chega no quadro seguinte
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))))
  return rolagem(page)
}

/** O «‹ origem» do objeto: o nome é o da tela, sem o «‹»; o espaço depois dele é o gap de 0,3em (add45b1). */
async function conferirVolta(page: Page, nome: string) {
  const volta = page.getByRole('navigation', { name: 'Origem' }).getByRole('link', { name: nome, exact: true })
  await expect(volta).toBeVisible()
  await expect(volta).toHaveText(new RegExp(`^‹\\s*${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
  await expect(volta).toHaveCSS('column-gap', celular(page) ? '4.5px' : /^4\.2\d*px$/) // 0,3em de 15 px / 14 px
  if (celular(page)) {
    // o ícone do topo diz a origem (e faz o mesmo)
    await expect(page.getByRole('link', { name: `Voltar (${nome})`, exact: true })).toBeVisible()
  } else {
    // no computador, na linha de cima da coluna da leitura: à esquerda das ações, na mesma altura
    const acoes = page.getByRole('toolbar', { name: /^Ações do/ })
    const a = (await volta.boundingBox())!
    const b = (await acoes.boundingBox())!
    expect(a.x + a.width).toBeLessThanOrEqual(b.x)
    expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2))).toBeLessThan(4)
  }
  return volta
}

test('do verbete à hipótese no objeto, e o «‹ Verbete: …» volta ao verbete na mesma rolagem', async ({ page }) => {
  await entrar(page)
  await page.goto('#/verbete/GL-900001')
  const hipoteses = page.getByRole('region', { name: 'Hipóteses com este termo' })
  const linha = hipoteses.locator('a.hipotese-linha[href*="hipotese=HY-900001"]')
  await expect(linha).toBeVisible()
  const nome = (await page.locator('.detalhe-titulo').first().textContent())!.trim()
  expect(nome).not.toBe('')

  const antes = await rolarAteOFim(page)
  expect(antes, 'o verbete precisa rolar para o teste valer').toBeGreaterThan(50)
  const entradas = await page.evaluate(() => history.length)

  await linha.click()
  await expect(page).toHaveURL(/#\/item\/CA00001\?hipotese=HY-900001$/)
  const painel = page.getByRole('dialog', { name: /^Hipótese/ })
  await expect(painel).toBeVisible()
  if (celular(page)) {
    // no celular a hipótese abre na folha modal: fecha-se a folha, e o «‹» está ali em cima
    await page.keyboard.press('Escape')
    await expect(painel).toBeHidden()
  }
  const volta = await conferirVolta(page, `Verbete: ${nome}`)

  await volta.click()
  await expect(page).toHaveURL(/#\/verbete\/GL-900001$/)
  await expect(page.locator('.detalhe-titulo').first()).toHaveText(nome)
  await expect.poll(() => rolagem(page)).toBe(antes)
  // voltou no histórico (o objeto ficou adiante), não empilhou o verbete de novo
  expect(await page.evaluate(() => history.length)).toBe(entradas + 1)
  await page.goForward()
  await expect(page).toHaveURL(/#\/item\/CA00001/)
})

test('do sítio ao objeto e de volta, na mesma rolagem; da Busca, «‹ Busca» volta à consulta', async ({ page }) => {
  await entrar(page)
  await page.goto('#/sitio/TESTE-1')
  const nome = (await page.locator('.detalhe-titulo').first().textContent())!.trim()
  const objetos = page.getByRole('region', { name: 'Objetos deste sítio' })
  const cartao = objetos.getByRole('link', { name: /CA00001/ })
  await expect(cartao).toBeVisible()
  const antes = await rolarAteOFim(page)
  await cartao.click()
  await expect(page).toHaveURL(/#\/item\/CA00001$/)
  const volta = await conferirVolta(page, `Sítio: ${nome}`)
  await volta.click()
  await expect(page).toHaveURL(/#\/sitio\/TESTE-1$/)
  await expect.poll(() => rolagem(page)).toBe(antes)

  // Busca → objeto → «‹ Busca» → a busca com a consulta.
  await page.goto('#/busca?q=mahtes')
  const resultados = page.getByRole('region', { name: 'Resultados' })
  await resultados.getByRole('link', { name: /CA00002/ }).click()
  await expect(page.getByTestId('item-cabeca')).toContainText('CA00002')
  if (celular(page)) {
    // a Busca já dizia o nome no Voltar do topo: fica
    await expect(page.getByRole('link', { name: 'Voltar à busca', exact: true })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Origem' }).getByRole('link', { name: 'Busca', exact: true })).toBeVisible()
  }
  await page.getByRole('navigation', { name: 'Origem' }).getByRole('link', { name: 'Busca', exact: true }).click()
  await expect(page).toHaveURL(/#\/busca\?q=mahtes$/)
  await expect(resultados.getByRole('link', { name: /CA00002/ })).toBeVisible()
})

test('link direto (sem origem no app): o objeto fica como sempre, sem «‹ …»', async ({ page }) => {
  await entrar(page)
  // Uma aba nova com o endereço guardado: a primeira entrada do histórico, sem estado.
  const nova = await page.context().newPage()
  await nova.goto(page.url().replace(/#.*$/, '#/item/CA00001?hipotese=HY-900001'))
  await expect(nova.getByTestId('item-cabeca')).toContainText('CA00001')
  await expect(nova.getByRole('navigation', { name: 'Origem' })).toHaveCount(0)
  // o voltar de hoje: o do grupo do objeto (todos os objetos do pacote sintético estão num grupo; o «Voltar às coleções»
  // de um objeto sem grupo fica no teste do componente, Item.voltar.test.tsx)
  if (celular(nova)) await expect(nova.getByRole('link', { name: 'Voltar ao grupo', exact: true })).toBeVisible()
  else await expect(nova.getByRole('navigation', { name: 'Posição no grupo' })).toBeVisible()
  await nova.close()
})

test('a origem atrás no histórico: recarregar e «→» ainda voltam por ele; com outra entrada no meio, vai ao caminho', async ({ page }) => {
  await entrar(page)
  // O verbete aberto pelo app (o `goto` de um endereço não passa pelo roteador e deixa a entrada sem posição): assim o «‹»
  // compara a posição da origem com a de agora, em vez do voltar de sempre.
  await page.goto('#/glossario')
  await page.locator('a[href="#/verbete/GL-900001"]').first().click()
  await expect(page).toHaveURL(/#\/verbete\/GL-900001$/)
  expect(await page.evaluate(() => typeof (history.state as { idx?: unknown } | null)?.idx), 'a entrada do verbete tem posição').toBe('number')
  const linha = page.getByRole('region', { name: 'Hipóteses com este termo' }).locator('a.hipotese-linha[href*="hipotese=HY-900001"]')
  await expect(linha).toBeVisible()
  const nome = (await page.locator('.detalhe-titulo').first().textContent())!.trim()
  const antes = await rolarAteOFim(page)
  const entradas = await page.evaluate(() => history.length)
  // No celular a hipótese abre na folha modal: fecha-se a folha (o endereço perde o ?hipotese=, com replace).
  const fecharAFolha = async () => {
    if (!celular(page)) return
    await expect(page.getByRole('dialog', { name: /^Hipótese/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: /^Hipótese/ })).toBeHidden()
  }
  const abrir = async () => {
    await linha.click()
    await expect(page).toHaveURL(/#\/item\/CA00001\?hipotese=HY-900001$/)
    await fecharAFolha()
  }
  const volta = () => page.getByRole('navigation', { name: 'Origem' }).getByRole('link', { name: `Verbete: ${nome}`, exact: true })

  // Recarregar o objeto: o estado do histórico fica (idx e a origem), e o «‹» ainda volta por ele.
  await abrir()
  await page.reload()
  await expect(page.getByTestId('item-cabeca')).toContainText('CA00001')
  // «→» troca a entrada (replace): o vizinho leva a origem, e a entrada anterior continua sendo o verbete.
  await page.getByRole('navigation', { name: 'Posição no grupo' }).getByRole('link', { name: 'Próximo: CA00002' }).click()
  await expect(page).toHaveURL(/#\/item\/CA00002$/)
  await expect(volta()).toBeVisible()
  await volta().click()
  await expect(page).toHaveURL(/#\/verbete\/GL-900001$/)
  await expect.poll(() => rolagem(page)).toBe(antes)
  expect(await page.evaluate(() => history.length), 'voltou no histórico, sem empilhar').toBe(entradas + 1)

  // Outra entrada entre a origem e o objeto (a posição de agora não é a seguinte à do verbete): o «‹» vai ao caminho.
  await abrir()
  await page.evaluate(() => history.pushState({ ...history.state, idx: (history.state as { idx: number }).idx + 1 }, '', location.href))
  const depois = await page.evaluate(() => history.length)
  await volta().click()
  await expect(page).toHaveURL(/#\/verbete\/GL-900001$/)
  await expect(page.locator('.detalhe-titulo').first()).toHaveText(nome)
  expect(await page.evaluate(() => history.length), 'empilhou o verbete').toBe(depois + 1)
})

test('o cartão de um ponto no mapa dos Sítios: o objeto mostra «‹ Sítios» e volta ao mapa', async ({ page }) => {
  test.skip(celular(page), 'no computador o mapa é a entrada dos Sítios (o celular usa o mesmo cartão)')
  await entrar(page)
  await page.goto('#/sitios')
  await page.getByRole('button', { name: 'Mostrar Maḥteṣ Teste no mapa' }).click()
  const cartao = page.getByRole('dialog', { name: 'Sítio selecionado: Maḥteṣ Teste' })
  await expect(cartao).toBeVisible()
  await cartao.getByRole('link', { name: 'Abrir CA00001' }).click()
  await expect(page).toHaveURL(/#\/item\/CA00001$/)
  const volta = await conferirVolta(page, 'Sítios')
  await volta.click()
  await expect(page).toHaveURL(/#\/sitios$/)
  await expect(page.getByRole('button', { name: 'Mostrar Maḥteṣ Teste no mapa' })).toBeVisible()
})
