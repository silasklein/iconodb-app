/**
 * As sugestões da busca (decisão 32): ao digitar, até `limitePorCategoria` verbetes, objetos, sítios e obras do
 * pacote e, com a marca SKC, verbetes (decisão 41), objetos, sítios e coleções do usuário. A última palavra digitada vale como início de
 * palavra (a mesma regra do FTS5 da busca); as outras, como palavra inteira. Dentro de cada categoria a ordem é a
 * relevância (bm25 do FTS5; para os sítios, quem começa pelo que foi digitado vem antes) e depois o rótulo.
 *
 * É uma consulta leve, feita a cada tecla (quem chama espera ~120 ms e descarta a resposta velha): uma consulta SQL
 * por categoria, sem o agrupamento por objeto, os filtros nem as facetas de `buscar`. Os sítios do pacote vêm de uma
 * lista guardada (muda só quando o pacote muda). Sem pacote aberto, devolve tudo vazio: sugerir nunca quebra a digitação.
 *
 * `Sugestao` serve também ao autocompletar de `[[` das notas (Tarefa 6): `alvoTipo` + `ref` dizem o que ligar
 * (`[[ref|rótulo]]`); `ListaDeSugestoes` desenha a lista.
 */
import { consultarUsuario, executar, geracaoDoBanco, publicacoesAbertas } from '../banco/cliente'
import { resumosDosItens, sitios as listaDosSitios } from '../banco/consultas'
import { lerColecao } from '../colecoes/modelo'
import { semMembrosExcluidos } from '../colecoes/visiveis'
import { formasEmUso } from '../glossario/doUsuario'
import { eVerbeteSkc, lerVerbeteSkc, ROTULO_DO_STATUS } from '../glossario/modelo'
import { numeracaoDe, numeroDoObjeto, objetosComNumero } from '../objetos-skc/atual'
import { pareceComecoDeNumero, textoDoNrSkc } from '../objetos-skc/numeracao'
import { lerFicha, textoDaOrigem, tipoCurtoDe } from '../objetos-skc/modelo'
import { correcoesDosSitios, nomeComMarcaDoSitio, nomeDeAgoraDoSitio, sitioDeAgoraDoResumo } from '../sitios/doUsuario'
import { eSitioSkc } from '../sitios/modelo'
import { redirecionamentosOuNenhum, type Redirecionamentos } from '../pacote/redirecionamentos'
import { sitiosDoPacote, type SitiosDoPacote } from '../sitios/pacote'
import type { Estado, Registro } from '../usuario/estado'
import { garantirIndiceDoUsuario } from '../usuario/indice'
import { MINIMO_DE_CARACTERES, casa, montarConsulta, objetosDaReferencia, palavrasDaConsulta } from './consulta'
import { destacar, type Trecho } from './destaque'
import { fold, tabelaDoPacote, type FoldTabela } from './fold'
import { rotaDoAcertoDoUsuario } from './rotasDoUsuario'
import { caminhoDaBusca } from './url'

export type { Trecho } from './destaque'

export const CATEGORIAS = ['verbetes', 'objetos', 'sitios', 'obras', 'colecoes'] as const
export type Categoria = (typeof CATEGORIAS)[number]

export const ROTULO_DA_CATEGORIA: Record<Categoria, string> = {
  verbetes: 'Verbetes',
  objetos: 'Objetos',
  sitios: 'Sítios',
  obras: 'Obras',
  colecoes: 'Coleções',
}

export interface Sugestao {
  /** Único na lista (categoria + ref); serve de `key` e de base para o id da opção. */
  chave: string
  categoria: Categoria
  /** O que a sugestão é, para quem quer ligar a ela (autocompletar de `[[`). */
  alvoTipo: 'verbete' | 'objeto' | 'sitio' | 'obra' | 'colecao'
  /** O id do que ela é: GL-… do verbete, o número do objeto, o id do sítio (TESTE-1, SI-…), BIB-… da obra, CO-… da coleção. */
  ref: string
  rotulo: string
  /** O rótulo em pedaços, com o que casa em negrito. */
  trechos: Trecho[]
  complemento: string | null
  complementoTrechos: Trecho[]
  /** Objetos: o número (CA00001), em fonte de código. */
  codigo: string | null
  codigoTrechos: Trecho[]
  /** Verbetes: o id, discreto, à direita. */
  id: string | null
  /** Objetos do pacote: o caminho da miniatura (imagens/…/thumb-1.webp); null sem imagem. */
  miniatura: string | null
  /** Veio da camada do usuário. */
  skc: boolean
  /** A rota do destino (`/verbete/GL-…`, `/item/CA00001`…). */
  destino: string
  /** O que entra nas buscas recentes ao escolher esta sugestão. */
  recente: string
}

