/**
 * Tarefa 4 do plano «O IPIAO lido no formato do §»: o que a leitura guarda neste aparelho (as colunas abertas e a última
 * posição por obra), como `lerLinguasAbertas` do §: localStorage protegido, com a memória de reserva.
 */
import {
  esquecerPreferenciasDaMemoria,
  gravarColunasDaLeitura,
  gravarPosicao,
  lerColunasDaLeitura,
  lerPosicao,
} from './preferencias'

afterEach(() => {
  localStorage.clear()
  esquecerPreferenciasDaMemoria()
  vi.restoreAllMocks()
})

describe('as colunas da leitura (q2 A: o alemão aberto)', () => {
  it('o padrão abre o alemão; a escolha fica lembrada, à parte da do §', () => {
    expect(lerColunasDaLeitura()).toEqual({ de: true })
    gravarColunasDaLeitura({ de: false })
    expect(lerColunasDaLeitura()).toEqual({ de: false })
    expect(JSON.parse(localStorage.getItem('iconodb:leitura-linguas')!)).toEqual({ de: false })
    expect(localStorage.getItem('iconodb:paragrafo-linguas')).toBeNull()
  })

  it('o valor estragado vale o padrão', () => {
    localStorage.setItem('iconodb:leitura-linguas', '{"de":"sim"}')
    expect(lerColunasDaLeitura()).toEqual({ de: true })
    localStorage.setItem('iconodb:leitura-linguas', 'não é json')
    expect(lerColunasDaLeitura()).toEqual({ de: true })
  })

  it('sem localStorage (modo privado): vale na memória até recarregar, sem erro', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    expect(lerColunasDaLeitura()).toEqual({ de: true })
    gravarColunasDaLeitura({ de: false })
    expect(lerColunasDaLeitura()).toEqual({ de: false })
  })
})

describe('a última posição por obra', () => {
  it('nada guardado: null; depois, a rota de cada obra', () => {
    expect(lerPosicao('TESTE')).toBeNull()
    gravarPosicao('TESTE', '/ler/TESTE/trecho/PA-TESTE-I.S.11-ovw-1')
    gravarPosicao('OUTRA', '/ler/OUTRA/entrada/2')
    expect(lerPosicao('TESTE')).toBe('/ler/TESTE/trecho/PA-TESTE-I.S.11-ovw-1')
    expect(lerPosicao('OUTRA')).toBe('/ler/OUTRA/entrada/2')
    gravarPosicao('TESTE', '/ler/TESTE/entrada/3')
    expect(lerPosicao('TESTE')).toBe('/ler/TESTE/entrada/3')
    expect(JSON.parse(localStorage.getItem('iconodb:leitura-posicao')!)).toEqual({ TESTE: '/ler/TESTE/entrada/3', OUTRA: '/ler/OUTRA/entrada/2' })
  })

  it('o valor estragado vale nada guardado; a rota que não é da leitura não vale', () => {
    localStorage.setItem('iconodb:leitura-posicao', '[1, 2]')
    expect(lerPosicao('TESTE')).toBeNull()
    localStorage.setItem('iconodb:leitura-posicao', '{"TESTE": 3, "OUTRA": "/item/1"}')
    expect(lerPosicao('TESTE')).toBeNull()
    expect(lerPosicao('OUTRA')).toBeNull()
    localStorage.setItem('iconodb:leitura-posicao', '{')
    expect(lerPosicao('TESTE')).toBeNull()
    // gravar por cima do estragado recomeça
    gravarPosicao('TESTE', '/ler/TESTE/entrada/1')
    expect(lerPosicao('TESTE')).toBe('/ler/TESTE/entrada/1')
  })

  it('sem localStorage (modo privado): vale na memória até recarregar, sem erro', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    expect(lerPosicao('TESTE')).toBeNull()
    gravarPosicao('TESTE', '/ler/TESTE/entrada/2')
    expect(lerPosicao('TESTE')).toBe('/ler/TESTE/entrada/2')
  })
})
