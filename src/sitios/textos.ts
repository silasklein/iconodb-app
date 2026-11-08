/**
 * Os textos de mesclar, desfazer e do aviso de conflito (Parte 2C, bloco 2; telas aprovadas §1, §2 e §7), e o que eles contam:
 * o que vai junto numa mescla ou volta num desfazer (`conteudoDoSitio`) e qual dos dois sítios a caixa sugere que fique
 * (`sugestaoDeQualFica`). PURO: sem React, sem IndexedDB; quem chama dá as contagens de cada sítio (`FontesDoConteudo`).
 *
 * Os textos só citam o que existe (nunca «0 notas»): «o objeto», «os 3 objetos»; um item só, no singular, «passa a contar».
 */
import { compararPorPontoDeCodigo as cp } from '../usuario/eventos'
import { contagemDoSitio } from './contagem'
import type { Conflito, Resolucao } from './resolucao'

/** O que vai junto numa mescla, ou volta num desfazer. */
export interface Contagens {
  /** Os objetos do sítio (e dos que estão mesclados nele). */
  objetos: number
  /** As notas vivas com alvo nele (e nos que estão mesclados nele). */
  notas: number
  /** As partes diretas. */
  partes: number
  /** Quantos campos (nome, região, coordenada, nota) a pessoa corrigiu no registro de um sítio dos livros. */
  correcoes: number
  /** As outras grafias (dos livros e da pessoa), sem o nome. */
  grafias: number
}

/** O que se sabe de cada sítio, um por um (sem somar os mesclados nele: `conteudoDoSitio` soma). */
export interface FontesDoConteudo {
  objetosDe(id: string): number
  notasDe(id: string): number
  correcoesDe(id: string): number
  /** Os textos das outras grafias, sem o nome e sem repetir. */
  grafiasDe(id: string): readonly string[]
  /** O `mescladoEm` que vale para o sítio (o escrito pela pessoa, ou o do pacote), sem resolver; null se nenhum. */
  mescladoEmEscrito(id: string): string | null
  /** O `parteDe` que vale para o sítio (o escrito pela pessoa, ou o do pacote), sem resolver; null se nenhum. */
  parteDeEscrito(id: string): string | null
}

/**
 * Os ids que vão junto com `id`: num destino, ele e todos os mesclados nele; num absorvido (o desfazer), ele e os que entraram
 * nele (diretos e indiretos, pelo `mescladoEm` de cada um), que saem com ele.
 */
function grupoDoSitio(r: Resolucao, id: string, f: FontesDoConteudo): string[] {
  const k = r.canonico(id)
  const d = r.destino(k)
  if (d === k) return [k, ...r.absorvidos(k)]
  const passaPor = (x: string): boolean => {
    const vistos = new Set<string>()
    let y: string | null = x
    while (y !== null && y !== d && !vistos.has(y)) {
      if (y === k) return true
      vistos.add(y)
      const alvo = f.mescladoEmEscrito(y)
      y = alvo === null ? null : r.canonico(alvo)
    }
    return false
  }
  return [k, ...r.absorvidos(d).filter((x) => x !== k && passaPor(x))]
}

/** O que vai junto com `id` numa mescla (ele é o que entra), ou volta com ele num desfazer (ele é um absorvido). */
export function conteudoDoSitio(r: Resolucao, id: string, f: FontesDoConteudo): Contagens {
  const k = r.canonico(id)
  const d = r.destino(k)
  const grupo = grupoDoSitio(r, k, f)
  const objetos = d === k ? contagemDoSitio(r, k, f.objetosDe).proprios : grupo.reduce((n, x) => n + f.objetosDe(x), 0)
  const notas = grupo.reduce((n, x) => n + f.notasDe(x), 0)
  // Num absorvido, as partes que apontam para ele (ou para um do grupo dele): estão no destino e voltam com ele.
  const doGrupo = new Set(grupo)
  const partes =
    d === k ? r.partes(k).length : r.partes(d).filter((p) => f.parteDeEscrito(p) !== null && doGrupo.has(r.canonico(f.parteDeEscrito(p)!))).length
  return { objetos, notas, partes, correcoes: f.correcoesDe(k), grafias: f.grafiasDe(k).length }
}

/** Um dos dois sítios de uma mescla. `criadoEm`: o hlc do `criar` de um sítio seu. */
export interface LadoDaMescla {
  id: string
  /** `!Resolucao.eDoUsuario(id)`, não pela forma do id: um sítio seu publicado (`SI-…` → `<SIGLA>-<n>`) é seu (M-1). */
  doLivro: boolean
  criadoEm?: string
}

const numeroDoSitio = (id: string): number => {
  const m = /-(\d+)$/.exec(id)
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER
}

/**
 * Qual fica: o dos livros antes do seu (`livro`); entre dois dos livros, o de número menor; entre dois seus, o criado primeiro
 * (empate: o id). Os dois últimos são «o de número menor, que entrou primeiro» (`menor`).
 */