export interface Sugestoes {
  verbetes: Sugestao[]
  objetos: Sugestao[]
  sitios: Sugestao[]
  obras: Sugestao[]
  /** Coleções do usuário (o pacote não tem coleções nesta lista). */
  colecoes?: Sugestao[]
}

export interface OpcoesDeSugestao {
  limitePorCategoria?: number
  /** A tabela de dobra; sem ela, a do pacote aberto. */
  tabela?: FoldTabela
}

export const LIMITE_PADRAO_POR_CATEGORIA = 3

export const semSugestoes = (): Sugestoes => ({ verbetes: [], objetos: [], sitios: [], obras: [], colecoes: [] })

/** Quantas sugestões, no total. */
export const totalDeSugestoes = (s: Sugestoes): number => CATEGORIAS.reduce((n, c) => n + (s[c]?.length ?? 0), 0)

type L = Record<string, unknown>
const s = (v: unknown): string | null => (typeof v === 'string' ? v : v == null ? null : String(v))
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const comparar = (a: string, b: string) => a.localeCompare(b, 'pt', { numeric: true, sensitivity: 'base' })
const plural = (quantos: number, um: string, varios: string) => `${quantos.toLocaleString('pt-BR')} ${quantos === 1 ? um : varios}`

interface Contexto {
  digitado: string
  tabela: FoldTabela
  limite: number
  /** A camada do usuário (os nomes de sítio corrigidos, os sítios trocados) e os sítios do pacote. */
  estado: Estado
  livro: SitiosDoPacote | null
  /** Os redirecionamentos do pacote (Tarefa 16): um sítio do usuário publicado tem o nome do sítio do livro. */
  redirecionamentos: Redirecionamentos
}

function montar(
  c: Contexto,
  d: Pick<Sugestao, 'categoria' | 'alvoTipo' | 'ref' | 'rotulo' | 'destino'> &
    Partial<Pick<Sugestao, 'complemento' | 'codigo' | 'id' | 'miniatura' | 'skc' | 'recente'>>,
): Sugestao {
  const complemento = d.complemento ?? null
  const codigo = d.codigo ?? null
  return {
    chave: `${d.categoria}:${d.skc ? 'skc:' : ''}${d.ref}`,
    categoria: d.categoria,
    alvoTipo: d.alvoTipo,
    ref: d.ref,
    rotulo: d.rotulo,
    trechos: destacar(d.rotulo, c.digitado, c.tabela),
    complemento,
    complementoTrechos: complemento ? destacar(complemento, c.digitado, c.tabela) : [],
    codigo,
    codigoTrechos: codigo ? destacar(codigo, c.digitado, c.tabela) : [],
    id: d.id ?? null,
    miniatura: d.miniatura ?? null,
    skc: d.skc ?? false,
    destino: d.destino,
    recente: d.recente ?? codigo ?? d.rotulo,
  }
}

// ---------------------------------------------------------------------------
// O pacote
// ---------------------------------------------------------------------------

const EM_IDS = '(SELECT value FROM json_each($ids))'
const lista = (itens: readonly string[]) => JSON.stringify(itens)

