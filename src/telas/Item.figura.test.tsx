/**
 * Etapa 4, Tarefa 24: a página da figura do livro em parágrafos (tela 1 aprovada; decisão 91), sobre o pacote sintético:
 * `F200001` (TESTEG-0001a, sem sítio: o achado dela no TESTEG-2, M6, sai no banco de escrita), `F200002` (TESTEG-0002,
 * achado «do texto» pelo § 3) e `CA00004` (TESTE-0004 e a figura TESTEG-0001b, a mesma peça). A ficha do catálogo some na figura; ficam o crédito, «Discutida em» e, na peça
 * juntada, a ficha e o título do TESTE com as duas leituras lado a lado, como vozes. Tudo inventado (repositório público).
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { passoDoItem } from '../banco/leitura'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Item } from './Item'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
// a consulta do «Ler no livro», espiada: a linha do livro em parágrafos nem a faz
vi.mock('../banco/leitura', async (original) => {
  const m = await original<typeof import('../banco/leitura')>()
  return { ...m, passoDoItem: vi.fn(m.passoDoItem) }
})

function abrir(caminho: string) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/item/:numero" element={<Item />} />
      </Routes>
      <Local />
    </MemoryRouter>,
  )
}
function Local() {
  const { pathname, search } = useLocation()
  return <output data-testid="local">{`${pathname}${search}`}</output>
}
const titulo = () => screen.findByRole('heading', { level: 1 })
const ficha = () => screen.getByRole('group', { name: 'Ficha' })
const leituras = () => screen.getByRole('region', { name: 'Leituras' })
const linhasDaFicha = () => within(ficha()).getAllByRole('term').map((t) => t.textContent)

describe.each([
  ['celular', 375],
  ['computador', 1280],
])('a página da figura (%s)', (_, largura) => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    Element.prototype.scrollIntoView = vi.fn()
    // a figura 1a sem sítio: sem o achado «do texto» no TESTEG-2 que o pacote ganhou na revisão final da Etapa 4 (M6)
    await executar("DELETE FROM pub_TESTEG.assertion WHERE subject_id = 'TESTEG-0001a'")
  })
  afterAll(() => usarMotor(null))
  beforeEach(() => instalarMatchMedia(largura))
  afterEach(() => instalarMatchMedia(375))

  it('o título é o rótulo (decisão 39, «TESTEG: 1a»); o rótulo de cima diz que é uma figura do livro', async () => {
    abrir('/item/F200001')
    expect(await titulo()).toHaveTextContent(/^TESTEG: 1a$/)
    const cabeca = screen.getByTestId('item-cabeca')
    expect(within(cabeca).getByText('F200001')).toHaveClass('item-numero')
    expect(within(cabeca).getByTestId('numeros-nas-fontes')).toHaveTextContent(/^figura do TESTEG$/)
  })

  it('Tarefa 5 da leitura: a figura do livro em parágrafos não tem «Ler no livro»; na peça juntada, só a linha do catálogo tem', async () => {
    vi.mocked(passoDoItem).mockClear()
    abrir('/item/F200001')
    await titulo()
    await screen.findByRole('region', { name: 'No livro' })
    // a linha do livro em parágrafos nem pede o passo (não há o que esperar carregar): o botão não pode aparecer depois
    expect(vi.mocked(passoDoItem)).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'Ler no livro' })).not.toBeInTheDocument()
    cleanup()
    abrir('/item/CA00004')
    const noLivro = await screen.findByRole('region', { name: 'No livro' })
    expect(await within(noLivro).findByRole('link', { name: 'Ler no livro' })).toHaveAttribute('href', '/ler/TESTE/entrada/4')
    // só a linha do catálogo pediu (e já respondeu): uma consulta, um botão
    expect(vi.mocked(passoDoItem).mock.calls.map(([id]) => id)).toEqual(['TESTE-0004'])
    expect(within(noLivro).getAllByRole('link', { name: 'Ler no livro' })).toHaveLength(1)
    expect(noLivro.querySelectorAll('.no-livro-caminho')).toHaveLength(2)
  })

  it('a ficha: só o crédito (sem sítio, a linha vazia some); sem a seção Catálogo', async () => {
    abrir('/item/F200001')
    await titulo()
    expect(linhasDaFicha()).toEqual(['Crédito'])
    // sem o prefixo da figura («1a-b»), como no desenho aprovado
    expect(within(ficha()).getAllByRole('definition')[0]).toHaveTextContent(/^Autor 1999: 22 Abb\. 4 \(Testkredit\)$/)
    expect(screen.queryByRole('button', { name: /^Catálogo/ })).toBeNull()
    // «Hipóteses por nível» vazia não aparece (as hipóteses do GGG vêm num pacote depois, decisão 89), nem o ícone dela
    expect(screen.queryByRole('button', { name: /^Hipóteses por nível/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ver todas as hipóteses por nível', hidden: true })).toBeNull()
    // as outras seções ficam
    expect(screen.getByRole('button', { name: /^Paralelos e relações/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Bibliografia/ })).toBeInTheDocument()
  })

  it('a figura sem sítio aberta pela Revisão (?corrigir=sitio): a linha Sítio aparece e a folha da escolha fica aberta', async () => {
    abrir('/item/F200001?corrigir=sitio')
    const dialogo = await screen.findByRole('dialog', { name: 'Sítio deste objeto' })
    expect(linhasDaFicha()).toEqual(['Sítio', 'Crédito'])
    // o parâmetro sai do endereço logo depois; a linha e a folha continuam
    await waitFor(() => expect(screen.getByTestId('local')).toHaveTextContent(/^\/item\/F200001$/))
    expect(dialogo).toBeInTheDocument()
    expect(linhasDaFicha()).toEqual(['Sítio', 'Crédito'])
  })

  it('a voz do livro: «TESTEG / 1a», «Discutida em 1 §», o § 2 com a frase que cita a figura; sem o aviso de «nenhum texto»', async () => {
    abrir('/item/F200001')
    await titulo()
    const voz = await within(leituras()).findByRole('group', { name: 'TESTEG: 1a' })
    expect(within(voz).getByTestId('leitura-fonte')).toHaveTextContent('TESTEG1a')
    expect(await within(voz).findByText('Discutida em 1 §')).toBeInTheDocument()
    const par = within(voz).getByRole('link', { name: /§ 2/ })
    expect(par).toHaveAttribute('href', '/paragrafo/TESTEG/2')
    expect(par).toHaveTextContent('Dois selos de prova de Maḥteṣ Teste mostram um leão-de-teste (Abb. 1a) e o seu verso (Abb. 1b); cf. Pl. 3.')
    expect(within(leituras()).queryByText('Nenhuma fonte tem texto sobre este objeto.')).toBeNull()
  })

  it('o sítio achado pelo §: «do texto» e «pela fig. 2 no § 3», com o link ao §', async () => {
    abrir('/item/F200002')
    expect(await titulo()).toHaveTextContent('TESTEG: 2')
    expect(linhasDaFicha()).toEqual(['Sítio', 'Crédito'])
    expect(within(ficha()).getByRole('link', { name: 'Tell Achado Teste' })).toHaveAttribute('href', '/sitio/TESTEG-9')
    const marca = within(ficha()).getByTestId('marca-do-texto')
    expect(marca).toHaveTextContent('do texto pela fig. 2 no § 3')
    expect(within(marca).getByText('do texto')).toHaveClass('marca-skc')
    expect(within(marca).getByRole('link', { name: '§ 3' })).toHaveAttribute('href', '/paragrafo/TESTEG/3')
  })

  it('a peça juntada (decisão 91, a2): o título e a ficha do TESTE, as duas leituras como vozes, e o Catálogo sem o crédito da figura', async () => {
    abrir('/item/CA00004')
    expect(await titulo()).toHaveTextContent('Selo de teste. Pedra de prova.')
    expect(linhasDaFicha()).toEqual(['Sítio', 'Data', 'Acervo', 'Medidas'])
    expect(within(ficha()).queryByTestId('marca-do-texto')).toBeNull()
    const fontes = within(leituras()).getAllByTestId('leitura-fonte').map((f) => f.textContent)
    expect(fontes.slice(0, 2)).toEqual(['TESTEI: 4', 'TESTEG1b'])
    const voz = within(leituras()).getByRole('group', { name: 'TESTEG: 1b' })
    expect(await within(voz).findByText('Discutida em 1 §')).toBeInTheDocument()
    expect(within(voz).getByRole('link', { name: /§ 2/ })).toHaveAttribute('href', '/paragrafo/TESTEG/2')
    // o crédito da figura vem na voz dela, não na ficha do TESTE
    expect(voz).toHaveTextContent('Crédito: 1a-b Autor 1999: 22 Abb. 4 (Testkredit)')
    // a peça juntada tem hipótese do TESTE: a seção fica
    expect(screen.getByRole('button', { name: /^Hipóteses por nível/ })).toHaveTextContent('1')
    // o Catálogo é o do TESTE: os seis campos, sem o da figura
    expect(screen.getByRole('button', { name: /^Catálogo/ })).toHaveTextContent('6')
  })

  it('fix 1 da Tarefa 26 (desenho 6): na peça de dois livros, a legenda de cada imagem diz de que livro ela é', async () => {
    abrir('/item/CA00004')
    await titulo()
    const legenda = () => document.querySelector('.imagem-item-credito')
    await waitFor(() => expect(legenda()).toHaveTextContent(/^TESTE I: 4 · Desenho: Ilustradora Teste$/))
    await userEvent.click(screen.getByRole('button', { name: 'Imagem seguinte' }))
    await waitFor(() => expect(legenda()).toHaveTextContent(/^TESTEG: 1b · 1a-b Autor 1999: 22 Abb\. 4 \(Testkredit\)$/))
  })

  it('a figura de um livro só fica com o crédito, sem o livro', async () => {
    abrir('/item/F200001')
    await titulo()
    await waitFor(() => expect(document.querySelector('.imagem-item-credito')).toHaveTextContent(/^1a-b Autor 1999/))
  })
})

describe('o sítio achado só pelo crédito (banco de escrita: o achado sem trecho)', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    Element.prototype.scrollIntoView = vi.fn()
    await executar("UPDATE pub_TESTEG.assertion SET passage_id = NULL, locator = NULL WHERE subject_id = 'TESTEG-0002'")
  })
  afterAll(() => usarMotor(null))

  it('«do texto» e «pelo crédito; nenhum § diz o lugar», sem link', async () => {
    abrir('/item/F200002')
    await titulo()
    const marca = within(ficha()).getByTestId('marca-do-texto')
    expect(marca).toHaveTextContent('do texto pelo crédito; nenhum § diz o lugar')
    expect(within(marca).queryByRole('link')).toBeNull()
  })
})

describe('fix round 1 da Tarefa 27 (M3): a peça com duas figuras, o lugar tirado da segunda', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    Element.prototype.scrollIntoView = vi.fn()
    // a figura 2 (com o achado «do texto» pelo § 3) passa a ser outra vista da peça da figura 1a (sem sítio: sem o achado
    // no TESTEG-2 que o pacote ganhou, M6)
    await executar("UPDATE main.object_member SET object_id = 'F200001' WHERE item_id = 'TESTEG-0002'")
    await executar("DELETE FROM pub_TESTEG.assertion WHERE subject_id = 'TESTEG-0001a'")
  })
  afterAll(() => usarMotor(null))

  it('«pela fig. 2 no § 3»: a marca nomeia a figura cujo achado deu o sítio, não a primeira', async () => {
    abrir('/item/F200001')
    await titulo()
    expect(within(ficha()).getByRole('link', { name: 'Tell Achado Teste' })).toHaveAttribute('href', '/sitio/TESTEG-9')
    expect(within(ficha()).getByTestId('marca-do-texto')).toHaveTextContent('do texto pela fig. 2 no § 3')
  })
})

describe('revisão final da Etapa 4 (M6): a figura 1a achada no TESTEG-2, mesclado no TESTE-2 pelo número', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterAll(() => usarMotor(null))

  it('a ficha tem o sítio (com o nome do destino da mescla) e o crédito; a marca «do texto» leva ao § 2', async () => {
    abrir('/item/F200001')
    await titulo()
    expect(linhasDaFicha()).toEqual(['Sítio', 'Crédito'])
    // o link é o do sítio do livro, e a página dele leva ao destino (como o TESTE-4)
    expect(within(ficha()).getByRole('link', { name: 'Tell Probe Teste' })).toHaveAttribute('href', '/sitio/TESTEG-2')
    const marca = within(ficha()).getByTestId('marca-do-texto')
    expect(marca).toHaveTextContent('do texto')
    expect(within(marca).getByRole('link')).toHaveAttribute('href', '/paragrafo/TESTEG/2')
  })
})
