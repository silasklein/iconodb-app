import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Browser, BrowserContext, Locator, Page, TestInfo } from '@playwright/test'
import { ligarDropboxSimulado, novoDropboxSimulado, type DropboxSimulado } from './dropboxSimulado'
import { expect, test, vigiarCsp } from './fixtures'
import { escreverNota } from './notasNaTela'
import { consolidar, fundir } from '../src/usuario/fusao'
import type { Evento } from '../src/usuario/eventos'

/**
 * «Restaurar a partir de uma cópia» (2C, bloco 1, Tarefa 7; especificação §6.2) no navegador de verdade, com dois perfis
 * (dois contextos: cada um com o seu IndexedDB, OPFS e id de aparelho), como e2e/dois-aparelhos.spec.ts, mas cada um com o
 * SEU Dropbox simulado:
 *
 * 1. No perfil A: uma nota, uma coleção e um objeto SKC com foto; sincroniza; baixa a cópia completa (.zip).
 * 2. No perfil B, com o Dropbox simulado VAZIO: um arquivo que não é cópia dá o erro; a cópia completa mostra o resumo (nada
 *    mudou ainda); «Restaurar» traz a nota, a coleção, o objeto (com o mesmo número) e a foto, e tudo sobe para o Dropbox de B
 *    (os eventos novos são de B; a foto com o mesmo id e os mesmos nomes).
 * 3. Restaurar de novo: «Esta cópia não tem nada que falte aqui.», sem «Restaurar» e sem eventos novos.
 * 4. Nenhuma violação de CSP, nenhum pedido para fora, nenhuma escrita fora de usuario/. Sem esperas fixas.
 *
 * Só dados sintéticos (TESTE). Com SHOTS_DIR definido, guarda capturas: antes de escolher, um erro, o resumo e o pronto.
 */

