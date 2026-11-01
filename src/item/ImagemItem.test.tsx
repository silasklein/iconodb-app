import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Imagem, Regiao } from '../banco/tipos'
import { urlImagem } from '../pacote/imagens'
import { MSG_IMAGEM_OFFLINE } from '../ui/Miniatura'
import { pedirFocoNoAmpliar } from '../imagem/estado'
import { ImagemItem } from './ImagemItem'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

const img = (n: number, display_mode: Imagem['display_mode']): Imagem => ({
  id: `IMG-T-${n}`,
  itemId: 'T-1',
  ordinal: n,
  display_mode,
  tela: `imagens/T/T-1/screen-${n}.webp`,
  miniatura: `imagens/T/T-1/thumb-${n}.webp`,
  largura: 900,
  altura: 1200,
  credito: 'Desenho: Teste',
  rotacao: 0,
})
const REGIAO: Regiao = {
  id: 1,
  elementoId: 'EL-1',
  elemento: 'figura denteada',
  elementoDe: 'Zackenfigur',
  selector: '<polygon points="0.30,0.25 0.70,0.25 0.62,0.75"/>',
  pontos: [
    [0.3, 0.25],
    [0.7, 0.25],
    [0.62, 0.75],
  ],
}

const imagemNaTela = async () => {
  await waitFor(() => expect(document.querySelector('.imagem-item-figura img')).not.toBeNull())
  return document.querySelector<HTMLImageElement>('.imagem-item-figura img')!
}

