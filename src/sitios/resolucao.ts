/**
 * A resolução dos sítios (Parte 2C, bloco 2; especificação §5): pacote + camada do usuário → o destino de cada sítio
 * (`mescladoEm`), o todo (`parteDe`), as grafias do usuário, os pares «São lugares diferentes», os conflitos e os pares
 * sugeridos ainda não resolvidos. PURA: sem React, sem IndexedDB. Todas as telas leem o resultado dela.
 *
 * PORTE EXATO do `iconodb/sitios_relacoes.py` do processamento (`resolver_sitios`, `relacoes`), que muda junto com este. O
 * contrato é o arquivo de casos tests/fixtures/sitios-resolucao-casos.json, copiado byte a byte nos dois repositórios e com
 * o mesmo sha256 fixado nos dois (src/sitios/resolucao.test.ts): quem mudar um passo muda o arquivo, roda os dois portes e
 * refixa o sha256 nos dois.
 *
 * Os passos (os mesmos nos dois portes):
 * 1. Canônico: `c(x) = pacote.publicados.get(x) ?? x`. Existe `x` se `c(x)` está em `pacote.sitios`, ou se `c(x)` é um
 *    `SI-…` com registro `sitio` não excluído. Os campos de um registro excluído não contam.
 * 2. Ler os campos: para cada id canônico `k`, os registros que dão nele (o próprio `k` e os `SI-…` publicados como `k`); por
 *    campo vale a escrita de maior hlc entre eles (empate: o registro de maior id por ponto de código). As grafias por
 *    `lerGrafias` (src/sitios/modelo.ts): com a compatibilidade das `variantes`.
 * 3. Arestas de mescla: `k → c(mescladoEm)` se escrito com um id; escrito `null` (ou outro valor): nenhuma; nunca escrito:
 *    `pacote.mesclas.get(k)`, com hlc `''` (zero). Só vale se `k` e o alvo existem e são diferentes; um alvo que não vale
 *    NÃO devolve a mescla do pacote (vale o último ato da pessoa).
 * 4. Círculos (no máximo uma saída por nó, então os círculos são disjuntos): em cada um sai a aresta de menor `(hlc, k)` (k
 *    por ponto de código: "TESTE-10" < "TESTE-9"). Se o hlc dela não é `''`, ela vira um conflito, e o vencedor é a aresta de
 *    maior `(hlc, k)` do círculo.
 * 5. Destino: segue as arestas até o fim (todo sítio que existe tem destino; ele mesmo, se não foi mesclado).
 * 6. Partes, só para `k` com `destino(k) == k`: `k → destino(c(parteDe))` (escrito/null/pacote como em 3, com
 *    `pacote.partes`); vale se `c(parteDe)` existe e o alvo é diferente de `k`. Círculos como em 4 (tipo "parte").
 * 7. Grafias: as do destino, depois as dos absorvidos (em ordem de id), sem repetir `(chaveDaGrafia(texto), livro)`.
 * 8. Diferentes: a união dos `diferentesDe` de todos os registros não excluídos, em pares `(menor, maior)` de ids canônicos
 *    que existem, sem repetir, em ordem.
 * 9. Pares pendentes: os de `pacote.pares` (na ordem do pacote) com os dois existindo e, sendo `A = destino(c(a))`,
 *    `B = destino(c(b))`: `A != B`, nenhum ancestral do outro pela cadeia de `todo`, e nem `(min, max)` de `c(a), c(b)` nem
 *    o de `A, B` em `diferentes` (uma resposta «São lugares diferentes» não volta a ser pergunta porque um dos dois foi
 *    mesclado depois).
 * 10. Relações (`relacoesDe`): mesclas `{k: destino}` (destino ≠ k), partes = todo, grafias só as listas não vazias (cada item
 *    `{texto, tradicao|null, livro|null}`), diferentes = o passo 8. Chaves em ordem de ponto de código.
 * Os conflitos saem em ordem: os de mescla, depois os de parte; dentro de cada tipo, pelo registro. Toda ordem de ids aqui é
 * por ponto de código (`compararPorPontoDeCodigo`), nunca numérica. As grafias do pacote (`PacoteDeSitios.grafias`, as dos
 * livros) não entram: a tela as junta às do usuário.
 */
import { compararPorPontoDeCodigo as cp } from '../usuario/eventos'
import type { Estado, Registro } from '../usuario/fusao'
import { chaveDaGrafia, eSitioSkc, juntarGrafias, lerGrafias, normalizarGrafias, type EscritaDoCampo, type GrafiaDoUsuario, type Tradicao } from './modelo'

