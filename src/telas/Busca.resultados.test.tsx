import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { vi } from 'vitest'
import type { ObjetoResumo, Verbete } from '../banco/tipos'
import { buscar, type AcertoDoUsuario, type ResultadoDaBusca } from '../busca/consulta'
import { BarraSuperior } from '../ui/BarraSuperior'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Busca } from './Busca'
import css from './Busca.css?raw'

/**
 * A tela Busca com resultados. A busca em si (SQL, FTS5, dobra) é testada em
 * busca/consulta.test.ts sobre o pacote sintético; aqui `buscar` é simulada para
 * olhar só a tela: verbete em destaque, abas, etiquetas, sem resultado, filtros, estado do roteador.
 */
vi.mock('../banco/consultas', () => ({ sitios: vi.fn(async () => []), redirecionamentos: vi.fn(async () => []), partesDoPacote: vi.fn(async () => []), grafiasDoPacote: vi.fn(async () => []), paresSugeridos: vi.fn(async () => []) }))
vi.mock('../pacote/local', () => ({ lerEstado: vi.fn(async () => ({ schema: 5 })) }))
vi.mock('../busca/consulta', async (original) => ({ ...(await original<typeof import('../busca/consulta')>()), buscar: vi.fn() }))

describe('tela Busca: resultados', () => {
  const objeto = (numero: string, extra: Partial<ObjetoResumo> = {}): ObjetoResumo => ({
    numero,
    itemId: `TESTE-${numero}`,
    origem: 'TESTE I: 1',
    tipo: 'Selo de teste',
    sitio: 'Tell Probe Teste',
    miniatura: null,
    display_mode: null,
    ...extra,
  })
  const resultado = (extra: Partial<ResultadoDaBusca> = {}): ResultadoDaBusca => ({
    vazia: false,
    curta: false,
    verbetesRelacionados: [],
    objetos: [objeto('CA00001'), objeto('CA00002'), objeto('BA00001', { tipo: null, sitio: null })],
    numeros: ['CA00001', 'CA00002', 'BA00001'],
    total: 3,
    totalSemFiltros: 3,
    contagens: { tudo: 3, termo: 2, local: 0, bibliografia: 1, colecao: 0 },
    usuario: [],
    contagensDoUsuario: { tudo: 0, termo: 0, local: 0, bibliografia: 0, colecao: 0 },
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
  /** No computador o campo de busca é o da barra superior: a tela e a barra juntas. */
  function abrirComBarra(url: string) {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <BarraSuperior />
        <Routes>
          <Route path="/busca" element={<Busca />} />
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

  it('a contagem é anunciada numa região viva (role="status") que já existe antes do resultado', async () => {
    let entregar!: (r: ResultadoDaBusca) => void
    mock.mockImplementation(() => new Promise((ok) => (entregar = ok)))
    abrirComRota('/busca?q=leao')
    const vivas = () => screen.getAllByRole('status').filter((el) => el.hasAttribute('data-contagem'))
    await waitFor(() => expect(vivas()).toHaveLength(1))
    const viva = vivas()[0]!
    expect(viva).toHaveTextContent(/^$/)
    entregar(resultado())
    await waitFor(() => expect(viva).toHaveTextContent(/^3 objetos$/))
    expect(vivas()[0]).toBe(viva)
    // O beforeEach devolve o mock, que o Vitest chama ao fim: que ele não fique esperando para sempre.
    mock.mockResolvedValue(resultado())
  })

  it('abrir um resultado leva ao item com a lista ordenada dos números no estado do roteador', async () => {
    mock.mockResolvedValue(resultado())
    abrirComRota('/busca?q=leao&escopo=termo')
    await userEvent.click(await screen.findByRole('link', { name: /CA00002/ }))
    const { pathname, state } = JSON.parse(screen.getByTestId('item').textContent!)
    expect(pathname).toBe('/item/CA00002')
    expect(state).toEqual({
      contexto: { tipo: 'lista', ids: ['CA00001', 'CA00002', 'BA00001'] },
      inicio: 0,
      total: 3,
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
    const campo = screen.getByRole('combobox', { name: 'Buscar' })
    await userEvent.type(campo, 'mahtes')
    expect(mock).not.toHaveBeenCalled()
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1))
    expect(mock).toHaveBeenCalledWith('mahtes', expect.anything())
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

  it('T17-B-29: uma busca só com acertos do usuário (sem facetas) não deixa a coluna «Filtros» vazia: ela diz que não há o que filtrar', async () => {
    instalarMatchMedia(1280)
    mock.mockResolvedValue(resultado({ objetos: [], numeros: [], total: 0, totalSemFiltros: 0, facetas: [], usuario: [{ tipo: 'nota', ref: 'NT-aaaaaaaa-1', rotulo: 'uma nota', trecho: '', destino: '/nota/NT-aaaaaaaa-1' } as never], contagensDoUsuario: { tudo: 1, termo: 0, local: 0, bibliografia: 0, colecao: 0 } }))
    abrirComRota('/busca?q=nota')
    const facetas = await screen.findByRole('complementary', { name: 'Filtros' })
    expect(within(facetas).getByText('Não há o que filtrar nesta busca.')).toBeInTheDocument()
    expect(within(facetas).queryByRole('group')).toBeNull()
    instalarMatchMedia(375)
  })

  it('tocar numa aba logo depois de digitar não desfaz o que ainda não foi enviado (e vice-versa)', async () => {
    mock.mockResolvedValue(resultado())
    abrirComRota('/busca')
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar' }), 'ma')
    await userEvent.click(screen.getByRole('button', { name: 'Termo' })) // antes dos 250 ms de espera
    await waitFor(() => expect(mock).toHaveBeenLastCalledWith('ma', expect.objectContaining({ escopo: 'termo' })))
    // e a espera vencida depois não volta ao escopo antigo
    await new Promise((r) => setTimeout(r, 400))
    expect(mock).toHaveBeenLastCalledWith('ma', expect.objectContaining({ escopo: 'termo' }))
    expect(screen.getByRole('button', { name: /^Termo/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('tocar num filtro logo depois de digitar mantém o filtro', async () => {
    instalarMatchMedia(1280)
    mock.mockResolvedValue(resultado())
    abrirComBarra('/busca?q=leao')
    const facetas = await screen.findByRole('complementary', { name: 'Filtros' })
    expect(screen.getAllByRole('combobox', { name: 'Buscar' })).toHaveLength(1) // só o da barra
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar' }), 's')
    await userEvent.click(within(facetas).getByRole('checkbox', { name: /iconográfico/ }))
    await waitFor(() => expect(mock).toHaveBeenLastCalledWith('leaos', expect.objectContaining({ filtros: { nivel: ['iconographic'] } })))
    instalarMatchMedia(375)
  })

  it('enquanto o novo resultado carrega, o antigo fica inerte (não se abre um cartão que não é mais do resultado)', async () => {
    mock.mockResolvedValueOnce(resultado())
    abrirComRota('/busca?q=leao')
    await screen.findByRole('link', { name: /CA00001/ })
    let terminar: (r: ResultadoDaBusca) => void = () => {}
    mock.mockImplementationOnce(() => new Promise<ResultadoDaBusca>((ok) => (terminar = ok)))
    await userEvent.click(screen.getByRole('button', { name: /^Termo/ }))
    const grade = document.querySelector('.busca-grade')!
    await waitFor(() => expect(grade).toHaveAttribute('inert'))
    terminar(resultado({ total: 2, objetos: [objeto('CA00001'), objeto('CA00002')], numeros: ['CA00001', 'CA00002'] }))
    await waitFor(() => expect(document.querySelector('.busca-grade')).not.toHaveAttribute('inert'))
  })

  it('o estado para o item é calculado uma vez por resultado: todos os cartões levam o mesmo objeto', async () => {
    mock.mockResolvedValue(resultado())
    abrirComRota('/busca?q=leao')
    await screen.findByRole('link', { name: /CA00001/ })
    // (o estado de cada cartão é conferido em "abrir um resultado leva ao item…"; aqui, que abrir outro dá a mesma lista)
    await userEvent.click(screen.getByRole('link', { name: /BA00001/ }))
    expect(JSON.parse(screen.getByTestId('item').textContent!).state.contexto.ids).toEqual(['CA00001', 'CA00002', 'BA00001'])
  })

  it('alvos de toque de 44 px: botões de texto e abas têm min-height do token, sem o ::before de .hit nas abas', async () => {
    mock.mockResolvedValue(resultado())
    abrirComRota('/busca?q=leao')
    for (const aba of await screen.findAllByRole('button', { name: /objetos?$/ })) expect(aba).not.toHaveClass('hit')
    const bloco = (seletor: string) => css.slice(css.indexOf(`${seletor} {`)).split('}')[0]
    expect(bloco('.busca-link')).toMatch(/min-height:\s*var\(--alvo-toque\)/)
    expect(bloco('.busca-escopos button')).toMatch(/min-height:\s*var\(--alvo-toque\)/)
  })

  describe('"Mostrar mais"', () => {
    const parcial = (n: number) =>
      resultado({
        total: 5,
        objetos: ['CA00001', 'CA00002', 'CA00003', 'CA00004', 'BA00001'].slice(0, n).map((x) => objeto(x)),
        numeros: ['CA00001', 'CA00002', 'CA00003', 'CA00004', 'BA00001'],
      })

    async function abrirEFocar() {
      mock.mockResolvedValueOnce(parcial(2))
      abrirComRota('/busca?q=leao')
      const botao = await screen.findByRole('button', { name: /^Mostrar mais/ })
      botao.focus()
      expect(botao).toHaveFocus()
      return botao
    }

    it('só os cartões ficam inertes enquanto carrega: o botão continua com o foco', async () => {
      const botao = await abrirEFocar()
      let terminar: (r: ResultadoDaBusca) => void = () => {}
      mock.mockImplementationOnce(() => new Promise<ResultadoDaBusca>((ok) => (terminar = ok)))
      await userEvent.keyboard('{Enter}')
      await waitFor(() => expect(document.querySelector('.busca-grade')).toHaveAttribute('inert'))
      expect(botao).not.toHaveAttribute('inert')
      expect(botao.closest('[inert]')).toBeNull()
      expect(botao).toHaveFocus()
      terminar(parcial(4))
      await waitFor(() => expect(document.querySelector('.busca-grade')).not.toHaveAttribute('inert'))
      expect(screen.getByRole('button', { name: /^Mostrar mais/ })).toHaveFocus()
      expect(document.activeElement).not.toBe(document.body)
    })

    it('se o botão some (acabou a lista), o foco vai ao primeiro cartão novo, não ao body', async () => {
      await abrirEFocar()
      mock.mockResolvedValueOnce(parcial(5))
      await userEvent.keyboard('{Enter}')
      await waitFor(() => expect(screen.queryByRole('button', { name: /^Mostrar mais/ })).not.toBeInTheDocument())
      expect(document.activeElement).not.toBe(document.body)
      expect(document.activeElement).toBe(screen.getByRole('link', { name: /CA00003/ }))
    })
  })
  describe('acertos da camada do usuário (SKC) que não são de um objeto', () => {
    const acerto = (extra: Partial<AcertoDoUsuario> & Pick<AcertoDoUsuario, 'tipo' | 'ref' | 'rotulo'>): AcertoDoUsuario => ({ skc: true, objeto: null, ...extra })
    const soUsuario = (usuario: AcertoDoUsuario[], extra: Partial<ResultadoDaBusca> = {}) =>
      resultado({
        objetos: [],
        numeros: [],
        total: 0,
        totalSemFiltros: 0,
        contagens: { tudo: 0, termo: 0, local: 0, bibliografia: 0, colecao: 0 },
        usuario,
        contagensDoUsuario: { tudo: usuario.length, termo: 0, local: 0, bibliografia: 0, colecao: 0 },
        ...extra,
      })

    it('só acertos do usuário não é "Nada encontrado": mostra o grupo "Na sua camada (SKC)" com rótulo, tipo e marca', async () => {
      mock.mockResolvedValue(
        soUsuario([
          acerto({ tipo: 'nota', ref: 'NT-a-1', rotulo: 'Sobre o sítio' }),
          acerto({ tipo: 'colecao', ref: 'CO-a-1', rotulo: 'Minhas notas de leão' }),
          acerto({ tipo: 'sitio', ref: 'SI-a-1', rotulo: 'Tell Novo' }),
          acerto({ tipo: 'hipotese', ref: 'HY-a-1', rotulo: 'íbex' }),
        ]),
      )
      abrirComRota('/busca?q=leao')
      const grupo = await screen.findByRole('region', { name: 'Na sua camada (SKC)' })
      expect(screen.queryByText(/Nada encontrado/)).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: /objeto/ })).not.toBeInTheDocument()
      const linhas = within(grupo).getAllByRole('listitem')
      expect(linhas).toHaveLength(4)
      expect(linhas[0]).toHaveTextContent('Sobre o sítio')
      expect(linhas[0]).toHaveTextContent('Nota')
      expect(linhas[0]).toHaveTextContent('SKC')
      expect(linhas[1]).toHaveTextContent('Coleção')
      expect(linhas[2]).toHaveTextContent('Sítio')
      expect(linhas[3]).toHaveTextContent('Hipótese')
      // a nota, a coleção e o sítio têm tela (Tarefa 12); a hipótese ainda é texto, sem link
      expect(within(grupo).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/nota/NT-a-1', '/grupo/CO-a-1', '/sitio/SI-a-1'])
      // a região viva anuncia
      await waitFor(() => expect(document.querySelector('[data-contagem]')).toHaveTextContent('4 acertos na sua camada'))
    })

    it('com objetos e acertos soltos: a grade e o grupo, um depois do outro', async () => {
      mock.mockResolvedValue(resultado({ usuario: [acerto({ tipo: 'nota', ref: 'NT-a-1', rotulo: 'Uma nota solta' })] }))
      abrirComRota('/busca?q=leao')
      expect(await screen.findByRole('heading', { level: 2, name: '3 objetos' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /CA00001/ })).toBeInTheDocument()
      const grupo = screen.getByRole('region', { name: 'Na sua camada (SKC)' })
      expect(within(grupo).getByText('Uma nota solta')).toBeInTheDocument()
      await waitFor(() => expect(document.querySelector('[data-contagem]')).toHaveTextContent('3 objetos e 1 acerto na sua camada'))
    })

    it('onde existe uma rota para o tipo, o rótulo é um link: a nota abre na tela da nota, o sítio na página do sítio; sem rota, texto', async () => {
      mock.mockResolvedValue(soUsuario([acerto({ tipo: 'nota', ref: 'NT-a-1', rotulo: 'Sobre o sítio' }), acerto({ tipo: 'sitio', ref: 'SI-a-1', rotulo: 'Tell Novo' }), acerto({ tipo: 'hipotese', ref: 'HY-a-1', rotulo: 'íbex' })]))
      abrirComRota('/busca?q=leao')
      const grupo = await screen.findByRole('region', { name: 'Na sua camada (SKC)' })
      expect(within(grupo).getByRole('link', { name: 'Sobre o sítio' })).toHaveAttribute('href', '/nota/NT-a-1')
      expect(within(grupo).getByRole('link', { name: 'Tell Novo' })).toHaveAttribute('href', '/sitio/SI-a-1')
      expect(within(grupo).queryByRole('link', { name: 'íbex' })).not.toBeInTheDocument()
    })

    it('as abas somam os acertos do usuário à contagem e dizem isso ao leitor de tela', async () => {
      mock.mockResolvedValue(
        resultado({
          usuario: [acerto({ tipo: 'colecao', ref: 'CO-a-1', rotulo: 'Minhas notas' })],
          contagensDoUsuario: { tudo: 1, termo: 0, local: 0, bibliografia: 0, colecao: 1 },
        }),
      )
      abrirComRota('/busca?q=leao')
      expect(await screen.findByRole('button', { name: /^Coleção/ })).toHaveAccessibleName('Coleção, 1 acerto na sua camada')
      expect(screen.getByRole('button', { name: /^Tudo/ })).toHaveAccessibleName('Tudo, 3 objetos e 1 acerto na sua camada')
      expect(screen.getByRole('button', { name: /^Termo/ })).toHaveAccessibleName('Termo, 2 objetos')
      expect(screen.getByRole('button', { name: /^Tudo/ })).toHaveTextContent('4')
    })

    it('"Nada encontrado" sugere Tudo também quando o que há lá é da camada do usuário', async () => {
      mock.mockResolvedValue(soUsuario([], { contagensDoUsuario: { tudo: 2, termo: 0, local: 0, bibliografia: 0, colecao: 0 } }))
      abrirComRota('/busca?q=leao&escopo=termo')
      expect(await screen.findByText('Nada encontrado para «leao»')).toBeInTheDocument()
      expect(screen.getByText(/Em «Tudo» há 2 acertos na sua camada/)).toBeInTheDocument()
    })

    it('o cartão de um objeto SKC leva a marca SKC e abre /item/<número>', async () => {
      mock.mockResolvedValue(resultado({ objetos: [objeto('CA00005', { skc: true, itemId: 'OB-a-1' })], numeros: ['CA00005'], total: 1, totalSemFiltros: 1 }))
      abrirComRota('/busca?q=leao')
      const cartao = await screen.findByRole('link', { name: /CA00005/ })
      expect(cartao).toHaveTextContent('CA00005 · SKC')
      expect(cartao).toHaveAttribute('href', '/item/CA00005')
    })
  })
})
