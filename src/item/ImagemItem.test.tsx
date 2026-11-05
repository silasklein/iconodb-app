import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Imagem, Regiao } from '../banco/tipos'
import { urlImagem } from '../pacote/imagens'
import { MSG_IMAGEM_OFFLINE } from '../ui/Miniatura'
import { pedirFocoNoAmpliar } from '../imagem/estado'
import { transformDoGiro } from './imagemComum'
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

  describe('rotacao (a mesma regra do visualizador)', () => {
    const girada = (graus: number | null): Imagem => ({ ...img(1, 'traco'), rotacao: graus })

    it('com 90°, a imagem e as regiões giram juntas e a caixa troca largura e altura', async () => {
      render(<ImagemItem numero="CA00003" imagens={[girada(90)]} regioes={{ 'IMG-T-1': [REGIAO] }} elementoAceso="EL-1" />)
      const imagem = await imagemNaTela()
      const giro = imagem.closest<HTMLElement>('.imagem-item-giro')!
      expect(giro).not.toBeNull()
      expect(giro.style.transform).toContain(transformDoGiro(90))
      // a região fica dentro do mesmo elemento girado que a imagem
      expect(giro.contains(document.querySelector('.imagem-item-regioes'))).toBe(true)
      // 900 × 1200 girada 90° ocupa 1200 × 900: a caixa é mais larga que alta; a figura cabe nela em 75 % × 133,3333 %
      expect(giro.style.width).toBe('75%')
      expect(giro.style.height).toBe('133.3333%')
      const caixa = giro.parentElement!.closest<HTMLElement>('.imagem-item-girada')!
      expect(Number(caixa.style.getPropertyValue('--razao'))).toBeCloseTo(1200 / 900, 3)
    })

    it('rotação pequena (< 0,5°) ou ausente: nada muda no desenho', async () => {
      for (const graus of [null, 0, 0.3]) {
        const { unmount } = render(<ImagemItem numero="CA00001" imagens={[girada(graus)]} />)
        await imagemNaTela()
        expect(document.querySelector('.imagem-item-giro')).toBeNull()
        expect(document.querySelector('.imagem-item-girada')).toBeNull()
        unmount()
      }
    })

    it('o botão do original envolve a caixa girada, e o filtro continua na imagem', async () => {
      render(<ImagemItem numero="CA00001" imagens={[girada(90)]} />)
      const imagem = await imagemNaTela()
      const botao = screen.getByRole('button', { name: 'Mostrar o original' })
      expect(botao).toHaveClass('imagem-item-girada')
      expect(botao.contains(imagem)).toBe(true)
      expect(imagem).toHaveStyle({ filter: 'invert(1)' })
    })

    it('sem largura e altura no banco, usa o tamanho que a imagem tem ao carregar', async () => {
      render(<ImagemItem numero="CA00001" imagens={[{ ...girada(90), largura: null, altura: null }]} />)
      const imagem = await imagemNaTela()
      expect(document.querySelector('.imagem-item-giro')).toBeNull()
      Object.defineProperty(imagem, 'naturalWidth', { value: 600 })
      Object.defineProperty(imagem, 'naturalHeight', { value: 300 })
      fireEvent.load(imagem)
      await waitFor(() => expect(document.querySelector<HTMLElement>('.imagem-item-giro')).not.toBeNull())
      expect(document.querySelector<HTMLElement>('.imagem-item-giro')!.style.width).toBe('200%')
      expect(document.querySelector<HTMLElement>('.imagem-item-giro')!.style.height).toBe('50%')
    })
  })

  describe('volta do visualizador (inicial)', () => {
    it('abre na imagem e no original em que o visualizador foi aberto', async () => {
      render(<ImagemItem numero="CA00001" imagens={[img(1, 'tons'), img(2, 'traco')]} inicial={{ imagemId: 'IMG-T-2', original: true }} />)
      await waitFor(() => expect(document.querySelector('.imagem-item-figura img')).toHaveAttribute('src', 'blob:imagens/T/T-1/screen-2.webp'))
      expect(screen.getByText('2 / 2')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Mostrar o original' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('uma imagem que não é deste objeto é ignorada', async () => {
      render(<ImagemItem numero="CA00001" imagens={[img(1, 'traco'), img(2, 'tons')]} inicial={{ imagemId: 'OUTRA', original: true }} />)
      await imagemNaTela()
      expect(screen.getByText('1 / 2')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Mostrar o original' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('outro objeto: volta à primeira imagem, invertida (o inicial vale só para o objeto de origem)', async () => {
      const { rerender } = render(<ImagemItem numero="CA00001" imagens={[img(1, 'traco'), img(2, 'tons')]} inicial={{ imagemId: 'IMG-T-2', original: false }} />)
      await waitFor(() => expect(screen.getByText('2 / 2')).toBeInTheDocument())
      const outro = (n: number): Imagem => ({ ...img(n, 'traco'), id: `IMG-U-${n}`, tela: `imagens/U/U-1/screen-${n}.webp` })
      rerender(<ImagemItem numero="CA00002" imagens={[outro(1), outro(2)]} inicial={{ imagemId: 'IMG-T-2', original: false }} />)
      await waitFor(() => expect(screen.getByText('1 / 2')).toBeInTheDocument())
    })
  })

  it('sem imagem: "Sem imagem"', () => {
    render(<ImagemItem numero="CA00001" imagens={[]} />)
    expect(screen.getByText('Sem imagem')).toBeInTheDocument()
  })
})