/** Uma grafia de um sítio que vem do pacote (`sitio_grafia`). */
export interface GrafiaDoPacote {
  sitio: string
  texto: string
  tradicao: Tradicao | null
  sigla: string | null
  pagina: string | null
  origem: 'livro' | 'usuario'
}

/** Um par de sítios que o processamento acha que pode ser o mesmo lugar (`sitio_par_sugerido`, `a < b`). */
export interface ParSugerido {
  a: string
  b: string
  motivo: 'coordenada' | 'nome' | 'variante'
}

/** O que o pacote diz dos sítios (src/sitios/pacote.ts o lê; um pacote antes do schema 8 só tem os sítios). */
export interface PacoteDeSitios {
  /** Os `<SIGLA>-<n>` do pacote. */
  sitios: ReadonlySet<string>
  /** `SI-…` → `<SIGLA>-<n>`: os sítios do usuário que o pacote publicou. */
  publicados: ReadonlyMap<string, string>
  /**
   * Os `<SIGLA>-<n>` que o pacote CRIOU de um sítio do usuário (os destinos de `publicados` com `criado`): sítios seus com id de
   * livro (M-1). Um destino a que um `SI-…` só leva (já era do livro) não entra.
   */
  criados: ReadonlySet<string>
  /** Livro → livro: as mesclas que o processamento gravou (valem como um `mescladoEm` de hlc zero). */
  mesclas: ReadonlyMap<string, string>
  /** Parte → todo (como um `parteDe` de hlc zero). */
  partes: ReadonlyMap<string, string>
  grafias: readonly GrafiaDoPacote[]
  pares: readonly ParSugerido[]
}

export const PACOTE_VAZIO: PacoteDeSitios = { sitios: new Set(), publicados: new Map(), criados: new Set(), mesclas: new Map(), partes: new Map(), grafias: [], pares: [] }

/** Uma escrita de `mescladoEm`/`parteDe` descartada num círculo (o aparelho = o fim do hlc). */
export interface Conflito {
  tipo: 'mescla' | 'parte'
  registro: string
  valor: string
  hlc: string
  aparelho: string
  vencedor: { registro: string; valor: string; hlc: string; aparelho: string }
}

export interface Resolucao {
  /** Os ids canônicos de todos os sítios que existem, em ordem de ponto de código (os absorvidos também). */
  readonly sitios: readonly string[]
  existe(id: string): boolean
  /** O id do pacote de um `SI-…` publicado; senão o próprio id. */
  canonico(id: string): string
  /**
   * O sítio (pelo canônico) é seu? Um `SI-…` ainda não publicado, ou um `<SIGLA>-<n>` que o pacote criou de um sítio seu
   * (`criados`; M-1). O do livro a que um `SI-…` só leva continua do livro. É o «seu»/«dos livros» das telas e o lado de
   * `sugestaoDeQualFica`.
   */
  eDoUsuario(id: string): boolean
  /** O sítio em que este foi mesclado, no fim da cadeia; ele mesmo se não foi (ou se não existe). */
  destino(id: string): string
  /** Os sítios mesclados neste, diretos e indiretos, em ordem de ponto de código ([] se este não é um destino). */
  absorvidos(id: string): string[]
  /** O todo direto (só um destino tem todo; um sítio mesclado não é parte), ou null. */
  todo(id: string): string | null
  /** Os todos acima deste, do mais alto ao direto. */
  caminho(id: string): string[]
  /** As partes diretas, em ordem de ponto de código. */
  partes(id: string): string[]
  /** Todos os que estão abaixo, em árvore: cada parte (em ordem de ponto de código) seguida das dela. */
  descendentes(id: string): string[]
  /** As grafias que a pessoa deu a este destino e aos absorvidos nele ([] num absorvido: as dele estão no destino). */
  grafiasDoUsuario(id: string): GrafiaDoUsuario[]
  readonly diferentes: readonly (readonly [string, string])[]
  readonly conflitos: readonly Conflito[]
  readonly paresPendentes: readonly ParSugerido[]
}

/** O formato do `relacoes()` do processamento (o que o `user-import` grava em `data/usuario/sitios-relacoes.json`). */
export interface Relacoes {
  mesclas: Record<string, string>
  partes: Record<string, string>
  grafias: Record<string, { texto: string; tradicao: Tradicao | null; livro: string | null }[]>
  diferentes: [string, string][]
}

// ---------------------------------------------------------------- passo 2

const CAMPOS = ['mescladoEm', 'parteDe', 'grafias', 'variantes'] as const
type Campo = (typeof CAMPOS)[number]
type Escritas = Record<Campo, EscritaDoCampo | null>

