import { B, C, ev, hlc, HORA, T0 } from '../../tests/suporte/eventosDeTeste'
import { aparelhoAtual } from './aparelho'
import {
  avancarRelogio,
  eventosLocaisNaoEnviados,
  gravarNovosEventos,
  guardarBase,
  guardarEventosRemotos,
  lerBase,
  marcarEnviados,
  unirBase,
  proximoId,
  todosEventos,
  ultimoHlc,
} from './armazem'
import { abrirBancoUsuario, LOJA_EVENTOS } from './bancoUsuario'
import { consolidar, fundir } from './fusao'
import { TETO_MS } from './hlc'

function apagarBanco() {
  return new Promise<void>((ok, falha) => {
    const r = indexedDB.deleteDatabase('iconodb-usuario')
    r.onsuccess = () => ok()
    r.onerror = () => falha(r.error)
    r.onblocked = () => falha(new Error('banco bloqueado: alguma conexão ficou aberta'))
  })
}

beforeEach(apagarBanco)
afterEach(() => vi.restoreAllMocks())

const nota = (campos = {}) => ({ tipo: 'nota' as const, reg: 'NT-x-1', op: 'alterar' as const, campos })

describe('banco iconodb-usuario, versão 2', () => {
  it('a atualização da versão 1 mantém a loja config (o id do aparelho) e cria a de eventos', async () => {
    await new Promise<void>((ok, falha) => {
      const req = indexedDB.open('iconodb-usuario', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('config')
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('config', 'readwrite')
        tx.objectStore('config').put({ id: 'velho123', nome: 'Mac' }, 'aparelho')
        tx.oncomplete = () => {
          db.close()
          ok()
        }
        tx.onerror = () => falha(tx.error)
      }
    })
    const db = await abrirBancoUsuario()
    expect(Array.from(db.objectStoreNames).sort()).toEqual(['config', 'eventos'])
    const loja = db.transaction(LOJA_EVENTOS).objectStore(LOJA_EVENTOS)
    expect(loja.keyPath).toBe('id')
    expect(Array.from(loja.indexNames).sort()).toEqual(['aparelho_seq', 'enviado'])
    expect(loja.index('aparelho_seq').keyPath).toEqual(['aparelho', 'seq'])
    expect(await aparelhoAtual()).toEqual({ id: 'velho123', nome: 'Mac' })
  })

  it('reaproveita uma só conexão entre operações', async () => {
    await aparelhoAtual()
    const abrir = vi.spyOn(indexedDB, 'open')
    await gravarNovosEventos([nota()])
    await todosEventos()
    await proximoId('NT')
    await eventosLocaisNaoEnviados()
    expect(abrir).not.toHaveBeenCalled()
  })

  it('se a conexão foi fechada por fora, abre outra e segue', async () => {
    const db = await abrirBancoUsuario()
    db.close()
    const [e] = await gravarNovosEventos([nota()])
    expect(await todosEventos()).toEqual([e])
  })
})

