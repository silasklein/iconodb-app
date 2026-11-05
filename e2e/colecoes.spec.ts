import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Coleções SKC no navegador de verdade (worker, sqlite-wasm, IndexedDB), pela tela, nos dois tamanhos: criar uma
 * coleção na folha "Adicionar à coleção" do item, pôr dois outros objetos nela (de duas telas de item), abrir a
 * coleção, reordenar (teclado e arrastando), recarregar a página e achar a ordem e os membros onde ficaram.
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
/** Os números dos objetos na ordem em que a coleção os mostra. */
const ordemNaTela = async (page: Page) =>
  (await page.getByRole('list', { name: 'Itens da coleção' }).getByRole('button', { name: /^Mover / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.replace('Mover ', ''))))

test('criar uma coleção pela folha do item, pôr outros dois objetos, reordenar, recarregar: a ordem e os membros ficam', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()

  // 1. A aba SKC, ainda vazia: "Meus objetos" com o cartão "Novo objeto" e "Minhas coleções" com o estado vazio.
  await page.goto('#/colecoes')
  await expect(page.getByRole('region', { name: 'Meus objetos' }).getByRole('link', { name: /Novo objeto/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Minhas coleções' }).getByText(/Nenhuma coleção ainda/)).toBeVisible()
  await foto(page, 'colecoes-1-skc-vazia')

  // 2. No item CA00001: a folha, criar a coleção já com o objeto.
  await page.goto('#/item/CA00001')
  await page.getByRole('button', { name: 'Adicionar à coleção' }).click()
  let folha = page.getByRole('dialog', { name: 'Adicionar à coleção' })
  await expect(folha).toBeVisible()
  await folha.getByLabel('Nova coleção').fill('Íbices em selos')
  await folha.getByRole('button', { name: 'Criar' }).click()
  await expect(folha.getByRole('checkbox', { name: 'Incluir em Íbices em selos' })).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(folha).toHaveCount(0)

  // 3. No item CA00002: uma segunda coleção e a primeira, na mesma folha, com várias caixas.
  await page.goto('#/item/CA00002')
  await page.getByRole('button', { name: 'Adicionar à coleção' }).click()
  folha = page.getByRole('dialog', { name: 'Adicionar à coleção' })
  await folha.getByLabel('Nova coleção').fill('Remates de exemplo')
  await folha.getByRole('button', { name: 'Criar' }).click()
  await expect(folha.getByRole('checkbox', { name: 'Incluir em Remates de exemplo' })).toBeChecked()
  await folha.getByRole('checkbox', { name: 'Incluir em Íbices em selos' }).click()
  await expect(folha.getByRole('checkbox', { name: 'Incluir em Íbices em selos' })).toBeChecked()
  await foto(page, 'colecoes-2-folha-no-item')
  await page.keyboard.press('Escape')

  // 4. No item CA00003: só a primeira.
  await page.goto('#/item/CA00003')
  await page.getByRole('button', { name: 'Adicionar à coleção' }).click()
  folha = page.getByRole('dialog', { name: 'Adicionar à coleção' })
  await folha.getByRole('checkbox', { name: 'Incluir em Íbices em selos' }).click()
  await expect(folha.getByRole('checkbox', { name: 'Incluir em Íbices em selos' })).toBeChecked()
  await expect(folha.getByRole('checkbox', { name: 'Incluir em Remates de exemplo' })).not.toBeChecked()
  await page.keyboard.press('Escape')

  // 5. A aba SKC agora lista as duas coleções com a contagem; abrir a primeira.
  await page.goto('#/colecoes')
  const minhas = page.getByRole('region', { name: 'Minhas coleções' })
  await expect(minhas.getByRole('link', { name: /Remates de exemplo/ })).toContainText('1')
  const primeira = minhas.getByRole('link', { name: /Íbices em selos/ })
  await expect(primeira).toContainText('3')
  await foto(page, 'colecoes-3-skc-com-colecoes')
  await semRolagemHorizontal(page, 'Coleções, aba SKC')
  await primeira.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Íbices em selos' })).toBeVisible()
  await expect(page.getByText('SKC · Coleção')).toBeVisible()
  await expect.poll(() => ordemNaTela(page)).toEqual(['CA00001', 'CA00002', 'CA00003'])
  // A descrição: um botão discreto; o campo grava ao sair e a descrição fica depois de recarregar.
  await page.getByRole('button', { name: 'Adicionar descrição' }).click()
  await page.getByRole('textbox', { name: 'Descrição' }).fill('Selos e remates com íbices, para comparar.')
  await page.getByRole('heading', { level: 1, name: 'Íbices em selos' }).click()
  await expect(page.getByRole('textbox', { name: 'Descrição' })).not.toBeFocused()
  await foto(page, 'colecoes-4-colecao-lista')
  await semRolagemHorizontal(page, 'Coleção em lista')

  // 6. Reordenar pelo teclado: Alt+↑ no puxador do terceiro leva-o ao meio; a posição é anunciada.
  const puxador = (numero: string) => page.getByRole('button', { name: `Mover ${numero}` })
  await puxador('CA00003').focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect.poll(() => ordemNaTela(page)).toEqual(['CA00001', 'CA00003', 'CA00002'])
  await expect(page.getByTestId('anuncio')).toHaveText('CA00003 movido para a posição 2 de 3')
  await expect(puxador('CA00003')).toBeFocused()

  // 7. Reordenar arrastando: CA00001 até depois de CA00002 (eventos de ponteiro, mouse).
  const origem = (await puxador('CA00001').boundingBox())!
  const ultima = (await page.getByRole('list', { name: 'Itens da coleção' }).getByRole('listitem').last().boundingBox())!
  await page.mouse.move(origem.x + origem.width / 2, origem.y + origem.height / 2)
  await page.mouse.down()
  await page.mouse.move(origem.x + origem.width / 2, origem.y + origem.height / 2 + 20, { steps: 4 })
  await page.mouse.move(origem.x + origem.width / 2, ultima.y + ultima.height / 2, { steps: 10 })
  // durante o arrasto a lista já mostra a ordem nova, mas nada foi gravado
  await expect.poll(() => ordemNaTela(page)).toEqual(['CA00003', 'CA00002', 'CA00001'])
  await page.mouse.up()
  await expect(page.getByTestId('anuncio')).toHaveText('CA00001 movido para a posição 3 de 3')

  // 8. Recarregar a página: a ordem e os membros persistem (IndexedDB).
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Íbices em selos' })).toBeVisible()
  await expect.poll(() => ordemNaTela(page)).toEqual(['CA00003', 'CA00002', 'CA00001'])
  await expect(page.getByRole('textbox', { name: 'Descrição' })).toHaveValue('Selos e remates com íbices, para comparar.')

  // 9. Miniaturas: a escolha fica lembrada neste aparelho (recarregar mantém).
  await page.getByRole('group', { name: 'Modo de exibição' }).getByRole('button', { name: 'Miniaturas' }).click()
  await expect(page.getByRole('list', { name: 'Itens da coleção' })).toHaveClass(/colecao-grade/)
  await expect(page.getByRole('list', { name: 'Itens da coleção' }).locator('img').first()).toBeVisible()
  await foto(page, 'colecoes-5-colecao-miniaturas')
  await semRolagemHorizontal(page, 'Coleção em miniaturas')
  await page.reload()
  await expect(page.getByRole('group', { name: 'Modo de exibição' }).getByRole('button', { name: 'Miniaturas' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => ordemNaTela(page)).toEqual(['CA00003', 'CA00002', 'CA00001'])

  // 10. Tirar um objeto e Desfazer: volta ao mesmo lugar.
  await page.getByRole('button', { name: 'Tirar CA00002 da coleção' }).click()
  await expect.poll(() => ordemNaTela(page)).toEqual(['CA00003', 'CA00001'])
  await page.getByRole('button', { name: 'Desfazer' }).click()
  await expect.poll(() => ordemNaTela(page)).toEqual(['CA00003', 'CA00002', 'CA00001'])

  // 11. Do item, o Voltar e a posição seguem a ordem da coleção: CA00002 é o 2º de 3 e o anterior é CA00003.
  await page.getByRole('link', { name: /^CA00002/ }).click()
  await expect(page).toHaveURL(/#\/item\/CA00002/)
  const posicao = page.getByRole('navigation', { name: 'Posição na coleção' })
  await expect(posicao).toContainText('Íbices em selos')
  await expect(posicao).toContainText('2 / 3')
  await expect(posicao.getByRole('link', { name: 'Anterior: CA00003' })).toBeVisible()
  await expect(posicao.getByRole('link', { name: 'Próximo: CA00001' })).toBeVisible()
  if (celular(page)) await expect(page.getByRole('link', { name: 'Voltar à coleção' })).toBeVisible()
})

test('uma reordenação feita em outra aba enquanto se digita uma nota por item: o texto continua no mesmo alvo e no mesmo campo', async ({ page, context }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 768, 'o editor no lugar (e este foco) é do computador')
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()

  // Uma coleção com três objetos.
  await page.goto('#/item/CA00001')
  await page.getByRole('button', { name: 'Adicionar à coleção' }).click()
  const folha = page.getByRole('dialog', { name: 'Adicionar à coleção' })
  await folha.getByLabel('Nova coleção').fill('Remota')
  await folha.getByRole('button', { name: 'Criar' }).click()
  await expect(folha.getByRole('checkbox', { name: 'Incluir em Remota' })).toBeChecked()
  await page.keyboard.press('Escape')
  await page.goto('#/colecoes')
  await page.getByRole('region', { name: 'Minhas coleções' }).getByRole('link', { name: /Remota/ }).click()
  await page.getByLabel('Adicionar por código').fill('CA00002 CA00003')
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click()
  const lista = page.getByRole('list', { name: 'Itens da coleção' })
  await expect(lista.getByRole('listitem')).toHaveCount(3)
  const url = page.url()
  const ordem = (p: Page) => p.getByRole('list', { name: 'Itens da coleção' }).getByRole('button', { name: /^Mover / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))

  // Escreve uma nota no primeiro objeto (CA00001) e começa a digitar.
  await page.getByRole('button', { name: 'Escrever nota sobre CA00001' }).click()
  const campo = lista.getByRole('textbox').first()
  await expect(campo).toBeFocused()
  await campo.pressSequentially('antes ')

  // Outra aba leva CA00003 ao topo (A, B, C vira C, A, B: o React reinsere os nós de A e de B).
  const outra = await context.newPage()
  await outra.goto(url)
  await expect(outra.getByRole('list', { name: 'Itens da coleção' }).getByRole('listitem')).toHaveCount(3)
  await outra.getByRole('button', { name: 'Mover CA00003' }).focus()
  await outra.keyboard.press('Alt+ArrowUp')
  await outra.keyboard.press('Alt+ArrowUp')
  await expect.poll(() => ordem(outra)).toEqual(['Mover CA00003', 'Mover CA00001', 'Mover CA00002'])
  await page.bringToFront()
  await expect.poll(() => ordem(page)).toEqual(['Mover CA00003', 'Mover CA00001', 'Mover CA00002'])

  // O campo continua sendo o da linha de CA00001, com o foco e o texto; o que se digita depois entra nele.
  const linhaDoCA00001 = lista.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Mover CA00001' }) })
  await expect(linhaDoCA00001.getByRole('textbox')).toHaveValue('antes ')
  await expect(linhaDoCA00001.getByRole('textbox')).toBeFocused()
  await page.keyboard.type('depois')
  await expect(linhaDoCA00001.getByRole('textbox')).toHaveValue('antes depois')
  expect(await lista.getByRole('textbox').count()).toBe(1)

  // O rascunho foi para o IndexedDB no alvo certo: depois de recarregar, a nota é do CA00001 desta coleção.
  await expect(page.getByText('rascunho salvo')).toBeVisible({ timeout: 5000 })
  await page.reload()
  await page.goto('#/notas')
  const rascunho = page.getByRole('link', { name: /rascunho/ })
  await expect(rascunho).toBeVisible()
  await expect(rascunho).toContainText('antes depois')
  await expect(rascunho).toContainText('CA00001 em Remota')
  await outra.close()
})

test('a descrição digitada e a página recarregada logo em seguida: o texto não se perde (pagehide)', async ({ page }) => {
  test.skip(celular(page), 'o recarregar na hora não depende do tamanho da tela; o desktop basta')
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()

  await page.goto('#/item/CA00001')
  await page.getByRole('button', { name: 'Adicionar à coleção' }).click()
  const folha = page.getByRole('dialog', { name: 'Adicionar à coleção' })
  await folha.getByLabel('Nova coleção').fill('Descrita na pressa')
  await folha.getByRole('button', { name: 'Criar' }).click()
  await expect(folha.getByRole('checkbox', { name: 'Incluir em Descrita na pressa' })).toBeChecked()
  await page.keyboard.press('Escape')
  await page.goto('#/colecoes')
  await page.getByRole('region', { name: 'Minhas coleções' }).getByRole('link', { name: /Descrita na pressa/ }).click()

  // Menos de um segundo depois da última tecla a página recarrega: nem o blur nem o atraso de 1 s chegaram a gravar.
  await page.getByRole('button', { name: 'Adicionar descrição' }).click()
  await page.getByLabel('Descrição').pressSequentially('texto um')
  await page.reload()
  await expect(page.getByRole('list', { name: 'Itens da coleção' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Descrição' })).toHaveValue('texto um')

  // E depois de gravada de verdade, recarregar de novo a mantém (sem entrada de emergência sobrando para sobrescrever).
  await page.getByRole('textbox', { name: 'Descrição' }).fill('texto dois')
  await page.keyboard.press('Control+s')
  await page.waitForTimeout(600) // Ctrl/⌘S grava e não mostra nada na tela: dá um instante ao IndexedDB
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Descrição' })).toHaveValue('texto dois')
})

/** Um nome sintético com `n` caracteres (letras e espaços), sem espaço no fim. */
const nomeDe = (n: number) => 'Selo de Teste '.repeat(Math.ceil(n / 14) + 1).slice(0, n).replace(/ $/, 'x')

test('«Renomear» não desloca nada na página e o campo mostra o nome inteiro: nome curto, de duas linhas e de 34 a 50 letras', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
  await page.goto('#/item/CA00001')
  await page.getByRole('button', { name: 'Adicionar à coleção' }).click()
  const folha = page.getByRole('dialog', { name: 'Adicionar à coleção' })
  await folha.getByLabel('Nova coleção').fill('Íbices em selos')
  await folha.getByRole('button', { name: 'Criar' }).click()
  await expect(folha.getByRole('checkbox', { name: 'Incluir em Íbices em selos' })).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(folha).toHaveCount(0)
  await page.goto('#/colecoes')
  await page.getByRole('region', { name: 'Minhas coleções' }).getByRole('link', { name: /Íbices em selos/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Íbices em selos' })).toBeVisible()
  const contagem = page.locator('.colecao-contagens')
  const topo = async () => (await contagem.boundingBox())!.y

  const renomear = page.getByRole('button', { name: 'Renomear' })
  const campo = page.getByRole('textbox', { name: 'Nome da coleção' })
  const salvar = page.getByRole('button', { name: 'Salvar nome' })

  // Abre o campo e confere: nada se mexe (contagem e linha de botões) e o nome inteiro cabe no campo.
  const abrirEConferir = async (nome: string) => {
    const antes = await topo()
    const botaoAntes = (await renomear.boundingBox())!.y
    await renomear.click()
    await expect(campo).toBeFocused()
    await expect(salvar).toBeVisible()
    const dentro = await campo.evaluate((el) => ({ rola: Math.max(el.scrollHeight - el.clientHeight, el.scrollWidth - el.clientWidth), valor: (el as HTMLTextAreaElement).value }))
    expect(dentro.valor, `o campo traz o nome (${nome.length} letras)`).toBe(nome)
    expect(dentro.rola, `o nome inteiro aparece no campo, sem rolar na vertical nem na horizontal (${nome.length} letras)`).toBeLessThanOrEqual(0)
    expect(Math.abs((await topo()) - antes), `a contagem não se mexe ao abrir (${nome.length} letras)`).toBeLessThanOrEqual(2)
    expect(Math.abs((await salvar.boundingBox())!.y - botaoAntes), `a linha de botões não se mexe ao abrir (${nome.length} letras)`).toBeLessThanOrEqual(2)
    return antes
  }
  const renomearPara = async (nome: string) => {
    await renomear.click()
    await expect(campo).toBeFocused()
    await campo.fill(nome)
    await campo.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: nome, exact: true })).toBeVisible()
  }

  // O primeiro nome, curto: abrir, Esc (foco volta ao «Renomear»), abrir, gravar.
  const antes0 = await abrirEConferir('Íbices em selos')
  await foto(page, 'colecoes-5-renomeando')
  await semRolagemHorizontal(page, 'Coleção renomeando')
  await campo.press('Escape')
  await expect(renomear).toBeFocused()
  expect(Math.abs((await topo()) - antes0), 'a contagem não se mexe ao cancelar').toBeLessThanOrEqual(2)

  // Enter grava e Shift+Enter não põe quebra de linha no nome (é de uma linha só).
  await renomear.click()
  await expect(campo).toBeFocused()
  await campo.fill('Íbices e selos')
  await campo.press('Shift+Enter')
  await expect(campo).toHaveValue('Íbices e selos')
  await expect(campo).toBeFocused()
  await campo.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Íbices e selos' })).toBeVisible()
  expect(Math.abs((await topo()) - antes0), 'a contagem não se mexe ao gravar').toBeLessThanOrEqual(2)

  // Um nome de duas linhas (30 letras no celular; 60 no computador) e depois nomes de 38 a 44 letras.
  const duasLinhas = nomeDe(celular(page) ? 30 : 60)
  // A faixa de uns 38 a 44 letras (aqui varrida de 34 a 50, porque ela depende das letras) é a que o computador deslocava (o título cabia ao lado de «Renomear», mas não de «Salvar nome · Cancelar»).
  const comprimentos = [duasLinhas.length, ...(celular(page) ? [38, 41, 44] : Array.from({ length: 17 }, (_, i) => 34 + i))]
  for (const n of comprimentos) {
    const nome = n === duasLinhas.length ? duasLinhas : nomeDe(n)
    await renomearPara(nome)
    const antes = await abrirEConferir(nome)
    await campo.press('Escape')
    await expect(renomear).toBeFocused()
    expect(Math.abs((await topo()) - antes), `a contagem não se mexe ao cancelar (${nome.length} letras)`).toBeLessThanOrEqual(2)
    if (n === duasLinhas.length) {
      await renomear.click()
      await expect(campo).toBeFocused()
      await foto(page, 'colecoes-5-renomeando-duas-linhas')
      await campo.press('Escape')
      await expect(renomear).toBeFocused()
    }
  }
})

test('«Renomear»: sem pulo na primeira letra (nome de 60 letras), sem vão depois de nome curto e espaços repetidos viram um só', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
  await page.goto('#/item/CA00001')
  await page.getByRole('button', { name: 'Adicionar à coleção' }).click()
  const folha = page.getByRole('dialog', { name: 'Adicionar à coleção' })
  await folha.getByLabel('Nova coleção').fill('Íbices em selos')
  await folha.getByRole('button', { name: 'Criar' }).click()
  await expect(folha.getByRole('checkbox', { name: 'Incluir em Íbices em selos' })).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(folha).toHaveCount(0)
  await page.goto('#/colecoes')
  await page.getByRole('region', { name: 'Minhas coleções' }).getByRole('link', { name: /Íbices em selos/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Íbices em selos' })).toBeVisible()
  const topo = async () => (await page.locator('.colecao-contagens').boundingBox())!.y
  const renomear = page.getByRole('button', { name: 'Renomear' })
  const campo = page.getByRole('textbox', { name: 'Nome da coleção' })
  const salvar = page.getByRole('button', { name: 'Salvar nome' })
  const renomearPara = async (nome: string) => {
    await renomear.click()
    await campo.fill(nome)
    await campo.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: nome, exact: true })).toBeVisible()
  }

  // Nome curto: «Salvar nome» fica colado ao campo (a área dos botões é vizinha da área do título), sem vão largo.
  if (!celular(page)) {
    await renomearPara('Selo')
    await renomear.click()
    await expect(campo).toBeFocused()
    const caixaCampo = (await campo.boundingBox())!
    const vao = (await salvar.boundingBox())!.x - (caixaCampo.x + caixaCampo.width)
    expect(vao, 'a distância entre o campo e «Salvar nome» (nome curto)').toBeLessThanOrEqual(40)
    expect(caixaCampo.width, 'o campo de um nome curto não é largo').toBeLessThan(200)
    await campo.press('Escape')
  }

  // Nome de 2 linhas: a primeira letra substitui o nome todo (está selecionado) e nada na página se mexe.
  const longo = nomeDe(celular(page) ? 30 : 60)
  await renomearPara(longo)
  await renomear.click()
  await expect(campo).toBeFocused()
  const antes = await topo()
  const botaoAntes = (await salvar.boundingBox())!.y
  const larguraAntes = (await campo.boundingBox())!.width
  await page.keyboard.press('x')
  await expect(campo).toHaveValue('x')
  expect(Math.abs((await topo()) - antes), 'a contagem não pula na primeira letra').toBeLessThanOrEqual(2)
  expect(Math.abs((await salvar.boundingBox())!.y - botaoAntes), '«Salvar nome» não pula na primeira letra').toBeLessThanOrEqual(2)
  expect(Math.abs((await campo.boundingBox())!.width - larguraAntes), 'o campo não encolhe').toBeLessThanOrEqual(2)
  await campo.press('Escape')

  // Tabs e espaços repetidos viram um espaço só ao digitar e ao colar; nada se mexe ao digitar.
  await renomear.click()
  const antes2 = await topo()
  await campo.fill('Selo\t\tde   Teste')
  await expect(campo).toHaveValue('Selo de Teste')
  expect(Math.abs((await topo()) - antes2)).toBeLessThanOrEqual(2)
  await campo.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Selo de Teste', exact: true })).toBeVisible()
  // O cursor não vai para o fim quando os espaços são colapsados no meio do nome.
  await renomear.click()
  await campo.fill('ab cd')
  await campo.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(3, 3))
  await page.keyboard.type(' ')
  await expect(campo).toHaveValue('ab cd')
  await page.keyboard.type('X')
  await expect(campo).toHaveValue('ab Xcd')
  await campo.press('Escape')
  const fechado = await topo()
  await renomear.click()
  await expect(campo).toHaveValue('Selo de Teste')
  expect(Math.abs((await topo()) - fechado), 'abrir não desloca (nome com espaços repetidos)').toBeLessThanOrEqual(2)
  await campo.press('Escape')
})
