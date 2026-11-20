/**
 * Etapa 4, Tarefa 26 (tela 4 aprovada; decisão 91, a6): os §§ na Busca. Em «Tudo», o bloco «Nos §§» com os 3 primeiros e
 * «Ver os N §§», que leva à aba «Texto»; a aba «Texto» lista todos. Cada linha: o livro, o § (e a nota), o recorte com o
 * termo em destaque e o caminho, um link à página do §. A busca em si é testada em busca/paragrafosNaBusca.test.ts; aqui
 * `buscar` é simulada.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { vi } from 'vitest'
import { buscar, type ParagrafoAchado, type ResultadoDaBusca } from '../busca/consulta'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Busca } from './Busca'

vi.mock('../banco/consultas', () => ({ sitios: vi.fn(async () => []), redirecionamentos: vi.fn(async () => []), partesDoPacote: vi.fn(async () => []), grafiasDoPacote: vi.fn(async () => []), paresSugeridos: vi.fn(async () => []) }))
vi.mock('../pacote/local', () => ({ lerEstado: vi.fn(async () => ({ schema: 11 })) }))
vi.mock('../busca/consulta', async (original) => ({ ...(await original<typeof import('../busca/consulta')>()), buscar: vi.fn() }))

const achado = (numero: number, extra: Partial<ParagrafoAchado['trecho']> = {}): ParagrafoAchado => ({
  sigla: 'TESTEG',
  numero,
  rotulo: `TESTEG § ${numero}`,
  caminho: `/paragrafo/TESTEG/${numero}`,
  trechos: [`PA-TESTEG-§${numero}-txt-1`],
  publicacoes: ['TESTEG'],
  trecho: {
    id: `PA-TESTEG-§${numero}-txt-1`,
    nota: null,
    texto: `Um selo de prova do § ${numero}.`,
    lingua: 'pt-BR',
    recorte: [
      { texto: 'Um ', forte: false },
      { texto: 'selo', forte: true },
      { texto: ` de prova do § ${numero}.`, forte: false },
    ],
    ...extra,
  },
  trilha: ['I. Época de teste e imagens de prova', '1. Selos de prova da fase de teste'],
})

const resultado = (paragrafos: ParagrafoAchado[], extra: Partial<ResultadoDaBusca> = {}): ResultadoDaBusca => ({
  vazia: false,
  curta: false,
  verbetesRelacionados: [],
  objetos: [{ numero: 'F200001', itemId: 'TESTEG-0001a', origem: 'TESTEG: 1a', tipo: null, sitio: null, miniatura: null, display_mode: null }],
  numeros: ['F200001'],
  total: 1,
  totalSemFiltros: 1,
  contagens: { tudo: 1, texto: paragrafos.length, termo: 0, local: 0, bibliografia: 0, colecao: 0 },
  usuario: [],
  contagensDoUsuario: { tudo: 0, texto: 0, termo: 0, local: 0, bibliografia: 0, colecao: 0 },
  paragrafos,
  facetas: [],
  ...extra,
})

function Onde() {
  const { pathname, search } = useLocation()
  return <span data-testid="onde">{`${pathname}${search}`}</span>
}

function abrir(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/busca"
          element={
            <>
              <Busca />
              <Onde />
            </>
          }
        />
        <Route path="/paragrafo/:sigla/:numero" element={<Onde />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe.each([
  ['celular', 375],
  ['computador', 1280],
])('os §§ na Busca (%s)', (_, largura) => {
  const mock = vi.mocked(buscar)
  beforeEach(() => {
    mock.mockReset()
    instalarMatchMedia(largura)
  })
  afterAll(() => instalarMatchMedia(375))

  it('a aba «Texto» vem depois de «Tudo», com a contagem dos §§', async () => {
    mock.mockResolvedValue(resultado([achado(1), achado(2)]))
    abrir('/busca?q=selo')
    const texto = await screen.findByRole('button', { name: 'Texto, 2 §§' })
    const abas = within(screen.getByRole('group', { name: 'Escopo da busca' })).getAllByRole('button')
    expect(abas.map((a) => a.textContent)).toEqual(['Tudo1', 'Texto2', 'Termo0', 'Local0', 'Bibliografia0', 'Coleção0'])
    expect(abas[1]).toBe(texto)
  })

  it('«Tudo»: o bloco «Nos §§» com os 3 primeiros, o livro, o § e a nota, o recorte em destaque e o caminho; «Ver os 4 §§» vai à aba', async () => {
    mock.mockResolvedValue(resultado([achado(1), achado(2, { nota: 2, id: 'PA-TESTEG-§2-nota-2' }), achado(3), achado(4)]))
    abrir('/busca?q=selo')
    const bloco = await screen.findByRole('region', { name: 'Nos §§' })
    const linhas = within(bloco).getAllByRole('listitem')
    expect(linhas).toHaveLength(3)
    const [primeira, segunda] = linhas as [HTMLElement, HTMLElement]
    expect(within(primeira).getByRole('link')).toHaveAttribute('href', '/paragrafo/TESTEG/1')
    expect(primeira).toHaveTextContent('TESTEG')
    expect(primeira).toHaveTextContent('§ 1')
    expect(primeira.querySelector('strong')).toHaveTextContent(/^selo$/)
    expect(primeira).toHaveTextContent('I. Época de teste e imagens de prova › 1. Selos de prova da fase de teste')
    expect(primeira.querySelector('[lang="pt-BR"]')).toHaveTextContent('Um selo de prova do § 1.')
    expect(segunda).toHaveTextContent('nota 2')
    // o link leva o § e a nota no nome
    expect(within(segunda).getByRole('link')).toHaveAccessibleName(/^TESTEG § 2, nota 2/)
    // os objetos continuam embaixo
    expect(screen.getByRole('heading', { level: 2, name: '1 objeto' })).toBeInTheDocument()

    await userEvent.click(within(bloco).getByRole('button', { name: 'Ver os 4 §§' }))
    expect(screen.getByTestId('onde')).toHaveTextContent('/busca?q=selo&escopo=texto')
  })

  it('com até 3 §§, sem «Ver os N §§»; sem §§, sem o bloco', async () => {
    mock.mockResolvedValue(resultado([achado(1)]))
    abrir('/busca?q=selo')
    const bloco = await screen.findByRole('region', { name: 'Nos §§' })
    expect(within(bloco).queryByRole('button')).toBeNull()
    mock.mockResolvedValue(resultado([]))
  })

  it('a aba «Texto»: todos os §§, sem a grade de objetos', async () => {
    mock.mockResolvedValue(resultado([achado(1), achado(2), achado(3), achado(4)], { objetos: [], numeros: [], total: 0, totalSemFiltros: 0 }))
    abrir('/busca?q=selo&escopo=texto')
    const lista = await screen.findByRole('region', { name: '§§ achados' })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.queryByText(/Nada encontrado/)).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: /objeto/ })).toBeNull()
    await userEvent.click(within(lista).getAllByRole('link')[3]!)
    expect(screen.getByTestId('onde')).toHaveTextContent('/paragrafo/TESTEG/4')
  })

  it('a aba «Texto» sem §§: «Nada encontrado nos §§»', async () => {
    mock.mockResolvedValue(resultado([], { objetos: [], numeros: [], total: 0, totalSemFiltros: 0 }))
    abrir('/busca?q=selo&escopo=texto')
    expect(await screen.findByText('Nada encontrado nos §§ para «selo»')).toBeInTheDocument()
  })

  it('«Tudo» só com §§ (nenhum objeto): o bloco, sem «Nada encontrado»', async () => {
    mock.mockResolvedValue(resultado([achado(1)], { objetos: [], numeros: [], total: 0, totalSemFiltros: 0, contagens: { tudo: 0, texto: 1, termo: 0, local: 0, bibliografia: 0, colecao: 0 } }))
    abrir('/busca?q=selo')
    expect(await screen.findByRole('region', { name: 'Nos §§' })).toBeInTheDocument()
    expect(screen.queryByText(/Nada encontrado/)).toBeNull()
  })
})
