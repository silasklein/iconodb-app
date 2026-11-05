import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { apertarAteAparecer } from './teclas'
import { expect, test } from './fixtures'

/**
 * Tarefa 10 no navegador de verdade, nos dois tamanhos, sobre o pacote sintético (TESTE): selecionar um trecho da
 * leitura e registrar uma hipótese SKC; a marca no texto e a linha SKC em "Hipóteses por nível"; a posição sobre uma
 * hipótese do livro; desenhar uma região nova (no computador, na coluna da imagem; no celular, no visualizador) e vê-la
 * acesa com a hipótese aberta. Com SHOTS_DIR definido, guarda capturas.
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

/** Seleciona `trecho` no primeiro texto da leitura que o contém (como o arrastar do dedo ou do mouse deixaria). */
async function selecionar(page: Page, fonte: string, trecho: string) {
  await page.evaluate(
    ([f, t]) => {
      const bloco = document.querySelector(`[data-trecho-fonte="${f}"]`)!
      const caminhante = document.createTreeWalker(bloco, NodeFilter.SHOW_TEXT)
      for (let n = caminhante.nextNode() as Text | null; n; n = caminhante.nextNode() as Text | null) {
        const i = n.data.indexOf(t!)
        if (i < 0) continue
        const r = document.createRange()
        r.setStart(n, i)
        r.setEnd(n, i + t!.length)
        const sel = window.getSelection()!
        sel.removeAllRanges()
        sel.addRange(r)
        return
      }
      throw new Error('trecho não achado')
    },
    [fonte, trecho],
  )
}

/** Toca ou clica em pontos da camada do desenho (frações da caixa dela na tela). */
async function desenhar(page: Page, camada: Locator, pontos: [number, number][], toque: boolean) {
  const caixa = (await camada.boundingBox())!
  for (const [x, y] of pontos) {
    const px = caixa.x + caixa.width * x
    const py = caixa.y + caixa.height * y
    if (toque) await page.touchscreen.tap(px, py)
    else await page.mouse.click(px, py)
  }
}

async function escolherTermo(dialogo: Locator, texto: string, opcao: RegExp) {
  await dialogo.getByRole('combobox', { name: 'Termo' }).fill(texto)
  await dialogo.getByRole('listbox', { name: 'Termo' }).getByRole('option', { name: opcao }).click()
}

