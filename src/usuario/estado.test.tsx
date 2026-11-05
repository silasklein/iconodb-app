import { act, render, screen } from '@testing-library/react'
import { B, ev, hlc, HORA, T0 } from '../../tests/suporte/eventosDeTeste'

type ModuloEstado = typeof import('./estado')
type ModuloArmazem = typeof import('./armazem')

function apagarBanco() {
  return new Promise<void>((ok, falha) => {
    const r = indexedDB.deleteDatabase('iconodb-usuario')
    r.onsuccess = () => ok()
    r.onerror = () => falha(r.error)
    r.onblocked = () => falha(new Error('banco bloqueado: alguma conexão ficou aberta'))
  })
}

/** Uma "recarga" do app: módulos novos (estado em memória vazio), mesmo IndexedDB. */
async function carregarModulos(): Promise<{ estado: ModuloEstado; armazem: ModuloArmazem }> {
  vi.resetModules()
  return { estado: await import('./estado'), armazem: await import('./armazem') }
}

let m: ModuloEstado
let armazem: ModuloArmazem
beforeEach(async () => {
  await apagarBanco()
  ;({ estado: m, armazem } = await carregarModulos())
})
afterEach(() => vi.restoreAllMocks())

describe('registrar', () => {
  it('grava no IndexedDB, devolve o evento e atualiza o estado em memória', async () => {
    const reg = await m.proximoId('NT')
    const e = await m.registrar('nota', reg, 'criar', { titulo: 'Íbex' })
    expect(e).toMatchObject({ v: 1, tipo: 'nota', reg, op: 'criar', campos: { titulo: 'Íbex' } })
    expect(await armazem.todosEventos()).toEqual([e])
    expect(m.estadoAtual().registro('nota', reg)!.campos).toEqual({ titulo: 'Íbex' })
  })

  it('o IndexedDB vem ANTES da memória: quando o assinante é avisado, o evento já está gravado', async () => {
    const vistos: unknown[] = []
    const pendentes: Promise<void>[] = []
    m.assinarEstado(() => {
      pendentes.push(armazem.todosEventos().then((t) => void vistos.push(t.map((x) => x.reg))))
    })
    await m.registrar('nota', 'NT-x-1', 'criar', { t: 1 })
    await Promise.all(pendentes)
    expect(vistos).toEqual([['NT-x-1']])
  })

  it('se a gravação falha, rejeita e não muda a memória nem avisa ninguém', async () => {
    const aviso = vi.fn()
    m.assinarEstado(aviso)
    const antes = m.estadoAtual()
    vi.spyOn(armazem, 'gravarNovosEventos').mockRejectedValue(new Error('disco cheio'))
    await expect(m.registrar('nota', 'NT-x-1', 'criar', {})).rejects.toThrow('disco cheio')
    expect(m.estadoAtual()).toBe(antes)
    expect(aviso).not.toHaveBeenCalled()
  })

  it('um evento inválido é recusado antes de gravar', async () => {
    await expect(m.registrar('nota', '', 'criar', {})).rejects.toThrow()
    await expect(m.registrar('livro' as never, 'x', 'criar', {})).rejects.toThrow()
    expect(await armazem.todosEventos()).toEqual([])
  })

  it('sobrevive a uma recarga logo depois de resolver (nada se perde)', async () => {
    const e = await m.registrar('nota', 'NT-x-1', 'criar', { titulo: 'antes de fechar' })
    const depois = await carregarModulos()
    expect(depois.estado.estadoAtual().registro('nota', 'NT-x-1')).toBeUndefined() // memória nova, vazia
    const estado = await depois.estado.carregarEstado()
    expect(estado.registro('nota', 'NT-x-1')!.campos).toEqual({ titulo: 'antes de fechar' })
    expect(await depois.armazem.eventosLocaisNaoEnviados()).toEqual([e])
  })

  it('registrarVarios grava tudo numa transação e avisa uma vez', async () => {
    const aviso = vi.fn()
    m.assinarEstado(aviso)
    const lista = await m.registrarVarios([
      { tipo: 'imagem', reg: 'IM-x-1', op: 'criar', campos: { arquivo: 'a.webp' } },
      { tipo: 'objeto', reg: 'OB-x-1', op: 'criar', campos: { imagens: ['IM-x-1'] } },
    ])
    expect(lista).toHaveLength(2)
    expect(aviso).toHaveBeenCalledTimes(1)
    expect(m.estadoAtual().registro('objeto', 'OB-x-1')!.campos.imagens).toEqual(['IM-x-1'])
  })

  it('carregarEstado concorrente com registrar não perde o evento', async () => {
    await m.registrar('nota', 'NT-x-1', 'criar', { a: 1 })
    const [, e] = await Promise.all([m.carregarEstado(), m.registrar('nota', 'NT-x-2', 'criar', { b: 2 })])
    await m.carregarEstado()
    expect(m.estadoAtual().registro('nota', 'NT-x-2')!.campos).toEqual({ b: 2 })
    expect(e.reg).toBe('NT-x-2')
  })
})

