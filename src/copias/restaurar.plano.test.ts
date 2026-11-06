/**
 * `planoDeRestauracao` (2C, bloco 1, Tarefa 7; especificação §6.2, escolha B do usuário): o que uma cópia traz de volta,
 * calculado contra o estado de agora, sem mudar nada. Puro. Dados sintéticos (TESTE).
 */
import { A, B, C, ev, hlc, T0 } from '../../tests/suporte/eventosDeTeste'
import type { PedidoDeEvento } from '../usuario/armazem'
import type { Evento } from '../usuario/eventos'
import { FORMATO_DA_COPIA, type CopiaDeSeguranca } from '../usuario/exportar'
import { consolidar, estadoCanonico, fundir, type EstadoConsolidado } from '../usuario/fusao'
import { dataDaCopia, planoDeRestauracao, temAlgoATrazer, textoDoRestaurado, textoDoResumo } from './restaurar'

/** Este aparelho (o que restaura): os eventos novos são dele. */
const D = 'dddddddd'

function copiaDe(eventos: Evento[], extra: Partial<CopiaDeSeguranca> = {}): CopiaDeSeguranca {
  const base = extra.base ?? null
  return {
    formato: FORMATO_DA_COPIA,
    versao: 1,
    geradoEm: new Date(T0 + 100_000).toISOString(),
    aparelho: { id: A, nome: 'Mac' },
    aparelhos: { [A]: 'Mac' },
    eventos,
    naoEnviados: [],
    base,
    estado: consolidar(fundir(eventos, base ?? undefined)),
    marcas: {},
    numerosConfirmados: {},
    imagens: [],
    observacoes: [],
    ...extra,
  }
}

/**
 * Os pedidos como `registrarVarios` os gravaria neste aparelho (D): uma transação, um seq, hlc depois de tudo o que se
 * conhece (o relógio já avançou além da cópia).
 */
function comoEventos(pedidos: readonly PedidoDeEvento[], seq: number, ms = T0 + 10_000_000): Evento[] {
  return pedidos.map((p, n) => ({ v: 1, id: `${D}-${seq}-${n}`, hlc: hlc(ms, n, D), aparelho: D, tipo: p.tipo, reg: p.reg, op: p.op, campos: p.campos }))
}

const NADA = 'Esta cópia não tem nada que falte aqui.'
const nota = (ap: string, seq: number, reg: string, op: Evento['op'], campos: Evento['campos'] = {}, ms?: number) => ev({ ap, seq, tipo: 'nota', reg, op, campos, ms })

