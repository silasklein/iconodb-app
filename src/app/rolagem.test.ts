import { alturaSuficiente, decidirRolagem, guardarPaineis, guardarPosicao, lerPaineis, lerPosicoes } from './rolagem'

describe('decidirRolagem: quando voltar ao topo e quando restaurar', () => {
  it('PUSH ou REPLACE para outro caminho: topo', () => {
    expect(decidirRolagem({ tipo: 'PUSH', pathnameAnterior: '/glossario', pathname: '/verbete/GL-1', salva: undefined })).toEqual({ acao: 'topo' })
    expect(decidirRolagem({ tipo: 'REPLACE', pathnameAnterior: '/a', pathname: '/b', salva: 300 })).toEqual({ acao: 'topo' })
  })

  it('PUSH ou REPLACE no mesmo caminho (filtros, ?hipotese=, ?imagem=): não mexe', () => {
    expect(decidirRolagem({ tipo: 'REPLACE', pathnameAnterior: '/glossario', pathname: '/glossario', salva: undefined })).toEqual({ acao: 'nada' })
    expect(decidirRolagem({ tipo: 'PUSH', pathnameAnterior: '/item/CA1', pathname: '/item/CA1', salva: undefined })).toEqual({ acao: 'nada' })
  })

  it('POP com posição salva: restaura', () => {
    expect(decidirRolagem({ tipo: 'POP', pathnameAnterior: '/verbete/GL-1', pathname: '/glossario', salva: 1840 })).toEqual({ acao: 'restaurar', y: 1840 })
    // inclusive no mesmo caminho (voltar entre duas entradas da mesma tela)
    expect(decidirRolagem({ tipo: 'POP', pathnameAnterior: '/glossario', pathname: '/glossario', salva: 20 })).toEqual({ acao: 'restaurar', y: 20 })
  })

  it('POP sem posição salva: topo se mudou de caminho, senão nada', () => {
    expect(decidirRolagem({ tipo: 'POP', pathnameAnterior: '/a', pathname: '/b', salva: undefined })).toEqual({ acao: 'topo' })
    expect(decidirRolagem({ tipo: 'POP', pathnameAnterior: '/a', pathname: '/a', salva: undefined })).toEqual({ acao: 'nada' })
  })

  it('a primeira tela (sem anterior): restaura só se há posição salva (recarregar a página)', () => {
    expect(decidirRolagem({ tipo: 'POP', pathnameAnterior: null, pathname: '/glossario', salva: 500 })).toEqual({ acao: 'restaurar', y: 500 })
    expect(decidirRolagem({ tipo: 'POP', pathnameAnterior: null, pathname: '/glossario', salva: undefined })).toEqual({ acao: 'nada' })
  })

  it('posição salva 0 ou inválida não vira restauração', () => {
    expect(decidirRolagem({ tipo: 'POP', pathnameAnterior: '/a', pathname: '/b', salva: 0 })).toEqual({ acao: 'topo' })
    expect(decidirRolagem({ tipo: 'POP', pathnameAnterior: null, pathname: '/b', salva: Number.NaN })).toEqual({ acao: 'nada' })
  })
})

describe('alturaSuficiente', () => {
  it('a página já alcança a posição pedida?', () => {
    expect(alturaSuficiente({ scrollHeight: 5000, innerHeight: 800, y: 4200 })).toBe(true)
    expect(alturaSuficiente({ scrollHeight: 5000, innerHeight: 800, y: 4201 })).toBe(false)
    expect(alturaSuficiente({ scrollHeight: 800, innerHeight: 800, y: 1 })).toBe(false)
  })
})

describe('posições guardadas na sessão', () => {
  beforeEach(() => sessionStorage.clear())

  it('guarda e lê por chave de navegação', () => {
    guardarPosicao('k1', 700)
    guardarPosicao('k2', 90)
    expect(lerPosicoes()).toEqual({ k1: 700, k2: 90 })
    guardarPosicao('k1', 710)
    expect(lerPosicoes().k1).toBe(710)
  })

  it('mantém só as mais recentes', () => {
    for (let i = 0; i < 150; i++) guardarPosicao(`k${i}`, i + 1)
    const posicoes = lerPosicoes()
    expect(Object.keys(posicoes)).toHaveLength(100)
    expect(posicoes.k149).toBe(150)
    expect(posicoes.k0).toBeUndefined()
  })

  it('sessionStorage quebrado não derruba: lê vazio e não lança ao guardar', () => {
    sessionStorage.setItem('iconodb:rolagem', '{lixo')
    expect(lerPosicoes()).toEqual({})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cheio')
    })
    expect(() => guardarPosicao('k', 1)).not.toThrow()
    vi.restoreAllMocks()
  })
})

describe('a rolagem dos painéis da lista e detalhe (decisão 85)', () => {
  beforeEach(() => sessionStorage.clear())

  it('guarda e lê as duas posições por entrada do histórico', () => {
    guardarPaineis('k1', { lista: 120.4, principal: 597 })
    guardarPaineis('k2', { lista: 0, principal: 30 })
    expect(lerPaineis()).toEqual({ k1: { lista: 120, principal: 597 }, k2: { lista: 0, principal: 30 } })
  })

  it('as duas no topo: a entrada some (nada a restaurar)', () => {
    guardarPaineis('k1', { lista: 10, principal: 10 })
    guardarPaineis('k1', { lista: 0, principal: 0 })
    expect(lerPaineis()).toEqual({})
  })

  it('guarda só as 100 mais recentes', () => {
    for (let i = 0; i < 105; i++) guardarPaineis(`k${i}`, { lista: 1, principal: i + 1 })
    const todas = lerPaineis()
    expect(Object.keys(todas)).toHaveLength(100)
    expect(todas.k0).toBeUndefined()
    expect(todas.k104).toEqual({ lista: 1, principal: 105 })
  })

  it('o que não se lê fica de fora', () => {
    sessionStorage.setItem('iconodb:rolagem-paineis', JSON.stringify({ a: { lista: 1, principal: 2 }, b: { lista: -1, principal: 2 }, c: 3, d: { lista: '1', principal: 2 } }))
    expect(lerPaineis()).toEqual({ a: { lista: 1, principal: 2 } })
    sessionStorage.setItem('iconodb:rolagem-paineis', '[1]')
    expect(lerPaineis()).toEqual({})
    sessionStorage.setItem('iconodb:rolagem-paineis', '{')
    expect(lerPaineis()).toEqual({})
  })
})