describe('gravarNovosEventos', () => {
  it('grava com id "<aparelho>-<seq>-<n>", seq crescente e hlc deste aparelho', async () => {
    const { id: ap } = await aparelhoAtual()
    const [e1] = await gravarNovosEventos([nota({ titulo: 'a' })])
    const [e2] = await gravarNovosEventos([nota({ titulo: 'b' })])
    expect(e1).toMatchObject({ v: 1, id: `${ap}-1-0`, aparelho: ap, tipo: 'nota', reg: 'NT-x-1', op: 'alterar', campos: { titulo: 'a' } })
    expect(e2!.id).toBe(`${ap}-2-0`)
    expect(e1!.hlc.endsWith(`-${ap}`)).toBe(true)
    expect(e2!.hlc > e1!.hlc).toBe(true)
    expect(await todosEventos()).toEqual([e1, e2])
  })

  it('vários pedidos numa só transação: mesmo seq, n = 0, 1, 2, hlc crescente', async () => {
    const { id: ap } = await aparelhoAtual()
    const lista = await gravarNovosEventos([nota({ a: 1 }), nota({ a: 2 }), nota({ a: 3 })])
    expect(lista.map((e) => e.id)).toEqual([`${ap}-1-0`, `${ap}-1-1`, `${ap}-1-2`])
    expect([...lista].map((e) => e.hlc).sort()).toEqual(lista.map((e) => e.hlc))
    expect(new Set(lista.map((e) => e.hlc)).size).toBe(3)
  })

  it('um pedido inválido não grava nada (tudo ou nada) e rejeita', async () => {
    await expect(gravarNovosEventos([nota({ a: 1 }), { tipo: 'nota', reg: '', op: 'alterar', campos: {} }])).rejects.toThrow(/reg/)
    expect(await todosEventos()).toEqual([])
    const [e] = await gravarNovosEventos([nota()])
    expect(e!.id.endsWith('-1-0')).toBe(true) // o seq não avançou com a falha
  })

  it('o relógio persiste entre recargas: nunca volta para trás, mesmo com Date.now recuando', async () => {
    const agora = vi.spyOn(Date, 'now').mockReturnValue(T0 + HORA)
    const [e1] = await gravarNovosEventos([nota()])
    expect(await ultimoHlc()).toBe(e1!.hlc)
    agora.mockReturnValue(T0) // o relógio do aparelho voltou 1 h
    const [e2] = await gravarNovosEventos([nota()])
    expect(e2!.hlc > e1!.hlc).toBe(true)
    expect(e2!.hlc.slice(0, 13)).toBe(String(T0 + HORA))
  })

  it('gravações simultâneas não repetem seq nem hlc', async () => {
    const lotes = await Promise.all(Array.from({ length: 10 }, (_, i) => gravarNovosEventos([nota({ i })])))
    const eventos = lotes.flat()
    expect(new Set(eventos.map((e) => e.id)).size).toBe(10)
    expect(new Set(eventos.map((e) => e.hlc)).size).toBe(10)
  })
})

describe('envio: não enviados e marcação', () => {
  it('eventosLocaisNaoEnviados em ordem de (seq, n); marcarEnviados os tira da lista, e isso persiste', async () => {
    const a = await gravarNovosEventos([nota({ a: 1 })])
    const b = await gravarNovosEventos([nota({ b: 1 }), nota({ b: 2 })])
    const c = await gravarNovosEventos([nota({ c: 1 })])
    expect((await eventosLocaisNaoEnviados()).map((e) => e.id)).toEqual([...a, ...b, ...c].map((e) => e.id))
    await marcarEnviados([a[0]!.id, b[1]!.id, 'nao-existe-1-0'])
    expect((await eventosLocaisNaoEnviados()).map((e) => e.id)).toEqual([b[0]!.id, c[0]!.id])
    // Marcar de novo é inofensivo; os enviados continuam em todosEventos.
    await marcarEnviados([a[0]!.id])
    expect(await todosEventos()).toHaveLength(4)
  })
})

describe('guardarEventosRemotos', () => {
  it('guarda os eventos de outros aparelhos sem duplicar (por id) e devolve só os novos', async () => {
    const r1 = ev({ ap: B, seq: 1 })
    const r2 = ev({ ap: B, seq: 2 })
    const r3 = ev({ ap: C, seq: 1 })
    expect(await guardarEventosRemotos([r1, r2])).toEqual({ novos: [r1, r2], ignorados: 0, conflitos: 0, substituidos: [] })
    expect(await guardarEventosRemotos([r2, r3, r3, JSON.parse(JSON.stringify(r1))])).toEqual({ novos: [r3], ignorados: 0, conflitos: 0, substituidos: [] })
    expect((await todosEventos()).map((e) => e.id).sort()).toEqual([r1.id, r2.id, r3.id])
  })

  it('remotos nunca aparecem como "não enviados"', async () => {
    await guardarEventosRemotos([ev({ ap: B, seq: 1 })])
    expect(await eventosLocaisNaoEnviados()).toEqual([])
  })

  it('ignora e conta os malformados, sem impedir os demais', async () => {
    const bom = ev({ ap: B, seq: 1 })
    expect(await guardarEventosRemotos([null, { v: 2 }, bom, 'x'])).toEqual({ novos: [bom], ignorados: 3, conflitos: 0, substituidos: [] })
  })

  it('avança o relógio: o próximo evento local vem depois do remoto adiantado 1 h (Foco 3)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T0)
    const remoto = ev({ ap: B, seq: 1, h: hlc(T0 + HORA, 5, B) })
    await guardarEventosRemotos([remoto])
    const [local] = await gravarNovosEventos([nota()])
    expect(local!.hlc > remoto.hlc).toBe(true)
  })

  it('uma cópia remota de um evento deste aparelho que faltasse aqui entra como enviada e o seq pula adiante', async () => {
    const { id: ap } = await aparelhoAtual()
    const meu = ev({ ap, seq: 7 })
    expect((await guardarEventosRemotos([meu])).novos).toEqual([meu])
    expect(await eventosLocaisNaoEnviados()).toEqual([])
    const [e] = await gravarNovosEventos([nota()])
    expect(e!.id).toBe(`${ap}-8-0`)
  })
})

