import { termoNovo } from './modelo'
import { apagarRascunhoDaHipotese, chaveDoRascunho, guardarRascunhoDaHipotese, lerRascunhoDaHipotese, rascunhoNovo } from './rascunho'

const SHA = 'b'.repeat(64)

beforeEach(() => localStorage.clear())

describe('o rascunho da nova hipótese (localStorage, síncrono, um por objeto)', () => {
  it('começa com o trecho, iconográfico e provável (como o board), sobre o objeto inteiro', () => {
    const a = { fonte: 'PA-TESTE-0001-cat-1', lingua: 'pt' as const, inicio: 1, fim: 4, trecho: 'abc', sha: SHA }
    expect(rascunhoNovo('CA00001', a)).toMatchObject({ objeto: 'CA00001', ancora: a, sobre: { tipo: 'objeto' }, termos: [], nivel: 'iconographic', modalidade: 'probable', justificativa: '', reserva: null, criado: null, aberto: true })
  })

  it('guarda e lê de volta, por objeto; lixo e outra chave não quebram', () => {
    const r = { ...rascunhoNovo('OB-aaaaaaaa-1', null), justificativa: 'quase', termos: [{ id: 'GL-1', rotulo: 'um' }], sobre: { tipo: 'nova' as const, regiao: { imagem: 'IM-aaaaaaaa-1', pontos: [[0, 0], [1, 0], [1, 1]] as [number, number][], nome: 'focinho', pai: null } } }
    guardarRascunhoDaHipotese(r)
    expect(localStorage.getItem(chaveDoRascunho('OB-aaaaaaaa-1'))).not.toBeNull()
    expect(lerRascunhoDaHipotese('OB-aaaaaaaa-1')).toEqual({ ...r, salvoEm: expect.any(Number) })
    expect(lerRascunhoDaHipotese('CA00001')).toBeNull()
    localStorage.setItem(chaveDoRascunho('CA00002'), '{lixo')
    expect(lerRascunhoDaHipotese('CA00002')).toBeNull()
    localStorage.setItem(chaveDoRascunho('CA00003'), JSON.stringify({ objeto: 'CA00003', nivel: 'x', modalidade: 7, sobre: { tipo: 'elemento', id: 'lixo' }, termos: 'x', reserva: { hipotese: 'HY-aaaaaaaa-2', regiao: 3 }, criado: 'outro' }))
    expect(lerRascunhoDaHipotese('CA00003')).toMatchObject({ nivel: 'iconographic', modalidade: 'probable', sobre: { tipo: 'objeto' }, termos: [], reserva: { hipotese: 'HY-aaaaaaaa-2', regiao: null }, criado: null })
    apagarRascunhoDaHipotese('OB-aaaaaaaa-1')
    expect(lerRascunhoDaHipotese('OB-aaaaaaaa-1')).toBeNull()
  })

  it('decisão 41: o termo a criar (novo) e o id reservado para ele sobrevivem a um recarregar; lixo não vira termo novo', () => {
    const r = {
      ...rascunhoNovo('CA00001', null),
      termos: [{ id: 'GL-900001', rotulo: 'leão-de-teste' }, termoNovo('Termo Novo')],
      reserva: { hipotese: 'HY-aaaaaaaa-3', regiao: null, termos: { 'termo novo': 'GL-aaaaaaaa-4' } },
    }
    guardarRascunhoDaHipotese(r)
    const lido = lerRascunhoDaHipotese('CA00001')!
    expect(lido.termos).toEqual([{ id: 'GL-900001', rotulo: 'leão-de-teste' }, { id: 'novo:termo novo', rotulo: 'Termo Novo', novo: true }])
    expect(lido.reserva).toEqual({ hipotese: 'HY-aaaaaaaa-3', regiao: null, termos: { 'termo novo': 'GL-aaaaaaaa-4' } })
    localStorage.setItem(
      chaveDoRascunho('CA00002'),
      JSON.stringify({
        objeto: 'CA00002',
        termos: [{ id: 'GL-900001', rotulo: 'x', novo: true }, { id: 'novo:y', rotulo: 'y', novo: 'sim' }, { id: 'novo:  ', rotulo: '  ', novo: true }],
        reserva: { hipotese: 'HY-aaaaaaaa-5', regiao: null, termos: { a: 'GL-900001', b: 7, c: 'GL-aaaaaaaa-6' } },
      }),
    )
    const lixo = lerRascunhoDaHipotese('CA00002')!
    // um id do pacote marcado "novo" fica como termo comum; um "novo:" sem a marca, ou sem forma, sai
    expect(lixo.termos).toEqual([{ id: 'GL-900001', rotulo: 'x' }])
    expect(lixo.reserva).toEqual({ hipotese: 'HY-aaaaaaaa-5', regiao: null, termos: { c: 'GL-aaaaaaaa-6' } })
  })

  it('sem localStorage (modo privado): não guarda nem quebra', () => {
    const espiao = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cota')
    })
    expect(() => guardarRascunhoDaHipotese(rascunhoNovo('CA00001', null))).not.toThrow()
    espiao.mockRestore()
  })
})
