import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { grupo } from '../banco/consultas'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Grupo } from './Grupo'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

/** O item de mentira: mostra para onde se foi e com que estado, e volta no histórico. */
function Item() {
  const { pathname, state } = useLocation()
  const navegar = useNavigate()
  return (
    <>
      <pre data-testid="item">{JSON.stringify({ pathname, state })}</pre>
      <button type="button" onClick={() => void navegar(-1)}>
        Voltar no histórico
      </button>
    </>
  )
}

function Onde() {
  const { pathname, search } = useLocation()
  return <span data-testid="onde">{`${pathname}${search}`}</span>
}

function abrir(endereco = '/grupo/GR-TESTE-I-01') {
  return render(
    <MemoryRouter initialEntries={[endereco]}>
      <Routes>
        <Route
          path="/grupo/:id"
          element={
            <>
              <Grupo />
              <Onde />
            </>
          }
        />
        <Route path="/item/:id" element={<Item />} />
      </Routes>
    </MemoryRouter>,
  )
}

const lista = () => screen.getByRole('navigation', { name: 'Subcoleções' })
const grade = () => screen.getByRole('region', { name: /^Objetos / })
const cartoes = () => within(grade()).getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/item/'))

describe('GrupoDividido (o grupo com subcoleções no computador)', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterAll(() => usarMotor(null))
  beforeEach(() => instalarMatchMedia(1280))
  afterEach(() => instalarMatchMedia(375))

  it('à esquerda: a trilha, o período, o título, as contagens, «Ler a introdução» e a lista com «Todos» primeiro', async () => {
    abrir()
    const g = (await grupo('GR-TESTE-I-01'))!
    expect(await screen.findByRole('heading', { level: 1, name: `${g.numero}. ${g.titulo}` })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^1\. Animais de teste e figuras de prova$/) // decisão 81
    const trilha = screen.getByRole('link', { name: 'Coleções · TESTE I' }) // o «‹» fica fora do nome acessível
    expect(trilha).toHaveAttribute('href', '/colecoes?obra=TESTE-I')
    expect(trilha).toHaveTextContent(/^‹\s*Coleções · TESTE I$/)
    expect(screen.getByText(g.periodo!)).toHaveClass('grupo-dividido-periodo')
    expect(screen.getByText('3 objetos · 2 subcoleções')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ler a introdução' })).toHaveAttribute('aria-expanded', 'false')
    const linhas = within(lista()).getAllByRole('link')
    expect(linhas.map((a) => a.textContent)).toEqual(['TodosTodos os objetos do grupo3', '1.1Animais de prova1', '1.2–1.3Figuras de prova e sinais de teste1'])
    expect(linhas[0]).toHaveAccessibleName('Todos os objetos do grupo, 3 objetos')
    expect(linhas[2]).toHaveAccessibleName('1.2–1.3 Figuras de prova e sinais de teste, 1 objeto')
    expect(linhas[0]).toHaveAttribute('aria-current', 'true')
    expect(linhas[1]).not.toHaveAttribute('aria-current')
    // A tela do celular (contagens em quadro, a seção «Subcoleções») não aparece.
    expect(screen.queryByRole('group', { name: 'O que há no grupo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Subcoleções' })).not.toBeInTheDocument()
  })

  it('em «Todos», à direita: «Todos os objetos» e a grade do grupo', async () => {
    abrir()
    expect(await screen.findByRole('heading', { level: 2, name: 'Todos os objetos 3' })).toBeInTheDocument()
    expect(cartoes().map((a) => a.getAttribute('href'))).toEqual(['/item/CA00001', '/item/CA00002', '/item/CA00003'])
  })

  it('clicar «1.2–1.3» troca a grade sem trocar a rota e grava ?sub= (com replace)', async () => {
    abrir()
    await screen.findByRole('heading', { level: 1 })
    const linha = within(lista()).getByRole('link', { name: /^1\.2–1\.3 / })
    expect(linha).toHaveAttribute('href', '/grupo/GR-TESTE-I-01?sub=GR-TESTE-I-01-02')
    await userEvent.click(linha)
    expect(screen.getByTestId('onde')).toHaveTextContent('/grupo/GR-TESTE-I-01?sub=GR-TESTE-I-01-02')
    expect(linha).toHaveAttribute('aria-current', 'true')
    expect(within(lista()).getByRole('link', { name: /^Todos / })).not.toHaveAttribute('aria-current')
    // À direita: o número, o título, «1 objeto», a introdução dela e a grade dela.
    expect(await screen.findByRole('heading', { level: 2, name: 'Figuras de prova e sinais de teste' })).toBeInTheDocument()
    expect(screen.getByText('1.2–1.3', { selector: '.grupo-dividido-numero' })).toBeInTheDocument()
    expect(screen.getByText('1 objeto')).toBeInTheDocument()
    await waitFor(() => expect(cartoes().map((a) => a.getAttribute('href'))).toEqual(['/item/CA00002']))
    // O título da seção da esquerda continua o do grupo.
    expect(screen.getByRole('heading', { level: 1, name: '1. Animais de teste e figuras de prova' })).toBeInTheDocument()
  })

  it('a introdução da subcoleção abre à direita, os dois trechos', async () => {
    abrir('/grupo/GR-TESTE-I-01?sub=GR-TESTE-I-01-02')
    const direita = await screen.findByRole('region', { name: /^Objetos da subcoleção/ })
    const botao = await within(screen.getByRole('main')).findByRole('button', { name: 'Ler a introdução da subcoleção' })
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(botao)
    expect(botao).toHaveAttribute('aria-expanded', 'true')
    expect(botao).toHaveTextContent('Recolher a introdução')
    const intro = screen.getByRole('region', { name: 'Introdução da subcoleção' })
    expect(intro.querySelectorAll('p:not(.introducao-aviso)')).toHaveLength(2)
    expect(direita).toBeInTheDocument()
  })

  it('Tarefa 5 da leitura: «Ler no livro» do grupo, à esquerda, e o da subcoleção escolhida, à direita', async () => {
    abrir('/grupo/GR-TESTE-I-01?sub=GR-TESTE-I-01-02')
    const direita = await screen.findByRole('region', { name: /^Objetos da subcoleção/ })
    const daSub = await within(direita).findByRole('link', { name: 'Ler no livro: subcoleção 1.2–1.3' })
    expect(daSub).toHaveAttribute('href', '/ler/TESTE/trecho/PA-TESTE-I.S.10-ovw-2')
    expect(daSub).toHaveTextContent(/^Ler no livro$/)
    expect(within(direita).getByRole('button', { name: 'Ler a introdução da subcoleção' }).parentElement).toBe(daSub.parentElement)
    const doGrupo = await screen.findByRole('link', { name: 'Ler no livro' })
    expect(doGrupo).toHaveAttribute('href', '/ler/TESTE/trecho/PA-TESTE-I.S.9-ovw-1')
    expect(direita.contains(doGrupo)).toBe(false)
    expect(screen.getByRole('button', { name: 'Ler a introdução' }).parentElement).toBe(doGrupo.parentElement)
  })

  it('«Todos» volta aos 3 e tira o ?sub=', async () => {
    abrir('/grupo/GR-TESTE-I-01?sub=GR-TESTE-I-01-02')
    await waitFor(() => expect(cartoes()).toHaveLength(1))
    await userEvent.click(within(lista()).getByRole('link', { name: /^Todos / }))
    expect(screen.getByTestId('onde')).toHaveTextContent(/^\/grupo\/GR-TESTE-I-01$/)
    expect(await screen.findByRole('heading', { level: 2, name: 'Todos os objetos 3' })).toBeInTheDocument()
    expect(cartoes()).toHaveLength(3)
  })

  it('o cartão leva o contexto da subcoleção, com a volta para o grupo nela', async () => {
    abrir()
    await userEvent.click(await within(await screen.findByRole('navigation', { name: 'Subcoleções' })).findByRole('link', { name: /^1\.2–1\.3 / }))
    await waitFor(() => expect(cartoes()).toHaveLength(1))
    await userEvent.click(cartoes()[0]!)
    const { pathname, state } = JSON.parse(screen.getByTestId('item').textContent!)
    expect(pathname).toBe('/item/CA00002')
    expect(state).toEqual({
      contexto: { tipo: 'grupo', id: 'GR-TESTE-I-01-02' },
      origem: { rotulo: 'Figuras de prova e sinais de teste', caminho: '/grupo/GR-TESTE-I-01?sub=GR-TESTE-I-01-02', subcolecao: true },
    })
  })

  it('em «Todos», o cartão leva o contexto do grupo', async () => {
    abrir()
    await screen.findByRole('heading', { level: 2, name: 'Todos os objetos 3' })
    await userEvent.click(cartoes()[1]!)
    const { state } = JSON.parse(screen.getByTestId('item').textContent!)
    expect(state).toEqual({
      contexto: { tipo: 'grupo', id: 'GR-TESTE-I-01' },
      origem: { rotulo: '1. Animais de teste e figuras de prova', caminho: '/grupo/GR-TESTE-I-01' }, // decisão 81
    })
  })

  it('abrir com ?sub= abre nela; ir ao objeto e voltar mantém a subcoleção', async () => {
    abrir('/grupo/GR-TESTE-I-01?sub=GR-TESTE-I-01-01')
    expect(await screen.findByRole('heading', { level: 2, name: 'Animais de prova' })).toBeInTheDocument()
    expect(within(lista()).getByRole('link', { name: /^1\.1 / })).toHaveAttribute('aria-current', 'true')
    await waitFor(() => expect(cartoes().map((a) => a.getAttribute('href'))).toEqual(['/item/CA00001']))
    await userEvent.click(cartoes()[0]!)
    await userEvent.click(screen.getByRole('button', { name: 'Voltar no histórico' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Animais de prova' })).toBeInTheDocument()
    expect(screen.getByTestId('onde')).toHaveTextContent('/grupo/GR-TESTE-I-01?sub=GR-TESTE-I-01-01')
    expect(within(lista()).getByRole('link', { name: /^1\.1 / })).toHaveAttribute('aria-current', 'true')
  })

  it('«Ler a introdução» do grupo abre os trechos à esquerda', async () => {
    abrir()
    const g = (await grupo('GR-TESTE-I-01'))!
    await userEvent.click(await screen.findByRole('button', { name: 'Ler a introdução' }))
    const regiao = screen.getByRole('region', { name: 'Introdução do grupo' })
    expect(regiao).toHaveTextContent((g.introducao[0]!.texto ?? g.introducao[0]!.original).slice(0, 30))
    expect(screen.getByRole('button', { name: 'Recolher a introdução' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('anuncia ao leitor de tela o que a grade mostra', async () => {
    abrir()
    await screen.findByRole('heading', { level: 1 })
    await userEvent.click(within(lista()).getByRole('link', { name: /^1\.1 / }))
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('1.1 Animais de prova, 1 objeto')
  })
})
