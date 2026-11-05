import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { registrarAtalhos } from '../app/atalhos'
import { instalarMatchMedia } from '../test/larguraDeTela'
import type { Ancora, Termo } from '../banco/tipos'
import { Leitura } from './Leitura'

const TEXTO = 'No verso está o sinal 𓀀 ao lado de um leão-de-teste de cauda erguida.'
const ORIGINAL = 'Auf der Rückseite steht das Zeichen 𓀀 neben einem Testlöwen.'
/** Em code points, como o banco grava: o 𓀀 conta como 1. */
const INICIO = [...TEXTO.slice(0, TEXTO.indexOf('leão'))].length
const TERMO: Termo = { glId: 'GL-900001', inicio: INICIO, fim: INICIO + 13 }
const ANCORA: Ancora = { hipoteseId: 'HY-900003', glId: 'GL-900001', inicio: INICIO, fim: INICIO + 13, nivel: 'iconographic', modalidade: 'probable' }

function desenhar(props: Partial<Parameters<typeof Leitura>[0]> = {}) {
  return render(
    <MemoryRouter initialEntries={['/item/CA00002']}>
      <Leitura fonte="TESTE I: 2" publicacao="TESTE" texto={TEXTO} original={ORIGINAL} termos={[TERMO]} ancoras={[]} {...props} />
    </MemoryRouter>,
  )
}