describe('guardarEventosRemotos: hlc absurdo (além de 2250) não trava a sincronização', () => {
  it('é ignorado e contado; os outros entram; o relógio não se move; registrar continua funcionando', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T0)
    const absurdo = ev({ ap: B, seq: 1, h: `9999999999999-9999-${B}` })
    const bom = ev({ ap: B, seq: 2, h: hlc(T0 - 5, 0, B) })
    expect(await guardarEventosRemotos([absurdo, bom])).toMatchObject({ novos: [bom], ignorados: 1 })
    expect(await guardarEventosRemotos([absurdo])).toMatchObject({ novos: [], ignorados: 1 })
    const lote = await gravarNovosEventos(Array.from({ length: 50 }, () => nota()))
    expect(lote[0]!.hlc.slice(0, 13)).toBe(String(T0))
  })

  it('um hlc entre 2200 e 2250 é aceito, mas não arrasta o relógio', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T0)
    const longe = ev({ ap: B, seq: 1, h: hlc(TETO_MS + HORA, 0, B) })
    expect((await guardarEventosRemotos([longe])).novos).toEqual([longe])
    const [e] = await gravarNovosEventos([nota()])
    expect(e!.hlc.slice(0, 13)).toBe(String(T0))
  })
})

describe('guardarEventosRemotos: mesmo id, conteúdo diferente', () => {
  it('fica a cópia vencedora (maior hlc; empate: maior JSON canônico) e o conflito é contado', async () => {
    const r1 = ev({ ap: B, seq: 1, ms: T0, campos: { t: 'original' } })
    const r1b = { ...r1, hlc: hlc(T0 + 9, 0, B), campos: { t: 'corrompida' } }
    expect(await guardarEventosRemotos([r1])).toMatchObject({ novos: [r1], conflitos: 0 })
    expect(await guardarEventosRemotos([r1b])).toEqual({ novos: [], ignorados: 0, conflitos: 1, substituidos: [r1b] })
    expect(await todosEventos()).toEqual([r1b])
    // A perdedora chegando de novo: conflito contado, nada substituído.
    expect(await guardarEventosRemotos([r1])).toEqual({ novos: [], ignorados: 0, conflitos: 1, substituidos: [] })
    expect(await todosEventos()).toEqual([r1b])
  })

  it('chaves extras (1e400 → Infinity, inteiro enorme) não fazem a sincronização rejeitar e não são guardadas', async () => {
    const r1 = ev({ ap: B, seq: 1, ms: T0, campos: { t: 'a' } })
    const com = (extra: string, campos = r1.campos) => JSON.parse(`{${JSON.stringify({ ...r1, campos }).slice(1, -1)},"extra":${extra}}`)
    expect(await guardarEventosRemotos([com('1e400'), com('123456789012345678901234567890')])).toEqual({ novos: [r1], ignorados: 0, conflitos: 0, substituidos: [] })
    expect(await guardarEventosRemotos([com('1e400', { t: 'b' })])).toMatchObject({ conflitos: 1 })
    for (const e of await todosEventos()) expect('extra' in e).toBe(false)
  })

  it('no mesmo lote, em qualquer ordem, entra a vencedora e o conflito é contado', async () => {
    const r1 = ev({ ap: B, seq: 1, ms: T0, campos: { t: 'a' } })
    const r1b = { ...r1, campos: { t: 'b' } }
    expect(await guardarEventosRemotos([r1b, r1, r1b])).toEqual({ novos: [r1b], ignorados: 0, conflitos: 1, substituidos: [] })
    expect(await todosEventos()).toEqual([r1b])
  })

  it('uma cópia de fora, mesmo vencedora, nunca toma o lugar de um evento local não enviado (o conflito é contado)', async () => {
    const [local] = await gravarNovosEventos([nota({ t: 1 })])
    const copia = { ...local!, hlc: `${String(Number(local!.hlc.slice(0, 13)) + 1).padStart(13, '0')}${local!.hlc.slice(13)}` }
    const r = await guardarEventosRemotos([copia])
    expect(r).toMatchObject({ novos: [], conflitos: 1, substituidos: [] })
    expect(await eventosLocaisNaoEnviados()).toEqual([local])
  })

  it('uma cópia vencedora de um evento já enviado (ou de outro aparelho) substitui a guardada', async () => {
    const r1 = ev({ ap: B, seq: 1, ms: T0, campos: { t: 'a' } })
    await guardarEventosRemotos([r1])
    const r1b = { ...r1, hlc: `${String(Number(r1.hlc.slice(0, 13)) + 1).padStart(13, '0')}${r1.hlc.slice(13)}`, campos: { t: 'b' } }
    expect((await guardarEventosRemotos([r1b])).substituidos).toEqual([r1b])
  })
})

