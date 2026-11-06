import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { expect, test } from './fixtures'
import { escreverNota } from './notasNaTela'

/**
 * 2C, bloco 1, Tarefa 2: «Excluir o objeto» no fim da página de um objeto SKC, nos dois tamanhos (e com movimento reduzido),
 * sobre o pacote sintético TESTE: o objeto com uma foto e uma nota, numa coleção; a confirmação no lugar (foco em «Cancelar»,
 * texto que conta o que fica guardado e o número reservado); «Objeto excluído. Restaurar»; o objeto some de Meus objetos, da
 * coleção e da busca; a nota continua em «Minhas notas» com o alvo «(excluído)»; o endereço do objeto continua abrindo;
 * «Restaurar» devolve tudo, a linha da coleção no mesmo lugar. Com SHOTS_DIR definido, guarda capturas.
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
/** Cada botão do bloco: alvo de 44 px no toque e 36 px com o mouse; texto de 12 px ou mais. */
async function alvosEFontes(page: Page, bloco: Locator) {
  const minimo = celular(page) ? 44 : 36
  for (const b of await bloco.getByRole('button').all()) {
    const caixa = (await b.boundingBox())!
    expect(Math.min(caixa.width, caixa.height), await b.innerText()).toBeGreaterThanOrEqual(minimo - 0.5)
  }
  const menor = await bloco.evaluate((el) => Math.min(...[el, ...el.querySelectorAll('*')].filter((x) => (x.textContent ?? '').trim() && !(x instanceof SVGElement)).map((x) => parseFloat(getComputedStyle(x).fontSize))))
  expect(menor).toBeGreaterThanOrEqual(12)
}

/** Uma "foto" sintética (degradê com ruído), feita pelo próprio navegador. */
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

