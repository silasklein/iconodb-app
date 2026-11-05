/**
 * O controle da sincronização: o estado exposto (sincronizado, por enviar, sincronizando, sem internet,
 * erro), os gatilhos automáticos, uma rodada por vez e o atalho Ctrl/⌘S. Um aparelho só, com o Dropbox em
 * memória; cada teste tem o próprio IndexedDB e os próprios módulos.
 */
import { act, render, screen } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { setTimeout as esperarDeVerdade } from 'node:timers/promises'
import { DropboxEmMemoria } from '../../tests/suporte/dropboxEmMemoria'

type Controle = typeof import('./useSincronizacao')
type Estado = typeof import('./estado')

let parar: (() => void) | null = null

beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', undefined)
  vi.stubGlobal('indexedDB', new IDBFactory())
})
afterEach(() => {
  parar?.()
  parar = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function carregar(nome?: string) {
  vi.resetModules()
  const controle: Controle = await import('./useSincronizacao')
  const estado: Estado = await import('./estado')
  const aparelho = await import('./aparelho')
  const escritaMod = await import('../dropbox/escrita')
  const manifesto = await import('../pacote/manifesto')
  const tentativas = await import('../dropbox/tentativas')
  if (nome) await aparelho.renomearAparelho(nome)
  const nuvem = new DropboxEmMemoria()
  const escrita = nuvem.escrita({
    ErroDeConflito: escritaMod.ErroDeConflito,
    ErroDeArquivoAusente: escritaMod.ErroDeArquivoAusente,
    ErroDeRede: manifesto.ErroDeRede,
    normalizarCaminho: escritaMod.normalizarCaminho,
  })
  return { controle, estado, nuvem, escrita, manifesto, tentativas, aparelho }
}

const nota = (estado: Estado, texto: string) => estado.registrar('nota', 'NT-x-1', 'alterar', { texto })
// Uma rodada lista três pastas (estado.json, diário e nomes): conta pelas rodadas, uma listagem do diário cada.
const listagens = (nuvem: DropboxEmMemoria) => nuvem.chamadas.filter((c) => c.op === 'listar' && c.caminho === 'usuario/diario').length

/** Espera as promessas e os IndexedDB pendentes assentarem. */
async function assentar(vezes = 20) {
  for (let i = 0; i < vezes; i++) await new Promise<void>((ok) => setImmediate(ok))
}

describe('na abertura do app', () => {
  it('o texto que a página guardou às pressas ao fechar (emergência) vira nota e entra na conta do que há por enviar', async () => {
    const { controle, estado, escrita } = await carregar()
    localStorage.setItem('iconodb:emergencia:abertura', JSON.stringify({ reg: 'NT-emer0000-1', campos: { texto: 'quase perdida', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: true } }))
    try {
      parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, automatica: false })
      await vi.waitFor(() => expect(estado.estadoAtual().registro('nota', 'NT-emer0000-1')?.campos.texto).toBe('quase perdida'))
      await vi.waitFor(() => expect(controle.estadoDaSync()).toEqual({ porEnviar: 1 }))
      expect(localStorage.getItem('iconodb:emergencia:abertura')).toBeNull()
    } finally {
      localStorage.clear()
    }
  })
})