describe('carregarEstado', () => {
  it('funde a base guardada com todos os eventos do IndexedDB', async () => {
    const { consolidar, fundir } = await import('./fusao')
    const antigo = ev({ ap: B, seq: 1, campos: { titulo: 'da base' } })
    await armazem.guardarBase(consolidar(fundir([antigo])))
    await armazem.guardarEventosRemotos([ev({ ap: B, seq: 2, reg: 'NT-aaaaaaaa-2', op: 'criar', campos: { t: 2 } })])
    const e = await m.carregarEstado()
    expect(e.registro('nota', 'NT-aaaaaaaa-1')!.campos).toEqual({ titulo: 'da base' })
    expect(e.registro('nota', 'NT-aaaaaaaa-2')!.campos).toEqual({ t: 2 })
    expect(m.estadoAtual()).toBe(e)
  })
})

describe('receberEventos (vindos da sincronização)', () => {
  it('guarda, avança o relógio, funde e avisa; repetidos não avisam de novo', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T0)
    const aviso = vi.fn()
    m.assinarEstado(aviso)
    const remoto = ev({ ap: B, seq: 1, h: hlc(T0 + HORA, 0, B), reg: 'NT-b-1', op: 'criar', campos: { titulo: 'de B' } })
    expect(await m.receberEventos([remoto, null])).toEqual({ novos: 1, ignorados: 1, conflitos: 0 })
    expect(m.estadoAtual().registro('nota', 'NT-b-1')!.campos.titulo).toBe('de B')
    expect(aviso).toHaveBeenCalledTimes(1)
    expect(await m.receberEventos([remoto])).toEqual({ novos: 0, ignorados: 0, conflitos: 0 })
    expect(aviso).toHaveBeenCalledTimes(1)
    // A edição local seguinte vence a remota, mesmo com B 1 h adiantado (Foco 3).
    await m.registrar('nota', 'NT-b-1', 'alterar', { titulo: 'de A' })
    expect(m.estadoAtual().registro('nota', 'NT-b-1')!.campos.titulo).toBe('de A')
    expect(m.estadoAtual().historico('NT-b-1', 'titulo', 'nota').map((h) => h.valor)).toEqual(['de B'])
  })

  it('com base nova: guarda a base, avança o relógio além dela e refunde', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T0)
    const { consolidar, fundir } = await import('./fusao')
    const daBase = ev({ ap: B, seq: 1, h: hlc(T0 + 3 * HORA, 0, B), reg: 'NT-b-1', op: 'criar', campos: { titulo: 'base' } })
    await m.receberEventos([], consolidar(fundir([daBase])))
    expect(await armazem.lerBase()).toEqual(consolidar(fundir([daBase])))
    expect(m.estadoAtual().registro('nota', 'NT-b-1')!.campos.titulo).toBe('base')
    const local = await m.registrar('nota', 'NT-b-1', 'alterar', { titulo: 'local' })
    expect(local.hlc > daBase.hlc).toBe(true)
  })
})

describe('receberEventos: correções da revisão', () => {
  it('duas chamadas simultâneas com bases diferentes não perdem nada (união numa só transação)', async () => {
    const { consolidar, fundir } = await import('./fusao')
    const b1 = consolidar(fundir([ev({ ap: B, seq: 1, reg: 'NT-1', op: 'criar', campos: { t: 1 } })]))
    const b2 = consolidar(fundir([ev({ ap: B, seq: 2, reg: 'NT-2', op: 'criar', campos: { t: 2 } })]))
    await Promise.all([m.receberEventos([], b1), m.receberEventos([], b2)])
    const guardada = fundir([], (await armazem.lerBase())!)
    expect(guardada.registro('nota', 'NT-1')).toBeDefined()
    expect(guardada.registro('nota', 'NT-2')).toBeDefined()
    await m.carregarEstado()
    expect(m.estadoAtual().registro('nota', 'NT-1')!.campos).toEqual({ t: 1 })
    expect(m.estadoAtual().registro('nota', 'NT-2')!.campos).toEqual({ t: 2 })
  })

  it('um evento com hlc absurdo não trava: é ignorado e registrar continua funcionando', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T0)
    const absurdo = ev({ ap: B, seq: 1, h: `9999999999999-9999-${B}`, reg: 'NT-b-1', campos: { t: 'futuro' } })
    const bom = ev({ ap: B, seq: 2, reg: 'NT-b-1', op: 'criar', campos: { t: 'ok' } })
    expect(await m.receberEventos([absurdo, bom])).toEqual({ novos: 1, ignorados: 1, conflitos: 0 })
    for (let i = 0; i < 20; i++) await m.registrar('nota', 'NT-b-1', 'alterar', { i })
    expect(m.estadoAtual().registro('nota', 'NT-b-1')!.campos).toEqual({ t: 'ok', i: 19 })
  })

  it('uma cópia diferente que vence a guardada é contada e o estado é refundido com ela', async () => {
    const r1 = ev({ ap: B, seq: 1, ms: T0, reg: 'NT-b-1', op: 'criar', campos: { t: 'original', x: 1 } })
    await m.receberEventos([r1])
    const r1b = { ...r1, hlc: hlc(T0 + 5, 0, B), campos: { t: 'corrompida' } }
    expect(await m.receberEventos([r1b])).toEqual({ novos: 0, ignorados: 0, conflitos: 1 })
    expect(m.estadoAtual().registro('nota', 'NT-b-1')!.campos).toEqual({ t: 'corrompida' })
  })
})

