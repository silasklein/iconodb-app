import { CSP, pluginCsp } from '../../scripts/csp.ts'

describe('Content-Security-Policy do build', () => {
  it('a política: nada por padrão; só o próprio app, o wasm do sqlite e as APIs do Dropbox', () => {
    const diretivas = Object.fromEntries(CSP.split(';').map((d) => d.trim().split(/\s+/)).map(([nome, ...valores]) => [nome, valores.join(' ')]))
    expect(diretivas).toEqual({
      'default-src': "'none'",
      'script-src': "'self' 'wasm-unsafe-eval'",
      'worker-src': "'self'",
      'connect-src': "'self' https://api.dropboxapi.com https://content.dropboxapi.com",
      'img-src': "'self' blob: data:",
      'font-src': "'self' data:",
      'style-src': "'self'",
      'manifest-src': "'self'",
      'base-uri': "'none'",
      'form-action': "'none'",
      'object-src': "'none'",
    })
    expect(CSP).not.toMatch(/unsafe-inline|unsafe-eval'(?<!wasm-unsafe-eval')/)
  })

  it('o plugin só age no build (o dev usa scripts e estilos inline) e põe a meta no começo do <head>', () => {
    const plugin = pluginCsp()
    expect(plugin.apply).toBe('build')
    const tags = (plugin.transformIndexHtml as () => unknown)()
    expect(tags).toEqual([{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }])
  })
})
