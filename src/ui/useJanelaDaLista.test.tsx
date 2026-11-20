/**
 * Tarefa 6c e o fix round 1: a janela da lista longa (useJanelaDaLista), com o layout simulado (o jsdom não tem layout).
 * Cada linha mede 40 px de verdade, e o gancho estima 56: os espaços mudam de altura quando as linhas entram.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ALTURA_ESTIMADA, ANTES_DO_ALVO, LINHAS_DE_COMECO, PASSO_MAXIMO, useJanelaDaLista } from './useJanelaDaLista'

const ALTURA_DA_LINHA = 40

function Lista({ total, chave = 'a', alvo, restaurar }: { total: number; chave?: string; alvo?: number; restaurar?: boolean }) {
  const j = useJanelaDaLista(total, chave, { alvo, restaurar })
  return (
    <div data-testid="lista" onFocus={j.aoFocar}>
      {j.espacoDeCima > 0 && <div ref={j.refDoEspacoDeCima} data-testid="cima" style={{ height: j.espacoDeCima }} />}
      {Array.from({ length: j.fim - j.inicio }, (_, k) => (
        <a key={j.inicio + k} href={`#${j.inicio + k}`} data-linha-da-janela="" data-i={j.inicio + k}>
          {j.inicio + k}
        </a>
      ))}
      <div ref={j.refDoEspaco} data-testid="baixo" style={{ height: j.espaco }} />
    </div>
  )
}

const desenhadas = () => [...screen.getByTestId('lista').querySelectorAll('a')].map((a) => Number(a.dataset.i))
/** Quanto a janela rolou (px). */
let rolagem = 0
/** Os quadros pedidos (requestAnimationFrame), rodados um a um por `quadro()`. */
let quadros: FrameRequestCallback[] = []
const quadro = () =>
  act(() => {
    const agora = quadros
    quadros = []
    for (const f of agora) f(0)
  })
/** Roda os quadros até a janela parar de crescer (ou `max` quadros). */
const quadrosAteParar = (max = 50) => {
  for (let i = 0; i < max && quadros.length > 0; i++) quadro()
}
const rolarPara = (y: number) => {
  rolagem = y
  fireEvent.scroll(document)
}

/** O topo (na tela) de um elemento da lista: o espaço de cima, as linhas de 40 px e o espaço de baixo, um embaixo do outro. */
function topoNaTela(el: HTMLElement): { top: number; height: number } {
  const lista = screen.getByTestId('lista')
  let y = -rolagem
  for (const filho of lista.children) {
    const h = filho.tagName === 'A' ? ALTURA_DA_LINHA : parseFloat((filho as HTMLElement).style.height) || 0
    if (filho === el) return { top: y, height: h }
    y += h
  }
  return { top: 0, height: 0 }
}

beforeEach(() => {
  rolagem = 0
  quadros = []
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const { top, height } = this.parentElement?.dataset.testid === 'lista' ? topoNaTela(this) : { top: 0, height: 0 }
    return { top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top, toJSON: () => ({}) } as DOMRect
  })
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((f) => {
    quadros.push(f)
    return quadros.length
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
  window.scrollBy = vi.fn((_x: number | ScrollToOptions, y?: number) => {
    rolagem += y ?? 0
  }) as typeof window.scrollBy
})
afterEach(() => vi.restoreAllMocks())

