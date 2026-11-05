import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { LARGURA_DA_EXTENSAO, ALTURA_DA_EXTENSAO, projetar } from '../src/sitios/mapa'
import { expect, test } from './fixtures'

/**
 * Tarefa 19 (decisão 36) no navegador de verdade, nos dois tamanhos e sobre o pacote sintético (TESTE) mais sítios criados na
 * hora: o mapa offline dos sítios (lista | mapa no computador; «Lista | Mapa» e a folha no celular), o filtro por região, o
 * cartão do ponto, arrastar, roda, pinça, teclado, e que o mapa não faz pedido de rede nenhum e só é baixado ao abrir Sítios.
 * A guarda de rede e a da CSP são as fixtures de sempre (e2e/fixtures.ts). Com SHOTS_DIR definido, guarda capturas.
 */
async function foto(page: Page, nome: string) {
  const pasta = process.env.SHOTS_DIR
  if (!pasta) return
  if ((await page.getByRole('group', { name: 'Mapa dos sítios' }).count()) > 0) await visaoAssentada(page)
  mkdirSync(pasta, { recursive: true })
  await page.screenshot({ path: join(pasta, `${process.env.SHOTS_PREFIX ?? ''}${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}
async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}
const semRolagemHorizontal = async (page: Page, tela: string) => {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}
async function criarSitio(page: Page, nome: string, lat: number, lon: number) {
  await page.goto('#/sitios/novo')
  await page.getByRole('textbox', { name: 'Nome', exact: true }).fill(nome)
  await page.getByRole('textbox', { name: 'Latitude' }).fill(String(lat).replace('.', ','))
  await page.getByRole('textbox', { name: 'Longitude' }).fill(String(lon).replace('.', ','))
  await page.getByRole('button', { name: 'Registrar sítio' }).click()
  await expect(page.getByRole('heading', { name: nome, exact: true }).first()).toBeVisible()
}
/** O mapa anima um quarto de segundo nas ações: espera a visão parar (duas leituras iguais), sem pausa fixa. */
async function visaoAssentada(page: Page) {
  let anterior = ''
  await expect
    .poll(async () => {
      const el = page.getByRole('group', { name: 'Mapa dos sítios' })
      const agora = `${await el.getAttribute('data-k')}|${await el.getAttribute('data-x')}|${await el.getAttribute('data-y')}`
      const igual = agora === anterior
      anterior = agora
      return igual
    })
    .toBe(true)
  // a transição do CSS corre mais que a atualização dos números: espera os pontos pararem também
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
}
const palco = (page: Page) => page.getByRole('group', { name: 'Mapa dos sítios' })
const visao = async (page: Page) => {
  const el = palco(page)
  return { k: Number(await el.getAttribute('data-k')), x: Number(await el.getAttribute('data-x')), y: Number(await el.getAttribute('data-y')) }
}
/** O mapa registra as teclas num efeito: espera o aviso antes de apertar (nada de pausa fixa). */
const mapaPronto = async (page: Page) => {
  await expect(palco(page)).toHaveAttribute('data-atalhos', '')
  await expect(palco(page)).toHaveAttribute('data-pronto', '')
}
async function alvoOk(el: Locator, minimo: number, nome: string) {
  const caixa = (await el.boundingBox())!
  expect(Math.min(caixa.width, caixa.height), `alvo de ${nome}`).toBeGreaterThanOrEqual(minimo - 0.5)
}

const centroDe = async (el: Locator) => {
  const b = (await el.boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
/** O ponto da tela é do mapa (não está sob o minimapa, um controle ou o cartão): o clique ali chega ao palco. */
const livreNoMapa = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px!, py!)
    return !!el && !el.closest('.mapa-mini, .mapa-botao, [role="dialog"]')
  }, [x, y])
/** O mesmo grupo apertado de sítios nos dois tamanhos: cinco pontos a menos de 40 px uns dos outros no computador e de 30 px no celular em «Ver tudo» (alvos que se sobrepõem). */
const AGLOMERADO: [string, number, number][] = [
  ['Aglomerado 1', 27.0, 45.0],
  ['Aglomerado 2', 27.3, 45.0],
  ['Aglomerado 3', 27.0, 45.35],
  ['Aglomerado 4', 27.3, 45.35],
  ['Aglomerado 5', 27.15, 45.175],
]
async function criarAglomerado(page: Page) {
  await criarSitio(page, 'Tell do Egito', 30.04, 31.24)
  await criarSitio(page, 'Tell do Irã', 32, 50)
  for (const [nome, lat, lon] of AGLOMERADO) await criarSitio(page, nome, lat, lon)
  await page.goto('#/sitios')
}
/** Lê pixels de uma captura: abre a imagem numa página em branco (sem CSP) e a desenha num canvas. Devolve [r, g, b] de cada ponto (px da captura). */
async function pixels(page: Page, png: Buffer, pontos: { x: number; y: number }[]): Promise<number[][]> {
  const outra = await page.context().newPage()
  try {
    return await outra.evaluate(
      async ({ b64, pontos }) => {
        const img = new Image()
        img.src = `data:image/png;base64,${b64}`
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const ctx = c.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        return pontos.map((p) => [...ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data].slice(0, 3))
      },
      { b64: png.toString('base64'), pontos },
    )
  } finally {
    await outra.close()
  }
}
/** Dedos de verdade pelo protocolo do Chromium (eventos de toque, e não só de ponteiro). */
async function dedos(page: Page) {
  const sessao = await page.context().newCDPSession(page)
  return async (tipo: 'touchStart' | 'touchMove' | 'touchEnd', pontos: { x: number; y: number }[]) =>
    sessao.send('Input.dispatchTouchEvent', { type: tipo, touchPoints: pontos.map((p, id) => ({ x: p.x, y: p.y, id })) })
}

test('o mapa só é baixado ao abrir Sítios, e nada sai para a rede', async ({ page }) => {
  const pedidos: string[] = []
  page.on('request', (r) => pedidos.push(r.url()))
  await entrar(page)
  await page.goto('#/glossario')
  await expect(page.getByRole('heading', { level: 1, name: 'Glossário' })).toBeVisible()
  const chunk = (u: string) => /\/assets\/Mapa-[^/]+\.js$/.test(u)
  expect(pedidos.filter(chunk), 'o pacote do mapa antes de abrir Sítios').toEqual([])
  const antes = pedidos.length
  await page.goto('#/sitios')
  const celular = (page.viewportSize()?.width ?? 0) < 768
  if (celular) await page.getByRole('group', { name: 'Modo de exibição' }).getByRole('button', { name: 'Mapa' }).click()
  await expect(palco(page)).toBeVisible()
  await expect(palco(page)).toHaveAttribute('data-pronto', '')
  expect(pedidos.filter(chunk), 'o pacote do mapa ao abrir o mapa').toHaveLength(1)
  // tudo o que o mapa pediu veio do próprio app: nenhuma origem de fora (a guarda de rede das fixtures também confere)
  const origem = new URL(page.url()).origin
  for (const u of pedidos.slice(antes)) expect(new URL(u).origin, u).toBe(origem)
  // o mapa não pede mais nada ao arrastar, aproximar e ver tudo
  const depois = pedidos.length
  await page.getByRole('button', { name: 'Aproximar' }).click()
  await page.getByRole('button', { name: 'Ver tudo' }).click()
  expect(pedidos.length).toBe(depois)
})

test('computador: lista | mapa, região, cartão, mouse e teclado', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('celular'), 'o desenho de computador')
  await entrar(page)
  await criarSitio(page, 'Tell do Egito', 30.04, 31.24)
  await criarSitio(page, 'Tell do Irã', 32, 50)
  await criarSitio(page, 'Gêmeo A', 36.5, 40.0)
  await criarSitio(page, 'Gêmeo B', 36.5, 40.0)
  await page.goto('#/sitios')
  await mapaPronto(page)
  await semRolagemHorizontal(page, 'Sítios com o mapa')

  // lista à esquerda (480 px), mapa à direita
  const lista = await page.getByRole('complementary', { name: 'Lista de sítios' }).boundingBox()
  const caixaDoMapa = (await palco(page).boundingBox())!
  expect(lista!.width).toBeGreaterThanOrEqual(478)
  expect(lista!.width).toBeLessThanOrEqual(482)
  expect(caixaDoMapa.x).toBeGreaterThanOrEqual(lista!.x + lista!.width - 1)
  await foto(page, 'mapa-1-lista-e-mapa')

  // as etiquetas de região
  const grupo = page.getByRole('group', { name: 'Filtrar por região' })
  await expect(grupo.getByRole('button', { name: 'Todas, 7 sítios' })).toHaveAttribute('aria-pressed', 'true')
  for (const b of await grupo.getByRole('button').all()) await alvoOk(b, 36, 'uma etiqueta de região')

  // passar o mouse numa linha acende o ponto (anel)
  const linhaDoEgito = page.locator('[data-sitio]').filter({ hasText: 'Tell do Egito' })
  // O ponteiro ficou onde o último clique (do formulário) o deixou, e agora cai sobre uma linha: tira-o do caminho antes de conferir.
  await page.mouse.move(caixaDoMapa.x + 5, caixaDoMapa.y + caixaDoMapa.height - 5)
  await expect(page.locator('[data-anel]')).toHaveCount(0)
  await linhaDoEgito.getByRole('link').hover()
  await expect(page.locator('[data-anel]')).toHaveCount(1)
  await expect(linhaDoEgito).toHaveClass(/sitio-linha-acesa/)
  await foto(page, 'mapa-2-mouse-na-linha')
  await page.mouse.move(caixaDoMapa.x + 5, caixaDoMapa.y + caixaDoMapa.height - 5) // longe de tudo
  await expect(page.locator('[data-anel]')).toHaveCount(0)
  // e o ponto acende a linha
  await page.getByRole('button', { name: 'Tell do Irã, 0 objetos' }).hover()
  await expect(page.locator('[data-sitio]').filter({ hasText: 'Tell do Irã' })).toHaveClass(/sitio-linha-acesa/)

  // clicar no ponto abre o cartão; o nome do sítio abre a página
  await page.getByRole('button', { name: 'Tell do Egito, 0 objetos' }).click()
  const cartao = page.getByRole('dialog', { name: 'Sítio selecionado: Tell do Egito' })
  await expect(cartao).toBeVisible()
  await expect(cartao).toContainText('30,04 N · 31,24 E')
  await expect(cartao.getByRole('link', { name: 'Abrir sítio' })).toBeFocused()
  const caixaDoCartao = (await cartao.boundingBox())!
  expect(caixaDoCartao.width).toBeGreaterThanOrEqual(290)
  expect(caixaDoCartao.x).toBeGreaterThanOrEqual(caixaDoMapa.x)
  expect(caixaDoCartao.x + caixaDoCartao.width).toBeLessThanOrEqual(caixaDoMapa.x + caixaDoMapa.width + 1)
  // D1 (decisão 53): o cartão fica FIXO no canto de cima à esquerda do mapa, abaixo de «Limites das regiões», como no desenho
  expect(Math.abs(caixaDoCartao.x - (caixaDoMapa.x + 16))).toBeLessThanOrEqual(1.5)
  expect(Math.abs(caixaDoCartao.y - (caixaDoMapa.y + 68))).toBeLessThanOrEqual(1.5)
  const caixaDosLimites = (await page.getByRole('checkbox', { name: /Limites das regiões/ }).locator('xpath=ancestor::label').boundingBox())!
  expect(caixaDoCartao.y).toBeGreaterThanOrEqual(caixaDosLimites.y + caixaDosLimites.height)
  // e o ponto escolhido não fica escondido por baixo dele (o mapa o leva para fora, se for o caso)
  await visaoAssentada(page)
  const doPonto = (await page.getByRole('button', { name: 'Tell do Egito, 0 objetos' }).boundingBox())!
  const cartaoAgora = (await cartao.boundingBox())!
  const sobrepoe = doPonto.x < cartaoAgora.x + cartaoAgora.width && doPonto.x + doPonto.width > cartaoAgora.x && doPonto.y < cartaoAgora.y + cartaoAgora.height && doPonto.y + doPonto.height > cartaoAgora.y
  expect(sobrepoe, 'o cartão cobre o ponto escolhido').toBe(false)
  await alvoOk(cartao.getByRole('button', { name: 'Fechar' }), 36, 'Fechar')
  await foto(page, 'mapa-3-cartao')
  await page.keyboard.press('Escape')
  await expect(cartao).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Tell do Egito, 0 objetos' })).toBeFocused()

  // um ponto com dois sítios (a mesma coordenada): um ponto só, o cartão lista os dois
  await page.getByRole('button', { name: 'Gêmeo A e Gêmeo B, 2 sítios, 0 objetos' }).click()
  const duplo = page.getByRole('dialog', { name: 'Sítio selecionado: Gêmeo A e Gêmeo B' })
  await expect(duplo.getByRole('link', { name: 'Abrir sítio Gêmeo A' })).toBeVisible()
  await expect(duplo.getByRole('link', { name: 'Abrir sítio Gêmeo B' })).toBeVisible()
  await foto(page, 'mapa-4-ponto-fundido')
  await duplo.getByRole('button', { name: 'Fechar' }).click()

  // o filtro por região: Egito + Irã (união); a lista e o mapa acompanham
  await grupo.getByRole('button', { name: /^Egito, / }).click()
  await grupo.getByRole('button', { name: /^Irã, / }).click()
  await expect(page.locator('[data-sitio]')).toHaveCount(2)
  await expect(page.locator('[data-ponto]')).toHaveCount(2)
  await expect(page).toHaveURL(/\?regioes=egito%2Cira/)
  await expect(page.getByRole('status').filter({ hasText: '2 sítios' })).toBeVisible()
  await foto(page, 'mapa-5-filtro-de-regiao')
  await page.getByRole('button', { name: 'Limpar filtro' }).click()
  await expect(page.locator('[data-sitio]')).toHaveCount(7)

  // limites das regiões (R)
  await page.keyboard.press('r')
  await expect(page.getByRole('checkbox', { name: /Limites das regiões/ })).toBeChecked()
  await expect(page.locator('path[data-regiao="todas"]')).toHaveCount(1)
  // há nomes de região escritos (cada nome fica inteiro no palco; um que não coubesse em lugar nenhum livre de outro nome não é escrito)
  await expect.poll(() => page.locator('.mapa-rotulo-regiao').count()).toBeGreaterThan(0)
  await foto(page, 'mapa-6-limites-das-regioes')
  await page.keyboard.press('r')
  await expect(page.locator('path.mapa-regiao')).toHaveCount(0)

  // roda do mouse aproxima e afasta; arrastar move; + − 0 pelo teclado
  const v0 = await visao(page)
  const meio = { x: caixaDoMapa.x + caixaDoMapa.width / 2, y: caixaDoMapa.y + caixaDoMapa.height * 0.7 }
  await page.mouse.move(meio.x, meio.y)
  await page.mouse.wheel(0, -400)
  await expect.poll(async () => (await visao(page)).k).toBeGreaterThan(v0.k)
  const v1 = await visao(page)
  await page.mouse.down()
  await page.mouse.move(meio.x + 120, meio.y + 60, { steps: 6 })
  await page.mouse.up()
  await expect.poll(async () => (await visao(page)).x).toBeGreaterThan(v1.x + 60)
  await page.keyboard.press('0')
  await expect.poll(async () => (await visao(page)).k).toBeCloseTo(v0.k, 2)
  await page.keyboard.press('+')
  await expect.poll(async () => (await visao(page)).k).toBeGreaterThan(v0.k)
  await page.keyboard.press('-')
  await expect.poll(async () => (await visao(page)).k).toBeCloseTo(v0.k, 2)
  // as setas movem o mapa com o foco nele
  await palco(page).focus()
  await page.keyboard.press('+')
  await expect.poll(async () => (await visao(page)).k).toBeGreaterThan(v0.k)
  const v2 = await visao(page)
  await page.keyboard.press('ArrowLeft')
  await expect.poll(async () => (await visao(page)).x).toBeGreaterThan(v2.x)
  await foto(page, 'mapa-7-zoom')
  // com a escrita na busca, as teclas do mapa não valem: o «r» é uma letra do texto e não liga os limites
  const busca = page.getByRole('searchbox', { name: 'Buscar sítio' })
  await busca.click()
  await page.keyboard.type('r+0')
  await expect(busca).toHaveValue('r+0')
  await expect(page.getByRole('checkbox', { name: /Limites das regiões/ })).not.toBeChecked()
  await busca.fill('')

  // «Mostrar no mapa» numa linha centra e abre o cartão; a página do sítio abre o mapa de volta com «Abrir no mapa»
  await page.getByRole('button', { name: 'Ver tudo' }).click()
  await page.locator('[data-sitio]').filter({ hasText: 'Tell do Irã' }).getByRole('button', { name: 'Mostrar Tell do Irã no mapa' }).click()
  await expect(page.getByRole('dialog', { name: 'Sítio selecionado: Tell do Irã' })).toBeVisible()
  await page.getByRole('dialog').getByRole('link', { name: 'Abrir sítio' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Tell do Irã' })).toBeVisible()
  await expect(palco(page)).toHaveCount(0)
  await page.getByRole('link', { name: 'Abrir no mapa' }).click()
  await expect(page.getByRole('dialog', { name: 'Sítio selecionado: Tell do Irã' })).toBeVisible()
  await expect(palco(page)).toBeVisible()
  // o mapa anima até o centro (um quarto de segundo): espera a chegada, sem pausa fixa
  const area = (await palco(page).boundingBox())!
  await expect
    .poll(async () => {
      const pt = (await page.getByRole('button', { name: 'Tell do Irã, 0 objetos' }).boundingBox())!
      return Math.max(Math.abs(pt.x + pt.width / 2 - (area.x + area.width / 2)), Math.abs(pt.y + pt.height / 2 - (area.y + area.height / 2)))
    })
    .toBeLessThan(30)
  await semRolagemHorizontal(page, 'o mapa centrado num sítio')

  // texto de pelo menos 12 px em tudo o que o mapa escreve
  const menor = await page.evaluate(() => {
    const raiz = document.querySelector('.mapa')!
    let menor = 99
    for (const el of raiz.querySelectorAll<HTMLElement>('*')) {
      const tem = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '')
      if (tem) menor = Math.min(menor, parseFloat(getComputedStyle(el).fontSize))
    }
    return menor
  })
  expect(menor).toBeGreaterThanOrEqual(12)
})

test('movimento reduzido: o mapa muda de visão sem transição (e, sem o pedido, com a transição de 0,25 s)', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('celular'), 'o mesmo código nos dois')
  // controle positivo: sem o pedido de movimento reduzido, a mesma ação tem a transição de um quarto de segundo
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await entrar(page)
  await page.goto('#/sitios')
  await mapaPronto(page)
  await page.getByRole('button', { name: 'Aproximar' }).click()
  await expect(page.locator('.mapa')).toHaveAttribute('data-anima', '')
  const normal = await page.locator('.mapa-camada').evaluate((el) => getComputedStyle(el).transitionDuration)
  expect(parseFloat(normal), `duração da transição sem o pedido: ${normal}`).toBeCloseTo(0.25, 2)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Afastar' }).click()
  await expect(page.locator('.mapa')).toHaveAttribute('data-anima', '')
  const duracao = await page.locator('.mapa-camada').evaluate((el) => getComputedStyle(el).transitionDuration)
  expect(parseFloat(duracao), `duração da transição: ${duracao}`).toBeLessThan(0.001)
})

test('celular: «Lista | Mapa», filtros, folha do sítio, toque, pinça e alvos de toque', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('celular'), 'o desenho de celular')
  await entrar(page)
  await criarSitio(page, 'Tell do Egito', 30.04, 31.24)
  await criarSitio(page, 'Tell do Irã', 32, 50)
  await criarSitio(page, 'Gêmeo A', 36.5, 40.0)
  await criarSitio(page, 'Gêmeo B', 36.5, 40.0)
  await page.goto('#/sitios')
  await semRolagemHorizontal(page, 'Sítios (lista)')
  const vista = page.getByRole('group', { name: 'Modo de exibição' })
  await expect(vista.getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true')
  for (const b of await vista.getByRole('button').all()) await alvoOk(b, 44, 'o seletor Lista | Mapa')
  // «Mostrar no mapa» em cada linha tem o alvo de toque
  await alvoOk(page.getByRole('button', { name: 'Mostrar Tell do Egito no mapa' }), 44, 'Mostrar no mapa')
  await foto(page, 'mapa-8-lista')

  await vista.getByRole('button', { name: 'Mapa' }).click()
  await mapaPronto(page)
  await semRolagemHorizontal(page, 'Sítios (mapa)')
  await foto(page, 'mapa-9-celular-mapa')

  // as etiquetas rolam na horizontal dentro da faixa; a página não
  const chips = page.getByRole('group', { name: 'Filtrar por região' })
  for (const b of await chips.getByRole('button').all()) {
    const caixa = (await b.boundingBox())!
    expect(caixa.height).toBeGreaterThanOrEqual(35.5)
    // o alvo de toque de 44 px (o chip é de 36 e o alvo se estende)
    const alvo = await b.evaluate((el) => getComputedStyle(el, '::before').height)
    expect(parseFloat(alvo)).toBeGreaterThanOrEqual(44)
  }
  // os controles do mapa
  const barra = page.getByRole('toolbar', { name: 'Controles do mapa' })
  for (const b of await barra.getByRole('button').all()) await alvoOk(b, 44, 'um controle do mapa')
  // D2 (decisão 53): no modo mapa, «Novo sítio» é o «+» do topo (antes da lupa), como no desenho
  const novo = page.getByRole('link', { name: 'Novo sítio' })
  await expect(novo).toHaveCount(1)
  await alvoOk(novo, 44, 'o «+» Novo sítio do topo')
  const topo = (await page.locator('.topo-celular').boundingBox())!
  const caixaDoNovo = (await novo.boundingBox())!
  expect(caixaDoNovo.y).toBeGreaterThanOrEqual(topo.y - 1)
  expect(caixaDoNovo.y + caixaDoNovo.height).toBeLessThanOrEqual(topo.y + topo.height + 1)
  expect(caixaDoNovo.x).toBeLessThan((await page.getByRole('link', { name: 'Buscar' }).boundingBox())!.x)
  // o alvo de toque do ponto é o raio de 22 px em volta do centro (o palco escolhe o ponto mais perto): um toque a 15 px de
  // «Tell do Egito» abre o cartão dele
  const doEgito = await centroDe(page.getByRole('button', { name: 'Tell do Egito, 0 objetos' }))
  await page.touchscreen.tap(doEgito.x - 15, doEgito.y)
  await expect(page.getByRole('dialog', { name: 'Sítio selecionado: Tell do Egito' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).tap()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // tocar num ponto abre a folha de baixo
  await page.getByRole('button', { name: 'Tell do Egito, 0 objetos' }).tap()
  const folha = page.getByRole('dialog', { name: 'Sítio selecionado: Tell do Egito' })
  await expect(folha).toBeVisible()
  await alvoOk(folha.getByRole('button', { name: 'Fechar' }), 44, 'Fechar a folha')
  await alvoOk(folha.getByRole('link', { name: 'Abrir sítio' }), 44, 'Abrir sítio')
  const f = (await folha.boundingBox())!
  expect(f.y + f.height).toBeLessThanOrEqual(812 + 1)
  await foto(page, 'mapa-10-folha-do-sitio')
  // m6: texto de pelo menos 12 px também no celular, com a folha aberta
  const menorNoCelular = await page.evaluate(() => {
    let menor = 99
    for (const el of document.querySelectorAll<HTMLElement>('.mapa *, .cartao-ponto *')) {
      const tem = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '')
      if (tem && getComputedStyle(el).display !== 'none') {
        const tamanho = parseFloat(getComputedStyle(el).fontSize)
        if (tamanho > 0) menor = Math.min(menor, tamanho)
      }
    }
    return menor
  })
  expect(menorNoCelular).toBeGreaterThanOrEqual(12)
  await folha.getByRole('button', { name: 'Fechar' }).tap()
  await expect(folha).toHaveCount(0)

  // pinça (dois dedos) aproxima e um dedo arrasta: eventos de toque de verdade, pelo protocolo do Chromium
  const sessao = await page.context().newCDPSession(page)
  const caixa = (await palco(page).boundingBox())!
  const cx = caixa.x + caixa.width / 2
  const cy = caixa.y + caixa.height * 0.35
  const toque = async (tipo: 'touchStart' | 'touchMove' | 'touchEnd', pontos: { x: number; y: number }[]) => sessao.send('Input.dispatchTouchEvent', { type: tipo, touchPoints: pontos.map((p, id) => ({ x: p.x, y: p.y, id })) })
  const v0 = await visao(page)
  await toque('touchStart', [
    { x: cx - 30, y: cy },
    { x: cx + 30, y: cy },
  ])
  for (let i = 1; i <= 6; i++) {
    await toque('touchMove', [
      { x: cx - 30 - i * 12, y: cy },
      { x: cx + 30 + i * 12, y: cy },
    ])
  }
  await toque('touchEnd', [])
  await expect.poll(async () => (await visao(page)).k).toBeGreaterThan(v0.k * 1.5)
  const v1 = await visao(page)
  await toque('touchStart', [{ x: cx, y: cy }])
  for (let i = 1; i <= 6; i++) await toque('touchMove', [{ x: cx + i * 15, y: cy + i * 8 }])
  await toque('touchEnd', [])
  await expect.poll(async () => (await visao(page)).x).not.toBe(v1.x)
  await foto(page, 'mapa-11-celular-zoom')

  // limites das regiões (botão); tocar numa região filtra a lista
  // (depois dos gestos feitos pelo protocolo do Chromium, o primeiro toque num botão é engolido pelo próprio Chromium: o clique do
  // mouse prova o botão, e o fim do zoom prova o efeito)
  const kAntes = (await visao(page)).k
  await page.getByRole('button', { name: 'Ver tudo' }).click()
  await visaoAssentada(page)
  expect((await visao(page)).k).toBeLessThan(kAntes)
  const limites = page.getByRole('button', { name: 'Limites das regiões' })
  // `click()` e não `tap()`: depois de gestos injetados pelo protocolo (CDP), o Chromium às vezes engole o toque seguinte num botão
  // (chegam pointerdown/up e touchstart/end, mas nenhum `click`); o mesmo vale para «Ver tudo» logo acima (revisão 3, I5)
  await limites.click()
  await expect(limites).toHaveAttribute('aria-pressed', 'true')
  // m6: tocar no fundo DENTRO de uma região (o deserto a oeste do Nilo, no Egito) a liga no filtro e escreve no endereço
  {
    // 40 px abaixo e 25 px ao lado de «Tell do Egito»: no Sinai, dentro do Egito e longe de qualquer ponto
    const doEgitoAgora = await centroDe(page.getByRole('button', { name: 'Tell do Egito, 0 objetos' }))
    const alvo = { x: doEgitoAgora.x + 25, y: doEgitoAgora.y + 40 }
    expect(alvo.x).toBeLessThan(caixa.x + caixa.width - 60)
    expect(alvo.y).toBeLessThan(caixa.y + caixa.height - 140)
    await page.touchscreen.tap(alvo.x, alvo.y)
    await expect(page).toHaveURL(/regioes=egito/)
    await expect(chips.getByRole('button', { name: /^Egito, / })).toHaveAttribute('aria-pressed', 'true')
    // (o filtro refaz o «Ver tudo»: desliga pela etiqueta)
    await chips.getByRole('button', { name: /^Egito, / }).tap()
    await expect(chips.getByRole('button', { name: /^Egito, / })).toHaveAttribute('aria-pressed', 'false')
    await expect(page).not.toHaveURL(/regioes=/)
  }
  await expect(page.locator('path[data-regiao="todas"]')).toHaveCount(1)
  // há nomes de região escritos (cada nome fica inteiro no palco; um que não coubesse em lugar nenhum livre de outro nome não é escrito)
  await expect.poll(() => page.locator('.mapa-rotulo-regiao').count()).toBeGreaterThan(0)
  await expect(page.getByText('Tocar numa região filtra a lista.')).toBeVisible()
  await foto(page, 'mapa-12-celular-limites')
  await limites.tap()
  // o filtro vale no mapa e na lista
  await chips.getByRole('button', { name: /^Egito, / }).tap()
  await expect(page.locator('[data-ponto]')).toHaveCount(1)
  await foto(page, 'mapa-13-celular-filtro')
  await vista.getByRole('button', { name: 'Lista' }).tap()
  await expect(page.locator('[data-sitio]')).toHaveCount(1)
  await expect(page.getByRole('status').filter({ hasText: '1 sítio' })).toBeVisible()
  await foto(page, 'mapa-14-celular-lista-filtrada')
})

const semContagem = (rotulo: string) => rotulo.replace(/, \d+ (sítios, \d+ )?objetos?$/, '')

test('computador: o aglomerado de pontos (I1): arrastar a partir de um ponto, o ponto mais perto, todos alcançáveis pelo mouse e pelo teclado', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('celular'), 'o mouse')
  await entrar(page)
  await criarAglomerado(page)
  await mapaPronto(page)
  await visaoAssentada(page)
  const cartao = page.getByRole('dialog')
  const pontos = page.locator('[data-ponto]')

  // os alvos se sobrepõem de verdade: os cinco pontos estão a menos de 20 px uns dos outros
  const centros = await Promise.all(AGLOMERADO.map(([nome]) => centroDe(page.getByRole('button', { name: new RegExp(`^${nome}, `) }))))
  const distancias = centros.flatMap((a, i) => centros.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y)))
  expect(Math.max(...distancias), 'o aglomerado é apertado').toBeLessThan(40)
  expect(Math.min(...distancias), 'e os pontos não coincidem').toBeGreaterThan(3)

  // um mouse que aperta num ponto e arrasta move o mapa (e não abre o cartão)
  const v0 = await visao(page)
  await page.mouse.move(centros[4]!.x, centros[4]!.y)
  await page.mouse.down()
  await page.mouse.move(centros[4]!.x - 60, centros[4]!.y + 40, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => (await visao(page)).x).not.toBe(v0.x)
  await expect(cartao).toHaveCount(0)
  await page.keyboard.press('0')
  await visaoAssentada(page)

  // a roda aproxima em cima do aglomerado, e o aglomerado se abre: depois disso cada ponto está sob o cursor dele
  const alvoDaRoda = await centroDe(page.getByRole('button', { name: /^Aglomerado 5, / }))
  await page.mouse.move(alvoDaRoda.x, alvoDaRoda.y)
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -400)
  await expect.poll(async () => (await visao(page)).k).toBeGreaterThan(v0.k * 3)
  await foto(page, 'aglomerado-aproximado')
  await page.keyboard.press('0')
  await visaoAssentada(page)

  // em «Ver tudo»: clicar no centro de CADA ponto abre o cartão dele (e não o de um vizinho com o alvo por cima)
  // (cada clique parte de «Ver tudo»: abrir o cartão e devolver o foco ao ponto podem mover o mapa, e um ponto pode parar sob o
  // minimapa; foi o que fez falhar o clique perto do 5 uma vez em 10 no gate D-11 da revisão 1 da 17c)
  const total = await pontos.count()
  expect(total).toBeGreaterThanOrEqual(7)
  for (let i = 0; i < total; i++) {
    await page.keyboard.press('0')
    await visaoAssentada(page)
    const ponto = pontos.nth(i)
    const nome = semContagem((await ponto.getAttribute('aria-label'))!)
    const c = await centroDe(ponto)
    expect(await livreNoMapa(page, c.x, c.y), `o centro de «${nome}» está à vista`).toBe(true)
    await page.mouse.click(c.x, c.y)
    await expect(page.getByRole('dialog', { name: `Sítio selecionado: ${nome}` }), `o clique no centro de «${nome}»`).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(cartao).toHaveCount(0)
  }
  // um clique a poucos pixels de um ponto escolhe o mais perto (perto do centro do 5, mais longe dos outros)
  await page.keyboard.press('0')
  await visaoAssentada(page)
  const c5 = await centroDe(page.getByRole('button', { name: /^Aglomerado 5, / }))
  expect(await livreNoMapa(page, c5.x - 1.5, c5.y - 1), 'o lugar do clique perto do 5 está à vista').toBe(true)
  await page.mouse.click(c5.x - 1.5, c5.y - 1)
  await expect(page.getByRole('dialog', { name: 'Sítio selecionado: Aglomerado 5' })).toBeVisible()
  await page.keyboard.press('Escape')

  // passar o mouse num ponto do aglomerado acende a linha DELE (a mais perto), e só ela
  for (const [nome] of AGLOMERADO) {
    const c = await centroDe(page.getByRole('button', { name: new RegExp(`^${nome}, `) }))
    await page.mouse.move(c.x, c.y)
    await expect(page.locator('.sitio-linha-acesa')).toHaveCount(1)
    await expect(page.locator('.sitio-linha-acesa')).toContainText(nome)
  }
  await page.mouse.move(c5.x + 300, c5.y + 200)
  await expect(page.locator('.sitio-linha-acesa')).toHaveCount(0)

  // teclado: o grupo de pontos é UMA parada de Tab (m1), e PageDown percorre todos
  await expect(page.locator('[data-ponto][tabindex="0"]')).toHaveCount(1)
  await page.getByRole('checkbox', { name: /Limites das regiões/ }).focus()
  await page.keyboard.press('Shift+Tab') // a parada do grupo de pontos
  await expect(page.locator('[data-ponto]:focus')).toHaveCount(1)
  await page.keyboard.press('Shift+Tab') // o palco
  await expect(palco(page)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('[data-ponto]:focus')).toHaveCount(1)
  await page.keyboard.press('Tab')
  await expect(page.locator('[data-ponto]:focus')).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: /Limites das regiões/ })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Home')
  const visitados = new Set<string>()
  for (let i = 0; i < total + 2; i++) {
    visitados.add(semContagem((await page.locator('[data-ponto]:focus').getAttribute('aria-label'))!))
    await page.keyboard.press('PageDown')
  }
  expect(visitados.size, 'PageDown chega a todos os pontos').toBe(total)
  // as setas vão ao vizinho: do centro do aglomerado para o ponto de cima (o 1 ou o 3 estão a norte; o 2 e o 4 ao sul, no mapa)
  await page.getByRole('button', { name: /^Aglomerado 5, / }).focus()
  const x0 = (await visao(page)).x
  await page.keyboard.press('ArrowUp')
  const noNorte = semContagem((await page.locator('[data-ponto]:focus').getAttribute('aria-label'))!)
  expect(['Aglomerado 2', 'Aglomerado 4']).toContain(noNorte) // lat maior = mais ao norte = mais acima
  await page.keyboard.press('ArrowDown')
  expect(semContagem((await page.locator('[data-ponto]:focus').getAttribute('aria-label'))!)).not.toBe(noNorte)
  expect((await visao(page)).x).toBe(x0) // as setas num ponto não moveram o mapa
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('celular: o aglomerado de pontos (I1): um dedo arrasta e dois dedos pinçam em cima dos pontos; um toque escolhe o ponto certo', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('celular'), 'o dedo')
  await entrar(page)
  await criarAglomerado(page)
  await page.getByRole('group', { name: 'Modo de exibição' }).getByRole('button', { name: 'Mapa' }).click()
  await mapaPronto(page)
  await visaoAssentada(page)
  const toque = await dedos(page)
  const centros = await Promise.all(AGLOMERADO.map(([nome]) => centroDe(page.getByRole('button', { name: new RegExp(`^${nome}, `) }))))
  const meio = centros[4]!
  // o aglomerado tem os alvos de 22 px por cima uns dos outros: o dedo que começa nele tem que arrastar e pinçar
  const distancias = centros.flatMap((a, i) => centros.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y)))
  expect(Math.max(...distancias), 'o aglomerado é apertado').toBeLessThan(30)
  expect(Math.min(...distancias), 'e os pontos não coincidem').toBeGreaterThan(2)

  // um dedo: arrasta a partir de cima de um ponto; o mapa anda e o cartão não abre
  const v0 = await visao(page)
  await toque('touchStart', [meio])
  for (let i = 1; i <= 8; i++) await toque('touchMove', [{ x: meio.x - i * 5, y: meio.y + i * 3 }])
  await toque('touchEnd', [])
  await expect.poll(async () => (await visao(page)).x).not.toBe(v0.x)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Ver tudo' }).tap()
  await visaoAssentada(page)

  // dois dedos: pinça sobre o grupo e o zoom aumenta
  const v1 = await visao(page)
  const m = await centroDe(page.getByRole('button', { name: /^Aglomerado 5, / }))
  await toque('touchStart', [
    { x: m.x - 12, y: m.y },
    { x: m.x + 12, y: m.y },
  ])
  for (let i = 1; i <= 8; i++)
    await toque('touchMove', [
      { x: m.x - 12 - i * 8, y: m.y },
      { x: m.x + 12 + i * 8, y: m.y },
    ])
  await toque('touchEnd', [])
  await expect.poll(async () => (await visao(page)).k).toBeGreaterThan(v1.k * 2)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await foto(page, 'aglomerado-aproximado')
  await page.getByRole('button', { name: 'Ver tudo' }).tap()
  await visaoAssentada(page)

  // um toque sem mover no centro de cada ponto abre o cartão DELE, e um toque a 2 px do centro também
  for (const [nome] of AGLOMERADO) {
    const c = await centroDe(page.getByRole('button', { name: new RegExp(`^${nome}, `) }))
    await page.touchscreen.tap(c.x, c.y)
    await expect(page.getByRole('dialog', { name: `Sítio selecionado: ${nome}` }), `o toque no centro de «${nome}»`).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).tap()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // a folha pode ter movido o mapa (m13b) e o movimento leva um instante: espera o mapa assentar antes de medir o próximo ponto
    await visaoAssentada(page)
  }
  const c3 = await centroDe(page.getByRole('button', { name: /^Aglomerado 3, / }))
  await page.touchscreen.tap(c3.x + 1.5, c3.y - 1)
  await expect(page.getByRole('dialog', { name: 'Sítio selecionado: Aglomerado 3' })).toBeVisible()
  await foto(page, 'aglomerado-cartao')
})

test('computador: o contorno de foco do palco aparece sobre a terra e sobre o mar (I2)', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('celular'), 'o foco por teclado')
  await entrar(page)
  await criarSitio(page, 'Tell do Egito', 30.04, 31.24)
  await criarSitio(page, 'Tell do Irã', 32, 50)
  await page.goto('#/sitios')
  await mapaPronto(page)
  await page.getByRole('checkbox', { name: /Limites das regiões/ }).focus()
  await page.keyboard.press('Shift+Tab') // o grupo de pontos
  await page.keyboard.press('Shift+Tab') // o palco
  await expect(palco(page)).toBeFocused()
  expect(await palco(page).evaluate((el) => el.matches(':focus-visible'))).toBe(true)
  const caixa = (await palco(page).boundingBox())!
  const rente = (dx: number, dy: number) => ({ x: dx, y: dy })
  // os pontos de amostra: 1 px para dentro de cada lado (o contorno) e 12 px para dentro (o desenho que ele deve cobrir)
  const amostrar = async (rotulo: string) => {
    const png = await page.screenshot({ clip: caixa })
    const w = Math.round(caixa.width)
    const h = Math.round(caixa.height)
    const bordas = [rente(w / 2, 1), rente(w / 2, h - 2), rente(1, h / 2), rente(w - 2, h / 2), rente(w / 4, 1), rente(1, h / 4)]
    const dentro = [rente(w / 2, 12), rente(w / 2, h - 13), rente(12, h / 2), rente(w - 13, h / 2), rente(w / 4, 12), rente(12, h / 4)]
    const fora = await pixels(page, png, bordas)
    const miolo = await pixels(page, png, dentro)
    for (const [i, px] of fora.entries()) expect(Math.max(...px), `${rotulo}: o contorno de foco no ponto ${i}: ${px}`).toBeLessThan(60)
    return miolo
  }
  // sobre o mar (a vista de «Ver tudo» tem mar branco nas bordas) — e sobre a terra, depois de aproximar no meio do deserto
  const claro = (px: number[]) => px.every((c) => c >= 250)
  const miolo0 = await amostrar('vista inicial')
  expect(miolo0.some(claro), 'há mar na vista inicial (controle positivo: o branco)').toBe(true)
  await page.keyboard.press('+')
  await page.keyboard.press('+')
  await page.keyboard.press('+')
  await page.keyboard.press('+')
  await page.keyboard.press('+')
  await expect.poll(async () => (await visao(page)).k).toBeGreaterThan(2.5)
  await visaoAssentada(page)
  const miolo1 = await amostrar('sobre a terra')
  const terra = (px: number[]) => px.every((c) => c >= 202 && c <= 222) // a terra #d4d4d4 (212)
  expect(miolo1.every(terra), `a vista toda é terra (cinza ${JSON.stringify(miolo1)})`).toBe(true)
  await foto(page, 'foco-sobre-terra')
})

test('o zoom mínimo cobre o palco: nunca aparece faixa branca ao afastar (m4)', async ({ page }) => {
  await entrar(page)
  await page.goto('#/sitios')
  const celular = (page.viewportSize()?.width ?? 0) < 768
  if (celular) await page.getByRole('group', { name: 'Modo de exibição' }).getByRole('button', { name: 'Mapa' }).click()
  await mapaPronto(page)
  const afastar = page.getByRole('button', { name: 'Afastar' })
  for (let i = 0; i < 14; i++) await afastar.click()
  await visaoAssentada(page)
  const v = await visao(page)
  const area = (await palco(page).boundingBox())!
  expect(v.x).toBeLessThanOrEqual(0.6)
  expect(v.y).toBeLessThanOrEqual(0.6)
  expect(v.x + LARGURA_DA_EXTENSAO * v.k).toBeGreaterThanOrEqual(area.width - 2)
  expect(v.y + ALTURA_DA_EXTENSAO * v.k).toBeGreaterThanOrEqual(area.height - 2)
  await foto(page, 'afastado-ao-minimo')
})

test('o mapa cheio (93 sítios sintéticos): com os limites ligados todo nome de região aparece (m17) e as capturas', async ({ page }) => {
  test.setTimeout(300_000)
  await entrar(page)
  // 93 sítios inventados: um aglomerado grande (Levante) e o resto espalhado, por uma semente fixa
  let semente = 12345
  const aleatorio = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648
  for (let i = 1; i <= 93; i++) {
    const noLevante = i <= 52
    const lat = noLevante ? 29.6 + aleatorio() * 3.6 : 26 + aleatorio() * 11
    const lon = noLevante ? 34.6 + aleatorio() * 1.3 : 31 + aleatorio() * 24
    await criarSitio(page, `Sítio de teste ${String(i).padStart(2, '0')}`, Number(lat.toFixed(3)), Number(lon.toFixed(3)))
  }
  await page.goto('#/sitios')
  if ((page.viewportSize()?.width ?? 0) < 768) await page.getByRole('group', { name: 'Modo de exibição' }).getByRole('button', { name: 'Mapa' }).click()
  await mapaPronto(page)
  await visaoAssentada(page)
  await foto(page, 'cheio-1-ver-tudo')
  await page.getByRole('button', { name: 'Limites das regiões' }).or(page.getByRole('checkbox', { name: /Limites das regiões/ })).first().click()
  await foto(page, 'cheio-2-limites')
  // m17: os oito nomes aparecem, inteiros no palco e nenhum sobre outro nome (sobre os pontos, quem confere é m12)
  const caixas = async (seletor: string) => await page.locator(seletor).evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { id: (el.textContent || el.getAttribute('aria-label') || '').trim(), x: r.x, y: r.y, w: r.width, h: r.height } }))
  await expect.poll(() => page.locator('.mapa-rotulo-regiao').count()).toBeGreaterThanOrEqual(1)
  await visaoAssentada(page)
  const nomes = await caixas('.mapa-rotulo-regiao')
  expect(nomes.map((n) => n.id.toLowerCase()).sort(), 'todo nome de região aparece').toEqual(['anatólia', 'chipre', 'egito', 'irã', 'levante norte', 'levante sul', 'mesopotâmia', 'transjordânia'])
  const tamanhos = await page.locator('.mapa-rotulo-regiao').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)))
  expect(Math.min(...tamanhos), 'o nome da região tem 12 px ou mais').toBeGreaterThanOrEqual(12)
  const area = (await palco(page).boundingBox())!
  const cobre = (a: (typeof nomes)[0], b: (typeof nomes)[0]) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  for (const [i, a] of nomes.entries()) {
    expect(a.x, a.id).toBeGreaterThanOrEqual(area.x)
    expect(a.x + a.w, a.id).toBeLessThanOrEqual(area.x + area.width)
    for (const b of nomes.slice(i + 1)) expect(cobre(a, b), `«${a.id}» cobre «${b.id}»`).toBe(false)
  }
})


// ---------------------------------------------------------------------------------------------------------------------
// Revisão 2
// ---------------------------------------------------------------------------------------------------------------------

const luminancia = (px: number[]) => {
  const [r, g, b] = px.map((c) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contraste = (a: number[], b: number[]) => {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number]
  return (claro + 0.05) / (escuro + 0.05)
}

test('I4 (celular): um toque que treme 6 px ainda abre o cartão; um arrasto de 14 px move o mapa', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('celular'), 'o dedo')
  await entrar(page)
  await criarSitio(page, 'Tell do Egito', 30.04, 31.24)
  await criarSitio(page, 'Tell do Irã', 32, 50)
  await page.goto('#/sitios')
  await page.getByRole('group', { name: 'Modo de exibição' }).getByRole('button', { name: 'Mapa' }).click()
  await mapaPronto(page)
  await visaoAssentada(page)
  const toque = await dedos(page)
  const ponto = page.getByRole('button', { name: 'Tell do Egito, 0 objetos' })
  const c = await centroDe(ponto)
  const cartao = page.getByRole('dialog', { name: 'Sítio selecionado: Tell do Egito' })

  // controle positivo: o arrasto de 14 px (passa da folga do dedo) move o mapa e não abre o cartão
  const v0 = await visao(page)
  await toque('touchStart', [c])
  await toque('touchMove', [{ x: c.x + 7, y: c.y }])
  await toque('touchMove', [{ x: c.x + 14, y: c.y }])
  await toque('touchEnd', [])
  await expect.poll(async () => (await visao(page)).x).not.toBe(v0.x)
  await expect(cartao).toHaveCount(0)
  await page.getByRole('button', { name: 'Ver tudo' }).click()
  await visaoAssentada(page)

  // o toque que treme 6 px (abaixo da folga de 10 px do dedo): abre o cartão e o mapa não anda
  const c1 = await centroDe(ponto)
  const v1 = await visao(page)
  await toque('touchStart', [c1])
  await toque('touchMove', [{ x: c1.x + 3, y: c1.y + 1 }])
  await toque('touchMove', [{ x: c1.x + 6, y: c1.y }])
  await toque('touchEnd', [])
  await expect(cartao).toBeVisible()
  await visaoAssentada(page)
  // (a folha pode levar o ponto para cima dela: o que não pode é o toque ter sido um arrasto; o zoom fica o mesmo)
  expect((await visao(page)).k).toBe(v1.k)
})

test('m13 (celular): a folha do sítio não cobre o ponto escolhido', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('celular'), 'a folha de baixo')
  await entrar(page)
  // o ponto mais ao sul fica rente à borda de baixo em «Ver tudo»: justo onde a folha sobe
  await criarSitio(page, 'Tell do Norte', 36.6, 40.0)
  await criarSitio(page, 'Tell do Sul', 26.2, 40.5)
  await page.goto('#/sitios')
  await page.getByRole('group', { name: 'Modo de exibição' }).getByRole('button', { name: 'Mapa' }).click()
  await mapaPronto(page)
  await visaoAssentada(page)
  const sul = page.getByRole('button', { name: 'Tell do Sul, 0 objetos' })
  const antes = await centroDe(sul)
  const area = (await palco(page).boundingBox())!
  await sul.click()
  const folha = page.getByRole('dialog', { name: 'Sítio selecionado: Tell do Sul' })
  await expect(folha).toBeVisible()
  await visaoAssentada(page)
  const topoDaFolha = (await folha.boundingBox())!.y
  const depois = await centroDe(sul)
  expect(depois.y, 'o ponto fica acima da folha').toBeLessThan(topoDaFolha - 12)
  expect(depois.y, 'e dentro do mapa').toBeGreaterThan(area.y + 8)
  expect(depois.x).toBeGreaterThan(area.x + 8)
  expect(depois.x).toBeLessThan(area.x + area.width - 8)
  // controle positivo: sem o ajuste ele ficava onde estava, rente à borda de baixo (embaixo da folha)
  expect(antes.y, 'antes de abrir a folha o ponto estava na parte de baixo').toBeGreaterThan(topoDaFolha - 12)
  await foto(page, 'folha-com-o-ponto')
})

test('m13b (celular): a folha cresce quando as miniaturas carregam e o ponto continua acima dela', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('celular'), 'a folha de baixo')
  await entrar(page)
  // um sítio longe do Levante abre o enquadramento; «Tell Probe Teste» (pacote sintético) tem objetos com miniaturas
  await criarSitio(page, 'Tell do Egito', 30.04, 31.24)
  await page.goto('#/sitios')
  await page.getByRole('group', { name: 'Modo de exibição' }).getByRole('button', { name: 'Mapa' }).click()
  await mapaPronto(page)
  await visaoAssentada(page)
  const sonda = page.getByRole('button', { name: /^Tell Probe Teste, \d+ objetos?$/ })
  await sonda.click()
  const folha = page.getByRole('dialog', { name: 'Sítio selecionado: Tell Probe Teste' })
  const miniaturas = folha.getByRole('list', { name: 'Objetos de Tell Probe Teste' }).getByRole('link')
  await expect(miniaturas.first()).toBeVisible()
  await visaoAssentada(page)
  // a altura da folha com as miniaturas, e a que ela tinha antes delas (a linha de 72 px + o respiro)
  const alturaFinal = (await folha.boundingBox())!.height
  const alturaDaLinha = (await miniaturas.first().boundingBox())!.height
  expect(alturaDaLinha, 'a linha de miniaturas existe').toBeGreaterThan(40)
  await folha.getByRole('button', { name: 'Fechar' }).click()
  await expect(folha).toHaveCount(0)

  // põe o ponto logo acima da altura que a folha tem ao abrir (sem as miniaturas) e abaixo do topo que ela terá com elas
  const area = (await palco(page).boundingBox())!
  const topoFinal = area.y + area.height - alturaFinal
  const alvoY = topoFinal + alturaDaLinha / 2
  const toque = await dedos(page)
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const c = await centroDe(sonda)
    const dy = alvoY - c.y
    if (Math.abs(dy) < 8) break
    const passo = Math.max(-80, Math.min(80, dy))
    // arrasta a partir do centro do palco, longe dos controles
    const ini = { x: area.x + area.width * 0.5, y: area.y + area.height * 0.5 }
    await toque('touchStart', [ini])
    for (let i = 1; i <= 4; i++) await toque('touchMove', [{ x: ini.x, y: ini.y + (passo * i) / 4 }])
    await toque('touchEnd', [])
    await visaoAssentada(page)
  }
  const antes = await centroDe(sonda)
  expect(Math.abs(antes.y - alvoY), 'o ponto está na faixa entre o topo final e o topo inicial da folha').toBeLessThan(20)
  await sonda.click()
  await expect(folha).toBeVisible()
  await expect(miniaturas.first()).toBeVisible()
  await expect.poll(async () => Math.round((await folha.boundingBox())!.height)).toBeGreaterThanOrEqual(Math.round(alturaFinal) - 1)
  await visaoAssentada(page)
  const topo = (await folha.boundingBox())!.y
  const depois = await centroDe(sonda)
  expect(depois.y, 'o ponto fica acima da folha já com as miniaturas').toBeLessThan(topo - 12)
  expect(depois.y, 'e dentro do mapa').toBeGreaterThan(area.y + 8)
  await foto(page, 'folha-com-miniaturas')
})

// Guarda de regressão de ponta a ponta. Quem prova que o cartão do computador é OBSERVADO (a causa do defeito) é o teste de unidade T17-C-27
// em src/sitios/mapa.telas.test.tsx: no pacote sintético o cartão já nasce inteiro quando a conta roda, e este passa também sem o observador.
test('m19 (computador): o cartão cresce quando as miniaturas carregam e o ponto continua fora dele', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('computador'), 'o cartão do canto')
  await entrar(page)
  await criarSitio(page, 'Tell do Egito', 30.04, 31.24)
  await page.goto('#/sitios')
  await mapaPronto(page)
  await visaoAssentada(page)
  // A altura do cartão com as miniaturas, medida em OUTRO sítio com 3 objetos («Maḥteṣ Teste»): o da prova só abre uma vez, com o cartão
  // ainda sem as miniaturas (reabrir o mesmo sítio acharia os objetos já lidos e o cartão nasceria inteiro).
  const medida = page.getByRole('button', { name: /^Maḥteṣ Teste, \d+ objetos?$/ })
  await medida.click()
  const cartaoMedido = page.getByRole('dialog', { name: 'Sítio selecionado: Maḥteṣ Teste' })
  const miniaturasMedidas = cartaoMedido.getByRole('list', { name: 'Objetos de Maḥteṣ Teste' }).getByRole('link')
  await expect(miniaturasMedidas.first()).toBeVisible()
  await visaoAssentada(page)
  const final = (await cartaoMedido.boundingBox())!
  const alturaDaLinha = (await miniaturasMedidas.first().boundingBox())!.height
  expect(alturaDaLinha, 'a linha de miniaturas existe').toBeGreaterThan(40)
  await cartaoMedido.getByRole('button', { name: 'Fechar' }).click()
  await expect(cartaoMedido).toHaveCount(0)

  const sonda = page.getByRole('button', { name: /^Tell Probe Teste, \d+ objetos?$/ })
  const cartao = page.getByRole('dialog', { name: 'Sítio selecionado: Tell Probe Teste' })
  const miniaturas = cartao.getByRole('list', { name: 'Objetos de Tell Probe Teste' }).getByRole('link')

  // põe o ponto sob o cartão FINAL, logo abaixo da altura que o cartão tem ao abrir (sem as miniaturas)
  const alvo = { x: final.x + final.width / 2, y: final.y + final.height - alturaDaLinha / 2 }
  const area = (await palco(page).boundingBox())!
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const c = await centroDe(sonda)
    const dx = alvo.x - c.x
    const dy = alvo.y - c.y
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) break
    // arrasta o mapa por um canto livre de baixo, longe do cartão e dos controles
    const ini = { x: area.x + area.width * 0.6, y: area.y + area.height * 0.85 }
    await page.mouse.move(ini.x, ini.y)
    await page.mouse.down()
    await page.mouse.move(ini.x + Math.max(-120, Math.min(120, dx)), ini.y + Math.max(-120, Math.min(120, dy)), { steps: 6 })
    await page.mouse.up()
    await visaoAssentada(page)
  }
  const antes = await centroDe(sonda)
  expect(Math.abs(antes.x - alvo.x) + Math.abs(antes.y - alvo.y), 'o ponto está sob o cartão final, abaixo do cartão inicial').toBeLessThan(14)
  await sonda.click()
  await expect(cartao).toBeVisible()
  await expect(miniaturas.first()).toBeVisible()
  await expect.poll(async () => Math.round((await cartao.boundingBox())!.height)).toBeGreaterThanOrEqual(Math.round(final.height) - 1)
  await visaoAssentada(page)
  const caixa = (await cartao.boundingBox())!
  const depois = await centroDe(sonda)
  const dentro = depois.x > caixa.x && depois.x < caixa.x + caixa.width && depois.y > caixa.y && depois.y < caixa.y + caixa.height
  expect(dentro, 'o ponto não fica sob o cartão já com as miniaturas').toBe(false)
  await foto(page, 'cartao-com-miniaturas-computador')
})

test('m12: os nomes das regiões não se cobrem nem cobrem os pontos', async ({ page }) => {
  await entrar(page)
  await criarSitio(page, 'Tell do Egito', 30.04, 31.24)
  await criarSitio(page, 'Tell do Irã', 32, 50)
  // um ponto exatamente onde nasce o nome «Levante Sul», e um grupo no Levante
  await criarSitio(page, 'Sobre o nome', 30.57, 34.12)
  for (const [i, [lat, lon]] of ([[31.2, 35.1], [31.6, 35.3], [32.0, 35.5], [32.6, 35.4], [31.9, 35.9]] as [number, number][]).entries()) await criarSitio(page, `Levante ${i + 1}`, lat, lon)
  await page.goto('#/sitios')
  const celular = (page.viewportSize()?.width ?? 0) < 768
  if (celular) await page.getByRole('group', { name: 'Modo de exibição' }).getByRole('button', { name: 'Mapa' }).click()
  await mapaPronto(page)
  await visaoAssentada(page)
  await page.getByRole('button', { name: 'Limites das regiões' }).or(page.getByRole('checkbox', { name: /Limites das regiões/ })).first().click()
  await expect.poll(() => page.locator('.mapa-rotulo-regiao').count()).toBeGreaterThanOrEqual(3)
  const caixas = async (seletor: string) => (await page.locator(seletor).evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { id: el.textContent || el.getAttribute('aria-label') || '', x: r.x, y: r.y, w: r.width, h: r.height } })))
  const nomes = await caixas('.mapa-rotulo-regiao')
  const pontos = await caixas('[data-ponto]')
  const cobre = (a: (typeof nomes)[0], b: (typeof nomes)[0]) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  for (const [i, a] of nomes.entries()) {
    for (const b of nomes.slice(i + 1)) expect(cobre(a, b), `«${a.id}» cobre «${b.id}»`).toBe(false)
    for (const q of pontos) expect(cobre(a, q), `«${a.id}» cobre o ponto «${q.id}»`).toBe(false)
  }
  await foto(page, 'levante-com-nomes')
})

test('m10: Chipre e Creta são terra no mapa desenhado, e a terra se distingue do mar (contraste ≥ 1,4 : 1)', async ({ page }) => {
  await entrar(page)
  // um sítio a oeste de Creta e outro a leste: «Ver tudo» mostra as duas ilhas
  await criarSitio(page, 'Tell do Oeste', 30.0, 24.2)
  await criarSitio(page, 'Tell do Leste', 32, 50)
  await page.goto('#/sitios')
  if ((page.viewportSize()?.width ?? 0) < 768) await page.getByRole('group', { name: 'Modo de exibição' }).getByRole('button', { name: 'Mapa' }).click()
  await mapaPronto(page)
  await visaoAssentada(page)
  const v = await visao(page)
  const area = (await palco(page).boundingBox())!
  const naTela = (lat: number, lon: number) => {
    const b = projetar(lat, lon)
    return { x: b.x * v.k + v.x, y: b.y * v.k + v.y }
  }
  const png = await page.screenshot({ clip: area, scale: 'css' })
  // uma janela de 5 × 3 px em volta do ponto: o pixel mais parecido com a terra (a costa de 1 px não conta como o interior)
  const janela = (c: { x: number; y: number }) => [-2, -1, 0, 1, 2].flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: c.x + dx, y: c.y + dy })))
  const amostra = async (lat: number, lon: number) => {
    const c = naTela(lat, lon)
    expect(c.x, `(${lat}, ${lon}) cabe no palco`).toBeGreaterThan(4)
    expect(c.x).toBeLessThan(area.width - 4)
    expect(c.y).toBeGreaterThan(4)
    expect(c.y).toBeLessThan(area.height - 4)
    return pixels(page, png, janela(c))
  }
  const ehTerra = (px: number[]) => px.every((c) => c >= 202 && c <= 222)
  const ehMar = (px: number[]) => px.every((c) => c >= 250)
  const chipre = await amostra(35.0, 33.2)
  const creta = await amostra(35.2, 24.9)
  const mar = await amostra(33.4, 33.4) // o Mediterrâneo ao sul de Chipre (controle: branco)
  expect(chipre.some(ehTerra), `Chipre: ${JSON.stringify(chipre)}`).toBe(true)
  expect(creta.some(ehTerra), `Creta: ${JSON.stringify(creta)}`).toBe(true)
  expect(mar.every(ehMar), `mar: ${JSON.stringify(mar)}`).toBe(true)
  const terra = chipre.find(ehTerra)!
  expect(contraste(terra, mar[0]!), 'terra contra mar').toBeGreaterThanOrEqual(1.4)
  await foto(page, 'ilhas')
})
