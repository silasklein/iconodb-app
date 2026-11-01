import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
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
      <Leitura fonte="TESTE I, 2" publicacao="TESTE" texto={TEXTO} original={ORIGINAL} termos={[TERMO]} ancoras={[]} {...props} />
    </MemoryRouter>,
  )
}

describe('Leitura', () => {
  it('o rótulo da fonte fica à esquerda: a sigla e, embaixo, volume e número', () => {
    desenhar()
    const rotulo = screen.getByTestId('leitura-fonte')
    expect(rotulo).toHaveTextContent('TESTE')
    expect(within(rotulo).getByText('I, 2')).toBeInTheDocument()
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
    // o texto visível (sem a nota para leitor de tela) é só o termo
    const visivel = [...ancora.childNodes].filter((n) => !(n instanceof HTMLElement && n.classList.contains('so-leitor')))
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
        { inicio: j, fim: j + 1, destino: '/item/CA00002', rotulo: 'Abrir CA00002, TESTE I, 2' },
      ],
    })
    expect(screen.getByRole('link', { name: 'Autor 1999, na bibliografia' })).toHaveAttribute('href', '/obra/BIB-900001')
    expect(screen.getByRole('link', { name: 'Abrir CA00002, TESTE I, 2' })).toHaveTextContent(/^2$/)
  })
})
