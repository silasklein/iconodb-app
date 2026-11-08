/**
 * Os pares de sítios que podem ser o mesmo lugar, na Revisão (Parte 2C, bloco 2, Tarefa 15; telas aprovadas §6): os pares que o
 * processamento sugere (`sitio_par_sugerido`) e que a pessoa resolve com «Mesclar…», «São lugares diferentes» ou «Um é parte do
 * outro…». Pura sobre a `Resolucao` (e o `Estado`, para o que um «Desfazer» grava de volta), menos `desfazerPar`, que grava.
 *
 * - Abertos: os `paresPendentes` da resolução (somam no total da Revisão, do Menu e do ponto da barra: `EntradaDaFila.paresAbertos`).
 * - Resolvidos: os outros pares do pacote cujos dois sítios existem; «mesclados» (o mesmo destino), «parte» (um acima do outro,
 *   em qualquer nível) ou «diferentes» (o que sobra: o par está em `diferentes`). Um par com um sítio que não existe (um sítio
 *   seu excluído) não aparece em nenhuma das duas listas.
 * - Os dois lados são o DESTINO de cada id (decisão do controlador), e o sugerido para ficar (`sugestaoDeQualFica`: o do livro
 *   antes do seu; entre dois do mesmo tipo, o de número menor) vem primeiro: nos lados, no motivo, nos nomes e na escolha
 *   «Qual é a parte?» (marcada a que faz dele o todo).
 * - F14: o «Desfazer» de «Um é parte do outro» grava de volta o `parteDe` que a parte tinha antes (o histórico do campo; sem
 *   histórico, o do pacote; sem nada, null), como o «Desfazer» de «Não é parte de outro» na página do sítio. Nunca `null` às
 *   cegas: a parte que já era parte de um terceiro sítio volta a ser.
 */
import { origensDe, type Redirecionamentos } from '../pacote/redirecionamentos'
import { eSitioSkc } from '../sitios/modelo'
import { desfazerDiferentes, desfazerMescla, marcarComoParte, soltarParte } from '../sitios/operacoes'
import { compararPorPontoDeCodigo as cp } from '../usuario/eventos'
import { campoEscrito, resolverSitios, type PacoteDeSitios, type ParSugerido, type Resolucao } from '../sitios/resolucao'
import { sugestaoDeQualFica } from '../sitios/textos'
import { estadoAtual } from '../usuario/estado'
import type { Estado } from '../usuario/fusao'

export type ComoFoiResolvido = 'mesclados' | 'parte' | 'diferentes'

export interface ParResolvido {
  par: ParSugerido
  como: ComoFoiResolvido
}

export const ROTULO_DOS_PARES = 'Sítios que podem ser o mesmo'
export const APOIO_DOS_PARES = 'pares de sítios com a mesma coordenada ou nome parecido'
/** O id do grupo (o mesmo formato de `idDoGrupo`), para o endereço (`?abrir=`). */
export const ID_DOS_PARES = 'sitios-que-podem-ser-o-mesmo'
export const O_QUE_DO_PAR = 'Estes dois podem ser o mesmo lugar'

/** A linha de um resolvido, sob os nomes. «mesclados» e «um é parte do outro»: textos propostos (Tarefa 17). */
export const TEXTO_DO_RESOLVIDO: Record<ComoFoiResolvido, string> = {
  diferentes: 'lugares diferentes',
  mesclados: 'mesclados',
  parte: 'um é parte do outro',
}

/** A chave de um par na página (o `data-chave` da linha e o id em `?abrir=`). */
export const chaveDoPar = (p: Pick<ParSugerido, 'a' | 'b'>): string => `par_${p.a}_${p.b}`

export function paresDaRevisao(r: Resolucao, pacote: PacoteDeSitios): { abertos: ParSugerido[]; resolvidos: ParResolvido[] } {
  const abertos = [...r.paresPendentes]
  const pendentes = new Set(abertos.map(chaveDoPar))
  const resolvidos: ParResolvido[] = []
  for (const p of pacote.pares) {
    if (pendentes.has(chaveDoPar(p)) || !r.existe(p.a) || !r.existe(p.b)) continue
    const a = r.destino(p.a)
    const b = r.destino(p.b)
    const como: ComoFoiResolvido = a === b ? 'mesclados' : r.caminho(a).includes(b) || r.caminho(b).includes(a) ? 'parte' : 'diferentes'
    resolvidos.push({ par: { ...p }, como })
  }
  return { abertos, resolvidos }
}

