import { esquecerModoDaMemoria, lerModoDaColecao, MODOS_DA_COLECAO, gravarModoDaColecao } from './preferencia'

beforeEach(() => {
  localStorage.clear()
  esquecerModoDaMemoria()
})
afterEach(() => vi.restoreAllMocks())

describe('lista ou miniaturas: a escolha é do aparelho (spec 4.2)', () => {
  it('o padrão é a lista', () => {
    expect(lerModoDaColecao()).toBe('lista')
    expect(MODOS_DA_COLECAO).toEqual(['lista', 'miniaturas'])
  })

  it('a escolha fica lembrada no localStorage e volta na próxima leitura', () => {
    gravarModoDaColecao('miniaturas')
    expect(localStorage.getItem('iconodb:colecao-modo')).toBe('miniaturas')
    expect(lerModoDaColecao()).toBe('miniaturas')
    gravarModoDaColecao('lista')
    expect(lerModoDaColecao()).toBe('lista')
  })

  it('um valor estranho no localStorage volta ao padrão', () => {
    localStorage.setItem('iconodb:colecao-modo', 'grade')
    expect(lerModoDaColecao()).toBe('lista')
  })

  it('sem localStorage (lançando erro) a escolha vale até a página recarregar, sem estourar', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cheio', 'QuotaExceededError')
    })
    expect(lerModoDaColecao()).toBe('lista')
    expect(() => gravarModoDaColecao('miniaturas')).not.toThrow()
    expect(lerModoDaColecao()).toBe('miniaturas')
  })

  it('não vai à sincronização: nenhum evento é gravado', async () => {
    const { todosEventos } = await import('../usuario/armazem')
    const antes = (await todosEventos()).length
    gravarModoDaColecao('miniaturas')
    expect((await todosEventos()).length).toBe(antes)
  })
})
