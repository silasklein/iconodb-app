import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { expect, test } from './fixtures'
import { escreverNota } from './notasNaTela'

/**
 * 2C, bloco 1, Tarefa 3: a tela «Excluídos» (`#/excluidos`), nos dois tamanhos (e com movimento reduzido), sobre o pacote
 * sintético TESTE. Exclui pela interface uma nota, uma região, uma coleção e um objeto SKC (com foto, nota e coleção); a tela os
 * mostra por tipo; «Restaurar» abre a aprovação no lugar (foco em «Cancelar»; «Cancelar» não grava); o «Restaurar» da caixa
 * restaura, a linha sai e a mensagem diz «Restaurado: …» com «Ver». Com SHOTS_DIR definido, guarda capturas.
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
async function abrirMenu(page: Page) {
  if (celular(page)) {
    await page.goto('#/')
    await page.getByRole('button', { name: 'Abrir o menu' }).click()
  } else {
    await page.getByRole('button', { name: 'Menu' }).click()
  }
  return page.getByRole('dialog', { name: 'Menu' })
}
/** Cria uma coleção pela folha «Adicionar à coleção» do objeto aberto. */
async function novaColecao(page: Page, nome: string) {
  await page.getByRole('button', { name: 'Adicionar à coleção' }).click()
  const folha = page.getByRole('dialog', { name: 'Adicionar à coleção' })
  await folha.getByLabel('Nova coleção').fill(nome)
  await folha.getByRole('button', { name: 'Criar' }).click()
  await expect(folha.getByRole('checkbox', { name: `Incluir em ${nome}` })).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(folha).toHaveCount(0)
}

