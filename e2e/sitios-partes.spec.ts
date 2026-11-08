import { expect, test } from './fixtures'
import { abrirSitio, alvoOk, codigoDoSitio, entrar, foto, semRolagemHorizontal } from './sitiosNaTela'

/**
 * As partes de um sítio (Parte 2C, bloco 2; telas aprovadas §3), no navegador de verdade, nos dois tamanhos, sobre o pacote
 * sintético (TESTE: Área Probe Teste é parte de Tell Probe Teste, e Túmulo Probe Teste é parte da Área): a seção «Partes» em
 * árvore; ligar um objeto do livro ao túmulo pela folha «Sítio deste objeto» (a busca acha a parte, com o caminho); o objeto conta
 * no todo («, 1 nas partes») e a grade diz de onde ele vem; o caminho com links na página da parte; «Não é parte de outro» e
 * «Desfazer»; e, na caixa «Marcar como parte de…», os avisos do que ela não oferece (uma parte do próprio sítio, um sítio
 * mesclado). Sem rolagem horizontal; alvos de 44 px no toque e 36 com o mouse. Com SHOTS_DIR definido, guarda capturas.
 */
test('a árvore das partes, um objeto ligado a uma parte, o caminho, soltar e desfazer, e os avisos da caixa «Marcar como parte de…»', async ({ page }) => {
  await entrar(page)

  // 1. A seção «Partes» do todo: 2 (todos os níveis), o túmulo recuado sob a área.
  await abrirSitio(page, 'TESTE-2', 'Tell Probe Teste')
  const partes = page.getByRole('region', { name: 'Partes' })
  await expect(partes.locator('.detalhe-secao-topo')).toHaveText(/^Partes\s*2$/)
  const area = partes.locator('.sitio-parte[data-nivel="1"]')
  await expect(area).toHaveCount(1)
  await expect(area.getByRole('link', { name: 'Área Probe Teste' })).toHaveAttribute('href', /#\/sitio\/TESTE-5$/)
  const tumulo = partes.locator('.sitio-parte[data-nivel="2"]')
  await expect(tumulo).toHaveCount(1)
  await expect(tumulo.locator('.sitio-parte-nome')).toHaveText(/^└\s*Túmulo Probe Teste$/)
  await expect(tumulo.getByRole('link', { name: 'Túmulo Probe Teste' })).toHaveAttribute('href', /#\/sitio\/TESTE-6$/)
  await alvoOk(area.getByRole('link', { name: 'Área Probe Teste' }), page, 'o link da parte')
  const antes = Number(/· (\d+) objetos?/.exec((await codigoDoSitio(page).textContent()) ?? '')![1])
  await expect(codigoDoSitio(page)).not.toContainText('nas partes')
  await semRolagemHorizontal(page, 'o todo com as partes')
  await foto(page, 'partes-1-arvore', partes)

  // 2. Ligar TESTE-0001 (CA00001) ao túmulo pela folha «Sítio deste objeto»: a busca acha a parte, com o caminho no apoio.
  await page.goto('#/item/CA00001')
  const ficha = page.getByRole('group', { name: 'Ficha' })
  await ficha.getByRole('button', { name: 'Escolher ou trocar o sítio' }).click()
  const folha = page.getByRole('dialog', { name: 'Sítio deste objeto' })
  await folha.getByRole('searchbox', { name: 'Buscar entre os sítios' }).fill('túmulo')
  const lista = folha.getByRole('radiogroup', { name: 'Escolher o novo sítio' })
  await expect(lista.locator('.trocar-sitio-lista-topo')).toHaveText(/^Resultado\s*1$/)
  const opcao = lista.getByRole('radio', { name: /Túmulo Probe Teste/ })
  await expect(opcao).toHaveCount(1)
  await expect(opcao.locator('.trocar-sitio-opcao-apoio')).toHaveText('Tell Probe Teste › Área Probe Teste · 0 objetos')
  await alvoOk(opcao, page, 'a opção Túmulo Probe Teste')
  await semRolagemHorizontal(page, 'a folha «Sítio deste objeto» com a parte')
  await foto(page, 'partes-2-folha-com-a-parte')
  await opcao.click()
  await folha.getByRole('button', { name: 'Trocar', exact: true }).click()
  await expect(folha).toHaveCount(0)
  await expect(ficha.getByRole('link', { name: 'Túmulo Probe Teste' })).toBeVisible()

  // 3. O todo conta o objeto da parte («, 1 nas partes»), e o cartão diz de onde ele vem.
  await abrirSitio(page, 'TESTE-2', 'Tell Probe Teste')
  await expect(codigoDoSitio(page)).toHaveText(`TESTE-2 · ${antes + 1} objetos, 1 nas partes`)
  const cartao = page.getByRole('region', { name: 'Objetos deste sítio' }).getByRole('link', { name: /CA00001/ })
  await expect(cartao).toContainText('em Túmulo Probe Teste')
  await expect(partes.locator('.sitio-parte[data-nivel="1"] .sitio-parte-n')).toHaveText('1 objeto')
  await expect(partes.locator('.sitio-parte[data-nivel="2"] .sitio-parte-n')).toHaveText('1 objeto')
  await semRolagemHorizontal(page, 'o todo com o objeto da parte')
  await foto(page, 'partes-3-todo-com-o-objeto', cartao)

  // 4. A página do túmulo: o caminho com links, do todo mais alto a ela (sem link).
  await abrirSitio(page, 'TESTE-6', 'Túmulo Probe Teste')
  const caminho = page.getByRole('navigation', { name: 'Caminho' })
  await expect(caminho).toHaveText(/^Tell Probe Teste\s*›\s*Área Probe Teste\s*›\s*Túmulo Probe Teste$/)
  const linkTell = caminho.getByRole('link', { name: 'Tell Probe Teste' })
  const linkArea = caminho.getByRole('link', { name: 'Área Probe Teste' })
  await expect(linkTell).toHaveAttribute('href', /#\/sitio\/TESTE-2$/)
  await expect(linkArea).toHaveAttribute('href', /#\/sitio\/TESTE-5$/)
  await alvoOk(linkTell, page, 'o link «Tell Probe Teste» do caminho')
  await alvoOk(linkArea, page, 'o link «Área Probe Teste» do caminho')
  await expect(caminho.getByRole('link')).toHaveCount(2)
  await expect(codigoDoSitio(page)).toHaveText('TESTE-6 · 1 objeto')
  await semRolagemHorizontal(page, 'a página da parte')
  await foto(page, 'partes-4-caminho', 'topo')

  // 5. «Não é parte de outro» solta na hora; «Desfazer» (com o foco) a devolve, e o foco volta ao link.
  const soltar = page.getByRole('button', { name: 'Não é parte de outro' })
  await alvoOk(soltar, page, '«Não é parte de outro»')
  await soltar.click()
  const solta = page.getByRole('status').filter({ hasText: 'Túmulo Probe Teste não é mais parte de Área Probe Teste.' })
  await expect(solta).toBeVisible()
  const desfazer = solta.getByRole('button', { name: 'Desfazer' })
  await expect(desfazer).toBeFocused()
  await alvoOk(desfazer, page, '«Desfazer»')
  await expect(caminho).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Não é parte de outro' })).toHaveCount(0)
  await semRolagemHorizontal(page, 'a parte solta')
  await foto(page, 'partes-5-solta', solta)
  await desfazer.click()
  await expect(caminho).toHaveText(/^Tell Probe Teste\s*›\s*Área Probe Teste\s*›\s*Túmulo Probe Teste$/)
  await expect(page.getByRole('button', { name: 'Não é parte de outro' })).toBeFocused()
  await expect(solta).toHaveCount(0)

  // 6. A caixa «Marcar como parte de…» da área: uma parte dela e um sítio mesclado não se oferecem, e a linha diz por quê.
  await abrirSitio(page, 'TESTE-5', 'Área Probe Teste')
  const marcar = page.getByRole('button', { name: 'Marcar como parte de…' })
  await alvoOk(marcar, page, '«Marcar como parte de…»')
  await marcar.click()
  const caixa = page.getByRole('group', { name: 'Área Probe Teste é parte de qual sítio?' })
  const campo = caixa.getByRole('combobox', { name: 'Área Probe Teste é parte de qual sítio?' })
  await expect(campo).toBeFocused()
  await alvoOk(campo, page, 'o campo da caixa')
  await campo.fill('túmulo')
  await expect(caixa.getByRole('status')).toHaveText('Túmulo Probe Teste é parte de Área Probe Teste: um sítio não pode ser parte de uma parte dele.')
  await expect(caixa.getByRole('option', { name: /Túmulo Probe Teste/ })).toHaveCount(0)
  await semRolagemHorizontal(page, 'a caixa com o aviso do descendente')
  await foto(page, 'partes-6-aviso-descendente', caixa)
  await campo.fill('tel probe')
  await expect(caixa.getByRole('status')).toHaveText(
    'Tel Probe Teste foi mesclado em Tell Probe Teste e não é mais um sítio à parte: não pode ser parte de outro nem ter partes. Escolha Tell Probe Teste.',
  )
  await expect(caixa.getByRole('option', { name: /^Tel Probe Teste/ })).toHaveCount(0)
  await semRolagemHorizontal(page, 'a caixa com o aviso do mesclado')
  await foto(page, 'partes-7-aviso-mesclado', caixa)
  await caixa.getByRole('button', { name: 'Cancelar' }).click()
  await expect(caixa).toHaveCount(0)
  await expect(marcar).toBeFocused()
})