/** Verbetes e obras: os `limite` melhores de cada, por relevância (bm25) e depois pelo rótulo. */
async function verbetesEObras(c: Contexto, consulta: string): Promise<{ verbetes: Sugestao[]; obras: Sugestao[] }> {
  const linhas = await executar<L>(
    `SELECT tipo, ref, rotulo FROM (
       SELECT d.tipo, d.ref, d.rotulo, row_number() OVER (PARTITION BY d.tipo ORDER BY f.rank, d.rotulo) AS pos
       FROM busca.fts AS f JOIN busca.doc AS d ON d.rowid = f.rowid
       WHERE f.fts MATCH $q AND d.tipo IN ('verbete', 'obra')
     ) WHERE pos <= $n ORDER BY tipo, pos`,
    { $q: consulta, $n: c.limite },
  )
  const doVerbete = linhas.filter((l) => l.tipo === 'verbete')
  const daObra = linhas.filter((l) => l.tipo === 'obra')

  // Outras formas do verbete (alemão, inglês, variantes) para quando o que casou não está no rótulo.
  const nomes = new Map<string, string[]>()
  if (doVerbete.length > 0) {
    const g = await executar<L>(`SELECT id, de, en, variants FROM main.glossary_entry WHERE id IN ${EM_IDS}`, { $ids: lista(doVerbete.map((l) => s(l.ref)!)) })
    for (const l of g) {
      let variantes: unknown = []
      try {
        variantes = JSON.parse(s(l.variants) ?? '[]')
      } catch {
        /* variantes ilegíveis: valem as outras formas */
      }
      nomes.set(s(l.id)!, [s(l.de), s(l.en), ...(Array.isArray(variantes) ? variantes.map(s) : [])].filter((x): x is string => !!x))
    }
  }
  const verbetes = doVerbete.map((l) => {
    const ref = s(l.ref)!
    const rotulo = s(l.rotulo) ?? ref
    const semNegrito = !destacar(rotulo, c.digitado, c.tabela).some((t) => t.forte)
    const outra = semNegrito ? (nomes.get(ref) ?? []).find((nome) => destacar(nome, c.digitado, c.tabela).some((t) => t.forte)) : undefined
    return montar(c, { categoria: 'verbetes', alvoTipo: 'verbete', ref, rotulo, id: ref, complemento: outra ?? null, destino: `/verbete/${encodeURIComponent(ref)}` })
  })

  const titulos = new Map<string, string>()
  if (daObra.length > 0) {
    const b = await executar<L>(`SELECT id, csl_json FROM main.bib_entry WHERE id IN ${EM_IDS}`, { $ids: lista(daObra.map((l) => s(l.ref)!)) })
    for (const l of b) {
      try {
        const csl = JSON.parse(s(l.csl_json) ?? 'null') as { title?: unknown } | null
        if (typeof csl?.title === 'string' && csl.title.trim() !== '') titulos.set(s(l.id)!, csl.title.trim())
      } catch {
        /* sem título */
      }
    }
  }
  const obras = daObra.map((l) => {
    const ref = s(l.ref)!
    return montar(c, { categoria: 'obras', alvoTipo: 'obra', ref, rotulo: s(l.rotulo) ?? ref, complemento: titulos.get(ref) ?? null, destino: `/obra/${encodeURIComponent(ref)}` })
  })
  return { verbetes, obras }
}

/** Os números de objeto que começam pelo que foi digitado ("CA0000"), quando o que foi digitado parece um número. */
async function objetosPeloNumero(digitado: string, limite: number): Promise<string[]> {
  const t = digitado.trim()
  if (!pareceComecoDeNumero(t)) return []
  const linhas = await executar<L>(`SELECT id FROM main.object WHERE id LIKE $p ORDER BY id LIMIT $n`, { $p: `${t.toUpperCase()}%`, $n: limite })
  return linhas.map((l) => s(l.id)!)
}

/** Os objetos cujo texto (ficha do catálogo) casa, os melhores primeiro; um por objeto. */
async function objetosPeloTexto(consulta: string, limite: number): Promise<string[]> {
  const linhas = await executar<L>(
    `SELECT d.objeto AS numero FROM busca.fts AS f JOIN busca.doc AS d ON d.rowid = f.rowid
     WHERE f.fts MATCH $q AND d.tipo IN ('item', 'catalogo') AND d.objeto IS NOT NULL
     GROUP BY d.objeto ORDER BY min(f.rank), d.objeto LIMIT $n`,
    { $q: consulta, $n: limite },
  )
  return linhas.map((l) => s(l.numero)!)
}