describe('ImagemItem', () => {
  afterEach(() => vi.mocked(urlImagem).mockImplementation(async (c: string) => `blob:${c}`))

  it('o desenho de traço aparece invertido; um toque mostra o original e outro volta', async () => {
    render(<ImagemItem numero="CA00001" imagens={[img(1, 'traco')]} />)
    const imagem = await imagemNaTela()
    expect(imagem).toHaveAttribute('src', 'blob:imagens/T/T-1/screen-1.webp')
    expect(imagem).toHaveStyle({ filter: 'invert(1)' })
    const botao = screen.getByRole('button', { name: 'Mostrar o original' })
    expect(botao).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(botao)
    expect(botao).toHaveAttribute('aria-pressed', 'true')
    expect(imagem.style.filter).toBe('')
    await userEvent.click(botao)
    expect(botao).toHaveAttribute('aria-pressed', 'false')
    expect(imagem).toHaveStyle({ filter: 'invert(1)' })
  })

  it('o teclado também alterna (é um botão)', async () => {
    render(<ImagemItem numero="CA00001" imagens={[img(1, 'traco')]} />)
    await imagemNaTela()
    screen.getByRole('button', { name: 'Mostrar o original' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Mostrar o original' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a imagem tonal aparece como está e não alterna; sem display_mode também', async () => {
    const { unmount } = render(<ImagemItem numero="CA00001" imagens={[img(1, 'tons')]} />)
    expect((await imagemNaTela()).style.filter).toBe('')
    expect(screen.queryByRole('button', { name: 'Mostrar o original' })).toBeNull()
    unmount()
    render(<ImagemItem numero="CA00001" imagens={[img(1, null)]} />)
    expect((await imagemNaTela()).style.filter).toBe('')
  })

  it('com mais de uma imagem: "1 / 2" e passar para a seguinte', async () => {
    render(<ImagemItem numero="CA00001" imagens={[img(1, 'traco'), img(2, 'tons')]} />)
    await imagemNaTela()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Imagem seguinte' }))
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('.imagem-item-figura img')).toHaveAttribute('src', 'blob:imagens/T/T-1/screen-2.webp'))
    expect(document.querySelector<HTMLImageElement>('.imagem-item-figura img')!.style.filter).toBe('')
  })

  it('"Ampliar a imagem" leva ao visualizador da imagem mostrada', async () => {
    render(<ImagemItem numero="CA00001" imagens={[img(1, 'traco')]} />)
    expect(screen.getByRole('link', { name: 'Ampliar a imagem' })).toHaveAttribute('href', '#/imagem/IMG-T-1')
  })

  it('com aoAmpliar, o clique comum vai pelo roteador (com o original ligado); com modificador segue o link', async () => {
    const aoAmpliar = vi.fn()
    render(<ImagemItem numero="CA00001" imagens={[img(1, 'traco')]} aoAmpliar={aoAmpliar} />)
    await imagemNaTela()
    const link = screen.getByRole('link', { name: 'Ampliar a imagem' })
    await userEvent.click(link)
    expect(aoAmpliar).toHaveBeenLastCalledWith('IMG-T-1', false)
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar o original' }))
    await userEvent.click(link)
    expect(aoAmpliar).toHaveBeenLastCalledWith('IMG-T-1', true)
    aoAmpliar.mockClear()
    fireEvent.click(link, { ctrlKey: true })
    expect(aoAmpliar).not.toHaveBeenCalled()
  })

  it('de volta do visualizador, o foco vai ao "Ampliar a imagem"; sem pedido, não rouba o foco', async () => {
    const { unmount } = render(<ImagemItem numero="CA00001" imagens={[img(1, 'traco')]} />)
    expect(screen.getByRole('link', { name: 'Ampliar a imagem' })).not.toHaveFocus()
    unmount()
    pedirFocoNoAmpliar()
    render(<ImagemItem numero="CA00001" imagens={[img(1, 'traco')]} />)
    expect(screen.getByRole('link', { name: 'Ampliar a imagem' })).toHaveFocus()
  })

  it('imagem que não carrega (onError): o marcador no lugar da imagem quebrada', async () => {
    render(<ImagemItem numero="CA00001" imagens={[img(1, 'tons')]} />)
    fireEvent.error(await imagemNaTela())
    expect(await screen.findByText(MSG_IMAGEM_OFFLINE)).toBeInTheDocument()
    expect(document.querySelector('.imagem-item-figura img')).toBeNull()
  })

  it('sem cópia no aparelho e sem rede: o marcador, não uma imagem quebrada', async () => {
    vi.mocked(urlImagem).mockResolvedValue(null)
    render(<ImagemItem numero="CA00001" imagens={[img(1, 'traco')]} />)
    expect(await screen.findByText(MSG_IMAGEM_OFFLINE)).toBeInTheDocument()
    expect(document.querySelector('.imagem-item-figura img')).toBeNull()
  })

  it('acende a região do elemento da hipótese aberta (polígono 0–1 por cima da imagem)', async () => {
    const { rerender } = render(<ImagemItem numero="CA00003" imagens={[img(1, 'traco')]} regioes={{ 'IMG-T-1': [REGIAO] }} elementoAceso={null} />)
    await imagemNaTela()
    expect(document.querySelector('.imagem-item-regioes polygon')).toBeNull()
    rerender(<ImagemItem numero="CA00003" imagens={[img(1, 'traco')]} regioes={{ 'IMG-T-1': [REGIAO] }} elementoAceso="EL-1" />)
    const svg = document.querySelector('.imagem-item-regioes')!
    expect(svg).toHaveAttribute('viewBox', '0 0 1 1')
    expect(svg).toHaveAttribute('preserveAspectRatio', 'none')
    expect(svg.querySelector('polygon')).toHaveAttribute('points', '0.3,0.25 0.7,0.25 0.62,0.75')
    expect(screen.getByText('Região acesa: figura denteada')).toBeInTheDocument()
  })

  it('com a região só em outra imagem do objeto, passa para ela', async () => {
    render(<ImagemItem numero="CA00001" imagens={[img(1, 'traco'), img(2, 'tons')]} regioes={{ 'IMG-T-2': [REGIAO] }} elementoAceso="EL-1" />)
    await waitFor(() => expect(screen.getByText('2 / 2')).toBeInTheDocument())
    expect(document.querySelector('.imagem-item-regioes polygon')).not.toBeNull()
  })

  it('sem imagem: "Sem imagem"', () => {
    render(<ImagemItem numero="CA00001" imagens={[]} />)
    expect(screen.getByText('Sem imagem')).toBeInTheDocument()
  })
})
