/**
 * Os pares de sítios que podem ser o mesmo, na Revisão (Parte 2C, bloco 2, Tarefa 15): os abertos (`paresPendentes`) e os que a
 * pessoa resolveu (mesclando, marcando um como parte do outro, ou «São lugares diferentes»), a ordem dos dois lados (o sugerido
 * para ficar primeiro), os textos e o que um «Desfazer» grava de volta (F14: o `parteDe` de antes, não `null`).
 */
import { A, ev } from '../../tests/suporte/eventosDeTeste'
import type { Json } from '../usuario/eventos'
import { fundir } from '../usuario/fusao'
import { resolverSitios, type PacoteDeSitios, type ParSugerido } from '../sitios/resolucao'
import { absorvidoDoPar, chaveDoPar, ladosDoPar, ladosEmOrdem, ligacaoDaParte, motivoDoPar, parteDeAntes, parteDoPar, paresDaRevisao, TEXTO_DO_RESOLVIDO } from './pares'

const PARES: ParSugerido[] = [
  { a: 'TESTE-1', b: 'TESTE-7', motivo: 'nome' },
  { a: 'TESTE-1', b: 'TESTE-8', motivo: 'coordenada' },
  { a: 'TESTE-14', b: 'TESTE-3', motivo: 'variante' },
]
const pacote = (mais: Partial<PacoteDeSitios> = {}): PacoteDeSitios => ({
  sitios: new Set(['TESTE-1', 'TESTE-2', 'TESTE-3', 'TESTE-7', 'TESTE-8', 'TESTE-14']),
  publicados: new Map(),
  criados: new Set(),
  mesclas: new Map(),
  partes: new Map(),
  grafias: [],
  pares: PARES,
  ...mais,
})

let seq = 0
const sit = (reg: string, campos: Record<string, Json>, op: 'criar' | 'alterar' | 'excluir' = 'alterar') => ev({ ap: A, seq: ++seq, tipo: 'sitio', reg, op, campos })
const semCriacao = () => ''

describe('paresDaRevisao', () => {
  it('sem decisões: todos abertos, na ordem do pacote, e nenhum resolvido', () => {
    const p = pacote()
    const r = resolverSitios(fundir([]), p)
    expect(paresDaRevisao(r, p)).toEqual({ abertos: PARES, resolvidos: [] })
  })

  it('resolvidos pelos três caminhos: mesclados, um parte do outro, lugares diferentes', () => {
    const p = pacote()
    const estado = fundir([
      sit('TESTE-7', { mescladoEm: 'TESTE-1' }),
      sit('TESTE-8', { parteDe: 'TESTE-1' }),
      sit('TESTE-14', { diferentesDe: ['TESTE-3'] }),
    ])
    const r = resolverSitios(estado, p)
    expect(paresDaRevisao(r, p)).toEqual({
      abertos: [],
      resolvidos: [
        { par: PARES[0], como: 'mesclados' },
        { par: PARES[1], como: 'parte' },
        { par: PARES[2], como: 'diferentes' },
      ],
    })
  })

  it('parte em mais de um nível (o todo acima do todo) também é «parte»; os dois mesclados num terceiro, «mesclados»', () => {
    const p = pacote()
    const estado = fundir([sit('TESTE-8', { parteDe: 'TESTE-2' }), sit('TESTE-2', { parteDe: 'TESTE-1' }), sit('TESTE-14', { mescladoEm: 'TESTE-2' }), sit('TESTE-3', { mescladoEm: 'TESTE-2' })])
    const r = resolverSitios(estado, p)
    const { abertos, resolvidos } = paresDaRevisao(r, p)
    expect(abertos).toEqual([PARES[0]])
    expect(resolvidos.map((x) => x.como)).toEqual(['parte', 'mesclados'])
  })

  it('um par com um sítio que não existe (um sítio seu excluído) some das duas listas', () => {
    const par: ParSugerido = { a: 'SI-aaaaaaaa-1', b: 'TESTE-1', motivo: 'nome' }
    const par2: ParSugerido = { a: 'SI-aaaaaaaa-2', b: 'TESTE-2', motivo: 'nome' }
    const p = pacote({ pares: [par, par2] })
    const estado = fundir([
      sit('SI-aaaaaaaa-1', { nome: 'Excluído Teste' }, 'criar'),
      sit('SI-aaaaaaaa-1', {}, 'excluir'),
      sit('SI-aaaaaaaa-2', { nome: 'Vivo Teste' }, 'criar'),
      sit('SI-aaaaaaaa-2', { mescladoEm: 'TESTE-2' }),
    ])
    const r = resolverSitios(estado, p)
    expect(paresDaRevisao(r, p)).toEqual({ abertos: [], resolvidos: [{ par: par2, como: 'mesclados' }] })
  })
})

