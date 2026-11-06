/**
 * O que as telas leem dos verbetes do usuário (decisão 41): a lista viva (Glossário, campo Termo), o verbete pela chave
 * da forma (para nunca criar um repetido no mesmo aparelho), quem usa um verbete (hipóteses e notas) e as hipóteses SKC
 * que apontam para ele (a página do verbete). Puro sobre o `Estado`, mais os hooks.
 */
import { useCallback, useMemo } from 'react'
import { useDonosDosTrechos } from '../hipoteses/garantirDonos'
import { lerHipotese, objetoDaHipotese, type HipoteseSkc } from '../hipoteses/modelo'
import { destinoDe, origensDe, useDestinosCriados, useRedirecionamentos, type Redirecionamentos } from '../pacote/redirecionamentos'
import type { Estado } from '../usuario/estado'
import { refsDeObjetosExcluidos } from '../colecoes/visiveis'
import { useLido } from '../usuario/useLido'
import { nomeVivo, useFormasDoPacote } from './formasDoPacote'
import { chaveDaForma, eVerbeteSkc, lerEdicaoDoVerbete, lerVerbeteSkc, type EdicaoDoVerbete, type VerbeteSkc } from './modelo'

const porCriacao = (a: VerbeteSkc, b: VerbeteSkc) => (a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Os verbetes do usuário vivos, na ordem em que foram criados (dois "iguais", de dois aparelhos, aparecem os dois). Os que o
 * pacote publicou com um id do livro (`redirecionados`, Tarefa 16) não entram: quem aparece é o verbete do livro.
 */
export function verbetesSkc(estado: Estado, redirecionados?: Redirecionamentos | null): VerbeteSkc[] {
  const saida: VerbeteSkc[] = []
  for (const r of estado.registros.get('verbete')?.values() ?? []) if (!r.excluido && eVerbeteSkc(r.id) && !redirecionados?.has(r.id)) saida.push(lerVerbeteSkc(r))
  return saida.sort(porCriacao)
}

/** O verbete do usuário vivo (o mais antigo) cuja forma, original ou em uso, tem esta chave. */
export function verbeteSkcDaChave(estado: Estado, chave: string): VerbeteSkc | null {
  return verbetesSkc(estado).find((v) => chaveDaForma(v.forma) === chave || (v.formaEmUso !== null && chaveDaForma(v.formaEmUso) === chave)) ?? null
}

const usaNoTexto = (v: unknown, id: string) => typeof v === 'string' && (v.includes(`[[${id}|`) || v.includes(`[[${id}]]`))

/**
 * Quantos registros vivos usam o verbete: hipóteses SKC que o têm nos `termos` (menos `exceto`) e notas, justificativas
 * ou leituras que ligam a ele (`[[id]]` ou `[[id|…]]`).
 */
export function usosDoVerbete(estado: Estado, id: string, exceto: string | null = null): number {
  let n = 0
  for (const [tipo, registros] of estado.registros) {
    for (const r of registros.values()) {
      if (r.excluido || r.id === exceto) continue
      if (tipo === 'hipotese' && Array.isArray(r.campos.termos) && r.campos.termos.includes(id)) n++
      else if (Object.values(r.campos).some((v) => usaNoTexto(v, id))) n++
    }
  }
  return n
}

/**
 * As hipóteses SKC vivas com este termo, na ordem em que foram registradas. `origens`: os verbetes do usuário que o pacote
 * publicou como este (Tarefa 16): as hipóteses com eles também são deste verbete.
 */
export function hipotesesDoVerbete(estado: Estado, id: string, origens: readonly string[] = []): HipoteseSkc[] {
  const saida: HipoteseSkc[] = []
  const ids = [id, ...origens]
  const foraDeVista = refsDeObjetosExcluidos(estado) // as hipóteses de um objeto excluído ficam guardadas, escondidas
  for (const r of estado.registros.get('hipotese')?.values() ?? []) {
    const termos = r.campos.termos
    if (r.excluido || !Array.isArray(termos) || !ids.some((x) => termos.includes(x))) continue
    const h = lerHipotese(r)
    const dono = objetoDaHipotese(h)
    if (dono !== null && foraDeVista.has(dono)) continue
    saida.push(h)
  }
  return saida.sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : a.id < b.id ? -1 : 1))
}

/**
 * A forma em uso de cada verbete que tem uma, para as telas (Tarefa 11): a que a pessoa escreveu num verbete do pacote
 * (só entra quem tem), e a em uso ou criada de cada verbete do usuário (o excluído também: as hipóteses que o citam
 * seguem com o nome dele). As telas mostram o nome de agora (`nomeVivo`): forma em uso, senão o nome do pacote, senão o rótulo guardado.
 */
