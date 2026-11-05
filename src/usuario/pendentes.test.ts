import { descarregarPendentes, registrarPendente, totalDePendentes, esquecerPendentes } from './pendentes'

afterEach(() => esquecerPendentes())

describe('pendentes: quem tem algo por gravar registra aqui', () => {
  it('descarregarPendentes chama todos e espera todos', async () => {
    const ordem: string[] = []
    registrarPendente(async () => {
      await Promise.resolve()
      ordem.push('a')
    })
    registrarPendente(() => {
      ordem.push('b')
    })
    await descarregarPendentes()
    expect(ordem.sort()).toEqual(['a', 'b'])
  })

  it('desfazer o registro tira da lista', async () => {
    const f = vi.fn()
    const desfazer = registrarPendente(f)
    expect(totalDePendentes()).toBe(1)
    desfazer()
    desfazer()
    expect(totalDePendentes()).toBe(0)
    await descarregarPendentes()
    expect(f).not.toHaveBeenCalled()
  })

  it('um que falha não impede os outros; a descarga relata o erro só no fim', async () => {
    const ok = vi.fn()
    registrarPendente(() => Promise.reject(new Error('falhou')))
    registrarPendente(ok)
    await expect(descarregarPendentes()).rejects.toThrow('falhou')
    expect(ok).toHaveBeenCalledOnce()
  })

  it('sem ninguém registrado, resolve na hora', async () => {
    await expect(descarregarPendentes()).resolves.toBeUndefined()
  })
})

describe('esconder a aba ou fechá-la grava o que está pendente', () => {
  const esconder = () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  }
  afterEach(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }))

  it('visibilitychange para hidden', async () => {
    const f = vi.fn()
    registrarPendente(f)
    esconder()
    expect(f).toHaveBeenCalledOnce()
  })

  it('visibilitychange para visible não grava nada', () => {
    const f = vi.fn()
    registrarPendente(f)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(f).not.toHaveBeenCalled()
  })

  it('pagehide', () => {
    const f = vi.fn()
    registrarPendente(f)
    window.dispatchEvent(new Event('pagehide'))
    expect(f).toHaveBeenCalledOnce()
  })

  it('um erro na gravação ao esconder não vira erro não tratado', async () => {
    registrarPendente(() => Promise.reject(new Error('sem espaço')))
    esconder()
    await new Promise((r) => setTimeout(r, 0))
  })
})
