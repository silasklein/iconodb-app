/**
 * O nível que vale de uma hipótese dos livros (Parte 2C, bloco 3, Tarefa 13): a regra, o objeto do livro refeito com ela e
 * as gravações do seletor, antes e depois de publicado (fix round 1: voltar sempre exclui). Sobre o pacote sintético (HY-900006 já vem revista: `level`
 * iconográfico, `level_auto` pré-iconográfico). Só ids TESTE.
 */
import { act, renderHook } from '@testing-library/react'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { hipotese, item } from '../banco/consultas'
import { NIVEIS, type Hipotese, type ItemDetalhe, type Nivel } from '../banco/tipos'
import { estadoAtual, registrar } from '../usuario/estado'
import type { Registro } from '../usuario/fusao'
import { comNiveisRevistos, escolherNivel, nivelDaHipoteseDoLivro, nivelRevisto, reverNivel, useItensComNiveisRevistos, voltarAoNivelAutomatico, type NiveisDaCamada } from './niveis'

const reg = (id: string, campos: Registro['campos'], excluido = false): [string, Registro] => [
  id,
  { id, tipo: 'nivel', campos, criadoEm: '1', alteradoEm: '1', excluido },
]
const camada = (...rs: [string, Registro][]): NiveisDaCamada => new Map(rs)
const h = (id: string, nivel: Nivel, nivelAutomatico: Nivel | null = null) => ({ id, nivel, nivelAutomatico })
const ids = (d: ItemDetalhe, n: Nivel) => d.hipotesesPorNivel[n].map((x) => x.id)

beforeAll(async () => usarMotor(await bancoDeTeste()))
afterAll(() => usarMotor(null))

describe('nivelDaHipoteseDoLivro', () => {
  it('antes de publicado: sem registro vale o do pacote; o registro vivo vale; excluído ou null volta ao do pacote', () => {
    const livro = h('HY-900001', 'iconographic')
    expect(nivelDaHipoteseDoLivro(undefined, livro)).toEqual({ efetivo: 'iconographic', automatico: 'iconographic', revisto: false })
    expect(nivelDaHipoteseDoLivro(camada(reg('HY-900001', { nivel: 'iconological' })), livro)).toEqual({
      efetivo: 'iconological',
      automatico: 'iconographic',
      revisto: true,
    })
    expect(nivelDaHipoteseDoLivro(camada(reg('HY-900001', { nivel: 'iconological' }, true)), livro).efetivo).toBe('iconographic')
    expect(nivelDaHipoteseDoLivro(camada(reg('HY-900001', { nivel: null })), livro).efetivo).toBe('iconographic')
    expect(nivelDaHipoteseDoLivro(camada(reg('HY-900001', { nivel: 'mitologico' })), livro).efetivo).toBe('iconographic')
    // o mesmo nível do automático não é «revisto»
    expect(nivelDaHipoteseDoLivro(camada(reg('HY-900001', { nivel: 'iconographic' })), livro).revisto).toBe(false)
  })

  it('depois de publicado (`level_auto`): o registro vivo vale e tem a nota; sem ele (ou excluído, ou null), o automático', () => {
    const publicada = h('HY-900006', 'iconographic', 'pre_iconographic')
    // fix round 1: sem registro vivo, vale o `level_auto` (a revisão publicada e depois desfeita), sem nota
    expect(nivelDaHipoteseDoLivro(undefined, publicada)).toEqual({ efetivo: 'pre_iconographic', automatico: 'pre_iconographic', revisto: false })
    expect(nivelDaHipoteseDoLivro(camada(reg('HY-900006', { nivel: 'iconographic' })), publicada)).toEqual({
      efetivo: 'iconographic',
      automatico: 'pre_iconographic',
      revisto: true,
    })
    expect(nivelDaHipoteseDoLivro(camada(reg('HY-900006', { nivel: 'iconological' })), publicada)).toMatchObject({ efetivo: 'iconological', revisto: true })
    expect(nivelDaHipoteseDoLivro(camada(reg('HY-900006', { nivel: 'pre_iconographic' })), publicada).revisto).toBe(false)
    // o processamento tira o excluído (e o null) de niveis.json: o próximo pacote traz o automático
    expect(nivelDaHipoteseDoLivro(camada(reg('HY-900006', { nivel: 'iconographic' }, true)), publicada)).toMatchObject({ efetivo: 'pre_iconographic', revisto: false })
    expect(nivelDaHipoteseDoLivro(camada(reg('HY-900006', { nivel: null })), publicada).efetivo).toBe('pre_iconographic')
  })
})

