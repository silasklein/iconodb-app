import { fundir, type Estado } from '../usuario/fusao'
import type { Evento, Json } from '../usuario/eventos'
import { A, B, C, T0, embaralhar, ev, gerador, hlc } from '../../tests/suporte/eventosDeTeste'
import {
  chaveDoNrSkc,
  confirmacoes,
  formatarNumero,
  lerNrSkc,
  lerNumero,
  numerar,
  PERIODOS,
  proximoNrSkc,
  proximoNumero,
  testemunhasDoLivro,
  testemunhasFaltando,
  unirConfirmados,
  type Numeracao,
} from './numeracao'
import { eObjetoSkc } from './modelo'

const pacoteCa = (ate: number) => new Set(Array.from({ length: ate }, (_, i) => formatarNumero('CA', i + 1)))

let seqs: Record<string, number> = {}
function criar(ap: string, n: number, campos: Record<string, Json>, ms = T0): Evento {
  seqs[ap] = (seqs[ap] ?? 0) + 1
  return ev({ ap, seq: seqs[ap]!, ms, tipo: 'objeto', reg: `OB-${ap}-${n}`, op: 'criar', campos })
}
function alterar(ap: string, reg: string, campos: Record<string, Json>, ms: number, op: 'alterar' | 'excluir' | 'restaurar' = 'alterar'): Evento {
  seqs[ap] = (seqs[ap] ?? 0) + 1
  return ev({ ap, seq: seqs[ap]!, ms, tipo: 'objeto', reg, op, campos })
}
beforeEach(() => {
  seqs = {}
})

const num = (n: Numeracao, id: string) => n.porId.get(id)?.numero ?? null
const sit = (n: Numeracao, id: string) => n.porId.get(id)?.situacao

describe('o padrão do número do sistema (uma fonte só para o app inteiro)', () => {
  it('só os códigos de período + 5 algarismos; o canônico em maiúsculas, o digitado em qualquer caixa', async () => {
    const m = await import('./numeracao')
    for (const v of ['CA00001', 'F100001', 'F200099', 'F312345', 'RO99999']) expect(m.RE_NUMERO_DO_SISTEMA.test(v), v).toBe(true)
    for (const v of ['ca00001', 'f100001', 'ZZ00001', 'F400001', 'FF00001', 'CA0001', 'CA000011', ' CA00001', 'C100001']) expect(m.RE_NUMERO_DO_SISTEMA.test(v), v).toBe(false)
    for (const v of ['ca00001', 'f100001', 'F100001']) expect(m.RE_NUMERO_DIGITADO.test(v), v).toBe(true)
    for (const v of ['zz00001', 'f400001', 'f10000']) expect(m.RE_NUMERO_DIGITADO.test(v), v).toBe(false)
    expect(m.numerosNoTexto('veja f100001, CA00002 e xCA00003, ZZ00001; CA00002')).toEqual(['F100001', 'CA00002'])
    // o começo de um número ("F10", "ca0"), para as sugestões
    for (const v of ['F1', 'F10', 'f100001', 'ca', 'CA0', 'BA00001']) expect(m.pareceComecoDeNumero(v), v).toBe(true)
    for (const v of ['F', 'F4', 'zz0', 'CA000011', 'íbex', '']) expect(m.pareceComecoDeNumero(v), v).toBe(false)
  })
})

describe('números: forma', () => {
  it('lê e escreve <período><5 dígitos>, só com os códigos de período do banco', () => {
    expect(PERIODOS.map((p) => p.codigo)).toEqual(['NT', 'NE', 'CA', 'BA', 'BI', 'BM', 'BT', 'F1', 'F2', 'F3', 'PE', 'HE', 'RO'])
    expect(formatarNumero('CA', 46)).toBe('CA00046')
    expect(lerNumero('CA00046')).toEqual({ periodo: 'CA', n: 46 })
    expect(lerNumero('F100002')).toEqual({ periodo: 'F1', n: 2 })
    for (const ruim of ['ca00046', 'XX00001', 'CA0046', 'CA000460', 'CA00000', 'CA00046 ', 'ＣＡ00046', 'CA00046\n', 46, null]) expect(lerNumero(ruim)).toBeNull()
  })
})

describe('proximoNumero', () => {
  it('o próximo depois de CA00045 é CA00046; depois de um CA00046 SKC, CA00047; período vazio começa em 00001', () => {
    const vazio = fundir([])
    expect(proximoNumero('CA', vazio, pacoteCa(45))).toBe('CA00046')
    const comSkc = fundir([criar(A, 1, { periodo: 'CA', pedido: 'CA00046' })])
    expect(proximoNumero('CA', comSkc, pacoteCa(45))).toBe('CA00047')
    expect(proximoNumero('BM', comSkc, pacoteCa(45))).toBe('BM00001')
    // O maior do período, não a quantidade: buracos no pacote não são reaproveitados.
    expect(proximoNumero('BA', vazio, new Set(['BA00001', 'BA00007']))).toBe('BA00008')
  })

  it('conta os confirmados de objetos que este aparelho ainda nem viu', () => {
    expect(proximoNumero('CA', fundir([]), pacoteCa(45), { 'OB-bbbbbbbb-1': 'CA00050' })).toBe('CA00051')
  })
})

