import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { registrar } from '../usuario/estado'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
})
afterAll(() => usarMotor(null))
afterEach(() => {
  instalarMatchMedia(375)
  vi.restoreAllMocks()
})

function comAreaDeTransferencia() {
  const writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

describe('revisão 4: o locator que não se lê fica como veio, sem a publicação colada com vírgula', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    await executar("UPDATE pub_TESTE.hypothesis SET locator = 'Nr. 1' WHERE id = 'HY-900001'")
    await executar("UPDATE pub_TESTE.hypothesis SET locator = 'S. 12' WHERE id = 'HY-900003'")
  })
  afterAll(async () => usarMotor(await bancoDeTeste()))

  it('"Nr. 1" (sem a obra) e "S. 12" aparecem assim, nem "TESTE: 1" nem "TESTE, S. 12"', async () => {
    renderizarRota('/verbete/GL-900001')
    const hipoteses = await screen.findByRole('region', { name: 'Hipóteses com este termo' })
    const linhas = within(hipoteses).getAllByRole('link')
    expect(within(linhas[0]!).getByText(/iconográfico · afirmada/)).toHaveTextContent(/afirmada · Nr\. 1$/)
    expect(within(linhas[1]!).getByText(/iconográfico · provável/)).toHaveTextContent(/provável · S\. 12$/)
    expect(hipoteses).not.toHaveTextContent('TESTE')
  })
})

