/**
 * O modelo da tela «Excluídos» (2C, bloco 1, spec §4). PURO (sem React): dos registros com a marca própria de exclusão
 * (`estado.excluidos`) às linhas que a pessoa vê, um grupo por tipo, com o nome legível, onde estava, quando foi excluído, o
 * caminho da página e o texto da aprovação de «Restaurar».
 *
 * - Só registros com a marca própria: o que saiu junto com um objeto excluído (a foto, a nota dele) não tem marca e volta com
 *   ele. Um item com marca própria cujo objeto também está excluído aparece com «o objeto dela também está excluído» e
 *   `alvoExcluido` (a tela oferece também «Restaurar o objeto»).
 * - Origem publicada (`verbete`/`sitio` que o pacote ainda redireciona a uma entrada dos livros): «sai dos livros na próxima
 *   importação». O pacote não guarda as que já saíram: depois da importação a linha fica sem essa nota (nunca «saiu dos
 *   livros»).
 * - Origem que nunca chegou a este aparelho (só a marca, sem campos; §5): o nome é o da entrada dos livros (`nomeNoLivro`).
 */
import { lerColecao } from '../colecoes/modelo'
import { refsDeObjetosExcluidos } from '../colecoes/visiveis'
import { lerVerbeteSkc } from '../glossario/modelo'
import { lerHipotese, nomeDaHipoteseSkc } from '../hipoteses/modelo'
import { numeracaoDe } from '../objetos-skc/atual'
import { eObjetoSkc, lerObjeto, tituloDe } from '../objetos-skc/modelo'
import { juncaoNoPlural, oQueVaiJunto, textoDaJuncao } from '../objetos-skc/oQueVaiJunto'
import { destinoDe, type Redirecionamentos } from '../pacote/redirecionamentos'
import { lerDadosDoSitio } from '../sitios/modelo'
import { resumoDaNota } from '../notas/formato'
import type { Tipo } from '../usuario/eventos'
import type { Estado, Registro } from '../usuario/fusao'
import { caminhoDoRegistro, descreverRegistro, plural, quando } from '../usuario/textosDaSync'

/** Os tipos que a pessoa exclui como itens, na ordem dos grupos. */
export const TIPOS_EXCLUIVEIS = ['objeto', 'nota', 'colecao', 'hipotese', 'regiao', 'imagem', 'sitio', 'verbete'] as const satisfies readonly Tipo[]
export type TipoExcluivel = (typeof TIPOS_EXCLUIVEIS)[number]

const TITULOS: Record<TipoExcluivel, string> = {
  objeto: 'Objetos SKC',
  nota: 'Notas',
  colecao: 'Coleções',
  hipotese: 'Hipóteses',
  regiao: 'Regiões',
  imagem: 'Fotos',
  sitio: 'Sítios',
  verbete: 'Verbetes',
}

export interface LinhaExcluida {
  tipo: Tipo
  id: string
  /** O nome legível (número do objeto, título da nota, nome da coleção…). */
  nome: string
  /** Onde estava («nota em CA00001»), com as notas da linha; null quando não há o que dizer. */
  onde: string | null
  /** Quando foi excluído («hoje, 15:20»), pela marca de exclusão. */
  quando: string
  /** A página do item (que mostra o aviso de excluído com «Restaurar»); null se ele não tem página. */
  caminho: string | null
  /** Uma origem que o pacote publicou e ainda traz (sai dos livros na próxima importação). */
  publicado: boolean
  /** O objeto SKC deste item também está excluído (a linha oferece «Restaurar o objeto»). */
  alvoExcluido: { tipo: Tipo; id: string } | null
  /** O texto da aprovação de «Restaurar». */
  confirmacao: string
  /** O número da entrada dos livros dito na aprovação de uma origem publicada («TESTE-3»): a tela não o quebra no hífen. */
  numeroNosLivros: string | null
  /**
   * Os ids (do mesmo tipo) que o «Restaurar» desta linha restaura, numa só gravação: o próprio id; numa origem publicada, todas
   * as origens excluídas que levam à mesma entrada dos livros (spec §5), na ordem dos nomes.
   */
  juntas: readonly string[]
}

export interface GrupoDeExcluidos {
  tipo: Tipo
  titulo: string
  linhas: LinhaExcluida[]
}

