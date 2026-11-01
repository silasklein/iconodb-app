import { test as base, expect } from '@playwright/test'
import { ligarDropboxSimulado, type DropboxSimulado } from './dropboxSimulado'

/** Prefixo com que a página relata uma violação da Content-Security-Policy no console. */
const MARCA_CSP = '[violação de CSP]'

/**
 * `dropbox`: o Dropbox simulado, ligado ao contexto de todo teste. Ao fim, confere que nada
 * tentou sair para a internet (fora do Dropbox simulado).
 * `csp`: toda página do contexto escuta `securitypolicyviolation`; ao fim, qualquer violação
 * da política (scripts/csp.ts) derruba o teste.
 */
export const test = base.extend<{ dropbox: DropboxSimulado; csp: string[] }>({
  dropbox: [
    async ({ context }, use) => {
      const estado = await ligarDropboxSimulado(context)
      await use(estado)
      expect(estado.proibidos, 'pedidos que sairiam para a internet').toEqual([])
    },
    { auto: true },
  ],
  csp: [
    async ({ context }, use) => {
      const violacoes: string[] = []
      await context.addInitScript((marca) => {
        document.addEventListener('securitypolicyviolation', (e) => {
          console.error(`${marca} ${e.effectiveDirective} bloqueou ${e.blockedURI || '(inline)'} em ${e.sourceFile}:${e.lineNumber}`)
        })
      }, MARCA_CSP)
      context.on('console', (msg) => {
        const texto = msg.text()
        // O evento do documento e, por garantia, o aviso do próprio Chromium.
        if (texto.startsWith(MARCA_CSP) || /Content Security Policy/i.test(texto)) violacoes.push(texto)
      })
      await use(violacoes)
      expect(violacoes, 'violações da Content-Security-Policy').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