describe('planoDeRestauracao', () => {
  it('estado atual vazio: tudo volta, em ordem (tipo, id), e a fusão do resultado tem os mesmos valores atuais da cópia', () => {
    const eventos = [
      nota(A, 1, 'NT-aaaaaaaa-2', 'criar', { texto: 'segunda TESTE', alvo: 'CA00001' }),
      nota(A, 2, 'NT-aaaaaaaa-1', 'criar', { texto: 'primeira TESTE', alvo: 'CA00001' }),
      nota(A, 3, 'NT-aaaaaaaa-1', 'alterar', { texto: 'primeira TESTE, editada' }),
      ev({ ap: A, seq: 4, tipo: 'colecao', reg: 'CO-aaaaaaaa-1', op: 'criar', campos: { nome: 'Coleção TESTE', membros: [{ ref: 'CA00001' }] } }),
      ev({ ap: A, seq: 5, tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'criar', campos: { periodo: 'CA', titulo: 'Objeto TESTE' } }),
    ]
    const copia = copiaDe(eventos)
    const plano = planoDeRestauracao(copia, fundir([]))

    expect(plano.pedidos.map((p) => `${p.tipo} ${p.reg} ${p.op}`)).toEqual([
      'colecao CO-aaaaaaaa-1 criar',
      'nota NT-aaaaaaaa-1 criar',
      'nota NT-aaaaaaaa-2 criar',
      'objeto OB-aaaaaaaa-1 criar',
    ])
    expect(plano.pedidos[1]!.campos).toEqual({ alvo: 'CA00001', texto: 'primeira TESTE, editada' })
    expect(plano.trazidos).toEqual({ colecao: 1, nota: 2, objeto: 1 })
    expect(plano.atualizados).toBe(0)
    expect(plano.imagens).toEqual([])

    const depois = fundir(comoEventos(plano.pedidos, 1))
    const daCopia = fundir(eventos)
    for (const [tipo, m] of daCopia.registros) {
      for (const [id, r] of m) {
        expect(depois.registro(tipo, id)?.campos, `${tipo} ${id}`).toEqual(r.campos)
        expect(depois.registro(tipo, id)?.excluido).toBe(r.excluido)
      }
    }
  })

  it('campo mais novo aqui fica; campo mais novo na cópia vira um `alterar`; os `alterar` de um registro vão num só pedido', () => {
    const criar = nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'TESTE', alvo: 'CA00001', cor: 'azul' }, T0)
    // Na cópia: o texto e a cor mudaram depois (T0 + 50 s e + 60 s).
    const copia = copiaDe([criar, nota(A, 2, 'NT-aaaaaaaa-1', 'alterar', { texto: 'texto da cópia' }, T0 + 50_000), nota(A, 3, 'NT-aaaaaaaa-1', 'alterar', { cor: 'verde' }, T0 + 60_000)])
    // Aqui: o alvo mudou depois da cópia (T0 + 90 s); o texto e a cor são os de antes.
    const atual = fundir([criar, nota(B, 1, 'NT-aaaaaaaa-1', 'alterar', { alvo: 'CA00002' }, T0 + 90_000)])
    const plano = planoDeRestauracao(copia, atual)
    expect(plano.pedidos).toEqual([{ tipo: 'nota', reg: 'NT-aaaaaaaa-1', op: 'alterar', campos: { cor: 'verde', texto: 'texto da cópia' } }])
    expect(plano.trazidos).toEqual({})
    expect(plano.atualizados).toBe(1)
  })

  it('campo mais novo aqui não é tocado, nem com valor diferente', () => {
    const criar = nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'TESTE' }, T0)
    const copia = copiaDe([criar, nota(A, 2, 'NT-aaaaaaaa-1', 'alterar', { texto: 'antigo' }, T0 + 10_000)])
    const atual = fundir([criar, nota(B, 1, 'NT-aaaaaaaa-1', 'alterar', { texto: 'novo daqui' }, T0 + 20_000)])
    const plano = planoDeRestauracao(copia, atual)
    expect(plano.pedidos).toEqual([])
    expect(plano.atualizados).toBe(0)
  })

  it('excluído aqui depois da cópia: continua excluído', () => {
    const criar = nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'TESTE' }, T0)
    const copia = copiaDe([criar])
    const atual = fundir([criar, nota(B, 1, 'NT-aaaaaaaa-1', 'excluir', {}, T0 + 50_000)])
    const plano = planoDeRestauracao(copia, atual)
    expect(plano.pedidos).toEqual([])
    // E com uma restauração antiga na cópia (antes da exclusão daqui).
    const copia2 = copiaDe([criar, nota(A, 2, 'NT-aaaaaaaa-1', 'excluir', {}, T0 + 10_000), nota(A, 3, 'NT-aaaaaaaa-1', 'restaurar', {}, T0 + 20_000)])
    expect(planoDeRestauracao(copia2, atual).pedidos).toEqual([])
  })

  it('excluído na cópia e restaurado aqui depois: continua restaurado', () => {
    const criar = nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'TESTE' }, T0)
    const excluir = nota(A, 2, 'NT-aaaaaaaa-1', 'excluir', {}, T0 + 10_000)
    const copia = copiaDe([criar, excluir])
    const atual = fundir([criar, excluir, nota(B, 1, 'NT-aaaaaaaa-1', 'restaurar', {}, T0 + 30_000)])
    const plano = planoDeRestauracao(copia, atual)
    expect(plano.pedidos).toEqual([])
    expect(plano.atualizados).toBe(0)
  })

  it('excluído na cópia depois do que está aqui: `excluir`; restaurado na cópia depois: `restaurar`', () => {
    const criar = nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'TESTE' }, T0)
    const excluir = nota(A, 2, 'NT-aaaaaaaa-1', 'excluir', {}, T0 + 10_000)
    expect(planoDeRestauracao(copiaDe([criar, excluir]), fundir([criar])).pedidos).toEqual([{ tipo: 'nota', reg: 'NT-aaaaaaaa-1', op: 'excluir', campos: {} }])
    const restaurar = nota(A, 3, 'NT-aaaaaaaa-1', 'restaurar', {}, T0 + 20_000)
    const plano = planoDeRestauracao(copiaDe([criar, excluir, restaurar]), fundir([criar, excluir]))
    expect(plano.pedidos).toEqual([{ tipo: 'nota', reg: 'NT-aaaaaaaa-1', op: 'restaurar', campos: {} }])
    expect(plano.atualizados).toBe(1)
  })

  it('a marca empata no hlc e desempata pelo id do evento, como a fusão', () => {
    const criar = nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'TESTE' }, T0)
    const h = hlc(T0 + 10_000, 0, A)
    const copia = copiaDe([criar, ev({ ap: A, seq: 9, h, tipo: 'nota', reg: 'NT-aaaaaaaa-1', op: 'excluir' })])
    // Aqui, uma marca com o mesmo hlc e um id de evento menor (um aparelho com defeito): a da cópia vence.
    const atual = fundir([criar, ev({ ap: A, seq: 2, h, tipo: 'nota', reg: 'NT-aaaaaaaa-1', op: 'restaurar' })])
    expect(planoDeRestauracao(copia, atual).pedidos.map((p) => p.op)).toEqual(['excluir'])
    // A mesma marca dos dois lados: nada.
    expect(planoDeRestauracao(copia, fundir(copia.eventos)).pedidos).toEqual([])
  })

  it('registro só na cópia e excluído nela: volta excluído (`criar` e `excluir`)', () => {
    const eventos = [nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'TESTE' }, T0), nota(A, 2, 'NT-aaaaaaaa-1', 'excluir', {}, T0 + 10_000)]
    const plano = planoDeRestauracao(copiaDe(eventos), fundir([]))
    expect(plano.pedidos).toEqual([
      { tipo: 'nota', reg: 'NT-aaaaaaaa-1', op: 'criar', campos: { texto: 'TESTE' } },
      { tipo: 'nota', reg: 'NT-aaaaaaaa-1', op: 'excluir', campos: {} },
    ])
    expect(plano.trazidos).toEqual({ nota: 1 })
    expect(fundir(comoEventos(plano.pedidos, 1)).registro('nota', 'NT-aaaaaaaa-1')?.excluido).toBe(true)
  })

  it('testemunha do número: objeto confirmado na cópia sem o campo `numero` ganha `alterar {numero, nrSkc}`; com o campo, nada', () => {
    const criar = ev({ ap: A, seq: 1, tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'criar', campos: { periodo: 'CA', titulo: 'Objeto TESTE' } })
    const numerosConfirmados = { 'OB-aaaaaaaa-1': 'CA00046', 'SKC:OB-aaaaaaaa-1': '12' }
    // Ausente aqui: criar e, depois, a testemunha.
    const plano = planoDeRestauracao(copiaDe([criar], { numerosConfirmados }), fundir([]))
    expect(plano.pedidos).toEqual([
      { tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'criar', campos: { periodo: 'CA', titulo: 'Objeto TESTE' } },
      { tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'alterar', campos: { numero: 'CA00046', nrSkc: '12' } },
    ])
    expect(plano.trazidos).toEqual({ objeto: 1 })
    // Presente aqui, com um campo mais novo na cópia: a testemunha vai no mesmo `alterar`.
    const titulo = ev({ ap: A, seq: 2, tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'alterar', campos: { titulo: 'Objeto TESTE, revisto' } })
    const plano2 = planoDeRestauracao(copiaDe([criar, titulo], { numerosConfirmados }), fundir([criar]))
    expect(plano2.pedidos).toEqual([{ tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'alterar', campos: { nrSkc: '12', numero: 'CA00046', titulo: 'Objeto TESTE, revisto' } }])
    expect(plano2.atualizados).toBe(1)
    // A testemunha já está aqui (ou vem da cópia): nada a mais.
    const testemunha = ev({ ap: B, seq: 1, tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'alterar', campos: { numero: 'CA00046', nrSkc: '12' } })
    expect(planoDeRestauracao(copiaDe([criar], { numerosConfirmados }), fundir([criar, testemunha])).pedidos).toEqual([])
    const comTestemunha = planoDeRestauracao(copiaDe([criar, testemunha], { numerosConfirmados }), fundir([]))
    expect(comTestemunha.pedidos).toHaveLength(1)
    expect(comTestemunha.pedidos[0]!.campos).toMatchObject({ numero: 'CA00046', nrSkc: '12' })
    // Número inválido no mapa: nenhuma testemunha.
    expect(planoDeRestauracao(copiaDe([criar], { numerosConfirmados: { 'OB-aaaaaaaa-1': 'XX1' } }), fundir([criar])).pedidos).toEqual([])
  })

  it('idempotência: aplicar o plano e planejar de novo dá zero pedidos (também com o que mudou aqui e na cópia)', () => {
    const base = [
      nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'TESTE' }, T0),
      nota(A, 2, 'NT-aaaaaaaa-2', 'criar', { texto: 'TESTE 2' }, T0 + 1000),
      ev({ ap: A, seq: 3, tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'criar', campos: { periodo: 'CA', titulo: 'Objeto TESTE' }, ms: T0 + 2000 }),
      ev({ ap: A, seq: 4, tipo: 'imagem', reg: 'IM-aaaaaaaa-1', op: 'criar', campos: { alvoTipo: 'objeto', alvo: 'OB-aaaaaaaa-1', formato: 'webp', extensao: 'jpg', nome: 'foto.jpg' }, ms: T0 + 3000 }),
    ]
    const copia = copiaDe(
      [
        ...base,
        nota(A, 5, 'NT-aaaaaaaa-1', 'alterar', { texto: 'da cópia' }, T0 + 50_000),
        nota(A, 6, 'NT-aaaaaaaa-2', 'excluir', {}, T0 + 51_000),
        nota(A, 7, 'NT-aaaaaaaa-3', 'criar', { texto: 'só na cópia' }, T0 + 52_000),
      ],
      { numerosConfirmados: { 'OB-aaaaaaaa-1': 'CA00046' } },
    )
    const aqui = [base[0]!, base[1]!, nota(B, 1, 'NT-aaaaaaaa-1', 'alterar', { alvo: 'CA00009' }, T0 + 90_000)]
    const plano = planoDeRestauracao(copia, fundir(aqui))
    expect(plano.pedidos.length).toBeGreaterThan(0)
    const depois = fundir([...aqui, ...comoEventos(plano.pedidos, 1)])
    const segundo = planoDeRestauracao(copia, depois)
    expect(segundo.pedidos).toEqual([])
    expect(segundo.trazidos).toEqual({})
    expect(segundo.atualizados).toBe(0)
    // O que mudou aqui depois da cópia continua valendo.
    expect(depois.registro('nota', 'NT-aaaaaaaa-1')?.campos).toEqual({ alvo: 'CA00009', texto: 'da cópia' })
  })

  it('idempotência com uma cópia aleatória de três aparelhos e um estado aqui que só tem parte dela', () => {
    const todos: Evento[] = []
    for (let i = 1; i <= 30; i++) {
      const ap = [A, B, C][i % 3]!
      const reg = `NT-${A}-${(i % 5) + 1}`
      const op = i <= 5 ? 'criar' : i % 7 === 0 ? 'excluir' : i % 11 === 0 ? 'restaurar' : 'alterar'
      todos.push(nota(ap, i, reg, op, op === 'excluir' || op === 'restaurar' ? {} : { texto: `v${i}`, [`c${i % 3}`]: i }, T0 + i * 1000))
    }
    const copia = copiaDe(todos)
    const aqui = todos.filter((_, i) => i % 2 === 0)
    const plano = planoDeRestauracao(copia, fundir(aqui))
    const depois = fundir([...aqui, ...comoEventos(plano.pedidos, 1)])
    expect(planoDeRestauracao(copia, depois).pedidos).toEqual([])
    // Nada aqui era mais novo que a cópia: o resultado tem os valores e as exclusões da cópia.
    const daCopia = fundir(todos)
    for (const [id, r] of daCopia.registros.get('nota')!) {
      expect(depois.registro('nota', id)?.campos).toEqual(r.campos)
      expect(depois.registro('nota', id)?.excluido).toBe(r.excluido)
    }
  })

  it('foco 2: com eventos locais pendentes (não enviados), uma cópia que já os tem não os repete', () => {
    // Este aparelho (D) criou e editou e ainda não enviou; a cópia foi feita aqui mesmo, com esses eventos dentro.
    const pendentes = [
      ev({ ap: D, seq: 1, tipo: 'nota', reg: `NT-${D}-1`, op: 'criar', campos: { texto: 'pendente TESTE' } }),
      ev({ ap: D, seq: 2, tipo: 'nota', reg: `NT-${D}-1`, op: 'alterar', campos: { texto: 'pendente TESTE, editada' } }),
    ]
    const enviados = [nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'TESTE' })]
    const copia = copiaDe([...enviados, ...pendentes], { aparelho: { id: D, nome: 'iPhone' }, naoEnviados: pendentes.map((e) => e.id) })
    expect(planoDeRestauracao(copia, fundir([...enviados, ...pendentes])).pedidos).toEqual([])
    // Pendentes AQUI que a cópia não tem (feitas depois dela): ficam como estão, sem nada a mais.
    const depoisDaCopia = ev({ ap: D, seq: 3, tipo: 'nota', reg: `NT-${D}-1`, op: 'alterar', campos: { texto: 'mais nova, ainda por enviar' } })
    expect(planoDeRestauracao(copia, fundir([...enviados, ...pendentes, depoisDaCopia])).pedidos).toEqual([])
  })

  it('foco 3: cópia de aparelhos de ids desconhecidos; os pedidos não levam aparelho e os ids dos registros continuam os da cópia', () => {
    const eventos = [
      ev({ ap: 'zzzzzzzz', seq: 1, tipo: 'nota', reg: 'NT-zzzzzzzz-1', op: 'criar', campos: { texto: 'de outro aparelho' } }),
      ev({ ap: 'yyyyyyyy', seq: 1, tipo: 'objeto', reg: 'OB-yyyyyyyy-4', op: 'criar', campos: { periodo: 'CA', titulo: 'Objeto TESTE de outra conta' } }),
    ]
    const plano = planoDeRestauracao(copiaDe(eventos, { aparelho: { id: 'zzzzzzzz', nome: 'Mac antigo' } }), fundir([]))
    expect(plano.pedidos.map((p) => p.reg)).toEqual(['NT-zzzzzzzz-1', 'OB-yyyyyyyy-4'])
    for (const p of plano.pedidos) expect(Object.keys(p).sort()).toEqual(['campos', 'op', 'reg', 'tipo'])
    const novos = comoEventos(plano.pedidos, 1)
    expect(novos.every((e) => e.aparelho === D && e.hlc.endsWith(`-${D}`))).toBe(true)
    expect(fundir(novos).registro('objeto', 'OB-yyyyyyyy-4')?.campos).toEqual({ periodo: 'CA', titulo: 'Objeto TESTE de outra conta' })
  })

  it('a cópia com base (eventos podados): os registros da base também voltam', () => {
    const antigos = [nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'na base' }, T0)]
    const base: EstadoConsolidado = consolidar(fundir(antigos))
    const novos = [nota(A, 2, 'NT-aaaaaaaa-2', 'criar', { texto: 'nos eventos' }, T0 + 1000)]
    const copia = copiaDe(novos, { base })
    expect(estadoCanonico(fundir([], copia.estado))).toBe(estadoCanonico(fundir(novos, base)))
    expect(planoDeRestauracao(copia, fundir([])).pedidos.map((p) => p.reg)).toEqual(['NT-aaaaaaaa-1', 'NT-aaaaaaaa-2'])
  })

  it('imagens: os ids das que ficam vivas depois do plano, com os nomes dos arquivos; as novas à parte', () => {
    const img = (seq: number, reg: string, extra: Record<string, string> = {}) =>
      ev({ ap: A, seq, tipo: 'imagem', reg, op: 'criar', campos: { alvoTipo: 'objeto', alvo: 'CA00001', formato: 'webp', extensao: 'heic', nome: `IMG_${seq}.HEIC`, ...extra }, ms: T0 + seq * 1000 })
    const eventos = [
      img(1, 'IM-aaaaaaaa-1'),
      img(2, 'IM-aaaaaaaa-2', { formato: 'jpeg', extensao: 'png' }),
      img(3, 'IM-aaaaaaaa-3'),
      ev({ ap: A, seq: 4, tipo: 'imagem', reg: 'IM-aaaaaaaa-3', op: 'excluir', ms: T0 + 4000 }),
      // Um id que viraria caminho fora da pasta: nunca entra em `imagens`.
      ev({ ap: A, seq: 5, tipo: 'imagem', reg: 'IM-../../x', op: 'criar', campos: { alvoTipo: 'objeto', alvo: 'CA00001', formato: 'webp', extensao: 'jpg' }, ms: T0 + 5000 }),
    ]
    // Aqui: a 2 já existe e foi excluída depois da cópia.
    const atual = fundir([eventos[1]!, ev({ ap: B, seq: 1, tipo: 'imagem', reg: 'IM-aaaaaaaa-2', op: 'excluir', ms: T0 + 90_000 })])
    const plano = planoDeRestauracao(copiaDe(eventos), atual)
    expect(plano.imagens).toEqual(['IM-aaaaaaaa-1'])
    expect(plano.arquivosDasImagens).toEqual({ 'IM-aaaaaaaa-1': ['tela.webp', 'miniatura.webp', 'original.heic'] })
    // Revisão 1: um id malformado volta como registro (não tem arquivos), mas não conta como foto.
    // I-1: a nova excluída fica à parte (volta para Excluídos)
    expect(plano.imagensNovas).toEqual(['IM-aaaaaaaa-1'])
    expect(plano.imagensExcluidas).toEqual(['IM-aaaaaaaa-3'])
    expect(plano.pedidos.filter((p) => p.reg === 'IM-../../x').map((p) => p.op)).toEqual(['criar'])
    expect(plano.trazidos).toEqual({ imagem: 3 })
  })

  it('`ate`: o maior hlc da cópia (para o relógio deste aparelho passar dele); null numa cópia vazia', () => {
    expect(planoDeRestauracao(copiaDe([]), fundir([])).ate).toBeNull()
    const eventos = [nota(A, 1, 'NT-aaaaaaaa-1', 'criar', {}, T0), nota(B, 1, 'NT-aaaaaaaa-1', 'alterar', { texto: 'x' }, T0 + 99_000)]
    expect(planoDeRestauracao(copiaDe(eventos), fundir([])).ate).toBe(hlc(T0 + 99_000, 0, B))
  })
})