describe('Verbete (celular)', () => {
  it('mostra o nome, o tipo, o estado e o código', async () => {
    renderizarRota('/verbete/GL-900001')
    expect(await screen.findByRole('heading', { level: 1, name: 'leão-de-teste' })).toBeInTheDocument()
    expect(screen.getByText('Conceito · aprovado')).toBeInTheDocument()
    expect(screen.getByText('GL-900001')).toHaveClass('codigo')
    expect(screen.getByRole('link', { name: 'Voltar ao glossário' })).toHaveAttribute('href', '#/glossario')
  })

  it('mostra a forma em uso, a proposta original, o alemão, o inglês, o pai, o Iconclass e o SSSL', async () => {
    renderizarRota('/verbete/GL-900003')
    expect(await screen.findByRole('heading', { level: 1, name: 'olhos (forma de botão)' })).toBeInTheDocument()
    const forma = screen.getByRole('region', { name: 'Forma em português' })
    // Tarefa 11: a forma em português é o campo editável; a proposta original, embaixo dele; a do tradutor, só se difere.
    expect(within(forma).getByRole('textbox', { name: 'Forma em português' })).toHaveValue('olhos (forma de botão)')
    expect(within(forma).getByText('Proposta original: olhos (forma de botão)')).toBeInTheDocument()
    expect(within(forma).getByText('Proposta do tradutor')).toBeInTheDocument()
    expect(within(forma).getByText('olhos de botão', { selector: 'dd' })).toBeInTheDocument()
    expect(within(forma).getByText('No texto corrido')).toBeInTheDocument()
    expect(within(forma).getByText('olho em forma de botão', { selector: 'dd' })).toBeInTheDocument()
    expect(within(forma).getByText('masculino')).toBeInTheDocument()
    expect(screen.getByText('Probeknopfaugen', { selector: 'dd' })).toHaveAttribute('lang', 'de')
    expect(screen.getByText('test button eyes', { selector: 'dd' })).toBeInTheDocument()
  })

  it('Tarefa 11: só a forma em português é campo de entrada (o resto é leitura); Aprovar nos a revisar, "Aprovado por você" nos aprovados; sem botão Salvar', async () => {
    const { container, unmount } = renderizarRota('/verbete/GL-900003')
    await screen.findByRole('heading', { level: 1, name: 'olhos (forma de botão)' })
    expect(container.querySelectorAll('input, textarea, select, [contenteditable="true"]')).toHaveLength(1)
    expect(screen.getByRole('textbox', { name: 'Forma em português' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Salvar|Voltar à proposta/ })).not.toBeInTheDocument()
    // aprovado no pacote
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
    // T17-B-11: a aprovação veio do pacote e ninguém a tocou: não é «por você»
    expect(screen.getByText('Aprovado')).toBeInTheDocument()
    expect(screen.queryByText('Aprovado por você')).toBeNull()
    unmount()
    renderizarRota('/verbete/GL-900008')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument()
  })

  it('traz o pai (link), o Iconclass e o SSSL com os rótulos', async () => {
    renderizarRota('/verbete/GL-900007')
    expect(await screen.findByRole('heading', { level: 1, name: 'filhote de leão-de-teste' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'leão-de-teste' })).toHaveAttribute('href', '/verbete/GL-900001')
    expect(screen.getByText('Conceito · a revisar')).toBeInTheDocument()
  })

  it('T17-B-12: o pai mostra o nome de agora (a forma em uso do pai)', async () => {
    await registrar('verbete', 'GL-900001', 'alterar', { formaEmUso: 'cria-mãe de teste' })
    renderizarRota('/verbete/GL-900007')
    await screen.findByRole('heading', { level: 1, name: 'filhote de leão-de-teste' })
    expect(await screen.findByRole('link', { name: 'cria-mãe de teste' })).toHaveAttribute('href', '/verbete/GL-900001')
    await registrar('verbete', 'GL-900001', 'alterar', { formaEmUso: null })
  })

  it('Iconclass com a notação e o texto, SSSL com o código e o rótulo, definição e grafias', async () => {
    renderizarRota('/verbete/GL-900001')
    await screen.findByRole('heading', { level: 1, name: 'leão-de-teste' })
    const dados = screen.getByRole('region', { name: 'Dados do verbete' })
    expect(within(dados).getByText('99A1')).toHaveClass('codigo')
    expect(within(dados).getByText(/leão-de-teste \(inventado\)/)).toBeInTheDocument()
    expect(within(dados).getByText('9.1')).toHaveClass('codigo')
    expect(within(dados).getByText(/Invented test animal/)).toBeInTheDocument()
    expect(within(dados).getByText('Leão inventado para os testes do aplicativo.')).toBeInTheDocument()
    expect(within(dados).getByText('Testlöwe, Testlöwen')).toBeInTheDocument()
  })

  it('lista os objetos do termo (cartões que levam ao item) e as hipóteses (que levam ao item, aberta)', async () => {
    renderizarRota('/verbete/GL-900001')
    const objetos = await screen.findByRole('region', { name: 'Objetos com este termo' })
    const cartoes = within(objetos).getAllByRole('link')
    expect(cartoes.map((a) => a.getAttribute('href'))).toEqual(['/item/CA00001', '/item/CA00002'])
    expect(within(objetos).getByText('2', { selector: '.codigo' })).toBeInTheDocument()

    const hipoteses = screen.getByRole('region', { name: 'Hipóteses com este termo' })
    const linhas = within(hipoteses).getAllByRole('link')
    expect(linhas.map((a) => a.getAttribute('href'))).toEqual(['/item/CA00001?hipotese=HY-900001', '/item/CA00002?hipotese=HY-900003'])
    expect(within(linhas[0]!).getByText('CA00001')).toBeInTheDocument()
    expect(within(linhas[0]!).getByText(/Testlöwen/)).toHaveAttribute('lang', 'de')
    expect(within(linhas[0]!).getByText(/iconográfico · afirmada/)).toBeInTheDocument()
    expect(within(linhas[1]!).getByText(/iconográfico · provável/)).toBeInTheDocument()
    // Decisão 39: o locator do pacote ("TESTE I, Nr. 1") aparece no formato com dois pontos.
    expect(within(linhas[0]!).getByText(/iconográfico · afirmada/)).toHaveTextContent(/· TESTE I: 1$/)
    expect(hipoteses).not.toHaveTextContent('Nr.')
  })

  it('um verbete de sítio lista os objetos achados lá', async () => {
    renderizarRota('/verbete/GL-900004')
    const objetos = await screen.findByRole('region', { name: 'Objetos com este termo' })
    expect(within(objetos).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/item/CA00001', '/item/CA00002', '/item/BA00001'])
  })

  it('o ícone de busca leva à busca por este termo', async () => {
    renderizarRota('/verbete/GL-900001')
    const busca = await screen.findByRole('link', { name: 'Buscar objetos com este termo' })
    expect(busca.getAttribute('href')).toBe(`#/busca?q=${encodeURIComponent('leão-de-teste')}&escopo=termo`)
  })

  it('"Copiar referência" copia o nome com o código e avisa "Referência copiada"', async () => {
    const writeText = comAreaDeTransferencia()
    renderizarRota('/verbete/GL-900001')
    await userEvent.click(await screen.findByRole('button', { name: 'Copiar referência' }))
    expect(writeText).toHaveBeenCalledWith('leão-de-teste (GL-900001)')
    expect(await screen.findByRole('status')).toHaveTextContent('Referência copiada')
  })

  it('verbete que não existe: aviso e volta ao glossário', async () => {
    renderizarRota('/verbete/GL-000000')
    expect(await screen.findByRole('heading', { level: 1, name: 'Verbete não encontrado' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver o glossário' })).toHaveAttribute('href', '/glossario')
  })
})

describe('Verbete (computador)', () => {
  beforeEach(() => instalarMatchMedia(1280))

  it('o detalhe à direita traz o nome em segundo nível, as ações e os dados', async () => {
    renderizarRota('/verbete/GL-900001')
    expect(await screen.findByRole('heading', { level: 2, name: 'leão-de-teste' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Buscar objetos com este termo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copiar referência' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Voltar ao glossário' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('region', { name: 'Objetos com este termo' })).toBeInTheDocument())
  })
})

describe('Verbete: direção do texto e unidades', () => {
  it('as formas em árabe e hebraico levam dir="auto" (e a língua)', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    await executar("UPDATE main.glossary_entry SET ar = 'مرد', he = 'מרדוך' WHERE id = 'GL-900004'")
    renderizarRota('/verbete/GL-900004')
    await screen.findByRole('heading', { level: 1, name: 'Maḥteṣ Teste' })
    expect(screen.getByText('مرد', { selector: 'dd' })).toHaveAttribute('dir', 'auto')
    expect(screen.getByText('מרדוך', { selector: 'dd' })).toHaveAttribute('dir', 'auto')
    expect(screen.getByText('مرد', { selector: 'dd' })).toHaveAttribute('lang', 'ar')
    expect(screen.getByText('מרדוך', { selector: 'dd' })).toHaveAttribute('lang', 'he')
    usarMotor(await bancoDeTeste())
  })

  it('as contagens das seções dizem a unidade ("2 objetos", "2 hipóteses")', async () => {
    renderizarRota('/verbete/GL-900001')
    const objetos = await screen.findByRole('region', { name: 'Objetos com este termo' })
    expect(within(objetos).getByText('2', { selector: '.codigo' })).toHaveTextContent('2 objetos')
    const hipoteses = screen.getByRole('region', { name: 'Hipóteses com este termo' })
    expect(within(hipoteses).getByText('2', { selector: '.codigo' })).toHaveTextContent('2 hipóteses')
  })
})
