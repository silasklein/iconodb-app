import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { imagem as buscarImagem, regioes as buscarRegioes } from '../banco/consultas'
import type { Imagem as ImagemDoBanco, Regiao } from '../banco/tipos'
import { lerImagemAberta } from '../imagem/estado'
import { transformDoGiro } from '../item/imagemComum'
import { ImagemItem } from '../item/ImagemItem'
import { urlImagem } from '../pacote/imagens'
import { teclasNaoDeclaradas } from '../test/atalhosDeclarados'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { MSG_IMAGEM_OFFLINE } from '../ui/Miniatura'
import { Imagem } from './Imagem'

vi.mock('../banco/consultas', () => ({ imagem: vi.fn(), regioes: vi.fn() }))
vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

type ImagemComNumero = ImagemDoBanco & { numero: string; total: number }
const IMG: ImagemComNumero = {
  id: 'IMG-T-1',
  itemId: 'T-1',
  ordinal: 1,
  display_mode: 'traco',
  tela: 'imagens/T/T-1/screen-1.webp',
  miniatura: 'imagens/T/T-1/thumb-1.webp',
  largura: 900,
  altura: 1200,
  credito: 'Desenho: Teste',
  rotacao: 0,
  numero: 'CA00001',
  total: 2,
}
const REGIAO = (id: number, elemento: string): Regiao => ({
  id,
  elementoId: `EL-${id}`,
  elemento,
  elementoDe: `${elemento} (de)`,
  selector: '<polygon/>',
  pontos: [
    [0.3, 0.25],
    [0.7, 0.25],
    [0.62, 0.75],
  ],
})

// O palco mede 800 × 600 (a figura 900 × 1200 cabe em 450 × 600).
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const palco = this.classList.contains('vis-palco')
    return { x: 0, y: 0, left: 0, top: 0, right: palco ? 800 : 0, bottom: palco ? 600 : 0, width: palco ? 800 : 0, height: palco ? 600 : 0, toJSON() {} }
  })
  imagemDoItem = IMG
  vi.mocked(buscarImagem).mockResolvedValue(IMG)
  vi.mocked(buscarRegioes).mockResolvedValue([])
  vi.mocked(urlImagem).mockImplementation(async (c: string) => `blob:${c}`)
})
afterEach(() => {
  vi.restoreAllMocks()
  instalarMatchMedia(375)
  document.body.querySelectorAll('[data-teste]').forEach((e) => e.remove())
})

/** O item de mentira: a imagem do item de verdade, que leva ao visualizador (o mesmo caminho do Item, em ponto pequeno). */
let imagemDoItem: ImagemComNumero = IMG
function ItemFalso() {
  const navegar = useNavigate()
  const { state } = useLocation()
  return (
    <main>
      <h1>Item CA00001</h1>
      <output data-testid="estado">{JSON.stringify(state ?? null)}</output>
      <ImagemItem
        numero="CA00001"
        imagens={[imagemDoItem]}
        inicial={lerImagemAberta(state)}
        aoAmpliar={(id, original) => navegar(`/imagem/${id}`, { state: { ampliada: true, original } })}
      />
    </main>
  )
}
const estadoDoItem = () => JSON.parse(screen.getByTestId('estado').textContent!)