describe('textoDoResumo e temAlgoATrazer: o texto e o botão concordam', () => {
  it('uma cópia sem fotos cuja única falta é uma foto que não está no Dropbox: «nada que falte», o aviso da foto e nenhum «Restaurar»', () => {
    const img = ev({ ap: A, seq: 1, tipo: 'imagem', reg: 'IM-aaaaaaaa-1', op: 'criar', campos: { alvoTipo: 'objeto', alvo: 'CA00001', formato: 'webp', extensao: 'jpg', nome: 'IMG_1.JPG' } })
    const copia = copiaDe([img])
    const plano = planoDeRestauracao(copia, fundir([]))
    const conferencia = { conferido: true, voltam: [], semArquivo: ['IM-aaaaaaaa-1'], arquivos: {}, listagem: null }
    expect(temAlgoATrazer(plano, conferencia)).toBe(false)
    expect(textoDoResumo({ copia, plano, conferencia, comFotos: false, esteAparelho: D })).toBe(
      `Cópia de ${dataDaCopia(copia.geradoEm)}, feita no Mac. Esta cópia não tem nada que falte aqui. 1 foto desta cópia não está no Dropbox, e ela não a traz: use a cópia completa.`,
    )
  })
})

describe('revisão 1', () => {
  const objeto = (campos: Evento['campos'] = {}) => ev({ ap: A, seq: 1, tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'criar', campos: { periodo: 'CA', titulo: 'Objeto TESTE', ...campos } })
  /** O número confirmado que um livro tomou (CA00046) e o número novo da decisão 48 (CA00048). */
  const comLivro = { 'LIVRO:OB-aaaaaaaa-1': 'CA00048', 'OB-aaaaaaaa-1': 'CA00046', 'SKC:OB-aaaaaaaa-1': '12' }

  it('testemunha com `LIVRO:<id>` (decisão 48): o número novo, com `numeroTomadoPeloLivro`, como em testemunhasFaltando', () => {
    // Ausente aqui, sem testemunha na cópia.
    const plano = planoDeRestauracao(copiaDe([objeto()], { numerosConfirmados: comLivro }), fundir([]))
    expect(plano.pedidos).toEqual([
      { tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'criar', campos: { periodo: 'CA', titulo: 'Objeto TESTE' } },
      { tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'alterar', campos: { numero: 'CA00048', numeroTomadoPeloLivro: 'CA00046', nrSkc: '12' } },
    ])
    // Ausente aqui, com a testemunha do número tomado na cópia: ela não basta.
    const comTomado = planoDeRestauracao(copiaDe([objeto({ numero: 'CA00046', nrSkc: '12' })], { numerosConfirmados: comLivro }), fundir([]))
    expect(comTomado.pedidos[1]).toEqual({ tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'alterar', campos: { numero: 'CA00048', numeroTomadoPeloLivro: 'CA00046' } })
    // Presente aqui: vai no mesmo `alterar` dos campos mais novos.
    const titulo = ev({ ap: A, seq: 2, tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'alterar', campos: { titulo: 'revisto' } })
    const presente = planoDeRestauracao(copiaDe([objeto(), titulo], { numerosConfirmados: comLivro }), fundir([objeto()]))
    expect(presente.pedidos).toEqual([{ tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'alterar', campos: { nrSkc: '12', numero: 'CA00048', numeroTomadoPeloLivro: 'CA00046', titulo: 'revisto' } }])
    // A testemunha do número novo já está aqui: nada.
    const nova = ev({ ap: B, seq: 1, tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'alterar', campos: { numero: 'CA00048', numeroTomadoPeloLivro: 'CA00046', nrSkc: '12' } })
    expect(planoDeRestauracao(copiaDe([objeto()], { numerosConfirmados: comLivro }), fundir([objeto(), nova])).pedidos).toEqual([])
  })

  it('a marca empata em (hlc, evento) e desempata pela op, como a fusão (`restaurar` vence `excluir`)', () => {
    const criar = nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'TESTE' }, T0)
    const h = hlc(T0 + 10_000, 0, A)
    const marca = (op: Evento['op']) => ev({ ap: A, seq: 9, h, tipo: 'nota', reg: 'NT-aaaaaaaa-1', op })
    expect(planoDeRestauracao(copiaDe([criar, marca('restaurar')]), fundir([criar, marca('excluir')])).pedidos.map((p) => p.op)).toEqual(['restaurar'])
    expect(planoDeRestauracao(copiaDe([criar, marca('excluir')]), fundir([criar, marca('restaurar')])).pedidos).toEqual([])
  })

  it('um campo empata no hlc e desempata pelo id do evento, como a fusão', () => {
    const criar = nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'TESTE' }, T0)
    const h = hlc(T0 + 10_000, 0, A)
    const texto = (seq: number, t: string) => ev({ ap: A, seq, h, tipo: 'nota', reg: 'NT-aaaaaaaa-1', op: 'alterar', campos: { texto: t } })
    // Na cópia, o evento de id maior (aaaaaaaa-9-0 > aaaaaaaa-2-0): na fusão ele vence, então volta.
    const plano = planoDeRestauracao(copiaDe([criar, texto(9, 'da cópia')]), fundir([criar, texto(2, 'daqui')]))
    expect(plano.pedidos).toEqual([{ tipo: 'nota', reg: 'NT-aaaaaaaa-1', op: 'alterar', campos: { texto: 'da cópia' } }])
    expect(plano.atualizados).toBe(1)
    // O contrário: o daqui vence, nada.
    expect(planoDeRestauracao(copiaDe([criar, texto(2, 'da cópia')]), fundir([criar, texto(9, 'daqui')])).pedidos).toEqual([])
    // O mesmo evento dos dois lados: nada.
    expect(planoDeRestauracao(copiaDe([criar, texto(9, 'x')]), fundir([criar, texto(9, 'x')])).pedidos).toEqual([])
  })
})