describe('numerar: provisório, confirmado, rascunho', () => {
  it('sem confirmação o número é provisório; com o mapa confirmado ou a testemunha, é confirmado', () => {
    const e = fundir([criar(A, 1, { periodo: 'CA', pedido: 'CA00046' })])
    expect(sit(numerar(e, pacoteCa(45), {}), 'OB-aaaaaaaa-1')).toBe('provisorio')
    expect(num(numerar(e, pacoteCa(45), {}), 'OB-aaaaaaaa-1')).toBe('CA00046')
    expect(sit(numerar(e, pacoteCa(45), { 'OB-aaaaaaaa-1': 'CA00046' }), 'OB-aaaaaaaa-1')).toBe('confirmado')
    const comTestemunha = fundir([criar(A, 1, { periodo: 'CA', pedido: 'CA00046' }), alterar(B, 'OB-aaaaaaaa-1', { numero: 'CA00046' }, T0 + 5000)])
    expect(sit(numerar(comTestemunha, pacoteCa(45), {}), 'OB-aaaaaaaa-1')).toBe('confirmado')
  })

  it('Foco 4: dois aparelhos offline criam CA00046; o de hlc menor fica com ele, o outro recebe CA00047 e o aviso; antes da confirmação os dois são provisórios', () => {
    const x = criar(A, 1, { periodo: 'CA', pedido: 'CA00046' }, T0 + 1000)
    const y = criar(B, 1, { periodo: 'CA', pedido: 'CA00046' }, T0 + 2000)
    // Cada um sozinho vê o seu como CA00046, provisório.
    expect(num(numerar(fundir([x]), pacoteCa(45), {}), 'OB-aaaaaaaa-1')).toBe('CA00046')
    expect(num(numerar(fundir([y]), pacoteCa(45), {}), 'OB-bbbbbbbb-1')).toBe('CA00046')
    for (const ordem of [[x, y], [y, x]]) {
      const n = numerar(fundir(ordem), pacoteCa(45), {})
      expect(num(n, 'OB-aaaaaaaa-1')).toBe('CA00046')
      expect(num(n, 'OB-bbbbbbbb-1')).toBe('CA00047')
      expect(sit(n, 'OB-aaaaaaaa-1')).toBe('provisorio')
      expect(sit(n, 'OB-bbbbbbbb-1')).toBe('provisorio')
      expect(n.porId.get('OB-bbbbbbbb-1')!.mudou).toBe(true)
      expect(n.porId.get('OB-aaaaaaaa-1')!.mudou).toBe(false)
      // A consolidação confirma exatamente isto.
      expect(confirmacoes(n)).toEqual({ 'OB-aaaaaaaa-1': 'CA00046', 'OB-bbbbbbbb-1': 'CA00047', 'SKC:OB-aaaaaaaa-1': '1', 'SKC:OB-bbbbbbbb-1': '2' })
    }
  })

  it('um objeto de hlc mais antigo que chega depois de um número confirmado NÃO toma o número', () => {
    const antigo = criar(A, 1, { periodo: 'CA', pedido: 'CA00046' }, T0 + 1000)
    const novo = criar(B, 1, { periodo: 'CA', pedido: 'CA00046' }, T0 + 9000)
    const confirmados = { 'OB-bbbbbbbb-1': 'CA00046' }
    const n = numerar(fundir([novo, antigo]), pacoteCa(45), confirmados)
    expect(num(n, 'OB-bbbbbbbb-1')).toBe('CA00046')
    expect(sit(n, 'OB-bbbbbbbb-1')).toBe('confirmado')
    expect(num(n, 'OB-aaaaaaaa-1')).toBe('CA00047')
    expect(n.porId.get('OB-aaaaaaaa-1')!.mudou).toBe(true)
  })

  it('"Ainda não sei": rascunho sem número; ao escolher o período, recebe o número (pela hora em que o período foi escolhido)', () => {
    const rascunho = criar(A, 1, { periodo: null, titulo: 'Remate' }, T0 + 1000)
    const outro = criar(B, 1, { periodo: 'CA', pedido: 'CA00046' }, T0 + 2000)
    let n = numerar(fundir([rascunho, outro]), pacoteCa(45), {})
    expect(sit(n, 'OB-aaaaaaaa-1')).toBe('rascunho')
    expect(num(n, 'OB-aaaaaaaa-1')).toBeNull()
    expect(n.rascunhos).toEqual(['OB-aaaaaaaa-1'])
    const escolheu = alterar(A, 'OB-aaaaaaaa-1', { periodo: 'CA', pedido: 'CA00047' }, T0 + 3000)
    n = numerar(fundir([rascunho, outro, escolheu]), pacoteCa(45), {})
    // O rascunho foi criado antes, mas o pedido de número (o período) veio depois: CA00047.
    expect(num(n, 'OB-aaaaaaaa-1')).toBe('CA00047')
    expect(num(n, 'OB-bbbbbbbb-1')).toBe('CA00046')
    expect(n.rascunhos).toEqual([])
  })

  it('excluído sem confirmação não ocupa número; excluído confirmado guarda o número (nunca reutilizado)', () => {
    const x = criar(A, 1, { periodo: 'CA' }, T0 + 1000)
    const y = criar(A, 2, { periodo: 'CA' }, T0 + 2000)
    const fora = alterar(A, 'OB-aaaaaaaa-1', {}, T0 + 3000, 'excluir')
    let n = numerar(fundir([x, y, fora]), pacoteCa(45), {})
    expect(num(n, 'OB-aaaaaaaa-1')).toBeNull()
    expect(sit(n, 'OB-aaaaaaaa-1')).toBe('excluido')
    expect(num(n, 'OB-aaaaaaaa-2')).toBe('CA00046')
    n = numerar(fundir([x, y, fora]), pacoteCa(45), { 'OB-aaaaaaaa-1': 'CA00046' })
    expect(num(n, 'OB-aaaaaaaa-1')).toBe('CA00046')
    expect(num(n, 'OB-aaaaaaaa-2')).toBe('CA00047')
    expect(n.porNumero.get('CA00046')).toBe('OB-aaaaaaaa-1')
  })

  it('um número do livro igual a um confirmado SKC: o livro fica com ele, o SKC é marcado e ganha outro (só se a Tarefa 16 falhar)', () => {
    const x = criar(A, 1, { periodo: 'CA' }, T0 + 1000)
    const n = numerar(fundir([x]), pacoteCa(46), { 'OB-aaaaaaaa-1': 'CA00046' })
    expect(num(n, 'OB-aaaaaaaa-1')).toBe('CA00047')
    expect(sit(n, 'OB-aaaaaaaa-1')).toBe('provisorio')
    expect(n.porId.get('OB-aaaaaaaa-1')!.conflito).toBe('livro')
    expect(n.porNumero.has('CA00046')).toBe(false)
  })

  it('decisão 48: o confirmado que um livro tomou ganha na consolidação a testemunha do número novo, que fica definitivo e não anda', () => {
    const x = criar(A, 1, { periodo: 'CA', pedido: 'CA00046' }, T0 + 1000)
    const w = alterar(A, 'OB-aaaaaaaa-1', { numero: 'CA00046' }, T0 + 2000)
    const pacote = pacoteCa(47) // o volume novo deu CA00046 e CA00047 a objetos do livro
    let n = numerar(fundir([x, w]), pacote, { 'OB-aaaaaaaa-1': 'CA00046' })
    expect(n.porId.get('OB-aaaaaaaa-1')).toMatchObject({ numero: 'CA00048', situacao: 'provisorio', conflito: 'livro', numeroTomadoPeloLivro: 'CA00046' })
    // a consolidação escreve a testemunha nova (com o número tomado, para o aviso)
    const novas = testemunhasDoLivro(n)
    expect(novas).toEqual([{ id: 'OB-aaaaaaaa-1', campos: { numero: 'CA00048', numeroTomadoPeloLivro: 'CA00046' } }])
    const t = alterar(B, 'OB-aaaaaaaa-1', novas[0]!.campos, T0 + 3000)
    // outro objeto do período, pedido depois, e confirmado depois: o número do primeiro não anda
    const y = criar(B, 1, { periodo: 'CA' }, T0 + 4000)
    const eventos = [x, w, t, y]
    n = numerar(fundir(eventos), pacote, { 'OB-aaaaaaaa-1': 'CA00046' })
    expect(n.porId.get('OB-aaaaaaaa-1')).toMatchObject({ numero: 'CA00048', situacao: 'confirmado', conflito: null, numeroTomadoPeloLivro: 'CA00046' })
    expect(num(n, 'OB-bbbbbbbb-1')).toBe('CA00049')
    expect(testemunhasDoLivro(n)).toEqual([])
    const confirmados = unirConfirmados({ 'OB-aaaaaaaa-1': 'CA00046' }, confirmacoes(n))
    n = numerar(fundir(eventos), pacote, confirmados)
    expect(num(n, 'OB-aaaaaaaa-1')).toBe('CA00048')
    expect(sit(n, 'OB-bbbbbbbb-1')).toBe('confirmado')
    // mais objetos confirmados depois: continua CA00048 (antes da revisão 1, andava a cada confirmação)
    const z = criar(C, 1, { periodo: 'CA' }, T0 + 5000)
    n = numerar(fundir([...eventos, z]), pacote, unirConfirmados(confirmados, confirmacoes(numerar(fundir([...eventos, z]), pacote, confirmados))))
    expect(n.porId.get('OB-aaaaaaaa-1')).toMatchObject({ numero: 'CA00048', situacao: 'confirmado' })
    expect(num(n, 'OB-cccccccc-1')).toBe('CA00050')
    // a fusão é pura: qualquer ordem, com repetições, dá a mesma numeração
    const aleatorio = gerador(48)
    const base = numerar(fundir([...eventos, z]), pacote, confirmados)
    for (let i = 0; i < 25; i++) {
      const outra = numerar(fundir(embaralhar([...eventos, z, ...eventos.slice(0, i % 4)], aleatorio)), pacote, confirmados)
      expect([...outra.porId]).toEqual([...base.porId])
    }
  })

  it('decisão 48: dois aparelhos que consolidam o mesmo estado escrevem a mesma testemunha; as duas juntas dão o mesmo número', () => {
    const x = criar(A, 1, { periodo: 'CA' }, T0 + 1000)
    const w = alterar(A, 'OB-aaaaaaaa-1', { numero: 'CA00046' }, T0 + 2000)
    const y = criar(B, 1, { periodo: 'BA' }, T0 + 2500) // de outro período: não muda nada no CA
    const pacote = new Set([...pacoteCa(46), 'BA00001'])
    const eventos = [x, w, y]
    const noA = testemunhasDoLivro(numerar(fundir(embaralhar(eventos, gerador(1))), pacote, {}))
    const noB = testemunhasDoLivro(numerar(fundir(embaralhar(eventos, gerador(2))), pacote, {}))
    expect(noA).toEqual(noB)
    expect(noA).toEqual([{ id: 'OB-aaaaaaaa-1', campos: { numero: 'CA00047', numeroTomadoPeloLivro: 'CA00046' } }])
    const ta = alterar(A, 'OB-aaaaaaaa-1', noA[0]!.campos, T0 + 3000)
    const tb = alterar(B, 'OB-aaaaaaaa-1', noB[0]!.campos, T0 + 3000)
    for (const ordem of [[...eventos, ta, tb], [tb, ...eventos, ta], [ta, tb, ...eventos, ta]]) {
      const n = numerar(fundir(ordem), pacote, {})
      expect(n.porId.get('OB-aaaaaaaa-1')).toMatchObject({ numero: 'CA00047', situacao: 'confirmado', numeroTomadoPeloLivro: 'CA00046' })
      expect(num(n, 'OB-bbbbbbbb-1')).toBe('BA00002')
    }
  })

  it('revisão 2 (I3): a consolidação grava o número novo no mapa (LIVRO:<id>); quem lê só o mapa, sem a testemunha nova, chega ao MESMO número', () => {
    const o = 'OB-aaaaaaaa-1'
    const x = criar(A, 1, { periodo: 'CA', pedido: 'CA00046' }, T0 + 1000)
    const w = alterar(A, o, { numero: 'CA00046' }, T0 + 2000) // a testemunha antiga (o número que o livro tomou)
    const r = criar(B, 1, { periodo: 'CA' }, T0 + 4000)
    const pacote = pacoteCa(47)
    // B consolida: o fica com CA00048, r com CA00049; o mapa leva os dois e o número novo de o
    const nB = numerar(fundir([x, w, r]), pacote, { [o]: 'CA00046' })
    const mapa = unirConfirmados({ [o]: 'CA00046' }, confirmacoes(nB))
    expect(mapa).toEqual({ 'LIVRO:OB-aaaaaaaa-1': 'CA00048', [o]: 'CA00046', 'OB-bbbbbbbb-1': 'CA00049', [chaveDoNrSkc(o)]: '1', [chaveDoNrSkc('OB-bbbbbbbb-1')]: '2' })
    // A lê esse mapa, mas não tem a testemunha nova: o é CA00048, confirmado, e não há testemunha do livro a escrever
    for (const eventos of [[x, w, r], [x, r], [r, w, x]]) {
      const nA = numerar(fundir(eventos), pacote, mapa)
      expect(nA.porId.get(o)).toMatchObject({ numero: 'CA00048', situacao: 'confirmado', conflito: null, numeroTomadoPeloLivro: 'CA00046' })
      expect(num(nA, 'OB-bbbbbbbb-1')).toBe('CA00049')
      expect(nA.provisorios).toEqual([])
      expect(testemunhasDoLivro(nA)).toEqual([])
      // e o mapa não muda numa consolidação seguinte
      expect(unirConfirmados(mapa, confirmacoes(nA))).toEqual(mapa)
    }
    // A testemunha que falta (para o diário) é a do número novo, não a do tomado
    expect(testemunhasFaltando(fundir([x, w, r]), mapa).find((t) => t.id === o)).toEqual({ id: o, campos: { numero: 'CA00048', numeroTomadoPeloLivro: 'CA00046', nrSkc: '1' } })
    expect(testemunhasFaltando(fundir([x, r]), mapa).find((t) => t.id === o)).toEqual({ id: o, campos: { numero: 'CA00048', numeroTomadoPeloLivro: 'CA00046', nrSkc: '1' } })
    // Sem o livro tomar o número (o pacote velho), a chave não vale: o número do mapa continua
    expect(numerar(fundir([x, w, r]), pacoteCa(45), mapa).porId.get(o)).toMatchObject({ numero: 'CA00046', situacao: 'confirmado' })
  })

  it('revisão 2: um livro toma também o número novo (falha dupla): ganha outro, maior, e a união de LIVRO:<id> fica com o maior', () => {
    const o = 'OB-aaaaaaaa-1'
    const x = criar(A, 1, { periodo: 'CA' }, T0 + 1000)
    const mapa = { [o]: 'CA00046', 'LIVRO:OB-aaaaaaaa-1': 'CA00048' }
    const n = numerar(fundir([x]), pacoteCa(48), mapa)
    expect(n.porId.get(o)).toMatchObject({ numero: 'CA00049', situacao: 'provisorio', conflito: 'livro', numeroTomadoPeloLivro: 'CA00048' })
    const depois = unirConfirmados(mapa, confirmacoes(n))
    expect(depois['LIVRO:OB-aaaaaaaa-1']).toBe('CA00049')
    expect(unirConfirmados({ 'LIVRO:OB-aaaaaaaa-1': 'CA00049' }, { 'LIVRO:OB-aaaaaaaa-1': 'CA00048' })['LIVRO:OB-aaaaaaaa-1']).toBe('CA00049')
    expect(numerar(fundir([x]), pacoteCa(48), depois).porId.get(o)).toMatchObject({ numero: 'CA00049', situacao: 'confirmado', numeroTomadoPeloLivro: 'CA00046' })
    // Entradas malformadas não entram; uma reserva nunca usa a chave
    expect(unirConfirmados({ 'LIVRO:OB-x-1': 'CA00048', 'LIVRO:OB-aaaaaaaa-1': 'ca00048', 'LIVRO:': 'CA00048' }, {})).toEqual({})
    const reserva = criar('pipeline', 1, { periodo: 'CA', reserva: 'TESTE II' }, T0 + 500)
    const nr = numerar(fundir([reserva]), pacoteCa(46), { 'OB-pipeline-1': 'CA00046', 'LIVRO:OB-pipeline-1': 'CA00050' })
    expect(nr.porId.get('OB-pipeline-1')).toMatchObject({ numero: 'CA00046', situacao: 'confirmado', numeroTomadoPeloLivro: null })
  })

  it('revisão 3 (m-I3a): com o pacote velho, o número novo da chave LIVRO:<id> já está ocupado; outro objeto do período não o recebe', () => {
    const o = 'OB-aaaaaaaa-1'
    const p = 'OB-bbbbbbbb-1'
    const x = criar(A, 1, { periodo: 'CA' }, T0 + 1000)
    const y = criar(B, 1, { periodo: 'CA' }, T0 + 4000)
    const mapa = { [o]: 'CA00047', 'LIVRO:OB-aaaaaaaa-1': 'CA00048' }
    // Pacote velho (sem CA00047): o fica com CA00047, mas CA00048 já é o número novo dele; p recebe CA00049
    const velho = numerar(fundir([x, y]), pacoteCa(46), mapa)
    expect(velho.porId.get(o)).toMatchObject({ numero: 'CA00047', situacao: 'confirmado' })
    expect(velho.porId.get(p)).toMatchObject({ numero: 'CA00049', situacao: 'provisorio', conflito: null })
    expect(velho.maiores.get('CA')).toBe(49)
    // Pacote novo: o fica com CA00048, p continua com CA00049 (sem conflito), nos dois aparelhos o mesmo
    const novo = numerar(fundir([x, y]), pacoteCa(47), unirConfirmados(mapa, confirmacoes(velho)))
    expect(novo.porId.get(o)).toMatchObject({ numero: 'CA00048', situacao: 'confirmado', numeroTomadoPeloLivro: 'CA00047' })
    expect(novo.porId.get(p)).toMatchObject({ numero: 'CA00049', situacao: 'confirmado', conflito: null })
    // Só valores válidos ocupam: uma chave malformada ou um número inválido não sobe o período
    expect(numerar(fundir([y]), pacoteCa(46), { 'LIVRO:OB-x-1': 'CA00060', 'LIVRO:OB-aaaaaaaa-1': 'ca00060' }).porId.get(p)?.numero).toBe('CA00047')
    // Um id do mapa sem registro também ocupa o número novo
    expect(numerar(fundir([y]), pacoteCa(46), { 'LIVRO:OB-cccccccc-1': 'CA00052' }).porId.get(p)?.numero).toBe('CA00053')
  })

  it('decisão 48: um conflito entre objetos SKC (falha dupla) e uma reserva nunca recebem a testemunha do livro', () => {
    const r = criar('pipeline', 1, { periodo: 'CA', reserva: 'TESTE II', numero: 'CA00046' }, T0 + 1000)
    const a = criar(A, 1, { periodo: 'CA', numero: 'CA00047' }, T0 + 2000)
    const b = criar(B, 1, { periodo: 'CA', numero: 'CA00047' }, T0 + 3000)
    const n = numerar(fundir([r, a, b]), pacoteCa(46), {})
    expect(n.porId.get('OB-bbbbbbbb-1')?.conflito).toBe('skc')
    expect(testemunhasDoLivro(n)).toEqual([])
  })

  it('uma reserva do livro (Tarefa 16) conta como número ocupado, não é objeto SKC e não conflita com o pacote que a cumpre', () => {
    const reserva = criar('pipeline', 1, { periodo: 'CA', reserva: 'TESTE II' }, T0 + 1000)
    const x = criar(A, 1, { periodo: 'CA' }, T0 + 2000)
    let n = numerar(fundir([reserva, x]), pacoteCa(45), {})
    expect(num(n, 'OB-pipeline-1')).toBe('CA00046')
    expect(n.porId.get('OB-pipeline-1')!.reserva).toBe('TESTE II')
    expect(num(n, 'OB-aaaaaaaa-1')).toBe('CA00047')
    // O pacote novo traz o objeto do livro com o número reservado: nenhum conflito.
    n = numerar(fundir([reserva, x]), pacoteCa(46), { 'OB-pipeline-1': 'CA00046', 'OB-aaaaaaaa-1': 'CA00047' })
    expect(n.porId.get('OB-pipeline-1')!.conflito).toBeNull()
    expect(num(n, 'OB-aaaaaaaa-1')).toBe('CA00047')
  })

  it('revisão 1: a reserva cumprida não responde pelo número do livro (fica fora de porNumero, em reservas), mas ocupa o número', () => {
    const reserva = criar('pipeline', 1, { periodo: 'CA', reserva: 'TESTE II' }, T0 + 1000)
    const n = numerar(fundir([reserva]), pacoteCa(46), { 'OB-pipeline-1': 'CA00046' })
    expect(n.porNumero.has('CA00046')).toBe(false)
    expect(n.reservas.get('CA00046')).toBe('OB-pipeline-1')
    expect(n.maiores.get('CA')).toBe(46)
    // Uma reserva ainda sem o pacote também fica fora de porNumero; um id do mapa sem registro também.
    const m = numerar(fundir([reserva]), pacoteCa(45), { 'OB-pipeline-1': 'CA00046', 'OB-cccccccc-9': 'CA00047' })
    expect(m.porNumero.size).toBe(0)
    expect(m.reservas.get('CA00046')).toBe('OB-pipeline-1')
    expect(proximoNumero('CA', fundir([reserva]), pacoteCa(45), { 'OB-pipeline-1': 'CA00046', 'OB-cccccccc-9': 'CA00047' })).toBe('CA00048')
  })

  it('revisão 3: a testemunha da reserva chega antes do criar do pipeline: o id OB-pipeline-… basta para ser reserva (fora de porNumero, sem SKC, Nr., fora das listas), em qualquer ordem', () => {
    const x = criar(A, 1, { periodo: 'CA' }, T0 + 500)
    const reserva = criar('pipeline', 1, { periodo: 'CA', reserva: 'TESTE II' }, T0 + 1000)
    // A testemunha `alterar {numero}` que o aparelho B escreveu ao consolidar (só ela chegou a este aparelho).
    const testemunha = alterar(B, 'OB-pipeline-1', { numero: 'CA00046', nrSkc: '2' }, T0 + 3000)
    const confirmados = { 'OB-aaaaaaaa-1': 'CA00047', [chaveDoNrSkc('OB-aaaaaaaa-1')]: '1' }
    for (const pacote of [pacoteCa(45), pacoteCa(46)]) {
      for (const eventos of [[x, testemunha], [testemunha, x], [x, reserva, testemunha], [testemunha, reserva, x]]) {
        const estado = fundir(eventos)
        const n = numerar(estado, pacote, confirmados)
        const como = `${pacote.size} ${eventos.map((e) => e.reg).join(',')}`
        expect(eObjetoSkc(estado.registro('objeto', 'OB-pipeline-1')!), como).toBe(false)
        expect(n.porNumero.has('CA00046'), como).toBe(false)
        expect(n.reservas.get('CA00046'), como).toBe('OB-pipeline-1')
        expect(n.porId.get('OB-pipeline-1'), como).toMatchObject({ numero: 'CA00046', situacao: 'confirmado', conflito: null, nrSkc: null })
        expect(n.porId.get('OB-pipeline-1')!.reserva, como).not.toBeNull()
        expect([...n.porNrSkc.values()], como).not.toContain('OB-pipeline-1')
        expect(n.porId.get('OB-aaaaaaaa-1'), como).toMatchObject({ numero: 'CA00047', nrSkc: 1 })
        expect(confirmacoes(n)[chaveDoNrSkc('OB-pipeline-1')], como).toBeUndefined()
        expect(n.rascunhos, como).not.toContain('OB-pipeline-1')
      }
    }
    // Sem número nenhum (só uma alteração qualquer chegou): nem rascunho, nem número provisório.
    const solta = numerar(fundir([alterar(B, 'OB-pipeline-2', { periodo: 'CA' }, T0 + 4000)]), pacoteCa(45), {})
    expect(solta.porNumero.size).toBe(0)
    expect(solta.rascunhos).toEqual([])
    expect(solta.porId.get('OB-pipeline-2')).toMatchObject({ nrSkc: null })
    // Uma entrada SKC: de reserva no mapa (escrita por uma consolidação de antes desta regra) é ignorada.
    const velho = numerar(fundir([x, testemunha]), pacoteCa(46), { ...confirmados, [chaveDoNrSkc('OB-pipeline-1')]: '2' })
    expect([...velho.porNrSkc.values()]).not.toContain('OB-pipeline-1')
  })

  it('dois confirmados com o mesmo número (só depois de um estado.json apagado): um fica, o outro sai como conflito, igual em qualquer ordem', () => {
    const x = criar(A, 1, { periodo: 'CA' }, T0 + 1000)
    const y = criar(B, 1, { periodo: 'CA' }, T0 + 2000)
    const tx = alterar(A, 'OB-aaaaaaaa-1', { numero: 'CA00046' }, T0 + 3000)
    const ty = alterar(B, 'OB-bbbbbbbb-1', { numero: 'CA00046' }, T0 + 4000)
    const n1 = numerar(fundir([x, y, tx, ty]), pacoteCa(45), {})
    const n2 = numerar(fundir([ty, tx, y, x]), pacoteCa(45), {})
    expect(num(n1, 'OB-aaaaaaaa-1')).toBe('CA00046')
    expect(num(n1, 'OB-bbbbbbbb-1')).toBe('CA00047')
    expect(n1.porId.get('OB-bbbbbbbb-1')!.conflito).toBe('skc')
    expect([...n1.porId]).toEqual([...n2.porId])
  })

  it('o resultado não depende da ordem dos eventos (a fusão é pura)', () => {
    const eventos = [
      criar(A, 1, { periodo: 'CA' }, T0 + 1000),
      criar(B, 1, { periodo: 'CA' }, T0 + 1000),
      criar(C, 1, { periodo: 'BA' }, T0 + 500),
      criar(C, 2, { periodo: null }, T0 + 600),
      alterar(C, 'OB-cccccccc-2', { periodo: 'CA' }, T0 + 800),
    ]
    const ref = JSON.stringify([...numerar(fundir(eventos), pacoteCa(45), {}).porId])
    const aleatorio = gerador(7)
    for (let i = 0; i < 50; i++) expect(JSON.stringify([...numerar(fundir(embaralhar(eventos, aleatorio)), pacoteCa(45), {}).porId])).toBe(ref)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// SKC, Nr. (decisão 38): 1, 2, 3… na ordem de criação, definitivo, nunca repetido; mesma máquina dos números do sistema.
// ---------------------------------------------------------------------------------------------------------------------

const nr = (n: Numeracao, id: string) => n.porId.get(id)?.nrSkc ?? null
const sitNr = (n: Numeracao, id: string) => n.porId.get(id)?.situacaoNrSkc ?? null

describe('SKC, Nr. (decisão 38)', () => {
  it('lê só inteiros positivos escritos em decimal; a chave no mapa é SKC:<id>', () => {
    expect(lerNrSkc('12')).toBe(12)
    expect(lerNrSkc('1')).toBe(1)
    for (const ruim of ['0', '012', '-1', '1.5', ' 12', '12 ', '１２', 12, null, '', '1e3', '1234567890']) expect(lerNrSkc(ruim)).toBeNull()
    expect(chaveDoNrSkc('OB-aaaaaaaa-1')).toBe('SKC:OB-aaaaaaaa-1')
  })

  it('todo objeto com número ganha SKC, Nr. 1, 2, 3 na ordem de criação; o rascunho não; ao ganhar o período, ganha no mesmo passo; a reserva nunca consome', () => {
    const x = criar(A, 1, { periodo: 'CA' }, T0 + 1000)
    const rascunho = criar(B, 1, { periodo: null }, T0 + 1500)
    const reserva = criar('pipeline', 1, { periodo: 'BA', reserva: 'TESTE II' }, T0 + 1800)
    const y = criar(C, 1, { periodo: 'BA' }, T0 + 2000)
    let n = numerar(fundir([y, reserva, rascunho, x]), pacoteCa(45), {})
    expect([nr(n, 'OB-aaaaaaaa-1'), nr(n, 'OB-cccccccc-1')]).toEqual([1, 2])
    expect(nr(n, 'OB-bbbbbbbb-1')).toBeNull()
    expect(nr(n, 'OB-pipeline-1')).toBeNull()
    expect(sitNr(n, 'OB-aaaaaaaa-1')).toBe('provisorio')
    expect(n.maiorNrSkc).toBe(2)
    expect(proximoNrSkc(fundir([y, reserva, rascunho, x]), pacoteCa(45), {})).toBe(3)
    const escolheu = alterar(B, 'OB-bbbbbbbb-1', { periodo: 'CA' }, T0 + 3000)
    n = numerar(fundir([x, rascunho, reserva, y, escolheu]), pacoteCa(45), {})
    expect(num(n, 'OB-bbbbbbbb-1')).toBe('CA00047')
    expect(nr(n, 'OB-bbbbbbbb-1')).toBe(3)
    expect(n.porNrSkc.get(3)).toBe('OB-bbbbbbbb-1')
  })

  it('provisório até confirmar: confirma pelo mapa (SKC:<id>) ou pela testemunha `nrSkc`; a consolidação confirma os dois números juntos', () => {
    const x = criar(A, 1, { periodo: 'CA', pedido: 'CA00046', pedidoNrSkc: '1' })
    const n = numerar(fundir([x]), pacoteCa(45), {})
    expect(sitNr(n, 'OB-aaaaaaaa-1')).toBe('provisorio')
    expect(confirmacoes(n)).toEqual({ 'OB-aaaaaaaa-1': 'CA00046', 'SKC:OB-aaaaaaaa-1': '1' })
    expect(n.nrSkcProvisorios).toEqual(['OB-aaaaaaaa-1'])
    const peloMapa = numerar(fundir([x]), pacoteCa(45), { 'OB-aaaaaaaa-1': 'CA00046', 'SKC:OB-aaaaaaaa-1': '1' })
    expect(sitNr(peloMapa, 'OB-aaaaaaaa-1')).toBe('confirmado')
    expect(peloMapa.nrSkcProvisorios).toEqual([])
    const testemunha = alterar(B, 'OB-aaaaaaaa-1', { numero: 'CA00046', nrSkc: '1' }, T0 + 5000)
    expect(sitNr(numerar(fundir([x, testemunha]), pacoteCa(45), {}), 'OB-aaaaaaaa-1')).toBe('confirmado')
    // Só o número do sistema confirmado (mapa antigo): o Nr. continua provisório e a consolidação ainda o confirma.
    const metade = numerar(fundir([x]), pacoteCa(45), { 'OB-aaaaaaaa-1': 'CA00046' })
    expect(sit(metade, 'OB-aaaaaaaa-1')).toBe('confirmado')
    expect(sitNr(metade, 'OB-aaaaaaaa-1')).toBe('provisorio')
    expect(metade.nrSkcProvisorios).toEqual(['OB-aaaaaaaa-1'])
  })

  it('colisão: dois aparelhos offline criam SKC, Nr. 1; o de hlc menor fica com ele, o outro recebe o 2 e o aviso, em qualquer ordem', () => {
    // O id de B é maior que o de A, mas o hlc de B é MENOR: quem decide é o hlc.
    const deB = criar(B, 1, { periodo: 'CA', pedidoNrSkc: '1' }, T0 + 1000)
    const deA = criar(A, 1, { periodo: 'BA', pedidoNrSkc: '1' }, T0 + 2000)
    for (const ordem of [[deA, deB], [deB, deA]]) {
      const n = numerar(fundir(ordem), pacoteCa(45), {})
      expect(nr(n, 'OB-bbbbbbbb-1')).toBe(1)
      expect(nr(n, 'OB-aaaaaaaa-1')).toBe(2)
      expect(n.porId.get('OB-aaaaaaaa-1')).toMatchObject({ pedidoNrSkc: 1, mudouNrSkc: true })
      expect(n.porId.get('OB-bbbbbbbb-1')).toMatchObject({ pedidoNrSkc: 1, mudouNrSkc: false })
    }
  })

  it('um objeto de hlc mais antigo que chega depois de um SKC, Nr. confirmado NÃO o toma', () => {
    const antigo = criar(A, 1, { periodo: 'CA', pedidoNrSkc: '1' }, T0 + 1000)
    const novo = criar(B, 1, { periodo: 'CA', pedidoNrSkc: '1' }, T0 + 9000)
    const n = numerar(fundir([antigo, novo]), pacoteCa(45), { 'OB-bbbbbbbb-1': 'CA00046', 'SKC:OB-bbbbbbbb-1': '1' })
    expect(nr(n, 'OB-bbbbbbbb-1')).toBe(1)
    expect(sitNr(n, 'OB-bbbbbbbb-1')).toBe('confirmado')
    expect(nr(n, 'OB-aaaaaaaa-1')).toBe(2)
    expect(n.porId.get('OB-aaaaaaaa-1')!.mudouNrSkc).toBe(true)
  })

  it('excluído confirmado guarda o SKC, Nr. (nunca reutilizado); excluído sem confirmação não ocupa', () => {
    const x = criar(A, 1, { periodo: 'CA' }, T0 + 1000)
    const fora = alterar(A, 'OB-aaaaaaaa-1', {}, T0 + 2000, 'excluir')
    const y = criar(A, 2, { periodo: 'CA' }, T0 + 3000)
    const confirmado = numerar(fundir([x, fora, y]), pacoteCa(45), { 'OB-aaaaaaaa-1': 'CA00046', 'SKC:OB-aaaaaaaa-1': '1' })
    expect(nr(confirmado, 'OB-aaaaaaaa-1')).toBe(1)
    expect(nr(confirmado, 'OB-aaaaaaaa-2')).toBe(2)
    expect(proximoNrSkc(fundir([x, fora, y]), pacoteCa(45), { 'OB-aaaaaaaa-1': 'CA00046', 'SKC:OB-aaaaaaaa-1': '1' })).toBe(3)
    // Pela testemunha (sem o mapa, como num aparelho novo depois de um estado.json apagado): o mesmo.
    const tx = alterar(B, 'OB-aaaaaaaa-1', { numero: 'CA00046', nrSkc: '1' }, T0 + 1500)
    expect(nr(numerar(fundir([x, tx, fora, y]), pacoteCa(45), {}), 'OB-aaaaaaaa-2')).toBe(2)
    // Um id do mapa sem registro também ocupa o Nr.
    expect(nr(numerar(fundir([y]), pacoteCa(45), { 'SKC:OB-cccccccc-9': '1' }), 'OB-aaaaaaaa-2')).toBe(2)
    const semConfirmar = numerar(fundir([x, fora, y]), pacoteCa(45), {})
    expect(nr(semConfirmar, 'OB-aaaaaaaa-1')).toBeNull()
    expect(nr(semConfirmar, 'OB-aaaaaaaa-2')).toBe(1)
  })

  it('dois confirmados com o mesmo SKC, Nr. (só depois de um estado.json apagado): fica o de menor (hlc, id), o outro sai como conflito', () => {
    const x = criar(A, 1, { periodo: 'CA' }, T0 + 2000)
    const y = criar(B, 1, { periodo: 'CA' }, T0 + 1000)
    const tx = alterar(A, 'OB-aaaaaaaa-1', { nrSkc: '1' }, T0 + 3000)
    const ty = alterar(B, 'OB-bbbbbbbb-1', { nrSkc: '1' }, T0 + 4000)
    const n1 = numerar(fundir([x, y, tx, ty]), pacoteCa(45), {})
    const n2 = numerar(fundir([ty, tx, y, x]), pacoteCa(45), {})
    expect(nr(n1, 'OB-bbbbbbbb-1')).toBe(1)
    expect(nr(n1, 'OB-aaaaaaaa-1')).toBe(2)
    expect(n1.porId.get('OB-aaaaaaaa-1')!.conflitoNrSkc).toBe(true)
    expect(sitNr(n1, 'OB-aaaaaaaa-1')).toBe('provisorio')
    expect([...n1.porId]).toEqual([...n2.porId])
  })

  it('a união dos mapas: SKC:<id> com dois valores fica com o MENOR número (não o menor texto); entradas malformadas não entram', () => {
    const a = { 'SKC:OB-aaaaaaaa-1': '9', 'OB-aaaaaaaa-1': 'CA00046' }
    const b = { 'SKC:OB-aaaaaaaa-1': '12' }
    expect(unirConfirmados(a, b)).toEqual(unirConfirmados(b, a))
    expect(unirConfirmados(a, b)['SKC:OB-aaaaaaaa-1']).toBe('9')
    expect(unirConfirmados({ 'SKC:x': '1', 'SKC:OB-aaaaaaaa-2': '0', 'SKC:OB-aaaaaaaa-3': 'CA00001', 'OB-aaaaaaaa-4': '3' }, {})).toEqual({})
  })

  it('testemunhas: o que falta escrever (`numero` e/ou `nrSkc`), num evento por objeto', () => {
    const e = fundir([criar(A, 1, { periodo: 'CA' }), criar(A, 2, { periodo: 'CA' }), alterar(A, 'OB-aaaaaaaa-2', { numero: 'CA00047' }, T0 + 5)])
    const mapa = { 'OB-aaaaaaaa-1': 'CA00046', 'SKC:OB-aaaaaaaa-1': '1', 'OB-aaaaaaaa-2': 'CA00047', 'SKC:OB-aaaaaaaa-2': '2', 'SKC:OB-cccccccc-9': '3' }
    expect(testemunhasFaltando(e, mapa)).toEqual([
      { id: 'OB-aaaaaaaa-1', campos: { numero: 'CA00046', nrSkc: '1' } },
      { id: 'OB-aaaaaaaa-2', campos: { nrSkc: '2' } },
    ])
  })
})

describe('mapa de confirmados', () => {
  it('a união é a mesma em qualquer ordem; um id com dois números (só com falha dupla) fica com o menor', () => {
    const a = { 'OB-aaaaaaaa-1': 'CA00046', 'OB-aaaaaaaa-2': 'CA00048' }
    const b = { 'OB-bbbbbbbb-1': 'CA00047', 'OB-aaaaaaaa-2': 'CA00047' }
    expect(unirConfirmados(a, b)).toEqual(unirConfirmados(b, a))
    expect(unirConfirmados(a, b)['OB-aaaaaaaa-2']).toBe('CA00047')
    // Entradas malformadas não entram.
    expect(unirConfirmados({ 'x': 'CA00001', 'OB-aaaaaaaa-3': 'zz' } as Record<string, string>, {})).toEqual({})
  })

  it('testemunhas: os confirmados cujo registro existe e ainda não tem o campo `numero`', () => {
    const e = fundir([criar(A, 1, { periodo: 'CA' }), criar(A, 2, { periodo: 'CA' }), alterar(A, 'OB-aaaaaaaa-2', { numero: 'CA00047' }, T0 + 5)])
    expect(testemunhasFaltando(e, { 'OB-aaaaaaaa-1': 'CA00046', 'OB-aaaaaaaa-2': 'CA00047', 'OB-cccccccc-9': 'CA00048' })).toEqual([{ id: 'OB-aaaaaaaa-1', campos: { numero: 'CA00046' } }])
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Sondas de convergência (no estilo das da Tarefa 7): três aparelhos, eventos que sobem e chegam em ordens embaralhadas,
// consolidações com escrita condicional (a cadeia do estado.json) e chegadas tardias.
// ---------------------------------------------------------------------------------------------------------------------

interface Ap {
  id: string
  ms: number
  n: number
  conhecidos: Map<string, Evento>
  fila: Evento[]
  confirmados: Record<string, string>
}

interface Nuvem {
  segmentos: Evento[]
  /** A cabeça da cadeia do estado.json (a escrita condicional garante que quem grava leu a anterior). */
  mapa: Record<string, string>
  base: Map<string, Evento>
}

const PACOTE = pacoteCa(45)

function sondar(semente: number, passos: number) {
  const aleatorio = gerador(semente)
  const aps: Ap[] = [A, B, C].map((id) => ({ id, ms: T0, n: 0, conhecidos: new Map(), fila: [], confirmados: {} }))
  const nuvem: Nuvem = { segmentos: [], mapa: {}, base: new Map() }
  /** Tudo o que uma cadeia já confirmou, com o primeiro número (nunca pode mudar). */
  const primeiroConfirmado = new Map<string, string>()
  let seq = 0

  const estadoDe = (a: Ap): Estado => fundir([...a.conhecidos.values()])
  const evento = (a: Ap, reg: string, op: 'criar' | 'alterar' | 'excluir', campos: Record<string, Json>): Evento => {
    a.ms += 1 + Math.floor(aleatorio() * 3000)
    const e: Evento = { v: 1, id: `${a.id}-${++seq}-0`, hlc: hlc(a.ms, 0, a.id), aparelho: a.id, tipo: 'objeto', reg, op, campos }
    a.conhecidos.set(e.id, e)
    a.fila.push(e)
    return e
  }
  const receber = (a: Ap, eventos: Iterable<Evento>) => {
    for (const e of eventos) {
      a.conhecidos.set(e.id, e)
      a.ms = Math.max(a.ms, Number(e.hlc.slice(0, 13)))
    }
  }
  const baixar = (a: Ap, quantos = Infinity) => {
    // Chegada tardia: às vezes só uma parte dos segmentos, em ordem embaralhada.
    receber(a, embaralhar(nuvem.segmentos, aleatorio).slice(0, quantos))
  }
  const baixarEstado = (a: Ap) => {
    receber(a, nuvem.base.values())
    a.confirmados = unirConfirmados(a.confirmados, nuvem.mapa)
  }
  const enviar = (a: Ap) => {
    nuvem.segmentos.push(...a.fila)
    a.fila = []
  }
  const consolidar = (a: Ap) => {
    // Uma rodada: baixa o estado.json e os segmentos, envia, consolida (sempre por cima da cabeça que acabou de ler).
    baixarEstado(a)
    baixar(a)
    enviar(a)
    const e = estadoDe(a)
    const novo = unirConfirmados(a.confirmados, confirmacoes(numerar(e, PACOTE, a.confirmados)))
    for (const [id, n] of Object.entries(nuvem.mapa)) expect(novo[id], `a cadeia nunca perde ${id}`).toBe(n)
    nuvem.mapa = novo
    for (const ev of a.conhecidos.values()) nuvem.base.set(ev.id, ev)
    a.confirmados = novo
    for (const [id, n] of Object.entries(novo)) if (!primeiroConfirmado.has(id)) primeiroConfirmado.set(id, n)
    // As testemunhas (como depois de uma consolidação de verdade).
    for (const t of testemunhasFaltando(estadoDe(a), novo)) evento(a, t.id, 'alterar', t.campos)
  }
  const conferir = (a: Ap) => {
    const n = numerar(estadoDe(a), PACOTE, a.confirmados)
    const vistos = new Set<string>()
    const nrsVistos = new Set<number>()
    for (const [id, info] of n.porId) {
      // SKC, Nr. (decisão 38): nunca repetido, nunca numa reserva, e o confirmado nunca muda.
      // (Sem `expect` no laço quente: as sondas chamam isto dezenas de milhares de vezes.)
      const primeiroNr = primeiroConfirmado.get(chaveDoNrSkc(id))
      if (info.nrSkc !== null) {
        if (nrsVistos.has(info.nrSkc)) throw new Error(`SKC, Nr. ${info.nrSkc} repetido em ${a.id}`)
        nrsVistos.add(info.nrSkc)
        if (info.reserva !== null) throw new Error(`SKC, Nr. numa reserva (${id})`)
        if (info.numero === null) throw new Error(`SKC, Nr. sem número do sistema (${id})`)
        if (info.situacaoNrSkc === 'confirmado' && primeiroNr && String(info.nrSkc) !== primeiroNr) throw new Error(`SKC, Nr. confirmado de ${id} mudou em ${a.id}: ${primeiroNr} → ${info.nrSkc}`)
      }
      if (primeiroNr && a.confirmados[chaveDoNrSkc(id)] && String(info.nrSkc) !== primeiroNr) throw new Error(`SKC, Nr. confirmado de ${id} em ${a.id}: ${primeiroNr} → ${info.nrSkc}`)
      if (info.numero === null) continue
      expect(vistos.has(info.numero), `número repetido ${info.numero} em ${a.id}`).toBe(false)
      vistos.add(info.numero)
      expect(PACOTE.has(info.numero) && !info.reserva, `número do livro ${info.numero} dado a ${id}`).toBe(false)
      const primeiro = primeiroConfirmado.get(id)
      if (info.situacao === 'confirmado' && primeiro) expect(info.numero, `confirmado ${id} mudou em ${a.id}`).toBe(primeiro)
    }
    for (const [id, primeiro] of primeiroConfirmado) {
      const info = n.porId.get(id)
      if (info && a.confirmados[id]) expect(info.numero, `confirmado ${id} em ${a.id}`).toBe(primeiro)
    }
    return n
  }

  for (let p = 0; p < passos; p++) {
    const a = aps[Math.floor(aleatorio() * aps.length)]!
    const r = aleatorio()
    if (r < 0.3) {
      const periodo = aleatorio() < 0.15 ? null : aleatorio() < 0.7 ? 'CA' : 'BA'
      const id = `OB-${a.id}-${++a.n}`
      // O que a tela mostraria (proximoNumero e proximoNrSkc), de uma só numeração.
      const agora = numerar(estadoDe(a), PACOTE, a.confirmados)
      const pedido = periodo ? formatarNumero(periodo, (agora.maiores.get(periodo) ?? 0) + 1) : null
      const pedidoNrSkc = periodo ? String(agora.maiorNrSkc + 1) : null
      evento(a, id, 'criar', { periodo, pedido, pedidoNrSkc })
    } else if (r < 0.37) {
      // Escolher o período de um rascunho.
      const rascunhos = numerar(estadoDe(a), PACOTE, a.confirmados).rascunhos
      if (rascunhos.length) evento(a, rascunhos[0]!, 'alterar', { periodo: 'CA', pedido: proximoNumero('CA', estadoDe(a), PACOTE, a.confirmados) })
    } else if (r < 0.42) {
      const ids = [...numerar(estadoDe(a), PACOTE, a.confirmados).porId.keys()]
      if (ids.length) evento(a, ids[Math.floor(aleatorio() * ids.length)]!, 'excluir', {})
    } else if (r < 0.62) enviar(a)
    else if (r < 0.8) baixar(a, Math.floor(aleatorio() * 4))
    else if (r < 0.87) baixarEstado(a)
    else consolidar(a)
    for (const x of aps) conferir(x)
  }
  // Todos voltam: enviam, um consolida, todos baixam tudo, outro consolida, todos baixam de novo.
  for (const a of aps) enviar(a)
  consolidar(aps[0]!)
  for (const a of aps) consolidar(a)
  for (const a of aps) {
    baixarEstado(a)
    baixar(a)
  }
  const finais = aps.map((a) => JSON.stringify([...conferir(a).porId].sort()))
  expect(finais[1]).toBe(finais[0])
  expect(finais[2]).toBe(finais[0])
  // No fim nada fica provisório: tudo o que tem período foi confirmado, com o primeiro número que recebeu.
  const n = numerar(estadoDe(aps[0]!), PACOTE, aps[0]!.confirmados)
  for (const [id, info] of n.porId) {
    if (info.situacao === 'provisorio') throw new Error(`${id} ainda provisório`)
    if (info.situacaoNrSkc === 'provisorio') throw new Error(`SKC, Nr. de ${id} ainda provisório`)
    if (primeiroConfirmado.has(id) && info.numero !== null) expect(info.numero).toBe(primeiroConfirmado.get(id))
    if (primeiroConfirmado.has(chaveDoNrSkc(id))) expect(String(info.nrSkc)).toBe(primeiroConfirmado.get(chaveDoNrSkc(id)))
    // Todo objeto vivo com número tem o seu SKC, Nr.
    if (info.numero !== null && !info.reserva && info.situacao !== 'excluido') expect(info.nrSkc, `${id} sem SKC, Nr.`).not.toBeNull()
  }
  const nrs = [...n.porId.values()].map((i) => i.nrSkc).filter((x): x is number => x !== null)
  return { confirmados: primeiroConfirmado.size, nrs: nrs.length }
}

describe('sondas de convergência: três aparelhos, eventos embaralhados, chegadas tardias', () => {
  it('em 120 sementes: nunca número repetido, confirmado nunca muda, todos convergem', () => {
    let total = 0
    let nrs = 0
    for (let s = 1; s <= 120; s++) {
      const r = sondar(s, 60)
      total += r.confirmados
      nrs += r.nrs
    }
    expect(total).toBeGreaterThan(300)
    // As sondas exercitam o SKC, Nr. de verdade (não só objetos sem número).
    expect(nrs).toBeGreaterThan(150)
  }, 30_000)

  it('roteiro: C offline cria (hlc mais antigo) e só aparece depois que A e B já confirmaram; ninguém perde o número', () => {
    const antigoDeC = criar(C, 1, { periodo: 'CA', pedido: 'CA00046' }, T0 + 1)
    const deA = criar(A, 1, { periodo: 'CA', pedido: 'CA00046' }, T0 + 5000)
    const deB = criar(B, 1, { periodo: 'CA', pedido: 'CA00047' }, T0 + 9000)
    const confirmados = confirmacoes(numerar(fundir([deA, deB]), PACOTE, {}))
    expect(confirmados).toEqual({ 'OB-aaaaaaaa-1': 'CA00046', 'OB-bbbbbbbb-1': 'CA00047', 'SKC:OB-aaaaaaaa-1': '1', 'SKC:OB-bbbbbbbb-1': '2' })
    for (const ordem of [[antigoDeC, deA, deB], [deB, antigoDeC, deA], [deA, deB, antigoDeC]]) {
      const n = numerar(fundir(ordem), PACOTE, confirmados)
      expect(num(n, 'OB-aaaaaaaa-1')).toBe('CA00046')
      expect(num(n, 'OB-bbbbbbbb-1')).toBe('CA00047')
      expect(num(n, 'OB-cccccccc-1')).toBe('CA00048')
      expect(n.porId.get('OB-cccccccc-1')!.mudou).toBe(true)
    }
  })
})
