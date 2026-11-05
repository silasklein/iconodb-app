/**
 * A linha "números nas fontes" (decisões 38 e 39), logo abaixo do número do sistema: as referências de origem de todos
 * os membros do grupo de ligação, no formato de `formatarReferencias` ("TESTE I: 1, 2, Abb. 2 · SKC: 12"). Primeiro as
 * dos livros, na ordem das fontes (as do cabeçalho do Item: `ItemDaFonte.referencia` / `fontesDosObjetos`), depois o
 * SKC, Nr. de cada objeto SKC do grupo ("SKC: 12", " (provisório)" até confirmar). Um objeto SKC sem ligação mostra só
 * "SKC: 12". PURO.
 */
import { formatarReferencias, type ReferenciaDeFonte } from '../banco/referencias'
import { idDeObjetoSkc, type Numeracao } from './numeracao'

export function textoDosNumerosNasFontes(livros: readonly ReferenciaDeFonte[], membros: readonly string[], numeracao: Numeracao): string {
  const skc = membros.flatMap((ref): ReferenciaDeFonte[] => {
    const i = idDeObjetoSkc(ref) ? numeracao.porId.get(ref) : undefined
    return i && i.nrSkc !== null ? [{ obra: 'SKC', numero: i.nrSkc, provisorio: i.situacaoNrSkc === 'provisorio' }] : []
  })
  return formatarReferencias([...livros, ...skc])
}