describe('o estado da sincronização', () => {
  it('por enviar → sincronizando → sincronizado (com a hora); o número segue o que há por enviar', async () => {
    const { controle, estado, nuvem, escrita } = await carregar()
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, automatica: false })
    await assentar()
    expect(controle.estadoDaSync()).toBe('sincronizado')
    expect(controle.infoDaSync().ultimaEm).toBeNull()

    await nota(estado, 'um')
    await nota(estado, 'dois')
    await vi.waitFor(() => expect(controle.estadoDaSync()).toEqual({ porEnviar: 2 }))

    const soltares: (() => void)[] = [] // a rodada lista três pastas ao mesmo tempo
    nuvem.antes = (op) => (op === 'listar' ? new Promise<void>((ok) => soltares.push(ok)) : undefined)
    const p = controle.sincronizarAgora('manual')
    await vi.waitFor(() => expect(listagens(nuvem)).toBe(1))
    expect(controle.estadoDaSync()).toBe('sincronizando')
    nuvem.antes = null
    soltares.forEach((soltar) => soltar())
    const resumo = await p
    expect(resumo?.enviados).toBe(2)
    expect(controle.estadoDaSync()).toBe('sincronizado')
    expect(controle.infoDaSync().porEnviar).toBe(0)
    expect(controle.infoDaSync().ultimaEm).toEqual(expect.any(Number))
  })

  it('sem internet: "sem-internet", nada se perde; o evento online sobe tudo sozinho', async () => {
    const { controle, estado, nuvem, escrita } = await carregar()
    nuvem.offline = true
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, atrasoMs: 60_000 })
    await nota(estado, 'offline')
    expect(await controle.sincronizarAgora('manual')).toBeNull()
    expect(controle.estadoDaSync()).toBe('sem-internet')
    expect(controle.infoDaSync().porEnviar).toBe(1)
    nuvem.offline = false
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(controle.estadoDaSync()).toBe('sincronizado'))
    expect(nuvem.caminhos('usuario/diario/')).toHaveLength(1)
    const hist = controle.infoDaSync().historico
    expect(hist.some((h) => h.titulo === 'Sem internet' && /1 alteração esperou .* e foi enviada ao voltar/.test(h.detalhe))).toBe(true)
  })

  it('o navegador já sabe que está sem rede: nem tenta (nenhuma chamada ao Dropbox)', async () => {
    const { controle, nuvem, escrita } = await carregar()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, automatica: false })
    expect(await controle.sincronizarAgora('manual')).toBeNull()
    expect(controle.estadoDaSync()).toBe('sem-internet')
    expect(nuvem.chamadas).toEqual([])
  })

  it('sem login: "Entre de novo para sincronizar"; o trabalho local continua por enviar', async () => {
    const { controle, estado } = await carregar()
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => null, automatica: false })
    await nota(estado, 'guardada')
    await controle.sincronizarAgora('manual')
    expect(controle.estadoDaSync()).toEqual({ erro: 'login', mensagem: 'Entre de novo para sincronizar' })
    expect(controle.infoDaSync().porEnviar).toBe(1)
    expect(controle.infoDaSync().historico).toEqual([])
    expect(estado.estadoAtual().registro('nota', 'NT-x-1')?.campos.texto).toBe('guardada')
  })

  it('login expirado no meio (ErroDeLogin) e permissão que falta (ErroDePermissao) viram erros com o que fazer', async () => {
    const { controle, nuvem, escrita, manifesto, tentativas } = await carregar()
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, automatica: false })
    nuvem.antes = () => {
      throw new manifesto.ErroDeLogin()
    }
    await controle.sincronizarAgora('manual')
    expect(controle.estadoDaSync()).toMatchObject({ erro: 'login' })
    nuvem.antes = () => {
      throw new tentativas.ErroDePermissao('files.content.write')
    }
    await controle.sincronizarAgora('manual')
    expect(controle.estadoDaSync()).toMatchObject({ erro: 'permissao', mensagem: expect.stringContaining('files.content.write') })
    nuvem.antes = () => {
      throw Object.assign(new Error('Response failed with a 400 code'), { status: 400, error: { error_summary: 'other/..' } })
    }
    await controle.sincronizarAgora('manual')
    expect(controle.estadoDaSync()).toEqual({ erro: 'geral', mensagem: 'Não foi possível falar com o Dropbox (resposta 400: other/..)' })
    expect(controle.infoDaSync().historico[0]).toMatchObject({ titulo: 'Não foi possível sincronizar', detalhe: 'Não foi possível falar com o Dropbox (resposta 400: other/..)' })
    nuvem.antes = () => {
      throw Object.assign(new Error('x'), { status: 400, error: { error_summary: 'Authorization: Bearer sl.u.SEGREDO123' } })
    }
    await controle.sincronizarAgora('manual')
    expect(JSON.stringify(controle.estadoDaSync())).not.toContain('SEGREDO123')
    expect(controle.estadoDaSync()).toMatchObject({ erro: 'geral', mensagem: expect.stringContaining('[removido]') })
    nuvem.antes = null
    await controle.sincronizarAgora('manual')
    expect(controle.estadoDaSync()).toBe('sincronizado')
  })

  it('o histórico registra o que foi enviado e recebido, e os arquivos malformados vão para os avisos', async () => {
    const { controle, estado, nuvem, escrita } = await carregar()
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, automatica: false })
    await nota(estado, 'um')
    nuvem.colocar('usuario/diario/zzzzzzzz/000001.jsonl', 'lixo\n')
    await controle.sincronizarAgora('manual')
    const info = controle.infoDaSync()
    expect(info.historico[0]).toMatchObject({ titulo: 'Sincronizado', detalhe: '1 enviada' })
    expect(info.avisos).toEqual([{ caminho: 'usuario/diario/zzzzzzzz/000001.jsonl', motivo: '1 linha ilegível', parcial: false, em: expect.any(Number) }])
  })

  it('"Mesmo campo nos dois aparelhos" diz o que é o registro (a nota em CA00001), não o id (A-11)', async () => {
    const { controle, estado, nuvem, escrita } = await carregar()
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, automatica: false })
    await estado.registrar('nota', 'NT-x-1', 'criar', { texto: 'deste', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: false })
    // O outro aparelho escreveu o mesmo campo antes (hlc mais velho): vale a deste.
    const outro = { v: 1, id: 'zzzzzzzz-1-0', hlc: '0000000000001-0000-zzzzzzzz', aparelho: 'zzzzzzzz', tipo: 'nota', reg: 'NT-x-1', op: 'alterar', campos: { texto: 'do outro' } }
    nuvem.colocar('usuario/diario/zzzzzzzz/000001.jsonl', `${JSON.stringify(outro)}\n`)
    await controle.sincronizarAgora('manual')
    const aviso = controle.infoDaSync().historico.find((h) => h.titulo === 'Mesmo campo nos dois aparelhos')
    expect(aviso?.detalhe).toMatch(/^Nota em CA00001: valeu a deste aparelho \(\d\d:\d\d\); a do outro aparelho ficou guardada no histórico$/)
  })
})

