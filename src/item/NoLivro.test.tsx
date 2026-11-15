import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { NoLivro as LugarNoLivro } from '../banco/tipos'
import { NoLivro } from './NoLivro'

const NA_SUBCOLECAO: LugarNoLivro = {
  publicacao: 'TESTE',
  volume: 'I',
  periodo: 'Calcolítico (fase de teste)',
  grupo: { id: 'GR-TESTE-I-01', titulo: 'Animais de teste e figuras de prova', tituloDe: '1. Testtiere und Probefiguren', numero: '1', subcolecoes: 2 },
  subcolecao: { id: 'GR-TESTE-I-01-02', numero: '1.2–1.3', titulo: 'Figuras de prova e sinais de teste', tituloDe: 'Prüfgestalten und Testzeichen' },
}
const NO_GRUPO: LugarNoLivro = { ...NA_SUBCOLECAO, subcolecao: null }

const mostrar = (lugares: LugarNoLivro[], idioma: 'pt' | 'de' = 'pt') =>
  render(
    <MemoryRouter>
      <NoLivro lugares={lugares} idioma={idioma} />
    </MemoryRouter>,
  )
const bloco = () => screen.getByRole('region', { name: 'No livro' })

describe('NoLivro', () => {
  it('o rótulo «No livro» e o caminho em três links: o período (a obra nas Coleções), o grupo (com o número do livro) e a subcoleção', () => {
    mostrar([NA_SUBCOLECAO])
    expect(screen.getByRole('heading', { level: 2, name: 'No livro' })).toBeInTheDocument()
    const links = within(bloco()).getAllByRole('link')
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Calcolítico (fase de teste)', '/colecoes?obra=TESTE-I'],
      ['1. Animais de teste e figuras de prova', '/grupo/GR-TESTE-I-01'],
      ['1.2–1.3 Figuras de prova e sinais de teste', '/grupo/GR-TESTE-I-01-02'],
    ])
    expect(bloco().querySelector('p')).toHaveTextContent('Calcolítico (fase de teste) › 1. Animais de teste e figuras de prova › 1.2–1.3 Figuras de prova e sinais de teste')
  })

  it('o objeto direto no grupo: dois níveis, sem subcoleção', () => {
    mostrar([NO_GRUPO])
    const links = within(bloco()).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/colecoes?obra=TESTE-I', '/grupo/GR-TESTE-I-01'])
    expect(bloco()).toHaveTextContent(/› 1\. Animais de teste e figuras de prova$/)
  })

  it('com o original alemão: os títulos do livro (tituloDe), marcados em alemão; o período continua', () => {
    mostrar([NA_SUBCOLECAO], 'de')
    const links = within(bloco()).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Calcolítico (fase de teste)', '1. Testtiere und Probefiguren', '1.2–1.3 Prüfgestalten und Testzeichen'])
    expect(links[1]).toHaveAttribute('lang', 'de')
    expect(links[2]).toHaveAttribute('lang', 'de')
    expect(links[0]).not.toHaveAttribute('lang')
  })

  it('uma linha por lugar; sem período, a obra; sem lugar, nada', () => {
    const outro: LugarNoLivro = { publicacao: 'OUTRO', volume: '', periodo: null, grupo: { id: 'GR-OUTRO-01', titulo: 'Grupo de teste', tituloDe: '1. Testgruppe', numero: null, subcolecoes: 0 }, subcolecao: null }
    mostrar([NA_SUBCOLECAO, outro])
    const linhas = bloco().querySelectorAll('p')
    expect(linhas).toHaveLength(2)
    expect(within(linhas[1] as HTMLElement).getByRole('link', { name: 'OUTRO' })).toHaveAttribute('href', '/colecoes?obra=OUTRO')
    // o grupo sem subcoleções fica sem número (decisão 81)
    expect(within(linhas[1] as HTMLElement).getByRole('link', { name: 'Grupo de teste' })).toHaveAttribute('href', '/grupo/GR-OUTRO-01')
    const { container } = render(
      <MemoryRouter>
        <NoLivro lugares={[]} idioma="pt" />
      </MemoryRouter>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
