import { descarregarPendentes, esquecerPendentes } from '../usuario/pendentes'
import { todosEventos } from '../usuario/armazem'
import { estadoAtual, registrar } from '../usuario/estado'
import type { Evento } from '../usuario/eventos'
import { Rascunho, type OpcoesDoRascunho } from './rascunho'
import { recuperarEmergencias } from '../usuario/emergencia'

const ALVO = { tipo: 'objeto', ref: 'CA00001' } as const
let contador = 0
const proximo = () => `NT-teste000-${++contador}`
const real = { registrar, novoId: async () => proximo() }

const doTeste = async (reg: string): Promise<Evento[]> =>
  (await todosEventos()).filter((e) => e.reg === reg).sort((a, b) => (a.hlc < b.hlc ? -1 : 1))
/** Deixa as promessas e o IndexedDB em memória assentarem (sem mexer nos temporizadores de mentira). */
const assentar = async (vezes = 30) => {
  for (let i = 0; i < vezes; i++) await new Promise<void>((ok) => setImmediate(ok))
}
const avancar = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms)
  await assentar()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  vi.useRealTimers()
  esquecerPendentes()
})

function novo(extra: Partial<OpcoesDoRascunho> = {}) {
  return new Rascunho({ alvo: ALVO, dependencias: real, ...extra })
}

describe('Rascunho: cada tecla chega ao IndexedDB, como um evento agregado a cada 1 s', () => {
  it('texto em branco nunca cria uma nota', async () => {
    const r = novo()
    r.mudar('')
    r.mudar('   \n ')
    await avancar(5000)
    expect(r.reg).toBeNull()
    expect(contador).toBe(0)
    await r.descarregar()
    expect(r.reg).toBeNull()
  })

  it('a primeira gravação (1 s depois da primeira tecla) cria a nota inteira, como rascunho', async () => {
    const r = novo()
    r.mudar('M')
    await avancar(999)
    expect(r.reg).toBeNull()
    await avancar(1)
    expect(r.reg).toMatch(/^NT-teste000-/)
    const eventos = await doTeste(r.reg!)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ tipo: 'nota', op: 'criar', campos: { texto: 'M', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: true } })
    expect(estadoAtual().registro('nota', r.reg!)?.campos.texto).toBe('M')
  })

  it('20 teclas no mesmo segundo viram UM evento, com o texto final; o segundo seguinte, outro', async () => {
    const r = novo()
    let t = ''
    for (const c of 'Marduk e o íbex de Maḥteṣ') {
      t += c
      r.mudar(t)
      await avancar(30)
    }
    // ~25 teclas em ~750 ms: ainda nada
    expect(r.reg).toBeNull()
    await avancar(300)
    const reg = r.reg!
    expect(await doTeste(reg)).toHaveLength(1)
    expect((await doTeste(reg))[0]!.campos.texto).toBe('Marduk e o íbex de Maḥteṣ')
    r.mudar('Marduk e o íbex de Maḥteṣ, de novo')
    r.mudar('Marduk e o íbex de Maḥteṣ, de novo.')
    await avancar(1000)
    const eventos = await doTeste(reg)
    expect(eventos.map((e) => e.op)).toEqual(['criar', 'alterar'])
    expect(eventos[1]!.campos).toEqual({ texto: 'Marduk e o íbex de Maḥteṣ, de novo.' })
  })

  it('uma nota que já existe só leva `alterar` com o texto', async () => {
    await registrar('nota', 'NT-teste000-100', 'criar', { texto: 'antes', alvoTipo: 'verbete', alvo: 'GL-900001', rascunho: false })
    const r = new Rascunho({ reg: 'NT-teste000-100', texto: 'antes', rascunho: false, dependencias: real })
    r.mudar('antes')
    await avancar(2000)
    expect(await doTeste('NT-teste000-100')).toHaveLength(1)
    r.mudar('depois')
    await avancar(1000)
    const eventos = await doTeste('NT-teste000-100')
    expect(eventos.map((e) => [e.op, Object.keys(e.campos)])).toEqual([
      ['criar', ['texto', 'alvoTipo', 'alvo', 'rascunho']],
      ['alterar', ['texto']],
    ])
  })

  it('a nota criada leva as âncoras do texto da fonte (sha dos trechos) no evento de criação', async () => {
    const ancoras = [{ p: 'PA-1', sha: 'b'.repeat(64) }]
    const r = novo({ ancorar: async () => ancoras })
    r.mudar('algo')
    await avancar(1000)
    expect((await doTeste(r.reg!))[0]!.campos.ancoras).toEqual(ancoras)
    // as gravações seguintes não repetem as âncoras
    r.mudar('algo mais')
    await avancar(1000)
    expect((await doTeste(r.reg!))[1]!.campos).toEqual({ texto: 'algo mais' })
  })

  it('se as âncoras não puderem ser calculadas, a nota é gravada sem elas (o texto vem primeiro)', async () => {
    const r = novo({ ancorar: () => Promise.reject(new Error('banco ocupado')) })
    r.mudar('texto importante')
    await avancar(1000)
    const [criar] = await doTeste(r.reg!)
    expect(criar!.campos.texto).toBe('texto importante')
    expect('ancoras' in criar!.campos).toBe(false)
  })
})