describe('P13 (aprovação): o que volta excluído vai para «Excluídos», e o resumo diz isso à parte', () => {
  const semFotos = { conferido: true, voltam: [], semArquivo: [], arquivos: {}, listagem: null }
  const resultado = { fotosRestauradas: 0, fotosSemConferir: false, fotosQueFalharam: 0 }
  const colecao = (seq: number, reg: string, op: Evento['op'], campos: Evento['campos'] = {}) => ev({ ap: A, seq, tipo: 'colecao', reg, op, campos })
  const verbete = (seq: number, reg: string, op: Evento['op'], campos: Evento['campos'] = {}) => ev({ ap: A, seq, tipo: 'verbete', reg, op, campos })
  const texto = (eventos: Evento[]) => {
    const copia = copiaDe(eventos)
    const plano = planoDeRestauracao(copia, fundir([]))
    return {
      resumo: textoDoResumo({ copia, plano, conferencia: semFotos, comFotos: false, esteAparelho: D }).replace(/^Cópia de [^.]*\. /, ''),
      depois: textoDoRestaurado(plano, resultado as never),
      algo: temAlgoATrazer(plano, semFotos),
    }
  }

  it('com os dois: «… que faltam aqui, e 1 nota que volta para Excluídos.»; depois, «…; 1 nota voltou para Excluídos.»', () => {
    const t = texto([
      nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'a' }),
      nota(A, 2, 'NT-aaaaaaaa-2', 'criar', { texto: 'b' }),
      nota(A, 3, 'NT-aaaaaaaa-3', 'criar', { texto: 'c' }),
      nota(A, 4, 'NT-aaaaaaaa-3', 'excluir'),
      colecao(5, 'CO-aaaaaaaa-1', 'criar', { nome: 'Coleção TESTE', membros: [] }),
    ])
    expect(t.resumo).toBe('Vai trazer de volta 2 notas e 1 coleção que faltam aqui, e 1 nota que volta para Excluídos. O que você mudou depois dessa data continua valendo.')
    expect(t.depois).toBe('Restaurado: 2 notas e 1 coleção; 1 nota voltou para Excluídos. Sobe na próxima sincronização.')
  })

  it('no plural: «e 1 nota e 1 verbete que voltam para Excluídos»; «…; 1 nota e 1 verbete voltaram para Excluídos.»', () => {
    const t = texto([
      nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'a' }),
      nota(A, 2, 'NT-aaaaaaaa-2', 'criar', { texto: 'b' }),
      nota(A, 3, 'NT-aaaaaaaa-2', 'excluir'),
      verbete(4, 'GL-aaaaaaaa-1', 'criar', { forma: 'termo TESTE', status: 'proposed' }),
      verbete(5, 'GL-aaaaaaaa-1', 'excluir'),
    ])
    expect(t.resumo).toBe('Vai trazer de volta 1 nota que falta aqui, e 1 nota e 1 verbete que voltam para Excluídos. O que você mudou depois dessa data continua valendo.')
    expect(t.depois).toBe('Restaurado: 1 nota; 1 nota e 1 verbete voltaram para Excluídos. Sobe na próxima sincronização.')
  })

  it('só excluídos: «Vai trazer de volta 1 nota, que volta para Excluídos.»; depois, «Restaurado: 1 nota, que voltou para Excluídos.»', () => {
    const t = texto([nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'a' }), nota(A, 2, 'NT-aaaaaaaa-1', 'excluir')])
    expect(t.algo).toBe(true)
    expect(t.resumo).toBe('Vai trazer de volta 1 nota, que volta para Excluídos. O que você mudou depois dessa data continua valendo.')
    expect(t.depois).toBe('Restaurado: 1 nota, que voltou para Excluídos. Sobe na próxima sincronização.')
    const dois = texto([nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'a' }), nota(A, 2, 'NT-aaaaaaaa-1', 'excluir'), verbete(3, 'GL-aaaaaaaa-1', 'excluir')])
    expect(dois.resumo).toBe('Vai trazer de volta 1 nota e 1 verbete, que voltam para Excluídos. O que você mudou depois dessa data continua valendo.')
    expect(dois.depois).toBe('Restaurado: 1 nota e 1 verbete, que voltaram para Excluídos. Sobe na próxima sincronização.')
  })

  it('sem excluídos, o texto de sempre', () => {
    const t = texto([nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'a' })])
    expect(t.resumo).toBe('Vai trazer de volta 1 nota que falta aqui. O que você mudou depois dessa data continua valendo.')
    expect(t.depois).toBe('Restaurado: 1 nota. Sobe na próxima sincronização.')
  })
})

