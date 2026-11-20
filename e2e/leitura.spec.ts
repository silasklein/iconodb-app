import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Tarefa 7 do plano «O IPIAO lido no formato do §»: a leitura de uma obra de catálogo no navegador de verdade, nos dois
 * tamanhos, sobre o pacote sintético (o TESTE, volume I). Das Coleções, «Ler o livro» e ‹ › pelos 12 passos da ordem da
 * Tarefa 2 até «TESTE I: 6» e de volta; sem rolagem horizontal em nenhum passo; o fundo claro; recarregar mantém o passo;
 * «Continuar» nas Coleções; e do objeto, «Ler no livro» e o «‹ origem» de volta ao objeto (decisão 85). Tudo inventado
 * (repositório público).
 */
const celular = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

const semRolagemHorizontal = async (page: Page, tela: string) => {
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(janela)
}

async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}

/**
 * A ordem da Tarefa 2 no TESTE I: o título do passo, o nome do vizinho nas setas («p. N» no mesmo volume; a entrada pelo
 * título) e o endereço.
 */
const texto = (pagina: number, trecho: string) => ({ titulo: `TESTE I, p. ${pagina}`, vizinho: `p. ${pagina}`, rota: `#/ler/TESTE/trecho/${trecho}` })
const entrada = (n: number) => ({ titulo: `TESTE I: ${n}`, vizinho: `TESTE I: ${n}`, rota: `#/ler/TESTE/entrada/${n}` })
const PASSOS = [
  texto(3, 'PA-TESTE-I.S.3-txt-1'),
  texto(9, 'PA-TESTE-I.S.9-ovw-1'),
  texto(10, 'PA-TESTE-I.S.10-ovw-1'),
  entrada(1),
  texto(10, 'PA-TESTE-I.S.10-ovw-2'),
  texto(11, 'PA-TESTE-I.S.11-ovw-1'),
  entrada(2),
  entrada(3),
  texto(19, 'PA-TESTE-I.S.19-ovw-1'),
  entrada(4),
  entrada(5),
  entrada(6),
]

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** O passo `i` à vista: o título, o endereço e a página sem rolagem horizontal. */
async function conferirPasso(page: Page, i: number) {
  const passo = PASSOS[i]!
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(passo.titulo)
  await expect(page).toHaveURL(new RegExp(`${escapar(passo.rota)}$`))
  await semRolagemHorizontal(page, `o passo ${i + 1} (${passo.titulo})`)
}

const setas = (page: Page) => page.getByRole('navigation', { name: 'Passos vizinhos' })

test('das Coleções, «Ler o livro» e ‹ › pelos 12 passos; recarregar mantém o passo; «Continuar» volta a ele', async ({ page }) => {
  await entrar(page)
  await page.goto('#/colecoes?obra=TESTE-I')
  const lerOLivro = page.getByRole('link', { name: 'Ler o livro', exact: true })
  await expect(lerOLivro).toBeVisible()
  // neste aparelho ainda não se leu nada: sem «Continuar»
  await expect(page.getByRole('link', { name: /^Continuar: / })).toHaveCount(0)
  await semRolagemHorizontal(page, 'as Coleções')

  await lerOLivro.click()
  await conferirPasso(page, 0)
  // fundo claro, como a página do § (decisão 91, a5)
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(setas(page).getByRole('link', { name: /^Anterior: / })).toHaveCount(0)

  // › até o fim, na ordem da Tarefa 2
  for (let i = 1; i < PASSOS.length; i++) {
    await setas(page).getByRole('link', { name: `Seguinte: ${PASSOS[i]!.vizinho}`, exact: true }).click()
    await conferirPasso(page, i)
    if (i === 5) {
      // recarregar mantém o passo (no meio da obra)
      await page.reload()
      await conferirPasso(page, i)
    }
  }
  await expect(setas(page).getByRole('link', { name: /^Seguinte: / })).toHaveCount(0)
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)')

  // recarregar no último passo
  await page.reload()
  await conferirPasso(page, PASSOS.length - 1)

  // ‹ de volta ao começo
  for (let i = PASSOS.length - 2; i >= 0; i--) {
    await setas(page).getByRole('link', { name: `Anterior: ${PASSOS[i]!.vizinho}`, exact: true }).click()
    await conferirPasso(page, i)
  }

  // a posição guardada é o último passo aberto: o 1º; anda-se até «TESTE I: 6» pelo endereço, e o «Continuar» leva a ele
  await page.goto(PASSOS[PASSOS.length - 1]!.rota)
  await conferirPasso(page, PASSOS.length - 1)
  await page.goto('#/colecoes?obra=TESTE-I')
  const continuar = page.getByRole('link', { name: 'Continuar: TESTE I: 6', exact: true })
  await expect(continuar).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ler o livro', exact: true })).toBeVisible()
  await semRolagemHorizontal(page, 'as Coleções com «Continuar»')
  await continuar.click()
  await conferirPasso(page, PASSOS.length - 1)
})

test('do objeto, «Ler no livro» abre a entrada, e o «‹ origem» volta ao objeto', async ({ page }) => {
  await entrar(page)
  await page.goto('#/item/CA00001')
  const noLivro = page.getByRole('region', { name: 'No livro' })
  const ler = noLivro.getByRole('link', { name: 'Ler no livro' })
  await expect(ler).toBeVisible()
  const nomeDoObjeto = (await page.getByRole('heading', { level: 1 }).textContent())!.trim()
  expect(nomeDoObjeto).not.toBe('')
  await ler.click()

  // a entrada do objeto na leitura; o rótulo do item no livro («TESTE I: N») é a origem que o botão leva
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^TESTE I: \d+$/)
  const rotulo = (await page.getByRole('heading', { level: 1 }).textContent())!.trim()
  const i = PASSOS.findIndex((p) => p.titulo === rotulo)
  expect(i, `a entrada ${rotulo} está na ordem`).toBeGreaterThanOrEqual(0)
  await conferirPasso(page, i)
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)')

  // ‹ › levam a origem adiante: um passo à frente, e o «‹ origem» ainda volta ao objeto
  await setas(page).getByRole('link', { name: `Seguinte: ${PASSOS[i + 1]!.vizinho}`, exact: true }).click()
  await conferirPasso(page, i + 1)
  const volta = celular(page)
    ? page.getByRole('link', { name: `Voltar (${rotulo})`, exact: true })
    : page.getByRole('navigation', { name: 'Origem' }).getByRole('link', { name: rotulo, exact: true })
  await expect(volta).toBeVisible()
  await volta.click()
  await expect(page).toHaveURL(/#\/item\/CA00001$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(nomeDoObjeto)
  await semRolagemHorizontal(page, 'o objeto de volta')
})
