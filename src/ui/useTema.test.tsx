import { renderHook } from '@testing-library/react'
import tokensCss from './tokens.css?raw'
import { useTema } from './useTema'

const html = document.documentElement

describe('useTema', () => {
  it('"item" põe a classe tema-item no documento enquanto montado e a tira ao sair', () => {
    const { unmount } = renderHook(() => useTema('item'))
    expect(html).toHaveClass('tema-item')
    unmount()
    expect(html).not.toHaveClass('tema-item')
  })

  it('"consulta" não deixa classe de tema', () => {
    const { unmount } = renderHook(() => useTema('consulta'))
    expect(html).not.toHaveClass('tema-item')
    unmount()
    expect(html).not.toHaveClass('tema-item')
  })

  it('troca de tema ao mudar o argumento', () => {
    const { rerender, unmount } = renderHook(({ t }) => useTema(t), {
      initialProps: { t: 'item' as 'item' | 'consulta' },
    })
    expect(html).toHaveClass('tema-item')
    rerender({ t: 'consulta' })
    expect(html).not.toHaveClass('tema-item')
    rerender({ t: 'item' })
    expect(html).toHaveClass('tema-item')
    unmount()
    expect(html).not.toHaveClass('tema-item')
  })

  it('ao trocar de tela, o tema da tela nova vence o da que saiu', () => {
    const a = renderHook(() => useTema('item'))
    const b = renderHook(() => useTema('item'))
    a.unmount()
    expect(html).toHaveClass('tema-item')
    b.unmount()
    expect(html).not.toHaveClass('tema-item')
  })
})

describe('tokens.css', () => {
  const bloco = /\.tema-item\s*\{([^}]*)\}/.exec(tokensCss)?.[1] ?? ''

  it('.tema-item pinta o próprio fundo e o texto, para valer também num contêiner', () => {
    expect(bloco).toMatch(/background:\s*var\(--fundo\)/)
    expect(bloco).toMatch(/color:\s*var\(--texto\)/)
  })

  it('.tema-item remapeia as variáveis para as de item', () => {
    expect(bloco).toMatch(/--fundo:\s*var\(--fundo-item\)/)
    expect(bloco).toMatch(/--texto:\s*var\(--texto-item\)/)
  })

  it('o html também usa o fundo do tema, para a rolagem elástica do iOS', () => {
    expect(/html\s*\{[^}]*background:\s*var\(--fundo\)/.test(tokensCss)).toBe(true)
  })
})
