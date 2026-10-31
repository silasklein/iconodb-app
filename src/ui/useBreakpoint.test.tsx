import { act, renderHook } from '@testing-library/react'
import { useBreakpoint } from './useBreakpoint'

type Ouvinte = (e: { matches: boolean }) => void

/** matchMedia falso, controlado pela largura da janela. */
function instalarMatchMedia(larguraInicial: number) {
  let largura = larguraInicial
  const ouvintes = new Set<Ouvinte>()
  const avalia = (consulta: string) => {
    const m = /min-width:\s*(\d+)px/.exec(consulta)
    return m ? largura >= Number(m[1]) : false
  }
  window.matchMedia = ((consulta: string) => ({
    get matches() {
      return avalia(consulta)
    },
    media: consulta,
    addEventListener: (_: string, f: Ouvinte) => ouvintes.add(f),
    removeEventListener: (_: string, f: Ouvinte) => ouvintes.delete(f),
  })) as unknown as typeof window.matchMedia
  return (nova: number) => {
    largura = nova
    for (const f of ouvintes) f({ matches: nova >= 768 })
  }
}

describe('useBreakpoint', () => {
  it('abaixo de 768 px é "celular"', () => {
    instalarMatchMedia(375)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toBe('celular')
  })

  it('a partir de 768 px é "computador"', () => {
    instalarMatchMedia(768)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toBe('computador')
  })

  it('767 px ainda é "celular"', () => {
    instalarMatchMedia(767)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toBe('celular')
  })

  it('reage ao redimensionamento da janela nos dois sentidos', () => {
    const redimensionar = instalarMatchMedia(375)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toBe('celular')
    act(() => redimensionar(1280))
    expect(result.current).toBe('computador')
    act(() => redimensionar(500))
    expect(result.current).toBe('celular')
  })

  it('para de ouvir quando o componente sai da tela', () => {
    const redimensionar = instalarMatchMedia(375)
    const { result, unmount } = renderHook(() => useBreakpoint())
    unmount()
    expect(() => act(() => redimensionar(1280))).not.toThrow()
    expect(result.current).toBe('celular')
  })
})
