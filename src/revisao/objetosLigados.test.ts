/**
 * Revisão final do bloco 3 (M3): `itensLigadosNoApp`, os itens das citações que a pessoa ligou a uma obra no app. Só citações
 * e obras inventadas.
 */
import type { CitacaoDoPacote } from '../banco/consultas'
import { estadoAtual, registrar } from '../usuario/estado'
import { excluirLigacao, ligar } from './ligacoes'
import { comObjetosLigados, itensLigadosNoApp } from './objetosLigados'
import type { ObraDaLista } from '../bibliografia/doUsuario'

const citacao = (id: number, itemId: string | null, curta: string, mais: Partial<CitacaoDoPacote> = {}): CitacaoDoPacote => ({
  id, sigla: 'TESTE', itemId, passagemId: null, hipoteseId: null, categoria: 7, bruto: `${curta}: ${id}`, curta, obraId: null, resolvida: false, resolvidaPor: null, ...mais,
})

afterEach(async () => {
  for (const r of estadoAtual().registros.get('citacao')?.values() ?? []) if (!r.excluido) await excluirLigacao(r.id)
})

describe('itensLigadosNoApp', () => {
  it('junta por obra os itens das citações que a camada liga, um item uma vez; a sem item e a que o pacote já liga ficam de fora', async () => {
    await ligar('probe 1993', 'BIB-900001')
    await ligar('amostra 1992', 'BIB-tolig001-1')
    await registrar('obra', 'BIB-tolig001-1', 'criar', { csl: { type: 'book', title: 'Amostra de teste' }, curta: 'Amostra 1992' })
    const citacoes = [
      citacao(1, 'TESTE-0101', 'Probe 1993'),
      citacao(2, 'TESTE-0101', 'Probe 1993'),
      citacao(3, 'TESTE-0102', 'Probe 1993'),
      citacao(4, null, 'Probe 1993', { passagemId: 'PA-TESTE-I.S.1-ovw-1' }),
      citacao(5, 'TESTE-0103', 'Amostra 1992'),
      // a ligada pelo usuário no pacote à mesma obra: já está nos objetos do pacote
      citacao(6, 'TESTE-0104', 'Probe 1993', { obraId: 'BIB-900001', resolvida: true, resolvidaPor: 'user' }),
      citacao(7, 'TESTE-0105', 'Fantasma 1888'),
    ]
    expect(itensLigadosNoApp(estadoAtual(), citacoes)).toEqual(
      new Map([
        ['BIB-900001', ['TESTE-0101', 'TESTE-0102']],
        ['BIB-tolig001-1', ['TESTE-0103']],
      ]),
    )
    // a obra sua publicada conta pelo id do livro (a página que abre)
    expect(itensLigadosNoApp(estadoAtual(), citacoes, undefined, new Map([['BIB-tolig001-1', 'BIB-900091']])).get('BIB-900091')).toEqual(['TESTE-0103'])
  })

  it('comObjetosLigados: a obra do pacote passa a contar os objetos dela e dos ligados; a obra sua soma aos objetos SKC', () => {
    const obra = (id: string, objetos: number, skc: boolean): ObraDaLista => ({ id, curta: id, titulo: null, origem: null, objetos, curtas: [], csl: null, skc })
    const ligados = new Map([
      ['BIB-900001', { itens: ['TESTE-0001', 'TESTE-0101'], objetos: 2 }],
      ['BIB-tolig001-1', { itens: ['TESTE-0103'], objetos: 1 }],
    ])
    expect(comObjetosLigados([obra('BIB-900001', 1, false), obra('BIB-tolig001-1', 2, true), obra('BIB-900002', 5, false)], ligados).map((o) => o.objetos)).toEqual([2, 3, 5])
  })
})