/**
 * O `mescladoEm`/`parteDe` de um sítio como está escrito agora, pela regra da resolução (passos 1–3): entre os registros vivos
 * que respondem por ele (o dele e os `SI-…` publicados como ele), a escrita de maior hlc; sem nenhuma, o valor do pacote. É o que
 * um «Desfazer» grava de volta. null: escrito sem id, ou nada.
 */
export function campoEscrito(estado: Estado, pacote: PacoteDeSitios, id: string, campo: 'mescladoEm' | 'parteDe'): string | null {
  const c = (x: string): string => pacote.publicados.get(x) ?? x
  const k = c(id)
  const registros = [...(estado.registros.get('sitio')?.values() ?? [])].filter((r) => !r.excluido && c(r.id) === k)
  const escrito = idEscrito(escritasDe(registros, estado)[campo])
  return escrito !== undefined ? escrito : ((campo === 'mescladoEm' ? pacote.mesclas : pacote.partes).get(k) ?? null)
}

/** Por campo: a escrita de maior hlc entre os registros (empate: o de maior id por ponto de código), ou null. */
function escritasDe(registros: readonly Registro[], estado: Estado): Escritas {
  const saida = {} as Escritas
  for (const campo of CAMPOS) {
    let melhor: { hlc: string; id: string; valor: EscritaDoCampo['valor'] } | null = null
    for (const r of registros) {
      if (!(campo in r.campos)) continue
      const hlc = estado.hlcDoCampo('sitio', r.id, campo) ?? ''
      if (melhor === null || hlc > melhor.hlc || (hlc === melhor.hlc && cp(r.id, melhor.id) > 0)) melhor = { hlc, id: r.id, valor: r.campos[campo]! }
    }
    saida[campo] = melhor === null ? null : { valor: melhor.valor, hlc: melhor.hlc }
  }
  return saida
}

/** mescladoEm/parteDe: undefined (nunca escrito), null (escrito sem id) ou o id. */
function idEscrito(e: EscritaDoCampo | null): string | null | undefined {
  if (e === null) return undefined
  return typeof e.valor === 'string' && e.valor !== '' ? e.valor : null
}

function diferentesDe(r: Registro): string[] {
  const v = r.campos.diferentesDe
  const saida: string[] = []
  for (const x of Array.isArray(v) ? v : []) if (typeof x === 'string' && x !== '' && !saida.includes(x)) saida.push(x)
  return saida
}

// ---------------------------------------------------------------- passos 3–9

type Arestas = Map<string, readonly [alvo: string, hlc: string]>

const porPonto = (lista: Iterable<string>): string[] => [...lista].sort(cp)

/** Tira, de cada círculo, a aresta de menor (hlc, k); as de hlc não zero viram conflito. */
function semCirculos(entrada: Arestas, tipo: Conflito['tipo']): { arestas: Arestas; conflitos: Conflito[] } {
  const arestas: Arestas = new Map(entrada)
  const conflitos: Conflito[] = []
  const visto = new Set<string>()
  for (const inicio of porPonto(arestas.keys())) {
    const caminho: string[] = []
    const posicao = new Map<string, number>()
    let x = inicio
    while (arestas.has(x) && !visto.has(x) && !posicao.has(x)) {
      posicao.set(x, caminho.length)
      caminho.push(x)
      x = arestas.get(x)![0]
    }
    for (const k of caminho) visto.add(k)
    if (!posicao.has(x)) continue
    const circulo = caminho.slice(posicao.get(x)!)
    const ordem = circulo.sort((a, b) => {
      const ha = arestas.get(a)![1]
      const hb = arestas.get(b)![1]
      return ha < hb ? -1 : ha > hb ? 1 : cp(a, b)
    })
    const perde = ordem[0]!
    const vence = ordem[ordem.length - 1]!
    const [alvo, hlc] = arestas.get(perde)!
    arestas.delete(perde)
    if (hlc !== '') {
      const [vAlvo, vHlc] = arestas.get(vence)!
      conflitos.push({ tipo, registro: perde, valor: alvo, hlc, aparelho: hlc.slice(-8), vencedor: { registro: vence, valor: vAlvo, hlc: vHlc, aparelho: vHlc.slice(-8) } })
    }
  }
  conflitos.sort((a, b) => cp(a.registro, b.registro))
  return { arestas, conflitos }
}

function fim(arestas: Arestas, k: string): string {
  while (arestas.has(k)) k = arestas.get(k)![0]
  return k
}

