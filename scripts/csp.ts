/**
 * A Content-Security-Policy do app publicado, como <meta> no index.html (o GitHub Pages não
 * deixa pôr cabeçalhos). Só no build: o servidor de desenvolvimento do Vite usa um preâmbulo e
 * estilos inline que ela bloquearia.
 *
 * - script-src 'wasm-unsafe-eval': o sqlite-wasm compila o .wasm (sem isso, nada de banco);
 * - connect-src: o próprio app (service worker, .wasm) e as duas APIs do Dropbox (token e download);
 * - img-src blob:: as imagens do pacote saem do Cache Storage como blob:;
 * - font-src data:: alguma fonte pode vir embutida no CSS.
 * A e2e (e2e/fixtures.ts) falha com qualquer violação.
 */
import type { Plugin } from 'vite'

export const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "connect-src 'self' https://api.dropboxapi.com https://content.dropboxapi.com",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "style-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ')

export function pluginCsp(): Plugin {
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
  }
}
