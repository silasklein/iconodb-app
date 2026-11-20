/**
 * `juntar`: os sítios como a lista e o mapa dos Sítios os mostram (de src/sitios/sitiosDaLista.ts, sem mudar nada; puro, sem
 * React, para o scripts/conferir-leitura.ts contar os sítios dos mapas da leitura no Node com a mesma conta; plano «Os mapas
 * da introdução pelo mapa do app», Tarefa 2). O hook que o monta para as telas é `useSitiosDaLista`.
 */
import type { SitioResumo } from '../banco/tipos'
import { dadosDoDestino, totalDeObjetos } from './contagem'
import type { useResolucaoDaLista } from './doUsuario'
import type { DadosDoSitio, SitioSkc } from './modelo'
import { regiaoDe } from './regioes'

/** Um sítio da lista: do livro (com a correção do usuário, se há) ou novo do usuário. */
export interface SitioDaLista extends SitioResumo {
  doUsuario: boolean
  /** A coordenada é a que a pessoa escreveu (até 5 casas, sem zeros à direita). */
  coordenadaDoUsuario: boolean
  /** A região geográfica deduzida da coordenada (src/sitios/regioes.ts), ou «sem-coordenada». */
  regiaoGeo: string
}

/**
 * Os sítios do livro com o nome, as grafias, a região e a coordenada corrigidos, e os sítios novos do usuário. A busca da lista
 * acha pelo nome de agora e pelo do livro (e pelas grafias).
 *
 * Parte 2C, bloco 2 (`daLista`, a resolução): um sítio mesclado em outro não aparece; o nome dele e as grafias novas acham o
 * destino (`nomes`), os objetos dele, os do destino e os das partes somam na contagem (`totalDeObjetos`, cada objeto do pacote uma vez), e a coordenada e a
 * região que faltam ao destino vêm do absorvido de menor id (`dadosDoDestino`). Enquanto a resolução não chega, como antes.
 */
export function juntar(
  lista: readonly SitioResumo[],
  correcoes: ReadonlyMap<string, DadosDoSitio>,
  novos: readonly SitioSkc[],
  contagem: ReadonlyMap<string, number>,
  daLista: ReturnType<typeof useResolucaoDaLista>,
  todosSkc: readonly SitioSkc[],
  distintos: ReadonlyMap<string, number> | null,
): { itens: SitioDaLista[]; busca: Map<string, string> } {
  const busca = new Map<string, string>()
  const itens: SitioDaLista[] = []
  const doLivro = new Map(lista.map((s) => [s.id, s] as const))
  const skc = new Map(todosSkc.map((s) => [s.id, s] as const))
  const doPacote = (id: string) => doLivro.get(id)?.objetos ?? 0
  const daPessoaNoSitio = (id: string) => contagem.get(id) ?? 0
  // A coordenada (e se é a da pessoa) e a região de um sítio só, como a lista as mostrava antes. A região leva o id e o nome
  // da mesma fonte: a do livro (o verbete-pai), ou o texto da pessoa (sem id).
  const dadosDe = (id: string) => {
    const s = doLivro.get(id)
    const c = s ? correcoes.get(id) : skc.get(id)
    const livro = s && s.lat !== null && s.lon !== null ? { lat: s.lat, lon: s.lon } : null
    const regiaoObjeto: SitioResumo['regiao'] = c?.regiao ? { id: '', nome: c.regiao } : (s?.regiao ?? null)
    return { coordenada: c?.coordenada ?? livro, regiao: regiaoObjeto?.nome ?? null, regiaoObjeto, pais: null, nota: null, daPessoa: !s || !!c?.coordenada }
  }
  /**
   * O que a linha mostra de um sítio: com a resolução, os campos que faltam vêm do absorvido de menor id, e a contagem soma os
   * absorvidos e as partes (cada objeto do pacote uma vez: `distintos`).
   */
  const linha = (id: string) => {
    if (!daLista) {
      const d = dadosDe(id)
      return { coordenada: d.coordenada, regiao: d.regiaoObjeto, daPessoa: d.daPessoa, objetos: doPacote(id) + daPessoaNoSitio(id) }
    }
    const d = dadosDoDestino(daLista.resolucao, id, dadosDe)
    const daPessoa = d.origem.coordenada !== undefined && dadosDe(d.origem.coordenada).daPessoa
    const regiao = d.origem.regiao !== undefined ? dadosDe(d.origem.regiao).regiaoObjeto : null
    return { coordenada: d.coordenada, regiao, daPessoa, objetos: totalDeObjetos(daLista.resolucao, id, doPacote, daPessoaNoSitio, distintos) }
  }
  for (const s of lista) {
    if (daLista?.destinos.has(s.id)) continue
    const c = correcoes.get(s.id)
    const l = linha(s.id)
    busca.set(s.id, [s.nome, s.literal, s.id, c?.nome, ...(c?.variantes ?? []), c?.regiao, c?.pais, ...(daLista?.nomes.get(s.id) ?? [])].filter(Boolean).join(' '))
    itens.push({
      ...s,
      nome: c?.nome ?? s.nome,
      regiao: l.regiao,
      lat: l.coordenada?.lat ?? null,
      lon: l.coordenada?.lon ?? null,
      objetos: l.objetos,
      doUsuario: false,
      coordenadaDoUsuario: l.daPessoa,
      regiaoGeo: regiaoDe(l.coordenada?.lat, l.coordenada?.lon),
    })
  }
  for (const s of novos) {
    const l = linha(s.id)
    busca.set(s.id, [s.nomeDeAgora, s.id, ...s.variantes, s.regiao, s.pais, s.nota, ...(daLista?.nomes.get(s.id) ?? [])].filter(Boolean).join(' '))
    itens.push({
      id: s.id,
      nome: s.nomeDeAgora,
      literal: s.nomeDeAgora,
      glId: null,
      lat: l.coordenada?.lat ?? null,
      lon: l.coordenada?.lon ?? null,
      regiao: l.regiao,
      objetos: l.objetos,
      doUsuario: true,
      coordenadaDoUsuario: l.coordenada === null || l.daPessoa,
      regiaoGeo: regiaoDe(l.coordenada?.lat, l.coordenada?.lon),
    })
  }
  return { itens, busca }
}