export function resolverSitios(estado: Estado, pacote: PacoteDeSitios): Resolucao {
  const c = (x: string): string => pacote.publicados.get(x) ?? x
  const vivos = new Map<string, Registro>()
  for (const [id, r] of estado.registros.get('sitio') ?? []) if (!r.excluido) vivos.set(id, r)
  const existe = (x: unknown): x is string => {
    if (typeof x !== 'string') return false
    const k = c(x)
    return pacote.sitios.has(k) || (eSitioSkc(k) && vivos.has(k))
  }

  // 1–2
  const canonicos = new Set(pacote.sitios)
  for (const id of vivos.keys()) if (eSitioSkc(id) && !pacote.publicados.has(id)) canonicos.add(id)
  const doCanonico = new Map<string, Registro[]>()
  for (const [id, r] of vivos) {
    if (!existe(id)) continue
    const k = c(id)
    doCanonico.set(k, [...(doCanonico.get(k) ?? []), r])
  }
  const escritas = new Map<string, Escritas>()
  for (const k of canonicos) escritas.set(k, escritasDe(doCanonico.get(k) ?? [], estado))

  /** (alvo canônico, hlc) ou null (passo 3). */
  const aresta = (k: string, campo: 'mescladoEm' | 'parteDe', doPacote: ReadonlyMap<string, string>): readonly [string, string] | null => {
    const e = escritas.get(k)![campo]
    const alvo = e === null ? (doPacote.get(k) ?? null) : idEscrito(e)
    const hlc = e === null ? '' : e.hlc
    if (!alvo || !existe(alvo) || c(alvo) === k) return null
    return [c(alvo), hlc]
  }

  // 3–5
  const brutasDeMescla: Arestas = new Map()
  for (const k of canonicos) {
    const a = aresta(k, 'mescladoEm', pacote.mesclas)
    if (a) brutasDeMescla.set(k, a)
  }
  const mesclas = semCirculos(brutasDeMescla, 'mescla')
  const ids = porPonto(canonicos)
  const destino = new Map<string, string>()
  for (const k of ids) destino.set(k, fim(mesclas.arestas, k))

  // 6
  const brutasDeParte: Arestas = new Map()
  for (const k of canonicos) {
    if (destino.get(k) !== k) continue
    const a = aresta(k, 'parteDe', pacote.partes)
    if (a && destino.get(a[0]) !== k) brutasDeParte.set(k, [destino.get(a[0])!, a[1]])
  }
  const partes = semCirculos(brutasDeParte, 'parte')
  const todo = new Map<string, string>()
  for (const k of porPonto(partes.arestas.keys())) todo.set(k, partes.arestas.get(k)![0])
  const partesDiretas = new Map<string, string[]>()
  for (const [parte, t] of todo) partesDiretas.set(t, [...(partesDiretas.get(t) ?? []), parte])

  // 7
  const absorvidos = new Map<string, string[]>()
  for (const [k, d] of destino) if (d !== k) absorvidos.set(d, [...(absorvidos.get(d) ?? []), k])
  const grafias = new Map<string, GrafiaDoUsuario[]>()
  for (const [k, d] of destino) {
    if (d !== k) continue
    const lista = juntarGrafias([k, ...(absorvidos.get(k) ?? [])].map((x) => lerGrafias(escritas.get(x)!.grafias, escritas.get(x)!.variantes)))
    if (lista.length > 0) grafias.set(k, lista)
  }

  // 8
  const chaveDoPar = (a: string, b: string) => (cp(a, b) <= 0 ? `${a}\u0000${b}` : `${b}\u0000${a}`)
  const paresDiferentes = new Map<string, readonly [string, string]>()
  for (const [id, r] of vivos) {
    if (!existe(id)) continue
    for (const o of diferentesDe(r)) {
      if (!existe(o) || c(o) === c(id)) continue
      const [a, b] = [c(id), c(o)].sort(cp) as [string, string]
      paresDiferentes.set(chaveDoPar(a, b), [a, b])
    }
  }
  const diferentes = [...paresDiferentes.values()].sort((p, q) => cp(p[0], q[0]) || cp(p[1], q[1]))

  // 9
  const ancestrais = (k: string): Set<string> => {
    const saida = new Set<string>()
    for (let x = todo.get(k); x !== undefined; x = todo.get(x)) saida.add(x)
    return saida
  }
  const paresPendentes: ParSugerido[] = []
  for (const p of pacote.pares) {
    if (!(existe(p.a) && existe(p.b))) continue
    const a = destino.get(c(p.a))!
    const b = destino.get(c(p.b))!
    if (a === b || ancestrais(b).has(a) || ancestrais(a).has(b)) continue
    if (paresDiferentes.has(chaveDoPar(c(p.a), c(p.b))) || paresDiferentes.has(chaveDoPar(a, b))) continue
    paresPendentes.push({ ...p })
  }

  const destinoDe = (id: string) => destino.get(c(id)) ?? c(id)
  return {
    sitios: ids,
    existe,
    canonico: c,
    eDoUsuario: (id) => {
      const k = c(id)
      return eSitioSkc(k) || pacote.criados.has(k)
    },
    destino: destinoDe,
    absorvidos: (id) => [...(absorvidos.get(c(id)) ?? [])],
    todo: (id) => todo.get(c(id)) ?? null,
    caminho: (id) => [...ancestrais(c(id))].reverse(),
    partes: (id) => [...(partesDiretas.get(c(id)) ?? [])],
    descendentes: (id) => {
      const saida: string[] = []
      const descer = (k: string) => {
        for (const p of partesDiretas.get(k) ?? []) {
          saida.push(p)
          descer(p)
        }
      }
      descer(c(id))
      return saida
    },
    grafiasDoUsuario: (id) => [...(grafias.get(c(id)) ?? [])],
    diferentes,
    conflitos: [...mesclas.conflitos, ...partes.conflitos],
    paresPendentes,
  }
}

