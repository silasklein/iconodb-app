import { baseDoEndereco, ENDERECO_PADRAO, enderecoPublicado, normalizarEndereco } from './endereco'

describe('o endereço publicado (VITE_ENDERECO): uma só configuração', () => {
  it('o padrão é o GitHub Pages do repositório', () => {
    expect(ENDERECO_PADRAO).toBe('https://silasklein.github.io/iconodb-app/')
    expect(enderecoPublicado(undefined)).toBe(ENDERECO_PADRAO)
    expect(enderecoPublicado('')).toBe(ENDERECO_PADRAO)
  })

  it('a base do Vite (e o start_url, o scope e o id do manifesto) é o caminho do endereço', () => {
    expect(baseDoEndereco('https://silasklein.github.io/iconodb-app/')).toBe('/iconodb-app/')
    expect(baseDoEndereco('https://icono.silasklein.com/')).toBe('/')
  })

  it('o domínio próprio vale igual: troca o endereço, a base e o redirect do Dropbox', () => {
    const e = enderecoPublicado('https://icono.silasklein.com')
    expect(e).toBe('https://icono.silasklein.com/')
    expect(baseDoEndereco(e)).toBe('/')
  })

  it('normaliza a barra final e recusa o que não serve de endereço do app', () => {
    expect(normalizarEndereco('https://exemplo.org/app')).toBe('https://exemplo.org/app/')
    expect(normalizarEndereco('  https://exemplo.org/app/  ')).toBe('https://exemplo.org/app/')
    expect(() => normalizarEndereco('http://exemplo.org/')).toThrow(/https/)
    expect(() => normalizarEndereco('https://exemplo.org/?x=1')).toThrow()
    expect(() => normalizarEndereco('https://exemplo.org/#/a')).toThrow()
    expect(() => normalizarEndereco('exemplo.org')).toThrow()
  })
})