export function sugestaoDeQualFica(a: LadoDaMescla, b: LadoDaMescla): { fica: string; motivo: 'livro' | 'menor' } {
  if (a.doLivro !== b.doLivro) return { fica: a.doLivro ? a.id : b.id, motivo: 'livro' }
  let primeiro: LadoDaMescla
  if (a.doLivro) primeiro = numeroDoSitio(a.id) - numeroDoSitio(b.id) < 0 || (numeroDoSitio(a.id) === numeroDoSitio(b.id) && cp(a.id, b.id) <= 0) ? a : b
  else {
    const ca = a.criadoEm ?? ''
    const cb = b.criadoEm ?? ''
    primeiro = ca < cb || (ca === cb && cp(a.id, b.id) <= 0) ? a : b
  }
  return { fica: primeiro.id, motivo: 'menor' }
}

/** «A», «A e B», «A, B e C». */
const comE = (itens: readonly string[]): string => (itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)!}`)
const aspas = (s: string) => `«${s}»`

/** «o objeto» / «os 3 objetos» (e os outros), e se o item é plural. */
function itens(c: Contagens, ordem: readonly (keyof Contagens)[]): { texto: string; plural: boolean }[] {
  const FORMAS: Record<keyof Contagens, [um: string, varios: (n: number) => string]> = {
    objetos: ['o objeto', (n) => `os ${n} objetos`],
    notas: ['a nota', (n) => `as ${n} notas`],
    partes: ['a parte', (n) => `as ${n} partes`],
    correcoes: ['a correção', (n) => `as ${n} correções`],
    grafias: ['a grafia', (n) => `as ${n} grafias`],
  }
  return ordem.filter((k) => c[k] > 0).map((k) => (c[k] === 1 ? { texto: FORMAS[k][0], plural: false } : { texto: FORMAS[k][1](c[k]), plural: true }))
}

/**
 * As linhas da lista da caixa «Qual fica?» (telas aprovadas §1): os nomes que viram grafias, o que passa a contar no que fica e
 * de qual dos dois é a coordenada que vale (`null`: nenhum tem). `nomes`: o nome do que entra e as outras grafias dele.
 * Cada linha termina em «;», a última em «.».
 */
export function textoDaMescla(fica: string, entra: string, nomes: readonly string[], c: Contagens, coordenada: 'fica' | 'entra' | null): string[] {
  const linhas: string[] = []
  const [nome, ...grafias] = nomes
  if (nome !== undefined) {
    if (grafias.length === 0) linhas.push(`o nome ${aspas(nome)} passa a ser grafia de ${fica}`)
    else linhas.push(`o nome ${aspas(nome)} e ${grafias.length === 1 ? 'a grafia' : 'as grafias'} ${comE(grafias.map(aspas))} passam a ser grafias de ${fica}`)
  }
  const contam = itens(c, ['objetos', 'notas', 'partes', 'correcoes'])
  if (contam.length > 0) {
    const plural = contam.length > 1 || contam[0]!.plural
    linhas.push(`${comE(contam.map((i) => i.texto))} de ${entra} ${plural ? 'passam' : 'passa'} a contar em ${fica}`)
  }
  if (coordenada !== null) linhas.push(`a coordenada que vale é a de ${coordenada === 'fica' ? fica : entra}`)
  return linhas.map((l, i) => `${l}${i === linhas.length - 1 ? '.' : ';'}`)
}

/** A confirmação de «desfazer» na linha «Mesclado aqui» (telas aprovadas §2). */
export function textoDoDesfazer(entra: string, fica: string, c: Contagens): string {
  const volta = ['o nome', ...itens(c, ['grafias', 'objetos', 'notas', 'partes', 'correcoes']).map((i) => i.texto)]
  return `Desfazer a mesclagem de ${entra}? Ele volta a ser um sítio à parte, com ${comE(volta)} que tinha. ${fica} fica como estava antes dele.`
}

/**
 * O aviso de conflito na página do sítio (telas aprovadas §7): a decisão deste aparelho que ficou de fora e a do outro, que
 * venceu por ser mais recente. A de partes é texto proposto.
 */
export function textoDoConflito(cf: Conflito, nome: (id: string) => string): string {
  const v = cf.vencedor
  if (cf.tipo === 'mescla') {
    return `Neste aparelho você mesclou ${nome(cf.registro)} em ${nome(cf.valor)}, mas outro aparelho mesclou ${nome(v.registro)} em ${nome(v.valor)} depois; ficou a mais recente.`
  }
  return `Neste aparelho você marcou ${nome(cf.registro)} como parte de ${nome(cf.valor)}, mas outro aparelho marcou ${nome(v.registro)} como parte de ${nome(v.valor)} depois; ficou a mais recente.`
}