describe('os dois lados e os textos', () => {
  it('o sugerido para ficar vem primeiro (o de número menor: TESTE-3 antes de TESTE-14), pelo destino de cada id', () => {
    const p = pacote()
    const r = resolverSitios(fundir([]), p)
    expect(ladosDoPar(r, PARES[2]!, semCriacao)).toEqual({ fica: 'TESTE-3', outro: 'TESTE-14' })
    expect(ladosDoPar(r, PARES[0]!, semCriacao)).toEqual({ fica: 'TESTE-1', outro: 'TESTE-7' })
    // TESTE-7 mesclado em TESTE-2: o lado dele é TESTE-2
    const r2 = resolverSitios(fundir([sit('TESTE-7', { mescladoEm: 'TESTE-2' })]), p)
    expect(ladosDoPar(r2, PARES[0]!, semCriacao)).toEqual({ fica: 'TESTE-1', outro: 'TESTE-2' })
  })

  it('o do livro fica antes do seu', () => {
    const par: ParSugerido = { a: 'SI-aaaaaaaa-1', b: 'TESTE-8', motivo: 'coordenada' }
    const p = pacote({ pares: [par] })
    const r = resolverSitios(fundir([sit('SI-aaaaaaaa-1', { nome: 'Meu Teste' }, 'criar')]), p)
    expect(ladosDoPar(r, par, semCriacao)).toEqual({ fica: 'TESTE-8', outro: 'SI-aaaaaaaa-1' })
  })

  it('M-1: um sítio seu publicado (SI-… → TESTE-91, id de livro) conta como seu: o do livro fica antes dele, mesmo com número maior', () => {
    const par: ParSugerido = { a: 'TESTE-91', b: 'TESTE-1001', motivo: 'variante' }
    const p = pacote({ sitios: new Set(['TESTE-1', 'TESTE-91', 'TESTE-1001']), publicados: new Map([['SI-aaaaaaaa-9', 'TESTE-91']]), criados: new Set(['TESTE-91']), pares: [par] })
    const r = resolverSitios(fundir([sit('SI-aaaaaaaa-9', { nome: 'Tell Teste' }, 'criar')]), p)
    expect(ladosDoPar(r, par, semCriacao)).toEqual({ fica: 'TESTE-1001', outro: 'TESTE-91' })
    expect(ladosEmOrdem('TESTE-91', 'TESTE-1001', semCriacao, r.eDoUsuario)).toEqual({ fica: 'TESTE-1001', outro: 'TESTE-91' })
    // mesclado: o lado do par é o destino, e o publicado mesclado num sítio seu continua dando o destino
    const r2 = resolverSitios(fundir([sit('SI-aaaaaaaa-9', { nome: 'Tell Teste' }, 'criar'), sit('TESTE-1001', { mescladoEm: 'TESTE-1' })]), p)
    expect(ladosDoPar(r2, par, semCriacao)).toEqual({ fica: 'TESTE-1', outro: 'TESTE-91' })
    // dois seus (o publicado e um SI-… novo): o criado primeiro, pelo hlc do `criar`
    const criadoEm = (id: string) => ({ 'TESTE-91': '0000000002000-0000-x', 'SI-bbbbbbbb-1': '0000000001000-0000-x' })[id] ?? ''
    const r3 = resolverSitios(fundir([sit('SI-aaaaaaaa-9', { nome: 'Tell Teste' }, 'criar'), sit('SI-bbbbbbbb-1', { nome: 'Tall Teste' }, 'criar')]), p)
    expect(ladosEmOrdem('TESTE-91', 'SI-bbbbbbbb-1', criadoEm, r3.eDoUsuario)).toEqual({ fica: 'SI-bbbbbbbb-1', outro: 'TESTE-91' })
  })

  it('M-4: o par «variante» com um sítio seu não diz «O livro dá…» (texto proposto)', () => {
    expect(motivoDoPar('variante', 'Tall Teste', 'Tell Teste', true, true)).toBe('Tall Teste, do livro, é uma grafia que você deu a Tell Teste')
    expect(motivoDoPar('variante', 'Tall Teste', 'Tell Teste', false, true)).toBe('Variante no livro')
    // os outros motivos não mudam
    expect(motivoDoPar('nome', 'Tall Teste', 'Tell Teste', true, true)).toBe('Nome parecido: Tall Teste ~ Tell Teste')
    expect(motivoDoPar('coordenada', 'Tall Teste', 'Tell Teste', true, true)).toBe('Mesma coordenada')
  })

  it('o motivo: fechado, curto; aberto, com os nomes', () => {
    expect(motivoDoPar('nome', 'Tell Teste', 'Tall Teste', true)).toBe('Nome parecido: Tell Teste ~ Tall Teste')
    expect(motivoDoPar('nome', 'Tell Teste', 'Tall Teste', false)).toBe('Nome parecido')
    expect(motivoDoPar('coordenada', 'Tell Teste', 'Tall Teste', true)).toBe('Mesma coordenada')
    expect(motivoDoPar('coordenada', 'Tell Teste', 'Tall Teste', false)).toBe('Mesma coordenada')
    expect(motivoDoPar('variante', 'Tell Teste', 'Tall Teste', true)).toBe('O livro dá Tall Teste como variante de Tell Teste')
    expect(motivoDoPar('variante', 'Tell Teste', 'Tall Teste', false)).toBe('Variante no livro')
  })

  it('o texto de um resolvido', () => {
    expect(TEXTO_DO_RESOLVIDO).toEqual({ diferentes: 'lugares diferentes', mesclados: 'mesclados', parte: 'um é parte do outro' })
  })

  it('a chave do par', () => {
    expect(chaveDoPar(PARES[0]!)).toBe('par_TESTE-1_TESTE-7')
  })
})