interface Perfil {
  nome: string
  context: BrowserContext
  page: Page
  csp: string[]
  dropbox: DropboxSimulado
}

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
  await page.screenshot({ path: join(pasta, `restaurar-${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}

/** Um Dropbox simulado novo e só deste perfil, com usuario/ de verdade (a listagem do que foi enviado). */
function dropboxProprio(): DropboxSimulado {
  const d = novoDropboxSimulado()
  d.usuarioReal = true
  return d
}

async function perfil(browser: Browser, info: TestInfo, nome: string): Promise<Perfil> {
  const u = info.project.use
  const context = await browser.newContext({ baseURL: u.baseURL, viewport: u.viewport, hasTouch: u.hasTouch, isMobile: u.isMobile, serviceWorkers: u.serviceWorkers, acceptDownloads: true })
  const csp = await vigiarCsp(context)
  const dropbox = dropboxProprio()
  await ligarDropboxSimulado(context, { compartilhado: dropbox, quem: nome })
  const page = await context.newPage()
  return { nome, context, page, csp, dropbox }
}

async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}

async function encerrar(...perfis: Perfil[]) {
  for (const p of perfis) await p.context.close()
  for (const p of perfis) {
    expect(p.csp, `violações da CSP em ${p.nome}`).toEqual([])
    expect(p.dropbox.proibidos, `pedidos que sairiam para a internet em ${p.nome}`).toEqual([])
    expect(
      p.dropbox.escritas.filter((e) => !e.caminho.startsWith('usuario/')),
      `escritas fora de usuario/ em ${p.nome}`,
    ).toEqual([])
  }
}

const estadoDaSync = (page: Page) => page.locator('.sync-estado-tela [role="status"]')

async function sincronizar(page: Page) {
  await page.goto('#/sincronizacao')
  await page.locator('.sync-corpo').getByRole('button', { name: 'Salvar e sincronizar' }).click()
}

/** Espera o perfil ficar sem nada por enviar (nem eventos nem imagens). */
async function semNadaPorEnviar(page: Page) {
  await page.goto('#/sincronizacao')
  await expect(estadoDaSync(page)).toHaveText(/Sincronizado.*Nada por enviar\./, { timeout: 45_000 })
}

/** Os ids dos aparelhos que têm diário no Dropbox. */
const aparelhosNoDiario = (dropbox: DropboxSimulado) => [...new Set([...dropbox.enviados.keys()].map((c) => /^usuario\/diario\/([a-z0-9]{8})\//.exec(c)?.[1]).filter(Boolean))] as string[]
const diarioDe = (dropbox: DropboxSimulado, id: string) =>
  [...dropbox.enviados.entries()]
    .filter(([c]) => c.startsWith(`usuario/diario/${id}/`))
    .map(([, b]) => b.toString('utf8'))
    .join('')
const imagensNoDropbox = (dropbox: DropboxSimulado) => [...dropbox.enviados.keys()].filter((c) => c.startsWith('usuario/imagens/')).sort()

/** Uma "foto" sintética (degradê com ruído), feita pelo próprio navegador e gravada no disco. */
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

/** Cria um objeto SKC do Calcolítico com foto pela tela. */
async function novoObjeto(page: Page, titulo: string, imagem: string): Promise<void> {
  await page.goto('#/objeto/novo')
  await expect(page.getByRole('heading', { level: 1, name: /Novo objeto/ })).toBeVisible()
  await page.getByLabel('Tipo e descrição curta').fill(titulo)
  await page.locator(`input[type="file"][data-origem="${celular(page) ? 'fotos' : 'arquivos'}"]`).setInputFiles(imagem)
  await expect(page.getByRole('radio', { name: /^Foto \/ tons/ })).toBeChecked({ timeout: 20_000 })
  await page.getByRole('textbox', { name: 'Crédito / fonte' }).fill('foto TESTE')
  await page.getByRole('radiogroup', { name: 'Período' }).getByRole('radio', { name: /Calcolítico/ }).click()
  await expect(page.getByTestId('numero-novo')).toContainText(/CA\d{5}/)
  await page.getByRole('radio', { name: /Achado recente/ }).check()
  await page.getByLabel(/Nota do achado/).fill('achado TESTE')
  await page.getByRole('textbox', { name: /^Leitura/ }).fill(`Leitura TESTE de ${titulo}`)
  await page.getByRole('button', { name: /^Salvar objeto CA\d{5}/ }).first().click()
  await expect(page).toHaveURL(/#\/item\/OB-[a-z0-9]{8}-\d+/)
}

const notaDoObjeto = (page: Page) => page.getByRole('region', { name: 'Leituras' }).getByRole('group', { name: 'SKC notas' }).getByRole('article')
const secaoRestaurar = (page: Page) => page.getByRole('region', { name: 'Restaurar a partir de uma cópia' })
const mensagem = (page: Page) => page.getByRole('status', { name: 'Mensagem da exportação' })
const resumo = (page: Page) => secaoRestaurar(page).getByRole('group', { name: 'Resumo da restauração' })

/** «Escolher a cópia» abre o seletor de arquivo do sistema; escolhe `arquivo` nele. */
async function escolherACopia(page: Page, arquivo: string) {
  const [seletor] = await Promise.all([page.waitForEvent('filechooser'), secaoRestaurar(page).getByRole('button', { name: 'Escolher a cópia' }).click()])
  expect(seletor.isMultiple()).toBe(false)
  await seletor.setFiles(arquivo)
}

// A não deu nome ao aparelho (o nome padrão): «feita em outro aparelho». Só a data e a hora variam.
const RESUMO = /^Cópia de \d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}h\d{2}, feita em outro aparelho\. Vai trazer de volta 1 nota, 1 coleção, 1 objeto SKC e 1 foto que faltam aqui\. O que você mudou depois dessa data continua valendo\.$/
const PRONTO = 'Restaurado: 1 nota, 1 coleção, 1 objeto SKC e 1 foto. Sobe na próxima sincronização.'

test('a cópia completa de um perfil restaurada num perfil novo com o Dropbox vazio: tudo volta e sobe; de novo, nada a trazer', async ({ browser }, info) => {
  test.setTimeout(300_000)
  const A = await perfil(browser, info, 'A')
  const B = await perfil(browser, info, 'B')
  try {
    // 1. A: nota, coleção, objeto SKC com foto; sincroniza; baixa a cópia completa.
    await entrar(A.page)
    await A.page.goto('#/item/CA00001')
    await escreverNota(A.page, 'Nota TESTE para restaurar.')
    await expect(notaDoObjeto(A.page)).toContainText('Nota TESTE para restaurar.')
    await A.page.getByRole('button', { name: 'Adicionar à coleção' }).click()
    const folha = A.page.getByRole('dialog', { name: 'Adicionar à coleção' })
    await folha.getByLabel('Nova coleção').fill('Coleção TESTE para restaurar')
    await folha.getByRole('button', { name: 'Criar' }).click()
    await expect(folha.getByRole('checkbox', { name: 'Incluir em Coleção TESTE para restaurar' })).toBeChecked()
    await folha.getByRole('button', { name: 'Fechar' }).click()
    await expect(folha).toHaveCount(0)
    await novoObjeto(A.page, 'Selo TESTE para restaurar.', await fotoSintetica(A.page, info))
    await expect(A.page.getByTestId('objeto-cabeca')).toContainText('CA00005')

    await sincronizar(A.page)
    await semNadaPorEnviar(A.page)
    const [idA] = aparelhosNoDiario(A.dropbox)
    expect(idA).toMatch(/^[a-z0-9]{8}$/)
    const imagensDeA = imagensNoDropbox(A.dropbox)
    expect(imagensDeA.map((c) => c.replace(/^usuario\/imagens\/IM-[a-z0-9]{8}-\d+\//, ''))).toEqual(expect.arrayContaining(['tela.webp', 'miniatura.webp', 'original.jpg']))

    await A.page.goto('#/copias')
    const [download] = await Promise.all([A.page.waitForEvent('download'), A.page.getByRole('button', { name: 'Baixar cópia completa' }).click()])
    expect(download.suggestedFilename()).toMatch(/^iconodb-copia-completa-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/)
    const zip = join(info.project.outputDir, 'arquivos-sinteticos', info.testId, download.suggestedFilename())
    await download.saveAs(zip)

    // 2. B, com o Dropbox simulado vazio.
    await entrar(B.page)
    expect(B.dropbox.enviados.size === 0 || [...B.dropbox.enviados.keys()].every((c) => !c.startsWith('usuario/imagens/'))).toBe(true)
    await B.page.goto('#/copias')
    const secao = secaoRestaurar(B.page)
    await expect(secao.getByRole('heading', { level: 2, name: 'Restaurar a partir de uma cópia' })).toBeVisible()
    await expect(secao.getByText('Traz de volta o que está numa cópia e falta aqui. Nada é apagado: o que você mudou depois da data da cópia continua valendo.')).toBeVisible()
    await semRolagemHorizontal(B.page, 'Cópias e exportação, restaurar')
    await foto(B.page, '1-antes-de-escolher', secao)

    // Um arquivo que não é cópia: o erro, e nada muda.
    const outro = join(info.project.outputDir, 'arquivos-sinteticos', info.testId, 'outro.json')
    writeFileSync(outro, JSON.stringify({ formato: 'outra-coisa TESTE', versao: 1 }))
    await escolherACopia(B.page, outro)
    await expect(mensagem(B.page)).toHaveText('Este arquivo não é uma cópia do IconoDB.')
    await expect(resumo(B.page)).toHaveCount(0)
    await semRolagemHorizontal(B.page, 'erro da restauração')
    await foto(B.page, '2-erro', secao)

    // A cópia completa: o resumo, sem mudar nada; o foco em «Cancelar».
    await escolherACopia(B.page, zip)
    await expect(resumo(B.page).locator('p')).toHaveText(RESUMO, { timeout: 20_000 })
    await expect(resumo(B.page).getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await semRolagemHorizontal(B.page, 'resumo da restauração')
    await foto(B.page, '3-resumo', secao)

    await resumo(B.page).getByRole('button', { name: 'Restaurar' }).click()
    await expect(mensagem(B.page)).toHaveText(PRONTO, { timeout: 20_000 })
    await expect(secao.getByRole('button', { name: 'Escolher a cópia' })).toBeFocused()
    await semRolagemHorizontal(B.page, 'restaurado')
    await foto(B.page, '4-pronto', secao)

    // A nota, a coleção e o objeto (com o mesmo número e a foto) voltaram em B.
    await B.page.goto('#/item/CA00001')
    await expect(notaDoObjeto(B.page)).toContainText('Nota TESTE para restaurar.')
    await B.page.goto('#/colecoes')
    await expect(B.page.getByRole('region', { name: 'Minhas coleções' }).getByRole('link', { name: /Coleção TESTE para restaurar/ })).toBeVisible()
    await B.page.goto('#/item/CA00005')
    await expect(B.page.getByRole('heading', { level: 1, name: 'Selo TESTE para restaurar.' })).toBeVisible()
    const imagemEmB = B.page.getByRole('region', { name: 'Imagem' }).first().getByRole('img', { name: /^Imagem 1 de CA00005$/ })
    await expect(imagemEmB).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => imagemEmB.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0)

    // E sobem para o Dropbox de B: os eventos são de B (outro aparelho, ids dos registros de A); a foto com o mesmo id e nomes.
    await semNadaPorEnviar(B.page)
    await expect.poll(() => imagensNoDropbox(B.dropbox), { timeout: 45_000 }).toEqual(imagensDeA)
    for (const c of imagensDeA) expect(B.dropbox.enviados.get(c)!.equals(A.dropbox.enviados.get(c)!), c).toBe(true)
    const aparelhosDeB = aparelhosNoDiario(B.dropbox)
    expect(aparelhosDeB).toHaveLength(1)
    expect(aparelhosDeB[0]).not.toBe(idA)
    const diarioB = diarioDe(B.dropbox, aparelhosDeB[0]!)
    for (const t of ['Nota TESTE para restaurar.', 'Coleção TESTE para restaurar', 'Selo TESTE para restaurar.', 'CA00005', `IM-${idA}-`, `OB-${idA}-`]) expect(diarioB).toContain(t)
    await B.page.goto('#/item/CA00005')
    await expect(B.page.getByTestId('objeto-cabeca')).toContainText('CA00005')
    await expect(B.page.getByTestId('objeto-cabeca')).not.toContainText('provisório')

    // 3. A mesma cópia de novo: nada a trazer, sem «Restaurar» e sem eventos novos.
    const linhas = diarioB.split('\n').filter(Boolean).length
    await B.page.goto('#/copias')
    await escolherACopia(B.page, zip)
    await expect(resumo(B.page).locator('p')).toHaveText(/^Cópia de \d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}h\d{2}, feita em outro aparelho\. Esta cópia não tem nada que falte aqui\.$/, { timeout: 20_000 })
    await expect(resumo(B.page).getByRole('button', { name: 'Restaurar' })).toHaveCount(0)
    await resumo(B.page).getByRole('button', { name: 'Cancelar' }).click()
    await expect(secaoRestaurar(B.page).getByRole('button', { name: 'Escolher a cópia' })).toBeFocused()
    await sincronizar(B.page)
    await semNadaPorEnviar(B.page)
    expect(diarioDe(B.dropbox, aparelhosDeB[0]!).split('\n').filter(Boolean)).toHaveLength(linhas)
  } finally {
    await encerrar(A, B)
  }
})

test('P13 (aprovação): o resumo separa o que volta excluído («… que volta para Excluídos») e a mensagem depois também', async ({ page }, info) => {
  // Uma cópia de segurança sintética de outro aparelho: uma nota viva e outra excluída.
  const ap = 'teste321'
  const hlc = (n: number) => `${String(Date.now() - 3_600_000 + n).padStart(13, '0')}-0000-${ap}`
  const eventos = [
    { tipo: 'nota', reg: `NT-${ap}-1`, op: 'criar', campos: { texto: 'Nota TESTE que volta.', alvoTipo: 'objeto', alvo: 'CA00001' } },
    { tipo: 'nota', reg: `NT-${ap}-2`, op: 'criar', campos: { texto: 'Nota TESTE excluída.', alvoTipo: 'objeto', alvo: 'CA00001' } },
    { tipo: 'nota', reg: `NT-${ap}-2`, op: 'excluir', campos: {} },
  ].map((e, i) => ({ v: 1, id: `${ap}-1-${i}`, hlc: hlc(i + 1), aparelho: ap, ...e }) as Evento)
  const copia = {
    formato: 'iconodb-copia',
    versao: 1,
    geradoEm: new Date(Date.now() - 3_000_000).toISOString(),
    aparelho: { id: ap, nome: 'Mac' },
    aparelhos: { [ap]: 'Mac' },
    eventos,
    naoEnviados: [],
    base: null,
    estado: consolidar(fundir(eventos)),
    marcas: {},
    numerosConfirmados: {},
    imagens: [],
    observacoes: ['TESTE'],
  }
  const pasta = join(info.project.outputDir, 'arquivos-sinteticos', info.testId)
  mkdirSync(pasta, { recursive: true })
  const arquivo = join(pasta, 'iconodb-copia-teste.json')
  writeFileSync(arquivo, JSON.stringify(copia))

  await entrar(page)
  await page.goto('#/copias')
  await escolherACopia(page, arquivo)
  await expect(resumo(page).locator('p')).toHaveText(
    /^Cópia de \d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}h\d{2}, feita no Mac\. Vai trazer de volta 1 nota que falta aqui, e 1 nota que volta para Excluídos\. O que você mudou depois dessa data continua valendo\.$/,
  )
  await expect(resumo(page).getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await semRolagemHorizontal(page, 'resumo com excluídos')
  await foto(page, '5-resumo-com-excluidos', resumo(page))
  await resumo(page).getByRole('button', { name: 'Restaurar' }).click()
  await expect(mensagem(page)).toHaveText('Restaurado: 1 nota; 1 nota voltou para Excluídos. Sobe na próxima sincronização.')
  await page.goto('#/excluidos')
  await expect(page.getByRole('region', { name: 'Notas' })).toContainText('Nota TESTE excluída.')
})