test('hipótese SKC de um trecho, a posição sobre a do livro e uma região nova acesa', async ({ page }, info) => {
  const celular = info.project.name.startsWith('celular')
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()

  // 1. Selecionar um trecho na tradução: aparece "Registrar hipótese" junto dele.
  await page.goto('#/item/CA00002')
  const leitura = page.locator('[data-trecho-fonte="PA-TESTE-0002-cat-1"]')
  await expect(leitura).toBeVisible()
  await leitura.scrollIntoViewIfNeeded()
  await selecionar(page, 'PA-TESTE-0002-cat-1', 'estrela de prova')
  const botao = page.locator('.botao-do-trecho')
  await expect(botao).toBeVisible()
  await expect(botao).toBeInViewport()
  await foto(page, 'hip-1-selecao')

  // 2. O formulário: o trecho, Sobre, Termo, Nível, Certeza e Justificativa.
  await botao.click()
  const form = page.getByRole('dialog', { name: 'Nova hipótese' })
  await expect(form).toBeVisible()
  await expect(form.locator('blockquote')).toHaveText('estrela de prova')
  await escolherTermo(form, 'estrela', /^estrela de prova/)
  await form.getByRole('radio', { name: 'iconológico' }).click()
  await form.getByRole('radio', { name: 'possível' }).click()
  await form.getByRole('textbox', { name: 'Justificativa' }).fill('como a de CA00004')
  await foto(page, 'hip-2-formulario')
  await form.getByRole('button', { name: 'Registrar hipótese' }).click()
  await expect(form).toHaveCount(0)

  // 3. A marca no texto (tracejada) abre o painel da hipótese SKC.
  const marca = leitura.locator('a.ancora-skc')
  await expect(marca).toHaveText(/estrela de prova/)
  await marca.click()
  const painel = page.getByRole('dialog', { name: 'Hipótese estrela de prova' })
  await expect(painel).toContainText('Iconológico · possível · SKC')
  await expect(painel).toContainText('»estrela de prova«')
  // A justificativa lida limpa: o número solto (decisão 40) vira link.
  await expect(painel.getByRole('link', { name: 'CA00004' })).toBeVisible()
  await foto(page, 'hip-2b-painel-skc')
  await painel.getByRole('button', { name: 'Fechar o painel' }).click()
  await expect(painel).toHaveCount(0)

  // 4. A posição sobre uma hipótese do livro (a âncora do livro no mesmo texto).
  await leitura.locator('a.ancora:not(.ancora-skc)').first().click()
  const doLivro = page.getByRole('dialog', { name: /^Hipótese/ })
  const posicao = doLivro.getByRole('radiogroup', { name: 'Sua posição' })
  await posicao.getByRole('radio', { name: 'discordo' }).click()
  await expect(posicao.getByRole('radio', { name: 'discordo' })).toHaveAttribute('aria-checked', 'true')
  await doLivro.getByRole('button', { name: 'Escrever a justificativa' }).click()
  await doLivro.getByRole('textbox', { name: 'Justificativa da posição' }).fill('a cauda não é de leão')
  await doLivro.getByRole('button', { name: 'Pronto' }).click()
  await expect(doLivro).toContainText('a cauda não é de leão')
  await foto(page, 'hip-5-posicao', posicao)
  await doLivro.getByRole('button', { name: 'Fechar o painel' }).click()
  // Com o diálogo modal ainda no DOM (celular) o registro de atalhos descarta o Shift+H: espera ele sumir antes da tecla.
  await expect(doLivro).toHaveCount(0)

  // 5. Uma hipótese sobre uma região nova: desenhada na coluna da imagem (computador) ou no visualizador (celular).
  const form2 = page.getByRole('dialog', { name: 'Nova hipótese' })
  await apertarAteAparecer(page, 'Shift+H', form2)
  await escolherTermo(form2, 'leão', /^leão-de-teste/)
  await form2.getByRole('button', { name: 'Marcar uma região nova na imagem' }).click()
  if (!celular) {
    const camada = page.getByTestId('desenho-camada')
    await expect(camada).toBeVisible()
    await desenhar(page, camada, [[0.2, 0.2], [0.6, 0.2], [0.6, 0.6], [0.2, 0.6]], false)
    await foto(page, 'hip-3-desenho')
    await page.getByRole('toolbar', { name: 'Marcar região' }).getByRole('button', { name: 'Concluir a região' }).click()
  } else {
    await expect(page).toHaveURL(/#\/imagem\/IMG-TESTE-0002-1$/)
    const camada = page.getByTestId('desenho-camada')
    await expect(camada).toBeVisible()
    await desenhar(page, camada, [[0.2, 0.2], [0.6, 0.2], [0.6, 0.6], [0.2, 0.6]], true)
    await foto(page, 'hip-3-desenho')
    await page.getByRole('button', { name: 'Concluir e voltar à hipótese' }).click()
    await expect(page).toHaveURL(/#\/item\/CA00002$/)
  }
  const form3 = page.getByRole('dialog', { name: 'Nova hipótese' })
  await expect(form3.getByRole('button', { name: /Região nova, 4 pontos/ })).toHaveAttribute('aria-pressed', 'true')
  await form3.getByRole('textbox', { name: 'Nome do elemento novo' }).fill('cauda')
  await form3.getByRole('button', { name: 'Registrar hipótese' }).click()
  await expect(form3).toHaveCount(0)

  // 6. "Hipóteses por nível": as SKC com o rótulo; abrir a da região acende a região na imagem.
  await page.getByRole('button', { name: /Hipóteses por nível/ }).click()
  const secao = page.getByRole('region', { name: 'Hipóteses por nível' })
  const linhasSkc = secao.locator('[data-hipotese-linha^="HY-"]').filter({ hasText: 'SKC' })
  await expect(linhasSkc).toHaveCount(2)
  await foto(page, 'hip-6-niveis', secao)
  await linhasSkc.filter({ hasText: 'cauda' }).click()
  const painel2 = page.getByRole('dialog', { name: 'Hipótese leão-de-teste' })
  await expect(painel2).toContainText('acesa na imagem')
  await expect(page.locator('.imagem-item-regioes polygon.regiao-traco')).toHaveCount(1)
  if (celular) await page.locator('.item-imagem').evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await foto(page, 'hip-4-regiao-acesa')
  await semRolagemHorizontal(page, 'o item com a hipótese aberta')

  // 7. O visualizador de uma imagem com regiões: a barra cabe na tela, também marcando.
  await page.goto('#/imagem/IMG-TESTE-0003-1')
  const barra = page.getByRole('toolbar', { name: 'Ferramentas da imagem' })
  await expect(barra.getByRole('button', { name: 'Mostrar as regiões' })).toBeVisible()
  const cabe = () => barra.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= window.innerWidth)
  expect(await cabe()).toBe(true)
  await barra.getByRole('button', { name: 'Marcar região' }).click()
  await expect(barra.getByRole('button', { name: 'Concluir a região' })).toBeVisible()
  expect(await cabe()).toBe(true)
  await foto(page, 'hip-7-visualizador-marcando')
  await semRolagemHorizontal(page, 'o visualizador marcando')
})

/** Uma "foto" clara (tons de cinza claros, sem traço), em JPEG, gravada no disco para o seletor de arquivos. */
async function fotoClara(page: Page, info: TestInfo): Promise<string> {
  const base64 = await page.evaluate(async () => {
    const c = new OffscreenCanvas(1200, 900)
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 1200, 900)
    g.addColorStop(0, '#f4f2ee')
    g.addColorStop(1, '#cfcac2')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 1200, 900)
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(150, 140, 130, ${0.15 + i * 0.05})`
      ctx.beginPath()
      ctx.ellipse(250 + i * 140, 450 + (i % 2) * 80, 120, 200, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let t = ''
    for (let i = 0; i < bytes.length; i += 0x8000) t += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(t)
  })
  const pasta = join(info.project.outputDir, 'arquivos-sinteticos', info.testId)
  mkdirSync(pasta, { recursive: true })
  const caminho = join(pasta, 'foto-clara.jpg')
  writeFileSync(caminho, Buffer.from(base64, 'base64'))
  return caminho
}

test('região acesa numa foto clara do usuário: o contorno escuro por baixo do traço claro a destaca', async ({ page }, info) => {
  const celular = info.project.name.startsWith('celular')
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
  await page.goto('#/item/CA00004')
  const painelDaImagem = page.getByRole('region', { name: 'Imagem' }).first()
  await painelDaImagem.getByRole('button', { name: 'Adicionar imagem' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Adicionar imagem a CA00004' })
  await page.locator(`input[type="file"][data-origem="${celular ? 'galeria' : 'arquivos'}"]`).setInputFiles(await fotoClara(page, info))
  await expect(dialogo.getByRole('radio', { name: /^Foto/ })).toBeChecked({ timeout: 20_000 })
  await dialogo.getByRole('textbox', { name: 'Crédito / fonte' }).fill('foto própria')
  await dialogo.getByRole('button', { name: 'Adicionar', exact: true }).click()
  await expect(dialogo).toHaveCount(0)
  await expect(painelDaImagem.getByText('foto própria')).toBeVisible()

  const form = page.getByRole('dialog', { name: 'Nova hipótese' })
  await apertarAteAparecer(page, 'Shift+H', form)
  await escolherTermo(form, 'selo', /^selo de teste/)
  await form.getByRole('button', { name: 'Marcar uma região nova na imagem' }).click()
  const camada = page.getByTestId('desenho-camada')
  await expect(camada).toBeVisible()
  await desenhar(page, camada, [[0.15, 0.3], [0.45, 0.3], [0.45, 0.75], [0.15, 0.75]], celular)
  if (celular) {
    await page.getByRole('button', { name: 'Concluir e voltar à hipótese' }).click()
    await expect(page).toHaveURL(/#\/item\/CA00004$/)
  } else {
    await page.getByRole('toolbar', { name: 'Marcar região' }).getByRole('button', { name: 'Concluir a região' }).click()
  }
  await form.getByRole('textbox', { name: 'Nome do elemento novo' }).fill('mancha')
  await form.getByRole('button', { name: 'Registrar hipótese' }).click()
  await expect(form).toHaveCount(0)
  await page.getByRole('button', { name: /Hipóteses por nível/ }).click()
  await page.getByRole('region', { name: 'Hipóteses por nível' }).locator('[data-hipotese-linha^="HY-"]').filter({ hasText: 'mancha' }).click()
  await expect(page.getByRole('dialog', { name: 'Hipótese selo de teste' })).toContainText('acesa na imagem')
  await expect(page.locator('.imagem-item-regioes polygon.regiao-halo')).toHaveCount(1)
  if (celular) await page.locator('.item-imagem').evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await foto(page, 'hip-8-regiao-foto-clara')
})

test('decisão 41: criar o termo "termo-novo-de-teste" numa hipótese, abrir o verbete dele e achá-lo na busca', async ({ page }) => {
  const celular = (page.viewportSize()?.width ?? 0) < 768
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()

  // 1. O campo Termo oferece "Criar termo «…»" (pelo teclado: ↓ e Enter).
  await page.goto('#/item/CA00003')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const form = page.getByRole('dialog', { name: 'Nova hipótese' })
  await apertarAteAparecer(page, 'Shift+H', form)
  const termo = form.getByRole('combobox', { name: 'Termo' })
  await termo.fill('termo-novo-de-teste')
  const criar = form.getByRole('listbox', { name: 'Termo' }).getByRole('option', { name: /^Criar termo «termo-novo-de-teste»/ })
  await expect(criar).toBeVisible()
  expect((await criar.boundingBox())!.height).toBeGreaterThanOrEqual(44 - 0.5)
  await termo.press('ArrowDown')
  await expect(criar).toHaveAttribute('aria-selected', 'true')
  await foto(page, 'hip-9-criar-termo', criar)
  await termo.press('Enter')
  await expect(form.getByRole('button', { name: 'Tirar o termo termo-novo-de-teste' })).toBeVisible()
  await expect(form.getByRole('list', { name: 'Termos escolhidos' })).toContainText('novo')
  await semRolagemHorizontal(page, 'o formulário com o termo novo')
  await form.getByRole('button', { name: 'Registrar hipótese' }).click()
  await expect(form).toHaveCount(0)

  // 2. "Hipóteses por nível" → o painel → "Abrir verbete": a página do verbete do usuário.
  await page.getByRole('button', { name: /Hipóteses por nível/ }).click()
  const secao = page.getByRole('region', { name: 'Hipóteses por nível' })
  await secao.locator('[data-hipotese-linha]').filter({ hasText: 'termo-novo-de-teste' }).click()
  const painel = page.getByRole('dialog', { name: 'Hipótese termo-novo-de-teste' })
  await painel.getByRole('link', { name: 'Abrir verbete' }).click()
  await expect(page).toHaveURL(/#\/verbete\/GL-[a-z0-9]{8}-[1-9][0-9]*$/)
  const id = decodeURIComponent(page.url().split('/verbete/')[1]!)
  const titulo = page.getByRole('heading', { level: celular ? 1 : 2, name: 'termo-novo-de-teste' })
  await expect(titulo).toBeVisible()
  await expect(page.getByText('Verbete do SKC · a revisar')).toBeVisible()
  const hipoteses = page.getByRole('region', { name: 'Hipóteses com este termo' })
  await expect(hipoteses.getByRole('link', { name: /CA00003/ })).toBeVisible()
  await expect(page.getByText('Iconclass')).toHaveCount(0)
  await semRolagemHorizontal(page, 'o verbete do usuário')
  await foto(page, 'hip-9-verbete')

  // 3. O Glossário (no computador, a lista ao lado do verbete; no celular, a lista "a revisar").
  if (celular) await page.goto('#/glossario?revisar=1')
  const linhaNaLista = page.locator(`a.lista-linha[href^="#/verbete/${id}"]`)
  await expect(linhaNaLista).toBeVisible()
  await expect(linhaNaLista).toContainText('SKC')
  await expect(linhaNaLista).toContainText('a revisar')
  await semRolagemHorizontal(page, 'o glossário')
  await foto(page, 'hip-9-glossario', linhaNaLista)

  // 4. A busca: a sugestão (entre os verbetes, com a marca SKC) e o resultado, que levam à página dele.
  await page.goto('#/')
  const buscar = page.getByRole('combobox', { name: 'Buscar' })
  await buscar.fill('termo novo de')
  const sugestao = page.getByRole('listbox').getByRole('group', { name: 'Verbetes' }).getByRole('option', { name: /termo-novo-de-teste/ })
  await expect(sugestao).toContainText('SKC')
  await page.goto('#/busca?q=termo-novo-de-teste')
  const camada = page.getByRole('region', { name: 'Na sua camada (SKC)' })
  const acerto = camada.getByRole('link', { name: /termo-novo-de-teste/ })
  await expect(acerto).toHaveAttribute('href', `#/verbete/${id}`)
  await acerto.click()
  await expect(page.getByRole('heading', { name: 'termo-novo-de-teste' }).first()).toBeVisible()
})

