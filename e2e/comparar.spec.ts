import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { apertarAteAparecer } from './teclas'
import { expect, test } from './fixtures'
import { escreverNota } from './notasNaTela'

/**
 * Comparar (Tarefa 14) no navegador de verdade (worker, sqlite-wasm, IndexedDB), pela tela, nos dois tamanhos: pôr objetos na
 * bandeja pelo botão "Comparar (n/4)" e por Shift+C, o contador no Menu, a bandeja cheia, Comparar com os objetos lado a lado
 * (computador: as linhas na mesma altura; celular: um por vez, deslizando, com a posição), remover e esvaziar com Desfazer,
 * "Comparar todos" de uma citação (decisão 44: troca a bandeja, com Desfazer que sobrevive a recarregar), e a bandeja que continua
 * depois de recarregar. Com SHOTS_DIR definido, guarda capturas (SHOTS_PREFIX põe um prefixo nos nomes).
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
  await ver?.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  // Toda imagem à vista carregada, decodificada e pintada antes da captura (senão sai preta de vez em quando).
  await page.waitForFunction(() => [...document.images].filter((i) => i.getBoundingClientRect().width > 0 && getComputedStyle(i).visibility !== 'hidden').every((i) => i.complete && i.naturalWidth > 0))
  await page.evaluate(async () => {
    await Promise.all([...document.images].filter((i) => i.getBoundingClientRect().width > 0).map((i) => i.decode().catch(() => undefined)))
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  })
  await page.screenshot({ path: join(pasta, `${process.env.SHOTS_PREFIX ?? ''}${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}
async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}
/** O item aberto, com as teclas dele prontas (o ícone de idioma é desenhado pelo mesmo componente que as registra). */
async function abrirItem(page: Page, numero: string) {
  await page.goto(`#/item/${numero}`)
  await expect(page.getByRole('button', { name: 'Mostrar o original alemão' })).toBeVisible()
}
const colunas = (page: Page) => page.locator('section.comparar-coluna')

