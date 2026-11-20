/**
 * Etapa 4, Tarefa 24: as peças da página da figura (o item sem os campos do catálogo, `tipo 'figura'`), com dados sintéticos:
 * o crédito com as citações ligadas às obras, «Discutida em» (o § e a frase que cita a figura, decisão 91 a3) e a marca
 * «do texto» do sítio, com o link ao § quando o achado tem trecho e sem link quando veio só do crédito.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { OrigemDosLinks } from '../app/OrigemDosLinks'
import type { CampoDoCatalogo, ItemDaFonte, ParagrafoQueCita, ReferenciaBibliografica } from '../banco/tipos'
import { CreditoDaFigura, DiscutidaEm, figurasDe, MarcaDoTexto, numeroDaFigura, semPrefixoDaFigura } from './Figura'

const figura: ItemDaFonte = { id: 'TESTEG-0001a', publicacao: 'TESTEG', tipo: 'figura', origem: 'TESTEG: 1a', referencia: { obra: 'TESTEG', numero: 1, sufixo: 'a', abb: false } }
const catalogo: ItemDaFonte = { id: 'TESTE-0004', publicacao: 'TESTE', tipo: 'catalog', origem: 'TESTE I: 4', referencia: { obra: 'TESTE I', numero: 4, sufixo: '', abb: false } }

const campo = (literal: string, texto: string | null = null): CampoDoCatalogo => ({
  itemId: 'TESTEG-0001a',
  categoria: 7,
  unidade: 'TESTEG-0001a#7',
  literal,
  texto,
  termos: [],
  estado: null,
  desatualizada: false,
})

const referencia = (bruto: string, obraId: string | null, itemId = 'TESTEG-0001a'): ReferenciaBibliografica => ({
  id: 1,
  sigla: 'TESTEG',
  itemId,
  categoria: 7,
  bruto,
  curta: bruto.split(':')[0]!,
  paginas: null,
  obraId,
  resolvida: obraId !== null,
  resolvidaPor: obraId ? 'auto' : null,
  chicago: null,
  chicagoHtml: null,
  hipoteseId: null,
  passagemId: null,
})

const comRota = (no: React.ReactNode) => render(<MemoryRouter>{no}</MemoryRouter>)

describe('figurasDe e numeroDaFigura', () => {
  it('só os itens de figura; o número é o número e a letra do livro, sem a sigla', () => {
    expect(figurasDe([catalogo, figura])).toEqual([figura])
    expect(figurasDe([catalogo])).toEqual([])
    expect(numeroDaFigura(figura)).toBe('1a')
    expect(numeroDaFigura({ ...figura, referencia: { ...figura.referencia, numero: 2, sufixo: '' } })).toBe('2')
  })
})

describe('semPrefixoDaFigura', () => {
  const ref = (numero: number, sufixo = '') => ({ obra: 'TESTEG', numero, sufixo })
  it('tira o prefixo só quando ele começa pelo número da própria figura (e cobre a letra dela)', () => {
    expect(semPrefixoDaFigura('1a-b Autor 1999: 22 Abb. 4', ref(1, 'a'))).toBe('Autor 1999: 22 Abb. 4')
    expect(semPrefixoDaFigura('1a-b Autor 1999: 22 Abb. 4', ref(1, 'b'))).toBe('Autor 1999: 22 Abb. 4')
    expect(semPrefixoDaFigura('1a–c Autor 1999: 22', ref(1, 'b'))).toBe('Autor 1999: 22')
    expect(semPrefixoDaFigura('3a, c Autora 2004: 9', ref(3, 'c'))).toBe('Autora 2004: 9')
    expect(semPrefixoDaFigura('2 Autora 2004: 9 Taf. 1', ref(2))).toBe('Autora 2004: 9 Taf. 1')
    expect(semPrefixoDaFigura('5 Autora 2004: 9', ref(5, 'b'))).toBe('Autora 2004: 9')
  })

  it('fica como está: outro número, a letra que não é a da figura, número mais longo, e o crédito que começa pelo autor', () => {
    expect(semPrefixoDaFigura('12 Autor 1999: 22', ref(1, 'a'))).toBe('12 Autor 1999: 22')
    expect(semPrefixoDaFigura('2 Autora 2004: 9', ref(3))).toBe('2 Autora 2004: 9')
    expect(semPrefixoDaFigura('1a-b Autor 1999: 22', ref(1, 'c'))).toBe('1a-b Autor 1999: 22')
    expect(semPrefixoDaFigura('Autor 1999: 1 Abb. 1', ref(1))).toBe('Autor 1999: 1 Abb. 1')
    expect(semPrefixoDaFigura('1', ref(1))).toBe('1')
  })
})

describe('CreditoDaFigura', () => {
  it('sem o prefixo da figura («1a-b»), como no desenho aprovado; com `comPrefixo`, como impresso', () => {
    const { unmount } = comRota(<CreditoDaFigura campo={campo('1a-b Autor 1999: 22 Abb. 4 (crédito de teste)')} item={figura} bibliografia={[]} />)
    expect(document.body).toHaveTextContent(/^Autor 1999: 22 Abb. 4 \(crédito de teste\)$/)
    unmount()
    comRota(<CreditoDaFigura campo={campo('1a-b Autor 1999: 22 Abb. 4 (crédito de teste)')} item={figura} bibliografia={[]} comPrefixo />)
    expect(document.body).toHaveTextContent(/^1a-b Autor 1999: 22 Abb. 4 \(crédito de teste\)$/)
  })

  it('o crédito como impresso, com a citação resolvida ligada à obra; a não resolvida fica em texto', () => {
    comRota(
      <CreditoDaFigura
        campo={campo('1a Autor 1999: 22 Abb. 4 (= Autora 2004: Taf. 5,2)')}
        item={figura}
        bibliografia={[referencia('Autor 1999: 22 Abb. 4', 'BIB-900001'), referencia('Autora 2004: Taf. 5,2', null)]}
      />,
    )
    const link = screen.getByRole('link', { name: 'Autor 1999: 22 Abb. 4, na bibliografia' })
    expect(link).toHaveAttribute('href', '/obra/BIB-900001')
    expect(link).toHaveTextContent('Autor 1999: 22 Abb. 4')
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(document.body).toHaveTextContent(/^Autor 1999: 22 Abb. 4 \(= Autora 2004: Taf. 5,2\)$/)
  })

  it('a referência de outro item não liga; o português, quando há, vem no lugar do impresso', () => {
    comRota(<CreditoDaFigura campo={campo('1a Autor 1999: 22', '1a Autor 1999: 22 (crédito de teste)')} item={figura} bibliografia={[referencia('Autor 1999: 22', 'BIB-900001', 'TESTE-0004')]} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(document.body).toHaveTextContent(/^Autor 1999: 22 \(crédito de teste\)$/)
  })
})

describe('DiscutidaEm', () => {
  const citacoes: ParagrafoQueCita[] = [
    {
      sigla: 'TESTEG',
      numero: 2,
      trechoId: 'PA-TESTEG-§2-txt-1',
      frase: 'Dois selos de prova (Abb. 1a) de teste.',
      lingua: 'pt',
      caminho: ['TESTEG', 'I. Época de teste e imagens de prova', '1. Selos de prova da fase de teste'],
    },
    { sigla: 'TESTEG', numero: 3, trechoId: 'PA-TESTEG-§3-txt-1', frase: 'Ein Probesiegel (Abb. 1a).', lingua: 'original', caminho: ['TESTEG'] },
  ]
  const frase = (link: HTMLElement) => link.querySelector('.discutida-frase')!

  it('«Discutida em 2 §§»: cada § é um link à página dele, com a frase que cita a figura, na língua dela', () => {
    comRota(<DiscutidaEm citacoes={citacoes} />)
    expect(screen.getByText('Discutida em 2 §§')).toBeInTheDocument()
    const lista = screen.getByRole('list', { name: 'Discutida em 2 §§' })
    const linhas = within(lista).getAllByRole('link')
    expect(linhas.map((l) => l.getAttribute('href'))).toEqual(['/paragrafo/TESTEG/2', '/paragrafo/TESTEG/3'])
    expect(linhas[0]).toHaveTextContent('§ 2')
    expect(frase(linhas[0]!)).toHaveTextContent(/^Dois selos de prova \(Abb\. 1a\) de teste\.$/)
    expect(frase(linhas[0]!)).toHaveAttribute('lang', 'pt-BR')
    expect(frase(linhas[1]!)).toHaveTextContent(/^Ein Probesiegel \(Abb\. 1a\)\.$/)
    expect(frase(linhas[1]!)).toHaveAttribute('lang', 'de')
  })

  it('Tarefa 25: a referência à figura destacada na frase e o caminho do § em português, sem o livro', () => {
    comRota(<DiscutidaEm citacoes={citacoes} figura={{ numero: 1, sufixo: 'a' }} />)
    const linhas = within(screen.getByRole('list', { name: 'Discutida em 2 §§' })).getAllByRole('link')
    expect([...linhas[0]!.querySelectorAll('.discutida-fig')].map((e) => e.textContent)).toEqual(['(Abb. 1a)'])
    expect(frase(linhas[0]!)).toHaveTextContent(/^Dois selos de prova \(Abb\. 1a\) de teste\.$/)
    expect(linhas[0]!.querySelector('.discutida-onde')).toHaveTextContent(/^I\. Época de teste e imagens de prova › 1\. Selos de prova da fase de teste$/)
    // o § fora de grupo: sem a linha do caminho
    expect(linhas[1]!.querySelector('.discutida-onde')).toBeNull()
    expect(linhas[1]!.querySelector('.discutida-fig')).toHaveTextContent('(Abb. 1a)')
  })

  it('o link ao § leva a origem da figura («‹ Figura TESTEG: 1a», decisão 85)', async () => {
    function Estado() {
      return <output data-testid="estado">{JSON.stringify(useLocation().state)}</output>
    }
    render(
      <MemoryRouter initialEntries={['/item/F200001']}>
        <Routes>
          <Route
            path="/item/:numero"
            element={
              <OrigemDosLinks rotulo="Figura TESTEG: 1a">
                <DiscutidaEm citacoes={citacoes.slice(0, 1)} figura={{ numero: 1, sufixo: 'a' }} />
              </OrigemDosLinks>
            }
          />
          <Route path="/paragrafo/:sigla/:numero" element={<Estado />} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('link', { name: /§ 2/ }))
    expect(JSON.parse(screen.getByTestId('estado').textContent!)).toMatchObject({ voltar: { rotulo: 'Figura TESTEG: 1a', caminho: '/item/F200001' } })
  })

  it('um § só: «Discutida em 1 §»; nenhum: a linha diz que nenhum § cita a figura', () => {
    const { unmount } = comRota(<DiscutidaEm citacoes={citacoes.slice(0, 1)} />)
    expect(screen.getByText('Discutida em 1 §')).toBeInTheDocument()
    unmount()
    comRota(<DiscutidaEm citacoes={[]} />)
    expect(screen.getByText('Nenhum § cita esta figura.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })
})

describe('MarcaDoTexto', () => {
  it('o achado pelo §: a etiqueta contornada «do texto» e «pela fig. 2 no § 3», com o link ao §', () => {
    comRota(<MarcaDoTexto sitio={{ id: 'TESTEG-9', doTexto: true, paragrafo: 3 }} figura={{ ...figura, referencia: { ...figura.referencia, numero: 2, sufixo: '' } }} />)
    expect(screen.getByText('do texto')).toHaveClass('marca-skc')
    const nota = screen.getByTestId('marca-do-texto')
    expect(nota).toHaveTextContent('do texto pela fig. 2 no § 3')
    expect(within(nota).getByRole('link', { name: '§ 3' })).toHaveAttribute('href', '/paragrafo/TESTEG/3')
  })

  it('sem figura no objeto: «pelo § 3»', () => {
    comRota(<MarcaDoTexto sitio={{ id: 'TESTEG-9', doTexto: true, paragrafo: 3 }} figura={null} />)
    expect(screen.getByTestId('marca-do-texto')).toHaveTextContent('do texto pelo § 3')
    expect(screen.getByRole('link', { name: '§ 3' })).toHaveAttribute('href', '/paragrafo/TESTEG/3')
  })

  it('o achado só pelo crédito: a etiqueta e «pelo crédito; nenhum § diz o lugar», sem link', () => {
    comRota(<MarcaDoTexto sitio={{ id: 'TESTEG-9', doTexto: true, paragrafo: null }} figura={figura} />)
    expect(screen.getByTestId('marca-do-texto')).toHaveTextContent('do texto pelo crédito; nenhum § diz o lugar')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('o achado comum: nada', () => {
    const { container } = comRota(<MarcaDoTexto sitio={{ id: 'TESTE-1', doTexto: false, paragrafo: null }} figura={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