describe('estado.json ilegível', () => {
  it('é um aviso, não um erro: a sincronização segue ("sincronizado") e o aviso some quando o arquivo é corrigido', async () => {
    const { controle, estado, nuvem, escrita } = await carregar()
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, automatica: false })
    nuvem.colocar('usuario/estado.json', JSON.stringify({ v: 2, base: { v: 2, registros: [] }, ate: {}, segmentos: {} }))
    await nota(estado, 'um')
    await controle.sincronizarAgora('manual')
    expect(controle.estadoDaSync()).toBe('sincronizado')
    expect(controle.infoDaSync().estadoIlegivel).toContain('versão mais nova do app em outro aparelho')
    expect(nuvem.caminhos('usuario/diario/')).toHaveLength(1)
    expect(controle.infoDaSync().estadoLidoEmParte).toBe(false)
    nuvem.colocar('usuario/estado.json', JSON.stringify({ v: 1, base: { v: 1, registros: [] }, ate: {}, segmentos: {} }))
    await controle.sincronizarAgora('manual')
    expect(controle.infoDaSync().estadoIlegivel).toBeNull()
  })

  it('lido só em parte (A-7): estadoLidoEmParte vale, e fica guardado (o app reaberto ainda mostra o aviso próprio)', async () => {
    const { controle, estado, nuvem, escrita } = await carregar()
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, automatica: false })
    const h = `${String(1_790_000_000_000).padStart(13, '0')}-0000-zzzzzzzz`
    const futuro = { tipo: 'mapa-mental', id: 'MM-zzzzzzzz-1', criadoEm: h, alteradoEm: h, exclusao: null, campos: { titulo: [{ hlc: h, evento: 'zzzzzzzz-1-0', valor: 'x' }] } }
    nuvem.colocar('usuario/estado.json', JSON.stringify({ v: 1, base: { v: 1, registros: [futuro] }, ate: {}, segmentos: {} }))
    await nota(estado, 'um')
    await controle.sincronizarAgora('manual')
    expect(controle.infoDaSync().estadoIlegivel).toContain('1 registro que esta versão não conhece')
    expect(controle.infoDaSync().estadoLidoEmParte).toBe(true)
    // Na rodada seguinte (o mesmo rev, não baixado de novo), continua lido em parte.
    await controle.sincronizarAgora('manual')
    expect(controle.infoDaSync().estadoLidoEmParte).toBe(true)
  })
})