describe('useJanelaDaLista', () => {
  it('sem alvo: as primeiras linhas e o espaço das outras, com a altura estimada; sem espaço em cima', () => {
    render(<Lista total={5000} />)
    quadrosAteParar()
    expect(desenhadas()).toHaveLength(LINHAS_DE_COMECO)
    expect(desenhadas()[0]).toBe(0)
    expect(screen.queryByTestId('cima')).toBeNull()
    expect(parseFloat(screen.getByTestId('baixo').style.height)).toBe((5000 - LINHAS_DE_COMECO) * ALTURA_ESTIMADA)
  })

  it('rolar até o espaço de baixo desenha as linhas que o cobrem; longe, nada', () => {
    render(<Lista total={5000} />)
    quadrosAteParar()
    rolarPara(0)
    quadrosAteParar()
    expect(desenhadas()).toHaveLength(LINHAS_DE_COMECO)
    rolarPara(15000)
    quadrosAteParar()
    const cobre = (15000 + window.innerHeight) / ALTURA_DA_LINHA
    expect(desenhadas().length).toBeGreaterThan(cobre)
    expect(desenhadas().length).toBeLessThan(5000)
  })

  it('fix round 1: um passo desenha no máximo PASSO_MAXIMO linhas por quadro (End ou a barra arrastada até o fim)', () => {
    render(<Lista total={5000} />)
    quadrosAteParar()
    rolarPara(5000 * ALTURA_ESTIMADA)
    quadro()
    expect(desenhadas()).toHaveLength(LINHAS_DE_COMECO + PASSO_MAXIMO)
    quadro()
    expect(desenhadas().length).toBeLessThanOrEqual(LINHAS_DE_COMECO + 2 * PASSO_MAXIMO)
    quadrosAteParar()
    expect(desenhadas()).toHaveLength(5000)
  })

  it('a lista toda desenhada não deixa espaço', () => {
    render(<Lista total={50} />)
    quadrosAteParar()
    expect(desenhadas()).toHaveLength(50)
    expect(parseFloat(screen.getByTestId('baixo').style.height)).toBe(0)
  })

  it('fix round 1: com alvo e sem posição a restaurar, a janela começa em volta dele, com o espaço de cima', () => {
    render(<Lista total={5000} alvo={2500} />)
    const linhas = desenhadas()
    expect(linhas).toContain(2500)
    expect(linhas[0]).toBe(2500 - ANTES_DO_ALVO)
    expect(linhas.length).toBeLessThanOrEqual(300)
    expect(parseFloat(screen.getByTestId('cima').style.height)).toBe((2500 - ANTES_DO_ALVO) * ALTURA_ESTIMADA)
  })

  it('com uma posição a restaurar, a janela vai do topo até o alvo (como antes), e só na primeira chegada', () => {
    const { rerender } = render(<Lista total={0} alvo={-1} restaurar />)
    rerender(<Lista total={5000} alvo={700} restaurar />)
    expect(desenhadas()[0]).toBe(0)
    expect(desenhadas()).toContain(700)
    // depois, outro alvo fora da janela (um link para outra obra) a traz em volta dele
    rerender(<Lista total={5000} alvo={4000} restaurar />)
    expect(desenhadas()[0]).toBe(4000 - ANTES_DO_ALVO)
  })

  it('fix round 1: rolar para cima desenha as linhas de cima, e as da tela não pulam (a rolagem é corrigida)', () => {
    render(<Lista total={5000} alvo={2500} />)
    // a tela rola até o alvo (a lista faz `scrollIntoView` antes do primeiro quadro): sem nada a desenhar em cima
    const primeira = 2500 - ANTES_DO_ALVO
    rolarPara(primeira * ALTURA_ESTIMADA + ANTES_DO_ALVO * ALTURA_DA_LINHA)
    quadrosAteParar()
    expect(desenhadas()[0]).toBe(primeira)
    // a rolagem leva a primeira linha desenhada ao alto da tela
    const espacoDeCima = primeira * ALTURA_ESTIMADA
    rolarPara(espacoDeCima)
    const linha = () => screen.getByTestId('lista').querySelector<HTMLElement>(`a[data-i="${primeira + 5}"]`)!
    const antes = topoNaTela(linha()).top
    quadro()
    expect(desenhadas()[0]).toBeLessThan(primeira)
    const novas = primeira - desenhadas()[0]!
    // as novas medem 40 px e o espaço estimava 56: a rolagem sobe 16 px por linha, e a linha da tela fica no lugar
    expect(window.scrollBy).toHaveBeenLastCalledWith(0, -(ALTURA_ESTIMADA - ALTURA_DA_LINHA) * novas)
    expect(topoNaTela(linha()).top).toBe(antes)
  })

  it('o foco numa linha da ponta de baixo desenha embaixo; na de cima, em cima; no meio, nada', () => {
    render(<Lista total={5000} alvo={2500} />)
    rolarPara((2500 - ANTES_DO_ALVO) * ALTURA_ESTIMADA + ANTES_DO_ALVO * ALTURA_DA_LINHA)
    quadrosAteParar()
    const [primeira] = desenhadas()
    const ultimaAntes = desenhadas().at(-1)!
    const a = (i: number) => screen.getByTestId('lista').querySelector<HTMLElement>(`a[data-i="${i}"]`)!
    act(() => a(2500).focus())
    expect(desenhadas()[0]).toBe(primeira)
    expect(desenhadas().at(-1)).toBe(ultimaAntes)
    act(() => a(ultimaAntes).focus())
    expect(desenhadas().at(-1)).toBeGreaterThan(ultimaAntes)
    act(() => a(primeira!).focus())
    expect(desenhadas()[0]).toBeLessThan(primeira!)
  })

  it('outra chave volta ao começo', () => {
    const { rerender } = render(<Lista total={5000} />)
    rolarPara(15000)
    quadrosAteParar()
    expect(desenhadas().length).toBeGreaterThan(LINHAS_DE_COMECO)
    rerender(<Lista total={5000} chave="b" />)
    expect(desenhadas()).toHaveLength(LINHAS_DE_COMECO)
  })
})