describe('I-1 (re-revisão 2): o que volta excluído é dito pelo que «Excluídos» mostra', () => {
  const resultado = { fotosRestauradas: 0, fotosSemConferir: false, fotosQueFalharam: 0 }
  const img = (seq: number, reg: string, op: Evento['op']) =>
    ev({ ap: A, seq, tipo: 'imagem', reg, op, campos: op === 'criar' ? { alvoTipo: 'objeto', alvo: 'CA00001', formato: 'webp', extensao: 'jpg', nome: 'IMG_TESTE.JPG' } : {} })
  const revisao = (seq: number, reg: string, op: Evento['op']) => ev({ ap: A, seq, tipo: 'revisao', reg, op, campos: op === 'criar' ? { caso: 'TESTE', resolvido: true } : {} })
  const eventos = [
    nota(A, 1, 'NT-aaaaaaaa-1', 'criar', { texto: 'a' }),
    img(2, 'IM-aaaaaaaa-1', 'criar'),
    img(3, 'IM-aaaaaaaa-1', 'excluir'),
    revisao(4, 'RV-aaaaaaaa-1', 'criar'),
    revisao(5, 'RV-aaaaaaaa-1', 'excluir'),
  ]
  const conferido = { conferido: true, voltam: [], semArquivo: [], arquivos: {}, listagem: null }
  const semConferir = { conferido: false, voltam: [], semArquivo: [], arquivos: {}, listagem: null }

  it.each([
    ['conferido', conferido],
    ['sem conferir o Dropbox', semConferir],
  ])('a foto excluída vai na parte de Excluídos; a revisão excluída não é dita (%s)', (_n, conferencia) => {
    const copia = copiaDe(eventos)
    const plano = planoDeRestauracao(copia, fundir([]))
    expect(textoDoResumo({ copia, plano, conferencia, comFotos: true, esteAparelho: D }).replace(/^Cópia de [^.]*\. /, '')).toBe(
      'Vai trazer de volta 1 nota que falta aqui, e 1 foto que volta para Excluídos. O que você mudou depois dessa data continua valendo.',
    )
    expect(textoDoRestaurado(plano, resultado as never)).toBe('Restaurado: 1 nota; 1 foto voltou para Excluídos. Sobe na próxima sincronização.')
  })

  it('uma cópia só com uma foto excluída: há algo a trazer, e o resumo o diz', () => {
    const copia = copiaDe([img(1, 'IM-aaaaaaaa-1', 'criar'), img(2, 'IM-aaaaaaaa-1', 'excluir')])
    const plano = planoDeRestauracao(copia, fundir([]))
    expect(temAlgoATrazer(plano, conferido)).toBe(true)
    expect(textoDoResumo({ copia, plano, conferencia: conferido, comFotos: true, esteAparelho: D }).replace(/^Cópia de [^.]*\. /, '')).toBe(
      'Vai trazer de volta 1 foto, que volta para Excluídos. O que você mudou depois dessa data continua valendo.',
    )
  })

  it('uma revisão que volta viva continua em «outros registros»; excluída, não é dita, e sozinha não é «algo a trazer»', () => {
    const viva = copiaDe([revisao(1, 'RV-aaaaaaaa-1', 'criar')])
    const pv = planoDeRestauracao(viva, fundir([]))
    expect(textoDoResumo({ copia: viva, plano: pv, conferencia: conferido, comFotos: false, esteAparelho: D }).replace(/^Cópia de [^.]*\. /, '')).toBe(
      'Vai trazer de volta 1 outro registro que falta aqui. O que você mudou depois dessa data continua valendo.',
    )
    const excluida = copiaDe([revisao(1, 'RV-aaaaaaaa-1', 'criar'), revisao(2, 'RV-aaaaaaaa-1', 'excluir')])
    const pe = planoDeRestauracao(excluida, fundir([]))
    expect(temAlgoATrazer(pe, conferido)).toBe(false)
    expect(textoDoResumo({ copia: excluida, plano: pe, conferencia: conferido, comFotos: false, esteAparelho: D }).replace(/^Cópia de [^.]*\. /, '')).toBe(NADA)
  })
})

