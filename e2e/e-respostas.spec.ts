import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { escreverNota } from './notasNaTela'

/**
 * As respostas do grupo E (decisão 54), no navegador de verdade, nos dois tamanhos: a lista de Sítios (região no fim da coordenada,
 * título da lista filtrada, alfinete no celular, «Novo sítio» à direita do título no computador), o erro do Dropbox na Sincronização
 * («Nada se perdeu…», «Copiar detalhes», histórico só com o título), o histórico vazio, «Minhas notas» vazia no computador e a
 * pergunta de descartar imagens. Com SHOTS_DIR definido, guarda capturas.
 */
const celular = (page: Page) => (page.viewportSize()?.width ?? 0) < 768
const semRolagemHorizontal = async (page: Page, tela: string) => {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}
async function foto(page: Page, nome: string) {
  const pasta = process.env.SHOTS_DIR
  if (!pasta) return
  mkdirSync(pasta, { recursive: true })
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
  await page.screenshot({ path: join(pasta, `${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}
async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}
async function criarSitio(page: Page, nome: string, lat: number, lon: number) {
  await page.goto('#/sitios/novo')
  await page.getByRole('textbox', { name: 'Nome', exact: true }).fill(nome)
  await page.getByRole('textbox', { name: 'Latitude' }).fill(String(lat).replace('.', ','))
  await page.getByRole('textbox', { name: 'Longitude' }).fill(String(lon).replace('.', ','))
  await page.getByRole('button', { name: 'Registrar sítio' }).click()
  await expect(page.getByRole('heading', { name: nome, exact: true }).first()).toBeVisible()
}

test('E-5: Sítios com a região no fim da coordenada, o título da lista filtrada e o ícone/«Novo sítio» de cada tamanho', async ({ page }) => {
  await entrar(page)
  await criarSitio(page, 'Tell do Egito', 27, 31)
  await criarSitio(page, 'Tell do Norte', 34.1, 35.6)
  await criarSitio(page, 'Tell do Irã', 32, 50)
  await criarSitio(page, 'Tell do Nada', 0, 0)
  await page.goto('#/sitios')
  const linha = (nome: string) => page.locator('.sitio-linha').filter({ hasText: nome })
  await expect(linha('Tell do Egito').locator('.sitio-coord')).toHaveText('27 N · 31 E · Egito')
  // a região sai da coordenada (nada do que se digita em «Região ou país»); fora das regiões a linha termina na coordenada
  await expect(linha('Tell do Irã').locator('.sitio-coord')).toHaveText('32 N · 50 E · Irã')
  await expect(linha('Tell do Nada').locator('.sitio-coord')).toHaveText('0 N · 0 E')
  await semRolagemHorizontal(page, 'Sítios')
  const mostrar = page.getByRole('button', { name: 'Mostrar Tell do Egito no mapa' })
  const alfinete = 'M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z'
  if (celular(page)) {
    await expect(mostrar.locator('path').first()).toHaveAttribute('d', alfinete)
    await expect(page.locator('.sitios-titulo-linha')).toHaveCount(0)
  } else {
    await expect(mostrar.locator('path').first()).not.toHaveAttribute('d', alfinete)
    const titulo = page.locator('.sitios-titulo-linha')
    const h1 = (await titulo.getByRole('heading', { level: 1, name: 'Sítios' }).boundingBox())!
    const novo = (await titulo.getByRole('link', { name: 'Novo sítio' }).boundingBox())!
    expect(novo.x).toBeGreaterThan(h1.x + h1.width)
    expect(Math.abs(novo.y + novo.height / 2 - (h1.y + h1.height / 2))).toBeLessThan(12)
  }
  if (!celular(page)) await expect(page.getByRole('group', { name: 'Mapa dos sítios' })).toBeVisible()
  await foto(page, 'E-5-sitios-lista')

  await page.getByRole('button', { name: /^Egito, / }).click()
  const faixa = page.locator('.sitios-contagem [role="status"]')
  await expect(faixa).toHaveText(celular(page) ? '1 sítio · Egito' : '1 sítio')
  await foto(page, 'E-5-sitios-lista-filtrada-1')
  await page.getByRole('button', { name: /^Levante Norte, / }).click()
  await expect(faixa).toHaveText(celular(page) ? '2 sítios · Levante Norte, Egito' : '2 sítios') // na ordem das etiquetas, não dos toques
  await foto(page, 'E-5-sitios-lista-filtrada-2')
  if (celular(page)) {
    await page.goto('#/sitios?regioes=levante-sul,levante-norte,transjordania,egito,mesopotamia,anatolia,ira')
    await expect(faixa).toContainText('Levante Sul, Levante Norte, Transjordânia, Egito, Mesopotâmia, Anatólia, Irã')
    const limpar = page.getByRole('button', { name: 'Limpar filtro' })
    const caixa = (await limpar.boundingBox())!
    expect(caixa.height, '«Limpar filtro» numa linha só').toBeLessThan(30)
    await semRolagemHorizontal(page, 'Sítios com muitas regiões')
    await foto(page, 'E-5-sitios-lista-filtrada-muitas')
  }
})

test('E-16: erro do Dropbox sem texto técnico na tela, com «Copiar detalhes»; com e sem alterações por enviar', async ({ page, context, dropbox }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  dropbox.usuarioReal = true
  await entrar(page)
  await page.route('**/2/files/list_folder**', (rota) => rota.fulfill({ status: 400, contentType: 'text/plain', body: 'Error in call to API function "files/list_folder": bad request' }))
  await page.goto('#/sincronizacao')
  await page.locator('.sync-corpo').getByRole('button', { name: 'Salvar e sincronizar' }).click()
  const bloco = page.locator('.sync-bloco')
  await expect(bloco).toContainText('Não foi possível falar com o Dropbox', { timeout: 30_000 })
  await expect(bloco).toContainText('Nada se perdeu: o que você fez fica neste aparelho. Toque em «Salvar e sincronizar» para tentar de novo.')
  await expect(page.getByText(/resposta 400/)).toHaveCount(0)
  await expect(page.getByText(/files\/list_folder/)).toHaveCount(0)
  const historico = page.getByRole('region', { name: 'Histórico recente' })
  await expect(historico.getByRole('listitem').first()).toHaveText(/Não foi possível sincronizar$/)
  await expect(historico).not.toContainText('Dropbox (')
  await semRolagemHorizontal(page, 'Sincronização com erro')
  await foto(page, 'E-16-sync-erro')
  await bloco.getByRole('button', { name: 'Copiar detalhes' }).click()
  await expect(page.locator('.sync-bloco .aviso-de-copia')).toHaveText('Detalhes copiados')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Não foi possível falar com o Dropbox \(resposta 400: .*files\/list_folder/)
  await foto(page, 'E-16-sync-erro-copiado')

  // No computador, o mesmo botão no painel preso ao ícone da barra (m-7): o texto técnico fica fora da tela, e o aviso aparece no painel.
  if (!celular(page)) {
    await page.goto('#/colecoes')
    await page.locator('button[aria-haspopup="dialog"][aria-keyshortcuts]').click()
    const painel = page.getByRole('dialog', { name: 'Sincronização · Dropbox' })
    await expect(painel).toBeVisible()
    await expect(painel.getByRole('button', { name: 'Copiar detalhes' })).toBeVisible()
    await expect(painel).not.toContainText('resposta 400')
    await painel.getByRole('button', { name: 'Copiar detalhes' }).click()
    await expect(painel.locator('.aviso-de-copia')).toHaveText('Detalhes copiados')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Não foi possível falar com o Dropbox \(resposta 400: /)
    await foto(page, 'E-16-sync-painel')
    await page.keyboard.press('Escape')
    await expect(painel).toHaveCount(0)
  }

  // Com uma alteração por enviar (a rodada seguinte também falha): a contagem vai para o fim da frase.
  await page.goto('#/item/CA00001')
  await escreverNota(page, 'Nota TESTE do erro')
  await page.goto('#/sincronizacao')
  await page.locator('.sync-corpo').getByRole('button', { name: 'Salvar e sincronizar' }).click()
  await expect(bloco).toContainText(/Nada se perdeu: \d+ alterações guardadas neste aparelho\. Toque em «Salvar e sincronizar» para tentar de novo\./, { timeout: 30_000 })
  await expect(page.getByText(/resposta 400/)).toHaveCount(0)
  await foto(page, 'E-16-sync-erro-com-pendentes')

  // Se a área de transferência recusar (m-3): o texto técnico aparece, selecionado, para copiar à mão.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('recusado')) }, configurable: true })
  })
  await bloco.getByRole('button', { name: 'Copiar detalhes' }).click()
  await expect(page.locator('.sync-bloco .aviso-de-copia')).toHaveText('Selecione e copie')
  const tecnico = bloco.locator('.sync-detalhe-tecnico')
  await expect(tecnico).toContainText('Não foi possível falar com o Dropbox (resposta 400: ')
  expect(await page.evaluate(() => window.getSelection()!.toString())).toBe((await tecnico.textContent())!)
  await semRolagemHorizontal(page, 'Sincronização, cópia recusada')
  await foto(page, 'E-16-sync-erro-copia-recusada')
})

test('E-17: o histórico vazio não desmente a última sincronização', async ({ page }) => {
  await entrar(page)
  await page.goto('#/sincronizacao')
  await expect(page.locator('.sync-estado-tela [role="status"]')).toContainText('Sincronizado', { timeout: 30_000 })
  const historico = page.getByRole('region', { name: 'Histórico recente' })
  await expect(historico).toContainText('Nada a contar ainda. Aqui aparecem as edições do mesmo campo nos dois aparelhos, as esperas sem internet e as falhas.')
  await expect(page.getByText(/Nenhuma sincronização registrada/)).toHaveCount(0)
  await semRolagemHorizontal(page, 'Sincronização, histórico vazio')
  await historico.scrollIntoViewIfNeeded()
  await foto(page, 'E-17-sync-historico-vazio')
})

test('E-18: «Minhas notas» sem nota: o painel da direita fica em branco; com nota, continua pedindo para escolher', async ({ page }) => {
  await entrar(page)
  await page.goto('#/notas')
  await expect(page.getByText('Nenhuma nota ainda.')).toBeVisible()
  await expect(page.getByText('Escolha uma nota na lista.')).toHaveCount(0)
  if (!celular(page)) await expect(page.locator('.lista-principal')).toHaveText('')
  await semRolagemHorizontal(page, 'Minhas notas vazia')
  await foto(page, 'E-18-notas-vazio')
  if (!celular(page)) {
    await page.goto('#/item/CA00001')
    await escreverNota(page, 'Nota TESTE para a lista')
    await page.goto('#/notas')
    await expect(page.getByText('Escolha uma nota na lista.')).toBeVisible()
    await foto(page, 'E-18-notas-com-nota')
  }
})

test('E-19: descartar imagens: «Voltar à imagem»/«Descartar a imagem» e, no plural, «Voltar às imagens»/«Descartar as imagens»', async ({ page }) => {
  await entrar(page)
  await page.goto('#/item/CA00001')
  const painel = page.getByRole('region', { name: 'Imagem' }).first()
  await painel.getByRole('button', { name: 'Adicionar imagem' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Adicionar imagem a CA00001' })
  await expect(dialogo).toBeVisible()
  const entrada = page.locator(`input[type="file"][data-origem="${celular(page) ? 'galeria' : 'arquivos'}"]`)
  const desenho = async (nome: string) =>
    page.evaluate(async (n) => {
      const c = new OffscreenCanvas(300, 200)
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 300, 200)
      ctx.strokeStyle = '#000'
      ctx.beginPath()
      ctx.arc(150, 100, 60, 0, Math.PI * 2)
      ctx.stroke()
      const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 })).arrayBuffer())
      let s = ''
      for (const b of bytes) s += String.fromCharCode(b)
      return { name: n, base64: btoa(s) }
    }, nome)
  const arquivo = async (nome: string) => {
    const { name, base64 } = await desenho(nome)
    return { name, mimeType: 'image/jpeg', buffer: Buffer.from(base64, 'base64') }
  }

  await entrada.setInputFiles(await arquivo('um.jpg'))
  await expect(dialogo.getByRole('radio', { name: /^Desenho de traço/ })).toBeChecked({ timeout: 20_000 })
  await dialogo.getByRole('textbox', { name: 'Crédito / fonte' }).click()
  await page.keyboard.press('Escape')
  const pergunta = page.getByRole('alertdialog', { name: 'Descartar 1 imagem?' })
  await expect(pergunta).toBeVisible()
  await expect(pergunta.getByRole('button', { name: 'Voltar à imagem' })).toBeFocused()
  await expect(pergunta.getByRole('button', { name: 'Descartar a imagem' })).toBeVisible()
  await expect(pergunta).toContainText('A escolha e o que foi escrito se perdem.')
  await semRolagemHorizontal(page, 'Descartar 1 imagem')
  // m-9: no celular estreito cada rótulo cabe numa linha só (os dois botões empilhados)
  for (const nome of ['Voltar à imagem', 'Descartar a imagem']) {
    const linhas = await pergunta.getByRole('button', { name: nome }).evaluate((e) => {
      const r = document.createRange()
      r.selectNodeContents(e)
      return new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size
    })
    expect(linhas, `linhas do rótulo «${nome}»`).toBe(1)
  }
  await foto(page, 'E-19-descartar-singular')
  await pergunta.getByRole('button', { name: 'Voltar à imagem' }).click()
  await expect(pergunta).toHaveCount(0)

  // No celular a folha leva uma imagem por vez: o plural só existe no diálogo do computador.
  if (celular(page)) return
  await entrada.setInputFiles(await arquivo('dois.jpg'))
  await expect(dialogo.getByText('2 imagens para adicionar')).toBeVisible({ timeout: 20_000 })
  await dialogo.getByRole('textbox', { name: 'Crédito / fonte' }).first().click()
  await page.keyboard.press('Escape')
  const plural = page.getByRole('alertdialog', { name: 'Descartar 2 imagens?' })
  await expect(plural).toBeVisible()
  await expect(plural.getByRole('button', { name: 'Voltar às imagens' })).toBeFocused()
  await expect(plural.getByRole('button', { name: 'Descartar as imagens' })).toBeVisible()
  await foto(page, 'E-19-descartar-plural')
  await plural.getByRole('button', { name: 'Descartar as imagens' }).click()
  await expect(dialogo).toHaveCount(0)
})