describe('descarregar: grava já, sem esperar o segundo', () => {
  it('grava o pendente na hora e não grava de novo se nada mudou', async () => {
    const r = novo()
    r.mudar('rápido')
    await r.descarregar()
    const reg = r.reg!
    expect(await doTeste(reg)).toHaveLength(1)
    await r.descarregar()
    await avancar(3000)
    expect(await doTeste(reg)).toHaveLength(1)
  })

  it('duas descargas ao mesmo tempo, antes de a nota ter id, criam UMA nota', async () => {
    const r = novo()
    r.mudar('uma só')
    const ids: string[] = []
    const comContagem = { ...real, novoId: async () => { const id = proximo(); ids.push(id); return id } }
    const q = new Rascunho({ alvo: ALVO, dependencias: comContagem })
    q.mudar('uma só')
    await Promise.all([q.descarregar(), q.descarregar(), q.descarregar()])
    expect(ids).toHaveLength(1)
    expect(await doTeste(q.reg!)).toHaveLength(1)
    await r.descarregar()
  })

  it('esconder a aba (visibilitychange) e fechá-la (pagehide) gravam o rascunho sem esperar', async () => {
    const a = novo()
    a.mudar('antes de esconder')
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    await assentar()
    expect(a.reg).not.toBeNull()
    expect((await doTeste(a.reg!))[0]!.campos.texto).toBe('antes de esconder')

    const b = novo()
    b.mudar('antes de fechar')
    window.dispatchEvent(new Event('pagehide'))
    await assentar()
    expect((await doTeste(b.reg!))[0]!.campos.texto).toBe('antes de fechar')
  })

  it('Ctrl/⌘S e "Salvar e sincronizar" (descarregarPendentes) gravam o rascunho', async () => {
    const r = novo()
    r.mudar('vai no Ctrl+S')
    await descarregarPendentes()
    expect((await doTeste(r.reg!))[0]!.campos.texto).toBe('vai no Ctrl+S')
  })

  it('encerrar tira o rascunho da lista de pendentes (depois disso nada grava sozinho)', async () => {
    const r = novo()
    r.mudar('x')
    await r.descarregar()
    const reg = r.reg!
    r.encerrar()
    r.mudar('y')
    window.dispatchEvent(new Event('pagehide'))
    await avancar(3000)
    expect(await doTeste(reg)).toHaveLength(1)
  })
})

describe('salvar', () => {
  it('grava o que falta e tira a marca de rascunho', async () => {
    const r = novo()
    r.mudar('final')
    const reg = await r.salvar()
    expect(reg).toBe(r.reg)
    const eventos = await doTeste(reg!)
    expect(eventos.map((e) => [e.op, e.campos])).toEqual([
      ['criar', expect.objectContaining({ texto: 'final', rascunho: true })],
      ['alterar', { rascunho: false }],
    ])
    expect(r.rascunho).toBe(false)
    // salvar de novo não grava nada
    await r.salvar()
    expect(await doTeste(reg!)).toHaveLength(2)
  })

  it('sem texto, não há nota para salvar', async () => {
    const r = novo()
    expect(await r.salvar()).toBeNull()
  })

  it('uma nota que já estava salva continua sem marca de rascunho', async () => {
    await registrar('nota', 'NT-teste000-101', 'criar', { texto: 'a', alvoTipo: 'obra', alvo: 'BIB-900001', rascunho: false })
    const r = new Rascunho({ reg: 'NT-teste000-101', texto: 'a', rascunho: false, dependencias: real })
    r.mudar('b')
    await r.salvar()
    expect((await doTeste('NT-teste000-101')).map((e) => e.op)).toEqual(['criar', 'alterar'])
  })
})