export function formasEmUso(estado: Estado): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const r of estado.registros.get('verbete')?.values() ?? []) {
    if (eVerbeteSkc(r.id)) mapa.set(r.id, lerVerbeteSkc(r).emUso)
    else {
      const { formaEmUso } = lerEdicaoDoVerbete(r)
      if (formaEmUso !== null) mapa.set(r.id, formaEmUso)
    }
  }
  return mapa
}

/** O que a pessoa escreveu nos verbetes do PACOTE (forma em uso, estado, forma aprovada), pelo id. Os do usuário são lidos por `lerVerbeteSkc`. */
export function edicoesDosVerbetes(estado: Estado): Map<string, EdicaoDoVerbete> {
  const mapa = new Map<string, EdicaoDoVerbete>()
  for (const r of estado.registros.get('verbete')?.values() ?? []) if (!eVerbeteSkc(r.id)) mapa.set(r.id, lerEdicaoDoVerbete(r))
  return mapa
}

/** Um verbete apontado como possível duplicado: o id (do usuário ou do livro) e o nome de agora. */
export interface ParecidoNoGlossario {
  id: string
  nome: string
  /** É um verbete do usuário (senão, do livro). */
  doUsuario: boolean
}

/**
 * Os verbetes que podem ser o mesmo termo (dois aparelhos o criaram sem internet, ou uma forma foi mudada para a de outro,
 * inclusive para a de um verbete do livro): os que têm a mesma chave (`chaveDaForma`, a dobra de sempre) no nome de AGORA
 * (renomear um deles resolve). Só entram os grupos com algo que a pessoa fez: um verbete do usuário vivo, ou um do livro
 * cuja forma ela mudou; dois do livro iguais no pacote, sem mexida, não são da conta de quem usa o glossário. Cada um traz os outros do grupo (os do usuário, na ordem em que foram criados, e
 * depois os do livro, na ordem dada). Juntá-los é com a pessoa; nada é feito sozinho.
 *
 * `livros`: os verbetes do pacote com o nome de agora (a forma em uso, ou o `pt`).
 */
export function duplicadosNoGlossario(
  usuario: readonly VerbeteSkc[],
  livros: readonly { id: string; nome: string; /** A pessoa mudou a forma deste verbete do livro (a renomeação é dela). */ editado?: boolean }[],
): Map<string, ParecidoNoGlossario[]> {
  const grupos = new Map<string, { id: string; nome: string; doUsuario: boolean; dela: boolean }[]>()
  const pôr = (id: string, nome: string, doUsuario: boolean, dela: boolean) => {
    const chave = chaveDaForma(nome)
    if (chave === '') return
    ;(grupos.get(chave) ?? grupos.set(chave, []).get(chave)!).push({ id, nome, doUsuario, dela })
  }
  for (const v of [...usuario].sort(porCriacao)) if (!v.excluido) pôr(v.id, v.emUso, true, true)
  for (const l of livros) pôr(l.id, l.nome, false, l.editado === true)
  const saida = new Map<string, ParecidoNoGlossario[]>()
  for (const g of grupos.values()) {
    // Só o que a pessoa fez: um verbete dela, ou um do livro cuja forma ela mudou. Dois iguais no pacote, sem mexida, não.
    if (g.length < 2 || !g.some((x) => x.dela)) continue
    for (const x of g) saida.set(x.id, g.filter((o) => o.id !== x.id).map((o) => ({ id: o.id, nome: o.nome, doUsuario: o.doUsuario })))
  }
  return saida
}

/** Os verbetes do usuário vivos (`verbetesSkc`), sem os que o pacote publicou (os redirecionados, Tarefa 16). */
export function useVerbetesSkc(): VerbeteSkc[] {
  const todos = useLido(['verbete'], '', verbetesSkc)
  const redirecionados = useRedirecionamentos()
  return useMemo(() => (redirecionados && redirecionados.size > 0 ? todos.filter((v) => !redirecionados.has(v.id)) : todos), [todos, redirecionados])
}

/**
 * Os possíveis duplicados no glossário (`duplicadosNoGlossario`), com os verbetes do livro pelo nome de agora. Sem as formas
 * do pacote (ainda carregando, ou sem pacote), só os do usuário entre si.
 */
