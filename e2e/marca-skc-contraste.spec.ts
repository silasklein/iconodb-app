import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * A marca «SKC» tem de ser legível onde aparece (auditoria UX-2: na lista de sítios do computador era #ededed sobre branco,
 * 1,17:1). Mede as cores calculadas pelo navegador: o texto da marca contra o fundo de verdade (o primeiro ancestral com cor)
 * e o contorno da marca contra o mesmo fundo. Sítios, nos dois tamanhos.
 */
const celular = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

type Cor = [number, number, number, number]
const luz = ([r, g, b]: Cor) => {
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contraste = (a: Cor, b: Cor) => {
  const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m)
  return (x! + 0.05) / (y! + 0.05)
}

/** As cores da marca e o fundo atrás dela, como o navegador as calculou. */
async function coresDaMarca(marca: Locator) {
  return marca.evaluate((el) => {
    const canvas = document.createElement('canvas').getContext('2d')!
    const ler = (css: string): number[] => {
      canvas.clearRect(0, 0, 1, 1)
      canvas.fillStyle = '#000'
      canvas.fillStyle = css
      canvas.fillRect(0, 0, 1, 1)
      const d = canvas.getImageData(0, 0, 1, 1).data
      return [d[0]!, d[1]!, d[2]!, d[3]! / 255]
    }
    const estilo = getComputedStyle(el)
    let fundo = [255, 255, 255, 1]
    for (let n: Element | null = el.parentElement; n; n = n.parentElement) {
      const c = ler(getComputedStyle(n).backgroundColor)
      if (c[3]! > 0.99) {
        fundo = c
        break
      }
    }
    return { texto: ler(estilo.color), contorno: ler(estilo.borderTopColor), fundo }
  })
}

async function entrar(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
}

async function conferir(page: Page, onde: string) {
  const marcas = page.locator('.marca-skc:visible')
  await expect(marcas.first(), `a marca SKC em ${onde}`).toBeVisible()
  const n = await marcas.count()
  for (let i = 0; i < n; i++) {
    const { texto, contorno, fundo } = await coresDaMarca(marcas.nth(i))
    expect(contraste(texto as Cor, fundo as Cor), `texto da marca ${i + 1} em ${onde}`).toBeGreaterThanOrEqual(4.5)
    expect(contraste(contorno as Cor, fundo as Cor), `contorno da marca ${i + 1} em ${onde}`).toBeGreaterThanOrEqual(3)
  }
}

test('a marca SKC dos sítios tem contraste de leitura na lista, na linha escolhida e na página do sítio', async ({ page }) => {
  await entrar(page)
  await page.goto('#/sitios/novo')
  await page.getByRole('textbox', { name: 'Nome', exact: true }).fill('Tell Inventado de Teste')
  await page.getByRole('textbox', { name: /^Região ou país/ }).fill('Negev')
  await page.getByRole('textbox', { name: 'Latitude' }).fill('31,7683')
  await page.getByRole('textbox', { name: 'Longitude' }).fill('35,2137')
  await page.getByRole('button', { name: 'Registrar sítio' }).click()
  await expect(page.getByText('Sítio SKC · Negev')).toBeVisible()
  // a página do sítio (no computador, com a lista ao lado e a linha do sítio escolhida)
  await conferir(page, celular(page) ? 'a página do sítio (celular)' : 'a página do sítio com a lista ao lado (computador)')

  await page.goto('#/sitios')
  await expect(page.getByRole('heading', { level: 1, name: 'Sítios' })).toBeVisible()
  await expect(page.locator('a.lista-linha').filter({ hasText: 'Tell Inventado de Teste' })).toContainText('SKC')
  if (process.env.SHOTS_DIR) {
    mkdirSync(process.env.SHOTS_DIR, { recursive: true })
    await page.screenshot({ path: join(process.env.SHOTS_DIR, `${process.env.SHOTS_PREFIX ?? ''}marca-sitios-${page.viewportSize()?.width ?? 0}.png`) })
  }
  await conferir(page, celular(page) ? 'a lista de sítios (celular)' : 'a lista de sítios (computador)')
})