/** O hlc do `criar` de um sítio seu ('' para os do livro): o desempate de `sugestaoDeQualFica` entre dois sítios seus. */
export type CriadoEm = (id: string) => string

/**
 * Dois sítios, o sugerido para ficar primeiro (`sugestaoDeQualFica`). `eDoUsuario`: o da resolução (M-1: um sítio seu publicado,
 * com id de livro, continua seu).
 */
export function ladosEmOrdem(a: string, b: string, criadoEm: CriadoEm, eDoUsuario: (id: string) => boolean): { fica: string; outro: string } {
  const lado = (x: string) => ({ id: x, doLivro: !eDoUsuario(x), criadoEm: criadoEm(x) })
  const { fica } = sugestaoDeQualFica(lado(a), lado(b))
  return { fica, outro: fica === a ? b : a }
}

/** Os dois lados do par (o destino de cada id), o sugerido para ficar primeiro. */
export const ladosDoPar = (r: Resolucao, p: ParSugerido, criadoEm: CriadoEm): { fica: string; outro: string } => ladosEmOrdem(r.destino(p.a), r.destino(p.b), criadoEm, r.eDoUsuario)

/**
 * O motivo do par: aberto, com os nomes («Nome parecido: A ~ B»); fechado, curto (os nomes vêm na linha de baixo).
 * Textos propostos: «O livro dá B como variante de A» e, fechado, «Variante no livro».
 * `outroESeu` (M-4): o outro é um sítio seu e o que fica, do livro (`ladosEmOrdem` põe o do livro primeiro). Um par «variante»
 * assim vem de um nome que você deu a um sítio seu e que um livro imprime: a grafia é sua, não do livro. Texto proposto:
 * «A, do livro, é uma grafia que você deu a B».
 */
export function motivoDoPar(motivo: ParSugerido['motivo'], fica: string, outro: string, aberto: boolean, outroESeu = false): string {
  if (motivo === 'coordenada') return 'Mesma coordenada'
  if (motivo === 'nome') return aberto ? `Nome parecido: ${fica} ~ ${outro}` : 'Nome parecido'
  if (!aberto) return 'Variante no livro'
  return outroESeu ? `${fica}, do livro, é uma grafia que você deu a ${outro}` : `O livro dá ${outro} como variante de ${fica}`
}

/** Num par resolvido como «parte»: qual é a parte (o de baixo, em qualquer nível) e qual é o todo. */
export function parteDoPar(r: Resolucao, p: ParSugerido): { parte: string; todo: string } {
  const a = r.destino(p.a)
  const b = r.destino(p.b)
  return r.caminho(a).includes(b) ? { parte: a, todo: b } : { parte: b, todo: a }
}

/**
 * O hlc da escrita de `campo` que vale para o sítio `k` (o maior entre os registros vivos que respondem por ele: o dele e os
 * `SI-…` publicados como ele); '' se só o pacote a dá (ou ninguém).
 */
function hlcEscrito(estado: Estado, r: Resolucao, k: string, campo: 'mescladoEm' | 'parteDe'): string {
  let maior = ''
  for (const reg of estado.registros.get('sitio')?.values() ?? []) {
    if (reg.excluido || !(campo in reg.campos) || r.canonico(reg.id) !== k) continue
    const h = estado.hlcDoCampo('sitio', reg.id, campo) ?? ''
    if (h > maior) maior = h
  }
  return maior
}

/** Uma ligação do caminho que junta os dois sítios de um par: a mescla ou o `parteDe` escrito no sítio `k`. */
export interface Ligacao {
  k: string
  tipo: 'mescla' | 'parte'
}

/**
 * As mescla escritas de `x` até o destino dele, que valem (revisão 2, N4): para num sítio que é o próprio destino (uma mescla
 * descartada num conflito de círculo, ou que aponta para um sítio que não existe, não vale e não entra).
 */
