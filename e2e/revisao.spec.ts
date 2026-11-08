import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * A Revisão com ações (Tarefa 13) no navegador de verdade, nos dois tamanhos, sobre o pacote sintético (TESTE): os grupos que
 * abrem, o lugar certo de cada tipo (citação → bibliografia, tradução → verbete, rascunho → escolha do período, sítio solto →
 * ficha no Sítio), «Deixar como está» e «Desfazer» (que sobrevivem a recarregar), a mesma contagem na página, no Menu e no ponto
 * da barra, e a volta à Revisão com os grupos abertos. Com SHOTS_DIR definido, guarda capturas.
 */
const celular = (page: Page) => (page.viewportSize()?.width ?? 0) < 768
async function foto(page: Page, nome: string, ver?: Locator | 'topo') {
  const pasta = process.env.SHOTS_DIR
  if (!pasta) return
  mkdirSync(pasta, { recursive: true })
  if (ver === 'topo') await page.evaluate(() => window.scrollTo(0, 0))
  else await ver?.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: join(pasta, `${nome}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false })
}
async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}
async function alvoOk(el: Locator, celularOuNao: boolean, nome: string) {
  const caixa = (await el.boundingBox())!
  expect(Math.min(caixa.width, caixa.height), `alvo de ${nome}`).toBeGreaterThanOrEqual((celularOuNao ? 44 : 36) - 0.5)
}
const semRolagemHorizontal = async (page: Page, tela: string) => {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}
const total = async (page: Page) => Number(/^([\d.]+) casos?/.exec((await page.getByText(/ · o que o processamento não decidiu sozinho/).textContent()) ?? '')![1]!.replace('.', ''))

/** O número que o Menu mostra ao lado de «Revisão» (no celular o Menu abre do Início; no computador, da barra). */
async function contagemDoMenu(page: Page): Promise<number> {
  const volta = page.url()
  if (celular(page)) {
    await page.goto('#/')
    await page.getByRole('button', { name: 'Abrir o menu' }).click()
  } else {
    await page.getByRole('button', { name: 'Menu' }).click()
  }
  const link = page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: /^Revisão/ })
  await expect(link).toContainText(/\d casos?/)
  const n = Number(/([\d.]+) casos?/.exec((await link.textContent())!)![1]!.replace('.', ''))
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0)
  await page.goto(volta.slice(volta.indexOf('#')))
  return n
}

test('Revisão: ações por tipo, Deixar como está e Desfazer, a mesma conta no Menu e na barra, e a volta com os grupos abertos', async ({ page }) => {
  const toque = celular(page)
  await entrar(page)

  // Dois objetos SKC para termos mais tipos na fila: um rascunho («Ainda não sei») e um com o sítio só escrito.
  await page.goto('#/objeto/novo')
  await page.getByLabel('Tipo e descrição curta').fill('Rascunho sintético sem período.')
  await page.getByRole('radio', { name: 'Ainda não sei' }).click()
  await page.getByRole('button', { name: /Salvar rascunho/ }).first().click()
  await expect(page).toHaveURL(/#\/item\/OB-[a-z0-9]{8}-\d+/)
  await expect(page.getByRole('heading', { level: 1, name: 'Rascunho sintético sem período.' })).toBeVisible()
  await page.goto('#/objeto/novo')
  await page.getByLabel('Tipo e descrição curta').fill('Selo sintético com sítio solto.')
  await page.getByRole('radiogroup', { name: 'Período' }).getByRole('radio', { name: /Calcolítico/ }).click()
  await page.getByRole('combobox', { name: 'Sítio' }).fill('Miš de Teste')
  await page.getByRole('button', { name: /Salvar objeto/ }).first().click()
  await expect(page).toHaveURL(/#\/item\/OB-[a-z0-9]{8}-\d+/)
  await expect(page.getByRole('heading', { level: 1, name: 'Selo sintético com sítio solto.' })).toBeVisible()

  // A página: 2 do pacote + 4 verbetes a revisar + 1 elemento sem região + o rascunho + o sítio solto + os 2 pares de sítios que
  // podem ser o mesmo (Tarefa 15, 2C bloco 2).
  await page.goto('#/revisao')
  await expect(page.getByRole('heading', { level: 1, name: 'Revisão' })).toBeVisible()
  await expect(page.getByText(/^11 casos · o que o processamento não decidiu sozinho/)).toBeVisible()
  await foto(page, 'revisao-1-grupos', 'topo')
  await semRolagemHorizontal(page, 'Revisão fechada')
  const verbetes = page.getByRole('link', { name: /^Verbetes a revisar/ })
  await expect(verbetes).toHaveAttribute('href', /#\/glossario\?revisar=1$/)
  await alvoOk(verbetes, toque, 'o grupo Verbetes a revisar')

  // Citação: o lugar certo é a bibliografia, procurando o autor.
  await page.getByRole('button', { name: /^Citações não resolvidas/ }).click()
  const citacoes = page.getByRole('list', { name: 'Casos de Citações não resolvidas' })
  await expect(citacoes).toContainText('Fantasma 1888: 3')
  const resolverCitacao = citacoes.getByRole('link', { name: 'Resolver na bibliografia' })
  await expect(resolverCitacao).toHaveAttribute('href', /#\/bibliografia\?filtro=Fantasma$/)
  await alvoOk(resolverCitacao, toque, 'Resolver na bibliografia')
  await alvoOk(citacoes.getByRole('button', { name: /^Deixar como está/ }), toque, 'Deixar como está')
  await foto(page, 'revisao-2-citacao', citacoes)
  await semRolagemHorizontal(page, 'Revisão com citações')

  // Tradução: abre o verbete.
  await page.getByRole('button', { name: /^Traduções com termo alterado/ }).click()
  await expect(page.getByRole('list', { name: 'Casos de Traduções com termo alterado' }).getByRole('link', { name: 'Abrir o verbete' })).toHaveAttribute('href', /#\/verbete\/GL-900003$/)
  await foto(page, 'revisao-3-traducao', page.getByRole('list', { name: 'Casos de Traduções com termo alterado' }))

  // Rascunho e sítio solto (objetos SKC).
  await page.getByRole('button', { name: /^Objetos sem número/ }).click()
  const rascunhos = page.getByRole('list', { name: 'Casos de Objetos sem número' })
  await expect(rascunhos).toContainText('Rascunho sintético sem período.')
  await expect(rascunhos.getByRole('link', { name: 'Escolher o período' })).toHaveAttribute('href', /\?corrigir=periodo$/)
  await foto(page, 'revisao-4-rascunho', rascunhos)
  await page.getByRole('button', { name: /^Sítios não resolvidos/ }).click()
  const sitios = page.getByRole('list', { name: 'Casos de Sítios não resolvidos' })
  await expect(sitios).toContainText('«Miš de Teste» ainda não é um sítio do banco')
  await foto(page, 'revisao-5-sitio', sitios)
  await semRolagemHorizontal(page, 'Revisão com tudo aberto')

  // A mesma conta na página e no Menu (e, no computador, no ponto da barra).
  await page.goto('#/revisao?abrir=citacoes-nao-resolvidas,objetos-sem-numero,sitios-nao-resolvidos')
  expect(await total(page)).toBe(11)
  expect(await contagemDoMenu(page)).toBe(11)
  if (!toque) await expect(page.getByRole('link', { name: 'Revisão, 11 pendências', exact: true })).toBeVisible()

  // Deixar como está na citação: desce um em todo lugar, o caso passa para «Resolvidos por você», o foco não se perde.
  await page.getByRole('button', { name: /^Deixar como está: / }).first().click()
  await expect(page.getByText(/^10 casos · /)).toBeVisible()
  await expect(page.locator('.revisao-aviso')).toContainText('marcado como resolvido')
  await expect(page.getByRole('heading', { level: 3, name: 'Resolvidos por você · 1' })).toBeVisible()
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')
  expect(await contagemDoMenu(page)).toBe(10)
  if (!toque) await expect(page.getByRole('link', { name: 'Revisão, 10 pendências', exact: true })).toBeVisible()
  await foto(page, 'revisao-6-resolvido-com-desfazer', page.getByRole('heading', { level: 3, name: 'Resolvidos por você · 1' }))
  await alvoOk(page.getByRole('button', { name: /^Desfazer: / }).first(), toque, 'Desfazer')

  // Recarregar: continua resolvido; Desfazer devolve à fila (e o Menu acompanha).
  await page.reload()
  await expect(page.getByText(/^10 casos · /)).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: 'Resolvidos por você · 1' })).toBeVisible()
  await page.getByRole('button', { name: /^Desfazer: / }).first().click()
  await expect(page.getByText(/^11 casos · /)).toBeVisible()
  expect(await contagemDoMenu(page)).toBe(11)

  // O lugar certo: «Escolher o período» abre o rascunho na escolha do período; voltar encontra a Revisão como estava.
  await page.getByRole('link', { name: 'Escolher o período' }).click()
  const periodo = page.getByRole('radiogroup', { name: 'Período' })
  await expect(periodo).toBeVisible()
  await expect.poll(() => periodo.evaluate((g) => g.contains(document.activeElement))).toBe(true)
  await expect(page).not.toHaveURL(/corrigir=/)
  await foto(page, 'revisao-7-periodo-aberto')
  await page.goBack()
  await expect(page.getByRole('list', { name: 'Casos de Objetos sem número' })).toBeVisible()
  await expect(page).toHaveURL(/abrir=/)

  // «Traduções não revisadas»: só consulta. Mostra a contagem e o aviso, tem as linhas limitadas, e não mexe no total.
  await page.goto('#/revisao?abrir=traducoes-nao-revisadas')
  const traducoes = page.getByRole('list', { name: 'Casos de Traduções não revisadas' })
  await expect(traducoes).toBeVisible()
  await expect(page.getByText('Só para consulta: não entra no total.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Traduções não revisadas/ })).toContainText('26')
  await expect(traducoes.getByRole('listitem')).toHaveCount(25)
  await expect(page.getByRole('button', { name: 'Mostrar mais 1 (25 de 26)' })).toBeVisible()
  await expect(traducoes.getByRole('button', { name: /Deixar como está/ })).toHaveCount(0)
  expect(await total(page)).toBe(11)
  await foto(page, 'revisao-8-traducoes-so-consulta', page.getByRole('button', { name: /^Traduções não revisadas/ }))
  await semRolagemHorizontal(page, 'Revisão com as traduções')

  // «Regiões a desenhar»: o visualizador abre pronto para desenhar o elemento; salvar a região resolve o caso.
  await page.goto('#/revisao?abrir=regioes-a-desenhar')
  const regioes = page.getByRole('list', { name: 'Casos de Regiões a desenhar' })
  await expect(regioes).toContainText('leão-de-teste (Testlöwe)')
  await foto(page, 'revisao-9-regioes', regioes)
  const desenharLink = regioes.getByRole('link', { name: 'Desenhar a região' })
  await alvoOk(desenharLink, toque, 'Desenhar a região')
  await desenharLink.click()
  await expect(page).toHaveURL(/#\/imagem\/IMG-TESTE-0001-1\?desenhar=EL-900002$/)
  const camada = page.getByTestId('desenho-camada')
  await expect(camada).toBeVisible()
  const caixa = (await camada.boundingBox())!
  for (const [x, y] of [[0.2, 0.2], [0.6, 0.2], [0.6, 0.6], [0.2, 0.6]] as const) {
    if (toque) await page.touchscreen.tap(caixa.x + caixa.width * x, caixa.y + caixa.height * y)
    else await page.mouse.click(caixa.x + caixa.width * x, caixa.y + caixa.height * y)
  }
  await page.getByRole('button', { name: 'Concluir a região' }).click()
  await expect(page.getByRole('combobox', { name: 'Ou é mais uma região de' })).toHaveValue('EL-900002')
  await foto(page, 'revisao-10-desenhando-o-elemento')
  await page.getByRole('button', { name: 'Salvar a região' }).click()
  // T17-B-21: o elemento da Revisão já foi atendido: o endereço perde o `?desenhar=` e uma nova marcação não vem travada nele
  await expect(page).toHaveURL(/#\/imagem\/IMG-TESTE-0001-1$/)
  await page.getByRole('button', { name: 'Fechar o visualizador' }).click()
  await expect(page).toHaveURL(/#\/revisao\?abrir=regioes-a-desenhar$/)
  await expect(page.getByText(/^10 casos · /)).toBeVisible()
  expect(await contagemDoMenu(page)).toBe(10)
  if (!toque) await expect(page.getByRole('link', { name: 'Revisão, 10 pendências', exact: true })).toBeVisible()

  // T17-B-22: aberto direto no endereço (primeira entrada da sessão do roteador), «Fechar» leva ao objeto e não sai do app pelo histórico
  await page.goto('#/imagem/IMG-TESTE-0001-1?desenhar=EL-900002')
  await page.getByRole('button', { name: 'Fechar o visualizador' }).click()
  await expect(page).toHaveURL(/#\/item\/[A-Z]{2}\d{5}/)
})