async function objetos(c: Contexto, consulta: string): Promise<Sugestao[]> {
  const [peloNumero, peloTexto] = await Promise.all([objetosPeloNumero(c.digitado, c.limite), objetosPeloTexto(consulta, c.limite)])
  // O texto vem primeiro; o número só passa à frente quando o que foi digitado já tem dígitos ("CA0000").
  const ordenados = /\d/.test(c.digitado) ? [...peloNumero, ...peloTexto] : [...peloTexto, ...peloNumero]
  return objetosDoPacote(c, [...new Set(ordenados)].slice(0, c.limite))
}

/** A sugestão de cada objeto do pacote, na ordem dada (os números sem resumo ficam de fora). */
async function objetosDoPacote(c: Contexto, numeros: readonly string[]): Promise<Sugestao[]> {
  if (numeros.length === 0) return []
  const membros = await executar<L>(`SELECT object_id, item_id FROM main.object_member WHERE object_id IN ${EM_IDS} ORDER BY object_id, item_id`, { $ids: lista(numeros) })
  const primeiro = new Map<string, string>()
  for (const l of membros) if (!primeiro.has(s(l.object_id)!)) primeiro.set(s(l.object_id)!, s(l.item_id)!)
  const resumos = new Map((await resumosDosItens([...primeiro.values()], 'dada')).map((r) => [r.numero, r]))
  return numeros.flatMap((numero) => {
    const r = resumos.get(numero)
    if (!r) return []
    return montar(c, {
      categoria: 'objetos',
      alvoTipo: 'objeto',
      ref: numero,
      rotulo: r.tipo ?? 'Objeto sem tipo',
      codigo: numero,
      complemento: [r.origem, sitioDeAgoraDoResumo(c.estado, c.livro, r, c.redirecionamentos).nome].filter(Boolean).join(' · ') || null,
      miniatura: r.miniatura,
      destino: `/item/${encodeURIComponent(numero)}`,
    })
  })
}

// Os sítios do pacote: a lista (com as outras formas do nome) é lida uma vez por pacote e motor.
interface SitioIndexado {
  id: string
  nome: string
  regiao: string | null
  objetos: number
  /** Todas as formas do nome, para casar. */
  nomes: string
}
let sitiosGuardados: { motor: number; tabela: FoldTabela; lista: Promise<SitioIndexado[]> } | null = null

function listaDeSitios(tabela: FoldTabela): Promise<SitioIndexado[]> {
  const motor = geracaoDoBanco()
  if (sitiosGuardados?.motor === motor && sitiosGuardados.tabela === tabela) return sitiosGuardados.lista
  const lista_ = (async () => {
    const sitios = await listaDosSitios()
    const glIds = sitios.map((x) => x.glId).filter((x): x is string => !!x)
    const extras = new Map<string, string[]>()
    if (glIds.length > 0) {
      const g = await executar<L>(`SELECT id, pt_text, de, variants FROM main.glossary_entry WHERE id IN ${EM_IDS}`, { $ids: lista(glIds) })
      for (const l of g) {
        let variantes: unknown = []
        try {
          variantes = JSON.parse(s(l.variants) ?? '[]')
        } catch {
          /* variantes ilegíveis */
        }
        extras.set(s(l.id)!, [s(l.pt_text), s(l.de), ...(Array.isArray(variantes) ? variantes.map(s) : [])].filter((x): x is string => !!x))
      }
    }
    return sitios.map((x): SitioIndexado => ({
      id: x.id,
      nome: x.nome,
      regiao: x.regiao?.nome ?? null,
      objetos: x.objetos,
      nomes: [x.nome, x.literal, ...(x.glId ? (extras.get(x.glId) ?? []) : [])].join(' '),
    }))
  })()
  const entrada = { motor, tabela, lista: lista_ }
  sitiosGuardados = entrada
  lista_.catch(() => {
    if (sitiosGuardados === entrada) sitiosGuardados = null
  })
  return lista_
}

