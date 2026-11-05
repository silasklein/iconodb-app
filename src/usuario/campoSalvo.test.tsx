import { act, renderHook, waitFor } from '@testing-library/react'
import { todosEventos } from './armazem'
import { ATRASO_DO_CAMPO_MS, useCampoSalvo } from './campoSalvo'
import { recuperarEmergencias, totalDeEmergencias } from './emergencia'
import { estadoAtual, registrar } from './estado'
import { descarregarPendentes, esquecerPendentes, totalDePendentes } from './pendentes'

/** O `registrar` do estado, com dois ganchos: contar as chamadas e segurar uma gravação em curso. */
const gancho = vi.hoisted(() => ({ chamadas: [] as unknown[][], segurar: null as null | Promise<void>, segurarDepois: null as null | Promise<void>, falhar: false }))
vi.mock('./estado', async (original) => {
  const m = await original<typeof import('./estado')>()
  return {
    ...m,
    registrar: (async (...a: Parameters<typeof m.registrar>) => {
      gancho.chamadas.push(a)
      if (gancho.segurar) await gancho.segurar
      if (gancho.falhar) throw new Error('cortado')
      const r = await m.registrar(...a)
      // A gravação chegou ao IndexedDB; a resposta demora (ou nunca volta: a página morreu).
      if (gancho.segurarDepois) await gancho.segurarDepois
      return r
    }) as typeof m.registrar,
  }
})

afterEach(() => {
  esquecerPendentes()
  localStorage.clear()
  sessionStorage.clear()
  gancho.chamadas = []
  gancho.segurar = null
  gancho.segurarDepois = null
  gancho.falhar = false
  vi.useRealTimers()
})

const campo = (reg: string) => estadoAtual().registro('colecao', reg)?.campos.descricao
const escritas = () => gancho.chamadas.filter((c) => c[2] === 'alterar')

async function colecao(reg: string, descricao = 'inicial') {
  await registrar('colecao', reg, 'criar', { nome: 'c', descricao })
  gancho.chamadas = []
  return reg
}
function usar(reg: string, valor: string, extra: Partial<Parameters<typeof useCampoSalvo>[0]> = {}) {
  return renderHook((p: { valor: string }) => useCampoSalvo({ tipo: 'colecao', reg, campo: 'descricao', valor: p.valor, ...extra }), { initialProps: { valor } })
}

