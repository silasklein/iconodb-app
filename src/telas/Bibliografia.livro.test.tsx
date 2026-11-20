/**
 * Etapa 4, Tarefa 26 (tela 5 aprovada): o livro em parágrafos e a tradução dele como obras da Bibliografia, sobre o pacote
 * sintético. O `TESTEG` (o modelo do GGG) e o `TESTEGEN` (o do GGIG) não têm obra igual na Bibliografia comum: entram como
 * `LIVRO-TESTEG` e `LIVRO-TESTEGEN`, com a etiqueta do livro na lista. A página da obra do livro tem «Este livro no IconoDB»:
 * os números, «Abrir nas Coleções», «Ler o § 1» e a tradução inglesa ao lado de cada §.
 */
import { cleanup, screen, within } from '@testing-library/react'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

afterEach(() => instalarMatchMedia(375))

describe('o livro em parágrafos na Bibliografia (Tarefa 26)', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
    usarFoldDoPacoteSintetico()
  })
  afterAll(() => usarMotor(null))

  it('a lista traz o livro e a tradução, com a etiqueta do livro', async () => {
    renderizarRota('/bibliografia')
    const livro = await screen.findByRole('link', { name: /Autorin 2021/ })
    expect(livro).toHaveAttribute('href', '/obra/LIVRO-TESTEG')
    expect(within(livro).getByText('TESTEG')).toHaveClass('obra-linha-livro')
    expect(within(livro).getByText('Probesiegel und Testbilder. Ein erfundenes Buch in Paragraphen')).toBeInTheDocument()
    const traducao = screen.getByRole('link', { name: /Autorin 2022/ })
    expect(traducao).toHaveAttribute('href', '/obra/LIVRO-TESTEGEN')
    expect(within(traducao).getByText('TESTEGEN')).toBeInTheDocument()
    expect(screen.getByText('5 obras · Chicago autor-data')).toBeInTheDocument()
  })

  describe.each([
    ['celular', 375],
    ['computador', 1280],
  ])('a página da obra do livro (%s)', (_, largura) => {
    beforeEach(() => instalarMatchMedia(largura))

    it('a referência, «Este livro no IconoDB» com os números, «Abrir nas Coleções», «Ler o § 1» e o inglês', async () => {
      renderizarRota('/obra/LIVRO-TESTEG')
      expect(await screen.findByRole('heading', { name: 'Autorin 2021' })).toBeInTheDocument()
      expect(screen.getByText(/Probesiegel und Testbilder\. Ein erfundenes Buch in Paragraphen/, { selector: '.obra-chicago, .obra-chicago *' })).toBeInTheDocument()
      const bloco = screen.getByRole('region', { name: 'Este livro no IconoDB' })
      expect(bloco).toHaveTextContent('Os §§, as notas e as figuras do livro, com o alemão, o português e o inglês lado a lado.')
      expect(bloco).toHaveTextContent('1 capítulo · 3 §§ · 3 figuras')
      expect(within(bloco).getByRole('link', { name: 'Abrir nas Coleções' })).toHaveAttribute('href', '/colecoes?obra=TESTEG')
      expect(within(bloco).getByRole('link', { name: 'Ler o § 1' })).toHaveAttribute('href', '/paragrafo/TESTEG/1')
      expect(within(bloco).getByRole('link', { name: 'Autorin 2022' })).toHaveAttribute('href', '/obra/LIVRO-TESTEGEN')
      expect(bloco).toHaveTextContent('Em inglês: Autorin 2022 (TESTEGEN), ao lado do alemão em cada §.')
    })

    it('a página da tradução leva ao original e ao § 1 dele', async () => {
      renderizarRota('/obra/LIVRO-TESTEGEN')
      expect(await screen.findByRole('heading', { name: 'Autorin 2022' })).toBeInTheDocument()
      const bloco = screen.getByRole('region', { name: 'Este livro no IconoDB' })
      expect(bloco).toHaveTextContent('A tradução inglesa de Autorin 2021 (TESTEG): o inglês aparece ao lado do alemão em cada § do TESTEG.')
      expect(within(bloco).getByRole('link', { name: 'Autorin 2021' })).toHaveAttribute('href', '/obra/LIVRO-TESTEG')
      expect(within(bloco).getByRole('link', { name: 'Ler o § 1' })).toHaveAttribute('href', '/paragrafo/TESTEG/1')
      expect(within(bloco).queryByRole('link', { name: 'Abrir nas Coleções' })).toBeNull()
    })
  })

  it('um `LIVRO-` que não está no pacote: «Obra não encontrada»', async () => {
    renderizarRota('/obra/LIVRO-NENHUM')
    expect(await screen.findByText('Obra não encontrada')).toBeInTheDocument()
  })
})

describe('o livro com obra igual na Bibliografia comum (banco de escrita)', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    usarFoldDoPacoteSintetico()
    await executar(
      `INSERT INTO main.bib_entry (id, csl_json, short_cites, origin) VALUES ('BIB-900077',
        '{"type": "book", "title": "Probe Seals and Test Images. An Invented Book in Paragraphs", "author": [{"family": "Autorin", "given": "Dritte Teste"}], "issued": {"date-parts": [[2022]]}}',
        '{"TESTEG": ["Autorin 2022"]}', 'TESTEG')`,
    )
  })
  afterAll(() => usarMotor(null))

  it('a linha é a da obra, com a etiqueta, sem outra entrada; a página da obra tem o bloco do livro', async () => {
    renderizarRota('/bibliografia')
    const obra = await screen.findByRole('link', { name: /Autorin 2022/ })
    expect(obra).toHaveAttribute('href', '/obra/BIB-900077')
    expect(within(obra).getByText('TESTEGEN')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Autorin 2022/ })).toHaveLength(1)
    cleanup()
    renderizarRota('/obra/BIB-900077')
    const bloco = await screen.findByRole('region', { name: 'Este livro no IconoDB' })
    expect(within(bloco).getByRole('link', { name: 'Autorin 2021' })).toHaveAttribute('href', '/obra/LIVRO-TESTEG')
  })
})