describe('m-6 (re-revisão 2): atualizar vai numa frase própria', () => {
  const conferido = { conferido: true, voltam: [], semArquivo: [], arquivos: {}, listagem: null }
  it('com algo a trazer: «… que faltam aqui. Também vai atualizar 1 item que está mais novo na cópia.»; só atualizar, como antes', () => {
    const aqui = [nota(B, 1, 'NT-bbbbbbbb-1', 'criar', { texto: 'velho' }, T0)]
    const naCopia = [...aqui, nota(A, 1, 'NT-bbbbbbbb-1', 'alterar', { texto: 'novo' }, T0 + 50_000), nota(A, 2, 'NT-aaaaaaaa-1', 'criar', { texto: 'a' }), nota(A, 3, 'NT-aaaaaaaa-2', 'criar', { texto: 'b' }), nota(A, 4, 'NT-aaaaaaaa-2', 'excluir')]
    const copia = copiaDe(naCopia)
    const plano = planoDeRestauracao(copia, fundir(aqui))
    expect(textoDoResumo({ copia, plano, conferencia: conferido, comFotos: false, esteAparelho: D }).replace(/^Cópia de [^.]*\. /, '')).toBe(
      'Vai trazer de volta 1 nota que falta aqui, e 1 nota que volta para Excluídos. Também vai atualizar 1 item que está mais novo na cópia. O que você mudou depois dessa data continua valendo.',
    )
    const so = copiaDe([...aqui, nota(A, 1, 'NT-bbbbbbbb-1', 'alterar', { texto: 'novo' }, T0 + 50_000)])
    const ps = planoDeRestauracao(so, fundir(aqui))
    expect(textoDoResumo({ copia: so, plano: ps, conferencia: conferido, comFotos: false, esteAparelho: D }).replace(/^Cópia de [^.]*\. /, '')).toBe(
      'Vai atualizar 1 item que está mais novo na cópia. O que você mudou depois dessa data continua valendo.',
    )
  })
})
