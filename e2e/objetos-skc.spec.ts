import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Objetos SKC (Tarefa 9) pela tela, no navegador de verdade e nos dois tamanhos: criar um objeto com uma imagem (foto
 * sintética), ver o número provisório (sem internet), sincronizar e vê-lo confirmado (o estado.json do Dropbox simulado
 * passa a ter o mapa `numeros`, com o SKC, Nr.), achá-lo na busca (também por "SKC 1") e em Meus objetos, recarregar,
 * ligá-lo a um objeto SKC criado depois em outro aparelho (fica o principal: decisão 38) e a um objeto do livro (a tela
 * do principal mostra as leituras juntas e os "números nas fontes"). Com SHOTS_DIR definido, guarda as capturas.
 */
const celular = (page: Page) => (page.viewportSize()?.width ?? 0) < 768
async function foto(page: Page, nome: string, ver?: Locator) {
  const pasta = process.env.SHOTS_DIR
  if (!pasta) return
  mkdirSync(pasta, { recursive: true })
  await ver?.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: join(pasta, `${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}
const semRolagemHorizontal = async (page: Page, tela: string) => {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}

/** Uma "foto" sintética (degradê com ruído: tons, não traço), feita pelo próprio navegador. */
async function fotoSintetica(page: Page): Promise<Buffer> {
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
  return Buffer.from(base64, 'base64')
}
function noDisco(info: TestInfo, nome: string, bytes: Buffer): string {
  const pasta = join(info.project.outputDir, 'arquivos-sinteticos', info.testId)
  mkdirSync(pasta, { recursive: true })
  const caminho = join(pasta, nome)
  writeFileSync(caminho, bytes)
  return caminho
}

async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}

test('criar um objeto SKC com imagem: provisório sem internet, confirmado ao sincronizar, na busca e em Meus objetos, e depois de recarregar', async ({ page, context, dropbox }, info) => {
  dropbox.usuarioReal = true
  await entrar(page)
  const imagem = noDisco(info, 'foto-sintetica.jpg', await fotoSintetica(page))

  // 1. Novo objeto: "Salvar objeto" sem período mostra o erro em linha e leva o foco aos períodos.
  await page.goto('#/objeto/novo')
  await expect(page.getByRole('heading', { level: 1, name: /Novo objeto/ })).toBeVisible()
  await page.getByLabel('Tipo e descrição curta').fill('Selo sintético de teste. Pedra.')
  await page.getByRole('button', { name: /Salvar objeto/ }).first().click()
  await expect(page.getByRole('alert')).toContainText('Escolha o período para dar o número.')
  const periodos = page.getByRole('radiogroup', { name: 'Período' })
  await expect(periodos).toHaveAttribute('aria-invalid', 'true')
  expect(await periodos.evaluate((g) => g.contains(document.activeElement))).toBe(true)
  await foto(page, 'objeto-1-novo-erro', periodos)
  await semRolagemHorizontal(page, 'NovoObjeto')

  // 2. A imagem (foto: tons, não invertida), o período (o número provisório), a origem e a leitura.
  await page.locator(`input[type="file"][data-origem="${celular(page) ? 'fotos' : 'arquivos'}"]`).setInputFiles(imagem)
  await expect(page.getByRole('radio', { name: /^Foto \/ tons/ })).toBeChecked({ timeout: 20_000 })
  await page.getByRole('textbox', { name: 'Crédito / fonte' }).fill('foto própria')
  await periodos.getByRole('radio', { name: /Calcolítico/ }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByTestId('numero-novo')).toContainText('CA00005')
  await expect(page.getByTestId('numero-novo')).toContainText('provisório')
  await expect(page.getByTestId('numero-novo')).toContainText('SKC: 1') // decisão 38
  await page.getByRole('radio', { name: /Achado recente/ }).check()
  await page.getByLabel(/Nota do achado/).fill('visto numa vitrine, 2026')
  await page.getByRole('textbox', { name: /^Leitura/ }).fill('Leitura sintética: dois quadrúpedes afrontados.')
  await foto(page, 'objeto-2-novo-preenchido', periodos)

  // 3. Sem internet: salva, abre a tela do objeto com o número provisório.
  await context.setOffline(true)
  await page.getByRole('button', { name: /Salvar objeto CA00005/ }).first().click()
  await expect(page).toHaveURL(/#\/item\/OB-[a-z0-9]{8}-\d+/)
  const cabeca = page.getByTestId('objeto-cabeca')
  await expect(cabeca).toContainText('CA00005')
  await expect(cabeca).toContainText('provisório')
  // Decisão 38: "números nas fontes" sob o número; sem ligação, só o SKC, Nr.
  await expect(cabeca.getByTestId('numeros-nas-fontes')).toHaveText('SKC: 1 (provisório)')
  await expect(page.getByRole('heading', { level: 1, name: 'Selo sintético de teste. Pedra.' })).toBeVisible()
  const imagemDoObjeto = page.getByRole('region', { name: 'Imagem' }).first().getByRole('img', { name: /^Imagem 1 de CA00005$/ })
  await expect(imagemDoObjeto).toBeVisible()
  await foto(page, 'objeto-3-skc-provisorio')
  await semRolagemHorizontal(page, 'ObjetoSKC')

  // 4. Volta a internet e "Salvar e sincronizar": o número se confirma no estado.json (mapa `numeros`) e a marca some.
  await context.setOffline(false)
  await page.keyboard.press('Control+S')
  await expect(cabeca).not.toContainText('provisório', { timeout: 30_000 })
  await expect(cabeca).toContainText('CA00005')
  await expect(cabeca.getByTestId('numeros-nas-fontes')).toHaveText('SKC: 1')
  const estado = JSON.parse(dropbox.enviados.get('usuario/estado.json')!.toString('utf8')) as { numeros?: Record<string, string> }
  // O número e o SKC, Nr. confirmados na mesma escrita do estado.json.
  expect(Object.values(estado.numeros ?? {}).sort()).toEqual(['1', 'CA00005'])
  expect(Object.keys(estado.numeros ?? {}).some((k) => /^SKC:OB-[a-z0-9]{8}-\d+$/.test(k))).toBe(true)
  await foto(page, 'objeto-4-skc-confirmado')

  // 5. Na busca e em Meus objetos.
  await page.goto('#/busca?q=sint%C3%A9tico')
  await expect(page.getByRole('link', { name: /CA00005 · SKC/ }).first()).toBeVisible()
  await page.goto('#/busca?q=SKC%201')
  await expect(page.getByRole('link', { name: /CA00005 · SKC/ }).first()).toBeVisible()
  await page.goto('#/colecoes')
  const meus = page.getByRole('region', { name: 'Meus objetos' })
  await expect(meus.getByRole('link', { name: /CA00005/ })).toBeVisible()
  await expect(meus.getByRole('link', { name: /CA00005/ })).toContainText('SKC: 1')
  await expect(meus).not.toContainText('provisório')
  await foto(page, 'objeto-5-meus-objetos', meus)

  // 6. Recarregar: continua confirmado (o mapa de confirmados fica no IndexedDB).
  await page.goto('#/item/CA00005')
  await page.reload()
  await expect(page.getByTestId('objeto-cabeca')).toContainText('CA00005')
  await expect(page.getByTestId('objeto-cabeca')).not.toContainText('provisório')
  await expect(page.getByRole('region', { name: 'Leituras' })).toContainText('dois quadrúpedes afrontados')

  // 7. Outro aparelho criou um objeto SKC DEPOIS (um segmento dele no Dropbox): sincronizar o traz como CA00006,
  //    SKC: 2. Ligar CA00005 a ele: o dado primeiro (CA00005) fica o principal (decisão 38), sem sair da tela, e a
  //    linha das fontes junta os dois SKC, Nr. sob um prefixo (decisão 39).
  const hlc = `${String(Date.now() + 60_000).padStart(13, '0')}-0000-zzzzzzzz`
  const outro = { v: 1, id: 'zzzzzzzz-1-0', hlc, aparelho: 'zzzzzzzz', tipo: 'objeto', reg: 'OB-zzzzzzzz-1', op: 'criar', campos: { periodo: 'CA', pedido: 'CA00006', pedidoNrSkc: '2', origemTipo: 'achado', titulo: 'Selo sintético de outro aparelho.', achado: 'o mesmo selo, fotografado de novo', leitura: 'Leitura do outro aparelho.' } }
  dropbox.enviados.set('usuario/diario/zzzzzzzz/000001.jsonl', Buffer.from(`${JSON.stringify(outro)}\n`))
  await page.keyboard.press('Control+S')
  await page.goto('#/item/CA00006')
  await expect(page.getByTestId('objeto-cabeca')).toContainText('CA00006', { timeout: 30_000 })
  await expect(page.getByTestId('numeros-nas-fontes')).toHaveText('SKC: 2', { timeout: 30_000 })
  await page.goto('#/item/CA00005')
  await page.getByRole('button', { name: 'Ligar a um objeto existente' }).click()
  await page.getByLabel('Número do outro objeto').fill('CA00006')
  await page.getByRole('button', { name: 'Ligar', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'CA00005 é o principal' })).toBeVisible()
  await expect(page).toHaveURL(/#\/item\/CA00005$/)
  await expect(page.getByTestId('numeros-nas-fontes')).toHaveText('SKC: 1, 2')
  await expect(page.getByRole('region', { name: 'Leituras' })).toContainText('Leitura do outro aparelho.')
  await foto(page, 'objeto-6-skc-ligado', page.getByTestId('objeto-cabeca'))
  await semRolagemHorizontal(page, 'ObjetoSKC ligado')
  await page.goto('#/item/CA00006')
  await expect(page).toHaveURL(/#\/item\/CA00005$/)

  // 8. Ligar ao objeto do livro CA00001 (IPIAO I no app real: sem data de atribuição, estava no banco antes): o livro
  //    é o principal, mostra as leituras juntas e a linha "TESTE I: 1 · SKC: 1, 2" (decisão 39); CA00005 redireciona.
  await page.getByRole('button', { name: 'Ligar a um objeto existente' }).click()
  await page.getByLabel('Número do outro objeto').fill('CA00001')
  await page.getByRole('button', { name: 'Ligar', exact: true }).click()
  await expect(page).toHaveURL(/#\/item\/CA00001$/)
  const leituras = page.getByRole('region', { name: 'Leituras' })
  await expect(leituras).toContainText('dois quadrúpedes afrontados')
  await expect(page.getByRole('status').filter({ hasText: 'está ligado a CA00001' })).toBeVisible()
  await expect(page.getByTestId('item-cabeca').getByTestId('numeros-nas-fontes')).toHaveText('TESTE I: 1 · SKC: 1, 2')
  await foto(page, 'objeto-7-ligado-ao-livro', leituras.getByText('dois quadrúpedes afrontados'))
  await semRolagemHorizontal(page, 'Item ligado')
  await page.goto('#/item/CA00005')
  await expect(page).toHaveURL(/#\/item\/CA00001$/)
})

test('T17-B-27: a ficha vazia («Ainda não sei» o período) não encosta na borda esquerda', async ({ page }) => {
  await entrar(page)
  await page.goto('#/objeto/novo')
  await page.getByLabel('Tipo e descrição curta').fill('Selo sintético sem ficha.')
  await page.getByRole('radio', { name: /Ainda não sei/ }).click()
  await page.getByRole('button', { name: /Salvar rascunho/ }).first().click()
  await expect(page).toHaveURL(/#\/item\/OB-[a-z0-9]{8}-\d+/)
  const nota = page.getByText(/^Ficha vazia:/)
  await expect(nota).toBeVisible()
  const caixa = (await nota.boundingBox())!
  // celular: a mesma margem da ficha (24 px); computador: a coluna já tem a sua
  expect(caixa.x).toBeGreaterThanOrEqual(celular(page) ? 16 : 1)
  await foto(page, 'objeto-ficha-vazia', nota)
  await semRolagemHorizontal(page, 'ficha vazia')
})