describe('useCampoSalvo: grava um segundo depois de parar de digitar', () => {
  it('o atraso é de 1 s', () => {
    expect(ATRASO_DO_CAMPO_MS).toBe(1000)
  })

  it('nada é gravado enquanto digita; 1 s depois da última tecla, grava uma vez', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await colecao('CO-campo000-1')
    const { result, unmount } = usar('CO-campo000-1', 'inicial')
    act(() => result.current.setTexto('a'))
    await act(() => vi.advanceTimersByTimeAsync(600))
    act(() => result.current.setTexto('ab')) // a digitação continua: o relógio recomeça
    await act(() => vi.advanceTimersByTimeAsync(600))
    expect(escritas()).toHaveLength(0)
    await act(() => vi.advanceTimersByTimeAsync(ATRASO_DO_CAMPO_MS - 600))
    expect(escritas()).toHaveLength(1)
    expect(escritas()[0]).toEqual(['colecao', 'CO-campo000-1', 'alterar', { descricao: 'ab' }])
    unmount()
  })

  it('sem timer sobrando: depois de gravar e depois de desmontar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await colecao('CO-campo000-2')
    const { result, unmount } = usar('CO-campo000-2', 'inicial')
    act(() => result.current.setTexto('novo'))
    expect(vi.getTimerCount()).toBe(1)
    await act(() => vi.advanceTimersByTimeAsync(ATRASO_DO_CAMPO_MS))
    expect(vi.getTimerCount()).toBe(0)
    act(() => result.current.setTexto('mais um'))
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('useCampoSalvo: também grava ao sair, em Ctrl/⌘S e ao desmontar', () => {
  it('sair do campo grava na hora e apara o texto', async () => {
    await colecao('CO-campo000-3')
    const { result } = usar('CO-campo000-3', 'inicial', { atrasoMs: 60_000 })
    act(() => {
      result.current.aoFocar()
      result.current.setTexto('  com espaços  ')
    })
    await act(() => result.current.aoDesfocar())
    expect(campo('CO-campo000-3')).toBe('com espaços')
    expect(result.current.texto).toBe('com espaços')
    expect(result.current.focado).toBe(false)
  })

  it('Ctrl/⌘S (descarregarPendentes) grava sem sair do campo, e de novo sem mudança não grava', async () => {
    await colecao('CO-campo000-4')
    const { result } = usar('CO-campo000-4', 'inicial', { atrasoMs: 60_000 })
    act(() => {
      result.current.aoFocar()
      result.current.setTexto('digitando ainda')
    })
    await act(() => descarregarPendentes())
    expect(campo('CO-campo000-4')).toBe('digitando ainda')
    expect(result.current.focado).toBe(true)
    await act(() => descarregarPendentes())
    expect(escritas()).toHaveLength(1)
  })

  it('desmontar com texto por gravar grava, e tira o registro de pendentes', async () => {
    await colecao('CO-campo000-5')
    const antes = totalDePendentes()
    const { result, unmount } = usar('CO-campo000-5', 'inicial', { atrasoMs: 60_000 })
    expect(totalDePendentes()).toBe(antes + 1)
    act(() => result.current.setTexto('escrito ao sair da tela'))
    unmount()
    expect(totalDePendentes()).toBe(antes)
    await waitFor(() => expect(campo('CO-campo000-5')).toBe('escrito ao sair da tela'))
  })

  it('texto igual ao salvo (mesmo com espaços nas pontas) nunca grava', async () => {
    await colecao('CO-campo000-6')
    const { result } = usar('CO-campo000-6', 'inicial', { atrasoMs: 5 })
    act(() => result.current.setTexto('  inicial '))
    await act(() => result.current.aoDesfocar())
    await act(() => descarregarPendentes())
    expect(escritas()).toHaveLength(0)
  })

  it('a falha de gravação avisa (aoFalhar) e a próxima tentativa avisa que passou', async () => {
    await colecao('CO-campo000-7')
    const aoFalhar = vi.fn()
    const { result } = usar('CO-campo000-7', 'inicial', { atrasoMs: 60_000, aoFalhar })
    act(() => result.current.setTexto('vai falhar'))
    gancho.falhar = true
    await act(() => result.current.aoDesfocar())
    expect(aoFalhar).toHaveBeenLastCalledWith(true)
    expect(campo('CO-campo000-7')).toBe('inicial')
    expect(result.current.texto).toBe('vai falhar') // o que a pessoa escreveu não some
    gancho.falhar = false
    await act(() => result.current.aoDesfocar())
    expect(aoFalhar).toHaveBeenLastCalledWith(false)
    expect(campo('CO-campo000-7')).toBe('vai falhar')
  })
})

describe('useCampoSalvo: uma edição durante uma gravação em curso é gravada pelo próximo atraso (sem esperar o blur)', () => {
  it('digita, o blur começa a gravar, digita mais ENQUANTO grava: o segundo texto sai sozinho', async () => {
    await colecao('CO-campo000-8')
    const { result } = usar('CO-campo000-8', 'inicial', { atrasoMs: 40 })
    act(() => {
      result.current.aoFocar()
      result.current.setTexto('primeiro')
    })
    let soltar!: () => void
    gancho.segurar = new Promise<void>((r) => (soltar = r))
    let blur!: Promise<void>
    act(() => {
      blur = result.current.aoDesfocar()
    })
    await waitFor(() => expect(escritas()).toHaveLength(1)) // a primeira está em curso
    act(() => {
      result.current.aoFocar()
      result.current.setTexto('primeiro e segundo')
    })
    gancho.segurar = null
    soltar()
    await act(() => blur)
    // sem novo blur nem Ctrl/⌘S: só o atraso
    await waitFor(() => expect(campo('CO-campo000-8')).toBe('primeiro e segundo'))
    expect(escritas()).toHaveLength(2)
  })

  it('Ctrl/⌘S durante a gravação em curso espera por ela e grava o que sobrou', async () => {
    await colecao('CO-campo000-9')
    const { result } = usar('CO-campo000-9', 'inicial', { atrasoMs: 60_000 })
    act(() => result.current.setTexto('um'))
    let soltar!: () => void
    gancho.segurar = new Promise<void>((r) => (soltar = r))
    let primeira!: Promise<void>
    act(() => {
      primeira = result.current.gravarAgora()
    })
    await waitFor(() => expect(escritas()).toHaveLength(1))
    act(() => result.current.setTexto('um dois'))
    gancho.segurar = null
    const segunda = descarregarPendentes()
    soltar()
    await act(async () => {
      await primeira
      await segunda
    })
    expect(campo('CO-campo000-9')).toBe('um dois')
  })
})

describe('useCampoSalvo: a rede de segurança do pagehide (localStorage, síncrona)', () => {
  it('pagehide guarda texto aparado e a base (hlc do campo) NA MESMA TAREFA, antes de o IndexedDB responder', async () => {
    await colecao('CO-campo000-10')
    const base = estadoAtual().hlcDoCampo('colecao', 'CO-campo000-10', 'descricao')
    const { result } = usar('CO-campo000-10', 'inicial', { atrasoMs: 60_000 })
    act(() => result.current.setTexto('  digitado e recarregado  '))
    window.dispatchEvent(new Event('pagehide'))
    expect(totalDeEmergencias()).toBe(1) // síncrono: nenhuma espera entre o evento e o localStorage
    const [chave] = Object.keys(localStorage).filter((k) => k.startsWith('iconodb:emergencia:'))
    expect(JSON.parse(localStorage.getItem(chave!)!)).toMatchObject({ tipo: 'colecao', reg: 'CO-campo000-10', campo: 'descricao', texto: 'digitado e recarregado', base })
    await act(() => descarregarPendentes())
  })

  it('quando o IndexedDB confirma, a entrada é limpa', async () => {
    await colecao('CO-campo000-11')
    const { result } = usar('CO-campo000-11', 'inicial', { atrasoMs: 60_000 })
    act(() => result.current.setTexto('chegou ao IndexedDB'))
    window.dispatchEvent(new Event('pagehide'))
    expect(totalDeEmergencias()).toBe(1)
    await waitFor(() => expect(campo('CO-campo000-11')).toBe('chegou ao IndexedDB'))
    await waitFor(() => expect(totalDeEmergencias()).toBe(0))
  })

  it('se a gravação falha, a entrada fica (a recuperação da abertura a aplica)', async () => {
    await colecao('CO-campo000-12')
    const { result } = usar('CO-campo000-12', 'inicial', { atrasoMs: 60_000 })
    act(() => result.current.setTexto('falhou mas ficou guardado'))
    gancho.falhar = true
    window.dispatchEvent(new Event('pagehide'))
    await act(async () => {
      await descarregarPendentes().catch(() => undefined)
    })
    expect(totalDeEmergencias()).toBe(1)
  })

  it('sem nada por gravar o pagehide não guarda nada', async () => {
    await colecao('CO-campo000-13')
    usar('CO-campo000-13', 'inicial', { atrasoMs: 60_000 })
    window.dispatchEvent(new Event('pagehide'))
    expect(totalDeEmergencias()).toBe(0)
  })

  it('a base é o hlc de quando a pessoa COMEÇOU a mexer: um valor que chegou de fora enquanto digitava não é coberto pela recuperação', async () => {
    await colecao('CO-campo000-14')
    const baseDoInicio = estadoAtual().hlcDoCampo('colecao', 'CO-campo000-14', 'descricao')
    const { result, rerender } = usar('CO-campo000-14', 'inicial', { atrasoMs: 60_000 })
    act(() => {
      result.current.aoFocar()
      result.current.setTexto('minha edição')
    })
    await act(async () => {
      await registrar('colecao', 'CO-campo000-14', 'alterar', { descricao: 'veio de outro aparelho' })
    })
    rerender({ valor: 'veio de outro aparelho' })
    expect(result.current.texto).toBe('minha edição') // em uso: não é sobrescrito
    window.dispatchEvent(new Event('pagehide'))
    const [chave] = Object.keys(localStorage).filter((k) => k.startsWith('iconodb:emergencia:'))
    expect(JSON.parse(localStorage.getItem(chave!)!).base).toBe(baseDoInicio)
    gancho.falhar = true
    await act(async () => {
      await descarregarPendentes().catch(() => undefined)
    })
  })
})

describe('useCampoSalvo: A-5, a gravação em voo no pagehide', () => {
  const entrada = () => {
    const [chave] = Object.keys(localStorage).filter((k) => k.startsWith('iconodb:emergencia:'))
    return JSON.parse(localStorage.getItem(chave!)!)
  }

  it('a gravação chegou ao IndexedDB e a página morreu antes de ela voltar: a recuperação aplica o texto que faltava', async () => {
    await colecao('CO-campo000-50')
    const base = estadoAtual().hlcDoCampo('colecao', 'CO-campo000-50', 'descricao')
    const { result } = usar('CO-campo000-50', 'inicial', { atrasoMs: 60_000 })
    gancho.segurarDepois = new Promise<void>(() => undefined)
    act(() => result.current.setTexto('v2'))
    act(() => {
      void result.current.gravarAgora()
    })
    await waitFor(() => expect(campo('CO-campo000-50')).toBe('v2'))
    act(() => result.current.setTexto('v3'))
    window.dispatchEvent(new Event('pagehide'))
    expect(entrada()).toMatchObject({ texto: 'v3', base, emVoo: 'v2' })
    gancho.segurarDepois = null // a próxima abertura
    expect(await recuperarEmergencias()).toBe(1)
    expect(campo('CO-campo000-50')).toBe('v3')
  })

  it('a gravação volta com mais texto por gravar: a entrada passa a ter a base nova', async () => {
    await colecao('CO-campo000-51')
    const base = estadoAtual().hlcDoCampo('colecao', 'CO-campo000-51', 'descricao')
    const { result } = usar('CO-campo000-51', 'inicial', { atrasoMs: 60_000 })
    let soltar!: () => void
    gancho.segurarDepois = new Promise<void>((ok) => (soltar = ok))
    act(() => result.current.setTexto('v2'))
    let gravando!: Promise<void>
    act(() => {
      gravando = result.current.gravarAgora()
    })
    await waitFor(() => expect(campo('CO-campo000-51')).toBe('v2'))
    act(() => result.current.setTexto('v3'))
    window.dispatchEvent(new Event('pagehide'))
    expect(entrada().base).toBe(base)
    gancho.segurarDepois = new Promise<void>(() => undefined) // a próxima gravação nunca volta
    gancho.segurar = new Promise<void>(() => undefined) // e nem chega
    soltar()
    await act(() => gravando)
    const nova = estadoAtual().hlcDoCampo('colecao', 'CO-campo000-51', 'descricao')
    expect(nova).not.toBe(base)
    expect(entrada()).toMatchObject({ texto: 'v3', base: nova })
    expect(entrada().emVoo).toBeUndefined()
    gancho.segurar = null // a próxima abertura
    gancho.segurarDepois = null
    expect(await recuperarEmergencias()).toBe(1)
    expect(campo('CO-campo000-51')).toBe('v3')
  })

  it('negativo: outro aparelho escreveu outro valor depois: a entrada é descartada (o valor mais novo fica)', async () => {
    await colecao('CO-campo000-52')
    const { result } = usar('CO-campo000-52', 'inicial', { atrasoMs: 60_000 })
    gancho.segurar = new Promise<void>(() => undefined) // a gravação de v2 nunca chega
    act(() => result.current.setTexto('v2'))
    act(() => {
      void result.current.gravarAgora()
    })
    act(() => result.current.setTexto('v3'))
    window.dispatchEvent(new Event('pagehide'))
    expect(entrada().emVoo).toBe('v2')
    gancho.segurar = null
    await registrar('colecao', 'CO-campo000-52', 'alterar', { descricao: 'de outro aparelho' })
    expect(await recuperarEmergencias()).toBe(0)
    expect(campo('CO-campo000-52')).toBe('de outro aparelho')
  })
})

describe('useCampoSalvo: o valor que chega de fora', () => {
  it('sem foco e sem alteração pendente, o valor novo aparece', async () => {
    await colecao('CO-campo000-15')
    const { result, rerender } = usar('CO-campo000-15', 'inicial')
    expect(result.current.texto).toBe('inicial')
    rerender({ valor: 'de outro aparelho' })
    expect(result.current.texto).toBe('de outro aparelho')
  })

  it('com foco, o que a pessoa escreve não é trocado', async () => {
    await colecao('CO-campo000-16')
    const { result, rerender } = usar('CO-campo000-16', 'inicial', { atrasoMs: 60_000 })
    act(() => {
      result.current.aoFocar()
      result.current.setTexto('escrevendo')
    })
    rerender({ valor: 'de outro aparelho' })
    expect(result.current.texto).toBe('escrevendo')
  })

  it('com foco e sem mexer no texto, o valor que chegou entra ao sair do campo (e a saída NÃO o sobrescreve)', async () => {
    await colecao('CO-campo000-19')
    const { result, rerender } = usar('CO-campo000-19', 'inicial', { atrasoMs: 60_000 })
    act(() => result.current.aoFocar())
    rerender({ valor: 'de outro aparelho' })
    expect(result.current.texto).toBe('inicial')
    await act(() => result.current.aoDesfocar())
    expect(result.current.texto).toBe('de outro aparelho')
    expect(escritas()).toHaveLength(0) // sair sem ter mexido nunca grava o texto velho por cima
  })

  it('sem foco mas com gravação que falhou, o texto não gravado também não é trocado', async () => {
    await colecao('CO-campo000-17')
    const { result, rerender } = usar('CO-campo000-17', 'inicial', { atrasoMs: 60_000 })
    act(() => result.current.setTexto('não gravou'))
    gancho.falhar = true
    await act(() => result.current.aoDesfocar())
    rerender({ valor: 'de outro aparelho' })
    expect(result.current.texto).toBe('não gravou')
  })
})

describe('useCampoSalvo: os eventos gravados', () => {
  it('um `alterar` só com o campo, com o texto aparado', async () => {
    await colecao('CO-campo000-18')
    const { result } = usar('CO-campo000-18', 'inicial', { atrasoMs: 60_000 })
    act(() => result.current.setTexto(' x '))
    await act(() => result.current.aoDesfocar())
    const ev = (await todosEventos()).filter((e) => e.reg === 'CO-campo000-18').at(-1)!
    expect(ev).toMatchObject({ op: 'alterar', campos: { descricao: 'x' } })
    expect(Object.keys(ev.campos)).toEqual(['descricao'])
  })
})

describe('useCampoSalvo: a entrada de emergência não sobrevive ao que a pessoa desfez', () => {
  it('gravação falhou e deixou a entrada; a pessoa volta ao texto salvo: a entrada é limpa e a recuperação não ressuscita o rascunho', async () => {
    await colecao('CO-campo000-20')
    const { result, unmount } = usar('CO-campo000-20', 'inicial', { atrasoMs: 60_000 })
    act(() => result.current.setTexto('rascunho abandonado'))
    gancho.falhar = true
    window.dispatchEvent(new Event('pagehide'))
    await act(async () => {
      await descarregarPendentes().catch(() => undefined)
    })
    expect(totalDeEmergencias()).toBe(1)
    gancho.falhar = false
    act(() => result.current.setTexto('inicial')) // desistiu: voltou ao que estava salvo
    expect(totalDeEmergencias()).toBe(0)
    unmount()
    expect(await recuperarEmergencias()).toBe(0)
    expect(campo('CO-campo000-20')).toBe('inicial')
  })

  it('o mesmo, voltando com espaços nas pontas (o texto aparado é o salvo)', async () => {
    await colecao('CO-campo000-21')
    const { result } = usar('CO-campo000-21', 'inicial', { atrasoMs: 60_000 })
    act(() => result.current.setTexto('outro'))
    gancho.falhar = true
    window.dispatchEvent(new Event('pagehide'))
    await act(async () => {
      await descarregarPendentes().catch(() => undefined)
    })
    expect(totalDeEmergencias()).toBe(1)
    gancho.falhar = false
    act(() => result.current.setTexto(' inicial '))
    expect(totalDeEmergencias()).toBe(0)
  })
})

describe('useCampoSalvo: só para registros que já existem (um `alterar` não cria registro)', () => {
  it('registro inexistente: não grava, nem em Ctrl/⌘S, nem ao desmontar, e o pagehide não guarda entrada', async () => {
    const { result, unmount } = usar('CO-campo000-23', '', { atrasoMs: 60_000 })
    act(() => result.current.setTexto('x'))
    window.dispatchEvent(new Event('pagehide'))
    expect(totalDeEmergencias()).toBe(0)
    await act(() => descarregarPendentes())
    await act(() => result.current.aoDesfocar())
    unmount()
    await act(async () => {
      await Promise.resolve()
    })
    expect(escritas()).toHaveLength(0)
    expect(estadoAtual().registro('colecao', 'CO-campo000-23')).toBeUndefined()
    expect((await todosEventos()).filter((e) => e.reg === 'CO-campo000-23')).toHaveLength(0)
  })

  it('o registro aparece depois (por exemplo, a sincronização o traz): a próxima gravação o altera, sem criar nada antes', async () => {
    const { result } = usar('CO-campo000-24', '', { atrasoMs: 60_000 })
    act(() => result.current.setTexto('guardado na tela'))
    await act(() => descarregarPendentes())
    expect(escritas()).toHaveLength(0)
    await registrar('colecao', 'CO-campo000-24', 'criar', { nome: 'c' })
    gancho.chamadas = []
    await act(() => descarregarPendentes())
    expect(campo('CO-campo000-24')).toBe('guardado na tela')
  })
})

describe('useCampoSalvo: aceitar (revisão 1 da Tarefa 8, o crédito que não pode ficar vazio)', () => {
  it('um valor recusado não é gravado (nem pelo atraso, nem ao sair, nem no pagehide); o anterior continua; um aceito grava', async () => {
    await colecao('CO-aceitar0-1', 'antes')
    const { result, unmount } = usar('CO-aceitar0-1', 'antes', { aceitar: (t) => t !== '', atrasoMs: 5 })
    act(() => result.current.setTexto('   '))
    await new Promise((r) => setTimeout(r, 30))
    await act(() => result.current.aoDesfocar())
    window.dispatchEvent(new Event('pagehide'))
    expect(escritas()).toHaveLength(0)
    expect(totalDeEmergencias()).toBe(0)
    expect(campo('CO-aceitar0-1')).toBe('antes')
    act(() => result.current.setTexto('depois'))
    await act(() => result.current.aoDesfocar())
    expect(campo('CO-aceitar0-1')).toBe('depois')
    unmount()
  })
})

describe('useCampoSalvo: normalizar, valorGravado e criaRegistro (Tarefa 11, a forma em uso de um verbete do pacote)', () => {
  const usarVerbete = (reg: string, valor: string, extra: Partial<Parameters<typeof useCampoSalvo>[0]> = {}) =>
    renderHook((p: { valor: string }) => useCampoSalvo({ tipo: 'verbete', reg, campo: 'formaEmUso', valor: p.valor, atrasoMs: 60_000, ...extra }), { initialProps: { valor } })
  const forma = (reg: string) => estadoAtual().registro('verbete', reg)?.campos.formaEmUso

  it('criaRegistro: o primeiro alterar cria o registro (sem criar antes); sem a opção, nada é gravado', async () => {
    const sem = usarVerbete('GL-920001', 'original')
    act(() => sem.result.current.setTexto('mudada'))
    await act(() => sem.result.current.aoDesfocar())
    expect(estadoAtual().registro('verbete', 'GL-920001')).toBeUndefined()
    sem.unmount()
    const com = usarVerbete('GL-920002', 'original', { criaRegistro: true })
    act(() => com.result.current.setTexto('mudada'))
    await act(() => com.result.current.aoDesfocar())
    expect(forma('GL-920002')).toBe('mudada')
    expect((await todosEventos()).filter((e) => e.reg === 'GL-920002').map((e) => e.op)).toEqual(['alterar'])
    com.unmount()
  })

  it('normalizar: o texto é normalizado antes de comparar e de gravar ("  a   b " → "a b"); igual ao salvo, não grava', async () => {
    const { result, unmount } = usarVerbete('GL-920003', 'a b', { criaRegistro: true, normalizar: (t) => t.replace(/\s+/g, ' ') })
    act(() => result.current.setTexto('  a    b '))
    await act(() => result.current.aoDesfocar())
    expect(estadoAtual().registro('verbete', 'GL-920003')).toBeUndefined()
    act(() => result.current.setTexto('a   c'))
    await act(() => result.current.aoDesfocar())
    expect(forma('GL-920003')).toBe('a c')
    unmount()
  })

  it('valorGravado: o que vai no evento pode ser outro (a forma igual à original grava null)', async () => {
    const { result, unmount } = usarVerbete('GL-920004', 'original', { criaRegistro: true, valorGravado: (t) => (t === 'original' ? null : t) })
    act(() => result.current.setTexto('outra'))
    await act(() => result.current.aoDesfocar())
    expect(forma('GL-920004')).toBe('outra')
    act(() => result.current.setTexto('original'))
    await act(() => result.current.aoDesfocar())
    expect(forma('GL-920004')).toBeNull()
    unmount()
  })

  it('pagehide num registro que ainda não existe: guarda a entrada com `criar`, e a recuperação a grava; sem `criar`, descarta', async () => {
    const { result, unmount } = usarVerbete('GL-920005', 'original', { criaRegistro: true })
    act(() => result.current.setTexto('digitada ao fechar'))
    window.dispatchEvent(new Event('pagehide'))
    expect(totalDeEmergencias()).toBe(1)
    const [chave] = Object.keys(localStorage).filter((k) => k.startsWith('iconodb:emergencia:'))
    expect(JSON.parse(localStorage.getItem(chave!)!)).toMatchObject({ tipo: 'verbete', reg: 'GL-920005', campo: 'formaEmUso', texto: 'digitada ao fechar', base: null, criar: true })
    // a aba caiu antes de gravar: nada no estado; a próxima abertura recupera (outra aba, entrada com mais de 5 s)
    unmount()
    gancho.falhar = true
    await act(() => descarregarPendentes())
    gancho.falhar = false
    expect(estadoAtual().registro('verbete', 'GL-920005')).toBeUndefined()
    const guardada = JSON.parse(localStorage.getItem(chave!)!)
    localStorage.setItem(chave!, JSON.stringify({ ...guardada, salvoEm: Date.now() - 60_000 }))
    expect(await recuperarEmergencias()).toBe(1)
    expect(forma('GL-920005')).toBe('digitada ao fechar')
    expect(totalDeEmergencias()).toBe(0)
    // sem `criar` (um registro que deveria existir e não existe): descartada, nada escrito
    localStorage.setItem(chave!, JSON.stringify({ ...guardada, reg: 'GL-920006', criar: undefined, salvoEm: Date.now() - 60_000 }))
    expect(await recuperarEmergencias()).toBe(0)
    expect(estadoAtual().registro('verbete', 'GL-920006')).toBeUndefined()
    expect(totalDeEmergencias()).toBe(0)
  })

  it('revisão 1, M1: o pagehide guarda o valor que iria no evento (null para a forma original), e a recuperação escreve esse valor', async () => {
    await registrar('verbete', 'GL-920010', 'alterar', { formaEmUso: 'forma mudada' })
    const { result, unmount } = usarVerbete('GL-920010', 'forma mudada', { criaRegistro: true, valorGravado: (t) => (t === 'original' ? null : t) })
    act(() => result.current.setTexto('original'))
    window.dispatchEvent(new Event('pagehide'))
    const [chave] = Object.keys(localStorage).filter((k) => k.startsWith('iconodb:emergencia:'))
    expect(JSON.parse(localStorage.getItem(chave!)!)).toMatchObject({ texto: 'original', valor: null })
    unmount()
    gancho.falhar = true
    await act(() => descarregarPendentes())
    gancho.falhar = false
    expect(forma('GL-920010')).toBe('forma mudada')
    localStorage.setItem(chave!, JSON.stringify({ ...JSON.parse(localStorage.getItem(chave!)!), salvoEm: Date.now() - 60_000 }))
    expect(await recuperarEmergencias()).toBe(1)
    expect(forma('GL-920010')).toBeNull()
    // idempotente: repetir a recuperação não escreve de novo
    expect(totalDeEmergencias()).toBe(0)
  })
})