/** O formato do `relacoes()` do processamento, sobre todos os sítios que existem (passo 10). */
export function relacoesDe(r: Resolucao): Relacoes {
  const saida: Relacoes = { mesclas: {}, partes: {}, grafias: {}, diferentes: r.diferentes.map(([a, b]) => [a, b]) }
  for (const k of r.sitios) {
    const d = r.destino(k)
    if (d !== k) saida.mesclas[k] = d
    const t = r.todo(k)
    if (t !== null) saida.partes[k] = t
    const g = r.grafiasDoUsuario(k)
    if (g.length > 0) saida.grafias[k] = g.map((x) => ({ texto: x.texto, tradicao: x.tradicao ?? null, livro: x.livro ?? null }))
  }
  return saida
}

/** Por que não dá para mesclar `entra` em `fica` (null: dá). `mesclado`: um dos dois já foi mesclado (mescle no destino dele). */
export function podeMesclar(r: Resolucao, fica: string, entra: string): 'mesmo' | 'excluido' | 'mesclado' | null {
  if (!r.existe(fica) || !r.existe(entra)) return 'excluido'
  if (r.canonico(fica) === r.canonico(entra)) return 'mesmo'
  if (r.destino(fica) !== r.canonico(fica) || r.destino(entra) !== r.canonico(entra)) return 'mesclado'
  return null
}

/** Por que `parte` não pode ser parte de `todo` (null: pode). `descendente`: o todo é parte (em algum nível) da parte. */
export function podeSerParte(r: Resolucao, parte: string, todo: string): 'mesmo' | 'excluido' | 'mesclado' | 'descendente' | null {
  if (!r.existe(parte) || !r.existe(todo)) return 'excluido'
  if (r.canonico(parte) === r.canonico(todo)) return 'mesmo'
  if (r.destino(parte) !== r.canonico(parte) || r.destino(todo) !== r.canonico(todo)) return 'mesclado'
  if (r.caminho(todo).includes(r.canonico(parte))) return 'descendente'
  return null
}

/** Os conflitos que este aparelho deve ver: a escrita descartada é dele e a que venceu é de outro aparelho. */
export const conflitosDesteAparelho = (r: Resolucao, aparelho: string): Conflito[] =>
  r.conflitos.filter((x) => x.aparelho === aparelho && x.vencedor.aparelho !== aparelho)

// ---------------------------------------------------------------- as grafias como as telas as mostram (2C, bloco 2, Tarefa 13)

/**
 * Um livro de onde vem uma grafia: a sigla e a página (null: o livro não a diz, ou a grafia é sua e a pessoa deu só o livro).
 * `sitio`: numa grafia do livro, o sítio da árvore de que ela é (o da linha do pacote, ou o sítio do livro cujo nome ela é); é
 * no registro dele que a tradição dada a ela fica. Ausente: o livro que a pessoa deu.
 */
export interface LivroDaGrafia {
  sigla: string
  pagina: string | null
  sitio?: string
}

/** O grupo de uma grafia na página: a tradição; sem ela, «sem tradição» (veio de um livro) ou «sem origem» (é sua). */
export type GrupoDaGrafia = Tradicao | 'sem-tradicao' | 'sem-origem'

/** Uma grafia de um sítio, como «Outras grafias» a mostra (a página e «Corrigir»). */
export interface GrafiaVista {
  texto: string
  tradicao: Tradicao | null
  /** Do livro: os livros e as páginas de onde ela vem. Sua: o livro que você deu (sem página), se deu. */
  livros: LivroDaGrafia[]
  doUsuario: boolean
  grupo: GrupoDaGrafia
  /** O nome de agora de um sítio mesclado neste (o id dele): sai com o «desfazer» da mescla, nunca com o ×. */
  nomeDe?: string
}

