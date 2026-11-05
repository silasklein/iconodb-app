import { ev } from '../../tests/suporte/eventosDeTeste'
import { fundir } from '../usuario/fusao'
import { esquecerOsDonos, guardarOsDonos } from './donos'
import { elementosSkcDosObjetos, hipotesesSkcDosObjetos, porNivel, posicaoDaHipotese, regioesDosObjetos } from './doUsuario'

const R4 = '<polygon points="0.1,0.1 0.5,0.1 0.5,0.5"/>'

const estado = fundir([
  ev({ seq: 1, tipo: 'hipotese', reg: 'HY-aaaaaaaa-1', op: 'criar', campos: { objeto: 'CA00001', sobre: 'objeto', nivel: 'iconographic', modalidade: 'probable', termos: [], termosRotulos: [] } }),
  ev({ seq: 2, tipo: 'hipotese', reg: 'HY-aaaaaaaa-2', op: 'criar', campos: { objeto: 'OB-aaaaaaaa-1', sobre: 'objeto', nivel: 'iconological', modalidade: 'possible' } }),
  ev({ seq: 3, tipo: 'hipotese', reg: 'HY-aaaaaaaa-3', op: 'criar', campos: { objeto: 'CA00001', sobre: 'objeto', nivel: 'pre_iconographic', modalidade: 'asserted' } }),
  ev({ seq: 4, tipo: 'hipotese', reg: 'HY-aaaaaaaa-4', op: 'criar', campos: { objeto: 'CA00001', nivel: 'iconographic', modalidade: 'asserted' } }),
  ev({ seq: 5, tipo: 'hipotese', reg: 'HY-aaaaaaaa-4', op: 'excluir', campos: {} }),
  ev({ seq: 6, tipo: 'hipotese', reg: 'HY-aaaaaaaa-5', op: 'criar', campos: { objeto: 'CA00001', nivel: 'lixo', modalidade: 'asserted' } }),
  ev({ seq: 7, tipo: 'regiao', reg: 'RG-aaaaaaaa-1', op: 'criar', campos: { imagem: 'IM-aaaaaaaa-1', objeto: 'OB-aaaaaaaa-1', seletor: R4, elemento: 'focinho', elementoId: null, pai: null } }),
  ev({ seq: 8, tipo: 'regiao', reg: 'RG-aaaaaaaa-2', op: 'criar', campos: { imagem: 'IMG-TESTE-0001-1', objeto: 'CA00001', seletor: R4, elemento: 'leão-de-teste', elementoId: 'EL-900002', pai: null } }),
  ev({ seq: 9, tipo: 'regiao', reg: 'RG-aaaaaaaa-3', op: 'criar', campos: { imagem: 'IMG-TESTE-0001-1', objeto: 'CA00001', seletor: 'lixo', elemento: 'x', elementoId: null } }),
  ev({ seq: 10, tipo: 'posicao', reg: 'HY-900001', op: 'criar', campos: { hipotese: 'HY-900001', posicao: 'concordo', justificativa: '' } }),
  ev({ seq: 11, tipo: 'posicao', reg: 'HY-900002', op: 'criar', campos: { hipotese: 'HY-900002', posicao: 'discordo', justificativa: '' } }),
  ev({ seq: 12, tipo: 'posicao', reg: 'HY-900002', op: 'excluir', campos: {} }),
])