describe('falhas e concorrência', () => {
  it('quem assina é avisado assim que o id da nota é reservado, antes de o `criar` terminar (a tela esconde o rascunho da lista)', async () => {
    let liberar!: () => void
    const trava = new Promise<void>((ok) => (liberar = ok))
    const lento: typeof registrar = async (...args) => {
      await trava
      return registrar(...args)
    }
    const r = novo({ dependencias: { ...real, registrar: lento } })
    const vistos: (string | null)[] = []
    r.assinar(() => vistos.push(r.reg))
    r.mudar('a')
    const gravando = r.descarregar()
    await assentar()
    expect(vistos.at(-1)).toMatch(/^NT-teste000-/)
    expect(estadoAtual().registro('nota', r.reg!)).toBeUndefined()
    liberar()
    await gravando
    expect(estadoAtual().registro('nota', r.reg!)).toBeDefined()
  })

  it('se a gravação falha, o texto continua pendente, o estado diz "erro" e a próxima tentativa grava', async () => {
    let falhar = true
    const registrarQuePodeFalhar: typeof registrar = (...args) => (falhar ? Promise.reject(new Error('IndexedDB cheio')) : registrar(...args))
    const r = novo({ dependencias: { ...real, registrar: registrarQuePodeFalhar } })
    const estados: string[] = []
    r.assinar(() => estados.push(r.estado))
    r.mudar('texto que não pode se perder')
    await expect(r.descarregar()).rejects.toThrow('IndexedDB cheio')
    expect(r.estado).toBe('erro')
    expect(r.erro).toMatch(/IndexedDB cheio/)
    falhar = false
    await avancar(1000)
    expect(r.estado).toBe('limpo')
    expect((await doTeste(r.reg!))[0]!.campos.texto).toBe('texto que não pode se perder')
    expect(estados).toContain('erro')
  })

  it('o id da nota não se perde se o `criar` falha: a nova tentativa usa o mesmo id e cria uma vez só', async () => {
    let falhar = true
    const ids: string[] = []
    const dep = {
      novoId: async () => { const id = proximo(); ids.push(id); return id },
      registrar: ((...args: Parameters<typeof registrar>) => (falhar ? Promise.reject(new Error('x')) : registrar(...args))) as typeof registrar,
    }
    const r = novo({ dependencias: dep })
    r.mudar('a')
    await expect(r.descarregar()).rejects.toThrow()
    falhar = false
    await r.descarregar()
    expect(ids).toHaveLength(1)
    expect(await doTeste(ids[0]!)).toHaveLength(1)
  })

  it('digitar durante uma gravação lenta: nunca duas gravações ao mesmo tempo, e o texto final é gravado', async () => {
    let emAndamento = 0
    let maximo = 0
    let soltar = null as (() => void) | null
    const lento: typeof registrar = async (...args) => {
      emAndamento++
      maximo = Math.max(maximo, emAndamento)
      await new Promise<void>((ok) => (soltar = ok))
      emAndamento--
      return registrar(...args)
    }
    const r = novo({ dependencias: { ...real, registrar: lento } })
    r.mudar('um')
    await avancar(1000)
    expect(emAndamento).toBe(1)
    r.mudar('um dois')
    await avancar(1000) // o temporizador dispara com a primeira ainda gravando
    r.mudar('um dois três')
    expect(maximo).toBe(1)
    soltar!()
    await assentar()
    await avancar(1000)
    soltar!()
    await assentar()
    await avancar(1000)
    soltar?.()
    await assentar()
    expect(estadoAtual().registro('nota', r.reg!)?.campos.texto).toBe('um dois três')
    expect(maximo).toBe(1)
  })
})

describe('excluir', () => {
  it('marca a nota como excluída; restaurar a traz de volta (nada se perde)', async () => {
    const r = novo()
    r.mudar('vai embora')
    await r.descarregar()
    await r.excluir()
    expect(estadoAtual().registro('nota', r.reg!)?.excluido).toBe(true)
    await r.restaurar()
    expect(estadoAtual().registro('nota', r.reg!)?.excluido).toBe(false)
    expect(estadoAtual().registro('nota', r.reg!)?.campos.texto).toBe('vai embora')
  })

  it('excluir um rascunho que nunca foi gravado não cria nada', async () => {
    const r = novo()
    r.mudar('   ')
    await r.excluir()
    expect(r.reg).toBeNull()
  })
})

