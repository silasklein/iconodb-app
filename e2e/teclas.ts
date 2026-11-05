import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Aperta uma tecla de atalho até o efeito dela aparecer (`alvo` visível).
 *
 * O app registra os atalhos de uma tela num efeito, depois de ela aparecer: uma tecla apertada nesse intervalo se perde.
 * Só use com teclas que, repetidas, não fazem mal (abrir um formulário que já está aberto não faz nada; pôr o mesmo objeto
 * na comparação de novo só diz que ele já está). O teste espera o efeito, nunca um tempo fixo.
 */
export async function apertarAteAparecer(page: Page, tecla: string, alvo: Locator): Promise<void> {
  await expect(async () => {
    await page.keyboard.press(tecla)
    await expect(alvo).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
}
