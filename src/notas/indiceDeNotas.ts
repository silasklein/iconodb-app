/**
 * As notas lidas do estado fundido, e o índice delas: Minhas notas (lista por data) e os links reversos (um verbete,
 * objeto, obra, sítio ou grupo mostra as notas feitas nele e as que o citam com `[[…]]`).
 *
 * Custo: cada nota é lida UMA vez (cache por `Registro`, que a fusão reaproveita enquanto a nota não muda) e o índice
 * inteiro é refeito só quando o conjunto de notas muda (cache pelo mapa de notas do estado, que a fusão também
 * reaproveita quando os eventos são de outros tipos). Perguntar "que notas ligam a este alvo?" é uma busca num mapa,
 * nunca uma varredura das notas, e pode ser feita a cada desenho da tela.
 *
 * Campos da nota nos eventos: `texto`, `alvoTipo` ('objeto' | 'verbete' | 'obra' | 'sitio' | 'grupo' | 'colecao-item'), `alvo` (o id; para
 * um objeto, o número; para 'colecao-item', `CO-…/CA00001`, ver colecoes/notas.ts), `rascunho` (verdadeiro até "Salvar nota") e `ancoras` ([{p, sha}], ver ancora.ts). Os links
 * ficam no próprio texto, como `[[ref|rótulo]]`. Tudo o que vem de um evento é tratado como possivelmente malformado.
 *
 * Citações reconhecidas (decisão 40, citacoes.ts): "TESTE I: 1-3, 5" liga a nota à chave de fonte de CADA número coberto
 * (`ligadasA('fonte', 'TESTE I:2')`), e um número do sistema escrito solto ("CA00046") vale como `[[CA00046]]`. O índice
 * não sabe que objeto cada fonte é (isso é do pacote): quem mostra as notas de um objeto pergunta pelo número E pelas
 * fontes dele, com `ligadasAQualquer` (veja useFontesDoObjeto.ts). O índice aceita qualquer sigla bem formada: a citação
 * de um volume que ainda não chegou liga assim que ele chegar.
 */
import type { Estado, Registro } from '../usuario/estado'
import type { Hlc } from '../usuario/hlc'
import { validarAncoras, type Ancora } from './ancora'
import { citacoesDoTexto } from './citacoes'
import { chaveDoAlvo, idCanonico, referenciasDe, type TipoDeRef } from './links'

export const TIPOS_DE_ALVO = ['objeto', 'verbete', 'obra', 'sitio', 'grupo', 'colecao-item'] as const
export type TipoDeAlvo = (typeof TIPOS_DE_ALVO)[number]

export const ehTipoDeAlvo = (x: unknown): x is TipoDeAlvo => typeof x === 'string' && (TIPOS_DE_ALVO as readonly string[]).includes(x)

interface Leitura {
  id: string
  texto: string
  alvoTipo: TipoDeAlvo | null
  alvo: string | null
  rascunho: boolean
  ancoras: Ancora[]
  ligacoes: { tipo: TipoDeRef; ref: string }[]
  /** O que o texto cita fora dos `[[…]]` (decisão 40): as chaves das fontes e os números do sistema. */
  citacoes: { fontes: string[]; objetos: string[] }
  criadaEm: Hlc
  alteradaEm: Hlc
  excluida: boolean
  registro: Registro
}

export interface NotaVista extends Leitura {
  /** O número da nota entre as notas do mesmo alvo, pela criação ("[1]", "[2]"). Estável: contas as excluídas também. */
  ordinal: number
}

export interface Ligada {
  nota: NotaVista
  /** A nota é do próprio alvo (e não só o cita no texto). */
  direta: boolean
}

export interface IndiceDeNotas {
  /** As notas que existem (sem as excluídas), a mais recente primeiro. */
  todas: readonly NotaVista[]
  /** Todas as notas pelo id, as excluídas também. */
  porId: ReadonlyMap<string, NotaVista>
  /** As notas do alvo ou que o citam, da mais antiga à mais nova. Sem as excluídas. */
  ligadasA(tipo: string, ref: string): readonly Ligada[]
  /** As ligadas a qualquer um destes alvos (o objeto e as fontes dele), cada nota uma vez (a direta vence), da mais antiga à mais nova. */
  ligadasAQualquer(alvos: readonly { tipo: string; ref: string }[]): readonly Ligada[]
  /** Quantas notas o alvo já teve, as excluídas também: a próxima nota dele é a de número `quantas + 1`. */
  quantasDoAlvo(tipo: string, ref: string): number
}

