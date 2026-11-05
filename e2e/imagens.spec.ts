import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Imagens do usuário (decisão 33) no navegador de verdade (worker com OffscreenCanvas, createImageBitmap, OPFS,
 * Cache Storage, IndexedDB), pela tela, nos dois tamanhos: adicionar uma imagem sintética no item, vê-la na hora
 * (cópia local), subir ao Dropbox simulado em usuario/imagens/<IM-…>/ (original byte a byte, tela e miniatura),
 * recarregar e vê-la de novo. E o Foco 5: uma foto de 8000 × 6000 é processada sem tarefa longa na thread principal.
 * Com SHOTS_DIR definido, guarda capturas da tela nessa pasta.
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
  await page.screenshot({ path: join(pasta, `${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}

/**
 * Um JPEG sintético feito pelo próprio navegador (nada de imagem de livro): papel branco com linhas pretas (um
 * "desenho de traço"), do tamanho pedido. Volta como bytes para o teste entregá-lo ao <input type="file">.
 */
async function jpegSintetico(page: Page, largura: number, altura: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ([l, a]) => {
      const c = new OffscreenCanvas(l, a)
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, l, a)
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = Math.max(2, Math.round(l / 400))
      const passo = Math.round(l / 12)
      for (let x = passo / 2; x < l; x += passo) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x + a / 3, a)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(l / 2, a / 2, a / 3, 0, Math.PI * 2)
      ctx.stroke()
      const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let s = ''
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return btoa(s)
    },
    [largura, altura] as const,
  )
  return Buffer.from(base64, 'base64')
}

/**
 * O arquivo vai ao <input> por um caminho no disco, como o seletor de arquivos faria. (Com `buffer`, o Playwright
 * monta o File dentro da página decodificando base64 em JavaScript, o que é ele mesmo uma tarefa longa de ~100 ms
 * para uma foto de 48 MP e sujaria a medida do Foco 5.)
 */
function noDisco(info: TestInfo, nome: string, bytes: Buffer): string {
  // Uma pasta de nome só ASCII: o Chromium não acha o arquivo quando o caminho tem acento (o nome do teste tem "lá").
  const pasta = join(info.project.outputDir, 'arquivos-sinteticos', info.testId)
  mkdirSync(pasta, { recursive: true })
  const caminho = join(pasta, nome)
  writeFileSync(caminho, bytes)
  return caminho
}

/** Mede as tarefas longas (Long Tasks API, > 50 ms) e o maior intervalo entre quadros (requestAnimationFrame). */
async function comecarAMedir(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __longas: number[]; __maiorIntervalo: number; __medindo: boolean }
    w.__longas = []
    w.__maiorIntervalo = 0
    w.__medindo = true
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) w.__longas.push(e.duration)
    }).observe({ type: 'longtask' })
    let antes = performance.now()
    const quadro = (agora: number) => {
      w.__maiorIntervalo = Math.max(w.__maiorIntervalo, agora - antes)
      antes = agora
      if (w.__medindo) requestAnimationFrame(quadro)
    }
    requestAnimationFrame(quadro)
  })
}
async function pararDeMedir(page: Page): Promise<{ longas: number[]; maiorIntervalo: number }> {
  return page.evaluate(() => {
    const w = window as unknown as { __longas: number[]; __maiorIntervalo: number; __medindo: boolean }
    w.__medindo = false
    return { longas: w.__longas, maiorIntervalo: w.__maiorIntervalo }
  })
}

async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}

const painel = (page: Page) => page.getByRole('region', { name: 'Imagem' }).first()

test('adicionar uma imagem sintética no item: aparece na hora, sobe para usuario/imagens/ e continua lá depois de recarregar', async ({ page, dropbox }, info) => {
  await entrar(page)
  const original = await jpegSintetico(page, 1200, 900)
  await page.goto('#/item/CA00001')
  await expect(painel(page).getByText('1 / 2')).toBeVisible()

  // 1. Abrir "Adicionar imagem" (o ícone do painel) e escolher o arquivo.
  await painel(page).getByRole('button', { name: 'Adicionar imagem' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Adicionar imagem a CA00001' })
  await expect(dialogo).toBeVisible()
  if (celular(page)) await expect(dialogo.getByRole('button', { name: /Tirar foto/ })).toBeVisible()
  else await expect(dialogo.getByText('Arraste imagens aqui ou escolha arquivos')).toBeVisible()
  await foto(page, 'imagens-1-adicionar')
  await page.locator(`input[type="file"][data-origem="${celular(page) ? 'galeria' : 'arquivos'}"]`).setInputFiles(noDisco(info, 'desenho-sintetico.jpg', original))

  // 2. Processada no aparelho: a prévia, e o Tipo detectado pela regra do pipeline (linhas pretas em papel branco: traço).
  await expect(dialogo.getByRole('img', { name: /Prévia da imagem escolhida|desenho-sintetico/ }).first()).toBeVisible({ timeout: 20_000 })
  await expect(dialogo.getByRole('radio', { name: /^Desenho de traço/ })).toBeChecked()
  await expect(dialogo.getByText('detectado')).toBeVisible()
  await dialogo.getByRole('button', { name: 'Adicionar', exact: true }).click()
  // Sem crédito: o erro no campo, sem fechar.
  await expect(dialogo.getByRole('alert')).toContainText('de onde vem a imagem')
  await dialogo.getByRole('textbox', { name: 'Crédito / fonte' }).fill('foto própria')
  await dialogo.getByRole('textbox', { name: 'Legenda (opcional)' }).fill('desenho de teste')
  await foto(page, 'imagens-2-detalhes')
  await semRolagemHorizontal(page, 'Adicionar imagem')
  await dialogo.getByRole('button', { name: 'Adicionar', exact: true }).click()
  await expect(dialogo).toHaveCount(0)

  // 3. Na hora, pela cópia local: a terceira imagem do objeto, invertida (traço), com a marca SKC e o crédito.
  const nova = painel(page).getByRole('img', { name: 'Imagem 3 de CA00001, invertida' })
  await expect(nova).toBeVisible()
  await expect.poll(() => nova.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1200)
  await expect(painel(page).getByText('foto própria · desenho de teste')).toBeVisible()
  await expect(painel(page).getByText('SKC', { exact: true })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Aviso' })).toContainText('Imagem adicionada')
  await foto(page, 'imagens-3-item-livro-e-usuario', painel(page))
  await semRolagemHorizontal(page, 'Item com a imagem nova')

  // T17-C-8: com «Imagem adicionada» ainda na tela, a mensagem de «Comparar» não a cobre: as duas ficam à vista, uma sobre a outra.
  await page.getByRole('button', { name: /^Comparar \(/ }).click()
  const avisoDaImagem = page.getByRole('status', { name: 'Aviso' })
  const avisoDaComparacao = page.getByRole('status', { name: 'Mensagem da comparação' })
  await expect(avisoDaComparacao).toContainText('entrou na comparação')
  await expect(avisoDaImagem).toContainText('Imagem adicionada')
  const [a, b] = [(await avisoDaImagem.boundingBox())!, (await avisoDaComparacao.boundingBox())!]
  expect(a.y + a.height, 'as duas mensagens do pé não se sobrepõem').toBeLessThanOrEqual(b.y + 0.5)
  expect(b.y + b.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) + 0.5)
  await foto(page, 'imagens-3b-duas-mensagens-do-pe')

  // 4. Salvar e sincronizar: os três arquivos sobem para usuario/imagens/<IM-…>/; o original é o arquivo escolhido, byte a byte.
  await page.keyboard.press('Control+S')
  await expect.poll(() => [...dropbox.enviados.keys()].filter((c) => c.startsWith('usuario/imagens/')).length, { timeout: 30_000 }).toBe(3)
  const caminhos = [...dropbox.enviados.keys()].filter((c) => c.startsWith('usuario/imagens/')).sort()
  const id = /^usuario\/imagens\/(IM-[a-z0-9]{8}-\d+)\//.exec(caminhos[0]!)![1]!
  expect(caminhos).toEqual([`usuario/imagens/${id}/miniatura.webp`, `usuario/imagens/${id}/original.jpg`, `usuario/imagens/${id}/tela.webp`])
  expect(dropbox.enviados.get(`usuario/imagens/${id}/original.jpg`)!.equals(original)).toBe(true)
  // A tela é WebP de verdade (RIFF....WEBP) com o lado maior de no máximo 1600 px.
  const tela = dropbox.enviados.get(`usuario/imagens/${id}/tela.webp`)!
  expect(tela.subarray(0, 4).toString('latin1')).toBe('RIFF')
  expect(tela.subarray(8, 12).toString('latin1')).toBe('WEBP')
  // E o evento `imagem` subiu num segmento do diário.
  await expect.poll(() => [...dropbox.enviados.entries()].some(([c, b]) => c.startsWith('usuario/diario/') && b.toString('utf8').includes(`"reg":"${id}"`)), { timeout: 30_000 }).toBe(true)
  expect([...dropbox.enviados.keys()].every((c) => c.startsWith('usuario/'))).toBe(true)

  // 5. Recarregar: continua lá (a cópia de tela foi para o Cache Storage depois de confirmada).
  await page.reload()
  await expect(painel(page).locator('.imagem-item-paginas').getByText('1 / 3')).toBeVisible()
  await painel(page).getByRole('button', { name: 'Imagem anterior' }).click()
  const depois = painel(page).getByRole('img', { name: 'Imagem 3 de CA00001, invertida' })
  await expect(depois).toBeVisible()
  await expect.poll(() => depois.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1200)

  // 6. O visualizador abre a imagem do usuário.
  await painel(page).getByRole('link', { name: 'Ampliar a imagem' }).click()
  await expect(page).toHaveURL(new RegExp(`#/imagem/${id}`))
  await expect(page.getByText('CA00001 · 3/3')).toBeVisible()
  const ampliada = page.getByRole('img', { name: 'Imagem 3 de CA00001, invertida' })
  await expect(ampliada).toBeVisible()
  await expect.poll(() => ampliada.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1200)
  await expect(page.getByText('foto própria · desenho de teste')).toBeVisible()
  await foto(page, 'imagens-4-visualizador')
})

test('Foco 5: uma foto de 8000 × 6000 é reduzida no worker sem nenhuma tarefa longa na thread principal', async ({ page }, info) => {
  await entrar(page)
  // Feita antes de medir (desenhar e gravar 48 MP é, isso sim, uma tarefa longa, do próprio teste).
  const grande = noDisco(info, 'IMG_8000x6000.jpg', await jpegSintetico(page, 8000, 6000))
  await page.goto('#/item/CA00002')
  await painel(page).getByRole('button', { name: 'Adicionar imagem' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Adicionar imagem a CA00002' })
  await expect(dialogo).toBeVisible()

  // A medida (o "proxy" documentado): do momento em que o arquivo é escolhido até a prévia aparecer, nenhuma tarefa
  // longa (> 50 ms, Long Tasks API) na thread principal e os quadros continuam saindo.
  await comecarAMedir(page)
  const inicio = Date.now()
  await page.locator(`input[type="file"][data-origem="${celular(page) ? 'galeria' : 'arquivos'}"]`).setInputFiles(grande)
  await expect(dialogo.getByRole('img', { name: 'Prévia da imagem escolhida' }).first()).toBeVisible({ timeout: 30_000 })
  const duracao = Date.now() - inicio
  const { longas, maiorIntervalo } = await pararDeMedir(page)
  console.log(`[foco 5, worker] ${page.viewportSize()?.width}px: ${duracao} ms; tarefas longas ${JSON.stringify(longas.map(Math.round))}; maior intervalo entre quadros ${Math.round(maiorIntervalo)} ms`)
  expect(longas, 'tarefas longas na thread principal').toEqual([])
  expect(maiorIntervalo).toBeLessThan(150)
  // O tamanho original vem do cabeçalho (sem decodificar a foto inteira).
  if (!celular(page)) await expect(dialogo.getByText(/8\.000 × 6\.000 px/)).toBeVisible()
  else await expect(dialogo.getByRole('radio', { name: /^Desenho de traço/ })).toBeChecked()
})

test('Foco 5 sem OffscreenCanvas (Safari anterior ao 16.4): a thread principal processa em passos curtos', async ({ page }, info) => {
  await entrar(page)
  const grande = noDisco(info, 'IMG_8000x6000.jpg', await jpegSintetico(page, 8000, 6000))
  // Daqui em diante, a página não tem OffscreenCanvas: o app processa na thread principal (ambienteDaPagina).
  await page.addInitScript(() => {
    delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas
  })
  await page.reload()
  await page.goto('#/item/CA00002')
  await painel(page).getByRole('button', { name: 'Adicionar imagem' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Adicionar imagem a CA00002' })
  await expect(dialogo).toBeVisible()
  const workers: string[] = []
  page.on('worker', (w) => workers.push(w.url()))
  await comecarAMedir(page)
  const inicio = Date.now()
  await page.locator(`input[type="file"][data-origem="${celular(page) ? 'galeria' : 'arquivos'}"]`).setInputFiles(grande)
  await expect(dialogo.getByRole('img', { name: 'Prévia da imagem escolhida' }).first()).toBeVisible({ timeout: 30_000 })
  const duracao = Date.now() - inicio
  const { longas, maiorIntervalo } = await pararDeMedir(page)
  console.log(`[foco 5, thread principal] ${page.viewportSize()?.width}px: ${duracao} ms; tarefas longas ${JSON.stringify(longas.map(Math.round))}; maior intervalo entre quadros ${Math.round(maiorIntervalo)} ms`)
  expect(workers.filter((u) => u.includes('processar.worker'))).toEqual([])
  // Aqui o Chromium decodifica a foto (pedida já reduzida) dentro de uma tarefa da página: medidas de 90 a 470 ms
  // conforme a carga da máquina. É o caminho de reserva (Safari anterior ao 16.4); o limite só garante que a tela
  // não congele: nenhuma tarefa de 1 s ou mais.
  expect(Math.max(0, ...longas)).toBeLessThan(1000)
  await expect(dialogo.getByRole('radio', { name: /^Desenho de traço/ })).toBeChecked()
})

/** Um JPEG de ruído (comprime mal): passa de 8 MB, o limite acima do qual o original sobe em partes. */
async function jpegDeRuido(page: Page, largura: number, altura: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ([l, a]) => {
      const c = new OffscreenCanvas(l, a)
      const ctx = c.getContext('2d')!
      const dados = ctx.createImageData(l, a)
      let x = 12345
      for (let i = 0; i < dados.data.length; i += 4) {
        x = (x * 1103515245 + 12345) & 0x7fffffff
        dados.data[i] = x & 255
        dados.data[i + 1] = (x >> 8) & 255
        dados.data[i + 2] = (x >> 16) & 255
        dados.data[i + 3] = 255
      }
      ctx.putImageData(dados, 0, 0)
      const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 })
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let s = ''
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return btoa(s)
    },
    [largura, altura] as const,
  )
  return Buffer.from(base64, 'base64')
}

test('revisão 1 (I1): um original acima de 8 MB sobe em partes (upload_session) e chega inteiro, byte a byte', async ({ page, dropbox }, info) => {
  await entrar(page)
  const original = await jpegDeRuido(page, 4000, 3000)
  expect(original.length).toBeGreaterThan(8 * 1024 * 1024)
  await page.goto('#/item/CA00003')
  await painel(page).getByRole('button', { name: 'Adicionar imagem' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Adicionar imagem a CA00003' })
  await page.locator(`input[type="file"][data-origem="${celular(page) ? 'galeria' : 'arquivos'}"]`).setInputFiles(noDisco(info, 'ruido.jpg', original))
  await expect(dialogo.getByRole('img', { name: 'Prévia da imagem escolhida' }).first()).toBeVisible({ timeout: 30_000 })
  await dialogo.getByRole('textbox', { name: 'Crédito / fonte' }).fill('foto própria')
  await dialogo.getByRole('button', { name: 'Adicionar', exact: true }).click()
  await expect(dialogo).toHaveCount(0)
  await page.keyboard.press('Control+S')
  await expect.poll(() => [...dropbox.enviados.keys()].some((c) => /^usuario\/imagens\/IM-[a-z0-9]{8}-\d+\/original\.jpg$/.test(c)), { timeout: 60_000 }).toBe(true)
  const caminho = [...dropbox.enviados.keys()].find((c) => c.endsWith('/original.jpg'))!
  expect(dropbox.enviados.get(caminho)!.equals(original)).toBe(true)
  expect(dropbox.sessoes.iniciadas).toBe(1)
  expect(dropbox.sessoes.concluidas).toBe(1)
  expect(dropbox.sessoes.partes).toBe(Math.ceil(original.length / (4 * 1024 * 1024)) - 1)
  // A rodada não ficou presa: a sincronização diz que está tudo enviado.
  await expect.poll(async () => page.evaluate(() => document.querySelector('[aria-label*="por enviar"]') === null), { timeout: 30_000 }).toBe(true)
})
