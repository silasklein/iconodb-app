/**
 * O endereço em que o app é publicado: UMA configuração (`VITE_ENDERECO`, no ambiente do build ou num
 * `.env`), com o padrão abaixo. Dele saem a base do Vite, o `id`/`start_url`/`scope` do manifesto
 * (vite.config.ts), o redirect do Dropbox em produção (src/dropbox/auth.ts) e a base da e2e
 * (playwright.config.ts). Mudar para o domínio próprio: ver "Mudar para o domínio próprio" no README.
 *
 * Puro (sem import.meta.env): o vite.config.ts e o Playwright, que rodam no Node, também o importam.
 */
export const ENDERECO_PADRAO = 'https://silasklein.github.io/iconodb-app/'

/** O endereço com a barra final; só https, sem query nem hash. Lança se não servir. */
export function normalizarEndereco(valor: string): string {
  let url: URL
  try {
    url = new URL(valor.trim())
  } catch {
    throw new Error(`VITE_ENDERECO inválido: ${JSON.stringify(valor)}`)
  }
  if (url.protocol !== 'https:') throw new Error(`VITE_ENDERECO tem de ser https: ${JSON.stringify(valor)}`)
  if (url.search || url.hash) throw new Error(`VITE_ENDERECO sem query nem hash: ${JSON.stringify(valor)}`)
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url.href
}

/** O endereço configurado (`valor`, ex.: import.meta.env.VITE_ENDERECO) ou o padrão. */
export function enderecoPublicado(valor: string | undefined): string {
  return normalizarEndereco(valor || ENDERECO_PADRAO)
}

/** O caminho do endereço: a base do Vite e o escopo do app ("/iconodb-app/" ou "/"). */
export function baseDoEndereco(endereco: string): string {
  return new URL(endereco).pathname
}