describe('gatilhos automáticos', () => {
  it('ao abrir (uma vez), 5 s depois da ÚLTIMA mudança e ao voltar a ficar visível', async () => {
    const { controle, estado, nuvem, escrita } = await carregar()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita })
    await vi.waitFor(() => expect(listagens(nuvem)).toBe(1))
    await vi.waitFor(() => expect(controle.estadoDaSync()).toBe('sincronizado'))
    // Iniciar de novo (o StrictMode monta duas vezes) não abre de novo.
    controle.iniciarSincronizacao()()
    await assentar()
    expect(listagens(nuvem)).toBe(1)

    expect(controle.ATRASO_DEPOIS_DA_MUDANCA_MS).toBe(5000)
    await nota(estado, 'a')
    await assentar()
    vi.advanceTimersByTime(4000)
    await nota(estado, 'b')
    await assentar()
    vi.advanceTimersByTime(4000)
    await assentar()
    expect(listagens(nuvem)).toBe(1)
    vi.advanceTimersByTime(1000)
    await vi.waitFor(() => expect(listagens(nuvem)).toBe(2))
    await vi.waitFor(() => expect(controle.estadoDaSync()).toBe('sincronizado'))
    expect(nuvem.caminhos('usuario/diario/')).toHaveLength(1)

    // Voltar a ficar visível com algo por enviar sincroniza na hora.
    vi.useRealTimers()
    await nota(estado, 'c')
    await vi.waitFor(() => expect(controle.infoDaSync().porEnviar).toBe(1))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(nuvem.caminhos('usuario/diario/')).toHaveLength(2))
  })

  it('desligada: nada automático (nem ao abrir); o botão ainda sincroniza; a escolha fica guardada', async () => {
    const primeira = await carregar()
    parar = primeira.controle.iniciarSincronizacao({ obterEscrita: async () => primeira.escrita, atrasoMs: 10 })
    await vi.waitFor(() => expect(listagens(primeira.nuvem)).toBe(1))
    await primeira.controle.definirAutomatico(false)
    expect(primeira.controle.infoDaSync().automatico).toBe(false)
    parar()
    parar = null

    // O app aberto de novo (mesmo IndexedDB): a escolha vale desde a abertura.
    const { controle, estado, nuvem, escrita } = await carregar()
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, atrasoMs: 10 })
    await vi.waitFor(() => expect(controle.infoDaSync().iniciado).toBe(true))
    expect(controle.infoDaSync().automatico).toBe(false)
    await nota(estado, 'x')
    window.dispatchEvent(new Event('online'))
    await new Promise((ok) => setTimeout(ok, 50))
    expect(listagens(nuvem)).toBe(0)
    await vi.waitFor(() => expect(controle.estadoDaSync()).toEqual({ porEnviar: 1 }))
    await controle.sincronizarAgora('manual')
    expect(listagens(nuvem)).toBe(1)
    // Ligar de novo com algo por enviar sobe logo.
    await nota(estado, 'y')
    await vi.waitFor(() => expect(controle.infoDaSync().porEnviar).toBe(1))
    await controle.definirAutomatico(true)
    await vi.waitFor(() => expect(listagens(nuvem)).toBe(2))
  })
})

describe('uma sincronização por vez', () => {
  it('pedidos durante uma rodada viram UMA rodada a seguir; entre abas, o Web Lock iconodb-usuario', async () => {
    const pedidos: string[] = []
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request: vi.fn(async (nome: string, fazer: () => Promise<unknown>) => (pedidos.push(nome), fazer())) },
    })
    onTestFinished(() => {
      delete (navigator as { locks?: unknown }).locks
    })
    const { controle, nuvem, escrita } = await carregar()
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, automatica: false })
    let soltar!: () => void
    let primeira = true
    nuvem.antes = (op) => {
      if (op === 'listar' && primeira) {
        primeira = false
        return new Promise<void>((ok) => (soltar = ok))
      }
    }
    const a = controle.sincronizarAgora('manual')
    await vi.waitFor(() => expect(listagens(nuvem)).toBe(1))
    const b = controle.sincronizarAgora('atalho')
    const c = controle.sincronizarAgora('mudanca')
    soltar()
    await Promise.all([a, b, c])
    expect(listagens(nuvem)).toBe(2)
    expect(pedidos).toEqual(['iconodb-usuario', 'iconodb-usuario'])
  })
})