describe('Leitura', () => {
  it('o rótulo da fonte fica à esquerda: a sigla e, embaixo, volume e número', () => {
    desenhar()
    const rotulo = screen.getByTestId('leitura-fonte')
    expect(rotulo).toHaveTextContent('TESTE')
    expect(within(rotulo).getByText('I: 2')).toBeInTheDocument()
  })

  it('Foco 4: com 𓀀 antes, o link do termo é exatamente o termo e leva ao verbete', () => {
    desenhar()
    const link = screen.getByRole('link', { name: 'leão-de-teste' })
    expect(link).toHaveTextContent(/^leão-de-teste$/)
    expect(link).toHaveAttribute('href', '/verbete/GL-900001')
    expect(link).toHaveClass('termo')
  })

  it('a âncora (pontilhada) cobre exatamente o trecho e abre a hipótese; o termo fica marcado dentro dela', () => {
    desenhar({ ancoras: [ANCORA] })
    const ancora = screen.getByRole('link', { name: /^leão-de-teste/ })
    expect(ancora).toHaveClass('ancora')
    expect(ancora.getAttribute('href')).toBe('/item/CA00002?hipotese=HY-900003')
    expect(ancora).toHaveAttribute('data-hipotese', 'HY-900003')
    // o texto visível (sem a nota para leitor de tela nem a prévia do mouse) é só o termo
    const visivel = [...ancora.childNodes].filter((n) => !(n instanceof HTMLElement && (n.classList.contains('so-leitor') || n.classList.contains('ancora-previa'))))
    expect(visivel.map((n) => n.textContent).join('')).toBe('leão-de-teste')
    expect(within(ancora).getByText('leão-de-teste')).toHaveClass('termo-marcado')
    expect(ancora).toHaveAccessibleName('leão-de-teste, hipótese: iconográfico, provável')
    // não há link de termo aninhado
    expect(within(ancora).queryByRole('link')).toBeNull()
  })

  it('a âncora da hipótese aberta fica destacada', () => {
    desenhar({ ancoras: [ANCORA], hipoteseAtiva: 'HY-900003' })
    expect(screen.getByRole('link', { name: /^leão-de-teste/ })).toHaveClass('ancora-ativa')
  })

  it('em DE mostra o original, sem termos nem âncoras', () => {
    desenhar({ ancoras: [ANCORA], idioma: 'de' })
    const p = screen.getByText(ORIGINAL)
    expect(p).toHaveAttribute('lang', 'de')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('sem tradução, mostra o original com o aviso', () => {
    desenhar({ texto: null })
    expect(screen.getByText('Sem tradução ainda; o original, em alemão.')).toBeInTheDocument()
    expect(screen.getByText(ORIGINAL)).toHaveAttribute('lang', 'de')
  })

  it('links do texto (citação e número) levam à obra e ao item', () => {
    const texto = 'Como em Autor 1999 (cf. 2).'
    const i = texto.indexOf('Autor')
    const j = texto.indexOf('2)')
    desenhar({
      texto,
      termos: [],
      links: [
        { inicio: i, fim: i + 10, destino: '/obra/BIB-900001', rotulo: 'Autor 1999, na bibliografia' },
        { inicio: j, fim: j + 1, destino: '/item/CA00002', rotulo: 'Abrir CA00002, TESTE I: 2' },
      ],
    })
    expect(screen.getByRole('link', { name: 'Autor 1999, na bibliografia' })).toHaveAttribute('href', '/obra/BIB-900001')
    expect(screen.getByRole('link', { name: 'Abrir CA00002, TESTE I: 2' })).toHaveTextContent(/^2$/)
  })

  describe('a prévia da hipótese ao passar o mouse (decisão 35, revisão 1)', () => {
    const RESUMO = () => ({ termo: 'leão-de-teste', sobre: 'o objeto inteiro' })
    const ancora = () => screen.getByRole('link', { name: /^leão-de-teste/ })
    const previa = () => document.querySelector<HTMLElement>('.ancora-previa')
    // O mapa de teclas do painel: a Esc que a prévia toma não pode chegar a ele.
    let desfazer: (() => void) | null = null
    afterEach(() => desfazer?.())

    describe('em aparelho com mouse', () => {
      beforeEach(() => instalarMatchMedia(1280, { hover: true }))

      it('fechada até o mouse chegar; ao passar mostra o marcador, «Nível · certeza», «Termo: … · sobre …» e a dica de clique; ao sair, fecha', async () => {
        desenhar({ ancoras: [ANCORA], resumoDaHipotese: RESUMO })
        expect(previa()).toBeNull()
        await userEvent.hover(ancora())
        const caixa = previa()!
        expect(caixa).not.toBeNull()
        // Só visual: o leitor de tela já ouve o nível e a certeza na nota do link.
        expect(caixa).toHaveAttribute('aria-hidden', 'true')
        // Fora do texto da seleção (src/hipoteses/selecao.ts): não entra nas posições de uma hipótese nova.
        expect(caixa).toHaveAttribute('data-fora-do-texto')
        expect(caixa.querySelectorAll('rect[data-cheio="true"]')).toHaveLength(2)
        expect(caixa.querySelector('.marcador-nivel')).toHaveAttribute('data-nivel', 'iconographic')
        // 22×6, o tamanho da prévia no desenho (o do painel, 30×8, é outro).
        expect(caixa.querySelector('svg')).toHaveAttribute('width', '22')
        expect(caixa).toHaveTextContent('Iconográfico · provável')
        expect(caixa).toHaveTextContent('Termo: leão-de-teste · sobre o objeto inteiro')
        expect(caixa).toHaveTextContent('Clique no trecho para fixar o painel')
        expect(ancora()).toHaveAccessibleName('leão-de-teste, hipótese: iconográfico, provável')
        await userEvent.unhover(ancora())
        expect(previa()).toBeNull()
      })

      it('sem o resumo da hipótese, a linha «Termo: …» não aparece (o resto sim)', async () => {
        desenhar({ ancoras: [ANCORA] })
        await userEvent.hover(ancora())
        expect(previa()).toHaveTextContent('Iconográfico · provável')
        expect(previa()).not.toHaveTextContent('Termo:')
      })

      it('WCAG 1.4.13, pairável: o mouse pode passar para a própria caixa, que fica aberta; ao sair dela, fecha', async () => {
        desenhar({ ancoras: [ANCORA], resumoDaHipotese: RESUMO })
        await userEvent.hover(ancora())
        await userEvent.hover(previa()!)
        expect(previa()).not.toBeNull()
        await userEvent.unhover(previa()!)
        expect(previa()).toBeNull()
      })

      it('WCAG 1.4.13, dispensável: Esc fecha a prévia SEM chegar ao painel; sai e volta com o mouse e ela reaparece', async () => {
        const aoFechar = vi.fn()
        desfazer = registrarAtalhos({ Escape: aoFechar }, 'hipotese')
        desenhar({ ancoras: [ANCORA], resumoDaHipotese: RESUMO })
        // Sem prévia aberta, a Esc é do painel (o negativo que prova o positivo).
        await userEvent.keyboard('{Escape}')
        expect(aoFechar).toHaveBeenCalledTimes(1)
        await userEvent.hover(ancora())
        expect(previa()).not.toBeNull()
        await userEvent.keyboard('{Escape}')
        expect(previa()).toBeNull()
        expect(aoFechar).toHaveBeenCalledTimes(1)
        // Dispensada, não volta enquanto o mouse fica; ao sair e voltar, abre de novo.
        await userEvent.unhover(ancora())
        await userEvent.hover(ancora())
        expect(previa()).not.toBeNull()
        // E a Esc seguinte, sem prévia, volta a ser do painel.
        await userEvent.keyboard('{Escape}')
        await userEvent.keyboard('{Escape}')
        expect(aoFechar).toHaveBeenCalledTimes(2)
      })

      it('Esc com a caixa debaixo do mouse: o navegador não avisa a saída, e entrar de novo no trecho rearma a prévia', async () => {
        desenhar({ ancoras: [ANCORA], resumoDaHipotese: RESUMO })
        await userEvent.hover(ancora())
        await userEvent.keyboard('{Escape}')
        expect(previa()).toBeNull()
        // Nenhum «sair» chega ao trecho; só uma nova entrada.
        fireEvent.mouseEnter(ancora())
        expect(previa()).not.toBeNull()
      })

      it('pelo teclado: o foco no trecho abre a prévia e sair do trecho a fecha', async () => {
        desenhar({ ancoras: [ANCORA], resumoDaHipotese: RESUMO })
        await userEvent.tab()
        expect(ancora()).toHaveFocus()
        expect(previa()).not.toBeNull()
        await userEvent.tab()
        expect(previa()).toBeNull()
      })

      it('T17-C-22 (WCAG 1.4.13, persistente): com o foco no trecho, o mouse passar e sair não fecha a prévia; sair do foco fecha', async () => {
        desenhar({ ancoras: [ANCORA], resumoDaHipotese: RESUMO })
        await userEvent.tab()
        expect(ancora()).toHaveFocus()
        expect(previa()).not.toBeNull()
        await userEvent.hover(ancora())
        await userEvent.unhover(ancora())
        expect(ancora()).toHaveFocus()
        expect(previa()).not.toBeNull() // o foco continua no trecho: a prévia fica
        await userEvent.tab()
        expect(previa()).toBeNull() // sem mouse e sem foco, fecha
      })

      it('T17-C-22: o mouse em cima e o foco saindo não fecha; tirando também o mouse, fecha', async () => {
        desenhar({ ancoras: [ANCORA], resumoDaHipotese: RESUMO })
        await userEvent.tab()
        await userEvent.hover(ancora())
        await userEvent.tab()
        expect(previa()).not.toBeNull() // o mouse ainda está no trecho
        await userEvent.unhover(ancora())
        expect(previa()).toBeNull()
      })

      it('T17-C-21: se o parágrafo se reajusta com a prévia aberta (a janela muda de tamanho), a caixa acompanha a linha do trecho', async () => {
        const linha = { top: 100, bottom: 120, left: 40, right: 140, width: 100, height: 20, x: 40, y: 100, toJSON() {} }
        let atual = linha
        const rects = vi.spyOn(HTMLAnchorElement.prototype, 'getClientRects').mockImplementation(() => [atual] as unknown as DOMRectList)
        const pai = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 800, left: 0, right: 600, width: 600, height: 800, x: 0, y: 0, toJSON() {} })
        try {
          desenhar({ ancoras: [ANCORA], resumoDaHipotese: RESUMO })
          await userEvent.hover(ancora())
          expect(previa()!.style.top).toBe('120px') // logo abaixo da linha
          // o parágrafo reflui (uma imagem ou fonte carregou, a janela mudou): a linha do trecho desce 80 px com o mouse parado
          atual = { ...linha, top: 180, bottom: 200, y: 180 }
          fireEvent(window, new Event('resize'))
          expect(previa()!.style.top).toBe('200px')
        } finally {
          rects.mockRestore()
          pai.mockRestore()
        }
      })

      it('«Sem nível» (SKC sem nível nem certeza): sem quadrados, sem nível inventado', async () => {
        desenhar({ ancoras: [{ ...ANCORA, hipoteseId: 'HY-testeaaa-1', nivel: null, modalidade: null }] })
        await userEvent.hover(screen.getByRole('link', { name: /^leão-de-teste/ }))
        expect(previa()!.querySelector('svg')).toBeNull()
        expect(previa()).toHaveTextContent('Sem nível')
        expect(previa()).not.toHaveTextContent(/Iconográfico|Possível/)
      })

      it.each([
        ['pre_iconographic', 1, 'Pré-iconográfico'],
        ['iconological', 3, 'Iconológico'],
      ] as const)('nível %s: %i quadrado(s) cheio(s)', async (nivel, n, rotulo) => {
        desenhar({ ancoras: [{ ...ANCORA, nivel }] })
        await userEvent.hover(ancora())
        expect(previa()!.querySelectorAll('rect[data-cheio="true"]')).toHaveLength(n)
        expect(previa()).toHaveTextContent(`${rotulo} · provável`)
      })

      it('várias hipóteses no mesmo trecho: a prévia diz quantas mais', async () => {
        desenhar({ ancoras: [ANCORA, { ...ANCORA, hipoteseId: 'HY-900009', nivel: 'iconological' }], resumoDaHipotese: RESUMO })
        await userEvent.hover(ancora())
        expect(previa()).toHaveTextContent('mais 1 no mesmo trecho')
      })

      it('a caixa é filha do link e fica dentro do parágrafo (o CSS a posiciona junto da linha do trecho)', async () => {
        desenhar({ ancoras: [ANCORA], resumoDaHipotese: RESUMO })
        await userEvent.hover(ancora())
        expect(previa()!.parentElement).toBe(ancora())
        expect(ancora().closest('.leitura-texto')).not.toBeNull()
      })
    })

    describe('em aparelho de toque (sem hover)', () => {
      beforeEach(() => instalarMatchMedia(375, { hover: false }))

      it('nunca abre a prévia: nem pelo mouse emulado, nem pelo foco, nem depois de tocar (nada fica grudado)', async () => {
        desenhar({ ancoras: [ANCORA], resumoDaHipotese: RESUMO })
        await userEvent.hover(ancora())
        expect(previa()).toBeNull()
        await userEvent.tab()
        expect(ancora()).toHaveFocus()
        expect(previa()).toBeNull()
        await userEvent.click(ancora())
        expect(previa()).toBeNull()
      })
    })
  })
})