describe('comNiveisRevistos: o objeto do livro com o nível que vale', () => {
  it('rever muda o bloco, a contagem e a âncora do texto; o resto fica', async () => {
    const d = (await item('CA00001'))!
    expect(ids(d, 'iconographic')).toEqual(['HY-900001'])
    const ancora = () => d.leituras.flatMap((l) => l.ancoras).find((a) => a.hipoteseId === 'HY-900001')
    expect(ancora()?.nivel).toBe('iconographic')

    const revisto = comNiveisRevistos(camada(reg('HY-900001', { nivel: 'iconological' })), d)
    expect(ids(revisto, 'iconographic')).toEqual([])
    expect(ids(revisto, 'iconological')).toEqual(['HY-900001'])
    expect(ids(revisto, 'pre_iconographic')).toEqual(ids(d, 'pre_iconographic'))
    expect(NIVEIS.reduce((n, nv) => n + revisto.hipotesesPorNivel[nv].length, 0)).toBe(NIVEIS.reduce((n, nv) => n + d.hipotesesPorNivel[nv].length, 0))
    expect(revisto.leituras.flatMap((l) => l.ancoras).find((a) => a.hipoteseId === 'HY-900001')?.nivel).toBe('iconological')
    // só o nível muda: o trecho, o termo e a certeza são os do livro
    const antes = d.hipotesesPorNivel.iconographic[0]!
    const depois = revisto.hipotesesPorNivel.iconological[0]!
    expect({ ...depois, nivel: antes.nivel }).toEqual(antes)
    expect(depois.nivelAutomatico).toBeNull()
    // o pacote não muda
    expect(ancora()?.nivel).toBe('iconographic')
    expect(ids(d, 'iconographic')).toEqual(['HY-900001'])
  })

  it('sem revisão que mude algo, o mesmo objeto (os memos da tela não refazem)', async () => {
    const d = (await item('CA00001'))!
    expect(comNiveisRevistos(undefined, d)).toBe(d)
    expect(comNiveisRevistos(camada(), d)).toBe(d)
    expect(comNiveisRevistos(camada(reg('HY-900001', { nivel: 'iconographic' })), d)).toBe(d)
  })

  it('foco 4: o registro de uma hipótese que não existe (sumiu do pacote) é ignorado, sem erro', async () => {
    const d = (await item('CA00001'))!
    const fantasmas = camada(reg('HY-999999', { nivel: 'iconological' }), reg('HY-000001', { nivel: 'pre_iconographic' }, true))
    expect(comNiveisRevistos(fantasmas, d)).toBe(d)
    expect(await hipotese('HY-999999')).toBeNull()
  })

  it('a hipótese já publicada com a revisão (HY-900006): sem registro vivo vai ao automático; o registro vivo (restaurado) a mantém', async () => {
    const d = (await item('CA00003'))!
    const h6 = NIVEIS.flatMap((n) => d.hipotesesPorNivel[n]).find((x) => x.id === 'HY-900006') as Hipotese
    expect(h6).toMatchObject({ nivel: 'iconographic', nivelAutomatico: 'pre_iconographic' })
    for (const niveis of [undefined, camada(), camada(reg('HY-900006', { nivel: 'iconographic' }, true))]) {
      const voltou = comNiveisRevistos(niveis, d)
      expect(ids(voltou, 'pre_iconographic')).toContain('HY-900006')
      expect(ids(voltou, 'iconographic')).not.toContain('HY-900006')
    }
    const viva = comNiveisRevistos(camada(reg('HY-900006', { nivel: 'iconographic' })), d)
    expect(viva).toBe(d)
    expect(ids(viva, 'iconographic')).toContain('HY-900006')
  })
})