test('excluir o objeto SKC: a confirmação no lugar, o aviso, o que some e o que fica, e Restaurar', async ({ page, dropbox }, info) => {
  test.setTimeout(120_000)
  dropbox.usuarioReal = true
  await entrar(page)
  const imagem = noDisco(info, 'foto-sintetica.jpg', await fotoSintetica(page))

  // 1. Um objeto com foto, confirmado (CA00005), uma nota e uma coleção.
  await page.goto('#/objeto/novo')
  await page.getByLabel('Tipo e descrição curta').fill('Selo sintético de excluir. Pedra.')
  await page.locator(`input[type="file"][data-origem="${celular(page) ? 'fotos' : 'arquivos'}"]`).setInputFiles(imagem)
  await expect(page.getByRole('radio', { name: /^Foto \/ tons/ })).toBeChecked({ timeout: 20_000 })
  await page.getByRole('textbox', { name: 'Crédito / fonte' }).fill('foto própria')
  await page.getByRole('radiogroup', { name: 'Período' }).getByRole('radio', { name: /Calcolítico/ }).click()
  await page.getByRole('button', { name: /Salvar objeto CA00005/ }).first().click()
  await expect(page).toHaveURL(/#\/item\/(OB-[a-z0-9]{8}-\d+)/, { timeout: 30_000 })
  const cabeca = page.getByTestId('objeto-cabeca')
  await expect(cabeca).toContainText('CA00005')
  await page.keyboard.press('Control+S')
  await expect(cabeca).not.toContainText('provisório', { timeout: 30_000 })
  const endereco = new URL(page.url()).hash // #/item/OB-…
  await escreverNota(page, 'Nota sintética sobre o selo.')
  await page.getByRole('button', { name: 'Adicionar à coleção' }).click()
  const folha = page.getByRole('dialog', { name: 'Adicionar à coleção' })
  await folha.getByLabel('Nova coleção').fill('Selos de excluir')
  await folha.getByRole('button', { name: 'Criar' }).click()
  await expect(folha.getByRole('checkbox', { name: 'Incluir em Selos de excluir' })).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(folha).toHaveCount(0)

  // 2. O botão no fim da página, depois das notas e das ligações; o objeto do livro não tem.
  const gatilho = page.getByRole('button', { name: 'Excluir o objeto' })
  await expect(gatilho).toBeVisible()
  await foto(page, 'excluir-objeto-1-botao', gatilho)
  await semRolagemHorizontal(page, 'ObjetoSKC (botão)')
  const posicao = await page.evaluate(() => {
    const botao = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Excluir o objeto')!
    const notas = document.querySelector('[aria-label="Leituras"]')!
    const ligacoes = [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Este objeto aparece num livro?')!
    return { aposNotas: !!(notas.compareDocumentPosition(botao) & Node.DOCUMENT_POSITION_FOLLOWING), aposLigacoes: !!(ligacoes.compareDocumentPosition(botao) & Node.DOCUMENT_POSITION_FOLLOWING) }
  })
  expect(posicao).toEqual({ aposNotas: true, aposLigacoes: true })

  // 3. A confirmação: o texto conta a foto e a nota que ficam guardadas e o número reservado; o foco vai a Cancelar.
  await gatilho.click()
  const confirmar = page.getByRole('group', { name: 'Excluir o objeto CA00005?' })
  await expect(confirmar).toContainText('Excluir o objeto CA00005? A foto e a nota dele ficam guardadas e voltam se você restaurar. O número CA00005 fica reservado para ele.')
  await expect(confirmar.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await alvosEFontes(page, confirmar)
  await semRolagemHorizontal(page, 'ObjetoSKC (confirmação)')
  await foto(page, 'excluir-objeto-2-confirmar', confirmar)
  // Cancelar devolve o foco ao botão e não exclui
  await confirmar.getByRole('button', { name: 'Cancelar' }).click()
  await expect(confirmar).toHaveCount(0)
  await expect(gatilho).toBeFocused()
  await gatilho.click()
  await expect(confirmar.getByRole('button', { name: 'Cancelar' })).toBeFocused()

  // 4. Excluir: o aviso com «Restaurar» (e o foco nele); a página continua abrindo.
  await confirmar.getByRole('button', { name: 'Excluir', exact: true }).click()
  const aviso = page.getByRole('status').filter({ hasText: 'Objeto excluído.' })
  await expect(aviso).toHaveText(/Objeto excluído\.\s*Restaurar/)
  const restaurar = aviso.getByRole('button', { name: 'Restaurar' })
  await expect(restaurar).toBeFocused()
  // o foco se vê (pelo teclado, o anel aparece)
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(restaurar).toBeFocused()
  expect(await restaurar.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none')
  await expect(page.getByRole('button', { name: 'Excluir o objeto' })).toHaveCount(0)
  await semRolagemHorizontal(page, 'ObjetoSKC (excluído)')
  await foto(page, 'excluir-objeto-3-depois', aviso)

  // 5. O objeto some de Meus objetos, da coleção e da busca; a nota fica em Minhas notas com o alvo «(excluído)».
  await page.goto('#/colecoes')
  const meus = page.getByRole('region', { name: 'Meus objetos' })
  await expect(meus.getByRole('link', { name: /Novo objeto/ })).toBeVisible()
  await expect(meus).not.toContainText('CA00005')
  await expect(meus).toContainText('Nenhum objeto SKC ainda')
  await foto(page, 'excluir-objeto-4-meus-objetos', meus)
  const colecoes = page.getByRole('region', { name: 'Minhas coleções' })
  await expect(colecoes.getByRole('link', { name: /Selos de excluir/ })).toContainText('0')
  await colecoes.getByRole('link', { name: /Selos de excluir/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Selos de excluir' })).toBeVisible()
  await expect(page.getByText('Nenhum objeto ainda.')).toBeVisible()
  await expect(page.getByText('CA00005')).toHaveCount(0)
  await page.goto('#/busca?q=sint%C3%A9tico%20de%20excluir')
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /CA00005/ })).toHaveCount(0)
  await page.goto('#/notas')
  const linhaDaNota = page.getByRole('link', { name: /Nota sintética sobre o selo\./ })
  await expect(linhaDaNota).toContainText('CA00005 (excluído)')
  await foto(page, 'excluir-objeto-5-minhas-notas', linhaDaNota)

  // 6. Pelo endereço antigo: nada quebra, mostra o aviso; Restaurar devolve tudo.
  await page.goto(`${endereco}`)
  await expect(page.getByRole('status').filter({ hasText: 'Objeto excluído.' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Selo sintético de excluir. Pedra.' })).toBeVisible()
  await page.getByRole('button', { name: 'Restaurar' }).click()
  await expect(page.getByRole('button', { name: 'Excluir o objeto' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Objeto excluído.' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Leituras' })).toContainText('Nota sintética sobre o selo.')
  await page.goto('#/colecoes')
  await expect(page.getByRole('region', { name: 'Meus objetos' }).getByRole('link', { name: /CA00005/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Minhas coleções' }).getByRole('link', { name: /Selos de excluir/ })).toContainText('1')

  // 7. Pelo teclado: o botão se alcança com Tab e abre a confirmação com Enter (o foco em Cancelar); Escape não exclui.
  await page.goto(endereco)
  await expect(page.getByRole('button', { name: 'Excluir o objeto' })).toBeVisible()
  await page.getByRole('button', { name: 'Excluir o objeto' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('group', { name: 'Excluir o objeto CA00005?' }).getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('group', { name: 'Excluir o objeto CA00005?' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Excluir o objeto' })).toBeFocused()
})

test('o objeto de um livro não tem «Excluir o objeto»', async ({ page }) => {
  await entrar(page)
  await page.goto('#/item/CA00001')
  await expect(page.getByTestId('item-cabeca')).toContainText('CA00001')
  await expect(page.getByRole('button', { name: 'Excluir o objeto' })).toHaveCount(0)
})
