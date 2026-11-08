import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { alvoOk, celular, entrar, foto, semRolagemHorizontal, tituloDoSitio } from './sitiosNaTela'
import { apertarAteAparecer } from './teclas'

/**
 * «Sítios que podem ser o mesmo» na Revisão (Parte 2C, bloco 2; telas aprovadas §6), no navegador de verdade, nos dois tamanhos,
 * sobre o pacote sintético (TESTE: Maḥteṣ Teste × Maḥtiṣ Teste por nome; Maḥteṣ Teste × Ḫirbet Vizinha Teste por coordenada):
 * o grupo com 2; «São lugares diferentes» no par por nome, a tecla U desfaz, de novo e fica (recarregando); «Um é parte do
 * outro…» no par por coordenada (a escolha no lugar, o foco em «Cancelar» e de volta ao gatilho; «Desfazer» na linha); e
 * «Mesclar…», que chega à caixa «Qual fica?» na página do sítio (no computador, no painel à direita da lista de sítios), e depois
 * o par aparece como mesclado. Sem rolagem horizontal; alvos de 44 px no toque e 36 com o mouse. Com SHOTS_DIR, capturas.
 */
const ROTULO = 'Sítios que podem ser o mesmo'
const POR_NOME = 'par_TESTE-1_TESTE-7'
const POR_COORDENADA = 'par_TESTE-1_TESTE-8'
const grupo = (page: Page) => page.getByRole('button', { name: new RegExp(`^${ROTULO}`) })
const abertos = (page: Page) => page.getByRole('list', { name: `Pares de ${ROTULO}` })
const resolvidos = (page: Page) => page.getByRole('list', { name: `Resolvidos de ${ROTULO}` })
const par = (page: Page, chave: string) => abertos(page).locator(`[data-chave="${chave}"]`)
const total = (page: Page, n: number) => expect(page.getByText(new RegExp(`^${n} casos? · o que o processamento não decidiu sozinho`))).toBeVisible()
const aviso = (page: Page) => page.locator('.revisao-aviso')

/** Abre um par (se fechado) e devolve a linha. */
async function abrirPar(page: Page, chave: string) {
  const linha = par(page, chave)
  const cabeca = linha.locator('.revisao-par-cabeca')
  if ((await cabeca.getAttribute('aria-expanded')) !== 'true') await cabeca.click()
  await expect(cabeca).toHaveAttribute('aria-expanded', 'true')
  return linha
}

