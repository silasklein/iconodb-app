import { expect, test } from './fixtures'
import { abrirSitio, alvoOk, entrar, foto, semRolagemHorizontal } from './sitiosNaTela'

/**
 * As grafias de um sítio com a origem (Parte 2C, bloco 2; telas aprovadas §4), no navegador de verdade, nos dois tamanhos, sobre
 * o pacote sintético (TESTE: Maḥteṣ Teste, TESTE-1, tem a grafia do livro «al-Maḥṭaṣ Teste», TESTE p. 4): em «Corrigir», a
 * grafia do livro recebe a tradição (só ela: sem o × e sem «Livro»); uma grafia sua recebe a tradição e o livro; a página as
 * mostra agrupadas por tradição, com o livro e a página (a do livro) ou com «SKC» e o livro (a sua); e a busca acha o sítio pela
 * grafia nova. Sem rolagem horizontal; alvos de 44 px no toque e 36 com o mouse. Com SHOTS_DIR definido, guarda capturas.
 */
test('Corrigir: a tradição de uma grafia do livro, uma grafia sua com tradição e livro; a página agrupada e a busca pela grafia nova', async ({ page }) => {
  await entrar(page)
  await abrirSitio(page, 'TESTE-1', 'Maḥteṣ Teste')
  // Antes: a grafia do livro, sem tradição.
  const grafias = page.locator('dt:text-is("Outras grafias") + dd')
  await expect(grafias.getByRole('group', { name: 'sem tradição' })).toHaveText(/^sem tradição\s*al-Maḥṭaṣ Teste\s*TESTE, p\. 4$/)

  await page.getByRole('button', { name: 'Corrigir' }).click()
  const edicao = page.getByRole('list', { name: 'Outras grafias do sítio' })
  const doLivro = edicao.getByRole('listitem').filter({ hasText: 'al-Maḥṭaṣ Teste' })
  await expect(doLivro.locator('.sitio-grafia-do-livro')).toHaveText('do livro TESTE, p. 4')
  // A do livro só recebe a tradição: sem o × e sem «Livro».
  await expect(doLivro.getByRole('button', { name: /^Tirar a grafia/ })).toHaveCount(0)
  await expect(doLivro.getByRole('combobox', { name: 'Livro de al-Maḥṭaṣ Teste' })).toHaveCount(0)
  const tradicaoDoLivro = doLivro.getByRole('combobox', { name: 'Tradição de al-Maḥṭaṣ Teste' })
  await alvoOk(tradicaoDoLivro, page, 'a tradição da grafia do livro')
  await tradicaoDoLivro.selectOption({ label: 'Árabe' })
  await expect(tradicaoDoLivro).toHaveValue('arabe')

  // Uma grafia sua: Enter acrescenta; recebe a tradição e o livro.
  const nova = page.getByRole('textbox', { name: /^Outras grafias/ })
  await alvoOk(nova, page, 'o campo «outra grafia»')
  await nova.fill('Probe-Mahtes')
  await nova.press('Enter')
  await expect(nova).toHaveValue('')
  const sua = edicao.getByRole('listitem').filter({ hasText: 'Probe-Mahtes' })
  await expect(sua.locator('.marca-skc')).toHaveText('SKC')
  await alvoOk(sua.getByRole('button', { name: 'Tirar a grafia Probe-Mahtes' }), page, 'o × da grafia sua')
  const tradicaoDaSua = sua.getByRole('combobox', { name: 'Tradição de Probe-Mahtes' })
  await tradicaoDaSua.selectOption({ label: 'Alemã' })
  await expect(tradicaoDaSua).toHaveValue('alema')
  const livroDaSua = sua.getByRole('combobox', { name: 'Livro de Probe-Mahtes' })
  await alvoOk(livroDaSua, page, 'o livro da grafia sua')
  await livroDaSua.selectOption({ label: 'TESTE' })
  await expect(livroDaSua).toHaveValue('TESTE')
  // A tradição da do livro continua (as gravações vão em fila, uma não apaga a outra).
  await expect(tradicaoDoLivro).toHaveValue('arabe')
  await semRolagemHorizontal(page, '«Corrigir» com as grafias')
  await foto(page, 'grafias-1-corrigir', edicao)

  // A página: agrupadas por tradição, na ordem da lista (árabe antes de alemã), com o livro e a página ou com «SKC» e o livro.
  await page.getByRole('button', { name: 'Corrigir' }).click()
  await expect(edicao).toHaveCount(0)
  await expect(grafias.getByRole('group', { name: 'árabe' })).toHaveText(/^árabe\s*al-Maḥṭaṣ Teste\s*TESTE, p\. 4$/)
  await expect(grafias.getByRole('group', { name: 'alemã' })).toHaveText(/^alemã\s*Probe-Mahtes\s*SKC\s*TESTE$/)
  await expect(grafias.getByRole('group')).toHaveCount(2)
  expect(await grafias.getByRole('group').evaluateAll((gs) => gs.map((g) => g.getAttribute('aria-label')))).toEqual(['árabe', 'alemã'])
  // Recarregar: tudo ficou gravado.
  await page.reload()
  await expect(grafias.getByRole('group', { name: 'árabe' })).toHaveText(/^árabe\s*al-Maḥṭaṣ Teste\s*TESTE, p\. 4$/)
  await expect(grafias.getByRole('group', { name: 'alemã' })).toHaveText(/^alemã\s*Probe-Mahtes\s*SKC\s*TESTE$/)
  await semRolagemHorizontal(page, 'a página com as grafias agrupadas')
  await foto(page, 'grafias-2-pagina', grafias)

  // A busca acha o sítio pela grafia nova.
  await page.goto('#/busca')
  await page.getByRole('combobox', { name: 'Buscar' }).fill('probe-mahtes')
  const sugestao = page.getByRole('listbox', { name: 'Sugestões para «probe-mahtes»' }).getByRole('group', { name: 'Sítios' }).getByRole('option')
  await expect(sugestao).toHaveCount(1)
  await expect(sugestao).toContainText('Maḥteṣ Teste')
  await semRolagemHorizontal(page, 'a sugestão pela grafia nova')
  await foto(page, 'grafias-3-busca')
  await sugestao.click()
  await expect(page).toHaveURL(/#\/sitio\/TESTE-1$/)
})
