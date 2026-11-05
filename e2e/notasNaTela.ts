import type { Page } from '@playwright/test'
import { expect } from './fixtures'

const celular = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

/**
 * Escreve uma nota pela tela, como a pessoa faz, no objeto, verbete, obra, sítio ou grupo que está aberto.
 * Celular: "Escrever nota" abre a tela da nota; computador: abre o editor no lugar. Em ambos, "Salvar nota" encerra.
 */
export async function escreverNota(page: Page, texto: string): Promise<void> {
  if (celular(page)) {
    await page.getByRole('link', { name: 'Escrever nota' }).last().click()
    await expect(page).toHaveURL(/#\/nota\/nova\?/)
  } else {
    await page.getByRole('button', { name: 'Escrever nota' }).last().click()
  }
  const campo = page.getByRole('textbox', { name: /^Nota \[\d+\] · \d\d\/\d\d\/\d{4}/ })
  await expect(campo).toBeVisible()
  await expect(campo).toBeFocused()
  await campo.pressSequentially(texto, { delay: 5 })
  await page.getByRole('button', { name: 'Salvar nota' }).click()
  // O editor fecha (computador) ou a tela volta ao lugar da nota (celular).
  await expect(page.getByRole('textbox', { name: /^Nota \[/ })).toHaveCount(0)
}
