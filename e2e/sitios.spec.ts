import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Tarefa 12 no navegador de verdade, nos dois tamanhos, sobre o pacote sintético (TESTE): o formulário "Novo sítio" (com a
 * coordenada colada e o rascunho que sobrevive ao Esc), a página do sítio novo, a correção de um sítio do livro com o "no livro:
 * …" ao lado, "Novo sítio «…»" na ficha do objeto, "Escolher ou trocar o sítio" no item e a busca achando o nome antigo e o
 * novo. Com SHOTS_DIR definido, guarda capturas.
 */
const semRolagemHorizontal = async (page: Page, tela: string) => {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}
async function foto(page: Page, nome: string, ver?: Locator | 'topo') {
  const pasta = process.env.SHOTS_DIR
  if (!pasta) return
  mkdirSync(pasta, { recursive: true })
  if (ver === 'topo') await page.evaluate(() => window.scrollTo(0, 0))
  else await ver?.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: join(pasta, `${process.env.SHOTS_PREFIX ?? ''}${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}
async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}
/** O alvo é grande o bastante: 44 px no toque, 36 com o mouse. */
async function alvoOk(el: Locator, celular: boolean, nome: string) {
  const caixa = (await el.boundingBox())!
  expect(Math.min(caixa.width, caixa.height), `alvo de ${nome}`).toBeGreaterThanOrEqual((celular ? 44 : 36) - 0.5)
}
const colar = (campo: Locator, texto: string) =>
  campo.evaluate((el, t) => {
    const dt = new DataTransfer()
    dt.setData('text', t)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, texto)

test('Novo sítio: coordenada colada, erro em português, Esc que guarda o rascunho; a página do sítio novo', async ({ page }) => {
  const celular = (page.viewportSize()?.width ?? 0) < 768
  await entrar(page)
  await page.goto('#/sitios')
  await expect(page.getByRole('heading', { level: 1, name: 'Sítios' })).toBeVisible()
  const novo = page.getByRole('link', { name: 'Novo sítio' })
  await alvoOk(novo, celular, 'o botão Novo sítio')
  await novo.click()
  await expect(page.getByRole('heading', { level: 1, name: /^Novo sítio/ })).toBeVisible()

  const nome = page.getByRole('textbox', { name: 'Nome', exact: true })
  await nome.fill('Tell Inventado de Teste')
  await page.getByRole('textbox', { name: /^Outras grafias/ }).fill('Tall Inventada')
  await page.keyboard.press('Enter')
  await page.getByRole('textbox', { name: /^Região ou país/ }).fill('Negev')
  const lat = page.getByRole('textbox', { name: 'Latitude' })
  const lon = page.getByRole('textbox', { name: 'Longitude' })
  await lat.fill('131,2')
  await lon.fill('35,21')
  await page.getByRole('button', { name: 'Registrar sítio' }).click()
  await expect(page.getByRole('alert')).toContainText('Latitude entre −90 e 90 (recebi 131,2).')
  await expect(lat).toBeFocused()
  await foto(page, 'sitio-1-novo-com-erro', lat)
  // colar o ambíguo, ou o link curto do iPhone: a mensagem diz o que há de errado e o que serve (nada vai para o campo)
  await lat.fill('')
  await lon.fill('')
  await colar(lat, '31,77,35,21')
  await expect(page.getByRole('alert')).toContainText('«31,77,35,21» é ambígua')
  await expect(page.getByRole('alert')).toContainText('«31,77; 35,21»')
  await expect(lat).toHaveValue('')
  await foto(page, 'sitio-8-coordenada-ambigua', lat)
  await colar(lon, 'https://maps.app.goo.gl/AbC123xyz')
  await expect(page.getByRole('alert')).toContainText('link curto do Google Maps')
  await expect(page.getByRole('alert')).toContainText('copie as coordenadas')
  await foto(page, 'sitio-8-link-curto-do-google', lon)
  // colar um link do OpenStreetMap preenche os dois campos
  await colar(lat, 'https://www.openstreetmap.org/#map=12/31.7683/35.2137')
  await expect(lat).toHaveValue('31,7683')
  await expect(lon).toHaveValue('35,2137')
  await page.getByRole('textbox', { name: /^Nota/ }).fill('Coordenada tirada do mapa.')
  await alvoOk(nome, celular, 'o campo Nome')
  await alvoOk(page.getByRole('button', { name: 'Registrar sítio' }), celular, 'Registrar sítio')
  await semRolagemHorizontal(page, 'o formulário Novo sítio')
  await foto(page, 'sitio-1-novo-sitio')
  await foto(page, 'sitio-1-novo-sitio-topo', 'topo')

  // Esc não descarta: fecha e guarda o rascunho; "Novo sítio" o traz de volta
  await nome.press('Escape')
  await expect(page.getByRole('heading', { level: 1, name: 'Sítios' })).toBeVisible()
  await page.getByRole('link', { name: 'Novo sítio' }).click()
  await expect(page.getByRole('status', { name: 'Rascunho recuperado' })).toBeVisible()
  await expect(nome).toHaveValue('Tell Inventado de Teste')
  await expect(lat).toHaveValue('31,7683')
  // uma navegação sem querer (o Voltar do navegador) também não descarta
  await page.goBack()
  await page.goForward()
  await expect(nome).toHaveValue('Tell Inventado de Teste')

  await page.getByRole('button', { name: 'Registrar sítio' }).click()
  await expect(page.getByRole('heading', { level: celular ? 1 : 2, name: 'Tell Inventado de Teste' })).toBeVisible()
  await expect(page.getByText('Sítio SKC · Negev')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Coordenada' })).toContainText('31,7683 N · 35,2137 E')
  await semRolagemHorizontal(page, 'a página do sítio novo')
  await foto(page, 'sitio-2-sitio-novo', 'topo')

  // na lista, com a marca SKC
  await page.goto('#/sitios')
  const linha = page.locator('a.lista-linha').filter({ hasText: 'Tell Inventado de Teste' })
  await expect(linha).toContainText('SKC')
  await semRolagemHorizontal(page, 'a lista de sítios')
})

test('corrigir um sítio do livro (com "no livro: …"), achá-lo pelo nome novo e pelo antigo, e trocar o sítio na ficha do objeto', async ({ page }) => {
  const celular = (page.viewportSize()?.width ?? 0) < 768
  await entrar(page)
  const titulo = (nome: string) => page.getByRole('heading', { level: celular ? 1 : 2, name: nome })

  await page.goto('#/sitio/TESTE-2')
  await expect(titulo('Tell Probe Teste')).toBeVisible()
  await page.getByRole('button', { name: 'Corrigir' }).click()
  const campoNome = page.getByRole('textbox', { name: 'Nome', exact: true })
  await campoNome.fill('Tell Probe Corrigido')
  await campoNome.press('Tab')
  await expect(titulo('Tell Probe Corrigido')).toBeVisible()
  await page.getByRole('textbox', { name: /^Outras grafias/ }).fill('Khirbet Probe')
  await page.keyboard.press('Enter')
  const secao = page.getByRole('region', { name: 'Coordenada, em correção' })
  await secao.getByRole('textbox', { name: 'Latitude' }).fill('31,5')
  await secao.getByRole('textbox', { name: 'Longitude' }).fill('35,5')
  await alvoOk(secao.getByRole('button', { name: 'Salvar a coordenada' }), celular, 'Salvar a coordenada')
  await foto(page, 'sitio-3-corrigindo', secao)
  // sair do par grava sozinho, como os outros campos (sem tocar em «Salvar a coordenada»)
  await secao.getByRole('heading', { name: 'Coordenada' }).click()
  await expect(secao.getByText('Coordenada guardada.')).toBeVisible()
  // um par pela metade não se perde ao fechar «Corrigir»: a página avisa e «Corrigir» o traz de volta
  await secao.getByRole('textbox', { name: 'Latitude' }).fill('30,1')
  await secao.getByRole('textbox', { name: 'Longitude' }).fill('')
  await page.getByRole('button', { name: 'Corrigir' }).click()
  const naoSalva = page.getByRole('status', { name: 'Coordenada ainda não salva' })
  await expect(naoSalva).toBeVisible()
  await foto(page, 'sitio-9-coordenada-nao-salva', naoSalva)
  await naoSalva.getByRole('button', { name: 'Continuar a coordenada' }).click()
  await expect(secao.getByRole('textbox', { name: 'Latitude' })).toHaveValue('30,1')
  await secao.getByRole('button', { name: 'Descartar o rascunho' }).click()
  await expect(secao.getByRole('textbox', { name: 'Latitude' })).toHaveValue('31,5')
  await page.getByRole('button', { name: 'Corrigir' }).click()
  await expect(page.getByText('no livro: Tell Probe Teste')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Coordenada' })).toContainText('no livro: 31,91320 N · 35,20710 E')
  await semRolagemHorizontal(page, 'a página do sítio corrigido')
  await foto(page, 'sitio-3-sitio-do-livro-corrigido', 'topo')

  // a busca acha o nome novo e o antigo (e a grafia acrescentada), com os mesmos objetos
  for (const q of ['tell probe corrigido', 'tell probe teste', 'khirbet probe']) {
    await page.goto(`#/busca?q=${encodeURIComponent(q)}&escopo=local`)
    await expect(page.getByRole('region', { name: 'Resultados' }).getByRole('link', { name: /CA00003/ })).toBeVisible()
  }
  await page.goto('#/busca?q=tell%20probe%20teste')
  await expect(page.getByRole('region', { name: 'Resultados' }).getByRole('link', { name: /CA00003/ })).toBeVisible()
  await foto(page, 'sitio-4-busca-nome-antigo')
  // as sugestões: uma só, com o nome de agora e o do livro dito
  const campo = page.getByRole('combobox', { name: 'Buscar' }).first()
  await campo.fill('probe teste')
  // (os objetos do sítio também levam o nome de agora no complemento; o sítio é a única opção que diz "no livro:")
  const opcao = page.getByRole('option', { name: /no livro: Tell Probe Teste/ })
  await expect(opcao).toHaveCount(1)
  await expect(opcao).toContainText('Tell Probe Corrigido')
  await foto(page, 'sitio-4-sugestao-nome-antigo')
  await campo.press('Escape')

  // a ficha do objeto mostra o nome de agora; trocar o sítio por um novo
  await page.goto('#/item/CA00003')
  const ficha = page.getByRole('group', { name: 'Ficha' })
  await expect(ficha.getByRole('link', { name: 'Tell Probe Corrigido' })).toBeVisible()
  const trocar = ficha.getByRole('button', { name: 'Escolher ou trocar o sítio' })
  await alvoOk(trocar, celular, 'Escolher ou trocar o sítio')
  await trocar.click()
  const dialogo = page.getByRole('dialog', { name: 'Sítio deste objeto' })
  await expect(dialogo).toBeVisible()
  const buscaDeSitio = dialogo.getByRole('searchbox', { name: 'Buscar entre os sítios' })
  await alvoOk(dialogo.getByRole('link', { name: 'Tell Probe Corrigido' }), celular, 'o link do sítio atual')
  await buscaDeSitio.fill('Tell Zeta da Ficha')
  // (sem o × azul nativo do WebKit: o campo é igual ao de busca do resto do app; conferido na captura sitio-5, 1280)
  const criar = dialogo.getByRole('button', { name: 'Novo sítio «Tell Zeta da Ficha»' })
  await alvoOk(criar, celular, 'Novo sítio «…»')
  await alvoOk(dialogo.getByRole('link', { name: 'Novo sítio com mais dados…' }), celular, 'Novo sítio com mais dados…')
  await foto(page, 'sitio-5-novo-sitio-na-ficha')
  await criar.click()
  await expect(dialogo).toHaveCount(0)
  await expect(ficha.getByRole('link', { name: 'Tell Zeta da Ficha' })).toBeVisible()
  await expect(ficha.getByText('no livro: Tell Probe Teste')).toBeVisible()
  await semRolagemHorizontal(page, 'a ficha com o sítio trocado')
  await foto(page, 'sitio-5-ficha-trocada', ficha)

  // o dialogo de trocar em si (com o sítio atual trocado e a lista)
  await trocar.click()
  await expect(dialogo.getByText(/^trocado por você/)).toBeVisible()
  await semRolagemHorizontal(page, 'a folha "Sítio deste objeto"')
  await foto(page, 'sitio-6-trocar-sitio')
  const voltar = dialogo.getByRole('button', { name: 'Voltar ao sítio do livro' })
  await alvoOk(voltar, celular, 'Voltar ao sítio do livro')
  await voltar.click()
  await expect(ficha.getByRole('link', { name: 'Tell Probe Corrigido' })).toBeVisible()
})