describe('as gravações do seletor e de «Voltar ao nível automático»', () => {
  it('antes de publicado: escolher grava; escolher o automático, ou voltar, exclui a revisão', async () => {
    const livro = h('HY-900003', 'iconographic')
    expect(await escolherNivel(livro, 'iconological')).toMatchObject({ tipo: 'nivel', reg: 'HY-900003', op: 'criar', campos: { nivel: 'iconological' } })
    expect(nivelRevisto(estadoAtual(), 'HY-900003')).toBe('iconological')
    expect(await escolherNivel(livro, 'iconographic')).toMatchObject({ op: 'excluir' })
    expect(nivelRevisto(estadoAtual(), 'HY-900003')).toBeNull()
    // rever de novo restaura, e voltar exclui
    await escolherNivel(livro, 'pre_iconographic')
    expect(nivelRevisto(estadoAtual(), 'HY-900003')).toBe('pre_iconographic')
    expect(await voltarAoNivelAutomatico(livro)).toMatchObject({ op: 'excluir' })
    expect(estadoAtual().registro('nivel', 'HY-900003')?.excluido).toBe(true)
    // sem revisão viva, voltar não grava nada
    expect(await voltarAoNivelAutomatico(livro)).toBeNull()
  })

  it('depois de publicado: voltar e escolher o automático EXCLUEM o registro (nunca fixam um nível); «Restaurar» devolve o da pessoa', async () => {
    const publicada = h('HY-900006', 'iconographic', 'pre_iconographic')
    const situacao = () => nivelDaHipoteseDoLivro(estadoAtual().registros.get('nivel'), publicada)
    // o registro que a importação publicou
    await reverNivel('HY-900006', 'iconographic')
    expect(situacao()).toEqual({ efetivo: 'iconographic', automatico: 'pre_iconographic', revisto: true })
    expect(await voltarAoNivelAutomatico(publicada)).toMatchObject({ tipo: 'nivel', reg: 'HY-900006', op: 'excluir' })
    expect(estadoAtual().registro('nivel', 'HY-900006')?.excluido).toBe(true)
    expect(situacao()).toEqual({ efetivo: 'pre_iconographic', automatico: 'pre_iconographic', revisto: false })
    // sem revisão viva, voltar não grava nada
    expect(await voltarAoNivelAutomatico(publicada)).toBeNull()
    // «Restaurar» (Excluídos) devolve o nível da pessoa, com a nota
    await registrar('nivel', 'HY-900006', 'restaurar')
    expect(situacao()).toEqual({ efetivo: 'iconographic', automatico: 'pre_iconographic', revisto: true })
    // escolher o automático no seletor também exclui; escolher outro nível restaura e grava
    expect(await escolherNivel(publicada, 'pre_iconographic')).toMatchObject({ op: 'excluir' })
    expect(situacao().efetivo).toBe('pre_iconographic')
    expect(await escolherNivel(publicada, 'iconological')).toMatchObject({ op: 'alterar', campos: { nivel: 'iconological' } })
    expect(estadoAtual().registro('nivel', 'HY-900006')).toMatchObject({ excluido: false, campos: { nivel: 'iconological' } })
    expect(situacao()).toMatchObject({ efetivo: 'iconological', revisto: true })
    // nenhum caminho gravou um registro vivo com o nível automático
    await voltarAoNivelAutomatico(publicada)
    expect(estadoAtual().registro('nivel', 'HY-900006')?.excluido).toBe(true)
  })
})

describe('useItensComNiveisRevistos (N1)', () => {
  it('nenhum item muda: a mesma lista, mesmo com um nível novo na camada', async () => {
    const itens = [(await item('CA00001'))!, (await item('CA00002'))!]
    const { result } = renderHook(() => useItensComNiveisRevistos(itens))
    const primeira = result.current
    expect(primeira).toBe(itens)
    await act(() => reverNivel('HY-999998', 'iconological'))
    expect(result.current).toBe(itens)
    await act(() => reverNivel('HY-900001', 'iconological'))
    expect(result.current).not.toBe(itens)
    expect(result.current![0]!.hipotesesPorNivel.iconological.map((x) => x.id)).toContain('HY-900001')
    expect(result.current![1]).toBe(itens[1])
    await act(() => voltarAoNivelAutomatico(h('HY-900001', 'iconographic')))
  })
})