/** A sigla do livro de um sítio do livro (`<SIGLA>-<n>`). */
const siglaDoSitio = (id: string): string => id.slice(0, id.lastIndexOf('-'))

/**
 * As grafias de um sítio (o destino `id`), em ordem: as dos livros (`origem='livro'` do pacote) do sítio e dos absorvidos; as da
 * pessoa (`grafiasDoUsuario`: as do destino e as dos absorvidos); os nomes dos absorvidos que ainda não estão aí. Sem repetir
 * pela `chaveDaGrafia` (a mesma grafia de dois livros vira uma, com os dois livros) e sem a que é o nome de agora (`nome(id)`).
 *
 * - A tradição de uma grafia do livro vem da grafia da pessoa com a mesma chave: primeiro a de um dos livros dela, depois a sem
 *   livro (as de antes), depois a de outro livro; esse outro livro entra na lista de livros dela (sem página).
 * - O nome de um absorvido do livro que a pessoa não corrigiu (`nomeDoLivro`; sem ele, todo sítio do livro) é uma grafia do
 *   livro: com o livro do sítio (sem página, se o pacote não a traz), sem «SKC». O de um sítio seu (ou corrigido) é seu, sem
 *   origem até receber uma. Toda grafia com a chave do nome de um absorvido leva `nomeDe`.
 * - A camada vence: as linhas `origem='usuario'` do pacote não são lidas (F12), e a tradição de uma linha do livro no pacote
 *   (a que o processamento copiou da camada, que pode estar atrasada) também não.
 */
export function grafiasDoSitio(
  r: Resolucao,
  id: string,
  pacote: PacoteDeSitios,
  nome: (id: string) => string,
  nomeDoLivro?: (id: string) => string | null,
): GrafiaVista[] {
  const k = r.canonico(id)
  const absorvidos = r.absorvidos(k)
  const atual = chaveDaGrafia(nome(k))
  const porChave = new Map<string, GrafiaVista>()
  const doLivro = new Map<string, GrafiaDoPacote[]>()
  for (const g of pacote.grafias) if (g.origem === 'livro') doLivro.set(g.sitio, [...(doLivro.get(g.sitio) ?? []), g])
  const juntarLivro = (v: GrafiaVista, l: LivroDaGrafia) => {
    if (!v.livros.some((x) => x.sigla === l.sigla && x.pagina === l.pagina)) v.livros.push(l)
  }
  for (const s of [k, ...absorvidos]) {
    for (const g of doLivro.get(s) ?? []) {
      const c = chaveDaGrafia(g.texto)
      if (c === atual || g.sigla === null) continue
      let v = porChave.get(c)
      if (!v) porChave.set(c, (v = { texto: g.texto, tradicao: null, livros: [], doUsuario: false, grupo: 'sem-tradicao' }))
      juntarLivro(v, { sigla: g.sigla, pagina: g.pagina, sitio: s })
    }
  }
  // os nomes dos absorvidos do livro (sem correção), antes das grafias da pessoa: a tradição que ela deu a eles vem com eles
  // um sítio seu publicado pelo processamento com um id de livro (`criados`: `SI-…` → `<SIGLA>-<n>`) continua seu (N3); o do
  // livro a que um `SI-…` só leva continua do livro: a mesma regra de «seu» das telas (`eDoUsuario`, M-1)
  const nomeEDoLivro = (x: string) => {
    if (r.eDoUsuario(x)) return false
    if (!nomeDoLivro) return true
    const n = nomeDoLivro(x)
    return n !== null && chaveDaGrafia(n) === chaveDaGrafia(nome(x))
  }
  const nomesDosAbsorvidos = new Map<string, string>() // chave → id
  for (const x of absorvidos) {
    const texto = nome(x)
    const c = chaveDaGrafia(texto)
    if (c === atual) continue
    if (!nomesDosAbsorvidos.has(c)) nomesDosAbsorvidos.set(c, x)
    if (!nomeEDoLivro(x)) continue
    const v = porChave.get(c)
    if (!v) porChave.set(c, { texto, tradicao: null, livros: [{ sigla: siglaDoSitio(x), pagina: null, sitio: x }], doUsuario: false, grupo: 'sem-tradicao' })
    // já é uma linha do livro: só falta o livro dele se nenhuma linha é desse sítio nem desse livro
    else if (!v.doUsuario && !v.livros.some((l) => l.sitio === x || l.sigla === siglaDoSitio(x))) v.livros.push({ sigla: siglaDoSitio(x), pagina: null, sitio: x })
  }
  // a tradição e os livros a mais das grafias do livro, pelas grafias da pessoa com a mesma chave
  const daPessoa = r.grafiasDoUsuario(k)
  for (const [c, v] of porChave) {
    const mesmas = daPessoa.filter((g) => chaveDaGrafia(g.texto) === c)
    const siglas = new Set(v.livros.map((l) => l.sigla))
    const comTradicao = (f: (g: GrafiaDoUsuario) => boolean) => mesmas.find((g) => g.tradicao && f(g))?.tradicao
    v.tradicao = comTradicao((g) => g.livro !== undefined && siglas.has(g.livro)) ?? comTradicao((g) => g.livro === undefined) ?? comTradicao(() => true) ?? null
    for (const g of mesmas) if (g.livro !== undefined && !v.livros.some((l) => l.sigla === g.livro)) v.livros.push({ sigla: g.livro, pagina: null })
  }
  for (const g of daPessoa) {
    const c = chaveDaGrafia(g.texto)
    if (c === atual || porChave.has(c)) continue
    porChave.set(c, { texto: g.texto, tradicao: g.tradicao ?? null, livros: g.livro ? [{ sigla: g.livro, pagina: null }] : [], doUsuario: true, grupo: 'sem-origem' })
  }
  for (const [c, x] of nomesDosAbsorvidos) {
    if (!porChave.has(c)) porChave.set(c, { texto: nome(x), tradicao: null, livros: [], doUsuario: true, grupo: 'sem-origem' })
  }
  return [...porChave].map(([c, v]) => {
    const vista: GrafiaVista = { ...v, grupo: v.tradicao ?? (v.doUsuario ? 'sem-origem' : 'sem-tradicao') }
    const de = nomesDosAbsorvidos.get(c)
    if (de !== undefined) vista.nomeDe = de
    return vista
  })
}

