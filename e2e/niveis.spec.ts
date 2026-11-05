import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Tarefa 18, decisão 35, no navegador de verdade, nos dois tamanhos e sobre o pacote sintético (TESTE): os níveis das
 * hipóteses em destaque no Item (com uma hipótese SKC), o painel/folha, a prévia do mouse e as medidas da interface.
 * Com SHOTS_DIR definido, guarda capturas.
 */
async function foto(page: Page, nome: string, ver?: Locator) {
  const pasta = process.env.SHOTS_DIR
  if (!pasta) return
  mkdirSync(pasta, { recursive: true })
  await ver?.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: join(pasta, `${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}

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

test('os três níveis em destaque, a hipótese SKC, o painel e as medidas', async ({ page }, info) => {
  const celular = info.project.name.startsWith('celular')
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()

  // Uma hipótese SKC pré-iconográfica sobre um trecho, para o objeto ter os três níveis (o livro dá o iconográfico e o iconológico).
  await page.goto('#/item/CA00002')
  const leitura = page.locator('[data-trecho-fonte="PA-TESTE-0002-cat-1"]')
  await expect(leitura).toBeVisible()
  await selecionar(page, 'PA-TESTE-0002-cat-1', 'talvez')
  await page.locator('.botao-do-trecho').click()
  const form = page.getByRole('dialog', { name: 'Nova hipótese' })
  await form.getByRole('radio', { name: 'pré-iconográfico' }).click()
  await form.getByRole('combobox', { name: 'Termo' }).fill('leão')
  await form.getByRole('listbox', { name: 'Termo' }).getByRole('option', { name: /^leão-de-teste/ }).click()
  await form.getByRole('button', { name: 'Registrar hipótese' }).click()
  await expect(form).toHaveCount(0)

  // A seção, com os três blocos.
  const botao = page.getByRole('button', { name: /Hipóteses por nível/ })
  if ((await botao.getAttribute('aria-expanded')) !== 'true') await botao.click()
  const secao = page.getByRole('region', { name: 'Hipóteses por nível' })
  const nomes = ['Pré-iconográfico', 'Iconográfico', 'Iconológico']
  const linhas = ['O que se vê', 'O que significa', 'O que revela da cultura']
  for (const [i, nome] of nomes.entries()) {
    const bloco = secao.getByRole('region', { name: nome, exact: true })
    await expect(bloco.getByRole('heading', { level: 3, name: nome, exact: true })).toBeVisible()
    await expect(bloco.getByText(linhas[i]!, { exact: true })).toBeVisible()
    await expect(bloco.locator('.nivel-cabeca .marcador-nivel rect[data-cheio="true"]')).toHaveCount(i + 1)
  }
  await expect(secao.getByRole('region', { name: 'Pré-iconográfico', exact: true }).getByText('1 hipótese', { exact: true })).toHaveCount(1)
  await expect(secao.getByRole('group', { name: 'Legenda dos níveis' })).toHaveCount(1)
  const skc = secao.locator('[data-hipotese-linha^="HY-"]').filter({ hasText: 'SKC' })
  await expect(skc).toHaveCount(1)
  await expect(skc.locator('rect[data-cheio="true"]')).toHaveCount(1)
  // Leitor de tela (I3): a árvore de cada bloco de nível diz o nível uma vez só (o título), e a contagem tem texto de verdade.
  for (const nome of nomes) {
    const arvore = await secao.getByRole('region', { name: nome, exact: true }).ariaSnapshot()
    expect(arvore, `árvore de ${nome}`).not.toMatch(/nível/i)
    expect(arvore, `árvore de ${nome}`).toMatch(/text: \d+ hipóteses?/)
    expect(arvore, `árvore de ${nome}`).toContain(`heading "${nome}" [level=3]`)
  }
  // O aviso «Hipótese registrada» fica no pé da tela: cada bloco é capturado no meio dela.
  await foto(page, 'r1-niveis-1a-pre-e-iconografico', secao.getByRole('region', { name: 'Iconográfico', exact: true }))
  await foto(page, 'r1-niveis-1b-iconologico', secao.getByRole('region', { name: 'Iconológico', exact: true }))

  // Medidas: sem rolagem horizontal; alvos de 44 (celular) ou 36 (computador); texto de 12 px ou mais; foco visível.
  const { rolagem, janela } = await page.evaluate(() => ({ rolagem: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(rolagem).toBeLessThanOrEqual(janela)
  const alvoMinimo = celular ? 44 : 36
  for (const caixa of await secao.locator('a[data-hipotese-linha]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
    expect(caixa).toBeGreaterThanOrEqual(alvoMinimo)
  }
  const pequenos = await secao.evaluate((raiz) => {
    const ruins: string[] = []
    for (const el of raiz.querySelectorAll<HTMLElement>('*')) {
      const r = el.getBoundingClientRect()
      if (r.width < 3 || r.height < 3) continue // o texto só para leitor de tela
      const tem = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '')
      if (tem && parseFloat(getComputedStyle(el).fontSize) < 12) ruins.push(`${el.className}: ${getComputedStyle(el).fontSize}`)
    }
    return ruins
  })
  expect(pequenos, 'texto menor que 12 px').toEqual([])
  // Celular: o alvo e «sem trecho» numa segunda linha; computador: «nome · alvo · sem trecho no texto PT» numa linha só (PC-ItemNiveis).
  const semTrecho = secao.locator('a[data-hipotese-linha="HY-900004"]')
  const nome = await semTrecho.locator('.item-hipotese-linha-nome').boundingBox()
  const sobre = await semTrecho.locator('.item-hipotese-linha-sobre').boundingBox()
  const mesmaLinha = sobre!.y < nome!.y + nome!.height - 1 && nome!.y < sobre!.y + sobre!.height - 1
  const separador = await semTrecho.locator('.item-hipotese-linha-sep').evaluate((el) => getComputedStyle(el).display)
  const alturaDaLinha = (await semTrecho.boundingBox())!.height
  if (celular) {
    expect(mesmaLinha, 'celular: alvo na segunda linha').toBe(false)
    expect(sobre!.y).toBeGreaterThanOrEqual(nome!.y + nome!.height - 1)
    expect(separador).toBe('none')
    // C-23: no celular o texto corre (como no desenho): o aviso começa na mesma linha do alvo, e o «·» fica colado à
    // primeira palavra do aviso (nem sozinho no fim da linha, nem abrindo a linha de baixo).
    const inicio = await semTrecho.evaluate((el) => {
      const topo = (s: string) => el.querySelector(s)!.getClientRects()[0]!.top
      return { sobre: topo('.item-hipotese-linha-sobre'), aviso: topo('.item-hipotese-linha-aviso') }
    })
    expect(Math.abs(inicio.aviso - inicio.sobre), 'celular: o aviso começa na linha do alvo (a linha tem 20 px)').toBeLessThan(10)
  } else {
    expect(mesmaLinha, 'computador: nome e alvo na mesma linha').toBe(true)
    expect(separador).toBe('inline')
    // Uma linha de texto (23 px) com o respiro de 10 + 10; a segunda linha de antes dava 64.
    expect(alturaDaLinha).toBeLessThanOrEqual(48)
    await expect(semTrecho.locator('.item-hipotese-linha-texto')).toHaveText(/ · objeto inteiro ·\s+sem trecho no texto PT$/)
  }
  // O aviso anda inteiro, com o «·» (que o leitor de tela não lê), e cabe na linha.
  await expect(semTrecho.locator('.item-hipotese-linha-sobre')).toContainText('sem trecho no texto PT')
  const aviso = await semTrecho.locator('.item-hipotese-linha-aviso').boundingBox()
  const linhaBox = await semTrecho.boundingBox()
  expect(aviso!.x + aviso!.width).toBeLessThanOrEqual(linhaBox!.x + linhaBox!.width + 0.5)
  await expect(semTrecho).toHaveAccessibleName(/objeto inteiro.*sem trecho no texto PT/)
  expect(await semTrecho.evaluate((el) => el.getAttribute('aria-label'))).toBeNull()
  // Decisão 52: a legenda vem depois de «Registrar hipótese»; no celular é de uma linha só; os quadrados têm 30×8 na cor do texto.
  const registrar = secao.getByRole('button', { name: 'Registrar hipótese' })
  const legenda = secao.getByRole('group', { name: 'Legenda dos níveis' })
  expect((await registrar.boundingBox())!.y).toBeLessThan((await legenda.boundingBox())!.y)
  const ultimaLinha = await secao.locator('a[data-hipotese-linha]').last().boundingBox()
  expect((await registrar.boundingBox())!.y).toBeGreaterThan(ultimaLinha!.y)
  const marcaDaLegenda = await legenda.locator('svg').first().evaluate((svg) => ({ w: svg.getBoundingClientRect().width, h: svg.getBoundingClientRect().height, cheio: getComputedStyle(svg.querySelector('rect[data-cheio="true"]')!).fill, texto: getComputedStyle(svg).color }))
  expect([marcaDaLegenda.w, marcaDaLegenda.h]).toEqual([30, 8])
  expect(marcaDaLegenda.cheio).toBe('rgb(237, 237, 237)')
  if (celular) {
    const itens = await legenda.locator('.nivel-legenda-item').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top))
    expect(itens).toHaveLength(3)
    expect(Math.max(...itens) - Math.min(...itens), 'legenda do celular numa linha só').toBeLessThanOrEqual(2)
    expect((await legenda.boundingBox())!.height).toBeLessThanOrEqual(40)
    await expect(legenda).not.toContainText('Quadrados cheios')
  } else {
    await expect(legenda).toContainText('Quadrados cheios = profundidade da interpretação')
  }
  await foto(page, 'r1-legenda-depois-do-botao', legenda)
  // Foco do teclado: uma linha focada mostra o contorno.
  await semTrecho.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(semTrecho).toBeFocused()
  expect(await semTrecho.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none')

  // O painel (computador) ou a folha (celular) leva o mesmo marcador no cabeçalho.
  await semTrecho.click()
  const painel = page.getByRole('dialog', { name: /^Hipótese/ })
  await expect(painel.locator('.painel-hipotese-etiqueta .marcador-nivel rect[data-cheio="true"]')).toHaveCount(3)
  await expect(painel.locator('.painel-hipotese-etiqueta')).toContainText('Iconológico')
  await foto(page, 'r1-niveis-2-painel')
  await page.keyboard.press('Escape')
  await expect(painel).toHaveCount(0)

  // A hipótese SKC: o painel mostra «Pré-iconográfico · … · SKC» com ■□□.
  await skc.click()
  const painelSkc = page.getByRole('dialog', { name: /^Hipótese/ })
  await expect(painelSkc.locator('.painel-hipotese-etiqueta .marcador-nivel rect[data-cheio="true"]')).toHaveCount(1)
  await expect(painelSkc.locator('.painel-hipotese-etiqueta')).toContainText('SKC')
  await foto(page, 'r1-niveis-3-painel-skc')
  await page.keyboard.press('Escape')
  await expect(painelSkc).toHaveCount(0)

  // A prévia ao passar o mouse no trecho (só onde há mouse).
  if (!celular) {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    const ancora = leitura.locator('a.ancora:not(.ancora-skc)').first()
    const previa = ancora.locator('.ancora-previa')
    await expect(previa).toHaveCount(0)
    await ancora.hover()
    await expect(previa).toBeVisible()
    await expect(previa.locator('rect[data-cheio="true"]')).toHaveCount(2)
    await expect(previa).toContainText('Termo: leão-de-teste · sobre o objeto inteiro')
    await expect(previa).toContainText('Clique no trecho para fixar o painel')
    await foto(page, 'r1-niveis-4-previa')
    await page.mouse.move(0, 0)
    await expect(previa).toHaveCount(0)
  } else {
    // Toque: a prévia nunca existe, nem antes nem depois de tocar no trecho (que abre a folha); nada fica grudado.
    const ancora = leitura.locator('a.ancora:not(.ancora-skc)').first()
    await expect(ancora).toBeVisible()
    await expect(leitura.locator('.ancora-previa')).toHaveCount(0)
    await ancora.tap()
    await expect(page.getByRole('dialog', { name: /^Hipótese/ })).toBeVisible()
    await expect(page.locator('.ancora-previa')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: /^Hipótese/ })).toHaveCount(0)
    await expect(page.locator('.ancora-previa')).toHaveCount(0)
  }
})

/**
 * Revisão 1 (I1): a prévia do mouse junto da linha do trecho num parágrafo longo, com a dica do termo dentro dela (uma caixa
 * só), e WCAG 1.4.13 (dispensável com Esc, pairável, persistente).
 */
test('prévia do mouse num parágrafo longo: junto da linha do trecho, na tela, com a dica do termo dentro; Esc fecha; o mouse pode ir até ela', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('celular'), 'a prévia é só para quem tem mouse')
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
  // O termo com a forma em uso (Tarefa 11) ganha dica; ela tem que ficar DENTRO da prévia.
  await page.goto('#/verbete/GL-900003')
  const forma = page.getByRole('textbox', { name: 'Forma em português' })
  await forma.fill('olhos (forma de gota)')
  await forma.press('Tab')
  await expect(page.getByRole('button', { name: 'Voltar à proposta original' })).toBeVisible()

  await page.goto('#/item/CA00003')
  const texto = page.locator('.leitura-texto[lang="pt-BR"]').first()
  const ancora = texto.getByRole('link', { name: /^olho em forma de botão ?, forma em uso/ })
  await expect(ancora).toBeVisible()
  // O parágrafo do livro real tem dezenas de linhas: enche antes e depois do trecho (só visual, para a medida).
  await texto.evaluate((p) => {
    const enchimento = () => {
      const span = document.createElement('span')
      span.textContent = 'Texto de enchimento TESTE para alongar o parágrafo e provar que a prévia fica junto do trecho. '.repeat(45)
      return span
    }
    p.prepend(enchimento())
    p.append(enchimento())
  })
  expect((await texto.boundingBox())!.height).toBeGreaterThan(1500)
  await ancora.scrollIntoViewIfNeeded()
  await ancora.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await ancora.hover()
  const previa = ancora.locator('.ancora-previa')
  await expect(previa).toBeVisible()
  const linha = await ancora.evaluate((el) => {
    const r = el.getClientRects()[0]!
    return { top: r.top, bottom: r.bottom }
  })
  const caixa = (await previa.boundingBox())!
  const janela = page.viewportSize()!
  // Junto da linha do trecho (o vão é só o respiro de 4 px) e inteira na tela.
  expect(caixa.y).toBeGreaterThanOrEqual(linha.bottom - 1)
  expect(caixa.y - linha.bottom).toBeLessThanOrEqual(40)
  expect(caixa.y + caixa.height).toBeLessThanOrEqual(janela.height)
  expect(caixa.x).toBeGreaterThanOrEqual(0)
  expect(caixa.x + caixa.width).toBeLessThanOrEqual(janela.width)
  const textoBox = (await texto.boundingBox())!
  expect(caixa.x).toBeGreaterThanOrEqual(textoBox.x - 1)
  expect(caixa.x + caixa.width).toBeLessThanOrEqual(textoBox.x + textoBox.width + 1)
  // Uma caixa só: a dica do termo está dentro dela, e a do próprio termo (::after) não aparece por cima.
  await expect(previa).toContainText('Forma em uso: olhos (forma de gota)')
  await expect(previa).toContainText('Termo: ')
  await expect(previa).toContainText('Iconográfico')
  const duplicada = await ancora.locator('.termo-marcado[data-tip]').first().evaluate((el) => getComputedStyle(el, '::after').display)
  expect(duplicada).toBe('none')
  await foto(page, 'r1-previa-paragrafo-longo')

  // Pairável: o mouse vai até a caixa e ela fica.
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2, { steps: 6 })
  await expect(previa).toBeVisible()
  // Dispensável: Esc fecha a prévia (e só ela: não há painel aberto para fechar).
  await page.keyboard.press('Escape')
  await expect(previa).toHaveCount(0)
  await expect(page).not.toHaveURL(/hipotese=/)
  // Sai e volta: reabre.
  await page.mouse.move(0, 0)
  await ancora.hover()
  await expect(ancora.locator('.ancora-previa')).toBeVisible()
  // Pelo teclado: o foco abre a mesma caixa, e sair do trecho a fecha.
  await page.mouse.move(0, 0)
  await expect(ancora.locator('.ancora-previa')).toHaveCount(0)
  await ancora.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(ancora).toBeFocused()
  await expect(ancora.locator('.ancora-previa')).toContainText('Forma em uso: olhos (forma de gota)')
})