describe('Ctrl/⌘S: salvar e sincronizar', () => {
  it('sincroniza e impede o "salvar página" do navegador, também num campo de texto e com um diálogo aberto', async () => {
    const { controle, nuvem, escrita } = await carregar()
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, automatica: false })
    const { AtalhoDeSalvar } = controle
    render(
      <>
        <AtalhoDeSalvar />
        <input aria-label="nota" />
        <div role="dialog" aria-modal="true">
          <button type="button">dentro</button>
        </div>
      </>,
    )
    const teclar = (alvo: Element, init: KeyboardEventInit) => {
      const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
      act(() => {
        alvo.dispatchEvent(e)
      })
      return e
    }
    expect(teclar(document.body, { key: 's', ctrlKey: true }).defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(listagens(nuvem)).toBe(1))
    expect(teclar(screen.getByRole('textbox', { name: 'nota' }), { key: 's', metaKey: true }).defaultPrevented).toBe(true)
    expect(teclar(screen.getByRole('button', { name: 'dentro' }), { key: 'S', ctrlKey: true, shiftKey: false }).defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(listagens(nuvem)).toBeGreaterThanOrEqual(2))
    // Outras combinações continuam com o navegador.
    expect(teclar(document.body, { key: 'p', ctrlKey: true }).defaultPrevented).toBe(false)
    expect(teclar(document.body, { key: 's', ctrlKey: true, altKey: true }).defaultPrevented).toBe(false)
  })
})

describe('Ctrl/⌘S grava o que está pendente antes de sincronizar', () => {
  it('um campo que grava ao sair e o rascunho de uma nota gravam primeiro; o que gravaram vai na mesma rodada', async () => {
    const { controle, estado, nuvem, escrita } = await carregar()
    const pendentes = await import('./pendentes')
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, automatica: false })
    const ordem: string[] = []
    pendentes.registrarPendente(async () => {
      await nota(estado, 'texto que ainda não tinha saído do campo')
      ordem.push('campo gravou')
    })
    pendentes.registrarPendente(async () => {
      await estado.registrar('nota', 'NT-x-2', 'criar', { texto: 'rascunho' })
      ordem.push('rascunho gravou')
    })
    nuvem.antes = (op) => {
      if (op === 'listar') ordem.push('Dropbox')
    }
    const { AtalhoDeSalvar } = controle
    render(
      <>
        <AtalhoDeSalvar />
        <input aria-label="campo" />
      </>,
    )
    const campo = screen.getByRole('textbox', { name: 'campo' })
    campo.focus()
    const e = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })
    act(() => {
      campo.dispatchEvent(e)
    })
    expect(e.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(controle.infoDaSync().ultimaEm).not.toBeNull())
    expect(ordem.indexOf('Dropbox')).toBeGreaterThan(ordem.indexOf('campo gravou'))
    expect(ordem.indexOf('Dropbox')).toBeGreaterThan(ordem.indexOf('rascunho gravou'))
    expect(controle.infoDaSync().porEnviar).toBe(0)
    expect(nuvem.caminhos('usuario/diario').length).toBeGreaterThan(0)
  })

  it('o botão "Salvar e sincronizar" também: grava o pendente e sincroniza, mesmo que uma gravação falhe', async () => {
    const { controle, estado, nuvem, escrita } = await carregar()
    const pendentes = await import('./pendentes')
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, automatica: false })
    pendentes.registrarPendente(() => Promise.reject(new Error('sem espaço')))
    pendentes.registrarPendente(async () => {
      await nota(estado, 'saiu')
    })
    const resumo = await controle.sincronizarAgora('manual')
    expect(resumo?.enviados).toBe(1)
    expect(nuvem.caminhos('usuario/diario').length).toBeGreaterThan(0)
  })

  it('as rodadas automáticas não esperam por ninguém (o rascunho já grava sozinho a cada segundo)', async () => {
    const { controle, escrita } = await carregar()
    const pendentes = await import('./pendentes')
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, automatica: false })
    const f = vi.fn()
    pendentes.registrarPendente(f)
    await controle.sincronizarAgora('mudanca')
    expect(f).not.toHaveBeenCalled()
  })
})

