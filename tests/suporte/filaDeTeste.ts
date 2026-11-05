import type { LinhaDaFila } from '../../src/banco/consultas'

/** `n` casos distintos da fila do pacote (do mesmo tipo), para os testes que só conferem contagens. */
export function linhasDeTeste(n: number): LinhaDaFila[] {
  return Array.from({ length: n }, (_, i) => ({ tipo: 'medidas_nao_normalizadas', entidade: 'item', entidadeId: `TESTE-${String(i).padStart(6, '0')}`, detalhe: `caso ${i}`, numero: `CA${String(i).padStart(5, '0')}` }))
}