describe('Rascunho: revisão 1 (excluída não recebe escrita; âncoras começam ao abrir)', () => {
  it('depois de excluir, o que ainda chega do campo não grava nada (a nota excluída não ganha texto); restaurar volta a gravar', async () => {
    const r = novo()
    r.mudar('vai embora')
    await r.descarregar()
    await r.excluir()
    const antes = (await doTeste(r.reg!)).length
    r.mudar('vai embora e mais texto')
    await avancar(5000)
    await r.descarregar()
    expect(await doTeste(r.reg!)).toHaveLength(antes)
    expect(estadoAtual().registro('nota', r.reg!)?.campos.texto).toBe('vai embora')
    await r.restaurar()
    r.mudar('voltou')
    await avancar(1000)
    expect(estadoAtual().registro('nota', r.reg!)?.campos.texto).toBe('voltou')
  })

  it('preparar() começa a calcular as âncoras ao abrir; o primeiro `criar` só espera o resultado, sem calcular de novo', async () => {
    let soltar!: (a: { p: string; sha: string }[]) => void
    const ancorar = vi.fn(() => new Promise<{ p: string; sha: string }[]>((ok) => (soltar = ok)))
    const r = novo({ ancorar })
    r.preparar()
    expect(ancorar).toHaveBeenCalledTimes(1)
    r.mudar('texto')
    const gravada = r.descarregar()
    await assentar()
    expect(r.reg).not.toBeNull()
    expect((await doTeste(r.reg!)).length).toBe(0)
    soltar([{ p: 'PA-1', sha: 'a'.repeat(64) }])
    await gravada
    expect(ancorar).toHaveBeenCalledTimes(1)
    expect((await doTeste(r.reg!))[0]!.campos.ancoras).toEqual([{ p: 'PA-1', sha: 'a'.repeat(64) }])
  })

  it('uma nota que já existe não calcula âncoras ao abrir', () => {
    const ancorar = vi.fn(async () => [])
    novo({ reg: 'NT-ja000000-1', texto: 'x', ancorar }).preparar()
    expect(ancorar).not.toHaveBeenCalled()
  })
})