function mesclasAteODestino(estado: Estado, pacote: PacoteDeSitios, r: Resolucao, x: string): string[] {
  const nos = [x]
  for (let k = x; r.destino(k) !== k; ) {
    const prox = campoEscrito(estado, pacote, k, 'mescladoEm')
    if (prox === null || !r.existe(prox)) break
    k = r.canonico(prox)
    if (nos.includes(k)) break
    nos.push(k)
  }
  return nos
}

/** Entre as ligações, a escrita mais recente (o hlc do campo de cada uma); empate: a primeira da lista. */
function ligacaoMaisRecente(estado: Estado, r: Resolucao, ligacoes: readonly Ligacao[]): (Ligacao & { hlc: string }) | null {
  let melhor: (Ligacao & { hlc: string }) | null = null
  for (const l of ligacoes) {
    const hlc = hlcEscrito(estado, r, l.k, l.tipo === 'mescla' ? 'mescladoEm' : 'parteDe')
    if (melhor === null || hlc > melhor.hlc) melhor = { ...l, hlc }
  }
  return melhor
}

/**
 * Num par resolvido como «parte»: a ligação que juntou o par (revisão 1, M1; revisão 2, N3), a desfazer. O caminho vai do id
 * de baixo ao de cima: as mesclas do id de baixo até o destino dele, cada `parteDe` subindo até o destino do outro (com as
 * mesclas do sítio escrito até o destino dele), e as mesclas do id de cima até o destino dele. Vale a ligação escrita por
 * último, de qualquer tipo; empate (todas do pacote), o `parteDe` de baixo.
 */
export function ligacaoDaParte(estado: Estado, pacote: PacoteDeSitios, r: Resolucao, p: ParSugerido): Ligacao {
  const { parte, todo } = parteDoPar(r, p)
  const ca = r.canonico(p.a)
  const cb = r.canonico(p.b)
  const [baixo, cima] = r.destino(ca) === parte ? [ca, cb] : [cb, ca]
  const mesclas = (x: string): Ligacao[] => mesclasAteODestino(estado, pacote, r, x).slice(0, -1).map((k) => ({ k, tipo: 'mescla' }))
  const subindo: Ligacao[] = []
  const vistos = new Set<string>()
  for (let k = parte; k !== todo && !vistos.has(k); ) {
    vistos.add(k)
    const t = r.todo(k)
    if (t === null) break
    subindo.push({ k, tipo: 'parte' })
    const escrito = campoEscrito(estado, pacote, k, 'parteDe')
    if (escrito !== null && r.existe(escrito)) subindo.push(...mesclas(r.canonico(escrito)))
    k = t
  }
  const melhor = ligacaoMaisRecente(estado, r, [...subindo, ...mesclas(baixo), ...mesclas(cima)])
  return melhor ? { k: melhor.k, tipo: melhor.tipo } : { k: parte, tipo: 'parte' }
}

/**
 * F14: o `parteDe` que a parte tinha antes da escrita de agora (revisão 1, M2: o histórico juntado, como a resolução o lê): a
 * mais recente entre a escrita anterior do campo no registro dela e as escritas de agora nos outros registros que respondem
 * por ela (os `SI-…` publicados como ela; empate: o de maior id); sem nenhuma, o do pacote; sem nada, null.
 */
export function parteDeAntes(estado: Estado, pacote: PacoteDeSitios, parte: string): string | null {
  const c = (x: string): string => pacote.publicados.get(x) ?? x
  const k = c(parte)
  const candidatos: { valor: unknown; hlc: string; id: string }[] = []
  const anterior = estado.historico(parte, 'parteDe', 'sitio').at(-1)
  if (anterior) candidatos.push({ valor: anterior.valor, hlc: anterior.hlc, id: parte })
  for (const reg of estado.registros.get('sitio')?.values() ?? []) {
    if (reg.id === parte || reg.excluido || !('parteDe' in reg.campos) || c(reg.id) !== k) continue
    candidatos.push({ valor: reg.campos.parteDe, hlc: estado.hlcDoCampo('sitio', reg.id, 'parteDe') ?? '', id: reg.id })
  }
  if (candidatos.length === 0) return pacote.partes.get(k) ?? null
  const vale = candidatos.reduce((x, y) => (y.hlc > x.hlc || (y.hlc === x.hlc && cp(y.id, x.id) > 0) ? y : x))
  return typeof vale.valor === 'string' && vale.valor !== '' ? vale.valor : null
}