async function sitios(c: Contexto, palavras: readonly string[]): Promise<Sugestao[]> {
  const dobrado = palavras.join(' ')
  const correcoes = correcoesDosSitios(c.estado, c.redirecionamentos)
  const achados = (await listaDeSitios(c.tabela))
    .map((x) => {
      // O que a pessoa corrigiu (Tarefa 12): o nome de agora, as grafias a mais e a região; o nome do livro continua achando.
      const k = correcoes.get(x.id)
      return { x, nome: k?.nome ?? x.nome, regiao: k?.regiao ?? x.regiao, nomes: k ? [x.nomes, k.nome, ...k.variantes, k.regiao].filter(Boolean).join(' ') : x.nomes }
    })
    .filter((y) => casa(palavras, y.nomes, c.tabela))
    .map((y) => {
      const nomeDobrado = fold(y.nome, c.tabela)
      // 0: o nome começa pelo que foi digitado; 1: o nome casa; 2: só outra forma do nome casa
      const relevancia = nomeDobrado.startsWith(dobrado) ? 0 : casa(palavras, y.nome, c.tabela) ? 1 : 2
      return { ...y, relevancia }
    })
    .sort((a, b) => a.relevancia - b.relevancia || comparar(a.nome, b.nome) || comparar(a.x.id, b.x.id))
    .slice(0, c.limite)
  return achados.map((y) =>
    montar(c, {
      categoria: 'sitios',
      alvoTipo: 'sitio',
      ref: y.x.id,
      rotulo: y.nome,
      // Achado só pelo nome de antes: diz qual é o do livro (o nome corrigido não casou).
      complemento:
        [y.nome !== y.x.nome && !casa(palavras, y.nome, c.tabela) && casa(palavras, y.x.nome, c.tabela) ? `no livro: ${y.x.nome}` : null, y.regiao, plural(y.x.objetos, 'objeto', 'objetos')]
          .filter(Boolean)
          .join(' · '),
      destino: `/sitio/${encodeURIComponent(y.x.id)}`,
    }),
  )
}

// ---------------------------------------------------------------------------
// A camada do usuário
// ---------------------------------------------------------------------------

interface DoUsuario {
  verbetes: Sugestao[]
  /** Os verbetes do LIVRO achados pela forma em uso do usuário (Tarefa 11): o id e o rótulo (a forma em uso). */
  verbetesDoLivro: { ref: string; rotulo: string }[]
  objetos: Sugestao[]
  sitios: Sugestao[]
  colecoes: Sugestao[]
}

async function doUsuario(c: Contexto, consulta: string, estado: Estado): Promise<DoUsuario> {
  const dos = async (tipo: 'objeto' | 'sitio' | 'colecao' | 'verbete'): Promise<L[]> =>
    consultarUsuario<L>(
      `SELECT d.ref, d.rotulo, d.objeto FROM fts AS f JOIN doc AS d ON d.rowid = f.rowid
       WHERE f.fts MATCH $q AND d.tipo = $t AND ${tipo === 'objeto' ? 'd.objeto IS NOT NULL' : '1'} ORDER BY f.rank, d.rotulo LIMIT $n`,
      { $q: consulta, $t: tipo, $n: c.limite },
    )
  const [linhasObjeto, linhasSitioTodas, linhasColecao, linhasVerbeteTodas, redirecionamentos] = await Promise.all([
    dos('objeto'),
    dos('sitio'),
    dos('colecao'),
    dos('verbete'),
    Promise.resolve(c.redirecionamentos),
  ])
  // O verbete ou sítio do usuário que o pacote publicou (Tarefa 16) é sugerido como o do livro (pela lista do pacote), nunca aqui.
  const publicado = (l: L) => redirecionamentos.has(s(l.ref) ?? '')
  const linhasSitio = linhasSitioTodas.filter((l) => !publicado(l))
  const linhasVerbete = linhasVerbeteTodas.filter((l) => !publicado(l))

  const objetos = linhasObjeto.flatMap((l) => {
    const r: Registro | undefined = estado.registro('objeto', s(l.ref)!)
    const numero = r ? numeroDoObjeto(estado, r.id) : null
    if (!r || r.excluido || !numero) return []
    return objetoSkc(c, estado, r, numero)
  })
  const comRegistro = (tipo: 'sitio' | 'colecao' | 'verbete', linhas: L[], categoria: 'sitios' | 'colecoes' | 'verbetes', complemento: (r: Registro) => string | null) =>
    linhas.flatMap((l) => {
      const r = estado.registro(tipo, s(l.ref)!)
      const rotulo = s(l.rotulo) ?? ''
      if (!r || r.excluido || rotulo === '') return []
      return montar(c, {
        categoria,
        alvoTipo: tipo,
        ref: r.id,
        rotulo,
        complemento: complemento(r),
        skc: true,
        destino: rotaDoAcertoDoUsuario(tipo, r.id) ?? caminhoDaBusca(rotulo),
      })
    })
  const doLivro = linhasVerbete.filter((l) => !eVerbeteSkc(s(l.ref) ?? ''))
  return {
    // Os verbetes do usuário (decisão 41): "a revisar" (ou "aprovado", Tarefa 11) no complemento.
    verbetes: comRegistro('verbete', linhasVerbete.filter((l) => eVerbeteSkc(s(l.ref) ?? '')), 'verbetes', (r) => ROTULO_DO_STATUS[lerVerbeteSkc(r).status]),
    verbetesDoLivro: doLivro.flatMap((l) => {
      const ref = s(l.ref)
      const rotulo = s(l.rotulo)
      return ref && rotulo ? [{ ref, rotulo }] : []
    }),
    objetos,
    // A correção de um sítio do LIVRO já está na lista do pacote (`sitios()`, com o nome de agora): só os sítios novos entram aqui.
    sitios: comRegistro('sitio', linhasSitio.filter((l) => eSitioSkc(s(l.ref))), 'sitios', (r) => [texto(r.campos.regiao), texto(r.campos.pais)].filter(Boolean).join(' · ') || null),
    colecoes: comRegistro('colecao', linhasColecao, 'colecoes', (r) => {
      const quantos = semMembrosExcluidos(lerColecao(r), estado).membros.length
      return quantos > 0 ? plural(quantos, 'objeto', 'objetos') : null
    }),
  }
}

