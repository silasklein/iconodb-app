import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Grupo } from './Grupo'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

function Item() {
  const { pathname, state } = useLocation()
  return <pre data-testid="item">{JSON.stringify({ pathname, state })}</pre>
}

function Onde() {
  const { pathname } = useLocation()
  return <span data-testid="onde">{pathname}</span>
}

function abrir(id = 'GR-TESTE-I-01-02', antes: string[] = []) {
  return render(
    <MemoryRouter initialEntries={[...antes, `/grupo/${id}`]} initialIndex={antes.length}>
      <Routes>
        <Route path="/colecoes" element={<h1>Coleções</h1>} />
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

describe('Subcolecao', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterAll(() => usarMotor(null))
  afterEach(() => instalarMatchMedia(375))

  it('o link de volta leva ao grupo de cima, com o título dele e o número do livro (decisão 81)', async () => {
    abrir()
    expect(await screen.findByRole('heading', { level: 1, name: 'Figuras de prova e sinais de teste' })).toBeInTheDocument()
    // o «‹» se vê, mas fica fora do nome acessível
    const volta = screen.getByRole('link', { name: '1. Animais de teste e figuras de prova' })
    expect(volta).toHaveTextContent(/^‹\s*1\. Animais de teste e figuras de prova$/)
    expect(volta.querySelector('[aria-hidden="true"]')).toHaveTextContent('‹')
    expect(volta).toHaveAttribute('href', '/grupo/GR-TESTE-I-01')
    // o título da subcoleção não muda: o número dela fica à parte, no rótulo
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Figuras de prova e sinais de teste$/)
    // A tela da subcoleção não é a do grupo: nem contagens nem a lista de subcoleções.
    expect(screen.queryByRole('group', { name: 'O que há no grupo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Subcoleções' })).not.toBeInTheDocument()
  })

  it('o rótulo: a obra, o período e o número', async () => {
    abrir()
    await screen.findByRole('heading', { level: 1 })
    const rotulo = screen.getByText('TESTE I · Calcolítico (fase de teste) · 1.2–1.3')
    expect(rotulo).toHaveClass('subcolecao-etiqueta')
  })

  it('«1 objeto · subcoleção 2 de 2»', async () => {
    abrir()
    expect(await screen.findByText('1 objeto · subcoleção 2 de 2')).toBeInTheDocument()
  })

  it('a caixa da introdução: o rótulo, o primeiro trecho e, depois de «Ler a introdução», os dois parágrafos', async () => {
    abrir()
    const caixa = await screen.findByRole('region', { name: 'Introdução · o texto do autor sobre 1.2–1.3' })
    expect(within(caixa).getByText('Introdução · o texto do autor sobre 1.2–1.3')).toBeInTheDocument()
    expect(caixa.querySelectorAll('p[lang]')).toHaveLength(1)
    expect(caixa).toHaveTextContent('Figuras de prova')
    expect(caixa).not.toHaveTextContent('sinal de teste')
    const botao = within(caixa).getByRole('button', { name: 'Ler a introdução' })
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(botao)
    const paragrafos = caixa.querySelectorAll('p[lang]')
    expect(paragrafos).toHaveLength(2)
    expect(paragrafos[0]).toHaveTextContent('Figuras de prova')
    expect(paragrafos[1]).toHaveTextContent('sinal de teste')
    expect(botao).toHaveAccessibleName('Recolher a introdução')
    expect(botao).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(botao)
    expect(caixa.querySelectorAll('p[lang]')).toHaveLength(1)
  })

  it('Tarefa 5 da leitura: na caixa da introdução, «Ler no livro» ao lado de «Ler a introdução» abre o 1º passo da subcoleção', async () => {
    abrir()
    const caixa = await screen.findByRole('region', { name: 'Introdução · o texto do autor sobre 1.2–1.3' })
    const ler = await within(caixa).findByRole('link', { name: 'Ler no livro' })
    expect(ler).toHaveAttribute('href', '/ler/TESTE/trecho/PA-TESTE-I.S.10-ovw-2')
    expect(within(caixa).getByRole('button', { name: 'Ler a introdução' }).parentElement).toBe(ler.parentElement)
  })

  it('«Objetos» e a contagem; o cartão leva a subcoleção como contexto e a origem marcada', async () => {
    abrir()
    expect(await screen.findByRole('heading', { level: 2, name: 'Objetos 1' })).toBeInTheDocument()
    const grade = screen.getByRole('region', { name: 'Objetos da subcoleção' })
    const links = within(grade).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/item/CA00002'])
    await userEvent.click(links[0]!)
    const { pathname, state } = JSON.parse(screen.getByTestId('item').textContent!)
    expect(pathname).toBe('/item/CA00002')
    expect(state.contexto).toEqual({ tipo: 'grupo', id: 'GR-TESTE-I-01-02' })
    expect(state.origem).toEqual({ rotulo: 'Figuras de prova e sinais de teste', caminho: '/grupo/GR-TESTE-I-01-02', subcolecao: true })
  })

  it('«← 1.1 Animais de prova» leva à anterior; na 2 de 2 não há «→»', async () => {
    abrir()
    await screen.findByRole('heading', { level: 1 })
    const anterior = screen.getByRole('link', { name: 'Subcoleção anterior: 1.1 Animais de prova' })
    expect(anterior).toHaveTextContent('← 1.1 Animais de prova')
    expect(anterior).toHaveAttribute('href', '/grupo/GR-TESTE-I-01-01')
    expect(screen.queryByRole('link', { name: /^Próxima subcoleção/ })).not.toBeInTheDocument()
    await userEvent.click(anterior)
    expect(await screen.findByRole('heading', { level: 1, name: 'Animais de prova' })).toBeInTheDocument()
    expect(screen.getByTestId('onde')).toHaveTextContent('/grupo/GR-TESTE-I-01-01')
  })

  it('na 1.1, só o «→», para a 1.2–1.3, e a introdução de um trecho', async () => {
    abrir('GR-TESTE-I-01-01')
    expect(await screen.findByText('1 objeto · subcoleção 1 de 2')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Subcoleção anterior/ })).not.toBeInTheDocument()
    const proxima = screen.getByRole('link', { name: 'Próxima subcoleção: 1.2–1.3 Figuras de prova e sinais de teste' })
    expect(proxima).toHaveTextContent('1.2–1.3 Figuras de prova e sinais de teste →')
    expect(proxima).toHaveAttribute('href', '/grupo/GR-TESTE-I-01-02')
    const caixa = screen.getByRole('region', { name: 'Introdução · o texto do autor sobre 1.1' })
    await userEvent.click(within(caixa).getByRole('button', { name: 'Ler a introdução' }))
    expect(caixa.querySelectorAll('p[lang]')).toHaveLength(1)
  })

  it('as notas da subcoleção ficam na página, como no grupo', async () => {
    abrir()
    await screen.findByRole('heading', { level: 1 })
    expect(await screen.findByRole('region', { name: 'Notas SKC' })).toBeInTheDocument()
  })

  it('a página tem o landmark <main>, com o título dentro e as vizinhas fora', async () => {
    abrir()
    const main = await screen.findByRole('main')
    expect(within(main).getByRole('heading', { level: 1, name: 'Figuras de prova e sinais de teste' })).toBeInTheDocument()
    expect(within(main).getByRole('region', { name: 'Objetos da subcoleção' })).toBeInTheDocument()
    expect(main).not.toContainElement(screen.getByRole('navigation', { name: 'Subcoleções vizinhas' }))
  })

  it('vinda do grupo, o «‹» volta no histórico: o «Voltar às coleções» do grupo chega às Coleções (sem laço)', async () => {
    abrir('GR-TESTE-I-01', ['/colecoes'])
    const secao = await screen.findByRole('region', { name: 'Subcoleções' })
    await userEvent.click(within(secao).getByRole('link', { name: /^1\.2–1\.3 / }))
    await userEvent.click(await screen.findByRole('link', { name: '1. Animais de teste e figuras de prova' }))
    expect(await screen.findByRole('group', { name: 'O que há no grupo' })).toBeInTheDocument()
    expect(screen.getByTestId('onde')).toHaveTextContent('/grupo/GR-TESTE-I-01')
    await userEvent.click(screen.getByRole('link', { name: 'Voltar às coleções' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Coleções' })).toBeInTheDocument()
  })

  it('andando pelas vizinhas, o «‹» volta todos os passos até o grupo, e dali às Coleções', async () => {
    abrir('GR-TESTE-I-01', ['/colecoes'])
    const secao = await screen.findByRole('region', { name: 'Subcoleções' })
    await userEvent.click(within(secao).getByRole('link', { name: /^1\.2–1\.3 / }))
    await userEvent.click(await screen.findByRole('link', { name: 'Subcoleção anterior: 1.1 Animais de prova' }))
    await userEvent.click(await screen.findByRole('link', { name: 'Próxima subcoleção: 1.2–1.3 Figuras de prova e sinais de teste' }))
    await screen.findByText('1 objeto · subcoleção 2 de 2')
    await userEvent.click(screen.getByRole('link', { name: '1. Animais de teste e figuras de prova' }))
    expect(await screen.findByRole('group', { name: 'O que há no grupo' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Voltar às coleções' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Coleções' })).toBeInTheDocument()
  })

  it('sem ter vindo do grupo (link direto), o «‹» empilha o grupo, e o voltar dele torna à subcoleção', async () => {
    abrir('GR-TESTE-I-01-02', ['/colecoes'])
    await userEvent.click(await screen.findByRole('link', { name: '1. Animais de teste e figuras de prova' }))
    expect(await screen.findByRole('group', { name: 'O que há no grupo' })).toBeInTheDocument()
    expect(screen.getByTestId('onde')).toHaveTextContent('/grupo/GR-TESTE-I-01')
    await userEvent.click(screen.getByRole('link', { name: 'Voltar às coleções' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Figuras de prova e sinais de teste' })).toBeInTheDocument()
  })

  it('um grupo de cima continua na tela do grupo', async () => {
    abrir('GR-TESTE-I-01')
    expect(await screen.findByRole('group', { name: 'O que há no grupo' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Subcoleção anterior/ })).not.toBeInTheDocument()
  })
})

describe('Subcolecao: a introdução sem tradução (banco mudado no teste)', () => {
  beforeEach(async () => usarMotor(await bancoDeTeste({ escrita: true })))
  afterAll(() => usarMotor(null))

  it('com um trecho sem tradução, o aviso de parte sem tradução e esse trecho no original, em alemão', async () => {
    await executar("DELETE FROM pub_TESTE.unit_pt_render WHERE unit_id = 'PA-TESTE-I.S.11-ovw-1'")
    abrir()
    const caixa = await screen.findByRole('region', { name: 'Introdução · o texto do autor sobre 1.2–1.3' })
    expect(within(caixa).queryByText(/sem tradução/)).not.toBeInTheDocument()
    await userEvent.click(within(caixa).getByRole('button', { name: 'Ler a introdução' }))
    expect(within(caixa).getByText('Parte da introdução ainda sem tradução: esses trechos vão no original, em alemão.')).toBeInTheDocument()
    const trechos = [...caixa.querySelectorAll('p[lang]')]
    expect(trechos.map((p) => p.getAttribute('lang'))).toEqual(['pt-BR', 'de'])
    expect(trechos[1]!.textContent!.length).toBeGreaterThan(0)
  })

  it('sem tradução nenhuma, o resumo vai em alemão e, aberta, o aviso «Sem tradução ainda»', async () => {
    await executar("DELETE FROM pub_TESTE.unit_pt_render WHERE unit_id IN ('PA-TESTE-I.S.10-ovw-2', 'PA-TESTE-I.S.11-ovw-1')")
    abrir()
    const caixa = await screen.findByRole('region', { name: 'Introdução · o texto do autor sobre 1.2–1.3' })
    expect(caixa.querySelector('p[lang]')).toHaveAttribute('lang', 'de')
    await userEvent.click(within(caixa).getByRole('button', { name: 'Ler a introdução' }))
    expect(within(caixa).getByText('Sem tradução ainda; o original, em alemão.')).toBeInTheDocument()
    expect([...caixa.querySelectorAll('p[lang]')].map((p) => p.getAttribute('lang'))).toEqual(['de', 'de'])
  })

  it('com o número vazio, o rótulo da caixa é só «Introdução», não «… sobre »', async () => {
    // O CHECK do esquema impede o nulo numa subcoleção; o vazio passa.
    await executar("UPDATE pub_TESTE.author_group SET numero = '' WHERE id = 'GR-TESTE-I-01-02'")
    abrir()
    expect(await screen.findByRole('region', { name: 'Introdução' })).toBeInTheDocument()
  })
})