describe('as hipóteses SKC, regiões e posições de um objeto (ou do grupo de ligação)', () => {
  it('hipóteses vivas dos objetos, na ordem em que foram registradas', () => {
    expect(hipotesesSkcDosObjetos(estado, ['CA00001']).map((h) => h.id)).toEqual(['HY-aaaaaaaa-1', 'HY-aaaaaaaa-3', 'HY-aaaaaaaa-5'])
    expect(hipotesesSkcDosObjetos(estado, ['CA00001', 'OB-aaaaaaaa-1']).map((h) => h.id)).toEqual(['HY-aaaaaaaa-1', 'HY-aaaaaaaa-2', 'HY-aaaaaaaa-3', 'HY-aaaaaaaa-5'])
    expect(hipotesesSkcDosObjetos(estado, [])).toEqual([])
  })

  it('revisão 3, M13: a hipótese ancorada na leitura SKC de um objeto é DESSE objeto (o dono da leitura), mesmo registrada na tela de outro', () => {
    // Registrada na tela do principal OB-…-1 (objeto = ele) com o trecho na leitura de OB-…-2, ligado; a ligação foi desfeita.
    const ancora = { fonte: 'OB-aaaaaaaa-2', lingua: 'skc', inicio: 0, fim: 3, trecho: 'Uma', sha: 'a'.repeat(64) }
    const e = fundir([ev({ seq: 1, tipo: 'hipotese', reg: 'HY-aaaaaaaa-9', op: 'criar', campos: { objeto: 'OB-aaaaaaaa-1', sobre: 'objeto', nivel: 'iconographic', modalidade: 'probable', ancora } })])
    expect(hipotesesSkcDosObjetos(e, ['OB-aaaaaaaa-2']).map((h) => h.id)).toEqual(['HY-aaaaaaaa-9'])
    expect(hipotesesSkcDosObjetos(e, ['OB-aaaaaaaa-1'])).toEqual([])
    // Ligados de novo, o grupo tem os dois: ela aparece uma vez.
    expect(hipotesesSkcDosObjetos(e, ['OB-aaaaaaaa-1', 'OB-aaaaaaaa-2']).map((h) => h.id)).toEqual(['HY-aaaaaaaa-9'])
  })

  describe('T17-B-4: a hipótese ancorada num trecho do livro é do objeto DESSE trecho', () => {
    afterEach(() => esquecerOsDonos())
    const ancora = { fonte: 'PA-TESTE-0003-cat-1', lingua: 'pt', inicio: 0, fim: 3, trecho: 'Uma', sha: 'a'.repeat(64) }
    const e = fundir([ev({ seq: 1, tipo: 'hipotese', reg: 'HY-aaaaaaaa-8', op: 'criar', campos: { objeto: 'OB-aaaaaaaa-1', sobre: 'objeto', nivel: 'iconographic', modalidade: 'probable', ancora } })])

    it('sem a resposta do pacote, vale o objeto gravado (o principal)', () => {
      expect(hipotesesSkcDosObjetos(e, ['OB-aaaaaaaa-1']).map((h) => h.id)).toEqual(['HY-aaaaaaaa-8'])
      expect(hipotesesSkcDosObjetos(e, ['CA00003'])).toEqual([])
    })

    it('com a resposta, ela segue o trecho para o objeto do livro (a ligação foi desfeita); ligados, o grupo tem os dois e ela aparece uma vez', () => {
      guardarOsDonos(['PA-TESTE-0003-cat-1'], new Map([['PA-TESTE-0003-cat-1', ['CA00003']]]))
      expect(hipotesesSkcDosObjetos(e, ['CA00003']).map((h) => h.id)).toEqual(['HY-aaaaaaaa-8'])
      expect(hipotesesSkcDosObjetos(e, ['OB-aaaaaaaa-1'])).toEqual([])
      expect(hipotesesSkcDosObjetos(e, ['OB-aaaaaaaa-1', 'CA00003']).map((h) => h.id)).toEqual(['HY-aaaaaaaa-8'])
    })

    it('se o objeto gravado é um dos que o trecho descreve, nada muda', () => {
      const e2 = fundir([ev({ seq: 1, tipo: 'hipotese', reg: 'HY-aaaaaaaa-7', op: 'criar', campos: { objeto: 'CA00003', sobre: 'objeto', nivel: 'iconographic', modalidade: 'probable', ancora } })])
      guardarOsDonos(['PA-TESTE-0003-cat-1'], new Map([['PA-TESTE-0003-cat-1', ['BA00009', 'CA00003']]]))
      expect(hipotesesSkcDosObjetos(e2, ['CA00003']).map((h) => h.id)).toEqual(['HY-aaaaaaaa-7'])
    })
  })

  it('por nível; sem nível válido fica à parte', () => {
    const p = porNivel(hipotesesSkcDosObjetos(estado, ['CA00001', 'OB-aaaaaaaa-1']))
    expect(p.pre_iconographic.map((h) => h.id)).toEqual(['HY-aaaaaaaa-3'])
    expect(p.iconographic.map((h) => h.id)).toEqual(['HY-aaaaaaaa-1'])
    expect(p.iconological.map((h) => h.id)).toEqual(['HY-aaaaaaaa-2'])
    expect(p.semNivel.map((h) => h.id)).toEqual(['HY-aaaaaaaa-5'])
  })

  it('regiões com polígono; os elementos SKC são as regiões que são elemento novo', () => {
    expect(regioesDosObjetos(estado, ['CA00001']).map((r) => r.id)).toEqual(['RG-aaaaaaaa-2'])
    expect(elementosSkcDosObjetos(estado, ['CA00001', 'OB-aaaaaaaa-1'])).toEqual([{ id: 'RG-aaaaaaaa-1', rotulo: 'focinho', pai: null }])
  })

  it('a posição viva sobre uma hipótese do livro', () => {
    expect(posicaoDaHipotese(estado, 'HY-900001')).toMatchObject({ posicao: 'concordo' })
    expect(posicaoDaHipotese(estado, 'HY-900002')).toBeNull()
    expect(posicaoDaHipotese(estado, 'HY-900003')).toBeNull()
  })
})
