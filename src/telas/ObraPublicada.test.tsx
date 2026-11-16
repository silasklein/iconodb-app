/**
 * Parte 2C, bloco 3, Tarefa 14: a obra dos livros que veio de uma obra sua. No pacote sintético (pacote 10), a obra do usuário
 * `BIB-teste123-1` foi publicada como `BIB-900090` («Imaginária 2010»; `redirecionamento tipo 'obra'`, `criado` 1).
 * - A página do BIB-900090 tem o bloco «Esta obra veio de você», com «Excluir a sua obra» e «Restaurar» (decisões 50 e 51,
 *   como os verbetes e os sítios); uma obra que já era dos livros (BIB-900001) não tem.
 * - `/obra/BIB-teste123-1` (e `/editar`) vai para o BIB-900090, com o `?…` e a origem leve.
 * - A obra publicada continua editável (spec §5.2): a escrita vai para a origem (com várias, para o registro com o id do
 *   livro), e a página mostra a edição sobre o pacote.
 * - «‹ Revisão» (decisão 85; o parqueado da Tarefa 11): a obra aberta com a origem leve mostra o link de volta.
 * Só dados sintéticos TESTE.
 */
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { zerarSync } from '../../tests/suporte/syncSimulada'
import { ROTAS } from '../app/routes'
import { executar, usarMotor } from '../banco/cliente'
import { useOpcoesDeObra } from '../bibliografia/doUsuario'
import { editarObra } from '../bibliografia/operacoes'
import { CHAVE_DOS_NOMES, esquecerNomesGuardados } from '../excluidos/nomesGuardados'
import { gruposDeExcluidos } from '../excluidos/modelo'
import { redirecionamentosDoPacote } from '../pacote/redirecionamentos'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { gravarConfig } from '../usuario/diarioLocal'
import { estadoAtual, registrar } from '../usuario/estado'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

/** O CSL que o pacote publicou para o BIB-900090 (sem o `id`): o da obra de origem. */
const CSL = {
  type: 'book',
  author: [{ family: 'Imaginária', given: 'Cicrana' }],
  title: 'Selos sonhados no planalto fictício',
  'publisher-place': 'Cidade Fictícia',
  issued: { 'date-parts': [[2010]] },
  language: 'und',
}

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
  Element.prototype.scrollIntoView = vi.fn()
  await registrar('obra', 'BIB-teste123-1', 'criar', { csl: CSL, curta: 'Imaginária 2010' })
})
afterAll(() => usarMotor(null))
beforeEach(async () => {
  localStorage.clear()
  esquecerNomesGuardados()
  await gravarConfig(CHAVE_DOS_NOMES, undefined)
})
afterEach(() => {
  instalarMatchMedia(375)
  zerarSync()
})

const endereco = () => screen.getByTestId('endereco').textContent ?? ''
const estadoDaNavegacao = () => JSON.parse(screen.getByTestId('endereco').getAttribute('data-estado') ?? 'null') as unknown
const linhasDaLista = () => screen.getAllByRole('link').map((a) => a.getAttribute('href') ?? '').filter((h) => h.startsWith('/obra/') && !h.startsWith('/obra/nova'))
const excluida = (id: string) => estadoAtual().registro('obra', id)?.excluido ?? null
const titulo = (largura: number, nome: string | RegExp) => screen.findByRole('heading', { level: largura < 768 ? 1 : 2, name: nome })

