/**
 * Etapa 4, Tarefa 27 (fix round 1; regra (a) do controlador e revisão do branch, M4): a ordem dos livros vem de um só lugar,
 * `publicacoesAbertas()`: os catálogos, depois os livros em parágrafos, depois as traduções, e em cada grupo a ordem do
 * manifesto. O pacote real lista os livros pelo nome (GGG, GGIG, IPIAO), e o sintético (TESTE < TESTEG < TESTEGEN) escondia
 * isso. Aqui o manifesto lista o livro em parágrafos e a tradução ANTES do catálogo (TESTEG, TESTEGEN, TESTE); as abas das
 * Coleções, a linha das fontes, o «No livro», as Leituras e a ficha do objeto juntado (CA00004: TESTE-0004 e a figura
 * TESTEG-0001b) seguem o catálogo primeiro. A figura ganha um achado «do texto» num sítio do TESTEG (banco de escrita): a ficha
 * continua com o sítio do catálogo, sem a marca. Só dados TESTE inventados.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { armazemComPacote, bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Colecoes } from '../telas/Colecoes'
import { Item } from '../telas/Item'
import { ordenarPorTipoDeLivro } from './arquivos'
import { executar, publicacoesAbertas, usarMotor } from './cliente'
import { item } from './consultas'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

const MANIFESTO_PELO_NOME = ['TESTEG', 'TESTEGEN', 'TESTE']

beforeAll(async () => {
  usarMotor(await bancoDeTeste({ escrita: true, armazem: await armazemComPacote(undefined, MANIFESTO_PELO_NOME) }))
  Element.prototype.scrollIntoView = vi.fn()
  // a figura juntada ao TESTE-0004 ganha um achado «do texto» (o § 2 a cita) no sítio do TESTEG
  await executar(`INSERT INTO pub_TESTEG.assertion (subject_type, subject_id, field, value, site_id, certainty, reason, publication, locator, passage_id, is_primary)
    VALUES ('item', 'TESTEG-0001b', 'findspot', 'Tell Achado Teste', 9, 'certain', 'do_texto', 'TESTEG', '§2', 'PA-TESTEG-§2-txt-1', 1)`)
})
afterAll(() => usarMotor(null))
afterEach(() => instalarMatchMedia(375))

describe('a ordem dos livros (catálogos, livros em parágrafos, traduções)', () => {
  it('ordenarPorTipoDeLivro: o tipo decide, e dentro de cada tipo vale a ordem dada', () => {
    const tipo = { A: 'traducao', B: 'paragrafos', C: 'catalogo', D: 'paragrafos', E: 'catalogo' } as const
    expect(ordenarPorTipoDeLivro(['A', 'B', 'C', 'D', 'E'] as const, (x) => tipo[x])).toEqual(['C', 'E', 'B', 'D', 'A'])
  })

  it('publicacoesAbertas() põe o catálogo antes do livro em parágrafos e da tradução, com o manifesto ao contrário', async () => {
    expect((await publicacoesAbertas()).map((p) => p.sigla)).toEqual(['TESTE', 'TESTEG', 'TESTEGEN'])
  })

  it('as abas das Coleções: SKC, o catálogo, o livro em parágrafos', async () => {
    render(
      <MemoryRouter initialEntries={['/colecoes']}>
        <Colecoes />
      </MemoryRouter>,
    )
    const abas = screen.getByRole('navigation', { name: 'Obras' })
    await waitFor(() => expect(within(abas).getAllByRole('link')).toHaveLength(3))
    expect(within(abas).getAllByRole('link').map((a) => a.textContent)).toEqual([expect.stringContaining('SKC'), expect.stringContaining('TESTE I'), expect.stringContaining('TESTEG')])
  })

  it('o objeto juntado: os itens, o «No livro» e o sítio da ficha são do catálogo primeiro, sem a marca «do texto»', async () => {
    const ca = (await item('CA00004'))!
    expect(ca.itens.map((i) => i.publicacao)).toEqual(['TESTE', 'TESTEG'])
    expect(ca.noLivro.map((l) => l.publicacao)).toEqual(['TESTE', 'TESTEG'])
    expect(ca.sitio).toMatchObject({ id: 'TESTE-2', nome: 'Tell Probe Teste', doTexto: false })
  })

  it.each([375, 1280])('a página do objeto juntado (%i px): a linha das fontes, a ficha e as Leituras', async (largura) => {
    instalarMatchMedia(largura)
    render(
      <MemoryRouter initialEntries={['/item/CA00004']}>
        <Routes>
          <Route path="/item/:numero" element={<Item />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Selo de teste. Pedra de prova.')
    expect(within(screen.getByTestId('item-cabeca')).getByTestId('numeros-nas-fontes')).toHaveTextContent(/^TESTE I: 4 · TESTEG: 1b$/)
    const ficha = screen.getByRole('group', { name: 'Ficha' })
    expect(within(ficha).getByRole('link', { name: 'Tell Probe Teste' })).toHaveAttribute('href', '/sitio/TESTE-2')
    expect(within(ficha).queryByTestId('marca-do-texto')).toBeNull()
    const leituras = screen.getByRole('region', { name: 'Leituras' })
    expect(within(leituras).getAllByTestId('leitura-fonte').map((f) => f.textContent).slice(0, 2)).toEqual(['TESTEI: 4', 'TESTEG1b'])
  })
})