describe('nova tentativa depois de uma falha (backoff)', () => {
  const erroGeral = () => Object.assign(new Error('Response failed with a 400 code'), { status: 400, error: { error_summary: 'other/..' } })
  /** Um 500 do Dropbox conta como falha de rede (o navegador, porém, está com rede: tenta de novo sozinho). */
  const erroDoServidor = () => Object.assign(new Error('Response failed with a 500 code'), { status: 500, error: { error_summary: 'other/..' } })
  /** Deixa as promessas e os IndexedDB assentarem sem mexer nos relógios falsos. */
  const rodadas = (nuvem: DropboxEmMemoria) => listagens(nuvem)

  it('com a rede de pé: 30 s, 1 min, 5 min e depois a cada 5 min, enquanto falha; uma rodada limpa zera a contagem', async () => {
    const { controle, estado, nuvem, escrita } = await carregar()
    await nota(estado, 'por enviar')
    let falhando = true
    nuvem.antes = (op) => {
      if (falhando && op === 'listar') throw erroDoServidor()
    }
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, atrasoMs: 24 * 3_600_000 })
    await assentar(250)
    expect(rodadas(nuvem)).toBe(1) // ao abrir
    expect(controle.estadoDaSync()).toBe('sem-internet')
    expect(controle.ATRASOS_DA_NOVA_TENTATIVA_MS).toEqual([30_000, 60_000, 300_000])

    const avancar = async (ms: number) => {
      vi.advanceTimersByTime(ms)
      await assentar(250)
    }
    await avancar(29_999)
    expect(rodadas(nuvem)).toBe(1)
    await avancar(1)
    expect(rodadas(nuvem)).toBe(2) // 30 s
    await avancar(59_999)
    expect(rodadas(nuvem)).toBe(2)
    await avancar(1)
    expect(rodadas(nuvem)).toBe(3) // + 1 min
    await avancar(299_999)
    expect(rodadas(nuvem)).toBe(3)
    await avancar(1)
    expect(rodadas(nuvem)).toBe(4) // + 5 min
    await avancar(300_000)
    expect(rodadas(nuvem)).toBe(5) // e a cada 5 min
    await avancar(300_000)
    expect(rodadas(nuvem)).toBe(6)

    // A rede responde: a próxima tentativa funciona, tudo sobe e a contagem zera.
    falhando = false
    await avancar(300_000)
    expect(rodadas(nuvem)).toBe(7)
    // O hash do estado.json usa o crypto do Node (fora dos relógios falsos): espera a rodada acabar de verdade, pelo
    // relógio real (só setTimeout é falso aqui) e com folga para a máquina carregada da suíte inteira.
    const limite = Date.now() + 15_000
    while (controle.estadoDaSync() !== 'sincronizado' && Date.now() < limite) {
      await esperarDeVerdade(10)
      await assentar(5)
    }
    expect(controle.estadoDaSync()).toBe('sincronizado')
    expect(nuvem.caminhos('usuario/diario/')).toHaveLength(1)
    await avancar(30 * 60_000)
    expect(rodadas(nuvem)).toBe(7) // nada mais a tentar

    // Uma falha nova recomeça em 30 s.
    falhando = true
    await controle.sincronizarAgora('manual')
    expect(rodadas(nuvem)).toBe(8)
    await avancar(30_000)
    expect(rodadas(nuvem)).toBe(9)
  })

  it('um erro geral do Dropbox (400) também tenta de novo sozinho, em 30 s', async () => {
    const { controle, nuvem, escrita } = await carregar()
    let falhando = true
    nuvem.antes = (op) => {
      if (falhando && op === 'listar') throw erroGeral()
    }
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, atrasoMs: 24 * 3_600_000 })
    await assentar(250)
    expect(controle.estadoDaSync()).toMatchObject({ erro: 'geral' })
    falhando = false
    vi.advanceTimersByTime(30_000)
    await assentar(250)
    expect(rodadas(nuvem)).toBe(2)
    expect(controle.estadoDaSync()).toBe('sincronizado')
  })

  it('uma rodada manual no meio da espera cancela o agendamento; sem rede ou sem login, nada é agendado', async () => {
    const { controle, nuvem, escrita } = await carregar()
    let falhando = true
    nuvem.antes = (op) => {
      if (falhando && op === 'listar') throw erroGeral()
    }
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, atrasoMs: 24 * 3_600_000 })
    await assentar(250)
    expect(rodadas(nuvem)).toBe(1)
    falhando = false
    vi.advanceTimersByTime(10_000)
    await controle.sincronizarAgora('manual') // limpa: não há mais o que tentar
    expect(rodadas(nuvem)).toBe(2)
    vi.advanceTimersByTime(10 * 60_000)
    await assentar(250)
    expect(rodadas(nuvem)).toBe(2)

    // O navegador diz que está sem rede: espera o evento online, sem agendar.
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(await controle.sincronizarAgora('manual')).toBeNull()
    vi.advanceTimersByTime(10 * 60_000)
    await assentar(250)
    expect(rodadas(nuvem)).toBe(2)
    onLine.mockReturnValue(true)

    // Sem login: só o usuário resolve.
    parar()
    const outra = await carregar()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    parar = outra.controle.iniciarSincronizacao({ obterEscrita: async () => null, atrasoMs: 24 * 3_600_000 })
    await assentar(250)
    expect(outra.controle.estadoDaSync()).toMatchObject({ erro: 'login' })
    vi.advanceTimersByTime(10 * 60_000)
    await assentar(250)
    expect(outra.controle.estadoDaSync()).toMatchObject({ erro: 'login' })
    expect(outra.nuvem.chamadas).toEqual([])
  })

  it('desligar a sincronização automática cancela a nova tentativa', async () => {
    const { controle, nuvem, escrita } = await carregar()
    nuvem.antes = (op) => {
      if (op === 'listar') throw erroGeral()
    }
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    parar = controle.iniciarSincronizacao({ obterEscrita: async () => escrita, atrasoMs: 24 * 3_600_000 })
    await assentar(250)
    expect(rodadas(nuvem)).toBe(1)
    await controle.definirAutomatico(false)
    vi.advanceTimersByTime(10 * 60_000)
    await assentar(250)
    expect(rodadas(nuvem)).toBe(1)
  })
})