describe.each([
  { largura: 375, nome: 'celular' },
  { largura: 1280, nome: 'computador' },
])('no $nome', ({ largura }) => {
  beforeEach(() => instalarMatchMedia(largura))

  it('a obra dos livros criada da sua: o bloco, a confirmação, a exclusão da origem, o aviso e Restaurar', async () => {
    const usuario = userEvent.setup()
    const r = renderizarRota('/obra/BIB-900090')
    await titulo(largura, 'Imaginária 2010')
    const bloco = await screen.findByRole('region', { name: 'Esta obra veio de você' })
    expect(within(bloco).getByText(/^Publicada a partir/)).toHaveTextContent(
      'Publicada a partir da sua obra «Imaginária 2010». Se você a excluir, ela sai dos livros na próxima importação.',
    )
    expect(within(bloco).getByText('SKC')).toBeInTheDocument()
    // Cancelar não exclui e devolve o foco ao botão
    await usuario.click(within(bloco).getByRole('button', { name: 'Excluir a sua obra' }))
    const confirmar = within(bloco).getByRole('group', { name: 'Excluir a sua obra «Imaginária 2010»?' })
    expect(confirmar).toHaveTextContent(
      'BIB-900090 fica reservado para ela. Nada se apaga: as citações ligadas a esta obra, os objetos que a citam e as notas ficam guardados, mas sem ela até você restaurar. Ao restaurar, ela volta com o mesmo BIB-900090 e tudo volta a se ligar a ela.',
    )
    expect(within(confirmar).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    await usuario.click(within(confirmar).getByRole('button', { name: 'Cancelar' }))
    expect(within(bloco).getByRole('button', { name: 'Excluir a sua obra' })).toHaveFocus()
    expect(excluida('BIB-teste123-1')).toBe(false)

    // Excluir: a origem é excluída (a marca de sempre, no registro da camada); a página continua, com o aviso e Restaurar
    await usuario.click(within(bloco).getByRole('button', { name: 'Excluir a sua obra' }))
    await usuario.click(within(screen.getByRole('group', { name: /Excluir a sua obra/ })).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(excluida('BIB-teste123-1')).toBe(true))
    expect(estadoAtual().registro('obra', 'BIB-900090')).toBeUndefined()
    await waitFor(() =>
      expect(within(bloco).getByRole('status')).toHaveTextContent('Você excluiu a sua obra «Imaginária 2010». Sai dos livros na próxima importação. Até lá, «Restaurar» fica aqui.'),
    )
    const restaurar = within(bloco).getByRole('button', { name: 'Restaurar' })
    expect(restaurar).toHaveFocus()
    expect(restaurar).toHaveAccessibleDescription(/Sai dos livros na próxima importação/)
    // excluída, a obra não se edita (como o verbete: a edição precisa de uma origem viva)
    expect(screen.queryByRole('link', { name: 'Editar a obra' })).toBeNull()

    // «Excluídos» diz o mesmo da origem publicada, com o texto da obra
    const [grupo] = gruposDeExcluidos(estadoAtual(), { redirecionamentos: await redirecionamentosDoPacote(), nomeNoLivro: () => null, agora: Date.now() })
    expect(grupo!.tipo).toBe('obra')
    expect(grupo!.linhas[0]).toMatchObject({
      id: 'BIB-teste123-1',
      nome: 'Imaginária 2010',
      publicado: true,
      numeroNosLivros: 'BIB-900090',
      confirmacao:
        'Restaurar a obra «Imaginária 2010»? Ela continua nos livros, com o mesmo BIB-900090, e as citações, os objetos e as notas ligados a ela voltam a se ligar a ela.',
    })
    expect(grupo!.linhas[0]!.onde).toContain('sai dos livros na próxima importação')

    // Restaurar desfaz
    await usuario.click(restaurar)
    await waitFor(() => expect(excluida('BIB-teste123-1')).toBe(false))
    expect(await within(bloco).findByRole('button', { name: 'Excluir a sua obra' })).toHaveFocus()
    expect(within(bloco).getByRole('status')).toHaveTextContent(/^$/)
    r.unmount()
  })

  it('a obra que já era dos livros não tem o bloco nem «Editar a obra»', async () => {
    const r = renderizarRota('/obra/BIB-900001')
    await titulo(largura, 'Autor 1999')
    await redirecionamentosDoPacote()
    await act(async () => {})
    expect(screen.queryByRole('region', { name: /veio de você/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Editar a obra' })).toBeNull()
    r.unmount()
  })

  it('o endereço da obra sua publicada vai para a obra dos livros, com o ?… e a origem leve', async () => {
    const voltar = { rotulo: 'Revisão', caminho: '/revisao?caso=x' }
    const r = render(
      <MemoryRouter initialEntries={[{ pathname: '/obra/BIB-teste123-1', search: '?ordem=ano', state: { voltar } }]}>
        <Routes>
          {ROTAS.map((x) => (
            <Route key={x.path} path={x.path} element={x.elemento} />
          ))}
        </Routes>
        <EnderecoComEstado />
      </MemoryRouter>,
    )
    await waitFor(() => expect(endereco()).toBe('/obra/BIB-900090?ordem=ano'))
    expect(estadoDaNavegacao()).toEqual({ voltar })
    await titulo(largura, 'Imaginária 2010')
    expect(await screen.findByRole('region', { name: 'Esta obra veio de você' })).toBeInTheDocument()
    // a página da obra sua não aparece (nem por um instante depois de ler os redirecionamentos)
    expect(screen.queryByText('Obra do SKC')).toBeNull()
    r.unmount()

    // «Editar a obra» pelo endereço antigo também
    const r2 = renderizarRota('/obra/BIB-teste123-1/editar')
    await waitFor(() => expect(endereco()).toBe('/obra/BIB-900090/editar'))
    expect(await screen.findByRole('heading', { level: 1, name: /^Editar a obra/ })).toBeInTheDocument()
    r2.unmount()
  })

  it('«‹ Revisão»: a obra aberta da Revisão (a origem leve) mostra o link que volta a ela', async () => {
    const voltar = { rotulo: 'Revisão', caminho: '/revisao?caso=citacao' }
    for (const id of ['BIB-900090', 'BIB-900001']) {
      const r = render(
        <MemoryRouter initialEntries={['/revisao?caso=citacao', { pathname: `/obra/${id}`, state: { voltar } }]} initialIndex={1}>
          <Routes>
            {ROTAS.filter((x) => x.path.startsWith('/obra/')).map((x) => (
              <Route key={x.path} path={x.path} element={x.elemento} />
            ))}
            <Route path="/revisao" element={<p>A Revisão</p>} />
          </Routes>
          <EnderecoComEstado />
        </MemoryRouter>,
      )
      await screen.findByRole('heading', { level: largura < 768 ? 1 : 2, name: id === 'BIB-900090' ? 'Imaginária 2010' : 'Autor 1999' })
      const volta = within(screen.getByRole('navigation', { name: 'Origem' })).getByRole('link', { name: 'Revisão' })
      expect(volta).toHaveTextContent(/^‹\s*Revisão$/)
      expect(volta).toHaveAttribute('href', '/revisao?caso=citacao')
      if (largura < 768) expect(screen.getByRole('link', { name: 'Voltar (Revisão)' })).toHaveAttribute('href', '#/revisao?caso=citacao')
      await userEvent.click(volta)
      await waitFor(() => expect(endereco()).toBe('/revisao?caso=citacao'))
      r.unmount()
    }
    // sem a origem (a Bibliografia, um link guardado), nada de «‹ …»
    const r = renderizarRota('/obra/BIB-900001')
    await titulo(largura, 'Autor 1999')
    expect(screen.queryByRole('navigation', { name: 'Origem' })).toBeNull()
    r.unmount()
  })
})

/** O endereço e o estado da navegação (como o de renderizarRota). */
function EnderecoComEstado() {
  const { pathname, search, state } = useLocation()
  return (
    <div data-testid="endereco" data-estado={JSON.stringify(state ?? null)}>
      {`${pathname}${search}`}
    </div>
  )
}

describe('a obra publicada continua editável', () => {
  beforeEach(() => instalarMatchMedia(375))

  it('uma origem: «Editar a obra» grava no registro dela; a página mostra a edição sobre o pacote, e sem «É esta»', async () => {
    const usuario = userEvent.setup()
    const r = renderizarRota('/obra/BIB-900090')
    await titulo(375, 'Imaginária 2010')
    // sem edição depois de publicada, a referência é a do pacote, sem nota
    expect(screen.queryByText(/As suas mudanças valem aqui/)).toBeNull()
    const editar = await screen.findByRole('link', { name: 'Editar a obra' })
    expect(editar).toHaveAttribute('href', '/obra/BIB-900090/editar')
    r.unmount()

    const r2 = renderizarRota('/obra/BIB-900090/editar')
    expect(await screen.findByRole('heading', { level: 1, name: /^Editar a obra/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Selos sonhados no planalto fictício')
    expect(screen.getByRole('textbox', { name: 'Citação curta' })).toHaveValue('Imaginária 2010')
    // a própria obra dos livros não é parecida dela mesma, e «É esta» não troca uma obra publicada
    expect(screen.queryByRole('button', { name: /^É esta/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Voltar à obra/ })).toHaveAttribute('href', '#/obra/BIB-900090')
    await usuario.clear(screen.getByRole('textbox', { name: 'Título' }))
    await usuario.type(screen.getByRole('textbox', { name: 'Título' }), 'Selos sonhados de novo')
    await usuario.click(screen.getByRole('button', { name: 'Salvar as mudanças' }))
    await waitFor(() => expect(endereco()).toBe('/obra/BIB-900090'))
    // a escrita foi para a origem (onde o user-import lê), e nada para o id do livro
    expect((estadoAtual().registro('obra', 'BIB-teste123-1')!.campos.csl as { title: string }).title).toBe('Selos sonhados de novo')
    expect(estadoAtual().historico('BIB-teste123-1', 'curta', 'obra')).toHaveLength(0)
    expect(estadoAtual().registro('obra', 'BIB-900090')).toBeUndefined()
    // a página mostra a edição, com a nota de que entra nos livros na próxima importação
    expect(await screen.findByText(/Selos sonhados de novo/)).toBeInTheDocument()
    expect(screen.getByText(/As suas mudanças valem aqui e entram nos livros na próxima importação/)).toBeInTheDocument()
    r2.unmount()

    // reabrir: continua
    const r3 = renderizarRota('/obra/BIB-900090')
    expect(await screen.findByText(/Selos sonhados de novo/)).toBeInTheDocument()
    r3.unmount()
    // volta ao que o pacote tem (para os outros testes)
    await registrar('obra', 'BIB-teste123-1', 'alterar', { csl: CSL })
  })

  it('a operação recusa uma obra dos livros que não veio de você', async () => {
    await expect(editarObra('BIB-900001', { type: 'book', title: 'Outra' }, '', { csl: { type: 'book', title: 'Achados' }, curta: 'Autor 1999' })).rejects.toThrow(/não veio de uma obra sua/)
    await expect(editarObra('BIB-900090', { type: 'book', title: 'Outra' }, '')).rejects.toThrow(/não veio de uma obra sua/)
    expect(estadoAtual().registro('obra', 'BIB-900001')).toBeUndefined()
  })

  it('fix round 1 (M2): com uma origem, a base é o que a página mostrava; voltar ao valor da origem é gravado', async () => {
    const usuario = userEvent.setup()
    // a escrita mais nova da citação curta está no registro do livro (de quando a obra tinha duas origens); a origem diz outra
    await registrar('obra', 'BIB-900090', 'alterar', { curta: 'Imaginária 2010x' })
    const r = renderizarRota('/obra/BIB-900090')
    expect(await screen.findByRole('heading', { level: 1, name: 'Imaginária 2010x' })).toBeInTheDocument()
    r.unmount()
    const r2 = renderizarRota('/obra/BIB-900090/editar')
    const curta = await screen.findByRole('textbox', { name: 'Citação curta' })
    expect(curta).toHaveValue('Imaginária 2010x')
    await usuario.clear(curta)
    await usuario.type(curta, 'Imaginária 2010')
    await usuario.click(screen.getByRole('button', { name: 'Salvar as mudanças' }))
    await waitFor(() => expect(endereco()).toBe('/obra/BIB-900090'))
    // gravado na origem (a escrita mais nova), embora seja o valor que a origem já tinha
    expect(estadoAtual().historico('BIB-teste123-1', 'curta', 'obra')).toHaveLength(1)
    // (o CSL também é gravado: o formulário não tem o `language` que só o fixture traz; N3)
    expect(await screen.findByRole('heading', { level: 1, name: 'Imaginária 2010' })).toBeInTheDocument()
    r2.unmount()
    // a operação: com `antes`, a base é ele também numa origem
    expect(await editarObra('BIB-teste123-1', CSL, 'Imaginária 2010', { csl: CSL, curta: 'Imaginária 2010x' })).not.toBeNull()
    expect(estadoAtual().historico('BIB-teste123-1', 'curta', 'obra')).toHaveLength(2)
  })

  it('fix round 1 (M3): a lista, o grupo por ano, o filtro e a escolha de obra mostram a edição na hora', async () => {
    const usuario = userEvent.setup()
    const revista = { ...CSL, title: 'Selos revistos de teste', issued: { 'date-parts': [[2011]] } }
    await registrar('obra', 'BIB-teste123-1', 'alterar', { csl: revista, curta: 'Imaginária 2011' })
    try {
      const r = renderizarRota('/bibliografia?ordem=ano')
      const grupo = await screen.findByRole('region', { name: 'Obras de 2011' })
      const linha = within(grupo).getByRole('link', { name: /Imaginária 2011/ })
      expect(linha).toHaveAttribute('href', '/obra/BIB-900090?ordem=ano')
      expect(linha).toHaveTextContent('Selos revistos de teste')
      expect(screen.queryByRole('region', { name: 'Obras de 2010' })).toBeNull()
      expect(screen.queryByText('Imaginária 2010')).toBeNull()
      await usuario.type(screen.getByRole('searchbox', { name: 'Buscar na bibliografia' }), 'revistos')
      await waitFor(() => expect(linhasDaLista()).toEqual(['/obra/BIB-900090?ordem=ano']))
      r.unmount()

      // a escolha de obra dos objetos SKC (e a busca de «Ligar» e as parecidas, que leem a mesma lista)
      const { result, unmount } = renderHook(() => useOpcoesDeObra())
      await waitFor(() => expect(result.current.find((o) => o.id === 'BIB-900090')).toMatchObject({ rotulo: 'Imaginária 2011', apoio: 'Selos revistos de teste' }))
      unmount()

      // com a origem excluída, a edição não vale (a obra sai dos livros com o que o pacote tem)
      await registrar('obra', 'BIB-teste123-1', 'excluir')
      const h = renderHook(() => useOpcoesDeObra())
      await waitFor(() => expect(h.result.current.find((o) => o.id === 'BIB-900090')).toMatchObject({ rotulo: 'Imaginária 2010' }))
      h.unmount()
      await registrar('obra', 'BIB-teste123-1', 'restaurar')
    } finally {
      await registrar('obra', 'BIB-teste123-1', 'alterar', { csl: CSL, curta: 'Imaginária 2010' })
    }
  })
})

describe('duas origens criaram a mesma obra', () => {
  beforeEach(() => instalarMatchMedia(375))

  it('o bloco no plural («Excluir as suas 2 obras»); a edição vai para o registro com o id do livro', async () => {
    await registrar('obra', 'BIB-eeeeeeee-1', 'criar', { csl: CSL, curta: 'Imaginária 2010' })
    usarMotor(await bancoDeTeste({ escrita: true }))
    try {
      await executar(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('BIB-eeeeeeee-1', 'BIB-900090', 'obra', 1)`)
      const usuario = userEvent.setup()
      const r = renderizarRota('/obra/BIB-900090')
      const bloco = await screen.findByRole('region', { name: 'Esta obra veio de você' })
      await within(bloco).findByText(/2 obras suas/)
      expect(within(bloco).getByText(/^Publicada a partir/)).toHaveTextContent(
        'Publicada a partir de 2 obras suas («Imaginária 2010»). Se você as excluir, ela sai dos livros na próxima importação.',
      )
      await usuario.click(within(bloco).getByRole('button', { name: 'Excluir as suas 2 obras' }))
      const confirmar = within(bloco).getByRole('group', { name: 'Excluir as suas 2 obras?' })
      expect(confirmar.textContent).toMatch(/^As 2 obras suas \(«Imaginária 2010»\) são excluídas juntas: enquanto uma delas existir, esta obra continua nos livros\. BIB-900090 fica reservado para ela\./)
      await usuario.click(within(confirmar).getByRole('button', { name: 'Cancelar' }))

      // a edição: com duas origens, no registro com o id do livro (o que o user-import lê junto com a que a criou)
      await usuario.click(screen.getByRole('link', { name: 'Editar a obra' }))
      expect(await screen.findByRole('heading', { level: 1, name: /^Editar a obra/ })).toBeInTheDocument()
      await usuario.clear(screen.getByRole('textbox', { name: 'Citação curta' }))
      await usuario.type(screen.getByRole('textbox', { name: 'Citação curta' }), 'Imaginária 2010a')
      const naOrigem = estadoAtual().historico('BIB-teste123-1', 'curta', 'obra').length
      await usuario.click(screen.getByRole('button', { name: 'Salvar as mudanças' }))
      await waitFor(() => expect(endereco()).toBe('/obra/BIB-900090'))
      expect(estadoAtual().registro('obra', 'BIB-900090')!.campos).toMatchObject({ curta: 'Imaginária 2010a' })
      expect(estadoAtual().historico('BIB-teste123-1', 'curta', 'obra')).toHaveLength(naOrigem)
      expect(estadoAtual().historico('BIB-eeeeeeee-1', 'curta', 'obra')).toHaveLength(0)
      // a página mostra a citação curta nova (a escrita mais nova da camada vale sobre o pacote)
      expect(await screen.findByRole('heading', { level: 1, name: 'Imaginária 2010a' })).toBeInTheDocument()
      r.unmount()
    } finally {
      await registrar('obra', 'BIB-900090', 'excluir', {})
      await registrar('obra', 'BIB-eeeeeeee-1', 'excluir', {})
      usarMotor(await bancoDeTeste())
    }
  })
})