test('pôr objetos na comparação, olhar lado a lado, tirar, esvaziar, desfazer e recarregar', async ({ page }) => {
  await entrar(page)

  // 1. Vazia: ensina como pôr; o Menu mostra o contador 0/4.
  await page.goto('#/comparar')
  await expect(page.getByText('Nenhum objeto na comparação.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Esvaziar a comparação' })).toHaveCount(0)
  await semRolagemHorizontal(page, 'Comparar vazia')
  await foto(page, 'comparar-1-vazia')

  // 2. O botão e Shift+C no Item: o contador sobe, a mensagem diz o que houve, o mesmo objeto de novo "já está".
  await abrirItem(page, 'CA00001')
  await page.getByRole('button', { name: 'Comparar (0/4)' }).click()
  await expect(page.getByRole('status', { name: 'Mensagem da comparação' })).toContainText('CA00001 entrou na comparação (1/4).')
  await page.getByRole('button', { name: 'Comparar (1/4)' }).click()
  await expect(page.getByRole('status', { name: 'Mensagem da comparação' })).toContainText('CA00001 já está na comparação.')
  await abrirItem(page, 'CA00002')
  await apertarAteAparecer(page, 'Shift+C', page.getByRole('button', { name: 'Comparar (2/4)' }))
  // Shift+C não é o C da coleção: a folha das coleções não abriu.
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // 3. O Menu tem Comparar com o mesmo contador e leva à tela.
  // (No celular o Menu abre do Início; no computador, da barra.)
  if (celular(page)) {
    await page.goto('#/')
    await page.getByRole('button', { name: 'Abrir o menu' }).click()
  } else {
    await page.getByRole('button', { name: 'Menu' }).click()
  }
  const menu = page.getByRole('dialog', { name: 'Menu' })
  await expect(menu.getByRole('link', { name: /Comparar/ })).toContainText('2/4')
  await menu.getByRole('link', { name: /Comparar/ }).click()
  await expect(page).toHaveURL(/#\/comparar$/)

  // 4. Dois objetos: lado a lado no computador (linhas na mesma altura), um por vez no celular.
  await expect(colunas(page)).toHaveCount(2)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Comparar · 2 objetos')
  const um = page.getByRole('region', { name: 'CA00001' })
  const dois = page.getByRole('region', { name: 'CA00002' })
  await expect(um.getByRole('heading', { level: 2 })).toContainText('Pingente')
  await expect(um.locator('.imagem-item-figura img')).toBeVisible()
  await expect(dois.locator('.imagem-item-figura img')).toBeVisible()
  if (!celular(page)) {
    const a = await um.boundingBox()
    const b = await dois.boundingBox()
    expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x + 2)
    expect(Math.abs(a!.width - b!.width)).toBeLessThan(2)
    // Cada rótulo de linha está na mesma altura nas duas colunas.
    const alturas = async (c: Locator) => c.locator('.comparar-celula dt').evaluateAll((els) => els.map((e) => [e.textContent!.replace('≠', '').trim(), Math.round(e.getBoundingClientRect().top)] as const))
    const ta = await alturas(um)
    const tb = await alturas(dois)
    expect(ta.map((x) => x[0])).toEqual(tb.map((x) => x[0]))
    expect(ta.map((x) => x[1])).toEqual(tb.map((x) => x[1]))
    // O pé também.
    const pe = async (c: Locator) => Math.round((await c.locator('.comparar-pe').boundingBox())!.y)
    expect(await pe(um)).toBe(await pe(dois))
    await expect(page.getByRole('navigation', { name: 'Posição na comparação' })).toHaveCount(0)
  } else {
    await expect(page.getByRole('navigation', { name: 'Posição na comparação' }).getByRole('status')).toHaveText('1 de 2')
  }
  await semRolagemHorizontal(page, 'Comparar com 2 objetos')
  await foto(page, 'comparar-2-dois-objetos')
  await foto(page, 'comparar-2b-leituras', um.locator('.comparar-celula-leitura').first())

  // 5. As diferenças: o botão esconde o que é igual e volta.
  const todas = await um.locator('.comparar-celula').count()
  await page.getByRole('button', { name: 'Mostrar só as diferenças' }).click()
  expect(await um.locator('.comparar-celula').count()).toBeLessThan(todas)
  await foto(page, 'comparar-3-so-diferencas')
  await page.getByRole('button', { name: 'Mostrar só as diferenças' }).click()
  await expect(um.locator('.comparar-celula')).toHaveCount(todas)

  // 6. Quatro objetos; o quinto não entra e a mensagem oferece abrir Comparar.
  await abrirItem(page, 'CA00003')
  await page.getByRole('button', { name: 'Comparar (2/4)' }).click()
  await abrirItem(page, 'CA00004')
  await page.getByRole('button', { name: 'Comparar (3/4)' }).click()
  await expect(page.getByRole('button', { name: 'Comparar (4/4)' })).toBeVisible()
  await abrirItem(page, 'BA00001')
  await page.getByRole('button', { name: 'Comparar (4/4)' }).click()
  const aviso = page.getByRole('status', { name: 'Mensagem da comparação' })
  await expect(aviso).toContainText('A comparação já tem 4 objetos. Abra Comparar para tirar um.')
  await expect(aviso).toBeInViewport()
  await foto(page, 'comparar-4-cheia')
  await aviso.getByRole('link', { name: 'Abrir Comparar' }).click()
  await expect(page).toHaveURL(/#\/comparar$/)
  await expect(colunas(page)).toHaveCount(4)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Comparar · 4 objetos')
  if (!celular(page)) {
    const caixas = await Promise.all([0, 1, 2, 3].map(async (i) => colunas(page).nth(i).boundingBox()))
    for (let i = 1; i < 4; i++) expect(caixas[i]!.x).toBeGreaterThan(caixas[i - 1]!.x)
    expect(caixas[3]!.x + caixas[3]!.width).toBeLessThanOrEqual(1280)
  }
  await expect(page.getByText('Carregando…')).toHaveCount(0)
  await expect(page.locator('.comparar-imagem .imagem-item-figura img')).toHaveCount(4)
  await semRolagemHorizontal(page, 'Comparar com 4 objetos')
  await foto(page, 'comparar-5-quatro-objetos')

  // 7. Celular: deslizar. A faixa rola até o objeto e a posição acompanha; os botões também andam.
  if (celular(page)) {
    const posicao = page.getByRole('navigation', { name: 'Posição na comparação' }).getByRole('status')
    await expect(posicao).toHaveText('1 de 4')
    await page.getByRole('button', { name: 'Objeto seguinte' }).click()
    await expect(posicao).toHaveText('2 de 4')
    // (a rolagem suave termina no encaixe antes da captura)
    await expect.poll(async () => page.getByTestId('comparar-colunas').evaluate((el) => el.scrollLeft - el.clientWidth)).toBe(0)
    await foto(page, 'comparar-6-celular-posicao')
    // deslizar com o dedo = rolar a faixa
    await page.getByTestId('comparar-colunas').evaluate((el) => el.scrollTo({ left: el.clientWidth * 3, behavior: 'instant' }))
    await expect(posicao).toHaveText('4 de 4')
    await page.getByRole('button', { name: 'Objeto anterior' }).click()
    await expect(posicao).toHaveText('3 de 4')
  }

  // 8. Tirar um objeto: a coluna sai, a mensagem diz e Desfazer volta.
  await page.getByRole('region', { name: 'CA00002' }).getByRole('button', { name: 'Tirar da comparação: CA00002' }).click()
  await expect(page.getByRole('region', { name: 'CA00002' })).toHaveCount(0)
  await expect(page.getByRole('status', { name: 'Mensagem de Comparar' })).toContainText('CA00002 tirado da comparação.')
  await page.getByRole('status', { name: 'Mensagem de Comparar' }).getByRole('button', { name: 'Desfazer' }).click()
  await expect(page.getByRole('region', { name: 'CA00002' })).toHaveCount(1)
  await expect(colunas(page)).toHaveCount(4)

  // 9. Recarregar: a bandeja continua.
  await page.reload()
  await expect(colunas(page)).toHaveCount(4)

  // 10. Esvaziar, com Desfazer; Esvaziar de novo e deixar vazia.
  await page.getByRole('button', { name: 'Esvaziar a comparação' }).click()
  await expect(page.getByText('Nenhum objeto na comparação.')).toBeVisible()
  await expect(page.getByRole('status', { name: 'Mensagem de Comparar' })).toContainText('Comparação esvaziada: 4 objetos tirados.')
  // O foco não se perde: o botão clicado sumiu e o foco foi ao «Desfazer» da mensagem.
  await expect(page.getByRole('status', { name: 'Mensagem de Comparar' }).getByRole('button', { name: 'Desfazer' })).toBeFocused()
  await foto(page, 'comparar-10-foco-depois-de-esvaziar')
  if (!celular(page)) {
    // T17-C-3: o mouse ficou onde estava o «Esvaziar» (agora o «+» está ali): a dica do «+» não cobre o «Desfazer» da mensagem.
    const mais = page.getByRole('button', { name: 'Adicionar objeto à comparação' })
    await mais.hover()
    await expect.poll(() => mais.evaluate((el) => getComputedStyle(el, '::after').display)).toBe('block')
    const dica = await mais.evaluate((el) => {
      const c = getComputedStyle(el, '::after')
      const r = el.getBoundingClientRect()
      const w = parseFloat(c.width)
      const h = parseFloat(c.height)
      // a caixa da dica, a partir dos valores usados que o navegador resolveu (left/top em px do botão; a transformação sobe metade da altura)
      const left = r.left + parseFloat(c.left)
      const top = r.top + parseFloat(c.top) - (c.transform !== 'none' ? h / 2 : 0)
      return { left, top, right: left + w, bottom: top + h }
    })
    const desfazerCaixa = (await page.getByRole('status', { name: 'Mensagem de Comparar' }).getByRole('button', { name: 'Desfazer' }).boundingBox())!
    const cruza = dica.left < desfazerCaixa.x + desfazerCaixa.width && dica.right > desfazerCaixa.x && dica.top < desfazerCaixa.y + desfazerCaixa.height && dica.bottom > desfazerCaixa.y
    expect(cruza, 'a dica do + cobre o Desfazer').toBe(false)
    await foto(page, 'comparar-10b-dica-do-mais')
    await page.mouse.move(600, 600)
  }
  await page.getByRole('status', { name: 'Mensagem de Comparar' }).getByRole('button', { name: 'Desfazer' }).click()
  await expect(colunas(page)).toHaveCount(4)
  await page.getByRole('button', { name: 'Esvaziar a comparação' }).click()
  await expect(page.getByText('Nenhum objeto na comparação.')).toBeVisible()
})

