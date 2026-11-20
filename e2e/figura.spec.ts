import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Etapa 4, Tarefa 24: a página da figura no navegador de verdade, nos dois tamanhos, sobre o pacote sintético. A figura
 * `TESTEG-0001a` (objeto F200001) é aberta pela busca do rótulo («TESTEG: 1a», decisão 39): o título é o rótulo, a ficha só
 * tem o crédito, não há seção Catálogo, e a voz do livro diz «Discutida em 1 §», com o § 2 e a frase que cita a figura.
 * Tudo inventado (repositório público).
 */
const semRolagemHorizontal = async (page: Page, tela: string) => {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}

test('abrir a figura TESTEG-0001a pela busca: o rótulo no título, o crédito, «Discutida em» e nada do catálogo', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()

  await page.getByRole('combobox', { name: 'Buscar' }).fill('TESTEG: 1a')
  await page.keyboard.press('Enter')
  const resultados = page.getByRole('region', { name: 'Resultados' })
  const cartao = resultados.getByRole('link', { name: /F200001/ })
  await expect(cartao).toBeVisible()
  await cartao.click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TESTEG: 1a')
  const cabeca = page.getByTestId('item-cabeca')
  await expect(cabeca).toContainText('F200001')
  await expect(cabeca.getByTestId('numeros-nas-fontes')).toHaveText('figura do TESTEG')

  const ficha = page.getByRole('group', { name: 'Ficha' })
  await expect(ficha.getByRole('term')).toHaveText(['Crédito'])
  await expect(ficha.getByRole('definition')).toHaveText(['Autor 1999: 22 Abb. 4 (Testkredit)'])
  await expect(page.getByRole('button', { name: /^Hipóteses por nível/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Catálogo/ })).toHaveCount(0)

  const voz = page.getByRole('region', { name: 'Leituras' }).getByRole('group', { name: 'TESTEG: 1a' })
  await expect(voz).toContainText('Discutida em 1 §')
  const par = voz.getByRole('link', { name: /§ 2/ })
  await expect(par).toHaveAttribute('href', /#\/paragrafo\/TESTEG\/2$/)
  await expect(par).toContainText('Dois selos de prova de Maḥteṣ Teste mostram um leão-de-teste (Abb. 1a)')
  await expect(par).toBeVisible()
  await semRolagemHorizontal(page, 'a figura')
})

test('a figura achada pelo § (F200002): a marca «do texto» com o link ao § 3', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()

  await page.goto('#/item/F200002')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TESTEG: 2')
  const marca = page.getByRole('group', { name: 'Ficha' }).getByTestId('marca-do-texto')
  await expect(marca).toHaveText(/do texto\s+pela fig\. 2 no § 3/)
  await expect(marca.getByRole('link', { name: '§ 3' })).toHaveAttribute('href', /#\/paragrafo\/TESTEG\/3$/)
  await semRolagemHorizontal(page, 'a figura do texto')
})