export interface ContextoDosExcluidos {
  redirecionamentos: Redirecionamentos | null
  /** O nome de uma entrada dos livros (`GL-<dígitos>`, `<SIGLA>-<n>`), ou null se o pacote não o tem (ou ainda não leu). */
  nomeNoLivro: (tipo: 'verbete' | 'sitio', idDoLivro: string) => string | null
  /**
   * P5: o nome dos livros que este aparelho guardou para uma origem (`nomesGuardados.ts`): a reserva quando o pacote já não traz
   * a entrada (uma origem só com a marca, depois da importação).
   */
  nomeGuardado?: (idDaOrigem: string) => string | null
  agora: number
}

export const SAI_DOS_LIVROS = 'sai dos livros na próxima importação'
const ALVO_TAMBEM_EXCLUIDO = 'o objeto dela também está excluído'
const MAXIMO_DO_RESUMO = 44

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const aspas = (s: string) => `«${s}»`
const msDoHlc = (hlc: string) => Number(hlc.slice(0, 13))

/**
 * Quando a marca foi feita, como nos desenhos aprovados (spec §4): «hoje, 15:20» e «ontem, 15:20» (os de `quando`, da
 * Sincronização); os outros dias, dia/mês sem zero e sem hora («3/11»); em outro ano, com o ano («3/11/2025»). Local: `quando`
 * continua como a Sincronização o usa.
 */
export function quandoDaMarca(ms: number, agora: number): string {
  const q = quando(ms, agora)
  if (q.startsWith('hoje, ') || q.startsWith('ontem, ')) return q
  const d = new Date(ms)
  const dia = `${d.getDate()}/${d.getMonth() + 1}`
  return d.getFullYear() === new Date(agora).getFullYear() ? dia : `${dia}/${d.getFullYear()}`
}

/** A pergunta da aprovação: um título que termina em ponto («Selo. Pedra.») não fica com «.?» (m-4). */
const pergunta = (s: string): string => `${s.replace(/\.$/, '')}?`

/** Os nomes sem repetir, na ordem: duas origens da mesma entrada dos livros podem ter o mesmo nome (o dela). */
const semRepetir = (nomes: readonly string[]): string[] => [...new Set(nomes)]

