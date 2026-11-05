import { apagarRascunhoDaCoordenadaSeVersao, chaveDoRascunhoDaCoordenada, comecarAGravarACoordenada, guardarRascunhoDaCoordenada, versaoDoRascunhoDaCoordenada } from './rascunho'
import { renderHook, act } from '@testing-library/react'
import { useRascunhoDaCoordenada } from './rascunho'

afterEach(() => localStorage.clear())

describe('T17-B-16: a versão do rascunho da coordenada conta também as escritas de outra aba', () => {
  it('o evento storage de uma chave de rascunho soma uma versão ao sítio dela', () => {
    // quem leu a versão antes de a outra aba escrever não apaga o rascunho mais novo
    const antes = versaoDoRascunhoDaCoordenada('TESTE-9')
    const { unmount } = renderHook(() => useRascunhoDaCoordenada('TESTE-9')) // a escuta do `storage` vive enquanto alguém assina
    localStorage.setItem(chaveDoRascunhoDaCoordenada('TESTE-9'), JSON.stringify({ lat: '1', lon: '' }))
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: chaveDoRascunhoDaCoordenada('TESTE-9') })))
    expect(versaoDoRascunhoDaCoordenada('TESTE-9')).toBe(antes + 1)
    apagarRascunhoDaCoordenadaSeVersao('TESTE-9', antes)
    expect(localStorage.getItem(chaveDoRascunhoDaCoordenada('TESTE-9'))).not.toBeNull()
    unmount()
  })

  it('uma chave de outra coisa não conta', () => {
    const antes = versaoDoRascunhoDaCoordenada('TESTE-9')
    const { unmount } = renderHook(() => useRascunhoDaCoordenada('TESTE-9'))
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: 'iconodb:outra-coisa' })))
    expect(versaoDoRascunhoDaCoordenada('TESTE-9')).toBe(antes)
    unmount()
  })

  it('a assinatura é uma só (não refeita a cada renderização)', () => {
    const adicionar = vi.spyOn(window, 'addEventListener')
    const { rerender, unmount } = renderHook(() => useRascunhoDaCoordenada('TESTE-9'))
    for (let i = 0; i < 5; i++) rerender()
    expect(adicionar.mock.calls.filter(([t]) => t === 'storage')).toHaveLength(1)
    unmount()
    adicionar.mockRestore()
  })
})

describe('T17-B-13: apagar só se a versão é a mesma, e «gravando» esconde o rascunho da página', () => {
  it('uma escrita depois da versão lida impede o apagamento', () => {
    guardarRascunhoDaCoordenada('TESTE-9', { lat: '1', lon: '2' })
    const v = versaoDoRascunhoDaCoordenada('TESTE-9')
    guardarRascunhoDaCoordenada('TESTE-9', { lat: '1', lon: '3' })
    apagarRascunhoDaCoordenadaSeVersao('TESTE-9', v)
    expect(JSON.parse(localStorage.getItem(chaveDoRascunhoDaCoordenada('TESTE-9'))!)).toEqual({ lat: '1', lon: '3' })
    apagarRascunhoDaCoordenadaSeVersao('TESTE-9', versaoDoRascunhoDaCoordenada('TESTE-9'))
    expect(localStorage.getItem(chaveDoRascunhoDaCoordenada('TESTE-9'))).toBeNull()
  })

  it('enquanto grava, o hook não devolve o rascunho (que segue guardado); ao terminar, devolve', () => {
    guardarRascunhoDaCoordenada('TESTE-9', { lat: '1', lon: '' })
    const { result } = renderHook(() => useRascunhoDaCoordenada('TESTE-9'))
    expect(result.current).toEqual({ lat: '1', lon: '' })
    let fim!: () => void
    act(() => void (fim = comecarAGravarACoordenada('TESTE-9')))
    expect(result.current).toBeNull()
    expect(localStorage.getItem(chaveDoRascunhoDaCoordenada('TESTE-9'))).not.toBeNull()
    act(() => fim())
    expect(result.current).toEqual({ lat: '1', lon: '' })
  })
})
