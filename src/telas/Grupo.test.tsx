import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { grupo } from '../banco/consultas'
import { passoDoGrupo } from '../banco/leitura'
import { urlImagem } from '../pacote/imagens'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Grupo } from './Grupo'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
// a consulta do «Ler no livro», espiada: o teste do capítulo do livro em parágrafos confere que ela nem é feita
vi.mock('../banco/leitura', async (original) => {
  const m = await original<typeof import('../banco/leitura')>()
  return { ...m, passoDoGrupo: vi.fn(m.passoDoGrupo) }
})

function Item() {
  const { pathname, state } = useLocation()
  return <pre data-testid="item">{JSON.stringify({ pathname, state })}</pre>
}

function Onde() {
  const { pathname, search } = useLocation()
  return <span data-testid="onde">{`${pathname}${search}`}</span>
}

/** `id` pode levar a busca (`GR-…?sub=…`). */
function abrir(id = 'GR-TESTE-I-01') {
  return render(
    <MemoryRouter initialEntries={[`/grupo/${id}`]}>
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

describe('Grupo', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterAll(() => usarMotor(null))
  afterEach(() => instalarMatchMedia(375))

  it('mostra a capa, o título, o período, as contagens e "Ler a introdução"', async () => {
    abrir()
    const g = (await grupo('GR-TESTE-I-01'))!
    // com subcoleções, o número do livro antes do título (decisão 81)
    expect(await screen.findByRole('heading', { level: 1, name: `${g.numero}. ${g.titulo}` })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^1\. Animais de teste e figuras de prova$/)
    expect(screen.getByText(`${g.periodo} · Grupo ${g.ordinal} · ${g.publicacao} ${g.volume}`)).toBeInTheDocument()
    const contagens = screen.getByRole('group', { name: 'O que há no grupo' })
    expect(within(contagens).getByText('Objetos').nextElementSibling).toHaveTextContent(String(g.objetos))
    expect(within(contagens).getByText('Imagens').nextElementSibling).toHaveTextContent(String(g.imagens))
    expect(within(contagens).getByText('Hipóteses').nextElementSibling).toHaveTextContent(String(g.hipoteses))
    await waitFor(() => expect(document.querySelector('.grupo-capa img')).toHaveAttribute('src', `blob:${g.capa!.miniatura}`))
    expect(urlImagem).toHaveBeenCalledWith(g.capa!.miniatura)
    expect(screen.getByRole('button', { name: 'Ler a introdução' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('"Ler a introdução" mostra o texto da introdução e depois o recolhe', async () => {
    abrir()
    const g = (await grupo('GR-TESTE-I-01'))!
    expect(g.introducao).toHaveLength(1)
    const botao = await screen.findByRole('button', { name: 'Ler a introdução' })
    await userEvent.click(botao)
    const regiao = screen.getByRole('region', { name: 'Introdução do grupo' })
    expect(regiao).toHaveTextContent((g.introducao[0]!.texto ?? g.introducao[0]!.original).slice(0, 30))
    expect(botao).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(botao)
    expect(screen.queryByRole('region', { name: 'Introdução do grupo' })).not.toBeInTheDocument()
  })

  it('a grade tem um cartão por objeto, na ordem do grupo, com o número como identificador', async () => {
    abrir()
    const grade = await screen.findByRole('region', { name: 'Objetos do grupo' })
    const links = await within(grade).findAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/item/CA00001', '/item/CA00002', '/item/CA00003'])
    expect(within(links[0]!).getByText('CA00001')).toBeInTheDocument()
  })

  it('abrir um objeto leva o contexto do grupo e a origem (título e caminho) no estado do roteador', async () => {
    abrir()
    const g = (await grupo('GR-TESTE-I-01'))!
    await userEvent.click(await screen.findByRole('link', { name: /CA00002/ }))
    const { pathname, state } = JSON.parse(screen.getByTestId('item').textContent!)
    expect(pathname).toBe('/item/CA00002')
    expect(state).toEqual({
      contexto: { tipo: 'grupo', id: 'GR-TESTE-I-01' },
      origem: { rotulo: `1. ${g.titulo}`, caminho: '/grupo/GR-TESTE-I-01' }, // decisão 81
    })
  })

  it('"N objetos" desce até a grade', async () => {
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: /^3 objetos$/ }))
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('no celular tem "Voltar às coleções" e a lupa', async () => {
    abrir()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('link', { name: 'Voltar às coleções' })).toHaveAttribute('href', '#/colecoes?obra=TESTE-I')
    expect(screen.getByRole('link', { name: 'Buscar' })).toHaveAttribute('href', '#/busca')
  })

  it('no computador a trilha leva às Coleções e não há Voltar nem lupa', async () => {
    instalarMatchMedia(1280)
    abrir('GR-TESTE-I-02')
    await screen.findByRole('heading', { level: 1 })
    const trilha = screen.getByRole('navigation', { name: 'Trilha' })
    expect(within(trilha).getByRole('link', { name: 'Coleções' })).toHaveAttribute('href', '/colecoes?obra=TESTE-I')
    expect(trilha).toHaveTextContent('TESTE I')
    expect(screen.queryByRole('link', { name: 'Voltar às coleções' })).not.toBeInTheDocument()
  })

  it('a seção «Subcoleções» lista as do grupo, em ordem, com o número, o título e os objetos, e cada uma leva à sua página', async () => {
    abrir()
    const secao = await screen.findByRole('region', { name: 'Subcoleções' })
    expect(within(secao).getByRole('heading', { level: 2, name: 'Subcoleções' })).toBeInTheDocument()
    const links = within(secao).getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveTextContent(/^1\.1\s*Animais de prova\s*1/)
    expect(links[1]).toHaveTextContent(/^1\.2–1\.3\s*Figuras de prova e sinais de teste\s*1/)
    expect(links[0]).toHaveAttribute('href', '/grupo/GR-TESTE-I-01-01')
    expect(links[1]).toHaveAttribute('href', '/grupo/GR-TESTE-I-01-02')
    expect(links[1]).toHaveAccessibleName('1.2–1.3 Figuras de prova e sinais de teste, 1 objeto')
    expect(links[1]!.querySelector('.grupo-subcolecao-numero')).toHaveTextContent('1.2–1.3')
  })

  it('com subcoleções, a grade tem o título «Todos os objetos» e a contagem, nos dois tamanhos', async () => {
    abrir()
    expect(await screen.findByRole('heading', { level: 2, name: 'Todos os objetos 3' })).toBeInTheDocument()
    const subcolecoes = screen.getByRole('region', { name: 'Subcoleções' })
    const grade = screen.getByRole('region', { name: 'Objetos do grupo' })
    expect(subcolecoes.compareDocumentPosition(grade) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('no computador, o grupo com subcoleções é o dividido: a lista à esquerda e «Todos os objetos» à direita', async () => {
    instalarMatchMedia(1280)
    abrir()
    expect(await screen.findByRole('heading', { level: 2, name: 'Todos os objetos 3' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Subcoleções' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Subcoleções' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'O que há no grupo' })).not.toBeInTheDocument()
  })

  it('no computador, o endereço da subcoleção vira o do grupo com ?sub= (replace)', async () => {
    instalarMatchMedia(1280)
    abrir('GR-TESTE-I-01-02')
    expect(await screen.findByRole('heading', { level: 2, name: 'Figuras de prova e sinais de teste' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '1. Animais de teste e figuras de prova' })).toBeInTheDocument()
    expect(screen.getByTestId('onde')).toHaveTextContent('/grupo/GR-TESTE-I-01?sub=GR-TESTE-I-01-02')
  })

  it('no celular, o grupo com ?sub= vira a página da subcoleção', async () => {
    abrir('GR-TESTE-I-01?sub=GR-TESTE-I-01-02')
    expect(await screen.findByRole('heading', { level: 1, name: 'Figuras de prova e sinais de teste' })).toBeInTheDocument()
    expect(screen.getByTestId('onde')).toHaveTextContent(/^\/grupo\/GR-TESTE-I-01-02$/)
  })

  it('um sub que não é do grupo vale como «Todos»: no computador, a grade do grupo; no celular, o grupo', async () => {
    instalarMatchMedia(1280)
    const { unmount } = abrir('GR-TESTE-I-01?sub=GR-TESTE-I-02')
    expect(await screen.findByRole('heading', { level: 2, name: 'Todos os objetos 3' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Subcoleções' })).getByRole('link', { name: /^Todos / })).toHaveAttribute('aria-current', 'true')
    unmount()
    instalarMatchMedia(375)
    abrir('GR-TESTE-I-01?sub=GR-NAO-HA')
    expect(await screen.findByRole('region', { name: 'Subcoleções' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '1. Animais de teste e figuras de prova' })).toBeInTheDocument()
    expect(screen.getByTestId('onde')).toHaveTextContent('/grupo/GR-TESTE-I-01?sub=GR-NAO-HA')
  })

  it('sem subcoleções, nem a seção nem «Todos os objetos»: a grade fica como antes', async () => {
    abrir('GR-TESTE-I-02')
    await screen.findByRole('region', { name: 'Objetos do grupo' })
    // sem subcoleções, o título sozinho, sem número (decisão 81)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Selos de prova e padrões denteados$/)
    expect(screen.queryByRole('region', { name: 'Subcoleções' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: /Todos os objetos/ })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Objetos do grupo' })).queryByRole('heading')).not.toBeInTheDocument()
  })

  it('sem subcoleções, no computador, a grade continua «Objetos» com a contagem', async () => {
    instalarMatchMedia(1280)
    abrir('GR-TESTE-I-02')
    expect(await screen.findByRole('heading', { level: 2, name: 'Objetos 3' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Subcoleções' })).not.toBeInTheDocument()
  })

  it('"Ler a introdução" mostra um parágrafo por trecho (aqui, um)', async () => {
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Ler a introdução' }))
    expect(screen.getByRole('region', { name: 'Introdução do grupo' }).querySelectorAll('p:not(.introducao-aviso)')).toHaveLength(1)
  })

  it.each([
    ['celular', 375],
    ['computador', 1280],
  ] as const)('Tarefa 5 da leitura (%s): «Ler no livro», ao lado de «Ler a introdução», abre o 1º passo do grupo', async (_, largura) => {
    instalarMatchMedia(largura)
    abrir('GR-TESTE-I-02')
    const ler = await screen.findByRole('link', { name: 'Ler no livro' })
    expect(ler).toHaveAttribute('href', '/ler/TESTE/trecho/PA-TESTE-I.S.19-ovw-1')
    const introducao = screen.getByRole('button', { name: 'Ler a introdução' })
    expect(introducao.parentElement).toBe(ler.parentElement)
    expect(introducao.compareDocumentPosition(ler) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it.each([
    ['celular', 375],
    ['computador', 1280],
  ] as const)('Tarefa 5 da leitura (%s): o capítulo do livro em parágrafos fica com o «Ler o capítulo» dele, sem «Ler no livro»', async (_, largura) => {
    instalarMatchMedia(largura)
    vi.mocked(passoDoGrupo).mockClear()
    abrir('GR-TESTEG-01')
    await screen.findByRole('link', { name: /Ler o capítulo/ })
    // o capítulo nem pede o passo (não há o que esperar carregar): o botão não pode aparecer depois
    expect(vi.mocked(passoDoGrupo).mock.calls.map(([id]) => id)).not.toContain('GR-TESTEG-01')
    expect(screen.queryByRole('link', { name: 'Ler no livro' })).not.toBeInTheDocument()
  })

  it('um grupo que não existe avisa e volta às coleções', async () => {
    abrir('GR-NAO-HA')
    expect(await screen.findByRole('status')).toHaveTextContent('Grupo não encontrado')
    expect(screen.getByRole('link', { name: 'Ver as coleções' })).toHaveAttribute('href', '/colecoes')
  })
})

describe('Grupo: a introdução em trechos (banco mudado no teste)', () => {
  beforeEach(async () => usarMotor(await bancoDeTeste({ escrita: true })))
  afterAll(() => usarMotor(null))

  it('as subcoleções seguem o ordinal (a ordem do sumário), não a dos ids', async () => {
    // UNIQUE (parent_id, ordinal): a troca passa por valores livres.
    await executar("UPDATE pub_TESTE.author_group SET ordinal = 13 - ordinal WHERE parent_id = 'GR-TESTE-I-01'")
    await executar("UPDATE pub_TESTE.author_group SET ordinal = ordinal - 10 WHERE parent_id = 'GR-TESTE-I-01'")
    abrir()
    const links = within(await screen.findByRole('region', { name: 'Subcoleções' })).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/grupo/GR-TESTE-I-01-02', '/grupo/GR-TESTE-I-01-01'])
  })

  it('um grupo sem introdução não tem «Ler a introdução» nem resumo', async () => {
    await executar("UPDATE pub_TESTE.author_group SET intro_passage_id = NULL WHERE id = 'GR-TESTE-I-02'")
    abrir('GR-TESTE-I-02')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('button', { name: /introdução/ })).not.toBeInTheDocument()
    expect(document.querySelector('.grupo-resumo')).toBeNull()
  })

  it('Tarefa 5 da leitura: o grupo sem introdução, com passo, ainda tem «Ler no livro» (a 1ª entrada dele)', async () => {
    await executar("UPDATE pub_TESTE.author_group SET intro_passage_id = NULL WHERE id = 'GR-TESTE-I-02'")
    abrir('GR-TESTE-I-02')
    expect(await screen.findByRole('link', { name: 'Ler no livro' })).toHaveAttribute('href', expect.stringMatching(/^\/ler\/TESTE\/entrada\/\d+$/))
    expect(screen.queryByRole('button', { name: /introdução/ })).not.toBeInTheDocument()
  })

  it('o resumo é o primeiro trecho; «Ler a introdução» mostra todos, um parágrafo cada, na ordem', async () => {
    await executar(`INSERT INTO pub_TESTE.author_group_passage (group_id, passage_id, ordinal) VALUES
                      ('GR-TESTE-I-01', 'PA-TESTE-I.S.9-ovw-1', 1), ('GR-TESTE-I-01', 'PA-TESTE-I.S.3-txt-1', 2)`)
    const g = (await grupo('GR-TESTE-I-01'))!
    expect(g.introducao.map((t) => t.id)).toEqual(['PA-TESTE-I.S.9-ovw-1', 'PA-TESTE-I.S.3-txt-1'])
    const texto = (i: number) => g.introducao[i]!.texto ?? g.introducao[i]!.original
    abrir()
    await waitFor(() => expect(document.querySelector('.grupo-resumo')).toHaveTextContent(texto(0).slice(0, 30)))
    expect(document.querySelector('.grupo-resumo')!.textContent).toBe(texto(0))
    await userEvent.click(screen.getByRole('button', { name: 'Ler a introdução' }))
    const paragrafos = [...screen.getByRole('region', { name: 'Introdução do grupo' }).querySelectorAll('p:not(.introducao-aviso)')]
    expect(paragrafos.map((p) => p.textContent)).toEqual([texto(0), texto(1)])
  })
})
