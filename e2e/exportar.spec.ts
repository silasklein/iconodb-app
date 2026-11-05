import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Download, Locator, Page, TestInfo } from '@playwright/test'
import { expect, test } from './fixtures'
import { escreverNota } from './notasNaTela'

/**
 * Exportar (Tarefa 15) no navegador de verdade, nos dois tamanhos: o Menu e a Sincronização levam à tela; com a camada
 * vazia e sem internet os três botões baixam arquivos válidos e vazios; com dados (uma nota por enviar neste aparelho e,
 * de outro aparelho, uma região, um termo novo e uma hipótese SKC; e uma imagem que ainda não subiu), cada arquivo é
 * baixado (evento `download`) e lido. O app instalado (revisão 1): no Mac (sem toque) baixa pelo link; num aparelho de
 * toque, a folha de compartilhar, e, recusada por falta de um toque recente, «Salvar o arquivo» entrega o mesmo arquivo.
 * Com SHOTS_DIR definido, guarda capturas (claro e escuro).
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
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
  await page.screenshot({ path: join(pasta, `${process.env.SHOTS_PREFIX ?? ''}${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}
/** A mesma captura com o sistema em modo escuro (o app segue com as cores dele; nada pode sumir). */
async function fotoEscura(page: Page, nome: string, ver?: Locator) {
  if (!process.env.SHOTS_DIR) return
  await page.emulateMedia({ colorScheme: 'dark' })
  await foto(page, nome, ver)
  await page.emulateMedia({ colorScheme: 'light' })
}
async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}
async function abrirMenu(page: Page) {
  if (celular(page)) {
    await page.goto('#/')
    await page.getByRole('button', { name: 'Abrir o menu' }).click()
  } else {
    await page.getByRole('button', { name: 'Menu' }).click()
  }
  return page.getByRole('dialog', { name: 'Menu' })
}

/** Um JPEG sintético (linhas pretas em fundo branco), feito no navegador e gravado no disco do teste. */
async function jpegNoDisco(page: Page, info: TestInfo): Promise<string> {
  const base64 = await page.evaluate(async () => {
    const c = new OffscreenCanvas(600, 450)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 600, 450)
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 3
    for (let x = 25; x < 600; x += 50) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x + 150, 450)
      ctx.stroke()
    }
    const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 })).arrayBuffer())
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(s)
  })
  // Uma pasta de nome só ASCII: o Chromium não acha o arquivo quando o caminho tem acento (o nome do teste tem "números").
  const pasta = join(info.project.outputDir, 'arquivos-sinteticos', info.testId)
  mkdirSync(pasta, { recursive: true })
  const caminho = join(pasta, 'desenho-exportar.jpg')
  writeFileSync(caminho, Buffer.from(base64, 'base64'))
  return caminho
}

