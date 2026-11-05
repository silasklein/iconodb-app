/**
 * As exportações (Tarefa 15): a cópia de segurança, as regiões em W3C Web Annotation e as hipóteses SKC para o MEDIATION.
 * Puro: só os montadores de src/usuario/exportar.ts, sobre eventos e estados inventados (nenhum texto dos livros).
 */
import { A, B, C, embaralhar, ev, gerador, hlc, T0 } from '../../tests/suporte/eventosDeTeste'
import type { Evento } from './eventos'
import { consolidar, estadoCanonico, fundir } from './fusao'
import {
  FORMATO_DA_COPIA,
  FORMATO_DO_MEDIATION,
  montarCopia,
  montarHipoteses,
  montarRegioes,
  nomeDoArquivo,
  resumoDaCopia,
  resumoDasHipoteses,
  resumoDasRegioes,
  type EntradaDasRegioes,
  type Instantaneo,
  type RegiaoDoLivro,
} from './exportar'

const AGORA = new Date(2026, 10, 3, 14, 7, 9)

function instantaneo(eventos: { evento: Evento; enviado: boolean }[], extra: Partial<Instantaneo> = {}): Instantaneo {
  return {
    aparelho: { id: A, nome: 'Mac' },
    nomes: { [B]: 'iPhone' },
    eventos,
    base: null,
    lidos: {},
    seqLocal: 0,
    confirmados: {},
    ...extra,
  }
}

const enviado = (e: Evento) => ({ evento: e, enviado: true })
const local = (e: Evento) => ({ evento: e, enviado: false })