describe('rede de segurança no pagehide (localStorage síncrono)', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())
  const guardados = () => Object.keys(localStorage).filter((k) => k.startsWith('iconodb:emergencia:'))

  it('ao esconder/fechar a página, o texto ainda não gravado é guardado NA HORA (síncrono) e limpo quando o IndexedDB confirma', async () => {
    const r = novo({ ancorar: async () => [{ p: 'PA-1', sha: 'b'.repeat(64) }] })
    r.preparar()
    await assentar()
    r.mudar('digitado e fechado')
    window.dispatchEvent(new Event('pagehide'))
    // nenhuma espera: já está lá
    expect(guardados()).toHaveLength(1)
    const dado = JSON.parse(localStorage.getItem(guardados()[0]!)!)
    expect(dado.campos).toMatchObject({ texto: 'digitado e fechado', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: true, ancoras: [{ p: 'PA-1' }] })
    await assentar()
    expect(r.reg).not.toBeNull()
    expect((await doTeste(r.reg!))[0]!.campos.texto).toBe('digitado e fechado')
    expect(guardados()).toHaveLength(0)
  })

  it('se a gravação falha, o texto continua guardado para a próxima abertura', async () => {
    const r = novo({ dependencias: { ...real, registrar: (() => Promise.reject(new Error('cortado'))) as typeof registrar } })
    r.mudar('não chegou')
    window.dispatchEvent(new Event('pagehide'))
    await assentar()
    expect(guardados()).toHaveLength(1)
    r.encerrar()
  })

  it('uma nota que já existe guarda o texto novo com o id dela; nada guardado quando não há o que gravar', async () => {
    const r = novo({ reg: 'NT-emer0000-77', texto: 'igual', rascunho: false })
    window.dispatchEvent(new Event('pagehide'))
    expect(guardados()).toHaveLength(0)
    r.mudar('igual e mais')
    window.dispatchEvent(new Event('pagehide'))
    expect(JSON.parse(localStorage.getItem(guardados()[0]!)!)).toMatchObject({ reg: 'NT-emer0000-77', campos: { texto: 'igual e mais' } })
    r.encerrar()
  })

  const entrada = () => JSON.parse(localStorage.getItem(guardados()[0]!)!)

  it('o id reservado já vai para a entrada (antes de a gravação começar): sem isso a recuperação criaria outra nota com o mesmo texto', async () => {
    let n = 0
    const r = novo({ dependencias: { registrar, novoId: async () => `NT-teste000-r${++n}` } })
    r.mudar('abc')
    await assentar() // o id foi pedido na primeira tecla; o `criar` só viria em 1 s
    expect(r.reg).toBeNull()
    window.dispatchEvent(new Event('pagehide'))
    expect(entrada().reg).toBe('NT-teste000-r1')
    expect(entrada().base).toBeNull()
    await assentar()
    r.encerrar()
  })

  it('se o id só chega depois de a entrada ser guardada, a entrada é atualizada na hora com ele', async () => {
    let soltar!: (id: string) => void
    const r = novo({ dependencias: { registrar, novoId: () => new Promise<string>((ok) => (soltar = ok)) } })
    r.mudar('abc')
    window.dispatchEvent(new Event('pagehide'))
    expect(entrada().reg).toBeNull()
    soltar('NT-teste000-tarde')
    await assentar(3)
    expect(entrada().reg).toBe('NT-teste000-tarde')
    r.encerrar()
  })

  it('a entrada leva o hlc do `texto` de que o rascunho partiu; depois de cada gravação, o do que ele mesmo gravou', async () => {
    const r = novo({ reg: 'NT-emer0000-88', texto: 'base', rascunho: false, baseHlc: '0000000000001-0000-aparelho' })
    r.mudar('base e mais')
    window.dispatchEvent(new Event('pagehide'))
    expect(entrada().base).toBe('0000000000001-0000-aparelho')
    await registrar('nota', 'NT-emer0000-88', 'criar', { texto: 'base', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: false })
    await r.descarregar()
    await assentar()
    expect(guardados()).toHaveLength(0)
    r.mudar('base e mais ainda')
    window.dispatchEvent(new Event('pagehide'))
    expect(entrada().base).toBe(estadoAtual().hlcDoCampo('nota', 'NT-emer0000-88', 'texto'))
    r.encerrar()
  })

  describe('A-5: uma gravação em voo no pagehide não vira cópia "Texto recuperado" na recuperação', () => {
    const recuperadas = () => [...(estadoAtual().registros.get('nota')?.values() ?? [])].filter((n) => String(n.campos.texto).startsWith('Texto recuperado'))
    async function notaExistente(reg: string) {
      await registrar('nota', reg, 'criar', { texto: 'v1', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: false })
      return estadoAtual().hlcDoCampo('nota', reg, 'texto')!
    }

    it('a gravação chegou ao IndexedDB mas a página morreu antes de ela "voltar": a recuperação aplica o texto por cima, sem cópia', async () => {
      const reg = 'NT-emvoo000-1'
      const base = await notaExistente(reg)
      // A gravação chega ao IndexedDB, mas a resposta nunca volta ao rascunho (a página morre).
      const lento = (async (...a: Parameters<typeof registrar>) => {
        const r = await registrar(...a)
        await new Promise<void>(() => undefined)
        return r
      }) as typeof registrar
      const r = novo({ reg, texto: 'v1', rascunho: false, baseHlc: base, dependencias: { ...real, registrar: lento } })
      r.mudar('v2')
      void r.descarregar()
      await assentar()
      expect(estadoAtual().registro('nota', reg)!.campos.texto).toBe('v2') // chegou
      r.mudar('v3') // digitou mais, e a página se esconde
      window.dispatchEvent(new Event('pagehide'))
      expect(entrada()).toMatchObject({ reg, base, emVoo: 'v2', campos: { texto: 'v3' } })
      // Próxima abertura.
      expect(await recuperarEmergencias()).toBe(1)
      expect(estadoAtual().registro('nota', reg)!.campos.texto).toBe('v3')
      expect(recuperadas()).toHaveLength(0)
      r.encerrar()
    })

    it('a gravação volta com o texto já sujo de novo: a entrada passa a ter a base nova (o hlc do que acabou de ser gravado)', async () => {
      const reg = 'NT-emvoo000-2'
      const base = await notaExistente(reg)
      let soltar!: () => void
      let n = 0
      const lento = (async (...a: Parameters<typeof registrar>) => {
        // A primeira chega e espera o teste soltar; a segunda nunca chega (a página morre antes).
        if (++n > 1) return new Promise<never>(() => undefined)
        const r = await registrar(...a)
        await new Promise<void>((ok) => (soltar = ok))
        return r
      }) as typeof registrar
      const r = novo({ reg, texto: 'v1', rascunho: false, baseHlc: base, dependencias: { ...real, registrar: lento } })
      r.mudar('v2')
      void r.descarregar()
      await assentar()
      r.mudar('v3')
      window.dispatchEvent(new Event('pagehide'))
      expect(entrada().base).toBe(base)
      soltar()
      await assentar()
      const depois = estadoAtual().hlcDoCampo('nota', reg, 'texto')
      expect(depois).not.toBe(base)
      expect(entrada()).toMatchObject({ reg, base: depois, campos: { texto: 'v3' } })
      expect(entrada().emVoo ?? null).toBeNull()
      expect(await recuperarEmergencias()).toBe(1)
      expect(estadoAtual().registro('nota', reg)!.campos.texto).toBe('v3')
      expect(recuperadas()).toHaveLength(0)
      r.encerrar()
    })

    it('negativo: outro aparelho mudou o texto depois (não é o que estava em voo): continua virando cópia', async () => {
      const reg = 'NT-emvoo000-3'
      const base = await notaExistente(reg)
      const lento = (async () => new Promise<never>(() => undefined)) as typeof registrar
      const r = novo({ reg, texto: 'v1', rascunho: false, baseHlc: base, dependencias: { ...real, registrar: lento } })
      r.mudar('v2')
      void r.descarregar()
      await assentar()
      r.mudar('v3')
      window.dispatchEvent(new Event('pagehide'))
      expect(entrada().emVoo).toBe('v2')
      await registrar('nota', reg, 'alterar', { texto: 'de outro aparelho' })
      expect(await recuperarEmergencias()).toBe(1)
      expect(estadoAtual().registro('nota', reg)!.campos.texto).toBe('de outro aparelho')
      expect(recuperadas()).toHaveLength(1)
      r.encerrar()
    })
  })

  it('o rascunho que volta a ficar em branco (nada sujo) limpa o que estava guardado', async () => {
    const r = novo()
    r.mudar('x')
    window.dispatchEvent(new Event('pagehide'))
    expect(guardados()).toHaveLength(1)
    r.mudar('')
    await r.descarregar()
    expect(guardados()).toHaveLength(0)
    r.encerrar()
  })

  it('semear(): com o rascunho limpo, troca o texto e a base pelos da nota de agora; com texto por gravar não mexe em nada', async () => {
    const r = novo({ reg: 'NT-emer0000-89', texto: 'velho', rascunho: false, baseHlc: 'h1' })
    expect(r.semear('novo de outro aparelho', 'h2')).toBe(true)
    expect(r.texto).toBe('novo de outro aparelho')
    r.mudar('novo de outro aparelho!')
    window.dispatchEvent(new Event('pagehide'))
    expect(entrada().base).toBe('h2')
    expect(r.semear('outro', 'h3')).toBe(false)
    expect(r.texto).toBe('novo de outro aparelho!')
    r.encerrar()
  })

  it('excluir limpa o que estava guardado', async () => {
    const r = novo()
    r.mudar('vai ser excluída')
    window.dispatchEvent(new Event('pagehide'))
    await assentar()
    r.mudar('vai ser excluída!')
    window.dispatchEvent(new Event('pagehide'))
    await r.excluir()
    expect(guardados()).toHaveLength(0)
  })
})

describe('finalizar: a tela vai embora', () => {
  it('grava o que falta e sai da lista de pendentes', async () => {
    const r = novo()
    r.mudar('último texto')
    await r.finalizar()
    expect((await doTeste(r.reg!))[0]!.campos.texto).toBe('último texto')
    const { totalDePendentes } = await import('../usuario/pendentes')
    expect(totalDePendentes()).toBe(0)
  })

  it('se a gravação falha, o rascunho continua vivo e grava assim que conseguir (o texto não existe em outro lugar)', async () => {
    let falhar = true
    const registrarQuePodeFalhar: typeof registrar = (...args) => (falhar ? Promise.reject(new Error('sem espaço')) : registrar(...args))
    const r = novo({ dependencias: { ...real, registrar: registrarQuePodeFalhar } })
    r.mudar('não pode se perder')
    await r.finalizar()
    const { totalDePendentes } = await import('../usuario/pendentes')
    expect(totalDePendentes()).toBe(1)
    expect(r.estado).toBe('erro')
    falhar = false
    await avancar(1000)
    expect((await doTeste(r.reg!))[0]!.campos.texto).toBe('não pode se perder')
    expect(totalDePendentes()).toBe(0)
  })
})