test('revisão 3, M14: na leitura SKC, um duplo clique de verdade seleciona a palavra (não abre o editor) e ancora a hipótese nela', async ({ page }, info) => {
  // O duplo clique é do mouse; no celular a palavra se seleciona com o toque longo (a conferir no aparelho, Tarefa 17).
  test.skip(info.project.name.startsWith('celular'), 'duplo clique: só com mouse')
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()

  // Um objeto SKC com uma leitura.
  await page.goto('#/objeto/novo')
  await page.getByLabel('Tipo e descrição curta').fill('Selo sintético para seleção. Pedra.')
  await page.getByRole('radiogroup', { name: 'Período' }).getByRole('radio', { name: /Calcolítico/ }).click()
  await page.getByRole('radio', { name: /Achado recente/ }).check()
  await page.getByLabel(/Nota do achado/).fill('visto numa vitrine, 2026')
  await page.getByRole('textbox', { name: /^Leitura/ }).fill('Dois quadrúpedes afrontados junto de um cervo.')
  await page.getByRole('button', { name: /Salvar objeto/ }).first().click()
  await expect(page).toHaveURL(/#\/item\/OB-[a-z0-9]{8}-\d+/)
  const ob = decodeURIComponent(page.url().split('/item/')[1]!.split('?')[0]!)
  const bloco = page.locator(`[data-trecho-fonte="${ob}"][data-trecho-lingua="skc"]`)
  await expect(bloco).toContainText('quadrúpedes')

  // O duplo clique do mouse no meio de "quadrúpedes": o navegador seleciona a palavra.
  const meio = await bloco.evaluate((el) => {
    const caminhante = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = caminhante.nextNode() as Text | null; n; n = caminhante.nextNode() as Text | null) {
      const i = n.data.indexOf('quadrúpedes')
      if (i < 0) continue
      const r = document.createRange()
      r.setStart(n, i + 3)
      r.setEnd(n, i + 4)
      const c = r.getBoundingClientRect()
      return { x: c.left + c.width / 2, y: c.top + c.height / 2 }
    }
    throw new Error('palavra não achada')
  })
  await page.mouse.dblclick(meio.x, meio.y)
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().trim())).toBe('quadrúpedes')
  // Passado o tempo de espera do clique, a leitura continua lida (sem o campo de edição).
  await page.waitForTimeout(600)
  await expect(page.getByRole('textbox', { name: 'Leitura SKC' })).toHaveCount(0)
  const botao = page.locator('.botao-do-trecho')
  await expect(botao).toBeVisible()
  await botao.click()
  const form = page.getByRole('dialog', { name: 'Nova hipótese' })
  await expect(form.locator('blockquote')).toHaveText('quadrúpedes')
  await expect(form).toContainText('SKC, selecionado no texto')
  await escolherTermo(form, 'leão', /^leão-de-teste/)
  await form.getByRole('button', { name: 'Registrar hipótese' }).click()
  await expect(form).toHaveCount(0)
  // A marca na leitura SKC, sobre a palavra.
  // (com o texto só para leitor de tela da marca depois da palavra)
  await expect(bloco.locator('[data-hipotese^="HY-"]')).toHaveText(/^quadrúpedes, hipótese SKC/)
})
