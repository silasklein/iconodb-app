import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { apertarAteAparecer } from './teclas'
import { expect, test } from './fixtures'

/**
 * Tarefa 11 no navegador de verdade, nos dois tamanhos, sobre o pacote sintético (TESTE): editar a forma em uso de um
 * verbete do livro, vê-la na leitura, achar o verbete pela forma nova e pela antiga, aprovar e conferir a ✓ na lista;
 * a hipótese SKC na página do verbete do livro; e os "possíveis duplicados" na lista "a revisar". Com SHOTS_DIR
 * definido, guarda capturas.
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

async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}

test('editar a forma de um termo do livro: na leitura, na busca (nova e antiga), aprovar e a ✓ na lista', async ({ page }) => {
  const celular = (page.viewportSize()?.width ?? 0) < 768
  await entrar(page)
  const forma = page.getByRole('textbox', { name: 'Forma em português' })

  // 1. O verbete "a revisar": edita a forma; o título acompanha e aparece "Voltar à proposta original".
  await page.goto('#/verbete/GL-900007')
  await expect(page.getByRole('heading', { level: celular ? 1 : 2, name: 'filhote de leão-de-teste' })).toBeVisible()
  await expect(page.getByText('Conceito · a revisar')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Voltar à proposta original' })).toHaveCount(0)
  await forma.fill('cria de leão')
  await forma.press('Tab')
  await expect(page.getByRole('heading', { level: celular ? 1 : 2, name: 'cria de leão' })).toBeVisible()
  const voltar = page.getByRole('button', { name: 'Voltar à proposta original' })
  await expect(voltar).toBeVisible()
  const alvo = await voltar.boundingBox()
  expect(Math.min(alvo!.width, alvo!.height)).toBeGreaterThanOrEqual(36)
  await expect(page.getByText('Proposta original: filhote de leão-de-teste')).toBeVisible()
  await semRolagemHorizontal(page, 'o verbete em edição')
  await foto(page, 'glo-1-verbete-edicao')

  // 2. A leitura: o termo aparece com a forma nova (e a hipótese do livro continua marcada nele).
  await page.goto('#/item/BA00001')
  const leitura = page.locator('.leitura-texto[lang="pt-BR"]').filter({ hasText: 'cria de leão' })
  await expect(leitura).toBeVisible()
  // o texto do tradutor fica na dica (um trecho trocado pode mudar gênero e número)
  await expect(leitura.locator('.termo-marcado[data-tip]', { hasText: 'cria de leão' })).toHaveAttribute('data-tip', 'Na tradução: filhote de leão-de-teste')
  await expect(leitura.locator('[data-b-fim]').first()).toHaveAttribute('data-b-fim', /^\d+$/)
  await semRolagemHorizontal(page, 'a leitura com a forma nova')
  await foto(page, 'glo-2-leitura', leitura)

  // 3. A busca: pela forma nova e pela antiga, o mesmo verbete (com a forma nova) e os objetos dele.
  for (const q of ['cria de leão', 'filhote de leão-de-teste']) {
    await page.goto(`#/busca?q=${encodeURIComponent(q)}&escopo=termo`)
    const destaque = page.getByRole('region', { name: 'Verbete correspondente' })
    await expect(destaque.getByRole('heading', { name: 'cria de leão' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Resultados' }).getByRole('link', { name: /BA00001/ })).toBeVisible()
  }
  await foto(page, 'glo-3-busca-forma-antiga')

  // 4. Aprovar: a etiqueta muda, o botão vira "Aprovado por você"; na lista, a ✓; fora do filtro "a revisar".
  await page.goto('#/verbete/GL-900007')
  await page.getByRole('button', { name: 'Aprovar' }).click()
  await expect(page.getByText('Conceito · aprovado')).toBeVisible()
  await expect(page.getByText('Aprovado por você')).toBeVisible()
  await foto(page, 'glo-4-aprovado')
  await page.goto('#/glossario')
  const linha = page.locator('a.lista-linha[href^="#/verbete/GL-900007"]')
  await expect(linha).toContainText('cria de leão')
  await expect(linha.getByRole('img', { name: 'aprovado' })).toBeVisible()
  await semRolagemHorizontal(page, 'o glossário com a ✓')
  await foto(page, 'glo-4-lista-com-check', linha)
  await page.goto('#/glossario?revisar=1')
  await expect(page.locator('a.lista-linha[href^="#/verbete/GL-900001"]')).toHaveCount(0) // aprovado no pacote
  await expect(page.locator('a.lista-linha[href^="#/verbete/GL-900007"]')).toHaveCount(0)

  // 5. Voltar à proposta original: a leitura volta ao texto do livro.
  await page.goto('#/verbete/GL-900007')
  await page.getByRole('button', { name: 'Voltar à proposta original' }).click()
  await expect(page.getByRole('heading', { level: celular ? 1 : 2, name: 'filhote de leão-de-teste' })).toBeVisible()
  await page.goto('#/item/BA00001')
  await expect(page.locator('.leitura-texto[lang="pt-BR"]').filter({ hasText: 'filhote de leão-de-teste' })).toBeVisible()
})

test('a hipótese SKC na página do verbete do livro, e dois termos do usuário que podem ser o mesmo na lista "a revisar"', async ({ page }) => {
  const celular = (page.viewportSize()?.width ?? 0) < 768
  await entrar(page)

  // Duas hipóteses SKC com termos novos (decisão 41) e um terceiro termo, do livro.
  async function hipotese(objeto: string, termo: string, criar: boolean) {
    await page.goto(`#/item/${objeto}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const form = page.getByRole('dialog', { name: 'Nova hipótese' })
    await apertarAteAparecer(page, 'Shift+H', form)
    const campo = form.getByRole('combobox', { name: 'Termo' })
    await campo.fill(termo)
    await form.getByRole('listbox', { name: 'Termo' }).getByRole('option', { name: criar ? new RegExp(`^Criar termo «${termo}»`) : new RegExp(`^${termo}`) }).click()
    // M11: o botão de tirar o termo tem 36 × 36 px com o mouse e 44 × 44 no toque, e a dica "Tirar o termo".
    const tirar = form.getByRole('button', { name: new RegExp(`^Tirar o termo ${termo}`) })
    await expect(tirar).toHaveAttribute('data-tip', 'Tirar o termo')
    const caixa = (await tirar.boundingBox())!
    expect(Math.min(caixa.width, caixa.height)).toBeGreaterThanOrEqual((celular ? 44 : 36) - 0.5)
    await form.getByRole('button', { name: 'Registrar hipótese' }).click()
    await expect(form).toHaveCount(0)
  }
  await hipotese('CA00003', 'termo irmão do teste', true)
  await hipotese('CA00002', 'termo gêmeo do teste', true)
  await hipotese('CA00003', 'leão-de-teste', false)

  // A página do verbete do livro lista a hipótese SKC junto com as do livro.
  await page.goto('#/verbete/GL-900001')
  const hipoteses = page.getByRole('region', { name: 'Hipóteses com este termo' })
  const skc = hipoteses.getByRole('link', { name: /CA00003/ }).filter({ has: page.locator('.marca-skc') })
  await expect(skc).toHaveCount(1)
  await expect(skc).toContainText('SKC')
  await expect(hipoteses.locator('a.hipotese-linha')).toHaveCount(3) // HY-900001, HY-900003 e a SKC
  await semRolagemHorizontal(page, 'o verbete do livro com a hipótese SKC')
  await foto(page, 'glo-5-verbete-do-livro-com-skc', skc)

  // Renomear um dos termos do usuário para a forma do outro: os dois ficam "possível duplicado" em "a revisar".
  await page.goto('#/glossario?revisar=1')
  const irmao = page.locator('a.lista-linha').filter({ hasText: 'termo irmão do teste' })
  await irmao.click()
  const forma = page.getByRole('textbox', { name: 'Forma em português' })
  await expect(forma).toHaveValue('termo irmão do teste')
  await forma.fill('Termo Gêmeo do Teste')
  await forma.press('Tab')
  await expect(page.getByRole('note', { name: 'Possível duplicado' })).toBeVisible()
  await foto(page, 'glo-6-duplicado-no-verbete')
  await page.goto('#/glossario?revisar=1')
  const duplicadas = page.locator('a.lista-linha').filter({ hasText: 'possível duplicado' })
  await expect(duplicadas).toHaveCount(2)
  await expect(duplicadas.first()).toContainText('SKC')
  await expect(duplicadas.first()).toContainText('a revisar')
  await semRolagemHorizontal(page, 'a lista "a revisar" com os duplicados')
  await foto(page, 'glo-6-a-revisar-duplicados', duplicadas.first())

  // Excluir um deles (confirmação nomeada) resolve: o outro deixa de ser "possível duplicado".
  await duplicadas.first().click()
  await page.getByRole('button', { name: 'Excluir o verbete' }).click()
  await expect(page.getByRole('group', { name: /^Excluir o verbete «.+»\?$/ })).toBeVisible()
  const confirmacao = page.getByRole('group', { name: /^Excluir o verbete/ })
  await expect(confirmacao.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await confirmacao.getByRole('button', { name: 'Excluir' }).click()
  // Excluído, vai para a lista, com o aviso e o foco em "Restaurar o verbete".
  const aviso = page.getByRole('status', { name: 'Verbete excluído' })
  await expect(aviso).toBeVisible()
  await expect(aviso.getByRole('button', { name: 'Restaurar o verbete' })).toBeFocused()
  await expect(page.locator('a.lista-linha').filter({ hasText: 'possível duplicado' })).toHaveCount(0)
  await foto(page, 'glo-6-excluido-na-lista')
  await aviso.getByRole('button', { name: 'Restaurar o verbete' }).click()
  await expect(aviso).toHaveCount(0)
  await expect(page.locator('a.lista-linha').filter({ hasText: 'possível duplicado' })).toHaveCount(2)
})

test('uma forma que não é a do pacote fica como foi escrita na leitura, com a forma em uso na dica (verbete com pt_text); a que é a do pacote é trocada', async ({ page }) => {
  await entrar(page)
  await page.goto('#/verbete/GL-900003')
  const forma = page.getByRole('textbox', { name: 'Forma em português' })
  await forma.fill('olhos (forma de gota)')
  await forma.press('Tab')
  await expect(page.getByRole('button', { name: 'Voltar à proposta original' })).toBeVisible()
  await page.goto('#/verbete/GL-900002')
  await forma.fill('figura serrilhada')
  await forma.press('Tab')
  await expect(page.getByRole('button', { name: 'Voltar à proposta original' })).toBeVisible()

  await page.goto('#/item/CA00003')
  const leitura = page.locator('.leitura-texto[lang="pt-BR"]').first()
  // Os dois termos têm hipótese do livro, então ficam dentro da âncora (o termo marcado, não um link à parte).
  // O verbete tem pt_text: o texto fica, e a forma em uso vai na dica e no nome acessível da âncora.
  const olho = leitura.locator('.termo-marcado', { hasText: 'olho em forma de botão' })
  await expect(olho).toContainText('olho em forma de botão')
  await expect(olho).toHaveAttribute('data-tip', 'Forma em uso: olhos (forma de gota)')
  await expect(leitura.getByRole('link', { name: /^olho em forma de botão ?, forma em uso: olhos \(forma de gota\)/ })).toBeVisible()
  // o outro termo está como o pacote o escreve: foi trocado
  const figura = leitura.locator('.termo-marcado', { hasText: 'figura serrilhada' })
  await expect(figura).toBeVisible()
  await expect(figura).toHaveAttribute('data-tip', 'Na tradução: figura denteada')
  // m7: a dica quebra linha e também aparece ao focar o link da hipótese pelo teclado (não só ao passar o mouse).
  // Com mouse (revisão 1 da Tarefa 18, I1) ela vai DENTRO da prévia da hipótese (uma caixa só, junto do trecho); no toque, é a dica de antes.
  const anchor = leitura.getByRole('link', { name: /^olho em forma de botão ?, forma em uso/ })
  await anchor.focus()
  const celular = page.viewportSize()!.width < 768
  if (celular) {
    const dica = await olho.evaluate((el) => {
      const c = getComputedStyle(el, '::after')
      return { display: c.display, brancos: c.whiteSpace, largura: parseFloat(c.width), tela: window.innerWidth }
    })
    expect(dica.display).toBe('block')
    expect(dica.brancos).toBe('normal')
    expect(dica.largura).toBeLessThanOrEqual(260)
    await expect(anchor.locator('.ancora-previa')).toHaveCount(0)
    // T17-B-7: a dica se ancora no TERMO (não no parágrafo) e cabe na tela
    const caixa = await olho.evaluate((el) => {
      const c = getComputedStyle(el, '::after')
      const r = el.getClientRects()[0]!
      const esquerda = r.left + parseFloat(c.left)
      return { posicao: getComputedStyle(el).position, esquerda, direita: esquerda + parseFloat(c.width), tela: window.innerWidth, base: parseFloat(c.top) }
    })
    expect(caixa.posicao).toBe('relative')
    expect(caixa.esquerda).toBeGreaterThanOrEqual(0)
    expect(caixa.direita).toBeLessThanOrEqual(caixa.tela - 0)
    // T17-B-7 (revisão 1, m2): num parágrafo LONGO (o termo no meio, muitas linhas antes e depois) a dica fica colada no termo,
    // na vertical, e dentro da janela. Antes ela saía do parágrafo inteiro (longe do termo).
    await olho.evaluate((el) => {
      const palavras = (n: number) => Array.from({ length: n }, (_, i) => `palavra${i}`).join(' ')
      const ancora = el.closest('a') ?? el // o texto vai FORA do link (não muda o nome acessível dele)
      ancora.parentNode!.insertBefore(document.createTextNode(`${palavras(120)} `), ancora)
      ancora.parentNode!.insertBefore(document.createTextNode(` ${palavras(120)}`), ancora.nextSibling)
      el.scrollIntoView({ block: 'center' })
    })
    // `ajustarDica` roda ao FOCAR: o foco já estava no link (focado acima), então um segundo `focus()` não faria nada. Tira e põe de novo.
    await anchor.blur()
    await anchor.focus()
    const longa = await olho.evaluate((el) => {
      const c = getComputedStyle(el, '::after')
      const t = el.getBoundingClientRect()
      const alto = parseFloat(c.height)
      const fim = c.top === 'auto' ? t.bottom - parseFloat(c.bottom) : t.top + parseFloat(c.top) + alto
      const inicio = fim - alto
      const pai = el.closest('.leitura-texto')!.getBoundingClientRect()
      return { display: c.display, inicio, fim, termoTopo: t.top, termoBase: t.bottom, janela: window.innerHeight, paiAlto: pai.height }
    })
    expect(longa.paiAlto).toBeGreaterThan(longa.janela) // o parágrafo é mesmo mais alto que a janela
    expect(longa.display).toBe('block')
    expect(longa.inicio).toBeGreaterThanOrEqual(0)
    expect(longa.fim).toBeLessThanOrEqual(longa.janela)
    // colada no termo: o vão entre a dica e o termo é pequeno (abaixo dele ou acima, nunca a um parágrafo de distância)
    const vao = longa.inicio >= longa.termoBase - 1 ? longa.inicio - longa.termoBase : longa.termoTopo - longa.fim
    expect(vao).toBeGreaterThanOrEqual(-1)
    expect(vao).toBeLessThanOrEqual(30)
    expect(longa.fim).toBeGreaterThan(longa.termoBase) // no meio da janela cabe embaixo: a dica sai ABAIXO do termo
    // O outro ramo: com o termo no pé da janela a dica não cabe embaixo e sai ACIMA dele, ainda colada.
    await olho.evaluate((el) => el.scrollIntoView({ block: 'end' }))
    await anchor.blur()
    await anchor.focus()
    await expect(olho).toHaveAttribute('data-acima', '')
    const acima = await olho.evaluate((el) => {
      const c = getComputedStyle(el, '::after')
      const t = el.getBoundingClientRect()
      const alto = parseFloat(c.height)
      const fim = c.top === 'auto' ? t.bottom - parseFloat(c.bottom) : t.top + parseFloat(c.top) + alto
      return { inicio: fim - alto, fim, termoTopo: t.top, janela: window.innerHeight }
    })
    expect(acima.fim).toBeLessThanOrEqual(acima.termoTopo + 1)
    expect(acima.termoTopo - acima.fim).toBeLessThanOrEqual(30)
    expect(acima.inicio).toBeGreaterThanOrEqual(0)
  } else {
    const previa = anchor.locator('.ancora-previa')
    await expect(previa).toContainText('Forma em uso: olhos (forma de gota)')
    expect(await olho.evaluate((el) => getComputedStyle(el, '::after').display)).toBe('none')
    expect((await previa.boundingBox())!.width).toBeLessThanOrEqual(300)
    await olho.hover()
  }
  await foto(page, 'glo-7-leitura-flexao', leitura)
})