describe('ImagemItem: a imagem à vista muda no meio do desenho (revisão 3, M14; I3)', () => {
  const geometria = (camada: HTMLElement) => {
    Object.defineProperty(camada, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 }) })
    Object.defineProperty(camada, 'offsetWidth', { value: 200 })
    Object.defineProperty(camada, 'offsetHeight', { value: 100 })
  }
  const tocar = (camada: HTMLElement, x: number, y: number) => {
    fireEvent.pointerDown(camada, { clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'mouse' })
    fireEvent.pointerUp(camada, { clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'mouse' })
  }

  it('os pontos da imagem 1 nunca vão para a imagem 2: o desenho recomeça vazio nela, e o concluir leva a imagem certa', async () => {
    const marcar = { aoConcluir: vi.fn(), aoCancelar: vi.fn() }
    const imagens = [img(1, 'traco'), img(2, 'traco')]
    const { rerender } = render(<ImagemItem numero="CA00001" imagens={imagens} marcar={marcar} />)
    await imagemNaTela()
    let camada = screen.getByTestId('desenho-camada')
    geometria(camada)
    tocar(camada, 20, 10)
    tocar(camada, 100, 10)
    tocar(camada, 100, 50)
    expect(document.querySelectorAll('.desenho-ponto')).toHaveLength(3)
    // Uma imagem pedida agora (acabou de chegar, ou foi restaurada) muda a imagem à vista, mesmo marcando.
    rerender(<ImagemItem numero="CA00001" imagens={imagens} marcar={marcar} mostrar={{ id: 'IMG-T-2', vez: 1 }} />)
    await waitFor(() => expect(document.querySelector('.imagem-item-figura img')).toHaveAttribute('src', 'blob:imagens/T/T-1/screen-2.webp'))
    expect(document.querySelectorAll('.desenho-ponto')).toHaveLength(0)
    const barra = screen.getByRole('toolbar', { name: 'Marcar região' })
    await userEvent.click(within(barra).getByRole('button', { name: 'Concluir a região' }))
    expect(marcar.aoConcluir).not.toHaveBeenCalled()
    expect(screen.getByText(/Ponha pelo menos 3 pontos/)).toBeInTheDocument()
    // Desenhada na imagem 2, vai com a imagem 2.
    camada = screen.getByTestId('desenho-camada')
    geometria(camada)
    tocar(camada, 40, 20)
    tocar(camada, 120, 20)
    tocar(camada, 120, 80)
    await userEvent.click(within(barra).getByRole('button', { name: 'Concluir a região' }))
    expect(marcar.aoConcluir).toHaveBeenCalledTimes(1)
    expect(marcar.aoConcluir).toHaveBeenCalledWith('IMG-T-2', [
      [0.2, 0.2],
      [0.6, 0.2],
      [0.6, 0.8],
    ])
  })
})
