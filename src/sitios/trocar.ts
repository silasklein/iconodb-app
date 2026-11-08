/**
 * As linhas da folha «Sítio deste objeto» (Parte 2C, bloco 2; telas aprovadas §5), em árvore: os sítios de cima em ordem
 * alfabética, cada parte logo depois do seu todo (irmãos também em ordem alfabética), recuada um nível por todo acima dela.
 * PURA: sem React.
 */
import { dobrar } from '../glossario/modelo'
import { numeroPtBr } from '../ui/numero'
import type { OpcaoDeSitio } from './doUsuario'
import type { Resolucao } from './resolucao'

export interface LinhaDaTroca {
  opcao: OpcaoDeSitio
  /** 0 = sem recuo; 1 = parte direta de um todo da lista; 2 = parte de uma parte… */
  nivel: number
  apoio: string
}

/** Uma opção casa com a busca: todas as palavras (sem diacríticos nem caixa) no nome, no nome do livro, nas grafias e na região. */
export const casaComABusca = (o: OpcaoDeSitio, palavras: readonly string[]): boolean => {
  const texto = dobrar([o.nome, o.nomeDoLivro, o.regiao, ...o.grafias].filter(Boolean).join(' '))
  return palavras.every((p) => texto.includes(p))
}

const objetos = (n: number) => `${numeroPtBr(n)} ${n === 1 ? 'objeto' : 'objetos'}`

/**
 * As linhas da lista para as `palavras` da busca (dobradas; nenhuma: todos os sítios). `opcoes` vem de `useOpcoesDeSitio`: sem
 * os absorvidos, em ordem alfabética, cada contagem já com as partes de baixo.
 * - A árvore se monta sobre o que casa com a busca, o sítio atual incluído; depois o atual sai da lista, mas as partes dele
 *   ficam, recuadas como estariam sob ele. O atual é o destino de `atual` (um sítio mesclado responde pelo destino).
 * - Sem busca, as partes do atual vêm PRIMEIRO (cada uma com as dela abaixo), e depois a árvore dos outros: a folha mostra só as
 *   primeiras linhas, e num livro com dezenas de sítios as partes, no lugar alfabético do atual, ficariam de fora (revisão da
 *   Tarefa 14, I1). Com busca, ficam no lugar do atual.
 * - Uma parte cujo todo está entre os que casam vem recuada sob ele: «parte de Tell Teste · 4 objetos». A que não tem o todo
 *   entre eles vem sem recuo, com o caminho inteiro: «Tell Teste › Área Teste BB · 1 objeto».
 * - Um sítio de cima: «antes: Tall Modelo · Região Teste · 6 objetos», como antes desta tarefa («SKC» vai ao lado do nome).
 * Sem a resolução (ainda não chegou): a lista simples, sem recuo.
 */
export function opcoesDaTroca(r: Resolucao | null, opcoes: readonly OpcaoDeSitio[], atual: string | null, palavras: readonly string[]): LinhaDaTroca[] {
  const idAtual = atual === null ? null : r ? r.destino(r.canonico(atual)) : atual
  const casam = opcoes.filter((o) => casaComABusca(o, palavras))
  const antes = (o: OpcaoDeSitio) => (o.nomeDoLivro ? `antes: ${o.nomeDoLivro}` : null)
  const deCima = (o: OpcaoDeSitio) => [antes(o), o.regiao, objetos(o.objetos)].filter(Boolean).join(' · ')
  if (!r) return casam.filter((o) => o.id !== idAtual).map((opcao) => ({ opcao, nivel: 0, apoio: deCima(opcao) }))

  const porId = new Map(opcoes.map((o) => [o.id, o]))
  const nomeDe = (id: string) => porId.get(id)?.nome ?? id
  const naArvore = new Set(casam.map((o) => o.id))
  const filhos = new Map<string, OpcaoDeSitio[]>()
  const raizes: OpcaoDeSitio[] = []
  for (const o of casam) {
    const t = r.todo(o.id)
    if (t !== null && naArvore.has(t)) filhos.set(t, [...(filhos.get(t) ?? []), o])
    else raizes.push(o)
  }
  const doAtual: LinhaDaTroca[] = []
  const outras: LinhaDaTroca[] = []
  const primeiroAsDoAtual = palavras.length === 0
  const descer = (o: OpcaoDeSitio, nivel: number, sobOAtual: boolean) => {
    const t = r.todo(o.id)
    const apoio =
      t === null
        ? deCima(o)
        : [antes(o), nivel > 0 ? `parte de ${nomeDe(t)}` : r.caminho(o.id).map(nomeDe).join(' › '), objetos(o.objetos)].filter(Boolean).join(' · ')
    if (o.id !== idAtual) (sobOAtual && primeiroAsDoAtual ? doAtual : outras).push({ opcao: o, nivel, apoio })
    for (const f of filhos.get(o.id) ?? []) descer(f, nivel + 1, sobOAtual || o.id === idAtual)
  }
  for (const o of raizes) descer(o, 0, false)
  return [...doAtual, ...outras]
}