test('Comparar todos TROCA a bandeja pelos objetos da citação, diz os que ficaram de fora, e o Desfazer devolve a de antes (também depois de recarregar)', async ({ page }) => {
  await entrar(page)
  await page.goto('#/comparar')
  await expect(page.getByText('Nenhum objeto na comparação.')).toBeVisible()
  const nomes = async () => colunas(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  const poe = async (numero: string) => {
    await page.getByRole('button', { name: 'Adicionar objeto à comparação' }).click()
    const campo = page.getByRole('textbox', { name: 'Número do objeto' })
    await campo.fill(numero)
    await campo.press('Enter')
    await expect(page.getByRole('status', { name: 'Mensagem de Comparar' })).toContainText(`${numero} entrou na comparação.`)
  }
  // A bandeja já cheia, com outros objetos (só dois deles são citados abaixo).
  for (const n of ['BA00001', 'BA00002', 'CA00003', 'CA00004']) await poe(n)
  await expect(colunas(page)).toHaveCount(4)
  expect(await nomes()).toEqual(['BA00001', 'BA00002', 'CA00003', 'CA00004'])

  // Uma nota com a citação (o pacote sintético tem CA00001 a CA00004, BA00001 e BA00002; "TESTE I: 1-8" são 6 objetos).
  await abrirItem(page, 'BA00002')
  await escreverNota(page, 'Série: TESTE I: 1-8.')
  const nota = page.getByRole('region', { name: 'Leituras' }).getByRole('group', { name: 'SKC notas' }).getByRole('article').filter({ hasText: 'Série' })
  await nota.getByRole('button', { name: 'TESTE I: 1–8, lista dos objetos' }).click()
  const folha = page.getByRole('dialog', { name: 'TESTE I: 1–8' })
  await expect(folha.getByRole('link')).toHaveCount(6)
  const botao = folha.getByRole('button', { name: 'Comparar todos' })
  await expect(botao).toBeVisible()
  await expect(folha).toContainText('Troca a comparação por estes objetos')
  await expect(folha).toContainText('entram os 4 primeiros')
  await foto(page, 'comparar-7-comparar-todos-folha')
  await botao.click()

  // Substituiu: os 4 primeiros da citação, na ordem; BA00001 e BA00002 (que estavam) saíram e ficaram de fora também.
  await expect(page).toHaveURL(/#\/comparar$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(colunas(page)).toHaveCount(4)
  expect(await nomes()).toEqual(['CA00001', 'CA00002', 'CA00003', 'CA00004'])
  const aviso = page.getByRole('status', { name: 'Mensagem de Comparar' })
  await expect(aviso).toContainText('4 objetos de TESTE I: 1–8 entraram na comparação, no lugar de 2 objetos que estavam.')
  await expect(aviso).toContainText('2 objetos ficaram de fora (a comparação leva até 4): BA00001, BA00002.')
  await expect(aviso).not.toContainText('o próximo entra')
  await expect(aviso.getByRole('button', { name: 'Desfazer' })).toBeVisible()
  await expect(aviso).toBeInViewport()
  await expect(page.getByText('Carregando…')).toHaveCount(0)
  await expect.poll(async () => page.locator('.comparar-imagem .imagem-item-figura img').evaluateAll((els) => els.every((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0))).toBe(true)
  await semRolagemHorizontal(page, 'Comparar depois de Comparar todos')
  await foto(page, 'comparar-8-comparar-todos-resultado')

  // Recarregar: o Desfazer continua lá (vem do estado do histórico) e devolve exatamente a bandeja de antes.
  await page.reload()
  await expect(colunas(page)).toHaveCount(4)
  expect(await nomes()).toEqual(['CA00001', 'CA00002', 'CA00003', 'CA00004'])
  const depoisDeRecarregar = page.getByRole('status', { name: 'Mensagem de Comparar' })
  await expect(depoisDeRecarregar).toContainText('4 objetos de TESTE I: 1–8 entraram na comparação')
  await depoisDeRecarregar.getByRole('button', { name: 'Desfazer' }).click()
  await expect.poll(nomes).toEqual(['BA00001', 'BA00002', 'CA00003', 'CA00004'])
  await expect(page.getByRole('button', { name: 'Desfazer' })).toHaveCount(0)

  // Depois de usado, recarregar não o oferece de novo.
  await page.reload()
  await expect(colunas(page)).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Desfazer' })).toHaveCount(0)
  expect(await nomes()).toEqual(['BA00001', 'BA00002', 'CA00003', 'CA00004'])
})

test('adicionar por número em Comparar, e o número que não existe', async ({ page }) => {
  await entrar(page)
  await page.goto('#/comparar')
  await page.getByRole('button', { name: 'Adicionar objeto à comparação' }).click()
  const campo = page.getByRole('textbox', { name: 'Número do objeto' })
  await expect(campo).toBeFocused()
  await campo.fill('CA09999')
  await campo.press('Enter')
  await expect(page.getByRole('alert')).toContainText('Não achei o objeto CA09999.')
  await campo.fill('ba00002')
  await campo.press('Enter')
  await expect(page.getByRole('region', { name: 'BA00002' })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Mensagem de Comparar' })).toContainText('BA00002 entrou na comparação.')
  await semRolagemHorizontal(page, 'Comparar com um objeto')
})

test('objetos SKC na comparação: um texto longo não desalinha as linhas dos outros, e quem não tem a leitura fica com a célula vazia', async ({ page }) => {
  await entrar(page)
  const longa = 'Leitura sintética longa: dois quadrúpedes afrontados sob um disco, com as caudas voltadas para dentro e os chifres cruzados. '.repeat(8)
  async function criar(titulo: string, leitura: string) {
    await page.goto('#/objeto/novo')
    await page.getByLabel('Tipo e descrição curta').fill(titulo)
    await page.getByRole('radiogroup', { name: 'Período' }).getByRole('radio', { name: /Calcolítico/ }).click()
    if (leitura) await page.getByRole('textbox', { name: /^Leitura/ }).fill(leitura)
    await page.getByRole('button', { name: /Salvar objeto/ }).first().click()
    await expect(page).toHaveURL(/#\/item\/OB-[a-z0-9]{8}-\d+/)
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible()
    await page.getByRole('button', { name: /^Comparar \(\d\/4\)$/ }).click()
    await expect(page.getByRole('status', { name: 'Mensagem da comparação' })).toContainText('entrou na comparação')
  }
  await criar('Selo longo. Pedra.', longa)
  await criar('Selo curto. Pedra.', 'Leitura curta.')
  // O objeto curto é ligado ao CA00001 do livro (o livro é o principal): na comparação ele aparece como ele mesmo, com «ligado a CA00001».
  await page.getByRole('button', { name: 'Ligar a um objeto existente' }).click()
  await page.getByLabel('Número do outro objeto').fill('CA00001')
  await page.getByRole('button', { name: 'Ligar', exact: true }).click()
  await expect(page).toHaveURL(/#\/item\/CA00001$/)
  await abrirItem(page, 'CA00001')
  await page.getByRole('button', { name: /^Comparar \(2\/4\)$/ }).click()
  await expect(page.getByRole('status', { name: 'Mensagem da comparação' })).toContainText('CA00001 entrou na comparação (3/4).')

  await page.goto('#/comparar')
  await expect(colunas(page)).toHaveCount(3)
  await expect(page.getByText('Carregando…')).toHaveCount(0)
  const longo = colunas(page).nth(0)
  const curto = colunas(page).nth(1)
  const livro = colunas(page).nth(2)
  await expect(longo.getByRole('button', { name: 'Ler tudo' })).toBeVisible()
  // A célula de leitura SKC do livro está vazia, na mesma linha.
  const leituraSkc = (c: Locator) => c.locator('.comparar-celula-leitura').filter({ has: page.locator('dt', { hasText: /^SKC/ }) })
  await expect(leituraSkc(livro)).toHaveClass(/comparar-celula-vazia/)
  await expect(livro.getByRole('heading', { level: 2 })).toContainText('Pingente')
  // Tudo alinhado: o rótulo de cada linha e o pé estão na mesma altura nas três colunas, e o texto longo recolhido não empurra nada.
  // (posições na página, não na janela: clicar rola a tela)
  const altura = async () =>
    Promise.all(
      [longo, curto, livro].map(async (c) => ({
        dt: await c.locator('.comparar-celula dt').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top + window.scrollY))),
        pe: await c.locator('.comparar-pe').evaluate((e) => Math.round(e.getBoundingClientRect().top + window.scrollY)),
      })),
    )
  if (!celular(page)) {
    const antes = await altura()
    for (const a of antes) expect(a.dt).toEqual(antes[0]!.dt)
    for (const a of antes) expect(a.pe).toBe(antes[0]!.pe)
    await foto(page, 'comparar-9-skc-texto-longo', leituraSkc(longo))
    // "Ler tudo" abre o texto inteiro: a linha cresce para as três colunas ao mesmo tempo, sem desalinhar.
    await longo.getByRole('button', { name: 'Ler tudo' }).click()
    const depois = await altura()
    for (const a of depois) expect(a.dt).toEqual(depois[0]!.dt)
    for (const a of depois) expect(a.pe).toBe(depois[0]!.pe)
    expect(depois[0]!.pe).toBeGreaterThan(antes[0]!.pe)
  } else {
    await foto(page, 'comparar-9-skc-texto-longo', leituraSkc(longo))
  }
  await semRolagemHorizontal(page, 'Comparar com objetos SKC')

  // Ligado: o objeto curto mostra «ligado a CA00001»; o principal (o livro) não mostra marca; «Abrir o item» do ligado abre ELE (?sozinho=1).
  await expect(curto).toContainText('ligado a CA00001')
  await expect(livro).not.toContainText('ligado a')
  await expect(longo).not.toContainText('ligado a')
  const abrirCurto = curto.getByRole('link', { name: /^Abrir o item/ })
  await expect(abrirCurto).toHaveAttribute('href', /#\/item\/CA\d{5}\?sozinho=1$/)
  // (no celular só uma coluna está à vista: anda até a do objeto ligado)
  if (celular(page)) {
    await page.getByRole('button', { name: 'Objeto seguinte' }).click()
    await expect.poll(async () => page.getByTestId('comparar-colunas').evaluate((el) => el.scrollLeft - el.clientWidth)).toBe(0)
  }
  // C-7 (revisão m2): o número e a origem («CA00006 · SKC») ficam juntos na primeira linha; só as marcas descem.
  const [caixaNumero, caixaOrigem, caixaMarca] = await Promise.all(
    [curto.locator('.comparar-numero span').first(), curto.locator('.comparar-origem'), curto.locator('.marca-ligado')].map((l) => l.boundingBox()),
  )
  expect(Math.abs(caixaNumero!.y - caixaOrigem!.y)).toBeLessThan(2)
  expect(caixaOrigem!.x).toBeGreaterThan(caixaNumero!.x)
  expect(caixaMarca!.y + caixaMarca!.height).toBeGreaterThan(caixaOrigem!.y)
  await foto(page, 'comparar-11-objeto-ligado', curto.locator('.comparar-cabeca'))
  // (o encaixe da faixa do celular desfaz a rolagem que o Playwright faz para clicar; o clique em si é o do link)
  if (celular(page)) await abrirCurto.evaluate((el: HTMLElement) => el.click())
  else await abrirCurto.click()
  await expect(page).toHaveURL(/#\/item\/CA\d{5}\?sozinho=1$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Selo curto. Pedra.' })).toBeVisible()
})

test('«só as diferenças» sem nenhuma diferença: a mensagem diz, a grade não se quebra e o pé continua alinhado', async ({ page }) => {
  await entrar(page)
  async function criar(titulo: string) {
    await page.goto('#/objeto/novo')
    await page.getByLabel('Tipo e descrição curta').fill(titulo)
    await page.getByRole('radiogroup', { name: 'Período' }).getByRole('radio', { name: /Calcolítico/ }).click()
    await page.getByRole('button', { name: /Salvar objeto/ }).first().click()
    await expect(page).toHaveURL(/#\/item\/OB-[a-z0-9]{8}-\d+/)
    await page.getByRole('button', { name: /^Comparar \(\d\/4\)$/ }).click()
    await expect(page.getByRole('status', { name: 'Mensagem da comparação' })).toContainText('entrou na comparação')
  }
  await criar('Selo igual um. Pedra.')
  await criar('Selo igual dois. Pedra.')
  await page.goto('#/comparar')
  await expect(colunas(page)).toHaveCount(2)
  await expect(page.getByText('Carregando…')).toHaveCount(0)
  const alinhados = async () => {
    const pes = await colunas(page).evaluateAll((els) => els.map((e) => Math.round(e.querySelector('.comparar-pe')!.getBoundingClientRect().top + window.scrollY)))
    expect(pes[0]).toBe(pes[1])
    const alturas = await page.locator('.comparar-imagem').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
    return alturas
  }
  const comLinhas = await colunas(page).nth(0).locator('.comparar-celula').count()
  expect(comLinhas).toBeGreaterThan(0)
  const alturasAntes = celular(page) ? [] : await alinhados()
  await page.getByRole('button', { name: 'Mostrar só as diferenças' }).click()
  await expect(page.getByText('Nenhuma diferença nos dados mostrados.')).toBeVisible()
  await expect(colunas(page).nth(0).locator('.comparar-celula')).toHaveCount(0)
  if (!celular(page)) {
    // A linha da imagem mantém a altura de antes (a declaração da grade não caiu) e o pé segue na mesma altura nas duas colunas.
    const alturasDepois = await alinhados()
    expect(alturasDepois).toEqual(alturasAntes)
    expect(alturasDepois[0]).toBeGreaterThanOrEqual(300)
  }
  await semRolagemHorizontal(page, 'Comparar só as diferenças, sem nenhuma')
  await foto(page, 'comparar-12-so-diferencas-zero')
})

test('no celular, a posição e «só as diferenças» ficam no endereço: voltar do visualizador de imagem encontra a mesma coluna e o foco no «Ampliar» dela', async ({ page }) => {
  test.skip(!celular(page), 'a posição por coluna só existe no celular')
  await entrar(page)
  for (const n of ['CA00001', 'CA00002', 'CA00003']) {
    await abrirItem(page, n)
    await page.getByRole('button', { name: /^Comparar \(\d\/4\)$/ }).click()
    await expect(page.getByRole('status', { name: 'Mensagem da comparação' })).toContainText('entrou na comparação')
  }
  await page.goto('#/comparar')
  await expect(colunas(page)).toHaveCount(3)
  const posicao = page.getByRole('navigation', { name: 'Posição na comparação' }).getByRole('status')
  await page.getByRole('button', { name: 'Objeto seguinte' }).click()
  await expect(posicao).toHaveText('2 de 3')
  await expect(page).toHaveURL(/#\/comparar\?pos=2$/)
  await page.getByRole('button', { name: 'Mostrar só as diferenças' }).click()
  await expect(page).toHaveURL(/#\/comparar\?(pos=2&dif=1|dif=1&pos=2)$/)
  const segunda = page.getByRole('region', { name: 'CA00002' })
  await expect.poll(async () => page.getByTestId('comparar-colunas').evaluate((el) => el.scrollLeft - el.clientWidth)).toBe(0)
  await segunda.getByRole('link', { name: 'Ampliar a imagem' }).click()
  await expect(page).toHaveURL(/#\/imagem\//)
  await page.getByRole('button', { name: 'Fechar o visualizador' }).first().click()
  await expect(page).toHaveURL(/#\/comparar\?(pos=2&dif=1|dif=1&pos=2)$/)
  await expect(posicao).toHaveText('2 de 3')
  await expect(page.getByRole('region', { name: 'CA00002' }).getByRole('link', { name: 'Ampliar a imagem' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Mostrar só as diferenças' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => page.getByTestId('comparar-colunas').evaluate((el) => el.scrollLeft - el.clientWidth)).toBe(0)
  // recarregar também
  await page.reload()
  await expect(posicao).toHaveText('2 de 3')
  await expect.poll(async () => page.getByTestId('comparar-colunas').evaluate((el) => el.scrollLeft - el.clientWidth)).toBe(0)
})