const lidas = new WeakMap<Registro, Leitura>()

function ler(r: Registro): Leitura {
  const guardada = lidas.get(r)
  if (guardada) return guardada
  const c = r.campos
  const texto = typeof c.texto === 'string' ? c.texto : ''
  const alvoTipo = ehTipoDeAlvo(c.alvoTipo) ? c.alvoTipo : null
  const alvo = alvoTipo && typeof c.alvo === 'string' && c.alvo.trim() !== '' ? idCanonico(alvoTipo, c.alvo) : null
  const lida: Leitura = {
    id: r.id,
    texto,
    alvoTipo: alvo ? alvoTipo : null,
    alvo,
    rascunho: c.rascunho === true,
    ancoras: validarAncoras(c.ancoras),
    ligacoes: referenciasDe(texto),
    citacoes: citacoesDoTexto(texto),
    criadaEm: r.criadoEm,
    alteradaEm: r.alteradoEm,
    excluida: r.excluido,
    registro: r,
  }
  lidas.set(r, lida)
  return lida
}

const porCriacao = (a: Leitura, b: Leitura) => (a.criadaEm < b.criadaEm ? -1 : a.criadaEm > b.criadaEm ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

function montar(registros: ReadonlyMap<string, Registro>): IndiceDeNotas {
  const leituras = [...registros.values()].map(ler).sort(porCriacao)
  const contador = new Map<string, number>()
  const porId = new Map<string, NotaVista>()
  const ligadas = new Map<string, Ligada[]>()
  const acrescentar = (chave: string, ligada: Ligada) => {
    const lista = ligadas.get(chave)
    if (lista) lista.push(ligada)
    else ligadas.set(chave, [ligada])
  }
  const existentes: NotaVista[] = []
  for (const l of leituras) {
    const chaveDoDono = l.alvoTipo && l.alvo ? chaveDoAlvo(l.alvoTipo, l.alvo) : '\u0000sem-alvo'
    const ordinal = (contador.get(chaveDoDono) ?? 0) + 1
    contador.set(chaveDoDono, ordinal)
    const nota: NotaVista = { ...l, ordinal }
    porId.set(nota.id, nota)
    if (nota.excluida) continue
    existentes.push(nota)
    const jaTem = new Set<string>()
    if (nota.alvoTipo && nota.alvo) {
      jaTem.add(chaveDoDono)
      acrescentar(chaveDoDono, { nota, direta: true })
    }
    const citados = [
      ...nota.ligacoes.map((l) => chaveDoAlvo(l.tipo, l.ref)),
      ...nota.citacoes.objetos.map((nr) => chaveDoAlvo('objeto', nr)),
      ...nota.citacoes.fontes.map((f) => chaveDoAlvo('fonte', f)),
    ]
    for (const chave of citados) {
      if (jaTem.has(chave)) continue
      jaTem.add(chave)
      acrescentar(chave, { nota, direta: false })
    }
  }
  const vazio: readonly Ligada[] = Object.freeze([])
  const ligadasA = (tipo: string, ref: string) => ligadas.get(chaveDoAlvo(tipo, ref)) ?? vazio
  return {
    todas: existentes.slice().reverse(),
    porId,
    ligadasA,
    ligadasAQualquer: (alvos) => {
      if (alvos.length === 1) return ligadasA(alvos[0]!.tipo, alvos[0]!.ref)
      const porNota = new Map<string, Ligada>()
      for (const a of alvos) for (const l of ligadasA(a.tipo, a.ref)) if (!porNota.get(l.nota.id)?.direta) porNota.set(l.nota.id, l)
      return porNota.size === 0 ? vazio : [...porNota.values()].sort((x, y) => porCriacao(x.nota, y.nota))
    },
    quantasDoAlvo: (tipo, ref) => contador.get(chaveDoAlvo(tipo, ref)) ?? 0,
  }
}

const indices = new WeakMap<ReadonlyMap<string, Registro>, IndiceDeNotas>()
const SEM_NOTAS: ReadonlyMap<string, Registro> = new Map()

/** O índice das notas deste estado (o mesmo objeto enquanto as notas não mudam). */
export function indiceDeNotas(estado: Estado): IndiceDeNotas {
  const registros = estado.registros.get('nota') ?? SEM_NOTAS
  const feito = indices.get(registros)
  if (feito) return feito
  const novo = montar(registros)
  indices.set(registros, novo)
  return novo
}