describe('cópia de segurança (JSON)', () => {
  const e1 = ev({ ap: A, seq: 1, reg: 'NT-aaaaaaaa-1', op: 'criar', tipo: 'nota', campos: { texto: 'primeira' } })
  const e2 = ev({ ap: A, seq: 2, reg: 'NT-aaaaaaaa-1', op: 'alterar', tipo: 'nota', campos: { texto: 'segunda' } })
  const e3 = ev({ ap: B, seq: 1, reg: 'CO-bbbbbbbb-1', op: 'criar', tipo: 'colecao', campos: { nome: 'Coleção inventada' } })
  const e4 = ev({ ap: B, seq: 2, reg: 'NT-aaaaaaaa-1', op: 'alterar', tipo: 'nota', campos: { texto: 'do iPhone' }, ms: T0 + 500 })

  it('tem o formato, a versão, a data, o aparelho, os nomes e todos os eventos (enviados e por enviar, de todos os aparelhos)', () => {
    const c = montarCopia(instantaneo([enviado(e1), local(e2), enviado(e3), enviado(e4)], { seqLocal: 2 }), AGORA)
    expect(Object.keys(c)).toEqual(['formato', 'versao', 'geradoEm', 'aparelho', 'aparelhos', 'eventos', 'naoEnviados', 'base', 'estado', 'marcas', 'numerosConfirmados', 'imagens', 'observacoes'])
    expect(c.formato).toBe(FORMATO_DA_COPIA)
    expect(c.formato).toBe('iconodb-copia')
    expect(c.versao).toBe(1)
    expect(c.geradoEm).toBe(AGORA.toISOString())
    expect(c.aparelho).toEqual({ id: A, nome: 'Mac' })
    expect(c.aparelhos).toEqual({ [A]: 'Mac', [B]: 'iPhone' })
    expect(c.eventos.map((e) => e.id)).toEqual([e1.id, e2.id, e3.id, e4.id])
    expect(c.naoEnviados).toEqual([e2.id])
    // Os eventos saem só com as 8 chaves do contrato.
    for (const e of c.eventos) expect(Object.keys(e)).toEqual(['v', 'id', 'hlc', 'aparelho', 'tipo', 'reg', 'op', 'campos'])
  })

  it('os eventos saem em ordem de (aparelho, seq, n), qualquer que seja a ordem lida', () => {
    const e5 = ev({ ap: A, seq: 10, n: 1 })
    const e6 = ev({ ap: A, seq: 10, n: 0 })
    const c = montarCopia(instantaneo([enviado(e4), enviado(e5), local(e2), enviado(e3), enviado(e6), enviado(e1)]), AGORA)
    expect(c.eventos.map((e) => e.id)).toEqual([e1.id, e2.id, e6.id, e5.id, e3.id, e4.id])
  })

  it('as marcas: o maior seq de cada aparelho (dos eventos, do que já foi lido e do contador local) e o segmento lido', () => {
    const c = montarCopia(
      instantaneo([enviado(e1), local(e2), enviado(e3)], {
        seqLocal: 7,
        lidos: { [B]: { marca: 3, ate: 9, alem: {} }, [C]: { marca: 1, ate: 4, alem: { '3': 12 } } },
      }),
      AGORA,
    )
    expect(c.marcas).toEqual({
      [A]: { seq: 7, segmento: 0 },
      [B]: { seq: 9, segmento: 3 },
      [C]: { seq: 12, segmento: 1 },
    })
  })

  it('o estado é a fusão do arquivo: os eventos (em qualquer ordem, com repetições) sobre a base reproduzem exatamente o estado', () => {
    // A base cobre eventos já podados deste aparelho (e5, e6 não estão mais no diário local).
    const e5 = ev({ ap: A, seq: 1, reg: 'HY-aaaaaaaa-1', tipo: 'hipotese', op: 'criar', campos: { nivel: 'iconographic' }, ms: T0 - 10_000 })
    const e6 = ev({ ap: A, seq: 2, reg: 'HY-aaaaaaaa-1', tipo: 'hipotese', op: 'excluir', ms: T0 - 9_000 })
    const base = consolidar(fundir([e5, e6]))
    const eventos = [enviado(ev({ ap: A, seq: 3, reg: 'NT-aaaaaaaa-1', op: 'criar', campos: { texto: 'primeira' } })), local(ev({ ap: A, seq: 4, reg: 'NT-aaaaaaaa-1', campos: { texto: 'x' } })), enviado(e3), enviado(e4)]
    const c = montarCopia(instantaneo(eventos, { base }), AGORA)
    const esperado = estadoCanonico(fundir([], c.estado))
    expect(estadoCanonico(fundir(c.eventos, c.base ?? undefined))).toBe(esperado)
    // E o estado do arquivo é o mesmo da memória (o de fundir tudo).
    expect(esperado).toBe(estadoCanonico(fundir(eventos.map((x) => x.evento), base)))
    // O arquivo é JSON: depois de escrito e lido, continua igual.
    const lido = JSON.parse(JSON.stringify(c)) as typeof c
    const aleatorio = gerador(15)
    for (let i = 0; i < 30; i++) {
      const repetidos = embaralhar([...lido.eventos, ...lido.eventos.slice(0, i % lido.eventos.length)], aleatorio)
      expect(estadoCanonico(fundir(repetidos, lido.base ?? undefined))).toBe(esperado)
    }
    // A base sozinha, mais o estado do arquivo: a fusão é idempotente (o estado já contém a base).
    expect(estadoCanonico(fundir(lido.eventos, [lido.base!, lido.estado]))).toBe(esperado)
  })

  it('o histórico vai junto: a versão perdedora de um campo continua no estado do arquivo', () => {
    const c = montarCopia(instantaneo([enviado(e1), local(e2), enviado(e4)]), AGORA)
    const nota = c.estado.registros.find((r) => r.id === 'NT-aaaaaaaa-1')!
    expect(nota.campos.texto!.map((x) => x.valor)).toEqual(['do iPhone', 'primeira', 'segunda'])
  })

  it('camada vazia: o arquivo é válido e vazio', () => {
    const c = montarCopia(instantaneo([], { nomes: {} }), AGORA)
    expect(c.eventos).toEqual([])
    expect(c.naoEnviados).toEqual([])
    expect(c.base).toBeNull()
    expect(c.estado).toEqual({ v: 1, registros: [] })
    expect(c.imagens).toEqual([])
    expect(c.aparelhos).toEqual({ [A]: 'Mac' })
    expect(estadoCanonico(fundir(c.eventos))).toBe(estadoCanonico(fundir([], c.estado)))
    expect(resumoDaCopia(instantaneo([], { nomes: {} }))).toMatchObject({ eventos: 0, aparelhos: 0, imagens: 0, vazia: true })
  })

  it('as imagens do usuário não vão dentro: cada IM-… com os caminhos no Dropbox (também as excluídas, que continuam lá)', () => {
    const img = ev({ ap: A, seq: 1, tipo: 'imagem', reg: 'IM-aaaaaaaa-1', op: 'criar', campos: { alvo: 'CA00001', alvoTipo: 'objeto', formato: 'webp', extensao: 'heic', tipo: 'tons' } })
    const img2 = ev({ ap: B, seq: 1, tipo: 'imagem', reg: 'IM-bbbbbbbb-1', op: 'criar', campos: { alvo: 'OB-bbbbbbbb-1', alvoTipo: 'objeto', formato: 'jpeg', extensao: 'jpg', tipo: 'traco' } })
    const fora = ev({ ap: B, seq: 2, tipo: 'imagem', reg: 'IM-bbbbbbbb-1', op: 'excluir' })
    const c = montarCopia(instantaneo([enviado(img), enviado(img2), enviado(fora)]), AGORA)
    expect(c.imagens).toEqual([
      {
        id: 'IM-aaaaaaaa-1',
        alvo: 'CA00001',
        excluida: false,
        enviada: true,
        arquivos: ['usuario/imagens/IM-aaaaaaaa-1/tela.webp', 'usuario/imagens/IM-aaaaaaaa-1/miniatura.webp', 'usuario/imagens/IM-aaaaaaaa-1/original.heic'],
      },
      {
        id: 'IM-bbbbbbbb-1',
        alvo: 'OB-bbbbbbbb-1',
        excluida: true,
        enviada: true,
        arquivos: ['usuario/imagens/IM-bbbbbbbb-1/tela.jpg', 'usuario/imagens/IM-bbbbbbbb-1/miniatura.jpg', 'usuario/imagens/IM-bbbbbbbb-1/original.jpg'],
      },
    ])
    expect(c.observacoes.join(' ')).toContain('usuario/imagens/')
    expect(resumoDaCopia(instantaneo([enviado(img), enviado(img2), enviado(fora)]))).toMatchObject({ eventos: 3, aparelhos: 2, imagens: 2, soNoAparelho: 0, vazia: false })
  })

  it('uma imagem ainda na fila deste aparelho (OPFS) sai com enviada: false, e o resumo conta as que só estão aqui', () => {
    const img = ev({ ap: A, seq: 1, tipo: 'imagem', reg: 'IM-aaaaaaaa-1', op: 'criar', campos: { alvo: 'CA00001', alvoTipo: 'objeto', formato: 'webp', extensao: 'jpg', tipo: 'tons' } })
    const img2 = ev({ ap: A, seq: 2, tipo: 'imagem', reg: 'IM-aaaaaaaa-2', op: 'criar', campos: { alvo: 'CA00002', alvoTipo: 'objeto', formato: 'webp', extensao: 'jpg', tipo: 'tons' } })
    const i = instantaneo([enviado(img), local(img2)])
    const naFila = new Set(['IM-aaaaaaaa-2', 'IM-nao-existe-9'])
    const c = montarCopia(i, AGORA, naFila)
    expect(c.imagens.map((x) => [x.id, x.enviada])).toEqual([
      ['IM-aaaaaaaa-1', true],
      ['IM-aaaaaaaa-2', false],
    ])
    expect(c.observacoes.join(' ')).toMatch(/enviada false/)
    expect(resumoDaCopia(i, undefined, naFila)).toMatchObject({ imagens: 2, soNoAparelho: 1 })
  })

  it('o resumo conta os eventos, os aparelhos DOS EVENTOS («N eventos de M aparelhos»; não os que só estão na base) e os por enviar', () => {
    const base = consolidar(fundir([ev({ ap: C, seq: 1, reg: 'NT-cccccccc-1' })]))
    const i = instantaneo([enviado(e1), local(e2), enviado(e3)], { base })
    expect(resumoDaCopia(i)).toEqual({ eventos: 3, aparelhos: 2, porEnviar: 1, imagens: 0, soNoAparelho: 0, registros: 3, vazia: false })
    // O estado já fundido pode vir de quem chama (a tela não funde duas vezes): o mesmo resultado.
    expect(resumoDaCopia(i, fundir([e1, e2, e3], base))).toEqual(resumoDaCopia(i))
  })

  it('os números confirmados vão junto (o mapa que confirma os números SKC)', () => {
    const c = montarCopia(instantaneo([], { confirmados: { 'OB-aaaaaaaa-1': 'CA00005', 'SKC:OB-aaaaaaaa-1': '1' } }), AGORA)
    expect(c.numerosConfirmados).toEqual({ 'OB-aaaaaaaa-1': 'CA00005', 'SKC:OB-aaaaaaaa-1': '1' })
  })
})

describe('nomes dos arquivos (hora local)', () => {
  it('copia, regiões e hipóteses, com AAAA-MM-DD-HHMM', () => {
    expect(nomeDoArquivo('copia', AGORA)).toBe('iconodb-copia-2026-11-03-1407.json')
    expect(nomeDoArquivo('regioes', AGORA)).toBe('iconodb-regioes-2026-11-03-1407.jsonld')
    expect(nomeDoArquivo('hipoteses', AGORA)).toBe('iconodb-hipoteses-mediation-2026-11-03-1407.json')
    expect(nomeDoArquivo('copia', new Date(2027, 0, 5, 3, 4))).toBe('iconodb-copia-2027-01-05-0304.json')
  })
})