/** Adiciona uma imagem sintética ao CA00001 (o mesmo caminho de e2e/imagens.spec.ts). */
async function adicionarImagem(page: Page, info: TestInfo) {
  const arquivo = await jpegNoDisco(page, info)
  await page.goto('#/item/CA00001')
  const painel = page.getByRole('region', { name: 'Imagem' }).first()
  await painel.getByRole('button', { name: 'Adicionar imagem' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Adicionar imagem a CA00001' })
  await expect(dialogo).toBeVisible()
  await page.locator(`input[type="file"][data-origem="${celular(page) ? 'galeria' : 'arquivos'}"]`).setInputFiles(arquivo)
  await expect(dialogo.getByRole('radio', { name: /^Desenho de traço/ })).toBeChecked({ timeout: 20_000 })
  await dialogo.getByRole('textbox', { name: 'Crédito / fonte' }).fill('foto própria')
  await dialogo.getByRole('button', { name: 'Adicionar', exact: true }).click()
  await expect(dialogo).toHaveCount(0)
  await expect(painel.getByRole('img', { name: 'Imagem 3 de CA00001, invertida' })).toBeVisible()
}

/**
 * O app como se tivesse sido aberto pelo ícone (display-mode standalone), com ou sem toque, e uma folha de compartilhar
 * falsa: `window.__folha.recusar` faz a próxima chamada falhar com NotAllowedError (o toque já não é recente),
 * `window.__folha.falhar` faz a próxima falhar com um erro qualquer (TypeError), `window.__folha.segurar` a deixa aberta até `window.__folha.soltar()`, e cada arquivo recebido fica em
 * `window.__folha.recebidos` (nome, tipo e texto).
 */
async function appInstalado(page: Page, toque: boolean) {
  await page.addInitScript((comToque: boolean) => {
    const original = window.matchMedia.bind(window)
    window.matchMedia = (q: string) =>
      q.includes('display-mode: standalone') ? ({ matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as MediaQueryList) : original(q)
    Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => (comToque ? 5 : 0), configurable: true })
    const folha = {
      chamadas: 0,
      recusar: false,
      falhar: false,
      segurar: false,
      soltar: () => undefined as void,
      recebidos: [] as { nome: string; tipo: string; texto: string }[],
    }
    ;(window as unknown as { __folha: typeof folha }).__folha = folha
    Object.defineProperty(Navigator.prototype, 'canShare', { value: (d?: ShareData) => !!d?.files?.length, configurable: true })
    Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      value: async (d?: ShareData) => {
        folha.chamadas++
        if (folha.recusar) {
          folha.recusar = false
          throw new DOMException('Must be handling a user gesture to perform a share request.', 'NotAllowedError')
        }
        if (folha.falhar) {
          folha.falhar = false
          throw new TypeError('Falha qualquer da folha de compartilhar (sintética).')
        }
        if (folha.segurar) await new Promise<void>((ok) => (folha.soltar = ok))
        for (const f of d?.files ?? []) folha.recebidos.push({ nome: f.name, tipo: f.type, texto: await f.text() })
      },
    })
  }, toque)
}
type Folha = { chamadas: number; recusar: boolean; falhar: boolean; segurar: boolean; soltar: () => void; recebidos: { nome: string; tipo: string; texto: string }[] }
const folha = (page: Page) => page.evaluate(() => {
  const f = (window as unknown as { __folha: Folha }).__folha
  return { chamadas: f.chamadas, recebidos: f.recebidos }
})

const secao = (page: Page, nome: string) => page.getByRole('region', { name: nome })
const numeros = (page: Page, nome: string) => secao(page, nome).locator('.exp-numeros')
const mensagem = (page: Page) => page.getByRole('status', { name: 'Mensagem da exportação' })

/** Toca o botão, espera o download e devolve o nome sugerido e o conteúdo já lido como JSON. */
async function baixar(page: Page, botao: string): Promise<{ nome: string; json: Record<string, unknown>; download: Download }> {
  const alvo = page.getByRole('button', { name: botao })
  const [download] = await Promise.all([page.waitForEvent('download'), alvo.click()])
  const caminho = await download.path()
  return { nome: download.suggestedFilename(), json: JSON.parse(readFileSync(caminho, 'utf8')) as Record<string, unknown>, download }
}