describe('carregarEstado: uma carga nunca publica por cima de uma iniciada depois dela', () => {
  /** Faz a PRÓXIMA chamada de todosEventos ler o IndexedDB e só devolver quando `liberar()` for chamado. */
  function prenderProximaLeitura() {
    const original = armazem.todosEventos
    let liberar!: () => void
    const espera = new Promise<void>((ok) => (liberar = ok))
    vi.spyOn(armazem, 'todosEventos').mockImplementationOnce(async () => {
      const lidos = await original()
      await espera
      return lidos
    })
    return () => liberar()
  }

  it('a carga velha (sem a base nova) termina por último e não apaga o que a base trouxe', async () => {
    const { consolidar, fundir } = await import('./fusao')
    await m.registrar('nota', 'NT-x-1', 'criar', { t: 1 })
    const liberar = prenderProximaLeitura()
    const velha = m.carregarEstado() // leu: sem base, só o evento 1
    // A base chega (não passa pelo buffer de eventos) e uma carga nova a publica.
    await m.receberEventos([], consolidar(fundir([ev({ ap: B, seq: 1, reg: 'NT-b-1', op: 'criar', campos: { daBase: true } })])))
    expect(m.estadoAtual().registro('nota', 'NT-b-1')).toBeDefined()
    liberar()
    await velha
    expect(m.estadoAtual().registro('nota', 'NT-b-1')!.campos).toEqual({ daBase: true })
    expect(m.estadoAtual().registro('nota', 'NT-x-1')!.campos).toEqual({ t: 1 })
  })

  it('a carga velha não desfaz uma cópia substituída que a nova publicou', async () => {
    const r1 = ev({ ap: B, seq: 1, ms: T0, reg: 'NT-b-1', op: 'criar', campos: { t: 'perdedora' } })
    await m.receberEventos([r1])
    const liberar = prenderProximaLeitura()
    const velha = m.carregarEstado() // leu a cópia perdedora
    expect(await m.receberEventos([{ ...r1, hlc: hlc(T0 + 5, 0, B), campos: { t: 'vencedora' } }])).toMatchObject({ conflitos: 1 })
    liberar()
    await velha
    expect(m.estadoAtual().registro('nota', 'NT-b-1')!.campos).toEqual({ t: 'vencedora' })
  })

  it('se a carga mais nova falha, o estado publicado continua (nada some) e uma carga anterior ainda publica', async () => {
    await m.registrar('nota', 'NT-x-1', 'criar', { t: 1 })
    await m.carregarEstado()
    const publicado = m.estadoAtual()
    // Um evento que só está no IndexedDB (gravado por fora da memória desta aba).
    await armazem.guardarEventosRemotos([ev({ ap: B, seq: 1, reg: 'NT-b-1', op: 'criar', campos: { soNoBanco: true } })])
    const liberar = prenderProximaLeitura()
    const velha = m.carregarEstado()
    vi.spyOn(armazem, 'lerBase').mockRejectedValueOnce(new Error('IndexedDB indisponível'))
    await expect(m.carregarEstado()).rejects.toThrow('IndexedDB indisponível')
    expect(m.estadoAtual()).toBe(publicado)
    expect(m.estadoAtual().registro('nota', 'NT-x-1')).toBeDefined()
    // A velha (iniciada antes da que falhou) ainda publica: nenhuma carga mais nova publicou.
    liberar()
    await velha
    expect(m.estadoAtual().registro('nota', 'NT-b-1')!.campos).toEqual({ soNoBanco: true })
    expect(m.estadoAtual().registro('nota', 'NT-x-1')).toBeDefined()
  })
})

describe('useEstado', () => {
  function Titulo({ reg, renders }: { reg: string; renders: { n: number } }) {
    const titulo = m.useEstado((e) => e.registro('nota', reg)?.campos.titulo)
    renders.n++
    return <p>{String(titulo ?? '—')}</p>
  }

  it('re-renderiza quando o estado muda', async () => {
    const renders = { n: 0 }
    render(<Titulo reg="NT-x-1" renders={renders} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    await act(() => m.registrar('nota', 'NT-x-1', 'criar', { titulo: 'Íbex' }))
    expect(screen.getByText('Íbex')).toBeInTheDocument()
    await act(() => m.registrar('nota', 'NT-x-1', 'alterar', { titulo: 'Leão' }))
    expect(screen.getByText('Leão')).toBeInTheDocument()
  })

  it('não re-renderiza quando o valor escolhido não muda', async () => {
    const renders = { n: 0 }
    render(<Titulo reg="NT-x-1" renders={renders} />)
    await act(() => m.registrar('nota', 'NT-x-1', 'criar', { titulo: 'Íbex' }))
    const n = renders.n
    await act(() => m.registrar('nota', 'NT-outra', 'criar', { titulo: 'outra' }))
    expect(renders.n).toBe(n)
  })
})