/** A sugestão de um objeto SKC com número. */
function objetoSkc(c: Contexto, estado: Estado, r: Registro, numero: string): Sugestao {
  const ficha = lerFicha(r.campos)
  const nrSkc = numeracaoDe(estado).porId.get(r.id)?.nrSkc ?? null
  const sitioId = texto(r.campos.sitio)
  // O nome de agora do sítio (corrigido → do livro → o guardado na ficha), «excluído» num sítio seu que se excluiu, «ainda não sincronizado» num que este aparelho não tem.
  const nomeDoSitio = sitioId ? nomeDeAgoraDoSitio(estado, sitioId, c.livro, texto(r.campos.sitioNome), c.redirecionamentos) : texto(r.campos.sitioNome)
  const sitio = nomeComMarcaDoSitio(estado, sitioId || null, nomeDoSitio, c.redirecionamentos)
  return montar(c, {
    categoria: 'objetos',
    alvoTipo: 'objeto',
    ref: numero,
    rotulo: tipoCurtoDe(ficha) ?? 'Objeto SKC',
    codigo: numero,
    // "SKC: 12" primeiro (decisões 38 e 39): quem digitou "SKC 12" vê por que o objeto apareceu.
    complemento: [nrSkc !== null ? textoDoNrSkc(nrSkc) : null, textoDaOrigem(ficha), sitio].filter(Boolean).join(' · ') || null,
    skc: true,
    // O número (provisório ou confirmado) abre a tela do objeto; o Item resolve números SKC (Tarefa 9).
    destino: `/item/${encodeURIComponent(numero)}`,
  })
}

/**
 * Os verbetes do livro com a forma em uso do usuário (Tarefa 11): cada um aparece UMA vez, com a forma em uso de rótulo
 * e, se a forma do pacote foi o que casou, ela como complemento ("outra forma"). Os que só a forma nova achou (o pacote
 * não a conhece) entram depois dos do pacote, com o complemento da forma antiga.
 */
