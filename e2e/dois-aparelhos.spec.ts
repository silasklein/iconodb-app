import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Browser, BrowserContext, Locator, Page, TestInfo } from '@playwright/test'
import { ligarDropboxSimulado, novoDropboxSimulado, type DropboxSimulado } from './dropboxSimulado'
import { expect, test, vigiarCsp } from './fixtures'
import { escreverNota } from './notasNaTela'

/**
 * Dois aparelhos, uma conta do Dropbox (Tarefa 17, Focos 1 e 4 da revisão): dois contextos do navegador (cada um com o seu
 * IndexedDB, OPFS e id de aparelho) ligados ao MESMO Dropbox simulado, com a pasta usuario/ como no Dropbox de verdade
 * (`usuarioReal`: listagem do que foi enviado, em páginas de 2 entradas com list_folder/continue; o modo `update` com rev).
 *
 * 1. A cria uma nota, uma coleção, um objeto SKC com foto e uma hipótese com região, e sincroniza; B abre e vê tudo (a
 *    foto também: a versão de tela baixada de usuario/imagens/).
 * 2. Foco 1: os dois sem internet editam a mesma nota e movem o mesmo objeto na mesma coleção; ao reconectar convergem para
 *    o mesmo estado (vence a edição mais nova), o aviso «Mesmo campo nos dois aparelhos» diz qual valeu, e a versão que
 *    perdeu está no histórico do campo (na cópia de segurança).
 * 3. Foco 4: os dois criam um objeto CA sem internet (os dois com o mesmo número, marcado «provisório») e consolidam ao
 *    mesmo tempo (o estado.json de A fica preso até B gravar o dele: o `update` de A com o rev antigo dá 409 e A relê):
 *    nenhum número repetido; o mais antigo pelo hlc fica com o número, o outro recebe o seguinte e vê o aviso.
 * 4. A rede cai no meio do envio de um segmento (o arquivo chega e a resposta se perde): nada se perde nem se duplica.
 * 5. Só com a permissão de leitura: a Sincronização diz que faltam permissões e lista as três.
 *
 * Em todos: nenhuma rolagem horizontal nas telas vistas (375 e 1280), nenhuma violação de CSP, nenhum pedido para fora.
 * Só dados sintéticos (TESTE). Com SHOTS_DIR definido, guarda capturas.
 */

interface Aparelho {
  nome: string
  context: BrowserContext
  page: Page
  csp: string[]
}