function abrir(entradas: Parameters<typeof MemoryRouter>[0]['initialEntries'] = [{ pathname: '/imagem/IMG-T-1' }], indice?: number) {
  return render(
    <MemoryRouter initialEntries={entradas} initialIndex={indice}>
      <Routes>
        <Route path="/imagem/:id" element={<Imagem />} />
        <Route path="/item/:numero" element={<ItemFalso />} />
        <Route path="/colecoes" element={<h1>Coleções</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}
const vindoDoItem = () => abrir(['/item/CA00001', { pathname: '/imagem/IMG-T-1', state: { ampliada: true, original: false } }], 1)

const palco = () => document.querySelector<HTMLElement>('.vis-palco')!
const figura = () => document.querySelector<HTMLElement>('.vis-figura')!
const imagemNaTela = async () => {
  await waitFor(() => expect(document.querySelector('.vis-figura img')).not.toBeNull())
  return document.querySelector<HTMLImageElement>('.vis-figura img')!
}
const escala = () => screen.getByText(/^\d+ %$/).textContent
const transformada = () => figura().style.transform
const ponteiro = (tipo: 'pointerDown' | 'pointerMove' | 'pointerUp', id: number, x: number, y: number, pointerType = 'touch') =>
  fireEvent[tipo](palco(), { pointerId: id, clientX: x, clientY: y, pointerType, button: 0, isPrimary: id === 1 })

describe('Imagem: o visualizador', () => {
  it('mostra o desenho de traço invertido sobre o preto, com o número do objeto e a posição', async () => {
    abrir()
    const img = await imagemNaTela()
    expect(img).toHaveAttribute('src', 'blob:imagens/T/T-1/screen-1.webp')
    expect(img).toHaveStyle({ filter: 'invert(1)' })
    expect(img).toHaveAttribute('alt', 'Imagem 1 de CA00001, invertida')
    expect(screen.getByRole('heading', { level: 1, name: /CA00001/ })).toBeInTheDocument()
    expect(screen.getByText('CA00001 · 1/2')).toBeInTheDocument()
    expect(screen.getByText('Desenho: Teste')).toBeInTheDocument()
    expect(escala()).toBe('100 %')
  })

  it('os aria-keyshortcuts do visualizador são teclas declaradas no catálogo de atalhos', async () => {
    abrir()
    await imagemNaTela()
    expect(document.querySelectorAll('[aria-keyshortcuts]').length).toBeGreaterThan(3)
    expect(teclasNaoDeclaradas(document.body)).toEqual([])
  })

  it('I alterna o original e o invertido, e o botão mostra o estado', async () => {
    abrir()
    const img = await imagemNaTela()
    const botao = screen.getByRole('button', { name: 'Mostrar o original sem inversão' })
    expect(botao).toHaveAttribute('aria-pressed', 'false')
    expect(botao).toHaveAttribute('aria-keyshortcuts', 'I')
    await userEvent.keyboard('i')
    expect(img.style.filter).toBe('')
    expect(botao).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('I')
    expect(img).toHaveStyle({ filter: 'invert(1)' })
    await userEvent.click(botao)
    expect(img.style.filter).toBe('')
  })

  it('vindo do item com o original ligado, abre no original', async () => {
    abrir([{ pathname: '/imagem/IMG-T-1', state: { ampliada: true, original: true } }])
    const img = await imagemNaTela()
    expect(img.style.filter).toBe('')
    expect(screen.getByRole('button', { name: 'Mostrar o original sem inversão' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a imagem tonal aparece como está e não tem alternância', async () => {
    vi.mocked(buscarImagem).mockResolvedValue({ ...IMG, display_mode: 'tons' })
    abrir()
    const img = await imagemNaTela()
    expect(img.style.filter).toBe('')
    expect(screen.queryByRole('button', { name: 'Mostrar o original sem inversão' })).toBeNull()
    await userEvent.keyboard('i')
    expect(img.style.filter).toBe('')
  })

  describe('ampliação', () => {
    it('a roda amplia em direção ao cursor e vai de 1× a 8×', async () => {
      abrir()
      await imagemNaTela()
      fireEvent.wheel(palco(), { deltaY: -462, clientX: 400, clientY: 300 })
      expect(escala()).toBe('200 %')
      for (let i = 0; i < 6; i++) fireEvent.wheel(palco(), { deltaY: -500, clientX: 400, clientY: 300 })
      expect(escala()).toBe('800 %')
      for (let i = 0; i < 20; i++) fireEvent.wheel(palco(), { deltaY: 500, clientX: 400, clientY: 300 })
      expect(escala()).toBe('100 %')
    })

    it('a roda não rola a página (o evento é cancelado)', async () => {
      abrir()
      await imagemNaTela()
      const ev = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
      palco().dispatchEvent(ev)
      expect(ev.defaultPrevented).toBe(true)
    })

    it('a pinça de dois dedos amplia e aproximar os dedos reduz', async () => {
      abrir()
      await imagemNaTela()
      ponteiro('pointerDown', 1, 350, 300)
      ponteiro('pointerDown', 2, 450, 300)
      ponteiro('pointerMove', 1, 300, 300)
      ponteiro('pointerMove', 2, 500, 300)
      expect(escala()).toBe('200 %')
      ponteiro('pointerMove', 1, 395, 300)
      ponteiro('pointerMove', 2, 405, 300)
      expect(escala()).toBe('100 %')
      ponteiro('pointerUp', 1, 395, 300)
      ponteiro('pointerUp', 2, 405, 300)
    })

    it('toque duplo (ou clique duplo) alterna entre 1× e 2×', async () => {
      abrir()
      await imagemNaTela()
      for (let i = 0; i < 2; i++) {
        ponteiro('pointerDown', 1, 420, 320, 'mouse')
        ponteiro('pointerUp', 1, 420, 320, 'mouse')
      }
      expect(escala()).toBe('200 %')
      for (let i = 0; i < 2; i++) {
        ponteiro('pointerDown', 1, 420, 320, 'mouse')
        ponteiro('pointerUp', 1, 420, 320, 'mouse')
      }
      expect(escala()).toBe('100 %')
    })

    it('um toque só não amplia', async () => {
      abrir()
      await imagemNaTela()
      ponteiro('pointerDown', 1, 420, 320)
      ponteiro('pointerUp', 1, 420, 320)
      expect(escala()).toBe('100 %')
    })

    it('arrastar anda quando ampliada, e a figura não sai do palco; a 1× não anda', async () => {
      abrir()
      await imagemNaTela()
      ponteiro('pointerDown', 1, 400, 300, 'mouse')
      ponteiro('pointerMove', 1, 400, 380, 'mouse')
      ponteiro('pointerUp', 1, 400, 380, 'mouse')
      expect(transformada()).toMatch(/^translate\(0px, 0px\) scale\(1\)/)
      await userEvent.keyboard('+') // 150 %: a figura passa a ter 675 × 900 no palco de 800 × 600
      expect(escala()).toBe('150 %')
      ponteiro('pointerDown', 1, 400, 300, 'mouse')
      ponteiro('pointerMove', 1, 400, 350, 'mouse')
      expect(transformada()).toMatch(/^translate\(0px, 50px\) scale\(1\.5\)/)
      ponteiro('pointerMove', 1, 400, 900, 'mouse')
      expect(transformada()).toMatch(/^translate\(0px, 150px\) scale\(1\.5\)/) // a borda para na borda
      ponteiro('pointerUp', 1, 400, 900, 'mouse')
    })

    it('+, - e 0 (e os botões) mudam a ampliação', async () => {
      abrir()
      await imagemNaTela()
      await userEvent.keyboard('+')
      await userEvent.keyboard('+')
      expect(escala()).toBe('225 %')
      await userEvent.keyboard('-')
      expect(escala()).toBe('150 %')
      await userEvent.keyboard('0')
      expect(escala()).toBe('100 %')
      await userEvent.click(screen.getByRole('button', { name: 'Ampliar' }))
      expect(escala()).toBe('150 %')
      await userEvent.click(screen.getByRole('button', { name: 'Reduzir' }))
      expect(escala()).toBe('100 %')
      await userEvent.keyboard('{Shift>}={/Shift}') // "+" no teclado americano
      expect(escala()).toBe('150 %')
      await userEvent.click(screen.getByRole('button', { name: 'Ajustar à tela' }))
      expect(escala()).toBe('100 %')
    })

    it('os botões dizem o atalho', async () => {
      abrir()
      await imagemNaTela()
      expect(screen.getByRole('button', { name: 'Ampliar' })).toHaveAttribute('aria-keyshortcuts', 'Z +')
      expect(screen.getByRole('button', { name: 'Reduzir' })).toHaveAttribute('aria-keyshortcuts', '-')
      expect(screen.getByRole('button', { name: 'Ajustar à tela' })).toHaveAttribute('aria-keyshortcuts', '0')
    })

    it('as teclas são ignoradas num campo de texto e com um diálogo modal aberto', async () => {
      abrir()
      await imagemNaTela()
      const campo = document.createElement('input')
      campo.dataset.teste = '1'
      document.body.append(campo)
      campo.focus()
      await userEvent.keyboard('+i')
      expect(escala()).toBe('100 %')
      expect(document.querySelector<HTMLImageElement>('.vis-figura img')).toHaveStyle({ filter: 'invert(1)' })
      campo.blur()
      const modal = document.createElement('div')
      modal.dataset.teste = '1'
      modal.setAttribute('aria-modal', 'true')
      document.body.append(modal)
      await userEvent.keyboard('+')
      expect(escala()).toBe('100 %')
    })
  })

  describe('regiões', () => {
    beforeEach(() => vi.mocked(buscarRegioes).mockResolvedValue([REGIAO(1, 'figura denteada'), REGIAO(2, 'asa')]))

    it('aparecem por cima da imagem, no mesmo espaço dela, com o nome do elemento', async () => {
      abrir()
      await imagemNaTela()
      await waitFor(() => expect(figura().querySelectorAll('svg polygon')).toHaveLength(2))
      const svg = figura().querySelector('svg')!
      expect(svg).toHaveAttribute('viewBox', '0 0 1 1')
      expect(svg).toHaveAttribute('preserveAspectRatio', 'none')
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect(svg.querySelector('polygon')).toHaveAttribute('points', '0.3,0.25 0.7,0.25 0.62,0.75')
      expect(within(figura()).getByText('figura denteada')).toBeInTheDocument()
      expect(within(figura()).getByText('asa')).toBeInTheDocument()
    })

    it('há uma lista das regiões para leitores de tela', async () => {
      abrir()
      const lista = await screen.findByRole('list', { name: 'Regiões da imagem' })
      expect(within(lista).getAllByRole('listitem').map((l) => l.textContent)).toEqual(['figura denteada', 'asa'])
    })

    it('o botão e a tecla R mostram e escondem', async () => {
      abrir()
      const botao = await screen.findByRole('button', { name: 'Mostrar as regiões' })
      expect(botao).toHaveAttribute('aria-pressed', 'true')
      expect(botao).toHaveAttribute('aria-keyshortcuts', 'R')
      await userEvent.click(botao)
      expect(botao).toHaveAttribute('aria-pressed', 'false')
      expect(figura().querySelector('svg')).toBeNull()
      await userEvent.keyboard('r')
      expect(botao).toHaveAttribute('aria-pressed', 'true')
      expect(figura().querySelectorAll('svg polygon')).toHaveLength(2)
    })

    it('acompanham a ampliação e o giro da imagem (estão dentro da mesma figura)', async () => {
      vi.mocked(buscarImagem).mockResolvedValue({ ...IMG, rotacao: 90 })
      abrir()
      await imagemNaTela()
      await waitFor(() => expect(figura().querySelector('svg')).not.toBeNull())
      expect(figura().contains(figura().querySelector('img'))).toBe(true)
      expect(transformada()).toMatch(/scale\(1\) rotate\(90deg\)$/)
      expect(transformada().endsWith(transformDoGiro(90))).toBe(true)
      await userEvent.keyboard('+')
      expect(transformada()).toMatch(/scale\(1\.5\) rotate\(90deg\)$/)
      // girada 90°, a figura de 900 × 1200 ocupa 1200 × 900 e cabe em 800 × 600: fica de 600 × 800
      expect(figura().style.width).toBe('600px')
      expect(figura().style.height).toBe('800px')
    })

    it('sem regiões, não há botão nem lista', async () => {
      vi.mocked(buscarRegioes).mockResolvedValue([])
      abrir()
      await imagemNaTela()
      expect(screen.queryByRole('button', { name: 'Mostrar as regiões' })).toBeNull()
      expect(screen.queryByRole('list', { name: 'Regiões da imagem' })).toBeNull()
    })

    it('no computador, o painel "Elementos e regiões" liga e desliga cada região', async () => {
      instalarMatchMedia(1280)
      abrir()
      const painel = await screen.findByRole('complementary', { name: 'Elementos e regiões' })
      await waitFor(() => expect(figura().querySelectorAll('svg polygon')).toHaveLength(2))
      const asa = within(painel).getByRole('button', { name: 'Ocultar a região asa' })
      expect(asa).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(asa)
      expect(figura().querySelectorAll('svg polygon')).toHaveLength(1)
      expect(within(painel).getByRole('button', { name: 'Mostrar a região asa' })).toHaveAttribute('aria-pressed', 'false')
      expect(within(figura()).queryByText('asa')).toBeNull()
    })
  })

  describe('sem cópia no aparelho', () => {
    it('sem rede e sem a imagem: o marcador, não uma imagem quebrada', async () => {
      vi.mocked(urlImagem).mockResolvedValue(null)
      abrir()
      expect(await screen.findByText(MSG_IMAGEM_OFFLINE)).toBeInTheDocument()
      expect(document.querySelector('.vis-figura img')).toBeNull()
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Fechar o visualizador' })).toBeInTheDocument()
    })

    it('a imagem que não carrega também mostra o marcador', async () => {
      abrir()
      const img = await imagemNaTela()
      fireEvent.error(img)
      expect(await screen.findByText(MSG_IMAGEM_OFFLINE)).toBeInTheDocument()
    })
  })

  describe('fechar', () => {
    it('Esc volta ao item de onde se veio, e o foco volta ao "Ampliar a imagem"', async () => {
      vindoDoItem()
      await imagemNaTela()
      await userEvent.keyboard('{Escape}')
      expect(await screen.findByRole('heading', { name: 'Item CA00001' })).toBeInTheDocument()
      await waitFor(() => expect(screen.getByRole('link', { name: 'Ampliar a imagem' })).toHaveFocus())
    })

    it('o botão Fechar faz o mesmo', async () => {
      vindoDoItem()
      await imagemNaTela()
      const fechar = screen.getByRole('button', { name: 'Fechar o visualizador' })
      expect(fechar).toHaveAttribute('aria-keyshortcuts', 'Escape')
      await userEvent.click(fechar)
      expect(await screen.findByRole('heading', { name: 'Item CA00001' })).toBeInTheDocument()
      await waitFor(() => expect(screen.getByRole('link', { name: 'Ampliar a imagem' })).toHaveFocus())
    })

    it('aberto direto (sem passar pelo item), Esc leva ao item do objeto', async () => {
      abrir()
      await imagemNaTela()
      await userEvent.keyboard('{Escape}')
      expect(await screen.findByRole('heading', { name: 'Item CA00001' })).toBeInTheDocument()
    })

    it('Esc é ignorado com um diálogo modal aberto', async () => {
      abrir()
      await imagemNaTela()
      const modal = document.createElement('div')
      modal.dataset.teste = '1'
      modal.setAttribute('aria-modal', 'true')
      document.body.append(modal)
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('heading', { name: 'Item CA00001' })).toBeNull()
    })

    it('clicar em "Ampliar a imagem" no item leva ao visualizador com o original que estava ligado', async () => {
      abrir([{ pathname: '/item/CA00001' }])
      await waitFor(() => expect(document.querySelector('.imagem-item-figura img')).not.toBeNull())
      await userEvent.click(screen.getByRole('button', { name: 'Mostrar o original' }))
      await userEvent.click(screen.getByRole('link', { name: 'Ampliar a imagem' }))
      await imagemNaTela()
      expect(screen.getByRole('button', { name: 'Mostrar o original sem inversão' })).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('rotacao igual no item e no visualizador', () => {
    it('o item e o visualizador giram a imagem e as regiões com o mesmo transform', async () => {
      imagemDoItem = { ...IMG, rotacao: 90 }
      vi.mocked(buscarImagem).mockResolvedValue(imagemDoItem)
      vi.mocked(buscarRegioes).mockResolvedValue([REGIAO(1, 'asa')])
      abrir([{ pathname: '/item/CA00001' }])
      await waitFor(() => expect(document.querySelector('.imagem-item-giro img')).not.toBeNull())
      const doItem = document.querySelector<HTMLElement>('.imagem-item-giro')!.style.transform
      await userEvent.click(screen.getByRole('link', { name: 'Ampliar a imagem' }))
      await imagemNaTela()
      const giroDoItem = /rotate\([^)]*\)/.exec(doItem)![0]
      const giroDoVisualizador = /rotate\([^)]*\)/.exec(transformada())![0]
      expect(giroDoItem).toBe(transformDoGiro(90))
      expect(giroDoVisualizador).toBe(giroDoItem)
      await waitFor(() => expect(figura().querySelector('svg')).not.toBeNull())
    })
  })

  describe('ponteiros e gestos', () => {
    it('pointercancel desfaz a pinça e não conta como toque', async () => {
      abrir()
      await imagemNaTela()
      ponteiro('pointerDown', 1, 350, 300)
      ponteiro('pointerDown', 2, 450, 300)
      ponteiro('pointerMove', 1, 300, 300)
      ponteiro('pointerMove', 2, 500, 300)
      expect(escala()).toBe('200 %')
      fireEvent.pointerCancel(palco(), { pointerId: 1, clientX: 300, clientY: 300, pointerType: 'touch' })
      fireEvent.pointerCancel(palco(), { pointerId: 2, clientX: 500, clientY: 300, pointerType: 'touch' })
      // com os dois cancelados, mexer num ponteiro que não está mais lá não faz nada
      ponteiro('pointerMove', 1, 100, 300)
      expect(escala()).toBe('200 %')
      // dois "toques" cancelados em seguida não são um toque duplo
      for (let i = 0; i < 2; i++) {
        ponteiro('pointerDown', 1, 420, 320)
        fireEvent.pointerCancel(palco(), { pointerId: 1, clientX: 420, clientY: 320, pointerType: 'touch' })
      }
      expect(escala()).toBe('200 %')
      // e um dedo só volta a arrastar normalmente
      ponteiro('pointerDown', 1, 400, 300)
      ponteiro('pointerMove', 1, 400, 340)
      expect(transformada()).toMatch(/^translate\([-\d.]+px, 40px\) scale\(2\)/)
    })

    it('um terceiro dedo não pinça, mas as posições continuam sendo acompanhadas', async () => {
      abrir()
      await imagemNaTela()
      ponteiro('pointerDown', 1, 350, 300)
      ponteiro('pointerDown', 2, 450, 300)
      ponteiro('pointerDown', 3, 400, 100)
      ponteiro('pointerMove', 1, 300, 300) // com três dedos não pinça…
      ponteiro('pointerMove', 3, 420, 120)
      expect(escala()).toBe('100 %')
      ponteiro('pointerUp', 3, 420, 120)
      // …mas o dedo 1 já está em 300: ao mexer o 2, a distância é de (300, 500) = 200 contra (300, 450) = 150
      ponteiro('pointerMove', 2, 500, 300)
      expect(escala()).toBe('133 %')
    })

    it('perder a captura do ponteiro o tira da conta', async () => {
      abrir()
      await imagemNaTela()
      await userEvent.keyboard('+') // 150 %
      ponteiro('pointerDown', 1, 400, 300)
      ponteiro('pointerDown', 2, 500, 300)
      fireEvent.lostPointerCapture(palco(), { pointerId: 2 })
      ponteiro('pointerMove', 1, 400, 350)
      expect(escala()).toBe('150 %')
      expect(transformada()).toMatch(/^translate\(0px, 50px\) scale\(1\.5\)/)
    })

    it('a janela perder o foco (blur) limpa os ponteiros', async () => {
      abrir()
      await imagemNaTela()
      await userEvent.keyboard('+')
      ponteiro('pointerDown', 1, 400, 300)
      ponteiro('pointerDown', 2, 500, 300)
      fireEvent.blur(window)
      ponteiro('pointerMove', 1, 400, 330)
      expect(escala()).toBe('150 %') // sem pinça: nenhum dos dois estava registrado
      expect(transformada()).toMatch(/^translate\(0px, 0px\) scale\(1\.5\)/)
    })

    it('a roda com ctrl (pinça do trackpad) pesa mais que a roda comum', async () => {
      abrir()
      await imagemNaTela()
      fireEvent.wheel(palco(), { deltaY: -10, clientX: 400, clientY: 300 })
      expect(escala()).toBe('102 %')
      await userEvent.keyboard('0')
      fireEvent.wheel(palco(), { deltaY: -10, ctrlKey: true, clientX: 400, clientY: 300 })
      expect(escala()).toBe('111 %')
    })

    const gesto = (tipo: string, extra: Record<string, number> = {}) => {
      const e = Object.assign(new Event(tipo, { bubbles: true, cancelable: true }), extra)
      act(() => {
        palco().dispatchEvent(e)
      })
      return e
    }

    it('a pinça do trackpad do Safari (gesturestart/gesturechange) amplia, cancelando o gesto da página', async () => {
      abrir()
      await imagemNaTela()
      expect(gesto('gesturestart').defaultPrevented).toBe(true)
      const mudou = gesto('gesturechange', { scale: 2, clientX: 400, clientY: 300 })
      expect(mudou.defaultPrevented).toBe(true)
      expect(escala()).toBe('200 %')
      gesto('gesturechange', { scale: 3, clientX: 400, clientY: 300 })
      expect(escala()).toBe('300 %') // sempre a partir da escala do começo do gesto
      gesto('gesturestart') // um novo gesto parte dos 300 %
      gesto('gesturechange', { scale: 0.5, clientX: 400, clientY: 300 })
      expect(escala()).toBe('150 %')
    })

    it('com dois dedos na tela, o gesto do Safari é ignorado (a pinça já vem dos ponteiros)', async () => {
      abrir()
      await imagemNaTela()
      ponteiro('pointerDown', 1, 350, 300)
      ponteiro('pointerDown', 2, 450, 300)
      gesto('gesturestart')
      gesto('gesturechange', { scale: 3, clientX: 400, clientY: 300 })
      expect(escala()).toBe('100 %')
    })
  })

  describe('a janela muda de tamanho', () => {
    it('ampliada e encostada na borda, ao girar o aparelho a vista é refeita para a figura não sair do palco', async () => {
      abrir()
      await imagemNaTela()
      for (let i = 0; i < 3; i++) await userEvent.keyboard('+') // 337,5 %
      ponteiro('pointerDown', 1, 400, 300, 'mouse')
      ponteiro('pointerMove', 1, 400, 3000, 'mouse')
      ponteiro('pointerUp', 1, 400, 3000, 'mouse')
      // palco 800 × 600, figura 450 × 600 a 3,375×: altura 2025 → pode andar até (2025 − 600) / 2
      expect(transformada()).toMatch(/^translate\(0px, 712\.5px\) scale\(3\.375\)/)
      // o palco passa a 400 × 300 (a figura vira 225 × 300; altura 1012,5 → limite 356,25)
      vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
        const palco = this.classList.contains('vis-palco')
        return { x: 0, y: 0, left: 0, top: 0, right: palco ? 400 : 0, bottom: palco ? 300 : 0, width: palco ? 400 : 0, height: palco ? 300 : 0, toJSON() {} }
      })
      fireEvent(window, new Event('resize'))
      await waitFor(() => expect(transformada()).toMatch(/^translate\(0px, 356\.25px\) scale\(3\.375\)/))
    })
  })

  describe('fechar sem a imagem carregada', () => {
    it('carregando: há o botão Fechar e Esc fecha', async () => {
      vi.mocked(buscarImagem).mockReturnValue(new Promise(() => {}))
      abrir([{ pathname: '/imagem/IMG-T-1' }])
      expect(screen.getByRole('button', { name: 'Fechar o visualizador' })).toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
      expect(await screen.findByRole('heading', { name: 'Coleções' })).toBeInTheDocument()
    })

    it('carregando, vindo do item: Fechar volta no histórico', async () => {
      vi.mocked(buscarImagem).mockReturnValue(new Promise(() => {}))
      vindoDoItem()
      await userEvent.click(screen.getByRole('button', { name: 'Fechar o visualizador' }))
      expect(await screen.findByRole('heading', { name: 'Item CA00001' })).toBeInTheDocument()
    })

    it('erro: o aviso, o botão Fechar e Esc', async () => {
      vi.mocked(buscarImagem).mockRejectedValue(new Error('banco fora do ar'))
      abrir()
      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Fechar o visualizador' })).toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
      expect(await screen.findByRole('heading', { name: 'Coleções' })).toBeInTheDocument()
    })

    it('não encontrada: o botão Fechar e Esc', async () => {
      vi.mocked(buscarImagem).mockResolvedValue(null)
      abrir()
      await screen.findByRole('heading', { level: 1, name: 'Imagem não encontrada' })
      await userEvent.click(screen.getByRole('button', { name: 'Fechar o visualizador' }))
      expect(await screen.findByRole('heading', { name: 'Coleções' })).toBeInTheDocument()
    })

    it('Esc é ignorado com um diálogo modal aberto', async () => {
      vi.mocked(buscarImagem).mockReturnValue(new Promise(() => {}))
      abrir()
      const modal = document.createElement('div')
      modal.dataset.teste = '1'
      modal.setAttribute('aria-modal', 'true')
      document.body.append(modal)
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('heading', { name: 'Coleções' })).toBeNull()
    })
  })

  describe('ao fechar, o item reabre como estava', () => {
    it('aberto direto, Esc leva o item a abrir na imagem e no original que o visualizador mostrava', async () => {
      abrir()
      await imagemNaTela()
      await userEvent.keyboard('i') // original
      await userEvent.keyboard('{Escape}')
      await screen.findByRole('heading', { name: 'Item CA00001' })
      expect(estadoDoItem().imagemAberta).toEqual({ imagemId: 'IMG-T-1', original: true })
      expect(await screen.findByRole('button', { name: 'Mostrar o original' })).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('imagem que não existe', () => {
    it('diz que não encontrou e oferece o caminho de volta', async () => {
      vi.mocked(buscarImagem).mockResolvedValue(null)
      abrir()
      expect(await screen.findByRole('heading', { level: 1, name: 'Imagem não encontrada' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Ver as coleções' })).toHaveAttribute('href', '/colecoes')
    })

    it('erro do banco: aviso, sem quebrar', async () => {
      vi.mocked(buscarImagem).mockRejectedValue(new Error('banco fora do ar'))
      abrir()
      expect(await screen.findByRole('alert')).toBeInTheDocument()
    })
  })
})
