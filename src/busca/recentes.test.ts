import { LIMITE_DE_RECENTES, adicionarRecente, chaveDeRecente, limparRecentes, lerRecentes, removerRecente } from './recentes'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('buscas recentes (só neste aparelho)', () => {
  it('começa vazia; a mais recente vem primeiro', () => {
    expect(lerRecentes()).toEqual([])
    adicionarRecente('íbex')
    adicionarRecente('Mepido')
    expect(lerRecentes()).toEqual(['Mepido', 'íbex'])
  })

  it('guarda no máximo 8: a mais antiga sai', () => {
    for (let i = 1; i <= 10; i++) adicionarRecente(`busca ${i}`)
    const lista = lerRecentes()
    expect(LIMITE_DE_RECENTES).toBe(8)
    expect(lista).toHaveLength(8)
    expect(lista[0]).toBe('busca 10')
    expect(lista[7]).toBe('busca 3')
  })

  it('não repete: a mesma busca (sem distinguir acento, maiúscula nem espaços) sobe ao topo com a grafia nova', () => {
    adicionarRecente('íbex')
    adicionarRecente('leão')
    adicionarRecente('  IBEX ')
    expect(lerRecentes()).toEqual(['IBEX', 'leão'])
    adicionarRecente('Leao')
    expect(lerRecentes()).toEqual(['Leao', 'IBEX'])
  })

  it('a chave de comparação dobra acentos, maiúsculas e espaços', () => {
    expect(chaveDeRecente('  Íbex  ')).toBe(chaveDeRecente('ibex'))
    expect(chaveDeRecente('ʿĒn  Tāstiye')).toBe(chaveDeRecente('ʿen tastiye'))
    expect(chaveDeRecente('Maḥteṣ')).toBe('mahtes')
  })

  it('ignora o vazio e guarda sem as pontas', () => {
    adicionarRecente('')
    adicionarRecente('   ')
    expect(lerRecentes()).toEqual([])
    adicionarRecente('  leão  de  teste ')
    expect(lerRecentes()).toEqual(['leão de teste'])
  })

  it('cada busca guardada tem no máximo 200 caracteres (sem cortar um par substituto ao meio)', () => {
    adicionarRecente('a'.repeat(500))
    expect(lerRecentes()[0]).toHaveLength(200)
    adicionarRecente('𓀀'.repeat(300))
    const cortada = lerRecentes()[0]!
    expect([...cortada]).toHaveLength(200)
    expect(cortada.endsWith('𓀀')).toBe(true)
    // a de 200 exatos fica inteira
    adicionarRecente('b'.repeat(200))
    expect(lerRecentes()[0]).toBe('b'.repeat(200))
  })

  it('removerRecente tira uma; limparRecentes tira todas', () => {
    adicionarRecente('a1')
    adicionarRecente('b2')
    adicionarRecente('c3')
    expect(removerRecente('B2')).toEqual(['c3', 'a1'])
    expect(lerRecentes()).toEqual(['c3', 'a1'])
    limparRecentes()
    expect(lerRecentes()).toEqual([])
  })

  it('persiste no localStorage deste aparelho e nunca sai dele', () => {
    adicionarRecente('leão')
    expect(Object.keys(localStorage)).toEqual(['iconodb:buscas-recentes'])
    expect(JSON.parse(localStorage.getItem('iconodb:buscas-recentes')!)).toEqual(['leão'])
  })

  it('dado corrompido ou de outro formato vira lista vazia, sem erro', () => {
    localStorage.setItem('iconodb:buscas-recentes', '{não é json')
    expect(lerRecentes()).toEqual([])
    localStorage.setItem('iconodb:buscas-recentes', '{"a":1}')
    expect(lerRecentes()).toEqual([])
    localStorage.setItem('iconodb:buscas-recentes', JSON.stringify(['ok', 3, null, '', 'ok2']))
    expect(lerRecentes()).toEqual(['ok', 'ok2'])
  })

  it('sem localStorage (modo privado, acesso bloqueado) nada quebra e as recentes ficam na sessão', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cheio')
    })
    expect(() => adicionarRecente('leão')).not.toThrow()
    expect(lerRecentes()).toEqual(['leão'])
    expect(() => removerRecente('leão')).not.toThrow()
    expect(lerRecentes()).toEqual([])
    expect(() => limparRecentes()).not.toThrow()
  })
})