/** A mensagem depois de restaurar: «Restaurado: CA00005.», «Restaurado: Tell A e Tell B.»; sem ponto duplo nem nome repetido. */
export function textoDoRestaurado(todos: readonly string[]): string {
  const nomes = semRepetir(todos)
  const lista = nomes.length <= 1 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)!}`
  return `Restaurado: ${lista}${/[.!?]$/.test(lista) ? '' : '.'}`
}

/** O começo do texto numa linha, cortado entre palavras (com reticências) quando passa do tamanho. */
function resumoCurto(t: string): string {
  const linha = resumoDaNota(t, Number.MAX_SAFE_INTEGER)
  if (linha.length <= MAXIMO_DO_RESUMO) return linha
  const corte = linha.slice(0, MAXIMO_DO_RESUMO)
  const espaco = corte.lastIndexOf(' ')
  return `${(espaco > MAXIMO_DO_RESUMO / 2 ? corte.slice(0, espaco) : corte).replace(/[\s,;:.]+$/, '')}…`
}

/** «X», «X» e «Y», «X», «Y» e «Z»; um nome repetido aparece uma vez. */
function listaComE(nomes: readonly string[]): string {
  const q = semRepetir(nomes).map(aspas)
  return q.length <= 1 ? (q[0] ?? '') : `${q.slice(0, -1).join(', ')} e ${q.at(-1)!}`
}

/** O que se sabe dos objetos SKC deste estado: o nome de cada um (número, senão o título) e os excluídos (por id e número). */
class Objetos {
  private readonly numeracao
  private readonly excluidos: ReadonlySet<string>
  private readonly porRef = new Map<string, Registro>()
  constructor(private readonly estado: Estado) {
    this.numeracao = numeracaoDe(estado)
    this.excluidos = refsDeObjetosExcluidos(estado)
    for (const r of estado.registros.get('objeto')?.values() ?? []) {
      this.porRef.set(r.id.toUpperCase(), r)
      const n = this.numeroConfirmado(r.id)
      if (n) this.porRef.set(n, r)
    }
  }
  /** O registro de um objeto SKC por id (`OB-…`, em qualquer caixa) ou pelo número confirmado; undefined para um do livro. */
  registro(ref: string): Registro | undefined {
    return this.porRef.get(ref.toUpperCase())
  }
  numeroConfirmado(id: string): string | null {
    const i = this.numeracao.porId.get(id)
    return i?.situacao === 'confirmado' ? i.numero : null
  }
  /** O número (de agora) ou, sem ele, o título. Um objeto do livro: a ref como está. */
  nome(ref: string): string {
    const r = this.registro(ref)
    if (!r) return ref
    return this.numeracao.porId.get(r.id)?.numero ?? tituloDe(lerObjeto(r))
  }
  /** O objeto SKC de `ref` está excluído? Devolve o id dele. */
  excluido(ref: unknown): string | null {
    const t = texto(ref)
    if (!t) return null
    const r = this.registro(t)
    return r && r.excluido && (this.excluidos.has(r.id) || this.excluidos.has(t.toUpperCase())) ? r.id : null
  }
  /** As coleções vivas que têm o objeto (pelo id ou pelo número), pelo nome. */
  colecoesCom(id: string): string[] {
    const refs = new Set([id, this.numeroConfirmado(id)].filter((x): x is string => !!x))
    const nomes: string[] = []
    for (const r of this.estado.registros.get('colecao')?.values() ?? []) {
      if (r.excluido) continue
      const c = lerColecao(r)
      if (c.membros.some((m) => refs.has(m.ref))) nomes.push(c.nome || descreverRegistro('colecao', r.id))
    }
    return nomes.sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }
}

interface Peca {
  nome: string
  onde: string | null
  descricao: string
  caminho: string | null
  alvo: string | null
}

export function gruposDeExcluidos(estado: Estado, ctx: ContextoDosExcluidos): GrupoDeExcluidos[] {
  const objetos = new Objetos(estado)
  const destino = (id: string) => destinoDe(ctx.redirecionamentos, id)
  const publicado = (id: string) => destino(id) !== id
  /** O nome de agora de um verbete: o do usuário (forma em uso), senão o dos livros. */
  const nomeDoVerbete = (id: string, guardado: string | null): string | null => {
    const r = estado.registro('verbete', id)
    if (r && texto(r.campos.forma)) return lerVerbeteSkc(r).emUso
    return ctx.nomeNoLivro('verbete', destino(id)) ?? (r ? (texto(r.campos.formaEmUso) ?? guardado) : guardado) ?? ctx.nomeGuardado?.(id) ?? null
  }
  const nomeDoSitio = (id: string): string | null => {
    const r = estado.registro('sitio', id)
    return (r ? lerDadosDoSitio(r).nome : null) ?? ctx.nomeNoLivro('sitio', destino(id)) ?? ctx.nomeGuardado?.(id) ?? null
  }
  /** O alvo de uma nota pelo nome que a pessoa reconhece. */
  const alvoDaNota = (tipo: unknown, ref: string): string => {
    if (tipo === 'objeto') return objetos.nome(ref)
    if (tipo === 'sitio') return nomeDoSitio(ref) ?? ref
    if (tipo === 'verbete') return nomeDoVerbete(ref, null) ?? ref
    if (tipo === 'colecao-item') return ref.split('/').at(-1) ?? ref
    return ref
  }

  const peca = (r: Registro): Peca => {
    const c = r.campos
    const caminho = caminhoDoRegistro(r.tipo, r.id, c)
    switch (r.tipo) {
      case 'objeto': {
        const numero = objetos.numeroConfirmado(r.id)
        const titulo = tituloDe(lerObjeto(r))
        return { nome: numero ?? titulo, onde: numero ? titulo : null, descricao: `o objeto ${numero ?? aspas(titulo)}`, caminho, alvo: null }
      }
      case 'nota': {
        const resumo = resumoCurto(typeof c.texto === 'string' ? c.texto : '')
        const ref = texto(c.alvo)
        const em = ref ? alvoDaNota(c.alvoTipo, ref) : null
        return {
          nome: resumo ? aspas(resumo) : 'Nota sem texto',
          onde: em ? `nota em ${em}` : null,
          descricao: em ? `a nota em ${em}` : resumo ? `a nota ${aspas(resumo)}` : 'a nota',
          caminho,
          alvo: c.alvoTipo === 'objeto' ? ref : null,
        }
      }
      case 'colecao': {
        const nome = texto(c.nome) ?? descreverRegistro('colecao', r.id)
        const n = lerColecao(r).membros.length
        return { nome, onde: n > 0 ? `coleção com ${plural(n, 'objeto', 'objetos')}` : null, descricao: `a coleção ${aspas(nome)}`, caminho, alvo: null }
      }
      case 'hipotese': {
        const h = lerHipotese(r)
        const nome = nomeDaHipoteseSkc(h, (id, guardado) => nomeDoVerbete(id, guardado) ?? guardado)
        const em = h.objeto ? objetos.nome(h.objeto) : null
        const sobre = h.termos.length > 0 ? ` sobre ${aspas(nome)}` : ''
        return { nome, onde: em ? `hipótese em ${em}` : null, descricao: `a hipótese${sobre}${em ? ` em ${em}` : ''}`, caminho, alvo: h.objeto }
      }
      case 'regiao': {
        const nome = texto(c.elemento) ?? 'região'
        const ref = texto(c.objeto)
        const em = ref ? objetos.nome(ref) : null
        return { nome, onde: em ? `região na foto de ${em}` : null, descricao: `a região ${aspas(nome)}${em ? ` na foto de ${em}` : ''}`, caminho, alvo: ref }
      }
      case 'imagem': {
        const nome = texto(c.legenda) ?? texto(c.nome) ?? 'Foto sem legenda'
        const ref = texto(c.alvo)
        const de = ref ? objetos.nome(ref) : null
        const arquivo = texto(c.legenda) ?? texto(c.nome)
        return {
          nome,
          onde: de ? `foto de ${de}` : null,
          descricao: `a foto${arquivo ? ` ${aspas(arquivo)}` : ''}${de ? ` de ${de}` : ''}`,
          caminho: ref ? `/item/${encodeURIComponent(ref)}` : null,
          alvo: ref,
        }
      }
      case 'sitio': {
        const nome = nomeDoSitio(r.id) ?? descreverRegistro('sitio', r.id)
        return { nome, onde: null, descricao: `o sítio ${aspas(nome)}`, caminho, alvo: null }
      }
      case 'verbete': {
        const nome = nomeDoVerbete(r.id, null) ?? descreverRegistro('verbete', r.id)
        return { nome, onde: null, descricao: `o verbete ${aspas(nome)}`, caminho, alvo: null }
      }
      default:
        return { nome: descreverRegistro(r.tipo, r.id, c), onde: null, descricao: descreverRegistro(r.tipo, r.id, c), caminho, alvo: null }
    }
  }

  /** O texto da aprovação de restaurar um objeto: o que volta junto e para onde (spec §4). */
  const confirmacaoDoObjeto = (r: Registro, descricao: string): string => {
    const junto = oQueVaiJunto(estado, r.id)
    const lista = textoDaJuncao(junto).replace(/ dele$/, '')
    const voltaJunto = lista ? ` ${juncaoNoPlural(junto) ? 'Voltam' : 'Volta'} com ele ${lista[0]!.toLowerCase()}${lista.slice(1)}.` : ''
    const colecoes = objetos.colecoesCom(r.id)
    const numero = objetos.numeroConfirmado(r.id) ? ', com o mesmo número' : ''
    const onde = colecoes.length === 0 ? '' : ` e ${colecoes.length === 1 ? 'à coleção' : 'às coleções'} ${listaComE(colecoes)}, no mesmo lugar`
    return `${pergunta(`Restaurar ${descricao}`)}${voltaJunto} Ele volta às listas${onde}${numero}.`
  }

  /** As origens excluídas de cada entrada dos livros (`tipo:destino`), pelo nome: voltam juntas (spec §5). */
  const origensPorDestino = new Map<string, { id: string; nome: string }[]>()
  const chaveDaOrigem = (r: Registro) => `${r.tipo}:${destino(r.id)}`
  for (const r of estado.excluidos) {
    if ((r.tipo !== 'sitio' && r.tipo !== 'verbete') || !publicado(r.id) || estado.marcaDeExclusao(r.tipo, r.id)?.op !== 'excluir') continue
    const lista = origensPorDestino.get(chaveDaOrigem(r)) ?? []
    lista.push({ id: r.id, nome: peca(r).nome })
    origensPorDestino.set(chaveDaOrigem(r), lista)
  }
  for (const lista of origensPorDestino.values()) lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const PUBLICADO = {
    sitio: { plural: 'sítios', ligados: 'os objetos e notas ligados' },
    verbete: { plural: 'verbetes', ligados: 'as hipóteses e notas ligadas' },
  } as const

  const confirmacao = (r: Registro, p: Peca, origens: readonly { id: string; nome: string }[], ficaEscondida: boolean): string => {
    if (r.tipo === 'objeto') return confirmacaoDoObjeto(r, p.descricao)
    if ((r.tipo === 'sitio' || r.tipo === 'verbete') && publicado(r.id)) {
      const t = PUBLICADO[r.tipo]
      const numero = destino(r.id)
      if (origens.length > 1) {
        return `Restaurar os seus ${origens.length} ${t.plural} ${listaComE(origens.map((o) => o.nome))}? Eles continuam nos livros, com o mesmo ${numero}, e ${t.ligados} a eles voltam a se ligar a eles.`
      }
      return `${pergunta(`Restaurar ${p.descricao}`)} Ele continua nos livros, com o mesmo ${numero}, e ${t.ligados} a ele voltam a se ligar a ele.`
    }
    if (ficaEscondida) return `${pergunta(`Restaurar ${p.descricao}`)} Ela fica escondida até o objeto voltar.`
    return pergunta(`Restaurar ${p.descricao}`)
  }

  const porTipo = new Map<TipoExcluivel, { hlc: string; linha: LinhaExcluida }[]>()
  for (const r of estado.excluidos) {
    if (!(TIPOS_EXCLUIVEIS as readonly Tipo[]).includes(r.tipo)) continue
    if (r.tipo === 'objeto' && !eObjetoSkc(r)) continue
    const marca = estado.marcaDeExclusao(r.tipo, r.id)
    if (marca?.op !== 'excluir') continue
    const p = peca(r)
    const alvoExcluido = r.tipo !== 'objeto' && p.alvo ? objetos.excluido(p.alvo) : null
    const eOrigem = (r.tipo === 'sitio' || r.tipo === 'verbete') && publicado(r.id)
    const origens = eOrigem ? (origensPorDestino.get(chaveDaOrigem(r)) ?? []) : []
    const notas = [p.onde, alvoExcluido ? ALVO_TAMBEM_EXCLUIDO : null, eOrigem ? SAI_DOS_LIVROS : null].filter((x): x is string => !!x)
    const linha: LinhaExcluida = {
      tipo: r.tipo,
      id: r.id,
      nome: p.nome,
      onde: notas.length > 0 ? notas.join(' · ') : null,
      quando: quandoDaMarca(msDoHlc(marca.hlc), ctx.agora),
      caminho: p.caminho,
      publicado: eOrigem,
      alvoExcluido: alvoExcluido ? { tipo: 'objeto', id: alvoExcluido } : null,
      // a foto, a região e a hipótese de um objeto ainda excluído ficam escondidas até ele voltar (P4); a nota não muda
      confirmacao: confirmacao(r, p, origens, (r.tipo === 'imagem' || r.tipo === 'regiao' || r.tipo === 'hipotese') && alvoExcluido !== null),
      numeroNosLivros: eOrigem ? destino(r.id) : null,
      juntas: origens.length > 1 ? origens.map((o) => o.id) : [r.id],
    }
    const lista = porTipo.get(r.tipo as TipoExcluivel) ?? []
    lista.push({ hlc: marca.hlc, linha })
    porTipo.set(r.tipo as TipoExcluivel, lista)
  }

  return TIPOS_EXCLUIVEIS.flatMap((tipo) => {
    const lista = porTipo.get(tipo)
    if (!lista || lista.length === 0) return []
    lista.sort((a, b) => (a.hlc < b.hlc ? 1 : a.hlc > b.hlc ? -1 : a.linha.id < b.linha.id ? -1 : 1))
    return [{ tipo, titulo: TITULOS[tipo], linhas: lista.map((x) => x.linha) }]
  })
}