/**
 * As grafias da pessoa num sítio só (sem as dos absorvidos), pela regra da resolução (passo 2): entre os registros vivos que
 * respondem por ele (o dele e os `SI-…` publicados como ele), a escrita mais recente, com as `variantes` de antes. É a lista
 * de onde uma edição parte (e que ela grava inteira no registro do sítio), para nada escrito em outro registro do mesmo sítio
 * se perder.
 */
export function grafiasProprias(estado: Estado, pacote: PacoteDeSitios, id: string): GrafiaDoUsuario[] {
  const c = (x: string): string => pacote.publicados.get(x) ?? x
  const k = c(id)
  const registros = [...(estado.registros.get('sitio')?.values() ?? [])].filter((r) => !r.excluido && c(r.id) === k)
  const e = escritasDe(registros, estado)
  return lerGrafias(e.grafias, e.variantes)
}

/** As grafias da pessoa num sítio (`grafiasProprias`), pelo id dele. */
export interface GrafiasDeUmSitio {
  id: string
  grafias: readonly GrafiaDoUsuario[]
}

/** O que muda numa grafia em «Corrigir»: a tradição, o livro (só nas suas), ou tirá-la (só as suas). */
export type MudancaDaGrafia = { tradicao: Tradicao | null } | { livro: string | null } | { tirar: true }

/**
 * O que gravar para mudar uma grafia vista: os sítios cuja lista muda, cada um com a lista inteira (`corrigirGrafias`, uma
 * por sítio, na ordem de `listas`); [] se nada muda ou a mudança não vale (tirar uma grafia do livro, ou o nome de um
 * absorvido). `listas`: as `grafiasProprias` do destino (primeiro) e dos absorvidos nele. Cada coisa fica no registro do sítio
 * de que ela é, para «desfazer» uma mescla deixar os dois sítios como estavam:
 * - Do livro: na lista do sítio de que a linha é (`LivroDaGrafia.sitio`) sai toda grafia da pessoa com a mesma chave sem
 *   livro ou com um dos livros da linha, e, com uma tradição, entra `{texto, livro, tradicao}` de cada livro dela. Nas outras
 *   listas nada sai: toda entrada com a mesma chave (qualquer livro) fica, com a mesma tradição (ou sem nenhuma).
 * - Sua: a tradição ou o livro mudam na entrada mostrada (no sítio que a tem); tirar a tira de todas as listas.
 * - O nome de um absorvido (`nomeDe`): a tradição ou o livro mudam na entrada que já existe, senão entram na lista dele; tirar
 *   só tira as entradas das outras listas (o nome fica, até o «desfazer» da mescla).
 */