// ---------------------------------------------------------------------------------------------------------------- W3C

const CONTEXTO = 'http://www.w3.org/ns/anno.jsonld'
const IRI = /^[a-z][a-z0-9+.-]*:[^\s<>"{}|\\^`]+$/i
const FORMAS = new Set(['polygon', 'polyline', 'rect', 'circle', 'ellipse', 'line', 'path'])
const AGENTES = new Set(['Person', 'Organization', 'Software'])
/** Um agente (ou uma lista) do modelo: com type Person, Organization ou Software, e um nome. */
const agentes = (x: unknown) => (Array.isArray(x) ? x : [x]).every((g) => g && typeof g === 'object' && AGENTES.has((g as { type?: string }).type ?? '') && typeof (g as { name?: unknown }).name === 'string')
const PROPOSITOS = new Set(['assessing', 'bookmarking', 'classifying', 'commenting', 'describing', 'editing', 'highlighting', 'identifying', 'linking', 'moderating', 'questioning', 'replying', 'tagging'])

/**
 * Um validador estrutural do Web Annotation Data Model (sem rede): os MUST que este arquivo usa. Devolve a lista de
 * problemas (vazia = válido).
 */
function validarAnotacoes(doc: unknown): string[] {
  const p: string[] = []
  const o = doc as Record<string, unknown>
  if (typeof o !== 'object' || o === null) return ['não é objeto']
  if (Object.keys(o)[0] !== '@context') p.push('@context não é a primeira chave')
  const ctx = o['@context']
  if (ctx !== CONTEXTO && !(Array.isArray(ctx) && ctx[0] === CONTEXTO)) p.push('@context errado')
  if (o.type !== 'AnnotationCollection') p.push('type da coleção')
  if (typeof o.id !== 'string' || !IRI.test(o.id)) p.push('id da coleção não é IRI')
  const pagina = o.first as Record<string, unknown> | undefined
  const itens = (pagina?.items ?? []) as Record<string, unknown>[]
  if (o.total !== itens.length) p.push(`total ${String(o.total)} ≠ ${itens.length}`)
  if (itens.length > 0) {
    if (pagina?.type !== 'AnnotationPage') p.push('type da página')
    if (typeof pagina?.id !== 'string' || !IRI.test(pagina.id)) p.push('id da página')
    if (pagina?.startIndex !== 0) p.push('startIndex')
    if (pagina?.partOf !== o.id) p.push('a página não diz de que coleção é (partOf)')
  } else if (pagina !== undefined) p.push('página sem itens')
  const ids = new Set<string>()
  itens.forEach((a, i) => {
    const onde = `anotação ${i}`
    if (typeof a.id !== 'string' || !IRI.test(a.id)) p.push(`${onde}: id não é IRI`)
    else if (ids.has(a.id)) p.push(`${onde}: id repetido`)
    else ids.add(a.id)
    if (a.type !== 'Annotation') p.push(`${onde}: type`)
    if (!a.creator) p.push(`${onde}: sem creator`)
    else if (!agentes(a.creator)) p.push(`${onde}: creator sem type de agente`)
    if (typeof a.motivation !== 'string' || !PROPOSITOS.has(a.motivation)) p.push(`${onde}: motivation`)
    const alvo = a.target as Record<string, unknown> | undefined
    if (!alvo) p.push(`${onde}: sem target`)
    else {
      if (alvo.type !== 'SpecificResource') p.push(`${onde}: target não é SpecificResource`)
      if (typeof alvo.source !== 'string' || !IRI.test(alvo.source)) p.push(`${onde}: source não é IRI`)
      const sel = alvo.selector as Record<string, unknown> | undefined
      if (sel?.type !== 'SvgSelector') p.push(`${onde}: selector não é SvgSelector`)
      else if (typeof sel.value !== 'string') p.push(`${onde}: SvgSelector sem value`)
      else {
        const svg = new DOMParser().parseFromString(sel.value, 'image/svg+xml')
        if (svg.getElementsByTagName('parsererror').length > 0) p.push(`${onde}: SVG não é XML válido`)
        else {
          const raiz = svg.documentElement
          if (raiz.localName !== 'svg' || raiz.namespaceURI !== 'http://www.w3.org/2000/svg') p.push(`${onde}: a raiz não é <svg>`)
          const formas = [...raiz.getElementsByTagName('*')].filter((el) => FORMAS.has(el.localName))
          if (formas.length !== 1) p.push(`${onde}: ${formas.length} formas no SVG`)
        }
      }
    }
    const corpos = (Array.isArray(a.body) ? a.body : a.body === undefined ? [] : [a.body]) as Record<string, unknown>[]
    for (const b of corpos) {
      if (b.type === 'TextualBody') {
        if (typeof b.value !== 'string') p.push(`${onde}: TextualBody sem value`)
      } else if (b.type === 'SpecificResource') {
        if (typeof b.source !== 'string' || !IRI.test(b.source)) p.push(`${onde}: body.source não é IRI`)
      } else p.push(`${onde}: body de tipo ${String(b.type)}`)
      if (b.purpose !== undefined && !PROPOSITOS.has(b.purpose as string)) p.push(`${onde}: purpose ${String(b.purpose)}`)
      if (b.creator !== undefined && !agentes(b.creator)) p.push(`${onde}: creator de um corpo sem type de agente`)
    }
  })
  return p
}

const regiaoUsuario = (seq: number, reg: string, campos: Record<string, unknown>, ap = A) =>
  ev({ ap, seq, tipo: 'regiao', reg, op: 'criar', campos: { imagem: 'IMG-TESTE-0003-1', objeto: 'CA00003', elementoId: null, pai: null, ...campos } as never })

const hipoteseSobre = (seq: number, reg: string, elemento: string, termos: string[]) =>
  ev({ ap: A, seq, tipo: 'hipotese', reg, op: 'criar', campos: { objeto: 'CA00003', sobre: 'elemento', elemento, termos, termosRotulos: termos.map(() => 'x') } })

const DO_LIVRO: RegiaoDoLivro = {
  sigla: 'TESTE',
  elementoId: 'EL-900001',
  rotulo: 'figura denteada',
  rotuloDe: 'Zackenfigur',
  imagem: 'IMG-TESTE-0003-1',
  seletor: '<polygon points="0.30,0.25 0.70,0.25 0.62,0.75 0.38,0.75"/>',
}

const AUTORES = [
  { type: 'Person', name: 'Autora, Fulana Teste' },
  { type: 'Person', name: 'Autor, Beltrano Teste' },
]
const USUARIO = { id: 'urn:iconodb:usuario', type: 'Person', name: 'SKC' }

function entrada(eventos: Evento[], extra: Partial<EntradaDasRegioes> = {}): EntradaDasRegioes {
  return {
    estado: fundir(eventos),
    doLivro: [DO_LIVRO],
    tamanhos: new Map([['IMG-TESTE-0003-1', { largura: 1200, altura: 900 }]]),
    termosDosElementos: new Map([['EL-900001', ['GL-900002']]]),
    elementos: new Map([['EL-900001', { sigla: 'TESTE', rotulo: 'figura denteada', rotuloDe: 'Zackenfigur' }]]),
    publicacoes: new Map([['TESTE', { obra: 'TESTE I', autores: ['Autora, Fulana Teste', 'Autor, Beltrano Teste'], lingua: 'de' }]]),
    geradoEm: AGORA,
    ...extra,
  }
}

type Corpo = { type: string; value?: string; source?: string; language?: string; creator?: unknown }
const corpos = (a: { body: unknown }) => a.body as Corpo[]
/** Os verbetes do corpo, cada um com quem o afirma ('livro' | 'usuario' | 'herdado'). */
const verbetes = (a: { body: unknown }) =>
  corpos(a)
    .filter((b) => b.type === 'SpecificResource')
    .map((b) => [b.source, b.creator === undefined ? 'herdado' : JSON.stringify(b.creator) === JSON.stringify(USUARIO) ? 'usuario' : JSON.stringify(b.creator) === JSON.stringify(AUTORES) ? 'livro' : JSON.stringify(b.creator)])

describe('regiões (W3C Web Annotation, JSON-LD)', () => {
  it('o validador recusa o que não é Web Annotation (prova de que ele olha)', () => {
    expect(validarAnotacoes({ type: 'AnnotationCollection' })).not.toEqual([])
    const bom = montarRegioes(entrada([regiaoUsuario(1, 'RG-aaaaaaaa-1', { elemento: 'leão', seletor: '<polygon points="0,0 1,0 1,1"/>' })]))
    expect(validarAnotacoes(bom)).toEqual([])
    const ruim = JSON.parse(JSON.stringify(bom)) as { first: { partOf?: string; items: { creator: unknown; body: Corpo[]; target: { selector: { value: string } } }[] } }
    ruim.first.items[0]!.target.selector.value = '<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 1,1 0,1"/><rect width="1" height="1"/></svg>'
    expect(validarAnotacoes(ruim)).toEqual(['anotação 0: 2 formas no SVG'])
    ruim.first.items[0]!.target.selector.value = '<svg><polygon points="0,0"'
    expect(validarAnotacoes(ruim)).toEqual(['anotação 0: SVG não é XML válido'])
    const semParte = JSON.parse(JSON.stringify(bom)) as typeof ruim
    delete semParte.first.partOf
    expect(validarAnotacoes(semParte)).toEqual(['a página não diz de que coleção é (partOf)'])
    const agenteRuim = JSON.parse(JSON.stringify(bom)) as typeof ruim
    agenteRuim.first.items[0]!.creator = { id: 'urn:iconodb:publicacao:TESTE', name: 'TESTE' }
    agenteRuim.first.items[0]!.body[0]!.creator = { name: 'x' }
    expect(validarAnotacoes(agenteRuim)).toEqual(['anotação 0: creator sem type de agente', 'anotação 0: creator de um corpo sem type de agente'])
  })

  it('uma coleção com o contexto primeiro, a página ligada a ela (partOf), as regiões do usuário e as do livro, cada uma com quem a fez', () => {
    const doc = montarRegioes(entrada([regiaoUsuario(1, 'RG-aaaaaaaa-1', { elemento: 'leão inventado', seletor: '<polygon points="0.1,0.2 0.5,0.2 0.3,0.6"/>' })]))
    expect(validarAnotacoes(doc)).toEqual([])
    expect(Object.keys(doc)[0]).toBe('@context')
    expect(doc['@context']).toBe(CONTEXTO)
    expect(doc.total).toBe(2)
    expect(doc.first!.partOf).toBe(doc.id)
    const [usuario, livro] = doc.first!.items
    expect(usuario!.id).toBe('urn:iconodb:regiao:RG-aaaaaaaa-1')
    expect(usuario!.creator).toEqual(USUARIO)
    // O id da região do livro é o par (elemento, imagem), único e estável entre versões do núcleo.
    expect(livro!.id).toBe('urn:iconodb:regiao-do-livro:EL-900001:IMG-TESTE-0003-1')
    expect(livro!.creator).toEqual(AUTORES)
    // O alvo: a imagem por um IRI estável e o polígono em pixels (o pacote sabe o tamanho: 1200 × 900).
    expect(usuario!.target).toEqual({
      type: 'SpecificResource',
      source: 'urn:iconodb:imagem:IMG-TESTE-0003-1',
      selector: { type: 'SvgSelector', value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900"><polygon points="120,180 600,180 360,540"/></svg>' },
    })
    expect(livro!.target.selector.value).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900"><polygon points="360,225 840,225 744,675 456,675"/></svg>')
    // O corpo: o rótulo (do livro: em português e na língua da obra) e os verbetes ligados, "identifying".
    expect(usuario!.body).toEqual([{ type: 'TextualBody', value: 'leão inventado', format: 'text/plain', language: 'pt', purpose: 'tagging', creator: USUARIO }])
    expect(livro!.body).toEqual([
      { type: 'TextualBody', value: 'figura denteada', format: 'text/plain', language: 'pt', purpose: 'tagging' },
      { type: 'TextualBody', value: 'Zackenfigur', format: 'text/plain', language: 'de', purpose: 'tagging' },
      { type: 'SpecificResource', source: 'urn:iconodb:verbete:GL-900002', purpose: 'identifying' },
    ])
    expect(usuario!.motivation).toBe('tagging')
    expect(usuario!.created).toBe(new Date(T0 + 1000).toISOString())
  })

  it('a língua do rótulo original é a da obra (publication.language); desconhecida, o corpo vai sem language', () => {
    const fr = montarRegioes(entrada([], { publicacoes: new Map([['TESTE', { obra: 'TESTE I', autores: ['Autora, Fulana Teste'], lingua: 'fr' }]]) }))
    expect(corpos(fr.first!.items[0]!)[1]).toMatchObject({ value: 'Zackenfigur', language: 'fr' })
    const sem = montarRegioes(entrada([], { publicacoes: new Map([['TESTE', { obra: 'TESTE I', autores: ['Autora, Fulana Teste'], lingua: null }]]) }))
    expect(validarAnotacoes(sem)).toEqual([])
    expect(corpos(sem.first!.items[0]!)[1]).toEqual({ type: 'TextualBody', value: 'Zackenfigur', format: 'text/plain', purpose: 'tagging' })
  })

  describe('as suas imagens (IM-…): em pixels, pelo tamanho guardado no registro da imagem', () => {
    const imagem = (campos: Record<string, unknown>) =>
      ev({ ap: A, seq: 1, tipo: 'imagem', reg: 'IM-aaaaaaaa-1', op: 'criar', campos: { alvo: 'OB-aaaaaaaa-1', alvoTipo: 'objeto', formato: 'webp', extensao: 'jpg', tipo: 'tons', ...campos } as never })
    const regiao = regiaoUsuario(2, 'RG-aaaaaaaa-1', { imagem: 'IM-aaaaaaaa-1', objeto: 'OB-aaaaaaaa-1', elemento: 'x', seletor: '<polygon points="0.1235,0 1,0.5 0,1"/>' })

    it('o original (já orientado) de 4000 × 3000: viewBox 0 0 4000 3000 e os pontos em pixels', () => {
      const doc = montarRegioes(entrada([imagem({ largura: 1600, altura: 1200, originalLargura: 4000, originalAltura: 3000 }), regiao], { doLivro: [] }))
      expect(validarAnotacoes(doc)).toEqual([])
      expect(doc.first!.items[0]!.target).toEqual({
        type: 'SpecificResource',
        source: 'urn:iconodb:imagem:IM-aaaaaaaa-1',
        selector: { type: 'SvgSelector', value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4000 3000"><polygon points="494,0 4000,1500 0,3000"/></svg>' },
      })
    })

    it('sem o tamanho do original: o da versão de tela (o mesmo quadro, reduzido)', () => {
      const doc = montarRegioes(entrada([imagem({ largura: 1600, altura: 1200, originalLargura: null, originalAltura: null }), regiao], { doLivro: [] }))
      expect(doc.first!.items[0]!.target.selector.value).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1200"><polygon points="197.6,0 1600,600 0,1200"/></svg>')
    })

    it('T17-C-11: o original com a orientação trocada (3000 × 4000 contra a tela 1600 × 1200) não deforma: cai no tamanho da tela', () => {
      const doc = montarRegioes(entrada([imagem({ largura: 1600, altura: 1200, originalLargura: 3000, originalAltura: 4000 }), regiao], { doLivro: [] }))
      expect(doc.first!.items[0]!.target.selector.value).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1200"><polygon points="197.6,0 1600,600 0,1200"/></svg>')
    })

    it('T17-C-11: a proporção só difere por arredondamento (até 2 %): o original continua valendo', () => {
      // 4000 × 3001 contra 1600 × 1200: 0,03 % de diferença
      const doc = montarRegioes(entrada([imagem({ largura: 1600, altura: 1200, originalLargura: 4000, originalAltura: 3001 }), regiao], { doLivro: [] }))
      expect(doc.first!.items[0]!.target.selector.value).toContain('viewBox="0 0 4000 3001"')
    })

    it('nenhum tamanho conhecido (a imagem de outro aparelho ainda não chegou): viewBox 0 0 1 1 e os pontos relativos, como guardados', () => {
      const doc = montarRegioes(entrada([regiao], { doLivro: [] }))
      expect(validarAnotacoes(doc)).toEqual([])
      expect(doc.first!.items[0]!.target.selector.value).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><polygon points="0.1235,0 1,0.5 0,1"/></svg>')
    })
  })

  describe('quem afirma cada coisa (decisão 46): o livro e o usuário nunca se misturam', () => {
    // Sobre o elemento do livro EL-900001: o livro o identifica com GL-900002; o usuário, numa hipótese SKC, com GL-900009.
    const skcNoElementoDoLivro = hipoteseSobre(3, 'HY-aaaaaaaa-2', 'EL-900001', ['GL-900009'])

    it('a anotação da região do livro leva só o rótulo e os termos do livro, creditados aos autores; nunca um termo SKC', () => {
      const doc = montarRegioes(entrada([skcNoElementoDoLivro]))
      expect(validarAnotacoes(doc)).toEqual([])
      const livro = doc.first!.items.find((a) => a.id.startsWith('urn:iconodb:regiao-do-livro:'))!
      expect(livro.creator).toEqual(AUTORES)
      expect(verbetes(livro)).toEqual([['urn:iconodb:verbete:GL-900002', 'herdado']])
      expect(JSON.stringify(livro)).not.toContain('GL-900009')
      expect(JSON.stringify(livro)).not.toContain('urn:iconodb:usuario')
    })

    it('uma região que você desenhou sobre um elemento do livro: o polígono é seu; o rótulo e os termos do livro são dos autores; os seus termos, seus', () => {
      const maisUma = regiaoUsuario(6, 'RG-aaaaaaaa-2', { elemento: 'figura denteada', elementoId: 'EL-900001', imagem: 'IMG-TESTE-0003-2', seletor: '<polygon points="0,0 1,0 1,1"/>' })
      const doc = montarRegioes(entrada([skcNoElementoDoLivro, maisUma]))
      expect(validarAnotacoes(doc)).toEqual([])
      const sua = doc.first!.items.find((a) => a.id === 'urn:iconodb:regiao:RG-aaaaaaaa-2')!
      expect(sua.creator).toEqual(USUARIO)
      expect(sua.body).toEqual([
        { type: 'TextualBody', value: 'figura denteada', format: 'text/plain', language: 'pt', purpose: 'tagging', creator: AUTORES },
        { type: 'TextualBody', value: 'Zackenfigur', format: 'text/plain', language: 'de', purpose: 'tagging', creator: AUTORES },
        { type: 'SpecificResource', source: 'urn:iconodb:verbete:GL-900002', purpose: 'identifying', creator: AUTORES },
        { type: 'SpecificResource', source: 'urn:iconodb:verbete:GL-900009', purpose: 'identifying', creator: USUARIO },
      ])
      // Outra imagem do livro, sem tamanho conhecido: relativa.
      expect(sua.target.selector.value).toContain('viewBox="0 0 1 1"')
    })

    it('m3 (Tarefa 16): o termo SKC que o pacote publicou sai como o verbete do livro (uma vez só), ainda creditado ao usuário', () => {
      const maisUma = regiaoUsuario(6, 'RG-aaaaaaaa-2', { elemento: 'figura denteada', elementoId: 'EL-900001', imagem: 'IMG-TESTE-0003-2', seletor: '<polygon points="0,0 1,0 1,1"/>' })
      const publicado = hipoteseSobre(4, 'HY-aaaaaaaa-3', 'EL-900001', ['GL-aaaaaaaa-1', 'GL-900009'])
      const doc = montarRegioes(entrada([publicado, maisUma], { redirecionamentos: new Map([['GL-aaaaaaaa-1', 'GL-900009']]) }))
      expect(validarAnotacoes(doc)).toEqual([])
      const sua = doc.first!.items.find((a) => a.id === 'urn:iconodb:regiao:RG-aaaaaaaa-2')!
      const doUsuario = sua.body.filter((b) => 'source' in b && JSON.stringify(b.creator) === JSON.stringify(USUARIO)).map((b) => (b as { source: string }).source)
      expect(doUsuario).toEqual(['urn:iconodb:verbete:GL-900009'])
      expect(JSON.stringify(doc)).not.toContain('GL-aaaaaaaa-1')
      // sem o redirecionamento, o id do usuário (o negativo)
      const sem = montarRegioes(entrada([publicado, maisUma]))
      expect(JSON.stringify(sem)).toContain('urn:iconodb:verbete:GL-aaaaaaaa-1')
    })

    it('uma região de um elemento seu (novo, ou mais uma região dele): o rótulo e os termos das suas hipóteses, todos seus; nada do livro', () => {
      const nova = regiaoUsuario(1, 'RG-aaaaaaaa-1', { elemento: 'novo', seletor: '<polygon points="0,0 1,0 1,1"/>' })
      const hip = hipoteseSobre(2, 'HY-aaaaaaaa-1', 'RG-aaaaaaaa-1', ['GL-aaaaaaaa-1', 'GL-900007'])
      const excluida = hipoteseSobre(4, 'HY-aaaaaaaa-3', 'RG-aaaaaaaa-1', ['GL-900001'])
      const fora = ev({ ap: A, seq: 5, tipo: 'hipotese', reg: 'HY-aaaaaaaa-3', op: 'excluir' })
      const maisUmaDaSua = regiaoUsuario(6, 'RG-aaaaaaaa-4', { elemento: 'novo', elementoId: 'RG-aaaaaaaa-1', seletor: '<polygon points="0,0 1,0 0,1"/>' })
      const doc = montarRegioes(entrada([nova, hip, excluida, fora, maisUmaDaSua, skcNoElementoDoLivro], { doLivro: [] }))
      expect(validarAnotacoes(doc)).toEqual([])
      for (const id of ['urn:iconodb:regiao:RG-aaaaaaaa-1', 'urn:iconodb:regiao:RG-aaaaaaaa-4']) {
        const a = doc.first!.items.find((x) => x.id === id)!
        expect(a.creator).toEqual(USUARIO)
        expect(corpos(a)[0]).toEqual({ type: 'TextualBody', value: 'novo', format: 'text/plain', language: 'pt', purpose: 'tagging', creator: USUARIO })
        expect(verbetes(a)).toEqual([
          ['urn:iconodb:verbete:GL-aaaaaaaa-1', 'usuario'],
          ['urn:iconodb:verbete:GL-900007', 'usuario'],
        ])
      }
    })

    it('sobre um elemento do livro quando o pacote não pôde ser lido: o rótulo guardado, creditado aos autores do livro (sem nome); os seus termos, seus', () => {
      const maisUma = regiaoUsuario(6, 'RG-aaaaaaaa-2', { elemento: 'figura denteada', elementoId: 'EL-900001', seletor: '<polygon points="0,0 1,0 1,1"/>' })
      const doc = montarRegioes(entrada([skcNoElementoDoLivro, maisUma], { doLivro: [], tamanhos: new Map(), termosDosElementos: new Map(), elementos: new Map(), publicacoes: new Map() }))
      expect(validarAnotacoes(doc)).toEqual([])
      const a = doc.first!.items[0]!
      expect(a.creator).toEqual(USUARIO)
      expect(a.body).toEqual([
        { type: 'TextualBody', value: 'figura denteada', format: 'text/plain', language: 'pt', purpose: 'tagging', creator: { id: 'urn:iconodb:autores-do-livro', type: 'Organization', name: 'Autores do livro' } },
        { type: 'SpecificResource', source: 'urn:iconodb:verbete:GL-900009', purpose: 'identifying', creator: USUARIO },
      ])
    })
  })

  it('regiões excluídas e sem polígono ficam de fora; a coleção vazia é válida', () => {
    const r = regiaoUsuario(1, 'RG-aaaaaaaa-1', { elemento: 'a', seletor: '<polygon points="0,0 1,0 1,1"/>' })
    const fora = ev({ ap: A, seq: 2, tipo: 'regiao', reg: 'RG-aaaaaaaa-1', op: 'excluir' })
    const semPoligono = regiaoUsuario(3, 'RG-aaaaaaaa-2', { elemento: 'b', seletor: '<polygon points="0,0 1,1"/>' })
    const doc = montarRegioes(entrada([r, fora, semPoligono], { doLivro: [] }))
    expect(validarAnotacoes(doc)).toEqual([])
    expect(doc.total).toBe(0)
    expect(doc.first).toBeUndefined()
    expect(resumoDasRegioes(entrada([r, fora, semPoligono], { doLivro: [] }))).toEqual({ suas: 0, doLivro: 0 })
    const vazia = montarRegioes(entrada([], { doLivro: [] }))
    expect(validarAnotacoes(vazia)).toEqual([])
    expect(JSON.parse(JSON.stringify(vazia))).toEqual(vazia)
  })

  it('uma região com muitos pontos e um rótulo com <, &, aspas e apóstrofo: o SVG continua válido e o rótulo volta igual', () => {
    const n = 400
    const pontos = Array.from({ length: n }, (_, i) => {
      const t = (2 * Math.PI * i) / n
      return `${Number((0.5 + 0.4 * Math.cos(t)).toFixed(4))},${Number((0.5 + 0.4 * Math.sin(t)).toFixed(4))}`
    }).join(' ')
    const rotulo = `leão <coroado> & "alado" d'ouro </svg><rect/>`
    const doc = montarRegioes(entrada([regiaoUsuario(1, 'RG-aaaaaaaa-1', { elemento: rotulo, seletor: `<polygon points="${pontos}"/>` })], { doLivro: [{ ...DO_LIVRO, rotulo: `figura <&> "x"`, rotuloDe: `Zacken & 'Figur'` }] }))
    expect(validarAnotacoes(doc)).toEqual([])
    const texto = JSON.stringify(doc)
    const lido = JSON.parse(texto) as typeof doc
    expect((lido.first!.items[0]!.body as { value: string }[])[0]!.value).toBe(rotulo)
    expect((lido.first!.items[1]!.body as { value: string }[]).map((b) => b.value).slice(0, 2)).toEqual([`figura <&> "x"`, `Zacken & 'Figur'`])
    const svg = new DOMParser().parseFromString(lido.first!.items[0]!.target.selector.value, 'image/svg+xml')
    expect(svg.querySelector('polygon')!.getAttribute('points')!.split(' ')).toHaveLength(n)
  })

  it('coordenadas fora de 0 a 1 (de outro aparelho) ficam dentro da imagem, como na tela', () => {
    const doc = montarRegioes(entrada([regiaoUsuario(1, 'RG-aaaaaaaa-1', { elemento: 'a', seletor: '<polygon points="-0.5,0 1.5,0 1,2"/>' })], { doLivro: [] }))
    expect(doc.first!.items[0]!.target.selector.value).toContain('points="0,0 1200,0 1200,900"')
  })

  it('um id de imagem ou de elemento com caracteres fora do IRI é codificado', () => {
    const doc = montarRegioes(entrada([regiaoUsuario(1, 'RG-aaaaaaaa-1', { imagem: 'IMG x<1>', elemento: 'a', seletor: '<polygon points="0,0 1,0 1,1"/>' })], { doLivro: [{ ...DO_LIVRO, elementoId: 'EL 9:1', imagem: 'IMG y' }] }))
    expect(validarAnotacoes(doc)).toEqual([])
    expect(doc.first!.items[0]!.target.source).toBe('urn:iconodb:imagem:IMG%20x%3C1%3E')
    expect(doc.first!.items[1]!.id).toBe('urn:iconodb:regiao-do-livro:EL%209%3A1:IMG%20y')
  })

  it('o livro sem autores conhecidos: quem fez são «os autores» da obra (um agente Organization), não a publicação', () => {
    const doc = montarRegioes(entrada([], { publicacoes: new Map([['TESTE', { obra: 'TESTE I', autores: [], lingua: 'de' }]]) }))
    expect(validarAnotacoes(doc)).toEqual([])
    expect(doc.first!.items[0]!.creator).toEqual({ id: 'urn:iconodb:autores:TESTE', type: 'Organization', name: 'Autores de TESTE I' })
    const semObra = montarRegioes(entrada([], { publicacoes: new Map() }))
    expect(semObra.first!.items[0]!.creator).toEqual({ id: 'urn:iconodb:autores:TESTE', type: 'Organization', name: 'Autores de TESTE' })
  })

  it('o resumo: as suas e as dos livros', () => {
    expect(resumoDasRegioes(entrada([regiaoUsuario(1, 'RG-aaaaaaaa-1', { elemento: 'a', seletor: '<polygon points="0,0 1,0 1,1"/>' })]))).toEqual({ suas: 1, doLivro: 1 })
  })
})

// ---------------------------------------------------------------------------------------------------------------- MEDIATION

describe('hipóteses SKC para o MEDIATION', () => {
  const ancora = { fonte: 'PA-TESTE-0003-cat-1', lingua: 'pt', inicio: 4, fim: 12, trecho: 'trecho x', sha: 'a'.repeat(64) }
  const hip = (seq: number, reg: string, campos: Record<string, unknown>, ap = A) =>
    ev({
      ap,
      seq,
      tipo: 'hipotese',
      reg,
      op: 'criar',
      campos: { objeto: 'CA00003', sobre: 'objeto', elemento: null, elementoRotulo: '', termos: ['GL-900002'], termosRotulos: ['figura denteada'], nivel: 'iconographic', modalidade: 'probable', justificativa: 'porque sim', ancora: null, ...campos } as never,
    })

  it('o cabeçalho: formato, esquema-alvo, versão, observações (sem posições sobre hipóteses dos livros)', () => {
    const doc = montarHipoteses(fundir([]), AGORA)
    expect(Object.keys(doc)).toEqual(['formato', 'alvoEsquema', 'versao', 'geradoEm', 'observacoes', 'hipoteses'])
    expect(doc.formato).toBe(FORMATO_DO_MEDIATION)
    expect(doc.formato).toBe('iconodb-mediation')
    expect(doc.alvoEsquema).toBe('MEDIATION v0.6')
    expect(doc.versao).toBe(1)
    expect(doc.geradoEm).toBe(AGORA.toISOString())
    expect(doc.hipoteses).toEqual([])
    expect(doc.observacoes.join(' ')).toMatch(/posições .* não são exportadas/)
    expect(doc.observacoes.join(' ')).toMatch(/provisório/)
  })

  const LOCALIZADORES = new Map([['CA00003', 'TESTE I, Nr. 3']])

  it('cada hipótese própria: alvo, identificação, nível, modalidade, autores, fonte "own_unpublished", não publicada', () => {
    const e = hip(1, 'HY-aaaaaaaa-1', { sobre: 'elemento', elemento: 'EL-900001', elementoRotulo: 'figura denteada', ancora })
    const doc = montarHipoteses(fundir([e]), AGORA, LOCALIZADORES)
    expect(doc.hipoteses).toEqual([
      {
        id: 'HY-aaaaaaaa-1',
        alvo: { tipo: 'element', id: 'EL-900001', objeto: 'CA00003', rotulo: 'figura denteada' },
        identificacao: [{ id: 'GL-900002', rotulo: 'figura denteada', termoDoUsuario: false }],
        nivel: 'iconographic',
        modalidade: 'probable',
        autores: [{ nome: 'SKC', papel: 'author' }],
        fonte: 'own_unpublished',
        publicado: false,
        localizador: 'TESTE I, Nr. 3',
        trecho: { texto: 'trecho x', fonte: 'PA-TESTE-0003-cat-1', lingua: 'pt', inicio: 4, fim: 12 },
        supersedes_id: null,
        verificacao: 'recorded',
        religiosidade: null,
        estrategias: null,
        justificativa: 'porque sim',
        criadoEm: new Date(T0 + 1000).toISOString(),
        alteradoEm: new Date(T0 + 1000).toISOString(),
      },
    ])
  })

  it('os códigos do alvo são os do pacote (hypothesis.target_type): "item" para o objeto, "element" para o elemento', () => {
    const doc = montarHipoteses(fundir([hip(1, 'HY-aaaaaaaa-1', {}), hip(2, 'HY-aaaaaaaa-2', { sobre: 'elemento', elemento: 'RG-aaaaaaaa-1', elementoRotulo: 'novo' })]), AGORA, LOCALIZADORES)
    expect(doc.hipoteses.map((h) => h.alvo)).toEqual([
      { tipo: 'item', id: 'CA00003', objeto: 'CA00003', rotulo: '' },
      { tipo: 'element', id: 'RG-aaaaaaaa-1', objeto: 'CA00003', rotulo: 'novo' },
    ])
  })

  it('o localizador é legível, como o do pacote: a obra e o número do objeto («TESTE I, Nr. 3»); de um objeto SKC, «SKC OB-…»; o trecho fica em trecho.fonte', () => {
    const doc = montarHipoteses(fundir([hip(1, 'HY-aaaaaaaa-1', { objeto: 'OB-bbbbbbbb-2' }), hip(2, 'HY-aaaaaaaa-2', { ancora })]), AGORA, LOCALIZADORES)
    expect(doc.hipoteses[0]).toMatchObject({ alvo: { tipo: 'item', id: 'OB-bbbbbbbb-2', objeto: 'OB-bbbbbbbb-2', rotulo: '' }, localizador: 'SKC OB-bbbbbbbb-2', trecho: null })
    expect(doc.hipoteses[1]).toMatchObject({ localizador: 'TESTE I, Nr. 3', trecho: { fonte: 'PA-TESTE-0003-cat-1' } })
    // Sem o pacote (não pôde ser lido): o número do objeto.
    expect(montarHipoteses(fundir([hip(1, 'HY-aaaaaaaa-1', {})]), AGORA).hipoteses[0]!.localizador).toBe('CA00003')
  })

  it('um termo criado pelo usuário (decisão 41) leva o id, a forma de agora e a original, com termoDoUsuario: true', () => {
    const verbete = ev({ ap: A, seq: 1, n: 0, tipo: 'verbete', reg: 'GL-aaaaaaaa-1', op: 'criar', campos: { forma: 'leão-de-prova', status: 'proposed' } })
    const h = hip(2, 'HY-aaaaaaaa-1', { termos: ['GL-aaaaaaaa-1', 'GL-900002'], termosRotulos: ['leão-de-prova', 'figura denteada'] })
    const renomeado = ev({ ap: A, seq: 3, tipo: 'verbete', reg: 'GL-aaaaaaaa-1', op: 'alterar', campos: { formaEmUso: 'leão de prova' } })
    const doc = montarHipoteses(fundir([verbete, h, renomeado]), AGORA)
    expect(doc.hipoteses[0]!.identificacao).toEqual([
      { id: 'GL-aaaaaaaa-1', rotulo: 'leão-de-prova', termoDoUsuario: true, forma: 'leão de prova', formaOriginal: 'leão-de-prova' },
      { id: 'GL-900002', rotulo: 'figura denteada', termoDoUsuario: false },
    ])
    // O verbete do usuário que ainda não chegou a este aparelho: a forma é o rótulo guardado.
    const semVerbete = montarHipoteses(fundir([h]), AGORA)
    expect(semVerbete.hipoteses[0]!.identificacao[0]).toEqual({ id: 'GL-aaaaaaaa-1', rotulo: 'leão-de-prova', termoDoUsuario: true, forma: 'leão-de-prova', formaOriginal: 'leão-de-prova' })
  })

  it('m3 (Tarefa 16): um termo do usuário que o pacote publicou sai com o id do livro, termoDoUsuario false e publicadoDe; o sem redirecionamento, como antes', () => {
    const verbete = ev({ ap: A, seq: 1, n: 0, tipo: 'verbete', reg: 'GL-aaaaaaaa-1', op: 'criar', campos: { forma: 'leão-de-prova', status: 'proposed' } })
    const outro = ev({ ap: A, seq: 2, n: 0, tipo: 'verbete', reg: 'GL-aaaaaaaa-2', op: 'criar', campos: { forma: 'sem redirecionamento', status: 'proposed' } })
    const h = hip(3, 'HY-aaaaaaaa-1', { termos: ['GL-aaaaaaaa-1', 'GL-aaaaaaaa-2'], termosRotulos: ['leão-de-prova', 'sem redirecionamento'] })
    const doc = montarHipoteses(fundir([verbete, outro, h]), AGORA, new Map(), new Map([['GL-aaaaaaaa-1', 'GL-002102']]))
    expect(doc.hipoteses[0]!.identificacao).toEqual([
      { id: 'GL-002102', rotulo: 'leão-de-prova', termoDoUsuario: false, publicadoDe: 'GL-aaaaaaaa-1' },
      { id: 'GL-aaaaaaaa-2', rotulo: 'sem redirecionamento', termoDoUsuario: true, forma: 'sem redirecionamento', formaOriginal: 'sem redirecionamento' },
    ])
    expect(doc.observacoes.join(' ')).toContain('publicadoDe')
  })

  it('só as próprias, vivas: excluídas ficam de fora; posições sobre hipóteses dos livros não entram; em ordem de criação', () => {
    const h1 = hip(2, 'HY-aaaaaaaa-2', {})
    const h2 = hip(1, 'HY-bbbbbbbb-1', { modalidade: 'possible' }, B)
    const h3 = hip(3, 'HY-aaaaaaaa-3', {})
    const fora = ev({ ap: A, seq: 4, tipo: 'hipotese', reg: 'HY-aaaaaaaa-3', op: 'excluir' })
    const posicao = ev({ ap: A, seq: 5, tipo: 'posicao', reg: 'HY-900001', op: 'criar', campos: { hipotese: 'HY-900001', posicao: 'discordo' } })
    const alterada = ev({ ap: A, seq: 6, tipo: 'hipotese', reg: 'HY-aaaaaaaa-2', op: 'alterar', campos: { modalidade: 'asserted' } })
    const estado = fundir([h1, h2, h3, fora, posicao, alterada])
    const doc = montarHipoteses(estado, AGORA)
    expect(doc.hipoteses.map((h) => h.id)).toEqual(['HY-bbbbbbbb-1', 'HY-aaaaaaaa-2'])
    expect(doc.hipoteses[1]).toMatchObject({ modalidade: 'asserted', alteradoEm: new Date(T0 + 6000).toISOString() })
    expect(JSON.stringify(doc)).not.toContain('HY-900001')
    expect(resumoDasHipoteses(estado)).toEqual({ hipoteses: 2 })
    // Restaurar a excluída a traz de volta.
    const volta = ev({ ap: A, seq: 7, tipo: 'hipotese', reg: 'HY-aaaaaaaa-3', op: 'restaurar' })
    expect(montarHipoteses(fundir([h1, h2, h3, fora, volta]), AGORA).hipoteses.map((h) => h.id)).toEqual(['HY-bbbbbbbb-1', 'HY-aaaaaaaa-2', 'HY-aaaaaaaa-3'])
  })

  it('o arquivo é JSON puro (vai e volta igual) e os campos ilegíveis viram nulos, sem quebrar', () => {
    const torta = ev({ ap: A, seq: 1, tipo: 'hipotese', reg: 'HY-aaaaaaaa-1', op: 'criar', campos: { nivel: 'outro', termos: 'x', objeto: 7, sobre: 'elemento', elemento: 'nada' } })
    const doc = montarHipoteses(fundir([torta]), AGORA)
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc)
    expect(doc.hipoteses[0]).toMatchObject({ alvo: { tipo: 'item', id: null, objeto: null, rotulo: '' }, localizador: null, identificacao: [], nivel: null, modalidade: null })
  })

  it('um id de hlc vira data ISO (os 13 dígitos são ms)', () => {
    const doc = montarHipoteses(fundir([ev({ ap: A, seq: 1, tipo: 'hipotese', reg: 'HY-aaaaaaaa-1', op: 'criar', h: hlc(T0, 3, A), campos: {} })]), AGORA)
    expect(doc.hipoteses[0]!.criadoEm).toBe(new Date(T0).toISOString())
  })
})