/**
 * Num par resolvido como «mesclados»: o sítio cuja mescla desfazer para separar os dois (revisão 1, I2). As cadeias de mesclas
 * escritas de cada um se encontram num sítio; entre as mesclas do caminho até lá, a escrita por último (a que juntou o par).
 * Empate (só o pacote os juntou): a do que não seria o sugerido para ficar, se está no caminho.
 */
export function absorvidoDoPar(estado: Estado, pacote: PacoteDeSitios, r: Resolucao, p: ParSugerido, criadoEm: CriadoEm): string {
  const a = r.canonico(p.a)
  const b = r.canonico(p.b)
  const deA = mesclasAteODestino(estado, pacote, r, a)
  const deB = mesclasAteODestino(estado, pacote, r, b)
  const encontro = deB.find((x) => deA.includes(x))
  const outro = ladosEmOrdem(a, b, criadoEm, r.eDoUsuario).outro
  if (encontro === undefined) return outro
  const origens = [...deA.slice(0, deA.indexOf(encontro)), ...deB.slice(0, deB.indexOf(encontro))]
  const melhor = ligacaoMaisRecente(
    estado,
    r,
    origens.map((k) => ({ k, tipo: 'mescla' as const })),
  )
  if (!melhor) return outro
  return melhor.hlc === '' && origens.includes(outro) ? outro : melhor.k
}

/**
 * Desfaz «São lugares diferentes» de um par: tira só a cópia dos ids do par (`a`, `b`, os canônicos: o registro de cada um e os
 * `SI-…` publicados como ele), a única que a Revisão grava (revisão 2, N1 + N2). Revisão 3, N5: nunca uma cópia no registro de
 * um destino deles; ela é a resposta a outro par (que, respondido, já pode ter saído do pacote). Sobre o estado de agora.
 */
export function desfazerDiferentesDoPar(par: ParSugerido, pacote: PacoteDeSitios): Promise<void> {
  const estado = estadoAtual()
  const r = resolverSitios(estado, pacote)
  return desfazerDiferentes(r.canonico(par.a), r.canonico(par.b), estado, r.canonico)
}

export interface ContextoDoDesfazer {
  estado: Estado
  pacote: PacoteDeSitios
  resolucao: Resolucao
  redirecionados: Redirecionamentos | null
  criadoEm: CriadoEm
}

/**
 * «Desfazer» de um par resolvido (a linha de «Resolvidos por você»): devolve o par aos abertos. «diferentes»:
 * `desfazerDiferentesDoPar` (a cópia nos ids do par); «parte» e «mesclados»: a ligação que juntou o par, a escrita por último
 * no caminho entre os dois — um `parteDe` volta ao de antes (F14), uma mescla é desfeita com `desfazerMescla` (com os `SI-…`
 * publicados como ele que também a escreveram).
 */
export async function desfazerPar(par: ParSugerido, como: ComoFoiResolvido, ctx: ContextoDoDesfazer): Promise<void> {
  const { estado, pacote, resolucao: r } = ctx
  if (como === 'diferentes') return desfazerDiferentesDoPar(par, pacote)
  // «parte»: a ligação que juntou o par (M1, N3), de qualquer tipo; um `parteDe` volta ao de antes (F14, M2)
  const lig: Ligacao = como === 'parte' ? ligacaoDaParte(estado, pacote, r, par) : { k: absorvidoDoPar(estado, pacote, r, par, ctx.criadoEm), tipo: 'mescla' }
  if (lig.tipo === 'parte') {
    const antes = parteDeAntes(estado, pacote, lig.k)
    await (antes === null ? soltarParte(lig.k) : marcarComoParte(lig.k, antes))
    return
  }
  const x = lig.k
  await desfazerMescla(x, eSitioSkc(x) ? [] : origensDe(ctx.redirecionados, x))
}