describe('o que um «Desfazer» devolve', () => {
  it('parteDoPar: a parte é o de baixo, mesmo dois níveis abaixo', () => {
    const p = pacote()
    const r = resolverSitios(fundir([sit('TESTE-1', { parteDe: 'TESTE-2' }), sit('TESTE-2', { parteDe: 'TESTE-8' })]), p)
    expect(parteDoPar(r, PARES[1]!)).toEqual({ parte: 'TESTE-1', todo: 'TESTE-8' })
    const r2 = resolverSitios(fundir([sit('TESTE-8', { parteDe: 'TESTE-1' })]), p)
    expect(parteDoPar(r2, PARES[1]!)).toEqual({ parte: 'TESTE-8', todo: 'TESTE-1' })
  })

  it('F14: parteDeAntes é o `parteDe` que a parte tinha antes da decisão (do histórico); sem histórico, o do pacote; sem nada, null', () => {
    // TESTE-8 já era parte de TESTE-2; depois virou parte de TESTE-1
    const estado = fundir([sit('TESTE-8', { parteDe: 'TESTE-2' }), sit('TESTE-8', { parteDe: 'TESTE-1' })])
    expect(parteDeAntes(estado, pacote(), 'TESTE-8')).toBe('TESTE-2')
    // nunca foi parte de nada antes
    expect(parteDeAntes(fundir([sit('TESTE-8', { parteDe: 'TESTE-1' })]), pacote(), 'TESTE-8')).toBeNull()
    // o pacote dizia que era parte de TESTE-2 (nunca escrito antes na camada)
    expect(parteDeAntes(fundir([sit('TESTE-8', { parteDe: 'TESTE-1' })]), pacote({ partes: new Map([['TESTE-8', 'TESTE-2']]) }), 'TESTE-8')).toBe('TESTE-2')
    // antes, solta (null escrito): null
    expect(parteDeAntes(fundir([sit('TESTE-8', { parteDe: 'TESTE-2' }), sit('TESTE-8', { parteDe: null }), sit('TESTE-8', { parteDe: 'TESTE-1' })]), pacote(), 'TESTE-8')).toBeNull()
  })

  it('absorvidoDoPar: o que entrou no outro; mesclado através do outro; os dois num terceiro, o que não ficaria', () => {
    const p = pacote()
    const e1 = fundir([sit('TESTE-7', { mescladoEm: 'TESTE-1' })])
    expect(absorvidoDoPar(e1, p, resolverSitios(e1, p), PARES[0]!, semCriacao)).toBe('TESTE-7')
    const e2 = fundir([sit('TESTE-1', { mescladoEm: 'TESTE-7' })])
    expect(absorvidoDoPar(e2, p, resolverSitios(e2, p), PARES[0]!, semCriacao)).toBe('TESTE-1')
    // TESTE-7 → TESTE-1 → TESTE-2: é a mescla de TESTE-7 que os separa
    const e3 = fundir([sit('TESTE-7', { mescladoEm: 'TESTE-1' }), sit('TESTE-1', { mescladoEm: 'TESTE-2' })])
    expect(absorvidoDoPar(e3, p, resolverSitios(e3, p), PARES[0]!, semCriacao)).toBe('TESTE-7')
    // TESTE-1 → TESTE-2 e TESTE-7 → TESTE-2: o que não seria o sugerido para ficar (TESTE-7)
    const e4 = fundir([sit('TESTE-1', { mescladoEm: 'TESTE-2' }), sit('TESTE-7', { mescladoEm: 'TESTE-2' })])
    expect(absorvidoDoPar(e4, p, resolverSitios(e4, p), PARES[0]!, semCriacao)).toBe('TESTE-7')
  })

  it('revisão 1, I2: «mesclados» desfaz a mescla mais recente do caminho entre os dois, não a primeira da cadeia', () => {
    const p = pacote()
    // 1 → 2 já existia; depois «Mesclar…» ficou com 7 (2 → 7): desfazer tira 2 → 7 e deixa 1 → 2
    const e1 = fundir([sit('TESTE-1', { mescladoEm: 'TESTE-2' }), sit('TESTE-2', { mescladoEm: 'TESTE-7' })])
    expect(absorvidoDoPar(e1, p, resolverSitios(e1, p), PARES[0]!, semCriacao)).toBe('TESTE-2')
    // o espelho: 7 → 2 já existia; depois 2 → 1
    const e2 = fundir([sit('TESTE-7', { mescladoEm: 'TESTE-2' }), sit('TESTE-2', { mescladoEm: 'TESTE-1' })])
    expect(absorvidoDoPar(e2, p, resolverSitios(e2, p), PARES[0]!, semCriacao)).toBe('TESTE-2')
    // a ordem ao contrário: 2 → 7 primeiro, 1 → 2 depois: é 1 → 2 que os juntou
    const e3 = fundir([sit('TESTE-2', { mescladoEm: 'TESTE-7' }), sit('TESTE-1', { mescladoEm: 'TESTE-2' })])
    expect(absorvidoDoPar(e3, p, resolverSitios(e3, p), PARES[0]!, semCriacao)).toBe('TESTE-1')
    // as mescladas só pelo pacote (hlc zero): o que não seria o sugerido para ficar
    const pm = pacote({ mesclas: new Map([['TESTE-1', 'TESTE-2'], ['TESTE-7', 'TESTE-2']]) })
    const e4 = fundir([])
    expect(absorvidoDoPar(e4, pm, resolverSitios(e4, pm), PARES[0]!, semCriacao)).toBe('TESTE-7')
  })

  it('revisão 1, M1: «parte» em dois níveis desfaz a ligação mais recente do caminho (a que juntou o par), não a de baixo', () => {
    const p = pacote()
    // 8 já era parte de 2; depois, na página, 2 virou parte de 1: é 2 → 1 que juntou o par
    const e1 = fundir([sit('TESTE-8', { parteDe: 'TESTE-2' }), sit('TESTE-2', { parteDe: 'TESTE-1' })])
    expect(ligacaoDaParte(e1, p, resolverSitios(e1, p), PARES[1]!)).toEqual({ k: 'TESTE-2', tipo: 'parte' })
    // ao contrário: 2 → 1 primeiro, 8 → 2 depois
    const e2 = fundir([sit('TESTE-2', { parteDe: 'TESTE-1' }), sit('TESTE-8', { parteDe: 'TESTE-2' })])
    expect(ligacaoDaParte(e2, p, resolverSitios(e2, p), PARES[1]!)).toEqual({ k: 'TESTE-8', tipo: 'parte' })
    // um nível só
    const e3 = fundir([sit('TESTE-8', { parteDe: 'TESTE-1' })])
    expect(ligacaoDaParte(e3, p, resolverSitios(e3, p), PARES[1]!)).toEqual({ k: 'TESTE-8', tipo: 'parte' })
  })

  it('revisão 2, N3: «parte» juntado por uma mescla desfaz a mescla (a ligação mais recente, de qualquer tipo)', () => {
    const p = pacote({ sitios: new Set(['TESTE-41', 'TESTE-42', 'TESTE-48']), pares: [{ a: 'TESTE-41', b: 'TESTE-48', motivo: 'coordenada' }] })
    const par = p.pares[0]!
    // 48 já era parte de 42; depois, na página, 42 foi mesclado em 41: é a mescla que juntou o par
    const e1 = fundir([sit('TESTE-48', { parteDe: 'TESTE-42' }), sit('TESTE-42', { mescladoEm: 'TESTE-41' })])
    const r1 = resolverSitios(e1, p)
    expect(paresDaRevisao(r1, p).resolvidos.map((x) => x.como)).toEqual(['parte'])
    expect(ligacaoDaParte(e1, p, r1, par)).toEqual({ k: 'TESTE-42', tipo: 'mescla' })
    // ao contrário: a mescla primeiro, a parte depois
    const e2 = fundir([sit('TESTE-42', { mescladoEm: 'TESTE-41' }), sit('TESTE-48', { parteDe: 'TESTE-42' })])
    expect(ligacaoDaParte(e2, p, resolverSitios(e2, p), par)).toEqual({ k: 'TESTE-48', tipo: 'parte' })
    // o id do par mesclado na parte depois (a mescla do próprio id também é ligação do caminho)
    const p3 = pacote({ sitios: new Set(['TESTE-41', 'TESTE-42', 'TESTE-48']), pares: [{ a: 'TESTE-41', b: 'TESTE-48', motivo: 'coordenada' }] })
    const e3 = fundir([sit('TESTE-42', { parteDe: 'TESTE-41' }), sit('TESTE-48', { mescladoEm: 'TESTE-42' })])
    const r3 = resolverSitios(e3, p3)
    expect(paresDaRevisao(r3, p3).resolvidos.map((x) => x.como)).toEqual(['parte'])
    expect(ligacaoDaParte(e3, p3, r3, par)).toEqual({ k: 'TESTE-48', tipo: 'mescla' })
  })

  it('revisão 2, N4: num conflito de círculo de mesclas, a mescla descartada não entra no caminho', () => {
    const par: ParSugerido = { a: 'TESTE-201', b: 'TESTE-207', motivo: 'nome' }
    const p = pacote({ sitios: new Set(['TESTE-201', 'TESTE-202', 'TESTE-203', 'TESTE-207']), pares: [par] })
    // 201 → 202, 207 → 203, 202 → 203, 203 → 202: o círculo descarta 202 → 203 (a mais antiga dele)
    const e = fundir([
      sit('TESTE-201', { mescladoEm: 'TESTE-202' }),
      sit('TESTE-207', { mescladoEm: 'TESTE-203' }),
      sit('TESTE-202', { mescladoEm: 'TESTE-203' }),
      sit('TESTE-203', { mescladoEm: 'TESTE-202' }),
    ])
    const r = resolverSitios(e, p)
    expect(r.destino('TESTE-202')).toBe('TESTE-202')
    expect(paresDaRevisao(r, p).resolvidos.map((x) => x.como)).toEqual(['mesclados'])
    // o caminho é [201] + [207, 203]: a mais recente é 203 → 202
    expect(absorvidoDoPar(e, p, r, par, semCriacao)).toBe('TESTE-203')
  })

  it('revisão 1, M2: parteDeAntes lê o histórico juntado: o parteDe de antes num `SI-…` publicado como a parte', () => {
    const p = pacote({ sitios: new Set(['TESTE-1', 'TESTE-2', 'TESTE-7', 'TESTE-8', 'TESTE-93']), publicados: new Map([['SI-aaaaaaaa-1', 'TESTE-93']]) })
    const estado = fundir([
      sit('SI-aaaaaaaa-1', { nome: 'Publicado Teste' }, 'criar'),
      sit('SI-aaaaaaaa-1', { parteDe: 'TESTE-2' }),
      sit('TESTE-93', { parteDe: 'TESTE-1' }),
    ])
    expect(parteDeAntes(estado, p, 'TESTE-93')).toBe('TESTE-2')
    // a escrita anterior no próprio registro é mais nova que a do SI-…: vale ela
    const estado2 = fundir([
      sit('SI-aaaaaaaa-1', { nome: 'Publicado Teste' }, 'criar'),
      sit('SI-aaaaaaaa-1', { parteDe: 'TESTE-2' }),
      sit('TESTE-93', { parteDe: 'TESTE-7' }),
      sit('TESTE-93', { parteDe: 'TESTE-1' }),
    ])
    expect(parteDeAntes(estado2, p, 'TESTE-93')).toBe('TESTE-7')
  })
})