export function useDuplicadosDoGlossario(): ReadonlyMap<string, readonly ParecidoNoGlossario[]> {
  const usuario = useVerbetesSkc()
  const formas = useFormasEmUso()
  const pacote = useFormasDoPacote()
  return useMemo(() => {
    const livros: { id: string; nome: string; editado: boolean }[] = []
    for (const [id, f] of pacote ?? []) {
      const nome = formas.get(id) ?? f.pt
      if (nome) livros.push({ id, nome, editado: formas.has(id) })
    }
    return duplicadosNoGlossario(usuario, livros)
  }, [usuario, formas, pacote])
}

/** As formas em uso (`formasEmUso`); refaz só quando um verbete muda. */
export const useFormasEmUso = (): ReadonlyMap<string, string> => useLido(['verbete'], 'formas', formasEmUso)

/** As edições dos verbetes do pacote (`edicoesDosVerbetes`). */
export const useEdicoesDosVerbetes = (): ReadonlyMap<string, EdicaoDoVerbete> => useLido(['verbete'], 'edicoes', edicoesDosVerbetes)

/** O que a pessoa escreveu num verbete (do pacote ou do usuário): forma em uso e estado; null se nunca mexeu. */
export const useEdicaoDoVerbete = (id: string): EdicaoDoVerbete | null =>
  useLido(['verbete'], `edicao:${id}`, (e) => {
    const r = e.registro('verbete', id)
    return r ? lerEdicaoDoVerbete(r) : null
  })


/** O verbete do usuário (vivo ou excluído) pelo id; null se não existe. */
export const useVerbeteSkc = (id: string): VerbeteSkc | null =>
  useLido(['verbete'], id, (e) => {
    const r = e.registro('verbete', id)
    return r && eVerbeteSkc(id) ? lerVerbeteSkc(r) : null
  })

/** As hipóteses SKC do verbete, com as dos verbetes do usuário que o pacote publicou como ele (Tarefa 16). */
export function useHipotesesDoVerbete(id: string): HipoteseSkc[] {
  const origens = origensDe(useRedirecionamentos(), id)
  const chave = [id, ...origens].join('|')
  return useLido(['hipotese', 'objeto'], chave, (e) => hipotesesDoVerbete(e, id, origens))
}

/**
 * Quantos objetos têm hipótese SKC viva com cada verbete do usuário (a contagem do Glossário). Com `criados` (os
 * redirecionamentos com `criado`; revisão 2, N2), os de um verbete do usuário que criou um verbete do livro contam no do
 * livro, sem repetir um objeto que use duas origens.
 */
export function objetosPorVerbeteSkc(estado: Estado, criados: Redirecionamentos = new Map()): Map<string, number> {
  const objetos = new Map<string, Set<string>>()
  const foraDeVista = refsDeObjetosExcluidos(estado)
  for (const r of estado.registros.get('hipotese')?.values() ?? []) {
    if (r.excluido || !Array.isArray(r.campos.termos)) continue
    const h = lerHipotese(r)
    const objeto = objetoDaHipotese(h)
    if (!objeto || foraDeVista.has(objeto)) continue
    for (const t of h.termos) {
      if (!eVerbeteSkc(t.id)) continue
      const id = destinoDe(criados, t.id)
      ;(objetos.get(id) ?? objetos.set(id, new Set()).get(id)!).add(objeto)
    }
  }
  return new Map([...objetos].map(([id, s]) => [id, s.size]))
}

/** A contagem do Glossário: `objetosPorVerbeteSkc` com os redirecionamentos que criaram verbetes do livro. */
export function useObjetosPorVerbeteSkc(): Map<string, number> {
  const criados = useDestinosCriados()
  const donos = useDonosDosTrechos() // o objeto de uma hipótese ancorada num trecho do livro é o do trecho (T17-B-4)
  const chave = `${[...criados].map(([de, para]) => `${de}>${para}`).join('|')}#${donos}`
  return useLido(['hipotese', 'objeto'], chave, (e) => objetosPorVerbeteSkc(e, criados))
}

/**
 * O nome de agora de um verbete para as telas (revisão 1, I2): a forma em uso, senão o nome do pacote, senão o rótulo guardado
 * (que só vale quando o verbete não existe). Uma hipótese guarda o nome de quando foi feita, que pode ter sido uma forma em uso
 * que depois voltou à proposta.
 */
export function useNomeVivo(): (id: string, guardado: string) => string {
  const formas = useFormasEmUso()
  const pacote = useFormasDoPacote()
  const redirecionados = useRedirecionamentos()
  // Um verbete do usuário que o pacote publicou (Tarefa 16) tem o nome do verbete do livro.
  return useCallback((id, guardado) => nomeVivo(destinoDe(redirecionados, id), guardado, formas, pacote), [formas, pacote, redirecionados])
}
