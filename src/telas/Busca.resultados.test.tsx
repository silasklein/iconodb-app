import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { vi } from 'vitest'
import type { ObjetoResumo, Verbete } from '../banco/tipos'
import { buscar, type ResultadoDaBusca } from '../busca/consulta'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Busca } from './Busca'

/**
 * A tela Busca com resultados. A busca em si (SQL, FTS5, dobra) é testada em
 * busca/consulta.test.ts sobre o pacote sintético; aqui `buscar` é simulada para
 * olhar só a tela: verbete em destaque, abas, etiquetas, sem resultado, filtros, estado do roteador.
 */
vi.mock('../busca/consulta', async (original) => ({ ...(await original<typeof import('../busca/consulta')>()), buscar: vi.fn() }))

describe('tela Busca: resultados', () => {
  const objeto = (numero: string, extra: Partial<ObjetoResumo> = {}): ObjetoResumo => ({
    numero,
    itemId: `TESTE-${numero}`,
    origem: 'TESTE I, 1',
    tipo: 'Selo de teste',
    sitio: 'Tell Probe Teste',
    miniatura: null,
    display_mode: null,
    ...extra,
  })
  const resultado = (extra: Partial<ResultadoDaBusca> = {}): ResultadoDaBusca => ({
    vazia: false,
    verbetesRelacionados: [],
    objetos: [objeto('CA00001'), objeto('CA00002'), objeto('BA00001', { tipo: null, sitio: null })],
    numeros: ['CA00001', 'CA00002', 'BA00001'],
    total: 3,
    totalSemFiltros: 3,
    contagens: { tudo: 3, termo: 2, local: 0, bibliografia: 1, colecao: 0 },
    facetas: [
      { chave: 'publicacao', rotulo: 'Publicação', opcoes: [{ valor: 'TESTE', rotulo: 'TESTE I', n: 3, ativa: false }] },
      {
        chave: 'nivel',
        rotulo: 'Nível',
        opcoes: [
          { valor: 'iconographic', rotulo: 'iconográfico', n: 2, ativa: false },
          { valor: 'iconological', rotulo: 'iconológico', n: 1, ativa: false },
        ],
      },
    ],
    ...extra,
  })
  const verbeteDe = (extra: Partial<Verbete> = {}) =>
    ({ id: 'GL-900001', tipo: 'concept', pt: 'leão-de-teste', de: 'Testlöwe', en: 'test lion', status: 'proposed', pai: { id: 'GL-900009', pt: 'felino de teste' }, iconclass: [], sssl: [], hipoteses: [{}, {}], objetos: [{}, {}], ...extra }) as Verbete

  const mock = vi.mocked(buscar)
  beforeEach(() => mock.mockReset())

  function abrirComRota(url: string) {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/busca" element={<Busca />} />
          <Route path="/item/:id" element={<ItemDeProva />} />
        </Routes>
      </MemoryRouter>,
    )
  }
  function ItemDeProva() {
    const { state, pathname } = useLocation()
    return <pre data-testid="item">{JSON.stringify({ pathname, state })}</pre>
  }

  it('mostra a contagem, a grade de objetos e o verbete em destaque', async () => {
    mock.mockResolvedValue(resultado({ verbeteDestaque: verbeteDe(), verbetesRelacionados: [{ id: 'GL-900007', rotulo: 'filhote de leão-de-teste' }] }))
    abrirComRota('/busca?q=leao')
    expect(await screen.findByRole('heading', { level: 2, name: '3 objetos' })).toBeInTheDocument()
    const verbete = screen.getByRole('region', { name: 'Verbete correspondente' })
    expect(within(verbete).getByRole('heading', { name: 'leão-de-teste' })).toBeInTheDocument()
    expect(within(verbete).getByText('Verbete · conceito · a revisar')).toBeInTheDocument()
    expect(within(verbete).getByText('2 objetos com 2 hipóteses')).toBeInTheDocument()
    expect(within(verbete).getByRole('link', { name: 'Abrir verbete' })).toHaveAttribute('href', '/verbete/GL-900001')
    expect(within(verbete).getByRole('link', { name: 'felino de teste' })).toHaveAttribute('href', '/verbete/GL-900009')
    expect(screen.getByRole('link', { name: 'filhote de leão-de-teste' })).toHaveAttribute('href', '/verbete/GL-900007')
    expect(screen.getByRole('link', { name: /CA00001/ })).toHaveAttribute('href', '/item/CA00001')
    expect(mock).toHaveBeenCalledWith('leao', expect.objectContaining({ escopo: 'tudo', filtros: {} }))
  })

  it('abrir um resultado leva ao item com a lista ordenada dos números no estado do roteador', async () => {
    mock.mockResolvedValue(resultado())
    abrirComRota('/busca?q=leao&escopo=termo')
    await userEvent.click(await screen.findByRole('link', { name: /CA00002/ }))
    const { pathname, state } = JSON.parse(screen.getByTestId('item').textContent!)
    expect(pathname).toBe('/item/CA00002')
    expect(state).toEqual({
      contexto: { tipo: 'lista', ids: ['CA00001', 'CA00002', 'BA00001'] },
      origem: { rotulo: 'Busca', caminho: '/busca?q=leao&escopo=termo' },
    })
  })

  it('as abas são botões com a contagem de cada escopo e trocam o escopo', async () => {
    mock.mockResolvedValue(resultado())
    abrirComRota('/busca?q=leao')
    const termo = await screen.findByRole('button', { name: /^Termo/ })
    expect(termo).toHaveAccessibleName('Termo, 2 objetos')
    expect(screen.getByRole('button', { name: /^Tudo/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(termo)
    await waitFor(() => expect(mock).toHaveBeenLastCalledWith('leao', expect.objectContaining({ escopo: 'termo' })))
    expect(screen.getByRole('button', { name: /^Termo/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('filtros viram etiquetas removíveis, com "Limpar filtros"', async () => {
    mock.mockResolvedValue(
      resultado({
        total: 2,
        totalSemFiltros: 3,
        facetas: [{ chave: 'publicacao', rotulo: 'Publicação', opcoes: [{ valor: 'TESTE', rotulo: 'TESTE I', n: 2, ativa: true }] }],
      }),
    )
    abrirComRota('/busca?q=leao&publicacao=TESTE&nivel=iconographic')
    const tirar = await screen.findByRole('button', { name: 'Tirar o filtro Publicação: TESTE I' })
    expect(screen.getByRole('button', { name: 'Tirar o filtro Nível: iconographic' })).toBeInTheDocument()
    expect(screen.getByText('3 sem filtros')).toBeInTheDocument()

    await userEvent.click(tirar)
    await waitFor(() => expect(mock).toHaveBeenLastCalledWith('leao', expect.objectContaining({ filtros: { nivel: ['iconographic'] } })))

    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    await waitFor(() => expect(mock).toHaveBeenLastCalledWith('leao', expect.objectContaining({ filtros: {} })))
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument()
  })

  it('sem resultado: "Nada encontrado para «…»" e a sugestão de buscar em Tudo', async () => {
    mock.mockResolvedValue(resultado({ objetos: [], numeros: [], total: 0, totalSemFiltros: 0, contagens: { tudo: 4, termo: 0, local: 0, bibliografia: 0, colecao: 0 } }))
    abrirComRota('/busca?q=%20xyzzy%20&escopo=local')
    expect(await screen.findByText('Nada encontrado para «xyzzy»')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Buscar em Tudo' }))
    await waitFor(() => expect(mock).toHaveBeenLastCalledWith(' xyzzy ', expect.objectContaining({ escopo: 'tudo' })))
  })

  it('digitar busca depois de uma pequena espera; Esc limpa o campo', async () => {
    mock.mockResolvedValue(resultado())
    abrirComRota('/busca')
    const campo = screen.getByRole('searchbox', { name: 'Buscar' })
    await userEvent.type(campo, 'mahras')
    expect(mock).not.toHaveBeenCalled()
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1))
    expect(mock).toHaveBeenCalledWith('mahras', expect.anything())
    await userEvent.keyboard('{Escape}')
    expect(campo).toHaveValue('')
  })

  it('no celular os filtros abrem numa folha, que fecha com o botão e o foco volta', async () => {
    mock.mockResolvedValue(resultado())
    abrirComRota('/busca?q=leao')
    const abrir = await screen.findByRole('button', { name: /^Filtrar resultados/ })
    await userEvent.click(abrir)
    const folha = screen.getByRole('dialog', { name: 'Filtros' })
    await userEvent.click(within(folha).getByRole('checkbox', { name: /iconográfico/ }))
    await waitFor(() => expect(mock).toHaveBeenLastCalledWith('leao', expect.objectContaining({ filtros: { nivel: ['iconographic'] } })))
    await userEvent.click(within(folha).getByRole('button', { name: 'Fechar os filtros' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('no computador as facetas ficam à esquerda, com a contagem de cada valor', async () => {
    instalarMatchMedia(1280)
    mock.mockResolvedValue(resultado())
    abrirComRota('/busca?q=leao')
    const facetas = await screen.findByRole('complementary', { name: 'Filtros' })
    expect(within(facetas).getByRole('group', { name: 'Nível' })).toBeInTheDocument()
    expect(within(facetas).getByRole('checkbox', { name: /iconológico/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Filtrar resultados/ })).not.toBeInTheDocument()
    await userEvent.click(within(facetas).getByRole('checkbox', { name: /iconográfico/ }))
    await waitFor(() => expect(mock).toHaveBeenLastCalledWith('leao', expect.objectContaining({ filtros: { nivel: ['iconographic'] } })))
    instalarMatchMedia(375)
  })
})