test('os pares de sítios: lugares diferentes (e a tecla U), um é parte do outro, e «Mesclar…» até a caixa', async ({ page }) => {
  await entrar(page)
  await page.goto('#/revisao')
  await total(page, 9)
  await expect(grupo(page).locator('.revisao-grupo-quantidade')).toHaveText('2')
  await alvoOk(grupo(page), page, 'o grupo dos pares')
  await grupo(page).click()
  await expect(abertos(page).getByRole('listitem').and(page.locator('.revisao-par'))).toHaveCount(2)
  await expect(par(page, POR_NOME)).toContainText('Nome parecido')
  await expect(par(page, POR_NOME)).toContainText('Maḥteṣ Teste e Maḥtiṣ Teste')
  await expect(par(page, POR_COORDENADA)).toContainText('Mesma coordenada')
  await expect(par(page, POR_COORDENADA)).toContainText('Maḥteṣ Teste e Ḫirbet Vizinha Teste')
  await semRolagemHorizontal(page, 'o grupo dos pares')
  await foto(page, 'pares-1-grupo', grupo(page))

  // 1. O par por nome, aberto: os dois lado a lado e as três saídas.
  const porNome = await abrirPar(page, POR_NOME)
  await expect(porNome).toContainText('Nome parecido: Maḥteṣ Teste ~ Maḥtiṣ Teste')
  await expect(porNome.getByRole('group', { name: 'Maḥteṣ Teste' })).toContainText('TESTE-1')
  await expect(porNome.getByRole('group', { name: 'Maḥtiṣ Teste' })).toContainText('TESTE-7')
  const nomeDoLado = porNome.getByRole('group', { name: 'Maḥtiṣ Teste' }).getByRole('link', { name: 'Maḥtiṣ Teste' })
  await expect(nomeDoLado).toHaveAttribute('href', /#\/sitio\/TESTE-7$/)
  await alvoOk(nomeDoLado, page, 'o nome de um lado do par')
  const diferentes = porNome.getByRole('button', { name: 'São lugares diferentes' })
  for (const [alvo, nome] of [
    [porNome.getByRole('link', { name: 'Mesclar…' }), '«Mesclar…»'],
    [diferentes, '«São lugares diferentes»'],
    [porNome.getByRole('button', { name: 'Um é parte do outro…' }), '«Um é parte do outro…»'],
  ] as const)
    await alvoOk(alvo, page, nome)
  await semRolagemHorizontal(page, 'o par aberto')
  await foto(page, 'pares-2-par-aberto', porNome)

  // 2. «São lugares diferentes»: sai dos abertos, vai para «Resolvidos por você»; o aviso tem «Desfazer».
  await diferentes.click()
  await expect(aviso(page)).toContainText('Maḥteṣ Teste e Maḥtiṣ Teste: lugares diferentes.')
  await expect(par(page, POR_NOME)).toHaveCount(0)
  await expect(resolvidos(page)).toContainText('Maḥteṣ Teste e Maḥtiṣ Teste')
  await expect(resolvidos(page)).toContainText('lugares diferentes')
  await expect(grupo(page).locator('.revisao-grupo-quantidade')).toHaveText('1')
  await total(page, 8)
  // o foco vai ao par vizinho (o cabeçalho dele), não se perde
  await expect(par(page, POR_COORDENADA).locator('.revisao-par-cabeca')).toBeFocused()
  await semRolagemHorizontal(page, 'o par resolvido')
  await foto(page, 'pares-3-diferentes', aviso(page))

  // 3. A tecla U desfaz: o par volta aos abertos.
  await apertarAteAparecer(page, 'u', par(page, POR_NOME))
  await expect(resolvidos(page)).toHaveCount(0)
  await expect(grupo(page).locator('.revisao-grupo-quantidade')).toHaveText('2')
  await total(page, 9)

  // 4. De novo, e fica (recarregando).
  await (await abrirPar(page, POR_NOME)).getByRole('button', { name: 'São lugares diferentes' }).click()
  await expect(resolvidos(page)).toContainText('Maḥteṣ Teste e Maḥtiṣ Teste')
  await page.reload()
  await total(page, 8)
  await expect(grupo(page).locator('.revisao-grupo-quantidade')).toHaveText('1')
  if ((await grupo(page).getAttribute('aria-expanded')) !== 'true') await grupo(page).click()
  await expect(par(page, POR_NOME)).toHaveCount(0)
  await expect(resolvidos(page)).toContainText('lugares diferentes')

  // 5. O par por coordenada: «Um é parte do outro…» troca os botões pela escolha, com o foco em «Cancelar».
  const porCoordenada = await abrirPar(page, POR_COORDENADA)
  const umEParte = porCoordenada.getByRole('button', { name: 'Um é parte do outro…' })
  await umEParte.click()
  const qual = porCoordenada.getByRole('group', { name: 'Qual é a parte?' })
  await expect(qual.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await expect(qual.getByRole('radio', { name: 'Ḫirbet Vizinha Teste é parte de Maḥteṣ Teste' })).toBeChecked()
  await expect(qual.getByRole('radio', { name: 'Maḥteṣ Teste é parte de Ḫirbet Vizinha Teste' })).not.toBeChecked()
  await alvoOk(qual.locator('.revisao-par-opcao').first(), page, 'a opção da parte')
  await alvoOk(qual.getByRole('button', { name: 'Marcar como parte' }), page, '«Marcar como parte»')
  await semRolagemHorizontal(page, '«Qual é a parte?»')
  await foto(page, 'pares-4-qual-e-a-parte', qual)
  await qual.getByRole('button', { name: 'Cancelar' }).click()
  await expect(qual).toHaveCount(0)
  await expect(umEParte).toBeFocused()
  await umEParte.click()
  await qual.getByRole('button', { name: 'Marcar como parte' }).click()
  await expect(aviso(page)).toContainText('Maḥteṣ Teste e Ḫirbet Vizinha Teste: um é parte do outro.')
  await expect(par(page, POR_COORDENADA)).toHaveCount(0)
  const linhaParte = resolvidos(page).getByRole('listitem').filter({ hasText: 'Ḫirbet Vizinha Teste' })
  await expect(linhaParte).toContainText('um é parte do outro')
  await total(page, 7)
  // «Desfazer» na linha: o par volta.
  const desfazerParte = linhaParte.getByRole('button', { name: 'Desfazer: Maḥteṣ Teste e Ḫirbet Vizinha Teste' })
  await alvoOk(desfazerParte, page, '«Desfazer» na linha')
  await desfazerParte.click()
  await expect(par(page, POR_COORDENADA)).toBeVisible()
  await total(page, 8)

  // 6. «Mesclar…» leva à página do sugerido para ficar, já em «Qual fica?» (no computador, no painel à direita da lista).
  await (await abrirPar(page, POR_COORDENADA)).getByRole('link', { name: 'Mesclar…' }).click()
  await expect(page).toHaveURL(/#\/sitio\/TESTE-1\?mesclar=TESTE-8$/)
  await expect(tituloDoSitio(page, 'Maḥteṣ Teste')).toBeVisible()
  if (!celular(page)) {
    // o painel da direita: a lista dos sítios continua ao lado
    await expect(page.getByRole('heading', { level: 1, name: 'Sítios' })).toBeVisible()
    await expect(page.locator('a.lista-linha').filter({ hasText: 'Tell Probe Teste' })).toBeVisible()
  }
  const caixa = page.getByRole('group', { name: 'Mesclar Maḥteṣ Teste e Ḫirbet Vizinha Teste' })
  await expect(caixa.getByRole('group', { name: 'Qual fica?' })).toBeVisible()
  await expect(caixa.getByRole('radio', { name: /Maḥteṣ Teste/ })).toBeChecked()
  await expect(caixa.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await semRolagemHorizontal(page, 'a caixa «Qual fica?» vinda da Revisão')
  await foto(page, 'pares-5-mesclar-da-revisao', caixa)
  await caixa.getByRole('button', { name: 'Mesclar' }).click()
  await expect(caixa).toHaveCount(0)
  await expect(page).toHaveURL(/#\/sitio\/TESTE-1$/)
  await expect(page.locator('dt:text-is("Mesclado aqui") + dd')).toContainText('Ḫirbet Vizinha Teste')

  // De volta à Revisão: o par está entre os resolvidos, como mesclado.
  await page.goto(`#/revisao?abrir=sitios-que-podem-ser-o-mesmo`)
  await total(page, 7)
  await expect(resolvidos(page).getByRole('listitem').filter({ hasText: 'Ḫirbet Vizinha Teste' })).toContainText('mesclados')
  await semRolagemHorizontal(page, 'a Revisão com os dois pares resolvidos')
  await foto(page, 'pares-6-resolvidos', resolvidos(page))
})