describe('as imagens do usuário sobem na mesma rodada (Tarefa 8)', () => {
  async function comImagem() {
    const c = await carregar()
    const { armazemMemoria } = await import('../pacote/armazem')
    const { cacheMemoria } = await import('../pacote/imagens')
    const local = await import('../imagens-usuario/local')
    const operacoes = await import('../imagens-usuario/operacoes')
    const { processadaFalsa } = await import('../../tests/suporte/imagensDeTeste')
    const armazem = armazemMemoria()
    local.usarArmazemDasImagens(armazem)
    local.usarCacheDasImagens(cacheMemoria())
    parar = c.controle.iniciarSincronizacao({ obterEscrita: async () => c.escrita, automatica: false })
    await assentar()
    const id = await operacoes.adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), { tipo: 'tons', legenda: '', credito: 'foto própria', principal: false })
    return { ...c, armazem, id }
  }

  it('a imagem pendente conta no que há por enviar; a rodada sobe tela e miniatura ANTES do evento e o original depois', async () => {
    const { controle, nuvem, armazem, id } = await comImagem()
    // O evento `imagem` e a imagem por subir.
    await vi.waitFor(() => expect(controle.estadoDaSync()).toEqual({ porEnviar: 2 }))
    await controle.sincronizarAgora('manual')
    // Os originais sobem depois da rodada, fora da trava dela.
    await controle.aguardarOriginais()
    const envios = nuvem.chamadas.filter((c) => c.op === 'enviar').map((c) => c.caminho)
    const tela = envios.indexOf(`usuario/imagens/${id}/tela.webp`)
    const segmento = envios.findIndex((c) => c.startsWith('usuario/diario/'))
    const original = envios.indexOf(`usuario/imagens/${id}/original.jpg`)
    expect(tela).toBeGreaterThanOrEqual(0)
    expect(envios.indexOf(`usuario/imagens/${id}/miniatura.webp`)).toBeLessThan(segmento)
    expect(tela).toBeLessThan(segmento)
    expect(original).toBeGreaterThan(segmento)
    expect(controle.estadoDaSync()).toBe('sincronizado')
    expect(await armazem.listar(id)).toEqual([])
  })

  it('missing_scope ao subir a imagem: o erro de permissão de sempre (com "entrar de novo"); a imagem fica na fila', async () => {
    const { controle, nuvem, armazem, tentativas, id } = await comImagem()
    nuvem.antes = (op, caminho) => {
      if (op === 'enviar' && caminho.startsWith('usuario/imagens/')) throw new tentativas.ErroDePermissao('files.content.write')
    }
    await controle.sincronizarAgora('manual')
    expect(controle.estadoDaSync()).toMatchObject({ erro: 'permissao', mensagem: expect.stringContaining('files.content.write') })
    expect(await armazem.existe(`${id}/original.jpg`)).toBe(true)
    expect(controle.infoDaSync().porEnviar).toBeGreaterThanOrEqual(1)
    nuvem.antes = null
    await controle.sincronizarAgora('manual')
    await controle.aguardarOriginais()
    expect(controle.estadoDaSync()).toBe('sincronizado')
    expect(nuvem.arquivos.has(`usuario/imagens/${id}/original.jpg`)).toBe(true)
  })

  it('revisão 1 (I1): o original estoura o prazo; a rodada fica registrada (hora, histórico) e a imagem espera na fila', async () => {
    const { controle, nuvem, id } = await comImagem()
    nuvem.antes = (op, caminho) => {
      if (op === 'enviar' && caminho.endsWith('/original.jpg')) throw new DOMException('O Dropbox não respondeu a tempo.', 'TimeoutError')
    }
    const resumo = await controle.sincronizarAgora('manual')
    await controle.aguardarOriginais()
    expect(resumo).not.toBeNull()
    expect(controle.infoDaSync().ultimaEm).not.toBeNull()
    expect(controle.infoDaSync().historico[0]).toMatchObject({ titulo: 'Sincronizado' })
    expect(controle.estadoDaSync()).toEqual({ porEnviar: 1 })
    expect(nuvem.arquivos.has(`usuario/imagens/${id}/tela.webp`)).toBe(true)
    expect(nuvem.arquivos.has(`usuario/imagens/${id}/original.jpg`)).toBe(false)
  })

  it('revisão 1 (I1c): os originais sobem FORA da trava da sincronização (outra aba não fica esperando um original lento)', async () => {
    const seguradas: string[] = []
    const vistas: string[][] = []
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: async (nome: string, a: unknown, b?: unknown) => {
          const fazer = (typeof a === 'function' ? a : b) as (l: unknown) => Promise<unknown>
          seguradas.push(nome)
          try {
            return await fazer({ name: nome })
          } finally {
            seguradas.splice(seguradas.indexOf(nome), 1)
          }
        },
      },
    })
    onTestFinished(() => {
      delete (navigator as { locks?: unknown }).locks
    })
    const { controle, nuvem, id } = await comImagem()
    nuvem.antes = (op, caminho) => {
      if (op === 'enviar' && caminho.startsWith('usuario/imagens/')) vistas.push([caminho.split('/').pop()!, ...seguradas])
    }
    await controle.sincronizarAgora('manual')
    await controle.aguardarOriginais()
    expect(vistas).toEqual([
      ['tela.webp', 'iconodb-usuario'],
      ['miniatura.webp', 'iconodb-usuario'],
      ['original.jpg', 'iconodb-imagens-originais'],
    ])
    void id
  })

  it('revisão 2: o original esperando a rede volta a valer no evento online e depois de uma rodada boa', async () => {
    const { controle, nuvem, armazem, id } = await comImagem()
    nuvem.antes = (op, caminho) => {
      if (op === 'enviar' && caminho.endsWith('/original.jpg')) throw new DOMException('O Dropbox não respondeu a tempo.', 'TimeoutError')
    }
    await controle.sincronizarAgora('manual')
    await controle.aguardarOriginais()
    const ler = async () => JSON.parse(new TextDecoder().decode((await armazem.ler(`${id}/envio.json`))!))
    expect((await ler()).proxima).not.toBeNull()
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(async () => expect((await ler()).proxima).toBeNull())
    // De novo na espera; uma rodada boa também a zera, e o original sobe na mesma volta.
    await controle.sincronizarAgora('manual')
    await controle.aguardarOriginais()
    expect((await ler()).proxima).not.toBeNull()
    nuvem.antes = null
    await controle.sincronizarAgora('manual')
    await controle.aguardarOriginais()
    expect(nuvem.arquivos.has(`usuario/imagens/${id}/original.jpg`)).toBe(true)
  })
})
