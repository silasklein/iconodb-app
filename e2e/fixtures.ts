import { test as base, expect } from '@playwright/test'
import { ligarDropboxSimulado, type DropboxSimulado } from './dropboxSimulado'

/**
 * `dropbox`: o Dropbox simulado, ligado ao contexto de todo teste. Ao fim, confere que nada
 * tentou sair para a internet (fora do Dropbox simulado).
 */
export const test = base.extend<{ dropbox: DropboxSimulado }>({
  dropbox: [
    async ({ context }, use) => {
      const estado = await ligarDropboxSimulado(context)
      await use(estado)
      expect(estado.proibidos, 'pedidos que sairiam para a internet').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
