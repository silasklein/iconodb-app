import { aplicarAtualizacao } from './atualizacao'

describe('aplicarAtualizacao (o "Recarregar" do aviso)', () => {
  it('com um service worker esperando: pede para ele assumir (o app recarrega quando ele assume)', async () => {
    const atualizar = vi.fn(async () => undefined)
    const recarregar = vi.fn()
    await aplicarAtualizacao({ waiting: {} as ServiceWorker }, atualizar, recarregar)
    expect(atualizar).toHaveBeenCalledWith(true)
    expect(recarregar).not.toHaveBeenCalled()
  })

  it('sem registro ou sem worker esperando (outra aba já ativou): só recarrega, sem erro', async () => {
    const atualizar = vi.fn(async () => undefined)
    const recarregar = vi.fn()
    await aplicarAtualizacao(undefined, atualizar, recarregar)
    await aplicarAtualizacao({ waiting: null }, atualizar, recarregar)
    expect(atualizar).not.toHaveBeenCalled()
    expect(recarregar).toHaveBeenCalledTimes(2)
  })

  it('se pedir a troca falha, recarrega mesmo assim', async () => {
    const recarregar = vi.fn()
    await aplicarAtualizacao({ waiting: {} as ServiceWorker }, async () => Promise.reject(new TypeError("Cannot read properties of undefined (reading 'waiting')")), recarregar)
    expect(recarregar).toHaveBeenCalledTimes(1)
  })
})
