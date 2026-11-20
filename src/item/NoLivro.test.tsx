import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { NoLivro as LugarNoLivro } from '../banco/tipos'
import { NoLivro } from './NoLivro'

const NA_SUBCOLECAO: LugarNoLivro = {
  itemId: 'TESTE-0002',
  publicacao: 'TESTE',
  volume: 'I',
  periodo: 'Calcolítico (fase de teste)',
  grupo: { id: 'GR-TESTE-I-01', titulo: 'Animais de teste e figuras de prova', tituloDe: '1. Testtiere und Probefiguren', numero: '1', subcolecoes: 2 },
  subcolecao: { id: 'GR-TESTE-I-01-02', numero: '1.2–1.3', titulo: 'Figuras de prova e sinais de teste', tituloDe: 'Prüfgestalten und Testzeichen' }, emParagrafos: false,
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
    expect(bloco().querySelector('p')).toHaveTextContent('TESTE I · Calcolítico (fase de teste) › 1. Animais de teste e figuras de prova › 1.2–1.3 Figuras de prova e sinais de teste')
  })

  it('a linha começa com o nome do livro, em texto, e « · » antes do período', () => {
    mostrar([NA_SUBCOLECAO])
    const linha = bloco().querySelector('p') as HTMLElement
    expect(linha).toHaveTextContent(/^TESTE I · Calcolítico \(fase de teste\) › /)
    // o nome do livro não é link: os links continuam os três de hoje
    expect(within(linha).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Calcolítico (fase de teste)',
      '1. Animais de teste e figuras de prova',
      '1.2–1.3 Figuras de prova e sinais de teste',
    ])
    const ponto = linha.querySelector('.no-livro-livro + .no-livro-sep')
    expect(ponto).toHaveTextContent('·')
    expect(ponto).toHaveAttribute('aria-hidden', 'true')
  })

  it('Tarefa 6 (revisão da Tarefa 25, 4): a subcoleção com o mesmo rótulo do caminho do § («2. …»), e o alemão que já traz o número sem repeti-lo', () => {
    const simples: LugarNoLivro = { ...NA_SUBCOLECAO, subcolecao: { ...NA_SUBCOLECAO.subcolecao!, numero: '2', tituloDe: '2. Prüfgestalten' } }
    const { unmount } = mostrar([simples])
    expect(within(bloco()).getByRole('link', { name: '2. Figuras de prova e sinais de teste' })).toBeInTheDocument()
    unmount()
    mostrar([simples], 'de')
    expect(within(bloco()).getByRole('link', { name: '2. Prüfgestalten' })).toBeInTheDocument()
  })

  it('sem período, o nome do livro é o link e não se repete', () => {
    const outro: LugarNoLivro = { itemId: 'OUTRO-0001', publicacao: 'OUTRO', volume: '', periodo: null, grupo: { id: 'GR-OUTRO-01', titulo: 'Grupo de teste', tituloDe: '1. Testgruppe', numero: null, subcolecoes: 0 }, subcolecao: null, emParagrafos: false }
    mostrar([outro])
    const linha = bloco().querySelector('p') as HTMLElement
    expect(linha).toHaveTextContent(/^OUTRO › Grupo de teste$/)
    expect(within(linha).getByRole('link', { name: 'OUTRO' })).toHaveAttribute('href', '/colecoes?obra=OUTRO')
    expect(linha.textContent?.split('OUTRO')).toHaveLength(2)
  })

  it('um período vazio conta como sem período: o nome do livro é o link, sem link vazio', () => {
    mostrar([{ ...NO_GRUPO, publicacao: 'GGG', volume: '', periodo: '' }])
    const linha = bloco().querySelector('p') as HTMLElement
    expect(linha).toHaveTextContent(/^GGG › 1\. Animais de teste e figuras de prova$/)
    expect(within(linha).getAllByRole('link').map((l) => l.textContent)).toEqual(['GGG', '1. Animais de teste e figuras de prova'])
    expect(linha.querySelector('.no-livro-livro')).toBeNull()
  })

  it('dois livros, cada linha com o seu nome', () => {
    mostrar([NA_SUBCOLECAO, { ...NO_GRUPO, publicacao: 'GGG', volume: '', periodo: 'Ferro de teste', grupo: { ...NO_GRUPO.grupo, id: 'GR-GGG-01' } }])
    const linhas = bloco().querySelectorAll('p')
    expect(linhas).toHaveLength(2)
    expect(linhas[0]?.textContent?.startsWith('TESTE I · ')).toBe(true)
    expect(linhas[1]?.textContent?.startsWith('GGG · Ferro de teste › ')).toBe(true)
  })

  it('com o original alemão, o nome do livro não muda', () => {
    mostrar([NA_SUBCOLECAO], 'de')
    const linha = bloco().querySelector('p') as HTMLElement
    expect(linha.textContent?.startsWith('TESTE I · Calcolítico (fase de teste) › 1. Testtiere und Probefiguren')).toBe(true)
    const nome = linha.querySelector('.no-livro-livro')
    expect(nome).toHaveTextContent('TESTE I')
    expect(nome).not.toHaveAttribute('lang')
  })

  it('o objeto direto no grupo: dois níveis, sem subcoleção', () => {
    mostrar([NO_GRUPO])
    const links = within(bloco()).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/colecoes?obra=TESTE-I', '/grupo/GR-TESTE-I-01'])
    expect(bloco().querySelector('p')).toHaveTextContent(/^TESTE I · Calcolítico \(fase de teste\) › 1\. Animais de teste e figuras de prova$/)
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
    const outro: LugarNoLivro = { itemId: 'OUTRO-0001', publicacao: 'OUTRO', volume: '', periodo: null, grupo: { id: 'GR-OUTRO-01', titulo: 'Grupo de teste', tituloDe: '1. Testgruppe', numero: null, subcolecoes: 0 }, subcolecao: null, emParagrafos: false }
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

  it('Tarefa 26: a linha do livro em parágrafos (o GGG) não tem período: «TESTEG · I. capítulo › 1. seção», o capítulo e a seção em links', () => {
    const doLivro: LugarNoLivro = {
      itemId: 'TESTEG-0001b',
      publicacao: 'TESTEG',
      volume: '',
      periodo: 'Ferro II (fase de teste)',
      grupo: { id: 'GR-TESTEG-01', titulo: 'Época de teste e imagens de prova', tituloDe: 'Testzeit und Probebilder', numero: 'I', subcolecoes: 1 },
      subcolecao: { id: 'GR-TESTEG-01-01', numero: '1', titulo: 'Selos de prova da fase de teste', tituloDe: 'Probesiegel der Teststufe' },
      emParagrafos: true,
    }
    mostrar([NA_SUBCOLECAO, doLivro])
    const [, linha] = [...bloco().querySelectorAll('p')] as HTMLElement[]
    expect(linha).toHaveTextContent(/^TESTEG · I\. Época de teste e imagens de prova › 1\. Selos de prova da fase de teste$/)
    expect(within(linha!).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['I. Época de teste e imagens de prova', '/grupo/GR-TESTEG-01'],
      ['1. Selos de prova da fase de teste', '/grupo/GR-TESTEG-01-01'],
    ])
    expect(linha!.querySelector('.no-livro-livro')).toHaveTextContent('TESTEG')
  })
})
