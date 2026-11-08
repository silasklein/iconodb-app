import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { abrirSitio, alvoOk, entrar, foto, semRolagemHorizontal, tituloDoSitio } from './sitiosNaTela'

/**
 * Mesclar sítios (Parte 2C, bloco 2; telas aprovadas §1 e §2), no navegador de verdade, nos dois tamanhos, sobre o pacote
 * sintético (TESTE): o endereço de um sítio que o pacote mesclou (TESTE-4 em TESTE-2) leva ao destino com o aviso; a linha
 * «Mesclado aqui» e o «desfazer» (confirmação no lugar, foco em «Cancelar»); a caixa «Mesclar com outro sítio…» entre dois sítios
 * dos livros (fica o de número menor) e entre um sítio seu e um dos livros (fica o do livro); a busca pelo nome do que entrou
 * acha o que ficou. Sem rolagem horizontal; alvos de 44 px no toque e 36 com o mouse. Com SHOTS_DIR definido, guarda capturas.
 */
const linhaDe = (page: Page, rotulo: string) => page.locator(`dt:text-is("${rotulo}") + dd`)

test('o endereço do sítio mesclado pelo pacote leva ao destino; «desfazer» na linha «Mesclado aqui» o devolve', async ({ page }) => {
  await entrar(page)
  await page.goto('#/sitio/TESTE-4')
  await expect(page).toHaveURL(/#\/sitio\/TESTE-2$/)
  await expect(tituloDoSitio(page, 'Tell Probe Teste')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Você abriu Tel Probe Teste, que foi mesclado em Tell Probe Teste.' })).toBeVisible()
  const mesclados = linhaDe(page, 'Mesclado aqui')
  await expect(mesclados).toHaveText(/^Tel Probe Teste\s*\(dos livros\)\s*desfazer$/)
  await expect(mesclados.getByRole('link', { name: 'Tel Probe Teste' })).toHaveAttribute('href', /#\/sitio\/TESTE-4$/)
  await alvoOk(mesclados.getByRole('link', { name: 'Tel Probe Teste' }), page, 'o nome em «Mesclado aqui»')
  const desfazer = mesclados.getByRole('button', { name: 'desfazer a mesclagem de Tel Probe Teste' })
  await alvoOk(desfazer, page, '«desfazer» em «Mesclado aqui»')
  await semRolagemHorizontal(page, 'o sítio com «Mesclado aqui»')
  await foto(page, 'mesclar-1-voce-abriu', 'topo')

  // A confirmação abre no lugar, com o foco em «Cancelar»; «Cancelar» devolve o foco ao «desfazer».
  await desfazer.click()
  const confirmacao = page.getByRole('group', { name: 'Desfazer a mesclagem de Tel Probe Teste?' })
  await expect(confirmacao).toContainText('Desfazer a mesclagem de Tel Probe Teste? Ele volta a ser um sítio à parte, com o nome')
  await expect(confirmacao).toContainText('Tell Probe Teste fica como estava antes dele.')
  const cancelar = confirmacao.getByRole('button', { name: 'Cancelar' })
  await expect(cancelar).toBeFocused()
  await alvoOk(cancelar, page, 'Cancelar')
  await alvoOk(confirmacao.getByRole('button', { name: 'Desfazer' }), page, 'Desfazer')
  await semRolagemHorizontal(page, 'a confirmação de desfazer')
  await foto(page, 'mesclar-2-desfazer', confirmacao)
  await cancelar.click()
  await expect(confirmacao).toHaveCount(0)
  await expect(desfazer).toBeFocused()

  await desfazer.click()
  await confirmacao.getByRole('button', { name: 'Desfazer' }).click()
  const voltou = page.getByRole('status').filter({ hasText: 'Tel Probe Teste voltou a ser um sítio à parte.' })
  await expect(voltou).toBeVisible()
  const ver = voltou.getByRole('link', { name: 'Ver' })
  await expect(ver).toBeFocused()
  await alvoOk(ver, page, '«Ver»')
  await expect(linhaDe(page, 'Mesclado aqui')).toHaveCount(0)
  await semRolagemHorizontal(page, 'o sítio depois de desfazer')
  await foto(page, 'mesclar-3-voltou', voltou)
  await ver.click()
  await expect(page).toHaveURL(/#\/sitio\/TESTE-4$/)
  await expect(tituloDoSitio(page, 'Tel Probe Teste')).toBeVisible()
  await expect(page.getByText('Você abriu', { exact: false })).toHaveCount(0)
})

test('«Mesclar com outro sítio…»: dois dos livros (fica o de número menor) e um seu com um dos livros (fica o do livro); a busca pelo nome que entrou acha o que ficou', async ({ page }) => {
  await entrar(page)

  // 1. Maḥtiṣ Teste (TESTE-7) com Maḥteṣ Teste (TESTE-1): procurando sem diacríticos.
  await abrirSitio(page, 'TESTE-7', 'Maḥtiṣ Teste')
  const mesclar = page.getByRole('button', { name: 'Mesclar com outro sítio…' })
  await alvoOk(mesclar, page, '«Mesclar com outro sítio…»')
  await mesclar.click()
  const caixa = page.getByRole('group', { name: 'Mesclar Maḥtiṣ Teste com outro sítio' })
  const campo = caixa.getByRole('combobox', { name: 'Com qual sítio?' })
  await expect(campo).toBeFocused()
  await alvoOk(campo, page, 'o campo «Com qual sítio?»')
  await campo.fill('mahtes')
  const opcao = caixa.getByRole('listbox', { name: 'Com qual sítio?' }).getByRole('option', { name: /Maḥteṣ Teste/ })
  await expect(opcao).toBeVisible()
  await alvoOk(opcao, page, 'a opção Maḥteṣ Teste')
  await semRolagemHorizontal(page, '«Com qual sítio?»')
  await foto(page, 'mesclar-4-com-qual-sitio', caixa)
  await opcao.click()

  const qual = page.getByRole('group', { name: 'Mesclar Maḥtiṣ Teste e Maḥteṣ Teste' })
  await expect(qual.getByText('Sugestão: o de número menor, que entrou primeiro.')).toBeVisible()
  const fica = qual.getByRole('radio', { name: /Maḥteṣ Teste/ })
  await expect(fica).toBeChecked()
  await expect(qual.getByRole('radio', { name: /Maḥtiṣ Teste/ })).not.toBeChecked()
  await expect(qual).toContainText('Maḥteṣ Teste fica. Maḥtiṣ Teste entra nele:')
  await expect(qual).toContainText('Nada é copiado. Dá para desfazer depois, na página de Maḥteṣ Teste.')
  await expect(qual.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await alvoOk(qual.locator('label.sitio-mesclar-opcao').first(), page, 'a opção de qual fica')
  await alvoOk(qual.getByRole('button', { name: 'Mesclar' }), page, '«Mesclar»')
  await semRolagemHorizontal(page, '«Qual fica?»')
  await foto(page, 'mesclar-5-qual-fica', qual)
  await qual.getByRole('button', { name: 'Mesclar' }).click()

  // A página de Maḥtiṣ Teste (o que entrou) leva à de Maḥteṣ Teste, que diz que agora são um só.
  await expect(page).toHaveURL(/#\/sitio\/TESTE-1$/)
  await expect(tituloDoSitio(page, 'Maḥteṣ Teste')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Maḥteṣ Teste e Maḥtiṣ Teste agora são um só.' })).toBeVisible()
  await expect(linhaDe(page, 'Mesclado aqui')).toHaveText(/^Maḥtiṣ Teste\s*\(dos livros\)\s*desfazer$/)
  await semRolagemHorizontal(page, 'o sítio que ficou')
  await foto(page, 'mesclar-6-um-so', 'topo')

  // 2. Um sítio seu com Maḥteṣ Teste: fica o do livro.
  await page.goto('#/sitios/novo')
  await page.getByRole('textbox', { name: 'Nome', exact: true }).fill('Tell Absorvido Teste')
  await page.getByRole('button', { name: 'Registrar sítio' }).click()
  await expect(tituloDoSitio(page, 'Tell Absorvido Teste')).toBeVisible()
  await expect(page).toHaveURL(/#\/sitio\/SI-/)
  const doSeu = page.url().slice(page.url().indexOf('#'))
  await page.getByRole('button', { name: 'Mesclar com outro sítio…' }).click()
  const caixa2 = page.getByRole('group', { name: 'Mesclar Tell Absorvido Teste com outro sítio' })
  await caixa2.getByRole('combobox', { name: 'Com qual sítio?' }).fill('mahtes')
  await caixa2.getByRole('listbox', { name: 'Com qual sítio?' }).getByRole('option', { name: /Maḥteṣ Teste/ }).click()
  const qual2 = page.getByRole('group', { name: 'Mesclar Tell Absorvido Teste e Maḥteṣ Teste' })
  await expect(qual2.getByText('Sugestão: o do livro fica.')).toBeVisible()
  await expect(qual2.getByRole('radio', { name: /Maḥteṣ Teste/ })).toBeChecked()
  await expect(qual2.getByRole('radio', { name: /Tell Absorvido Teste/ })).not.toBeChecked()
  await expect(qual2).toContainText('o nome «Tell Absorvido Teste» passa a ser grafia de Maḥteṣ Teste')
  await semRolagemHorizontal(page, '«Qual fica?» com um sítio seu')
  await foto(page, 'mesclar-7-o-do-livro-fica', qual2)
  await qual2.getByRole('button', { name: 'Mesclar' }).click()
  await expect(page).toHaveURL(/#\/sitio\/TESTE-1$/)
  await expect(tituloDoSitio(page, 'Maḥteṣ Teste')).toBeVisible()
  await expect(linhaDe(page, 'Mesclado aqui')).toContainText('Tell Absorvido Teste')
  await expect(linhaDe(page, 'Mesclado aqui')).toContainText('(seu)')

  // 3. A busca pelo nome do que entrou acha o que ficou.
  await page.goto('#/busca')
  const buscar = page.getByRole('combobox', { name: 'Buscar' })
  await buscar.fill('tell absorvido')
  const sugestao = page.getByRole('listbox', { name: 'Sugestões para «tell absorvido»' }).getByRole('group', { name: 'Sítios' }).getByRole('option')
  await expect(sugestao).toHaveCount(1)
  await expect(sugestao).toContainText('Maḥteṣ Teste')
  await foto(page, 'mesclar-8-busca-pelo-nome-que-entrou')
  await sugestao.click()
  await expect(page).toHaveURL(/#\/sitio\/TESTE-1$/)
  await expect(tituloDoSitio(page, 'Maḥteṣ Teste')).toBeVisible()
  // o endereço do que entrou também leva ao que ficou, com o aviso
  await page.goto(doSeu)
  await expect(page).toHaveURL(/#\/sitio\/TESTE-1$/)
  await expect(page.getByRole('status').filter({ hasText: 'Você abriu Tell Absorvido Teste, que foi mesclado em Maḥteṣ Teste.' })).toBeVisible()
})
