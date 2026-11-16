import { fundir } from '../usuario/fusao'
import { ev } from '../../tests/suporte/eventosDeTeste'
import { camposDaObraNova, eCslValido, eObraDoLivro, eObraSkc, lerObra, type Csl } from './modelo'

const CSL: Csl = { type: 'book', title: 'Selos sonhados de teste', author: [{ family: 'Imaginária', given: 'Cicrana' }], issued: { 'date-parts': [[2010]] } }

describe('o modelo da obra do usuário', () => {
  it('os ids: a do usuário e a dos livros', () => {
    expect(eObraSkc('BIB-teste123-1')).toBe(true)
    expect(eObraSkc('BIB-900090')).toBe(false)
    expect(eObraDoLivro('BIB-900090')).toBe(true)
    expect(eObraDoLivro('BIB-teste123-1')).toBe(false)
    expect(eObraSkc('BIB-teste123-0')).toBe(false)
  })

  it('camposDaObraNova: o CSL sem id e a citação curta normalizada; recusa o CSL sem tipo ou título', () => {
    expect(camposDaObraNova({ ...CSL, id: 'TESTE-1' }, '  Imaginária   2010 ')).toEqual({ csl: CSL, curta: 'Imaginária 2010' })
    expect(() => camposDaObraNova({ ...CSL, title: ' ' }, 'x')).toThrow('obra sem tipo ou sem título')
    expect(() => camposDaObraNova({ ...CSL, type: '' }, 'x')).toThrow()
    expect(eCslValido([])).toBe(false)
    expect(eCslValido(null)).toBe(false)
  })

  it('lerObra: os campos, a última escrita e a exclusão; um registro sem CSL não é obra', () => {
    const reg = 'BIB-aaaaaaaa-1'
    const e = fundir([
      ev({ seq: 1, tipo: 'obra', reg, op: 'criar', campos: camposDaObraNova(CSL, 'Imaginária 2010') }),
      ev({ seq: 2, tipo: 'obra', reg, op: 'alterar', campos: { curta: 'Imaginária 2010a' } }),
      ev({ seq: 3, tipo: 'obra', reg: 'BIB-900001', op: 'alterar', campos: { curta: 'Autor 1999b' } }),
      ev({ seq: 4, tipo: 'obra', reg: 'BIB-aaaaaaaa-2', op: 'criar', campos: { csl: 'quebrado', curta: 3 } }),
    ])
    expect(lerObra(e.registro('obra', reg)!)).toEqual({ id: reg, csl: CSL, curta: 'Imaginária 2010a', criadoEm: e.registro('obra', reg)!.criadoEm, excluido: false })
    expect(lerObra(e.registro('obra', 'BIB-900001')!)).toBeNull()
    expect(lerObra(e.registro('obra', 'BIB-aaaaaaaa-2')!)).toBeNull()
    const excluida = fundir([ev({ seq: 1, tipo: 'obra', reg, op: 'criar', campos: { csl: CSL } }), ev({ seq: 2, tipo: 'obra', reg, op: 'excluir' })])
    expect(lerObra(excluida.registro('obra', reg)!)).toMatchObject({ curta: '', excluido: true })
  })
})