const semRolagemHorizontal = async (page: Page, tela: string) => {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}
async function foto(page: Page, nome: string, ver?: Locator) {
  const pasta = process.env.SHOTS_DIR
  if (!pasta) return
  mkdirSync(pasta, { recursive: true })
  await ver?.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: join(pasta, `dois-${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}
const celular = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

/** Um Dropbox simulado novo, com usuario/ de verdade e páginas pequenas (a listagem passa por list_folder/continue). */
function dropboxDeDois(): DropboxSimulado {
  const d = novoDropboxSimulado()
  d.usuarioReal = true
  d.porPagina = 2
  return d
}

/** Um aparelho: um contexto novo, com as opções do projeto (tamanho, toque), ligado ao Dropbox compartilhado. */
async function aparelho(browser: Browser, info: TestInfo, dropbox: DropboxSimulado, nome: string): Promise<Aparelho> {
  const u = info.project.use
  const context = await browser.newContext({ baseURL: u.baseURL, viewport: u.viewport, hasTouch: u.hasTouch, isMobile: u.isMobile, serviceWorkers: u.serviceWorkers })
  const csp = await vigiarCsp(context)
  await ligarDropboxSimulado(context, { compartilhado: dropbox, quem: nome })
  const page = await context.newPage()
  return { nome, context, page, csp }
}

async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}

async function encerrar(dropbox: DropboxSimulado, ...aparelhos: Aparelho[]) {
  for (const a of aparelhos) await a.context.close()
  for (const a of aparelhos) expect(a.csp, `violações da CSP em ${a.nome}`).toEqual([])
  expect(dropbox.proibidos, 'pedidos que sairiam para a internet').toEqual([])
  expect(
    dropbox.escritas.filter((e) => !e.caminho.startsWith('usuario/')),
    'escritas fora de usuario/',
  ).toEqual([])
}

const estadoDaSync = (page: Page) => page.locator('.sync-estado-tela [role="status"]')

/** «Salvar e sincronizar» na tela de Sincronização (um clique, sem atalho de teclado). */
async function sincronizar(page: Page) {
  await page.goto('#/sincronizacao')
  await page.locator('.sync-corpo').getByRole('button', { name: 'Salvar e sincronizar' }).click()
}

/** Espera o aparelho ficar sem nada por enviar (nem eventos nem imagens). */
async function semNadaPorEnviar(page: Page) {
  await page.goto('#/sincronizacao')
  await expect(estadoDaSync(page)).toHaveText(/Sincronizado.*Nada por enviar\./, { timeout: 45_000 })
}

/** O conteúdo (texto) de todos os segmentos de um aparelho no Dropbox. */
function diarioDe(dropbox: DropboxSimulado, id: string): string {
  return [...dropbox.enviados.entries()]
    .filter(([c]) => c.startsWith(`usuario/diario/${id}/`))
    .map(([, b]) => b.toString('utf8'))
    .join('')
}
/** Quanto o envio do estado.json de A pode ficar preso no Foco 4 (abaixo do prazo de 20 s do app para uma chamada curta). */
const LIMITE_DO_ENVIO_PRESO_MS = 15_000
/** Quantos pedidos cada aparelho fez ao Dropbox simulado (todos, de qualquer tipo). */
const pedidosAoDropbox = (dropbox: DropboxSimulado) => Object.fromEntries(dropbox.pedidos)
/** Os ids dos aparelhos que têm diário no Dropbox. */
const aparelhosNoDiario = (dropbox: DropboxSimulado) => [...new Set([...dropbox.enviados.keys()].map((c) => /^usuario\/diario\/([a-z0-9]{8})\//.exec(c)?.[1]).filter(Boolean))] as string[]

/** Um segmento de um terceiro aparelho (sintético), já no Dropbox antes de os dois abrirem. */
function semear(dropbox: DropboxSimulado, eventos: { tipo: string; reg: string; op: string; campos: Record<string, unknown> }[]) {
  const ms = Date.now() - 60_000
  const linhas = eventos.map((e, n) => ({ v: 1, id: `zzzzzzzz-1-${n}`, hlc: `${String(ms).padStart(13, '0')}-${String(n).padStart(4, '0')}-zzzzzzzz`, aparelho: 'zzzzzzzz', ...e }))
  dropbox.enviados.set('usuario/diario/zzzzzzzz/000001.jsonl', Buffer.from(linhas.map((l) => `${JSON.stringify(l)}\n`).join('')))
}

/** Uma "foto" sintética (degradê com ruído: tons, não traço), feita pelo próprio navegador e gravada no disco. */
async function fotoSintetica(page: Page, info: TestInfo): Promise<string> {
  const base64 = await page.evaluate(async () => {
    const c = new OffscreenCanvas(900, 1200)
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 900, 1200)
    g.addColorStop(0, '#6b5a48')
    g.addColorStop(1, '#c9b79c')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 900, 1200)
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = `rgba(${(i * 37) % 255},${(i * 91) % 255},${(i * 53) % 255},0.15)`
      ctx.fillRect((i * 97) % 900, (i * 61) % 1200, 9, 9)
    }
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(s)
  })
  const pasta = join(info.project.outputDir, 'arquivos-sinteticos', info.testId)
  mkdirSync(pasta, { recursive: true })
  const caminho = join(pasta, 'foto-sintetica.jpg')
  writeFileSync(caminho, Buffer.from(base64, 'base64'))
  return caminho
}

/** Cria um objeto SKC do Calcolítico pela tela (com foto, se dada). Devolve o número que a tela mostrou ao salvar. */
async function novoObjeto(page: Page, titulo: string, imagem: string | null): Promise<void> {
  await page.goto('#/objeto/novo')
  await expect(page.getByRole('heading', { level: 1, name: /Novo objeto/ })).toBeVisible()
  await page.getByLabel('Tipo e descrição curta').fill(titulo)
  if (imagem) {
    await page.locator(`input[type="file"][data-origem="${celular(page) ? 'fotos' : 'arquivos'}"]`).setInputFiles(imagem)
    await expect(page.getByRole('radio', { name: /^Foto \/ tons/ })).toBeChecked({ timeout: 20_000 })
    await page.getByRole('textbox', { name: 'Crédito / fonte' }).fill('foto TESTE')
  }
  await page.getByRole('radiogroup', { name: 'Período' }).getByRole('radio', { name: /Calcolítico/ }).click()
  await expect(page.getByTestId('numero-novo')).toContainText(/CA\d{5}/)
  await page.getByRole('radio', { name: /Achado recente/ }).check()
  await page.getByLabel(/Nota do achado/).fill('achado TESTE')
  await page.getByRole('textbox', { name: /^Leitura/ }).fill(`Leitura TESTE de ${titulo}`)
  await page.getByRole('button', { name: /^Salvar objeto CA\d{5}/ }).first().click()
  await expect(page).toHaveURL(/#\/item\/OB-[a-z0-9]{8}-\d+/)
}

/** Seleciona `trecho` no texto da leitura (como o arrastar do dedo ou do mouse deixaria). */
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
async function desenhar(page: Page, camada: Locator, pontos: [number, number][]) {
  const caixa = (await camada.boundingBox())!
  for (const [x, y] of pontos) {
    const px = caixa.x + caixa.width * x
    const py = caixa.y + caixa.height * y
    if (celular(page)) await page.touchscreen.tap(px, py)
    else await page.mouse.click(px, py)
  }
}

/** Uma hipótese SKC sobre uma região nova de CA00002, pela seleção de um trecho da leitura (sem atalho de teclado). */
async function hipoteseComRegiao(page: Page, elemento: string) {
  await page.goto('#/item/CA00002')
  const leitura = page.locator('[data-trecho-fonte="PA-TESTE-0002-cat-1"]')
  await expect(leitura).toBeVisible()
  await leitura.scrollIntoViewIfNeeded()
  await selecionar(page, 'PA-TESTE-0002-cat-1', 'estrela de prova')
  await page.locator('.botao-do-trecho').click()
  const form = page.getByRole('dialog', { name: 'Nova hipótese' })
  await expect(form).toBeVisible()
  await form.getByRole('combobox', { name: 'Termo' }).fill('leão')
  await form.getByRole('listbox', { name: 'Termo' }).getByRole('option', { name: /^leão-de-teste/ }).click()
  await form.getByRole('button', { name: 'Marcar uma região nova na imagem' }).click()
  const camada = page.getByTestId('desenho-camada')
  await expect(camada).toBeVisible()
  await desenhar(page, camada, [
    [0.2, 0.2],
    [0.6, 0.2],
    [0.6, 0.6],
    [0.2, 0.6],
  ])
  if (celular(page)) {
    await page.getByRole('button', { name: 'Concluir e voltar à hipótese' }).click()
    await expect(page).toHaveURL(/#\/item\/CA00002$/)
  } else {
    await page.getByRole('toolbar', { name: 'Marcar região' }).getByRole('button', { name: 'Concluir a região' }).click()
  }
  const form2 = page.getByRole('dialog', { name: 'Nova hipótese' })
  await expect(form2.getByRole('button', { name: /Região nova, 4 pontos/ })).toHaveAttribute('aria-pressed', 'true')
  await form2.getByRole('textbox', { name: 'Nome do elemento novo' }).fill(elemento)
  await form2.getByRole('button', { name: 'Registrar hipótese' }).click()
  await expect(form2).toHaveCount(0)
}

/** O texto da nota de CA00001, como a tela do objeto o mostra. */
const notaDoObjeto = (page: Page) => page.getByRole('region', { name: 'Leituras' }).getByRole('group', { name: 'SKC notas' }).getByRole('article')

/** Abre a nota em Minhas notas e troca o texto dela. */
async function editarNota(page: Page, deTexto: RegExp, para: string) {
  await page.goto('#/notas')
  await page.getByRole('link', { name: deTexto }).click()
  const leitura = page.getByRole('group', { name: /^Nota \[\d+\]/ })
  await expect(leitura).toBeVisible()
  await leitura.getByText(deTexto).click()
  const campo = page.getByRole('textbox', { name: /^Nota \[\d+\]/ })
  await expect(campo).toBeFocused()
  await campo.fill(para)
  await page.getByRole('button', { name: 'Salvar nota' }).click()
  if (celular(page)) await expect(page).toHaveURL(/#\/notas$/)
  else await expect(page.getByText('nota salva')).toBeVisible()
}

const ordemNaTela = async (page: Page) =>
  page
    .getByRole('list', { name: 'Itens da coleção' })
    .getByRole('button', { name: /^Mover / })
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.replace('Mover ', '')))

async function abrirColecao(page: Page, nome: string) {
  await page.goto('#/colecoes')
  await page.getByRole('region', { name: 'Minhas coleções' }).getByRole('link', { name: new RegExp(nome) }).click()
  await expect(page.getByRole('heading', { level: 1, name: nome })).toBeVisible()
}

/** Alt+↑ no puxador de `numero`, `vezes` vezes, esperando cada mudança na ordem antes da próxima tecla. */
async function subir(page: Page, numero: string, vezes: number) {
  const puxador = page.getByRole('button', { name: `Mover ${numero}` })
  for (let i = 0; i < vezes; i++) {
    const antes = await ordemNaTela(page)
    await puxador.focus()
    await expect(puxador).toBeFocused()
    await page.keyboard.press('Alt+ArrowUp')
    await expect.poll(() => ordemNaTela(page)).not.toEqual(antes)
  }
}

/** Baixa a cópia de segurança (Exportar) e devolve o JSON. */
async function copiaDeSeguranca(page: Page): Promise<{ estado: { registros: { tipo: string; id: string; campos: Record<string, { valor: unknown }[]> }[] } }> {
  await page.goto('#/exportar')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar cópia' }).click()])
  return JSON.parse(readFileSync(await download.path(), 'utf8'))
}

test('A cria nota, coleção, objeto SKC com foto e hipótese com região e sincroniza; B abre e vê tudo', async ({ browser }, info) => {
  test.setTimeout(240_000)
  const dropbox = dropboxDeDois()
  const A = await aparelho(browser, info, dropbox, 'A')
  const B = await aparelho(browser, info, dropbox, 'B')
  try {
    // 1. A entra e cria as quatro coisas.
    await entrar(A.page)
    await A.page.goto('#/item/CA00001')
    await escreverNota(A.page, 'Nota TESTE do aparelho A.')
    await expect(notaDoObjeto(A.page)).toContainText('Nota TESTE do aparelho A.')

    await A.page.getByRole('button', { name: 'Adicionar à coleção' }).click()
    const folha = A.page.getByRole('dialog', { name: 'Adicionar à coleção' })
    await folha.getByLabel('Nova coleção').fill('Coleção TESTE de A')
    await folha.getByRole('button', { name: 'Criar' }).click()
    await expect(folha.getByRole('checkbox', { name: 'Incluir em Coleção TESTE de A' })).toBeChecked()
    await folha.getByRole('button', { name: 'Fechar' }).click()
    await expect(folha).toHaveCount(0)

    await novoObjeto(A.page, 'Selo TESTE de A. Pedra.', await fotoSintetica(A.page, info))
    const cabecaA = A.page.getByTestId('objeto-cabeca')
    await expect(cabecaA).toContainText('CA00005')
    await semRolagemHorizontal(A.page, 'objeto SKC em A')

    await hipoteseComRegiao(A.page, 'cauda TESTE')
    await semRolagemHorizontal(A.page, 'item com hipótese em A')

    // 2. A sincroniza: os eventos e a imagem (tela e miniatura) sobem; o número se confirma no estado.json.
    await sincronizar(A.page)
    await semNadaPorEnviar(A.page)
    const [idA] = aparelhosNoDiario(dropbox)
    expect(idA).toMatch(/^[a-z0-9]{8}$/)
    const diarioA = diarioDe(dropbox, idA!)
    for (const t of ['Nota TESTE do aparelho A.', 'Coleção TESTE de A', 'Selo TESTE de A. Pedra.', 'cauda TESTE']) expect(diarioA).toContain(t)
    expect([...dropbox.enviados.keys()].some((c) => /^usuario\/imagens\/IM-[a-z0-9]{8}-\d+\/tela\.webp$/.test(c))).toBe(true)
    expect(Object.values((JSON.parse(dropbox.enviados.get('usuario/estado.json')!.toString('utf8')) as { numeros?: Record<string, string> }).numeros ?? {})).toContain('CA00005')
    // A nunca baixa o próprio segmento (ele o conhece: a listagem do próprio diário só confirma).
    expect(dropbox.leituras.filter((l) => l.quem === 'A' && l.caminho.startsWith(`usuario/diario/${idA}/`))).toEqual([])
    await semRolagemHorizontal(A.page, 'Sincronização em A')

    // 3. B entra (o pacote e, na abertura, a sincronização): lê os segmentos de A e vê tudo.
    await entrar(B.page)
    await B.page.goto('#/item/CA00001')
    await expect(notaDoObjeto(B.page)).toContainText('Nota TESTE do aparelho A.', { timeout: 45_000 })
    await foto(B.page, '1-b-nota')
    await semRolagemHorizontal(B.page, 'item com a nota em B')

    await B.page.goto('#/colecoes')
    const colecaoEmB = B.page.getByRole('region', { name: 'Minhas coleções' }).getByRole('link', { name: /Coleção TESTE de A/ })
    await expect(colecaoEmB).toContainText('1')
    await colecaoEmB.click()
    await expect.poll(() => ordemNaTela(B.page)).toEqual(['CA00001'])
    await semRolagemHorizontal(B.page, 'coleção em B')

    await B.page.goto('#/item/CA00005')
    const cabecaB = B.page.getByTestId('objeto-cabeca')
    await expect(cabecaB).toContainText('CA00005')
    await expect(cabecaB).not.toContainText('provisório')
    await expect(B.page.getByRole('heading', { level: 1, name: 'Selo TESTE de A. Pedra.' })).toBeVisible()
    // A foto chega a B: a versão de tela vem de usuario/imagens/ do Dropbox.
    const imagemEmB = B.page.getByRole('region', { name: 'Imagem' }).first().getByRole('img', { name: /^Imagem 1 de CA00005$/ })
    await expect(imagemEmB).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => imagemEmB.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0)
    expect(dropbox.leituras.some((l) => l.quem === 'B' && /^usuario\/imagens\/IM-.*\/(tela|miniatura)\.webp$/.test(l.caminho))).toBe(true)
    await foto(B.page, '2-b-objeto-com-foto')
    await semRolagemHorizontal(B.page, 'objeto SKC em B')

    await B.page.goto('#/item/CA00002')
    await expect(B.page.locator('[data-trecho-fonte="PA-TESTE-0002-cat-1"] a.ancora-skc')).toHaveText(/estrela de prova/)
    await B.page.getByRole('button', { name: /Hipóteses por nível/ }).click()
    const linhas = B.page.getByRole('region', { name: 'Hipóteses por nível' }).locator('[data-hipotese-linha^="HY-"]').filter({ hasText: 'cauda TESTE' })
    await expect(linhas).toHaveCount(1)
    await linhas.click()
    await expect(B.page.getByRole('dialog', { name: 'Hipótese leão-de-teste' })).toContainText('acesa na imagem')
    await expect(B.page.locator('.imagem-item-regioes polygon.regiao-traco')).toHaveCount(1)
    await foto(B.page, '3-b-hipotese-com-regiao')
    await semRolagemHorizontal(B.page, 'hipótese com região em B')

    // 4. B leu o que A gravou (o estado.json que A consolidou, que cobre os segmentos de A; a listagem veio em páginas,
    //    com list_folder/continue) e diz o que chegou do outro aparelho.
    expect(dropbox.leituras.some((l) => l.quem === 'B' && l.caminho === 'usuario/estado.json')).toBe(true)
    expect(dropbox.continuacoes).toBeGreaterThan(0)
    // As listagens trouxeram pastas junto com os arquivos (como o Dropbox), e o app as ignorou.
    expect(dropbox.pastasListadas).toBeGreaterThan(0)
    await B.page.goto('#/sincronizacao')
    await expect(B.page.getByRole('region', { name: 'Chegou do outro aparelho' })).toContainText(/alterações? do outro aparelho/)
    await semRolagemHorizontal(B.page, 'Sincronização em B')
  } finally {
    await encerrar(dropbox, A, B)
  }
})

test('Foco 1: sem internet, os dois editam a mesma nota e movem o mesmo objeto da mesma coleção; convergem e a versão que perdeu fica no histórico', async ({ browser }, info) => {
  test.setTimeout(240_000)
  const dropbox = dropboxDeDois()
  semear(dropbox, [
    { tipo: 'nota', reg: 'NT-zzzzzzzz-1', op: 'criar', campos: { texto: 'Nota TESTE de partida.', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: false } },
    { tipo: 'colecao', reg: 'CO-zzzzzzzz-1', op: 'criar', campos: { nome: 'Coleção TESTE comum', 'm:CA00001': true, 'i:CA00001': 1024, 'm:CA00002': true, 'i:CA00002': 2048, 'm:CA00003': true, 'i:CA00003': 3072 } },
  ])
  const A = await aparelho(browser, info, dropbox, 'A')
  const B = await aparelho(browser, info, dropbox, 'B')
  try {
    for (const x of [A, B]) {
      await entrar(x.page)
      await x.page.goto('#/item/CA00001')
      await expect(notaDoObjeto(x.page)).toContainText('Nota TESTE de partida.', { timeout: 45_000 })
      await semNadaPorEnviar(x.page)
    }

    // 1. Os dois sem internet. A edita primeiro; B depois (a edição de B é a mais nova).
    await A.context.setOffline(true)
    await B.context.setOffline(true)
    await editarNota(A.page, /Nota TESTE de partida\./, 'Texto TESTE escrito em A.')
    // Contado depois do primeiro passo sem internet: um pedido que já tinha saído antes de desligar chega ao simulado antes.
    const antesDoOffline = pedidosAoDropbox(dropbox)
    await abrirColecao(A.page, 'Coleção TESTE comum')
    await subir(A.page, 'CA00003', 1)
    await expect.poll(() => ordemNaTela(A.page)).toEqual(['CA00001', 'CA00003', 'CA00002'])

    await editarNota(B.page, /Nota TESTE de partida\./, 'Texto TESTE escrito em B.')
    await abrirColecao(B.page, 'Coleção TESTE comum')
    await subir(B.page, 'CA00003', 2)
    await expect.poll(() => ordemNaTela(B.page)).toEqual(['CA00003', 'CA00001', 'CA00002'])
    await B.page.goto('#/sincronizacao')
    await expect(estadoDaSync(B.page)).toContainText('Sem internet')
    // "Vai subir" diz o que é cada registro, não o id (A-11).
    const vaiSubir = B.page.getByRole('region', { name: 'Vai subir' })
    await expect(vaiSubir).toContainText('Nota em CA00001 — alterada')
    await expect(vaiSubir).toContainText('Coleção «Coleção TESTE comum» — alterada')
    await expect(vaiSubir).not.toContainText('NT-zzzzzzzz-1')
    await foto(B.page, '4-b-vai-subir')
    await semRolagemHorizontal(B.page, 'Sincronização sem internet em B')
    // Nada chegou ao Dropbox enquanto os dois estavam sem internet (revisão 1 da Tarefa 17a, m2), nem pedindo para sincronizar.
    await B.page.getByRole('button', { name: 'Salvar e sincronizar' }).first().click()
    await expect(estadoDaSync(B.page)).toContainText('Sem internet')
    expect(pedidosAoDropbox(dropbox)).toEqual(antesDoOffline)

    // 2. A volta primeiro e sincroniza; depois B, que recebe a edição de A sobre o mesmo campo e avisa qual valeu.
    await A.context.setOffline(false)
    await sincronizar(A.page)
    await expect.poll(() => aparelhosNoDiario(dropbox).filter((x) => x !== 'zzzzzzzz').length).toBe(1)
    // O contador vê os pedidos (o negativo acima não passa só por ele estar parado).
    expect(pedidosAoDropbox(dropbox).A ?? 0).toBeGreaterThan(antesDoOffline.A ?? 0)
    const idA = aparelhosNoDiario(dropbox).find((x) => x !== 'zzzzzzzz')!
    await expect.poll(() => diarioDe(dropbox, idA)).toContain('Texto TESTE escrito em A.')
    await semNadaPorEnviar(A.page)

    await B.context.setOffline(false)
    await sincronizar(B.page)
    await semNadaPorEnviar(B.page)
    // B baixou o segmento novo de A (o do outro aparelho), e não o próprio.
    expect(dropbox.leituras.some((l) => l.quem === 'B' && l.caminho.startsWith(`usuario/diario/${idA}/`))).toBe(true)
    const idB = aparelhosNoDiario(dropbox).find((x) => x !== 'zzzzzzzz' && x !== idA)!
    expect(idB).toMatch(/^[a-z0-9]{8}$/)
    expect(dropbox.leituras.filter((l) => l.caminho.startsWith(`usuario/diario/${idB}/`) && l.quem === 'B')).toEqual([])
    const historicoB = B.page.getByRole('region', { name: 'Histórico recente' })
    await expect(historicoB).toContainText('Mesmo campo nos dois aparelhos')
    await expect(historicoB).toContainText(/Nota em CA00001: valeu a deste aparelho \(\d\d:\d\d\); a do outro aparelho ficou guardada no histórico/)
    await expect(historicoB).not.toContainText('NT-zzzzzzzz-1')
    await foto(B.page, '5-b-mesmo-campo', historicoB)
    await semRolagemHorizontal(B.page, 'Sincronização com o aviso em B')

    // 3. A sincroniza de novo e recebe a de B. Os dois mostram o mesmo: a nota de B e a ordem de B.
    await sincronizar(A.page)
    for (const x of [A, B]) {
      await x.page.goto('#/item/CA00001')
      await expect(notaDoObjeto(x.page)).toContainText('Texto TESTE escrito em B.', { timeout: 30_000 })
      await expect(notaDoObjeto(x.page)).not.toContainText('Texto TESTE escrito em A.')
      await abrirColecao(x.page, 'Coleção TESTE comum')
      await expect.poll(() => ordemNaTela(x.page), { timeout: 30_000 }).toEqual(['CA00003', 'CA00001', 'CA00002'])
      await semRolagemHorizontal(x.page, `coleção em ${x.nome}`)
    }

    // 4. A versão que perdeu está no histórico do campo (a cópia de segurança leva todas as escritas, a última vale).
    for (const x of [A, B]) {
      const copia = await copiaDeSeguranca(x.page)
      const nota = copia.estado.registros.find((r) => r.tipo === 'nota' && r.id === 'NT-zzzzzzzz-1')!
      expect(nota.campos.texto!.map((e) => e.valor)).toEqual(['Nota TESTE de partida.', 'Texto TESTE escrito em A.', 'Texto TESTE escrito em B.'])
      const colecao = copia.estado.registros.find((r) => r.tipo === 'colecao' && r.id === 'CO-zzzzzzzz-1')!
      const ordens = colecao.campos['i:CA00003']!.map((e) => e.valor) as number[]
      // A de partida, a de A (perdeu) e as duas de B (a última vale: antes de CA00001, que está em 1024).
      expect(ordens).toHaveLength(4)
      expect(ordens[0]).toBe(3072)
      expect(ordens[1]).toBeGreaterThan(1024)
      expect(ordens[1]).toBeLessThan(2048)
      expect(ordens[3]).toBeLessThan(1024)
    }
  } finally {
    await encerrar(dropbox, A, B)
  }
})

test('Foco 4: os dois criam um objeto CA sem internet e consolidam ao mesmo tempo; nenhum número repetido, o provisório é marcado e o aviso aparece', async ({ browser }, info) => {
  test.setTimeout(240_000)
  const dropbox = dropboxDeDois()
  // Um estado.json já existe (A o grava ao abrir): as consolidações seguintes são `update` com o rev lido.
  semear(dropbox, [{ tipo: 'nota', reg: 'NT-zzzzzzzz-1', op: 'criar', campos: { texto: 'Nota TESTE de partida.', alvoTipo: 'objeto', alvo: 'CA00003', rascunho: false } }])
  const A = await aparelho(browser, info, dropbox, 'A')
  const B = await aparelho(browser, info, dropbox, 'B')
  try {
    await entrar(A.page)
    await semNadaPorEnviar(A.page)
    await expect.poll(() => dropbox.enviados.has('usuario/estado.json'), { timeout: 30_000 }).toBe(true)
    await entrar(B.page)
    await B.page.goto('#/item/CA00003')
    await expect(notaDoObjeto(B.page)).toContainText('Nota TESTE de partida.', { timeout: 45_000 })
    await semNadaPorEnviar(B.page)

    // 1. Sem internet, A cria primeiro e B depois: os dois mostram CA00005, provisório.
    await A.context.setOffline(true)
    await B.context.setOffline(true)
    await novoObjeto(A.page, 'Selo TESTE criado em A.', null)
    const antesDoOffline = pedidosAoDropbox(dropbox)
    await expect(A.page.getByTestId('objeto-cabeca')).toContainText('CA00005')
    await expect(A.page.getByTestId('objeto-cabeca')).toContainText('provisório')
    await novoObjeto(B.page, 'Selo TESTE criado em B.', null)
    const cabecaB = B.page.getByTestId('objeto-cabeca')
    await expect(cabecaB).toContainText('CA00005')
    await expect(cabecaB).toContainText('provisório')
    const urlDeB = B.page.url()
    await foto(B.page, '6-b-provisorio')
    await semRolagemHorizontal(B.page, 'objeto provisório em B')
    // Nada chegou ao Dropbox enquanto os dois estavam sem internet (m2).
    expect(pedidosAoDropbox(dropbox)).toEqual(antesDoOffline)

    // 2. O estado.json de A fica preso no caminho até B gravar o seu. Com um limite (m3): abaixo dos 20 s do prazo do app
    //    (src/dropbox/prazo.ts), para o app nunca abortar o pedido segurado; se o limite vencer, o teste falha dizendo isso.
    let soltar!: () => void
    const solto = new Promise<void>((ok) => (soltar = ok))
    let preso = false
    let soltoPeloLimite = false
    dropbox.aoEnviar = async ({ quem, caminho }) => {
      if (quem === 'A' && caminho === 'usuario/estado.json' && !preso) {
        preso = true
        let limite: ReturnType<typeof setTimeout> | undefined
        await Promise.race([
          solto,
          new Promise<void>((ok) => {
            limite = setTimeout(() => {
              soltoPeloLimite = true
              ok()
            }, LIMITE_DO_ENVIO_PRESO_MS)
          }),
        ])
        clearTimeout(limite)
      }
      return undefined
    }
    await A.context.setOffline(false)
    await sincronizar(A.page)
    await expect.poll(() => preso, { timeout: 30_000 }).toBe(true)

    // 3. B volta e sincroniza: lê o segmento de A (o objeto de A é mais antigo) e grava o estado.json com o rev que leu.
    await B.context.setOffline(false)
    await sincronizar(B.page)
    await expect
      .poll(() => dropbox.escritas.filter((e) => e.quem === 'B' && e.caminho === 'usuario/estado.json' && e.modo === 'update' && e.resultado === 'ok').length, {
        message: `B grava o estado.json enquanto o de A está preso (no máximo ${LIMITE_DO_ENVIO_PRESO_MS / 1000} s)`,
        timeout: LIMITE_DO_ENVIO_PRESO_MS,
      })
      .toBeGreaterThan(0)
    expect(soltoPeloLimite, `B levou mais de ${LIMITE_DO_ENVIO_PRESO_MS / 1000} s para gravar o estado.json: o envio de A foi solto antes`).toBe(false)
    soltar()

    // 4. O `update` de A com o rev antigo dá 409; A relê o de B. Ninguém repete número.
    await expect.poll(() => dropbox.escritas.some((e) => e.quem === 'A' && e.caminho === 'usuario/estado.json' && e.resultado === 'conflito'), { timeout: 30_000 }).toBe(true)
    await semNadaPorEnviar(A.page)
    await semNadaPorEnviar(B.page)
    const estado = JSON.parse(dropbox.enviados.get('usuario/estado.json')!.toString('utf8')) as { numeros?: Record<string, string> }
    const numeros = Object.entries(estado.numeros ?? {}).filter(([k]) => /^OB-/.test(k)).map(([, v]) => v)
    expect(numeros.sort()).toEqual(['CA00005', 'CA00006'])

    // 5. A (o mais antigo) fica com CA00005; B recebe CA00006, sem a marca, e vê o aviso.
    await B.page.goto(urlDeB.slice(urlDeB.indexOf('#')))
    await expect(cabecaB).toContainText('CA00006', { timeout: 30_000 })
    await expect(cabecaB).not.toContainText('provisório')
    await expect(B.page.getByRole('status').filter({ hasText: 'Era CA00005 quando foi salvo; outro aparelho deu esse número a outro objeto antes. O número agora é CA00006.' })).toBeVisible()
    await foto(B.page, '7-b-numero-mudou')
    await semRolagemHorizontal(B.page, 'objeto com número trocado em B')
    for (const x of [A, B]) {
      await x.page.goto('#/item/CA00005')
      await expect(x.page.getByRole('heading', { level: 1, name: 'Selo TESTE criado em A.' })).toBeVisible({ timeout: 30_000 })
      await expect(x.page.getByTestId('objeto-cabeca')).not.toContainText('provisório')
      await x.page.goto('#/item/CA00006')
      await expect(x.page.getByRole('heading', { level: 1, name: 'Selo TESTE criado em B.' })).toBeVisible({ timeout: 30_000 })
      await x.page.goto('#/colecoes')
      const meus = x.page.getByRole('region', { name: 'Meus objetos' })
      await expect(meus.getByRole('link', { name: /CA00005/ })).toHaveCount(1)
      await expect(meus.getByRole('link', { name: /CA00006/ })).toHaveCount(1)
      await expect(meus).not.toContainText('provisório')
      await semRolagemHorizontal(x.page, `Meus objetos em ${x.nome}`)
    }
  } finally {
    await encerrar(dropbox, A, B)
  }
})

test('a rede cai no meio do envio de um segmento (o arquivo chega, a resposta não): nada se perde nem se duplica', async ({ browser }, info) => {
  test.setTimeout(180_000)
  const dropbox = dropboxDeDois()
  const A = await aparelho(browser, info, dropbox, 'A')
  const B = await aparelho(browser, info, dropbox, 'B')
  try {
    await entrar(A.page)
    let cortes = 0
    dropbox.aoEnviar = ({ quem, caminho }) => {
      if (quem === 'A' && caminho.startsWith('usuario/diario/') && cortes === 0) {
        cortes++
        return 'cortar-depois'
      }
      return undefined
    }
    await A.page.goto('#/item/CA00004')
    await escreverNota(A.page, 'Nota TESTE que sobe com a rede caindo.')
    await sincronizar(A.page)
    await semNadaPorEnviar(A.page)
    expect(cortes).toBe(1)
    // O segmento chegou uma vez só (o reenvio com o mesmo nome e o mesmo conteúdo foi aceito como o mesmo arquivo).
    const [idA] = aparelhosNoDiario(dropbox)
    const segmentos = [...dropbox.enviados.keys()].filter((c) => c.startsWith(`usuario/diario/${idA}/`))
    expect(diarioDe(dropbox, idA!).split('Nota TESTE que sobe com a rede caindo.').length - 1).toBe(1)
    const cortado = dropbox.escritas.find((e) => e.resultado === 'cortado')!
    expect(segmentos).toContain(cortado.caminho)
    expect(dropbox.escritas.filter((e) => e.caminho === cortado.caminho).map((e) => e.resultado)).toEqual(['cortado', 'ok'])

    await entrar(B.page)
    await B.page.goto('#/item/CA00004')
    await expect(notaDoObjeto(B.page)).toHaveCount(1, { timeout: 45_000 })
    await expect(notaDoObjeto(B.page)).toContainText('Nota TESTE que sobe com a rede caindo.')
    await semRolagemHorizontal(B.page, 'item em B')
  } finally {
    await encerrar(dropbox, A, B)
  }
})

test('só com a permissão de leitura: a Sincronização diz que faltam permissões, lista as três e pede para entrar de novo', async ({ page, dropbox }) => {
  dropbox.usuarioReal = true
  dropbox.escopos = ['files.content.read']
  await entrar(page)
  await page.goto('#/sincronizacao')
  await expect(estadoDaSync(page)).toContainText('Falta uma permissão do Dropbox', { timeout: 30_000 })
  await expect(estadoDaSync(page)).toContainText('files.content.read, files.content.write e files.metadata.read')
  await expect(estadoDaSync(page)).toContainText('Entrar de novo')
  await expect(page.locator('.sync-bloco').getByRole('button', { name: 'Entrar de novo' })).toBeVisible()
  await semRolagemHorizontal(page, 'Sincronização sem permissão')
  // Nada foi escrito (sem a permissão de escrita, o Dropbox recusou antes).
  expect(dropbox.enviados.size).toBe(0)
})