test('Excluídos: a lista por tipo, a aprovação antes de restaurar, Cancelar não grava, a mensagem com «Ver»', async ({ page, dropbox }, info) => {
  test.setTimeout(180_000)
  dropbox.usuarioReal = true
  await entrar(page)
  const imagem = noDisco(info, 'foto-sintetica.jpg', await fotoSintetica(page))

  // 1. Um objeto com foto, confirmado (CA00005), uma nota e a coleção «Selos para comparar»; outra coleção, que vai ser excluída.
  await page.goto('#/objeto/novo')
  await page.getByLabel('Tipo e descrição curta').fill('Selo sintético de teste. Pedra.')
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
  const endereco = new URL(page.url()).hash
  await escreverNota(page, 'Nota sintética sobre o selo.')
  await novaColecao(page, 'Selos para comparar')
  await novaColecao(page, 'Coleção de teste para excluir')

  // 2. Excluir a coleção pela página dela.
  await page.goto('#/colecoes')
  await page.getByRole('region', { name: 'Minhas coleções' }).getByRole('link', { name: /Coleção de teste para excluir/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Coleção de teste para excluir' })).toBeVisible()
  await page.getByRole('button', { name: 'Excluir coleção' }).click()
  await expect(page.getByRole('button', { name: 'Restaurar coleção' })).toBeVisible()

  // 3. Uma nota num objeto do livro, excluída pela tela da nota.
  await page.goto('#/item/CA00001')
  await expect(page.getByTestId('item-cabeca')).toContainText('CA00001')
  await escreverNota(page, 'Nota de teste para excluir.')
  await page.goto('#/notas')
  await page.getByRole('link', { name: /Nota de teste para excluir\./ }).click()
  await expect(page).toHaveURL(/#\/nota\/NT-/)
  await page.getByRole('button', { name: 'Excluir nota' }).click()
  await expect(page.getByText('Nota excluída.')).toBeVisible()

  // 4. Uma região desenhada numa foto do livro e excluída no painel do visualizador (o painel é do computador).
  const tamanho = page.viewportSize()!
  const noCelular = celular(page)
  if (noCelular) await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('#/imagem/IMG-TESTE-0001-1?desenhar=EL-900002')
  const camada = page.getByTestId('desenho-camada')
  await expect(camada).toBeVisible()
  const caixa = (await camada.boundingBox())!
  for (const [x, y] of [[0.2, 0.2], [0.6, 0.2], [0.6, 0.6], [0.2, 0.6]] as const) await page.mouse.click(caixa.x + caixa.width * x, caixa.y + caixa.height * y)
  await page.getByRole('button', { name: 'Concluir a região' }).click()
  await page.getByRole('button', { name: 'Salvar a região' }).click()
  await expect(page).toHaveURL(/#\/imagem\/IMG-TESTE-0001-1$/)
  const excluirRegiao = page.getByRole('button', { name: /^Excluir a região / })
  await expect(excluirRegiao).toHaveCount(1)
  const elemento = ((await excluirRegiao.getAttribute('aria-label')) ?? (await excluirRegiao.innerText())).replace(/^Excluir a região /, '')
  await excluirRegiao.click()
  await page.getByRole('group', { name: /^Excluir a região / }).getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByText(`Região excluída: ${elemento}.`)).toBeVisible()
  if (noCelular) await page.setViewportSize(tamanho)
  expect(page.viewportSize()).toEqual(tamanho)

  // 5. Excluir o objeto (a foto e a nota dele ficam guardadas e voltam com ele).
  await page.goto(endereco)
  await page.getByRole('button', { name: 'Excluir o objeto' }).click()
  await page.getByRole('group', { name: 'Excluir o objeto CA00005?' }).getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Objeto excluído.' })).toBeVisible()

  // 6. A tela, pelo Menu: «Excluídos», com «restaurar o que foi excluído».
  const menu = await abrirMenu(page)
  const entrada = menu.getByRole('link', { name: /Excluídos/ })
  await expect(entrada).toContainText('restaurar o que foi excluído')
  await entrada.click()
  await expect(page).toHaveURL(/#\/excluidos$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Excluídos' })).toBeVisible()
  await expect(page.getByText('O que você excluiu fica guardado e pode voltar.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Objetos SKC', 'Notas', 'Coleções', 'Regiões'])
  const objetos = page.getByRole('region', { name: 'Objetos SKC' })
  const notas = page.getByRole('region', { name: 'Notas' })
  const colecoes = page.getByRole('region', { name: 'Coleções' })
  const regioes = page.getByRole('region', { name: 'Regiões' })
  await expect(objetos.getByRole('link', { name: 'CA00005' })).toBeVisible()
  await expect(objetos).toContainText(/Selo sintético de teste\. Pedra\. · hoje, \d\d:\d\d/)
  await expect(notas.getByRole('link', { name: '«Nota de teste para excluir.»' })).toBeVisible()
  await expect(notas).toContainText(/nota em CA00001 · hoje, /)
  await expect(colecoes.getByRole('link', { name: 'Coleção de teste para excluir' })).toBeVisible()
  await expect(colecoes).toContainText(/coleção com 1 objeto · hoje, /)
  await expect(regioes).toContainText(elemento)
  await expect(regioes).toContainText(/região na foto de [A-Z]{2}\d{5} · hoje, /)
  // a foto e a nota do objeto não aparecem sozinhas: voltam com ele
  await expect(page.getByRole('region', { name: 'Fotos' })).toHaveCount(0)
  await expect(page.getByText('Nota sintética sobre o selo.')).toHaveCount(0)
  await semRolagemHorizontal(page, 'Excluídos (lista)')
  await alvosEFontes(page, page.getByRole('main'))
  await foto(page, 'excluidos-1-lista')

  // 7. Cancelar não grava: a caixa fecha, o foco volta ao botão, e a nota continua excluída (mesmo depois de recarregar).
  await notas.getByRole('button', { name: 'Restaurar' }).click()
  const caixaDaNota = notas.getByRole('group', { name: 'Restaurar a nota em CA00001?' })
  await expect(caixaDaNota).toHaveText(/^Restaurar a nota em CA00001\?/)
  await expect(caixaDaNota.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await caixaDaNota.getByRole('button', { name: 'Cancelar' }).click()
  await expect(caixaDaNota).toHaveCount(0)
  await expect(notas.getByRole('button', { name: 'Restaurar' })).toBeFocused()
  await page.reload()
  await expect(page.getByRole('region', { name: 'Notas' }).getByRole('link', { name: '«Nota de teste para excluir.»' })).toBeVisible()

  // 8. O objeto: a aprovação conta o que volta junto e para onde; só o «Restaurar» da caixa grava.
  await objetos.getByRole('button', { name: 'Restaurar' }).click()
  const aprovacao = objetos.getByRole('group', { name: 'Restaurar o objeto CA00005?' })
  await expect(aprovacao).toContainText(
    'Restaurar o objeto CA00005? Voltam com ele a foto e a nota. Ele volta às listas e à coleção «Selos para comparar», no mesmo lugar, com o mesmo número.',
  )
  await expect(aprovacao.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await expect(objetos.getByRole('button', { name: 'Restaurar' })).toHaveCount(1)
  await alvosEFontes(page, aprovacao)
  await semRolagemHorizontal(page, 'Excluídos (aprovação)')
  await foto(page, 'excluidos-2-aprovacao', aprovacao)
  await aprovacao.getByRole('button', { name: 'Restaurar' }).click()
  await expect(objetos).toHaveCount(0)
  const mensagem = page.getByRole('status', { name: 'Mensagem dos excluídos' })
  await expect(mensagem).toContainText('Restaurado: CA00005.')
  await expect(mensagem.getByRole('link', { name: 'Ver' })).toBeVisible()
  await semRolagemHorizontal(page, 'Excluídos (mensagem)')
  await foto(page, 'excluidos-3-mensagem')

  // «Ver» abre o objeto, de volta inteiro: a nota dele está lá e «Excluir o objeto» também.
  await mensagem.getByRole('link', { name: 'Ver' }).click()
  await expect(page).toHaveURL(new RegExp(`${endereco.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
  await expect(page.getByRole('button', { name: 'Excluir o objeto' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Leituras' })).toContainText('Nota sintética sobre o selo.')
  await page.goto('#/colecoes')
  await expect(page.getByRole('region', { name: 'Minhas coleções' }).getByRole('link', { name: /Selos para comparar/ })).toContainText('1')

  // 9. Restaurar o resto, cada um com a sua aprovação; vazia, a tela diz que não há nada.
  await page.goto('#/excluidos')
  const restaurarCom = async (grupo: Locator, pergunta: string | RegExp) => {
    await grupo.getByRole('button', { name: 'Restaurar' }).first().click()
    await grupo.getByRole('group', { name: pergunta }).getByRole('button', { name: 'Restaurar' }).click()
  }
  await restaurarCom(page.getByRole('region', { name: 'Notas' }), 'Restaurar a nota em CA00001?')
  await expect(page.getByRole('region', { name: 'Notas' })).toHaveCount(0)
  await expect(mensagem).toContainText('Restaurado: «Nota de teste para excluir.».')
  await restaurarCom(page.getByRole('region', { name: 'Coleções' }), 'Restaurar a coleção «Coleção de teste para excluir»?')
  await expect(mensagem).toContainText('Restaurado: Coleção de teste para excluir.')
  await restaurarCom(page.getByRole('region', { name: 'Regiões' }), /^Restaurar a região «.+» na foto de [A-Z]{2}\d{5}\?$/)
  await expect(mensagem).toContainText(`Restaurado: ${elemento}.`)
  await expect(page.getByText('Nada excluído. O que você excluir aparece aqui e pode ser restaurado.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Excluídos' })).toBeFocused()
  await semRolagemHorizontal(page, 'Excluídos (vazia)')
  await foto(page, 'excluidos-4-vazia')
})

test('Excluídos (revisão 1): a foto excluída de um objeto excluído, com «Restaurar o objeto», e a origem publicada', async ({ page, dropbox }, info) => {
  test.setTimeout(180_000)
  dropbox.usuarioReal = true
  // O aparelho que criou o sítio que o pipeline publicou (SI-teste123-1 → TESTE-3 no pacote sintético).
  const hlc = (n: number) => `${String(Date.now() - 60_000 + n).padStart(13, '0')}-0000-teste123`
  const linha = { v: 1, id: 'teste123-1-0', hlc: hlc(1), aparelho: 'teste123', tipo: 'sitio', reg: 'SI-teste123-1', op: 'criar', campos: { nome: 'Tell Usuário Teste' } }
  dropbox.enviados.set('usuario/diario/teste123/000001.jsonl', Buffer.from(`${JSON.stringify(linha)}\n`))
  await entrar(page)
  const imagem = noDisco(info, 'foto-sintetica.jpg', await fotoSintetica(page))

  // 1. Um objeto com foto, confirmado (CA00005); a foto é excluída pela folha «Editar a imagem», e depois o objeto.
  await page.goto('#/objeto/novo')
  await page.getByLabel('Tipo e descrição curta').fill('Selo sintético da foto. Pedra.')
  await page.locator(`input[type="file"][data-origem="${celular(page) ? 'fotos' : 'arquivos'}"]`).setInputFiles(imagem)
  await expect(page.getByRole('radio', { name: /^Foto \/ tons/ })).toBeChecked({ timeout: 20_000 })
  await page.getByRole('textbox', { name: 'Crédito / fonte' }).fill('foto própria')
  await page.getByRole('radiogroup', { name: 'Período' }).getByRole('radio', { name: /Calcolítico/ }).click()
  await page.getByRole('button', { name: /Salvar objeto CA00005/ }).first().click()
  await expect(page).toHaveURL(/#\/item\/(OB-[a-z0-9]{8}-\d+)/, { timeout: 30_000 })
  const cabeca = page.getByTestId('objeto-cabeca')
  await page.keyboard.press('Control+S')
  await expect(cabeca).not.toContainText('provisório', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Editar a imagem' }).click()
  await page.getByRole('dialog', { name: /^Editar a imagem SKC de / }).getByRole('button', { name: 'Excluir a imagem' }).click()
  await expect(page.getByText('Imagem excluída.')).toBeVisible()
  await page.getByRole('button', { name: 'Excluir o objeto' }).click()
  await page.getByRole('group', { name: 'Excluir o objeto CA00005?' }).getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Objeto excluído.' })).toBeVisible()

  // 2. O sítio que veio de você é excluído na página do livro (sai dos livros na próxima importação).
  await page.goto('#/sitio/TESTE-3')
  const bloco = page.getByRole('region', { name: 'Este sítio veio de você' })
  await expect(bloco).toBeVisible({ timeout: 30_000 })
  await bloco.getByRole('button', { name: 'Excluir o seu sítio' }).click()
  await bloco.getByRole('group', { name: 'Excluir o seu sítio «Tell Usuário Teste»?' }).getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(bloco.getByRole('status')).toContainText('Sai dos livros na próxima importação.')

  // 3. Na tela: a foto com «o objeto dela também está excluído» e «Restaurar o objeto»; o sítio com «sai dos livros…».
  await page.goto('#/excluidos')
  const fotos = page.getByRole('region', { name: 'Fotos' })
  const sitios = page.getByRole('region', { name: 'Sítios' })
  await expect(fotos).toContainText(/foto de CA00005 · o objeto dela também está excluído · hoje, \d\d:\d\d/)
  await expect(fotos.getByRole('button', { name: 'Restaurar o objeto' })).toBeVisible()
  await expect(sitios.getByRole('link', { name: 'Tell Usuário Teste' })).toBeVisible()
  await expect(sitios).toContainText(/sai dos livros na próxima importação · hoje, \d\d:\d\d/)
  await alvosEFontes(page, page.getByRole('main'))
  await semRolagemHorizontal(page, 'Excluídos (foto e publicado)')
  await foto(page, 'excluidos-5-foto-do-objeto', fotos)

  // A aprovação da foto avisa que ela fica escondida; Cancelar. «Restaurar o objeto» restaura só o objeto.
  await fotos.getByRole('button', { name: 'Restaurar', exact: true }).click()
  const caixaDaFoto = fotos.getByRole('group', { name: /^Restaurar a foto .* de CA00005\?$/ })
  await expect(caixaDaFoto).toContainText(/^Restaurar a foto .* de CA00005\? Ela fica escondida até o objeto voltar\./)
  await expect(caixaDaFoto.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await semRolagemHorizontal(page, 'Excluídos (aprovação da foto)')
  await foto(page, 'excluidos-5b-restaurar-a-foto', caixaDaFoto)
  await caixaDaFoto.getByRole('button', { name: 'Cancelar' }).click()
  await fotos.getByRole('button', { name: 'Restaurar o objeto' }).click()
  const caixaDoObjeto = fotos.getByRole('group', { name: 'Restaurar o objeto CA00005?' })
  await expect(caixaDoObjeto).toContainText('Restaurar o objeto CA00005? Ele volta às listas, com o mesmo número.')
  await expect(caixaDoObjeto.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await foto(page, 'excluidos-6-restaurar-o-objeto', caixaDoObjeto)
  await caixaDoObjeto.getByRole('button', { name: 'Restaurar' }).click()
  const mensagem = page.getByRole('status', { name: 'Mensagem dos excluídos' })
  await expect(mensagem).toContainText('Restaurado: CA00005.')
  await expect(page.getByRole('region', { name: 'Objetos SKC' })).toHaveCount(0)
  await expect(fotos.getByRole('button', { name: 'Restaurar o objeto' })).toHaveCount(0)
  await expect(fotos).toContainText(/foto de CA00005 · hoje, /)

  // 4. A origem publicada: a aprovação diz que continua nos livros com o mesmo TESTE-3.
  await foto(page, 'excluidos-7a-publicado-linha', sitios)
  await sitios.getByRole('button', { name: 'Restaurar' }).click()
  const caixaDoSitio = sitios.getByRole('group', { name: 'Restaurar o sítio «Tell Usuário Teste»?' })
  await expect(caixaDoSitio).toContainText(
    'Restaurar o sítio «Tell Usuário Teste»? Ele continua nos livros, com o mesmo TESTE-3, e os objetos e notas ligados a ele voltam a se ligar a ele.',
  )
  await semRolagemHorizontal(page, 'Excluídos (aprovação do publicado)')
  // T3-e: «TESTE-3» numa linha só (não quebra no hífen)
  const numero = caixaDoSitio.getByText('TESTE-3', { exact: true })
  expect(await numero.evaluate((el) => [getComputedStyle(el).whiteSpace, el.getClientRects().length])).toEqual(['nowrap', 1])
  await foto(page, 'excluidos-7-publicado', caixaDoSitio)
  await caixaDoSitio.getByRole('button', { name: 'Restaurar' }).click()
  await expect(mensagem).toContainText('Restaurado: Tell Usuário Teste.')
  await expect(sitios).toHaveCount(0)
})

test('P4 (aprovação): a região de um objeto SKC ainda excluído: a aprovação diz que ela fica escondida até o objeto voltar', async ({ page, dropbox }) => {
  dropbox.usuarioReal = true
  // Outro aparelho (sintético) criou um objeto SKC e uma região numa foto dele; excluiu a região e depois o objeto.
  const hlc = (n: number) => `${String(Date.now() - 60_000 + n).padStart(13, '0')}-0000-teste789`
  const ob = 'OB-teste789-1'
  const linhas = [
    { tipo: 'objeto', reg: ob, op: 'criar', campos: { origemTipo: 'publicacao', periodo: 'CA', titulo: 'Selo sintético de outro aparelho. Pedra.' } },
    {
      tipo: 'regiao',
      reg: 'RG-teste789-1',
      op: 'criar',
      campos: { imagem: 'IM-teste789-1', objeto: ob, elemento: 'leão de teste', elementoId: null, pai: null, seletor: '<polygon points="0.2,0.2 0.6,0.2 0.6,0.6"/>' },
    },
    { tipo: 'regiao', reg: 'RG-teste789-1', op: 'excluir', campos: {} },
    { tipo: 'objeto', reg: ob, op: 'excluir', campos: {} },
  ].map((l, i) => ({ v: 1, id: `teste789-1-${i}`, hlc: hlc(i + 1), aparelho: 'teste789', ...l }))
  dropbox.enviados.set('usuario/diario/teste789/000001.jsonl', Buffer.from(linhas.map((l) => `${JSON.stringify(l)}\n`).join('')))
  await entrar(page)
  await page.goto('#/excluidos')
  const regioes = page.getByRole('region', { name: 'Regiões' })
  await expect(regioes).toContainText('leão de teste', { timeout: 30_000 })
  await expect(regioes).toContainText(/o objeto dela também está excluído/)
  await regioes.getByRole('button', { name: 'Restaurar', exact: true }).click()
  const caixa = regioes.getByRole('group', { name: /^Restaurar a região «leão de teste»/ })
  await expect(caixa).toContainText(/^Restaurar a região «leão de teste» na foto de .+\? Ela fica escondida até o objeto voltar\./)
  await expect(caixa.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await semRolagemHorizontal(page, 'Excluídos (aprovação da região)')
  await foto(page, 'excluidos-8-restaurar-a-regiao', caixa)
})