test('"Novo sítio «…»" no NovoObjeto: cria o sítio com o objeto', async ({ page }) => {
  const celular = (page.viewportSize()?.width ?? 0) < 768
  await entrar(page)
  await page.goto('#/objeto/novo')
  await page.getByLabel('Tipo e descrição curta').fill('Selo com sítio novo.')
  await page.getByRole('radio', { name: /Calcolítico/ }).click()
  const sitio = page.getByRole('combobox', { name: 'Sítio' })
  await sitio.fill('Tell Teta do Objeto')
  const opcao = page.getByRole('listbox', { name: 'Sítio' }).getByRole('option', { name: /Novo sítio «Tell Teta do Objeto»/ })
  await expect(opcao).toBeVisible()
  await alvoOk(opcao, celular, 'a opção Novo sítio')
  await foto(page, 'sitio-7-novo-sitio-no-novo-objeto', opcao)
  await opcao.click()
  await expect(page.getByText(/Será criado o sítio «Tell Teta do Objeto»/)).toBeVisible()
  await page.getByRole('button', { name: /Salvar objeto/ }).first().click()
  await expect(page).toHaveURL(/#\/item\/OB-/)
  const ficha = page.getByRole('group', { name: 'Ficha' })
  const link = ficha.getByRole('link', { name: 'Tell Teta do Objeto' })
  await expect(link).toHaveAttribute('href', /#\/sitio\/SI-/)
  await link.click()
  await expect(page.getByRole('heading', { level: celular ? 1 : 2, name: 'Tell Teta do Objeto' })).toBeVisible()
  await expect(page.getByText('SI-', { exact: false }).first()).toBeVisible()
  await semRolagemHorizontal(page, 'a página do sítio criado com o objeto')
})