export function gravacaoDaGrafia(listas: readonly GrafiasDeUmSitio[], v: GrafiaVista, m: MudancaDaGrafia): GrafiasDeUmSitio[] {
  const destino = listas[0]
  if (!destino) return []
  const k = chaveDaGrafia(v.texto)
  const mesma = (g: GrafiaDoUsuario) => chaveDaGrafia(g.texto) === k
  const novas = new Map<string, GrafiaDoUsuario[]>(listas.map((l) => [l.id, [...l.grafias]]))
  const mudancas = (): GrafiasDeUmSitio[] =>
    listas.flatMap((l) => {
      const grafias = normalizarGrafias(novas.get(l.id)!)
      return JSON.stringify(grafias) === JSON.stringify(normalizarGrafias(l.grafias)) ? [] : [{ id: l.id, grafias }]
    })
  const comTradicao = (g: GrafiaDoUsuario, t: Tradicao | null): GrafiaDoUsuario => {
    const nova = { ...g }
    if (t === null) delete nova.tradicao
    else nova.tradicao = t
    return nova
  }

  if (!v.doUsuario) {
    if (!('tradicao' in m)) return []
    const t = m.tradicao
    const daLinha = v.livros.filter((l) => l.sitio !== undefined)
    const siglas = new Set(daLinha.map((l) => l.sigla))
    const donos = new Set(daLinha.map((l) => (novas.has(l.sitio!) ? l.sitio! : destino.id)))
    // sai, só na lista do sítio dono da linha: as sem livro e as com um livro da linha (a entrada com o livro as substitui).
    // Nas outras listas nada sai (são grafias daquele sítio, que voltam com o «desfazer»): toda entrada com a mesma chave só
    // recebe a tradição, ou a perde (N1, R1)
    const lugar = new Map<string, number>()
    for (const [id, lista] of novas) {
      const sai = (g: GrafiaDoUsuario) => donos.has(id) && mesma(g) && (g.livro === undefined || siglas.has(g.livro))
      const i = lista.findIndex(sai)
      if (i >= 0) lugar.set(id, i)
      novas.set(
        id,
        lista.filter((g) => !sai(g)).map((g) => (mesma(g) ? comTradicao(g, t) : g)),
      )
    }
    if (t !== null) {
      // uma entrada por (sítio, sigla), no lugar da que havia nesse sítio, senão no fim
      const porSitio = new Map<string, GrafiaDoUsuario[]>()
      for (const l of daLinha) {
        const sitio = novas.has(l.sitio!) ? l.sitio! : destino.id // (sempre em `donos`)
        const entradas = porSitio.get(sitio) ?? []
        if (!entradas.some((g) => g.livro === l.sigla)) entradas.push({ texto: v.texto, livro: l.sigla, tradicao: t })
        porSitio.set(sitio, entradas)
      }
      for (const [sitio, entradas] of porSitio) {
        const lista = novas.get(sitio)!
        const i = Math.min(lugar.get(sitio) ?? lista.length, lista.length)
        lista.splice(i, 0, ...entradas)
      }
    }
    return mudancas()
  }

  if ('tirar' in m) {
    // o nome de um absorvido fica na lista dele (sai com o «desfazer» da mescla); as entradas com a mesma chave nas outras
    // listas (uma grafia sua do destino igual a esse nome, N2) saem; sem nenhuma, nada a tirar (e a tela não mostra o ×)
    for (const [id, lista] of novas) if (id !== v.nomeDe) novas.set(id, lista.filter((g) => !mesma(g)))
    return mudancas()
  }
  const mudar = (g: GrafiaDoUsuario): GrafiaDoUsuario => {
    if ('tradicao' in m) return comTradicao(g, m.tradicao)
    const nova = { ...g }
    if (m.livro === null) delete nova.livro
    else nova.livro = m.livro
    return nova
  }
  // a entrada com o texto e o livro mostrados; senão (o livro mudou numa gravação ainda não mostrada) a primeira com o texto
  const livro = v.livros[0]?.sigla
  const mesmoLivro = (g: GrafiaDoUsuario) => mesma(g) && g.livro === livro
  const esta = listas.some((l) => l.grafias.some(mesmoLivro)) ? mesmoLivro : mesma
  // a lista que já tem a entrada (o destino primeiro, como a vista a lê); só sem nenhuma, a do absorvido cujo nome ela é (N2)
  const doNome = v.nomeDe !== undefined ? listas.find((l) => l.id === v.nomeDe) : undefined
  const dono = listas.find((l) => l.grafias.some(esta)) ?? doNome
  if (!dono) return []
  const lista = novas.get(dono.id)!
  const i = lista.findIndex(esta)
  if (i >= 0) lista[i] = mudar(lista[i]!)
  else lista.push(mudar({ texto: v.texto, ...(livro ? { livro } : {}), ...(v.tradicao ? { tradicao: v.tradicao } : {}) }))
  return mudancas()
}