async function comFormasEmUso(c: Contexto, doPacote: Sugestao[], achadosPelaForma: readonly { ref: string; rotulo: string }[], formas: ReadonlyMap<string, string>): Promise<Sugestao[]> {
  const novos = achadosPelaForma.filter((a) => !doPacote.some((v) => v.ref === a.ref))
  const antigas = new Map<string, string>()
  if (novos.length > 0) {
    const linhas = await executar<L>(`SELECT id, pt, de FROM main.glossary_entry WHERE id IN ${EM_IDS}`, { $ids: lista(novos.map((n) => n.ref)) })
    for (const l of linhas) antigas.set(s(l.id)!, texto(l.pt) ?? texto(l.de) ?? '')
  }
  const palavras = palavrasDaConsulta(c.digitado, c.tabela)
  const refaz = (v: Pick<Sugestao, 'ref' | 'complemento'>, antiga: string | null): Sugestao => {
    const rotulo = formas.get(v.ref)!
    return montar(c, {
      categoria: 'verbetes',
      alvoTipo: 'verbete',
      ref: v.ref,
      rotulo,
      id: v.ref,
      // A forma de antes só aparece quando foi ela que casou (o rótulo, então, não tem o que foi digitado).
      complemento: antiga && !casa(palavras, rotulo, c.tabela) ? antiga : v.complemento,
      destino: `/verbete/${encodeURIComponent(v.ref)}`,
    })
  }
  const atualizados = doPacote.map((v) => (formas.has(v.ref) && !v.skc ? refaz(v, v.rotulo) : v))
  return [...atualizados, ...novos.filter((n) => formas.has(n.ref)).map((n) => refaz({ ref: n.ref, complemento: null }, antigas.get(n.ref) || null))]
}

/** Os do pacote primeiro; os do usuário reservam um lugar (se há) em vez de serem empurrados para fora. */
function juntar(pacote: Sugestao[], usuario: Sugestao[], limite: number): Sugestao[] {
  const reservado = Math.min(usuario.length, 1)
  const doPacote = pacote.slice(0, Math.max(0, limite - reservado))
  return [...doPacote, ...usuario.slice(0, limite - doPacote.length)]
}

// ---------------------------------------------------------------------------
// sugerir
// ---------------------------------------------------------------------------

export async function sugerir(digitado: string, opcoes: OpcoesDeSugestao = {}): Promise<Sugestoes> {
  try {
    const tabela = opcoes.tabela ?? (await tabelaDoPacote())
    const palavras = palavrasDaConsulta(digitado, tabela)
    const consulta = montarConsulta(digitado, tabela)
    if (consulta === null || palavras.join('').length < MINIMO_DE_CARACTERES) return semSugestoes()
    const estado = await garantirIndiceDoUsuario(tabela)
    const c: Contexto = { digitado, tabela, limite: Math.max(1, opcoes.limitePorCategoria ?? LIMITE_PADRAO_POR_CATEGORIA), estado, livro: await sitiosDoPacote().catch((): SitiosDoPacote | null => null), redirecionamentos: await redirecionamentosOuNenhum() }
    // "SKC 12", "IPIAO I: 60"…: só o(s) objeto(s) da referência, como na busca (`objetosDaReferencia`).
    const exatos = await objetosDaReferencia(digitado, await publicacoesAbertas(), estado)
    if (exatos) {
      const skc = objetosComNumero(estado)
      const doPacote = await objetosDoPacote(c, exatos.filter((nr) => !skc.has(nr)))
      const objetos = exatos.flatMap((nr) => {
        const r = skc.get(nr)
        return r ? [objetoSkc(c, estado, r, nr)] : doPacote.filter((x) => x.ref === nr)
      })
      return { ...semSugestoes(), objetos: objetos.slice(0, c.limite) }
    }
    const [ve, pacoteObjetos, pacoteSitios, usuario] = await Promise.all([
      verbetesEObras(c, consulta),
      objetos(c, consulta),
      sitios(c, palavras),
      doUsuario(c, consulta, estado),
    ])
    return {
      verbetes: juntar(await comFormasEmUso(c, ve.verbetes, usuario.verbetesDoLivro, formasEmUso(estado)), usuario.verbetes, c.limite),
      objetos: juntar(pacoteObjetos, usuario.objetos, c.limite),
      sitios: juntar(pacoteSitios, usuario.sitios, c.limite),
      obras: ve.obras,
      colecoes: usuario.colecoes.slice(0, c.limite),
    }
  } catch (erro) {
    // Sem pacote aberto, banco ocupado ou índice em refazimento: sem sugestões; a busca em si continua.
    if (import.meta.env.DEV) console.warn('sugerir: falhou, sem sugestões', erro)
    return semSugestoes()
  }
}