describe('unirBase', () => {
  it('une à base guardada numa só transação: chamadas simultâneas não perdem nada', async () => {
    const b1 = consolidar(fundir([ev({ ap: B, seq: 1, reg: 'NT-1', campos: { t: 1 } })]))
    const b2 = consolidar(fundir([ev({ ap: C, seq: 1, reg: 'NT-2', campos: { t: 2 } })]))
    const b3 = consolidar(fundir([ev({ ap: B, seq: 2, reg: 'NT-1', campos: { u: 3 } })]))
    await Promise.all([unirBase(b1), unirBase(b2), unirBase(b3)])
    const e = fundir([], (await lerBase())!)
    expect(e.registro('nota', 'NT-1')!.campos).toEqual({ t: 1, u: 3 })
    expect(e.registro('nota', 'NT-2')!.campos).toEqual({ t: 2 })
  })

  it('uma base guardada com um registro ruim: os bons ficam', async () => {
    const b1 = consolidar(fundir([ev({ ap: B, seq: 1, reg: 'NT-1', campos: { t: 1 } })]))
    await guardarBase({ v: 1, registros: [...b1.registros, { ...b1.registros[0]!, id: 'NT-ruim', tipo: 'livro' as never }] })
    expect((await lerBase())!.registros.map((r) => r.id)).toEqual(['NT-1'])
    await unirBase(consolidar(fundir([ev({ ap: C, seq: 1, reg: 'NT-2', campos: { t: 2 } })])))
    expect((await lerBase())!.registros.map((r) => r.id)).toEqual(['NT-1', 'NT-2'])
  })
})

describe('avancarRelogio', () => {
  it('leva o relógio além de um hlc (por exemplo, o maior da base consolidada)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T0)
    await avancarRelogio(hlc(T0 + 2 * HORA, 0, B))
    const [e] = await gravarNovosEventos([nota()])
    expect(e!.hlc > hlc(T0 + 2 * HORA, 0, B)).toBe(true)
    await expect(avancarRelogio('lixo')).rejects.toThrow()
  })
})

describe('proximoId', () => {
  it('"<PREFIXO>-<aparelho>-<n>", contador por prefixo, nunca reutilizado', async () => {
    const { id: ap } = await aparelhoAtual()
    expect(await proximoId('NT')).toBe(`NT-${ap}-1`)
    expect(await proximoId('NT')).toBe(`NT-${ap}-2`)
    expect(await proximoId('CO')).toBe(`CO-${ap}-1`)
    const simultaneos = await Promise.all(Array.from({ length: 10 }, () => proximoId('IM')))
    expect(new Set(simultaneos).size).toBe(10)
    expect(await proximoId('NT')).toBe(`NT-${ap}-3`)
  })

  it('recusa um prefixo desconhecido', async () => {
    await expect(proximoId('XX' as never)).rejects.toThrow(/prefixo/i)
  })
})

describe('base consolidada local', () => {
  it('guarda e lê a base; sem base, null', async () => {
    expect(await lerBase()).toBeNull()
    const base = consolidar(fundir([ev({ ap: B, seq: 1, campos: { t: 1 } })]))
    await guardarBase(base)
    expect(await lerBase()).toEqual(base)
  })
})
