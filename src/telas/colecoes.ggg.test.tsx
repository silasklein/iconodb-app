/**
 * Etapa 4, Tarefa 26 (tela 3 aprovada): o livro em parágrafos nas Coleções, sobre o pacote sintético. O `TESTEG` (o modelo do
 * GGG) tem o capítulo GR-TESTEG-01 («I. Época de teste e imagens de prova», o § 1) com a seção GR-TESTEG-01-01 («1. Selos de
 * prova da fase de teste», os §§ 2–3) e três figuras. A aba do livro lista os capítulos sem período; o capítulo é o grupo, com
 * «Ler o capítulo» no lugar de «Ler a introdução»; a seção é a subcoleção, com «Ler a seção» e «§§ desta seção» (decisão 91,
 * a8: «Ler» abre o primeiro § da seção, e ‹ › segue em ordem). A tradução (TESTEGEN) não é aba.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Colecoes } from './Colecoes'
import { Grupo } from './Grupo'
import { rotuloDoCapitulo } from './LivroEmParagrafos'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

function Onde() {
  const { pathname, search } = useLocation()
  return <span data-testid="onde">{`${pathname}${search}`}</span>
}

function abrir(endereco: string) {
  return render(
    <MemoryRouter initialEntries={[endereco]}>
      <Routes>
        <Route path="/colecoes" element={<Colecoes />} />
        <Route
          path="/grupo/:id"
          element={
            <>
              <Grupo />
              <Onde />
            </>
          }
        />
        <Route path="/paragrafo/:sigla/:numero" element={<Onde />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('o livro em parágrafos nas Coleções (Tarefa 26)', () => {
  beforeAll(async () => usarMotor(await bancoDeTeste()))
  afterAll(() => usarMotor(null))
  afterEach(() => instalarMatchMedia(375))

  describe.each([
    ['celular', 375],
    ['computador', 1280],
  ])('a aba do livro (%s)', (_, largura) => {
    beforeEach(() => instalarMatchMedia(largura))

    it('os capítulos sem cabeçalho de período, cada um com «N figuras · N seções · §§ a–b»; a tradução não é aba', async () => {
      abrir('/colecoes?obra=TESTEG')
      const capitulo = await screen.findByRole('link', { name: /I\. Época de teste e imagens de prova/ })
      expect(capitulo).toHaveAttribute('href', '/grupo/GR-TESTEG-01')
      expect(capitulo.querySelector('.colecoes-grupo-n')).toHaveTextContent(/^3 figuras · 1 seção · §§ 1–3$/)
      expect(screen.queryByRole('heading', { level: 2, name: /Ferro II/ })).toBeNull()
      const abas = within(screen.getByRole('navigation', { name: 'Obras' })).getAllByRole('link')
      expect(abas.map((a) => a.textContent)).toEqual(['SKC', 'TESTE I', 'TESTEG'])
    })
  })

  it('no computador, o resumo da aba: «TESTEG · capítulos do livro, com as seções dentro» e «1 capítulo · 3 figuras · 3 §§»', async () => {
    instalarMatchMedia(1280)
    abrir('/colecoes?obra=TESTEG')
    await screen.findByRole('link', { name: /I\. Época de teste/ })
    const resumo = document.querySelector('.colecoes-resumo') as HTMLElement
    expect(resumo).toHaveTextContent('TESTEG · capítulos do livro, com as seções dentro')
    expect(resumo).toHaveTextContent('1 capítulo · 3 figuras · 3 §§')
  })

  it('a aba do livro de catálogo continua por período, com «objetos»', async () => {
    abrir('/colecoes?obra=TESTE-I')
    expect(await screen.findByRole('heading', { level: 2, name: 'Calcolítico (fase de teste)' })).toBeInTheDocument()
  })

  describe('o capítulo no computador (o grupo dividido)', () => {
    beforeEach(() => instalarMatchMedia(1280))

    it('o rótulo do capítulo, as contagens, «Ler o capítulo» (o primeiro §) e as seções com os §§ de cada uma', async () => {
      abrir('/grupo/GR-TESTEG-01')
      expect(await screen.findByRole('heading', { level: 1, name: 'I. Época de teste e imagens de prova' })).toBeInTheDocument()
      expect(screen.getByText('TESTEG · Capítulo I')).toBeInTheDocument()
      expect(screen.getByText('3 figuras · 3 §§ · 1 seção')).toBeInTheDocument()
      const ler = screen.getByRole('link', { name: /^Ler o capítulo/ })
      expect(ler).toHaveAttribute('href', '/paragrafo/TESTEG/1')
      expect(ler).toHaveTextContent('Ler o capítulo §§ 1–3, em sequência')
      expect(screen.queryByRole('button', { name: 'Ler a introdução' })).toBeNull()
      const lista = within(screen.getByRole('navigation', { name: 'Seções' }))
      expect(lista.getByRole('link', { name: /Todas as figuras do capítulo/ })).toHaveAttribute('aria-current', 'true')
      const secao = lista.getByRole('link', { name: /Selos de prova da fase de teste/ })
      expect(secao).toHaveTextContent('§§ 2–3')
      expect(screen.getByRole('heading', { level: 2, name: /^Todas as figuras/ })).toHaveTextContent('3')
    })

    it('a seção escolhida: «TESTEG · Seção 1», «Ler a seção», «§§ desta seção» com a primeira frase e «Figuras da seção»', async () => {
      abrir('/grupo/GR-TESTEG-01?sub=GR-TESTEG-01-01')
      expect(await screen.findByRole('heading', { level: 2, name: '1. Selos de prova da fase de teste' })).toBeInTheDocument()
      expect(screen.getByText('TESTEG · Seção 1')).toBeInTheDocument()
      expect(screen.getByText('3 figuras · §§ 2–3')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Ler a seção' })).toHaveAttribute('href', '/paragrafo/TESTEG/2')
      const paragrafos = await screen.findByRole('list', { name: '§§ desta seção' })
      const linhas = within(paragrafos).getAllByRole('link')
      expect(linhas.map((l) => [l.getAttribute('href'), l.textContent])).toEqual([
        ['/paragrafo/TESTEG/2', '§ 2Dois selos de prova de Maḥteṣ Teste mostram um leão-de-teste (Abb. 1a) e o seu verso (Abb. 1b); cf. Pl. 3.'],
        ['/paragrafo/TESTEG/3', '§ 3Um escaravelho de teste de Tell Achado Teste (Abb. 2) encerra a série de prova.'],
      ])
      expect(screen.getByRole('region', { name: 'Figuras da seção' })).toBeInTheDocument()
      // pelos endereços dos cartões: o nome acessível começa pelo «alt» da miniatura quando ela já carregou («Objeto F200001…»),
      // e pelo número quando não (o `^F2000` falhava 1 em 3 vezes, já antes da Tarefa 27)
      const figuras = screen.getByRole('region', { name: 'Figuras da seção' })
      await waitFor(() =>
        expect(within(figuras).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/item/F200001', '/item/CA00004', '/item/F200002']),
      )
    })
  })

  describe('no celular', () => {
    it('o capítulo: o rótulo, «Figuras · §§ · Seções», «Ler o capítulo» e a lista das seções com os §§', async () => {
      abrir('/grupo/GR-TESTEG-01')
      expect(await screen.findByRole('heading', { level: 1, name: 'I. Época de teste e imagens de prova' })).toBeInTheDocument()
      expect(screen.getByText('TESTEG · Capítulo I')).toBeInTheDocument()
      const contagens = within(screen.getByRole('group', { name: 'O que há no capítulo' }))
      expect(contagens.getAllByRole('term').map((t) => t.textContent)).toEqual(['Figuras', '§§', 'Seções'])
      expect(contagens.getAllByRole('definition').map((t) => t.textContent)).toEqual(['3', '3', '1'])
      expect(screen.getByRole('link', { name: /^Ler o capítulo/ })).toHaveAttribute('href', '/paragrafo/TESTEG/1')
      const secoes = screen.getByRole('region', { name: 'Seções' })
      expect(within(secoes).getByRole('link', { name: /Selos de prova da fase de teste/ })).toHaveTextContent('§§ 2–3')
      expect(screen.getByRole('heading', { level: 2, name: /^Todas as figuras/ })).toBeInTheDocument()
    })

    it('a seção: «‹ capítulo», o rótulo, «Ler a seção», «§§ desta seção» e as figuras', async () => {
      abrir('/grupo/GR-TESTEG-01-01')
      expect(await screen.findByRole('heading', { level: 1, name: '1. Selos de prova da fase de teste' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /I\. Época de teste e imagens de prova/ })).toHaveAttribute('href', '/grupo/GR-TESTEG-01')
      expect(screen.getByText('TESTEG · Seção 1')).toBeInTheDocument()
      expect(screen.getByText('3 figuras · §§ 2–3')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Ler a seção' })).toHaveAttribute('href', '/paragrafo/TESTEG/2')
      const paragrafos = screen.getByRole('list', { name: '§§ desta seção' })
      expect(within(paragrafos).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/paragrafo/TESTEG/2', '/paragrafo/TESTEG/3'])
      expect(screen.getByRole('region', { name: 'Figuras da seção' })).toBeInTheDocument()
      // a introdução da seção é o texto dos §§: não há caixa «Ler a introdução»
      expect(screen.queryByRole('button', { name: 'Ler a introdução' })).toBeNull()
    })
  })

  it('o grupo do livro de catálogo continua com «Ler a introdução» e «Objetos»', async () => {
    abrir('/grupo/GR-TESTE-I-02')
    expect(await screen.findByRole('button', { name: 'Ler a introdução' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Ler o capítulo/ })).toBeNull()
  })
})

describe('fix round 1 da Tarefa 27, (b): o capítulo sem número é o Adendo', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    // o capítulo sintético sem número, como o adendo do livro em parágrafos (o único capítulo sem número)
    await executar("UPDATE pub_TESTEG.author_group SET numero = NULL WHERE id = 'GR-TESTEG-01'")
  })
  afterAll(() => usarMotor(null))
  afterEach(() => instalarMatchMedia(375))

  it('rotuloDoCapitulo: «TESTEG · Capítulo I» com número, «TESTEG · Adendo» sem', () => {
    expect(rotuloDoCapitulo('TESTEG', 'I')).toBe('TESTEG · Capítulo I')
    expect(rotuloDoCapitulo('TESTEG', null)).toBe('TESTEG · Adendo')
  })

  it.each([375, 1280])('a página do capítulo (%i px) diz «TESTEG · Adendo», nunca «Capítulo»', async (largura) => {
    instalarMatchMedia(largura)
    abrir('/grupo/GR-TESTEG-01')
    expect(await screen.findByText('TESTEG · Adendo')).toBeInTheDocument()
    expect(screen.queryByText(/^TESTEG · Capítulo/)).toBeNull()
  })
})