test('a tela pelo Menu e pela Sincronização; camada vazia e sem internet: os três arquivos válidos e vazios', async ({ page, context }) => {
  await entrar(page)

  // O Menu tem «Exportar» antes de «Atalhos e convenções».
  const menu = await abrirMenu(page)
  const links = menu.getByRole('navigation', { name: 'Menu' }).getByRole('link')
  const nomes = await links.allTextContents()
  const i = nomes.findIndex((t) => t.startsWith('Exportar'))
  expect(i).toBeGreaterThan(-1)
  expect(nomes[i + 1]).toMatch(/^Atalhos e convenções/)
  await foto(page, 'exportar-0-menu', links.nth(i))
  await links.nth(i).click()
  await expect(page).toHaveURL(/#\/exportar$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Exportar' })).toBeVisible()

  // A Sincronização também leva a ela (o link abre a tela; o nome diz isso).
  await page.goto('#/sincronizacao')
  const paraCopia = page.getByRole('link', { name: 'Cópia de segurança e exportações' })
  await foto(page, 'exportar-7-link-na-sincronizacao', paraCopia)
  await paraCopia.click()
  await expect(page).toHaveURL(/#\/exportar$/)

  // Sem internet: tudo é local.
  await context.setOffline(true)
  await expect(numeros(page, 'Cópia de segurança')).toHaveText('nada ainda')
  await expect(numeros(page, 'Regiões (W3C Web Annotation)')).toHaveText('suas: nada ainda · 1 dos livros')
  await expect(numeros(page, 'Hipóteses para o MEDIATION')).toHaveText('nada ainda')
  await semRolagemHorizontal(page, 'Exportar vazia')
  await foto(page, 'exportar-1-vazia')
  await fotoEscura(page, 'exportar-2-vazia-escuro')

  const copia = await baixar(page, 'Baixar cópia')
  expect(copia.nome).toMatch(/^iconodb-copia-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
  expect(copia.json).toMatchObject({ formato: 'iconodb-copia', versao: 1, eventos: [], naoEnviados: [], base: null, estado: { v: 1, registros: [] }, imagens: [] })
  await expect(mensagem(page)).toHaveText(`Pronto: ${copia.nome} foi baixado.`)
  await foto(page, 'exportar-4-sucesso-vazia')

  const regioes = await baixar(page, 'Exportar regiões')
  expect(regioes.nome).toMatch(/^iconodb-regioes-.*\.jsonld$/)
  expect(regioes.json).toMatchObject({ '@context': 'http://www.w3.org/ns/anno.jsonld', type: 'AnnotationCollection', total: 1 })
  expect(Object.keys(regioes.json)[0]).toBe('@context')
  await expect(mensagem(page)).toHaveText(`Pronto: ${regioes.nome} foi baixado.`)

  const hipoteses = await baixar(page, 'Exportar hipóteses para o MEDIATION')
  expect(hipoteses.nome).toMatch(/^iconodb-hipoteses-mediation-.*\.json$/)
  expect(hipoteses.json).toMatchObject({ formato: 'iconodb-mediation', alvoEsquema: 'MEDIATION v0.6', versao: 1, hipoteses: [] })
  await context.setOffline(false)
})

test('com dados de dois aparelhos (um por enviar): os números e os três arquivos', async ({ page, context, dropbox }, info) => {
  dropbox.usuarioReal = true
  // Outro aparelho já deixou no Dropbox uma região numa imagem do livro, um termo novo e uma hipótese sobre essa região.
  const hlc = (n: number) => `${String(Date.now() - 60_000 + n).padStart(13, '0')}-0000-zzzzzzzz`
  const linhas = [
    { v: 1, id: 'zzzzzzzz-1-0', hlc: hlc(1), aparelho: 'zzzzzzzz', tipo: 'regiao', reg: 'RG-zzzzzzzz-1', op: 'criar', campos: { imagem: 'IMG-TESTE-0003-1', objeto: 'CA00003', seletor: '<polygon points="0.1,0.1 0.9,0.1 0.5,0.9"/>', elemento: 'leão <inventado> & "alado"', elementoId: null, pai: null } },
    { v: 1, id: 'zzzzzzzz-2-0', hlc: hlc(2), aparelho: 'zzzzzzzz', tipo: 'verbete', reg: 'GL-zzzzzzzz-1', op: 'criar', campos: { forma: 'leão-de-prova', status: 'proposed' } },
    { v: 1, id: 'zzzzzzzz-2-1', hlc: hlc(3), aparelho: 'zzzzzzzz', tipo: 'hipotese', reg: 'HY-zzzzzzzz-1', op: 'criar', campos: { objeto: 'CA00003', sobre: 'elemento', elemento: 'RG-zzzzzzzz-1', elementoRotulo: 'leão inventado', termos: ['GL-zzzzzzzz-1'], termosRotulos: ['leão-de-prova'], nivel: 'iconographic', modalidade: 'possible', justificativa: 'Justificativa inventada.', ancora: null } },
  ]
  dropbox.enviados.set('usuario/diario/zzzzzzzz/000001.jsonl', Buffer.from(linhas.map((l) => `${JSON.stringify(l)}\n`).join('')))
  await entrar(page)

  // A sincronização ao abrir traz os 3 eventos do outro aparelho.
  await page.goto('#/exportar')
  await expect(numeros(page, 'Cópia de segurança')).toHaveText('3 eventos de 1 aparelho', { timeout: 30_000 })
  await expect(numeros(page, 'Regiões (W3C Web Annotation)')).toHaveText('2 regiões: 1 sua, 1 dos livros')
  await expect(numeros(page, 'Hipóteses para o MEDIATION')).toHaveText('1 hipótese SKC')

  // Uma imagem que não consegue subir (a rede falha só para usuario/imagens/): fica na fila deste aparelho (OPFS).
  await context.route('https://content.dropboxapi.com/2/files/upload**', (route) =>
    (route.request().headers()['dropbox-api-arg'] ?? '').includes('/usuario/imagens/') ? route.abort('internetdisconnected') : route.fallback(),
  )
  await adicionarImagem(page, info)

  // Sem internet, uma nota neste aparelho: fica por enviar.
  await context.setOffline(true)
  await page.goto('#/item/CA00001')
  await expect(page.getByRole('button', { name: 'Mostrar o original alemão' })).toBeVisible()
  await escreverNota(page, 'Nota inventada para a cópia.')
  await page.goto('#/exportar')
  await expect(numeros(page, 'Cópia de segurança')).toHaveText(/^\d+ eventos de 2 aparelhos · \d+ por enviar · 1 imagem ainda só neste aparelho$/)
  await foto(page, 'imagens-so-neste-aparelho', numeros(page, 'Cópia de segurança'))
  await semRolagemHorizontal(page, 'Exportar com dados')
  await foto(page, 'exportar-3-com-dados')
  await fotoEscura(page, 'exportar-5-com-dados-escuro')

  // A cópia: os eventos dos dois aparelhos, os por enviar, o estado com a nota, a região, o verbete e a hipótese.
  const copia = await baixar(page, 'Baixar cópia')
  const eventos = copia.json.eventos as { id: string; aparelho: string; reg: string }[]
  const aparelhos = [...new Set(eventos.map((e) => e.aparelho))]
  expect(aparelhos).toHaveLength(2)
  expect(aparelhos).toContain('zzzzzzzz')
  const naoEnviados = copia.json.naoEnviados as string[]
  expect(naoEnviados.length).toBeGreaterThan(0)
  for (const id of naoEnviados) expect(eventos.map((e) => e.id)).toContain(id)
  const registros = (copia.json.estado as { registros: { tipo: string; id: string }[] }).registros
  expect(registros.map((r) => r.tipo).sort()).toEqual(expect.arrayContaining(['hipotese', 'imagem', 'nota', 'regiao', 'verbete']))
  // A imagem que ainda não subiu: enviada false.
  expect(copia.json.imagens).toEqual([expect.objectContaining({ alvo: 'CA00001', enviada: false })])
  expect(JSON.stringify(copia.json)).not.toMatch(/token|code_verifier|refresh/i)
  await expect(mensagem(page)).toHaveText(`Pronto: ${copia.nome} foi baixado.`)
  await semRolagemHorizontal(page, 'Exportar com a mensagem')
  await foto(page, 'exportar-6-sucesso')
  await fotoEscura(page, 'exportar-6b-sucesso-escuro')

  // As regiões: a do usuário (em pixels, com o rótulo intacto e o termo novo) e a do livro.
  const regioes = await baixar(page, 'Exportar regiões')
  const itens = (regioes.json.first as { items: { id: string; body: { type: string; value?: string; source?: string }[]; target: { source: string; selector: { type: string; value: string } } }[] }).items
  expect(itens.map((a) => a.id)).toEqual(['urn:iconodb:regiao:RG-zzzzzzzz-1', 'urn:iconodb:regiao-do-livro:EL-900001:IMG-TESTE-0003-1'])
  // A região (um elemento novo) é do usuário, e cada corpo diz de quem é: aqui, tudo do usuário (decisão 46).
  const usuario = { id: 'urn:iconodb:usuario', type: 'Person', name: 'SKC' }
  expect(itens[0]!.body).toEqual([
    { type: 'TextualBody', value: 'leão <inventado> & "alado"', format: 'text/plain', language: 'pt', purpose: 'tagging', creator: usuario },
    { type: 'SpecificResource', source: 'urn:iconodb:verbete:GL-zzzzzzzz-1', purpose: 'identifying', creator: usuario },
  ])
  // A do livro: só o livro, dos autores.
  expect(JSON.stringify(itens[1])).not.toContain('urn:iconodb:usuario')
  expect(itens[0]!.target.source).toBe('urn:iconodb:imagem:IMG-TESTE-0003-1')
  expect(itens[0]!.target.selector.value).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200"><polygon points="90,120 810,120 450,1080"/></svg>')
  // O SVG é XML válido no navegador, com uma forma só.
  const formas = await page.evaluate((svg) => {
    const d = new DOMParser().parseFromString(svg, 'image/svg+xml')
    return d.getElementsByTagName('parsererror').length > 0 ? -1 : d.querySelectorAll('polygon').length
  }, itens[0]!.target.selector.value)
  expect(formas).toBe(1)

  // As hipóteses: só a SKC, não publicada, com o termo do usuário marcado.
  const hipoteses = await baixar(page, 'Exportar hipóteses para o MEDIATION')
  expect(hipoteses.json.hipoteses).toEqual([
    expect.objectContaining({
      id: 'HY-zzzzzzzz-1',
      fonte: 'own_unpublished',
      publicado: false,
      alvo: { tipo: 'element', id: 'RG-zzzzzzzz-1', objeto: 'CA00003', rotulo: 'leão inventado' },
      localizador: 'TESTE I, Nr. 3',
      identificacao: [{ id: 'GL-zzzzzzzz-1', rotulo: 'leão-de-prova', termoDoUsuario: true, forma: 'leão-de-prova', formaOriginal: 'leão-de-prova' }],
    }),
  ])
  await context.setOffline(false)
})

test('app instalado no Mac (o do Dock: standalone, sem toque): baixa pelo link; a folha de compartilhar não abre', async ({ page }) => {
  await appInstalado(page, false)
  await entrar(page)
  await page.goto('#/exportar')
  await expect(numeros(page, 'Cópia de segurança')).toHaveText('nada ainda')
  const copia = await baixar(page, 'Baixar cópia')
  expect(copia.json).toMatchObject({ formato: 'iconodb-copia', versao: 1 })
  await expect(mensagem(page)).toHaveText(`Pronto: ${copia.nome} foi baixado.`)
  expect((await folha(page)).chamadas).toBe(0)
})

test('app instalado num aparelho de toque: a folha de compartilhar; recusada sem um toque recente, «Salvar o arquivo» entrega o mesmo arquivo', async ({ page }) => {
  await appInstalado(page, true)
  await entrar(page)
  await page.goto('#/exportar')
  await expect(numeros(page, 'Cópia de segurança')).toHaveText('nada ainda')
  const downloads: string[] = []
  page.on('download', (d) => downloads.push(d.suggestedFilename()))

  // 1. Enquanto gera (aqui a folha fica aberta até soltarmos), o botão diz «Gerando…».
  await page.evaluate(() => void ((window as unknown as { __folha: Folha }).__folha.segurar = true))
  const regioes = secao(page, 'Regiões (W3C Web Annotation)').getByRole('button')
  await regioes.click()
  await expect(regioes).toHaveAccessibleName('Gerando…')
  await expect(regioes.getByText('Gerando…')).toBeVisible()
  await expect(regioes.getByText('Exportar regiões')).toBeHidden()
  await expect(regioes).toHaveAttribute('aria-busy', 'true')
  await foto(page, 'botao-gerando', regioes)
  await page.evaluate(() => {
    const f = (window as unknown as { __folha: Folha }).__folha
    f.segurar = false
    f.soltar()
  })
  await expect(mensagem(page)).toHaveText(/^Pronto: iconodb-regioes-.*\.jsonld foi enviado pela folha de compartilhar\.$/)
  await expect(regioes).toHaveAccessibleName('Exportar regiões')
  await expect(regioes.getByText('Gerando…')).toBeHidden()

  // 2. A folha recusada (o toque já não era recente): nada de «foi baixado», nada de link; o arquivo fica pronto.
  await page.evaluate(() => void ((window as unknown as { __folha: Folha }).__folha.recusar = true))
  await page.getByRole('button', { name: 'Baixar cópia' }).click()
  const salvar = mensagem(page).getByRole('button', { name: 'Salvar o arquivo' })
  await expect(salvar).toBeVisible()
  await expect(mensagem(page)).toContainText(/^O arquivo iconodb-copia-.*\.json está pronto\. Toque em «Salvar o arquivo» para guardá-lo\./)
  await expect(mensagem(page)).not.toContainText('foi baixado')
  await semRolagemHorizontal(page, 'Exportar com «Salvar o arquivo»')
  await foto(page, 'salvar-o-arquivo')
  const antes = await folha(page)
  expect(antes.chamadas).toBe(2)

  // 3. Um toque novo: o mesmo arquivo vai pela folha.
  await salvar.click()
  await expect(mensagem(page)).toHaveText(/^Pronto: iconodb-copia-.*\.json foi enviado pela folha de compartilhar\.$/)
  const depois = await folha(page)
  expect(depois.chamadas).toBe(3)
  const recebido = depois.recebidos.at(-1)!
  expect(recebido.nome).toMatch(/^iconodb-copia-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
  expect(recebido.tipo).toBe('application/json')
  expect(JSON.parse(recebido.texto)).toMatchObject({ formato: 'iconodb-copia', versao: 1, eventos: [] })
  await expect(page.getByRole('button', { name: 'Baixar cópia' })).toBeFocused()
  await foto(page, 'salvar-o-arquivo-pronto')
  expect(downloads).toEqual([])
})

test('E-9: a folha recusada também no segundo toque: o link «Baixar o arquivo» baixa o mesmo arquivo (sem violar a CSP)', async ({ page }) => {
  await appInstalado(page, true)
  await entrar(page)
  await page.goto('#/exportar')
  await expect(numeros(page, 'Cópia de segurança')).toHaveText('nada ainda')
  const recusarDeNovo = () => page.evaluate(() => void ((window as unknown as { __folha: Folha }).__folha.recusar = true))
  await recusarDeNovo()
  await page.getByRole('button', { name: 'Baixar cópia' }).click()
  const salvar = mensagem(page).getByRole('button', { name: 'Salvar o arquivo' })
  await expect(salvar).toBeVisible()
  await expect(mensagem(page).getByRole('link', { name: 'Baixar o arquivo' })).toHaveCount(0)
  await recusarDeNovo()
  await salvar.click()
  const link = mensagem(page).getByRole('link', { name: 'Baixar o arquivo' })
  await expect(link).toBeVisible()
  await expect(mensagem(page)).toContainText('Se a folha de compartilhar não abrir, use o link abaixo para baixar o arquivo.')
  await semRolagemHorizontal(page, 'Exportar com o link de download')
  await foto(page, 'baixar-o-arquivo-link')
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()])
  expect(download.suggestedFilename()).toMatch(/^iconodb-copia-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
  expect(JSON.parse(readFileSync(await download.path(), 'utf8'))).toMatchObject({ formato: 'iconodb-copia', versao: 1, eventos: [] })
})

test('E-9 (adendo): a folha de compartilhar falha por outro motivo: o arquivo está pronto, a mensagem diz que a folha não abriu e o link já baixa o mesmo arquivo (sem violar a CSP)', async ({ page }) => {
  await appInstalado(page, true)
  await entrar(page)
  await page.goto('#/exportar')
  await expect(numeros(page, 'Cópia de segurança')).toHaveText('nada ainda')
  const falharDeNovo = () => page.evaluate(() => void ((window as unknown as { __folha: Folha }).__folha.falhar = true))
  await falharDeNovo()
  await page.getByRole('button', { name: 'Baixar cópia' }).click()
  const salvar = mensagem(page).getByRole('button', { name: 'Salvar o arquivo' })
  await expect(salvar).toBeVisible()
  const texto = /^O arquivo (iconodb-copia-\d{4}-\d{2}-\d{2}-\d{4}\.json) está pronto, mas a folha de compartilhar não abriu\. Toque em «Salvar o arquivo» para tentar de novo ou use o link abaixo para baixar o arquivo\./
  await expect(mensagem(page)).toContainText(texto)
  await expect(mensagem(page)).not.toContainText('Não foi possível gerar o arquivo')
  await expect(mensagem(page)).not.toHaveClass(/exp-mensagem-erro/)
  const link = mensagem(page).getByRole('link', { name: 'Baixar o arquivo' })
  await expect(link).toBeVisible()
  // «Salvar o arquivo» que falha do mesmo jeito: a mesma mensagem, o foco no botão refeito.
  await falharDeNovo()
  await salvar.click()
  await expect(salvar).toBeFocused()
  await expect(mensagem(page)).toContainText(texto)
  await expect(link).toBeVisible()
  expect((await folha(page)).chamadas).toBe(2)
  await semRolagemHorizontal(page, 'Exportar com a folha que falhou')
  await foto(page, 'folha-falhou')
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()])
  expect(download.suggestedFilename()).toMatch(/^iconodb-copia-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
  expect(JSON.parse(readFileSync(await download.path(), 'utf8'))).toMatchObject({ formato: 'iconodb-copia', versao: 1, eventos: [] })
})

type EstadoDaMensagem = 'folha-falhou' | 'segundo-toque-recusado'
/** Leva a tela Exportar ao estado da mensagem mais alta (a folha que falhou, ou o segundo toque recusado). */
async function abrirComMensagemAlta(page: Page, estado: EstadoDaMensagem) {
  await appInstalado(page, true)
  await entrar(page)
  await page.goto('#/exportar')
  await expect(numeros(page, 'Cópia de segurança')).toHaveText('nada ainda')
  const marcar = (campo: 'recusar' | 'falhar') => page.evaluate((c) => void ((window as unknown as { __folha: Folha }).__folha[c] = true), campo)
  if (estado === 'folha-falhou') {
    await marcar('falhar')
    await page.getByRole('button', { name: 'Baixar cópia' }).click()
    await expect(mensagem(page).getByRole('link', { name: 'Baixar o arquivo' })).toBeVisible()
  } else {
    await marcar('recusar')
    await page.getByRole('button', { name: 'Baixar cópia' }).click()
    // Só depois da primeira recusa (o botão aparece): marcar antes a perderia, e o segundo toque seria aceito.
    await expect(mensagem(page).getByRole('button', { name: 'Salvar o arquivo' })).toBeVisible()
    await marcar('recusar')
    await mensagem(page).getByRole('button', { name: 'Salvar o arquivo' }).click()
    await expect(mensagem(page).getByRole('link', { name: 'Baixar o arquivo' })).toBeVisible()
  }
}
/** Rola até o fim e mede, repetindo até a folga ter acompanhado a mensagem (sem pausa fixa): o fim do último botão até o topo da mensagem. */
async function esperarOUltimoBotaoAcimaDaMensagem(page: Page) {
  const ultimo = page.getByRole('button', { name: 'Exportar hipóteses para o MEDIATION' })
  await expect
    .poll(async () => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const [b, m] = await Promise.all([ultimo.boundingBox(), mensagem(page).boundingBox()])
      return b && m ? Math.round(m.y - (b.y + b.height)) : null
    }, { message: 'o fim do último botão até o topo da mensagem (px; precisa ser >= 0)' })
    .toBeGreaterThanOrEqual(0)
  await ultimo.click({ trial: true })
}

/**
 * I-1 (revisão final do grupo E): no celular, a mensagem presa ao pé da tela (a mais alta: a folha que falhou, ou o segundo toque
 * recusado, com o botão e o link) não pode cobrir o último botão da tela, mesmo com a página rolada até o fim. A folga embaixo
 * acompanha a altura real da mensagem. A 375 e a 320 px; no computador a mensagem fica fora da coluna e o teste não se aplica.
 */
for (const largura of [375, 320]) {
  for (const estado of ['folha-falhou', 'segundo-toque-recusado'] as const) {
    test(`I-1: a ${largura} px, com a mensagem «${estado}», o último botão fica acima dela e dá para tocar`, async ({ page }, info) => {
      test.skip(info.project.use.viewport!.width >= 768, 'só no celular')
      await page.setViewportSize({ width: largura, height: 667 })
      await abrirComMensagemAlta(page, estado)
      await esperarOUltimoBotaoAcimaDaMensagem(page)
      if (largura === 375 && estado === 'folha-falhou') await foto(page, 'folha-falhou-rolado')
      await semRolagemHorizontal(page, `Exportar a ${largura} px`)
    })
  }
}

/**
 * m-3 (re-revisão do e-fix3): numa janela de computador estreita e baixa (768 a 864 px de largura), a mensagem, no canto de baixo à
 * direita, cruza o último botão; a folga embaixo precisa acompanhar a altura dela também a partir de 768 px.
 */
for (const [largura, altura] of [[768, 600], [820, 560]] as const) {
  test(`m-3: a ${largura}×${altura}, com a mensagem «folha-falhou», o último botão fica acima dela e dá para tocar`, async ({ page }, info) => {
    test.skip(info.project.use.viewport!.width < 768, 'só no projeto de computador')
    await page.setViewportSize({ width: largura, height: altura })
    await abrirComMensagemAlta(page, 'folha-falhou')
    await esperarOUltimoBotaoAcimaDaMensagem(page)
    await semRolagemHorizontal(page, `Exportar a ${largura}×${altura}`)
  })
}

/**
 * O-3 (re-revisão do e-fix3): com o texto do sistema grande (acima de 1,5×; aqui 2×, pois a 1,5× a mensagem ainda cabe em 568 px) num celular estreito, a mensagem fixa não pode passar da altura da
 * tela; ela rola por dentro, e «Salvar o arquivo» e o link «Baixar o arquivo» continuam ao alcance. O texto grande é emulado só no
 * teste, pelo CSSOM (o addStyleTag cria um <style> inline, que a CSP bloqueia); o app e a CSP não mudam.
 */
test('O-3: a 320×568 com o texto a 200%, a mensagem não passa da tela e rola por dentro até o link «Baixar o arquivo»', async ({ page }, info) => {
  test.skip(info.project.use.viewport!.width >= 768, 'só no celular')
  await page.setViewportSize({ width: 320, height: 568 })
  await abrirComMensagemAlta(page, 'folha-falhou')
  // O texto a 200%: o tamanho de fonte (px) de cada elemento da mensagem ×2, pelo CSSOM (a CSP do app bloqueia o <style> do addStyleTag).
  await mensagem(page).evaluate((raiz) => {
    const els = [raiz, ...raiz.querySelectorAll<HTMLElement>('*')]
    const tamanhos = els.map((el) => parseFloat(getComputedStyle(el).fontSize))
    els.forEach((el, i) => el.style.setProperty('font-size', `${tamanhos[i]! * 2}px`))
  })
  const viewport = page.viewportSize()!
  await expect
    .poll(async () => (await mensagem(page).boundingBox())?.height ?? Infinity, { message: 'a altura da mensagem (px; precisa caber na tela)' })
    .toBeLessThanOrEqual(viewport.height)
  const caixa = (await mensagem(page).boundingBox())!
  expect(caixa.y).toBeGreaterThanOrEqual(0)
  expect(caixa.y + caixa.height).toBeLessThanOrEqual(viewport.height)
  expect(await mensagem(page).evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  const link = mensagem(page).getByRole('link', { name: 'Baixar o arquivo' })
  await link.scrollIntoViewIfNeeded()
  const l = (await link.boundingBox())!
  const c = (await mensagem(page).boundingBox())!
  expect(l.y).toBeGreaterThanOrEqual(c.y - 1)
  expect(l.y + l.height).toBeLessThanOrEqual(c.y + c.height + 1)
  await link.click({ trial: true })
  const salvar = mensagem(page).getByRole('button', { name: 'Salvar o arquivo' })
  await salvar.scrollIntoViewIfNeeded()
  await salvar.click({ trial: true })
  await semRolagemHorizontal(page, 'Exportar a 320 px com o texto grande')
})
