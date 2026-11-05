/**
 * Tarefa 11, M9 da Tarefa 10: nomes vivos. As linhas de "Hipóteses por nível", o painel da hipótese e as pílulas de
 * termo mostram a forma em uso de agora (do glossário fundido), não o `termosRotulos` guardado quando a hipótese foi
 * registrada; o rótulo guardado só vale quando o verbete não existe. Também: o botão de tirar o termo (M11) e as
 * hipóteses SKC na página do verbete do livro.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { numerosDosObjetos } from '../banco/consultas'
import { definirFonteDosNumerosDoPacote, recarregarNumerosDoPacote } from '../objetos-skc/pacote'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { Item } from '../telas/Item'
import { registrar } from '../usuario/estado'
import { apertarQuandoPronto } from '../test/teclas'

vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
vi.mock('../pacote/imagens', async (original) => ({ ...(await original<typeof import('../pacote/imagens')>()), urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
  Element.prototype.scrollIntoView = vi.fn()
})
afterAll(() => usarMotor(null))
beforeEach(async () => {
  instalarMatchMedia(375)
  definirFonteDosNumerosDoPacote(numerosDosObjetos)
  await recarregarNumerosDoPacote()
})
afterEach(() => definirFonteDosNumerosDoPacote(null))

const hipoteseSkc = (id: string, objeto: string, termos: string[], rotulos: string[]) =>
  registrar('hipotese', id, 'criar', { objeto, sobre: 'objeto', elemento: null, elementoRotulo: '', termos, termosRotulos: rotulos, nivel: 'iconographic', modalidade: 'probable', justificativa: '', ancora: null })

function abrirItem(caminho: string) {
  const [pathname, busca] = caminho.split('?')
  return render(
    <MemoryRouter initialEntries={[{ pathname: pathname!, search: busca ? `?${busca}` : '' }]}>
      <Routes>
        <Route path="/item/:numero" element={<Item />} />
      </Routes>
    </MemoryRouter>,
  )
}
const linhaDe = (id: string) => document.querySelector(`[data-hipotese-linha="${id}"] .item-hipotese-linha-nome`)

describe('M9: "Hipóteses por nível" e o painel mostram a forma em uso', () => {
  it('a linha da hipótese do livro, a da SKC (com a forma guardada de antes) e a de um verbete do usuário renomeado', async () => {
    await registrar('verbete', 'GL-vivos001-1', 'criar', { forma: 'termo criado', status: 'proposed' })
    await hipoteseSkc('HY-vivos001-1', 'CA00001', ['GL-900001'], ['leão-de-teste'])
    await hipoteseSkc('HY-vivos001-2', 'CA00001', ['GL-vivos001-1'], ['termo criado'])
    // o verbete não existe: vale o rótulo guardado
    await hipoteseSkc('HY-vivos001-3', 'CA00001', ['GL-zzzzzzzz-1'], ['rótulo guardado'])
    await registrar('verbete', 'GL-900001', 'alterar', { formaEmUso: 'leão da prova' })
    await registrar('verbete', 'GL-vivos001-1', 'alterar', { formaEmUso: 'termo renomeado' })

    abrirItem('/item/CA00001')
    await screen.findByRole('heading', { level: 1 })
    await userEvent.click(await screen.findByRole('button', { name: /Hipóteses por nível/ }))
    await waitFor(() => expect(linhaDe('HY-900001')).toHaveTextContent('leão da prova'))
    expect(linhaDe('HY-vivos001-1')).toHaveTextContent('leão da prova')
    expect(linhaDe('HY-vivos001-2')).toHaveTextContent('termo renomeado')
    expect(linhaDe('HY-vivos001-3')).toHaveTextContent('rótulo guardado')
  })

  it('o painel da hipótese do livro: título, "Abrir verbete" e a busca pelo termo usam a forma em uso', async () => {
    await registrar('verbete', 'GL-900001', 'alterar', { formaEmUso: 'leão da prova' })
    abrirItem('/item/CA00001?hipotese=HY-900001')
    const painel = await screen.findByRole('dialog', { name: 'Hipótese leão da prova' })
    expect(within(painel).getByRole('heading', { level: 2, name: 'leão da prova' })).toBeInTheDocument()
    const busca = within(painel).getByRole('link', { name: 'Filtrar a busca por este termo' })
    expect(new URL(busca.getAttribute('href')!, 'http://x').searchParams.get('q')).toBe('leão da prova')
  })

  it('o painel da hipótese SKC: título, "Termos" e a busca pelo termo usam a forma em uso', async () => {
    await registrar('verbete', 'GL-900001', 'alterar', { formaEmUso: 'leão da prova' })
    await registrar('verbete', 'GL-vivos002-1', 'criar', { forma: 'outro termo', status: 'proposed' })
    await hipoteseSkc('HY-vivos002-1', 'CA00001', ['GL-900001', 'GL-vivos002-1'], ['leão-de-teste', 'outro termo'])
    await registrar('verbete', 'GL-vivos002-1', 'alterar', { formaEmUso: 'outro termo revisto' })
    abrirItem('/item/CA00001?hipotese=HY-vivos002-1')
    const painel = await screen.findByRole('dialog', { name: /^Hipótese / })
    expect(within(painel).getByRole('heading', { level: 2 })).toHaveTextContent('leão da prova')
    expect(within(painel).getByRole('link', { name: 'outro termo revisto' })).toHaveAttribute('href', '/verbete/GL-vivos002-1')
    expect(new URL(within(painel).getByRole('link', { name: 'Filtrar a busca por este termo' }).getAttribute('href')!, 'http://x').searchParams.get('q')).toBe('leão da prova')
  })

  it('as pílulas do campo Termo, ao editar a hipótese, mostram a forma em uso; o × tem nome e dica', async () => {
    await registrar('verbete', 'GL-900001', 'alterar', { formaEmUso: 'leão da prova' })
    abrirItem('/item/CA00001?hipotese=HY-vivos002-1')
    const painel = await screen.findByRole('dialog', { name: /^Hipótese / })
    await userEvent.click(within(painel).getByRole('button', { name: 'Editar a hipótese' }))
    const pilulas = within(painel).getByRole('list', { name: 'Termos escolhidos' })
    expect(within(pilulas).getByText('leão da prova')).toBeInTheDocument()
    expect(within(pilulas).getByText('outro termo revisto')).toBeInTheDocument()
    const tirar = within(pilulas).getByRole('button', { name: 'Tirar o termo leão da prova' })
    expect(tirar).toHaveAttribute('data-tip', 'Tirar o termo')
  })
})

describe('revisão 1, I2: depois de "Voltar à proposta original", o nome é o do pacote, não o rótulo guardado de quando a forma era outra', () => {
  it('a linha, o título do painel, as pílulas e o "Termos" mostram o nome do pacote; o rótulo guardado só vale sem o verbete', async () => {
    await registrar('verbete', 'GL-900001', 'alterar', { formaEmUso: 'leão da prova' })
    // a hipótese guarda o nome que o campo mostrava então (a forma em uso)
    await hipoteseSkc('HY-vivos004-1', 'CA00001', ['GL-900001', 'GL-vivos004-9'], ['leão da prova', 'guardado de um verbete que não existe'])
    await registrar('verbete', 'GL-900001', 'alterar', { formaEmUso: null })

    abrirItem('/item/CA00001?hipotese=HY-vivos004-1')
    const painel = await screen.findByRole('dialog', { name: /^Hipótese / })
    await waitFor(() => expect(painel).toHaveAccessibleName('Hipótese leão-de-teste'))
    expect(within(painel).getByRole('link', { name: 'leão-de-teste' })).toHaveAttribute('href', '/verbete/GL-900001')
    expect(within(painel).getByRole('link', { name: 'guardado de um verbete que não existe' })).toBeInTheDocument()
    expect(new URL(within(painel).getByRole('link', { name: 'Filtrar a busca por este termo' }).getAttribute('href')!, 'http://x').searchParams.get('q')).toBe('leão-de-teste')
    await userEvent.click(within(painel).getByRole('button', { name: 'Editar a hipótese' }))
    const pilulas = within(painel).getByRole('list', { name: 'Termos escolhidos' })
    expect(within(pilulas).getByText('leão-de-teste')).toBeInTheDocument()
    expect(within(pilulas).queryByText('leão da prova')).toBeNull()
  })

  it('"Hipóteses por nível": a linha também', async () => {
    abrirItem('/item/CA00001')
    await userEvent.click(await screen.findByRole('button', { name: /Hipóteses por nível/ }))
    await waitFor(() => expect(linhaDe('HY-vivos004-1')).toHaveTextContent('leão-de-teste'))
  })
})

describe('as opções do campo Termo usam a forma em uso, e a antiga também acha o verbete', () => {
  it('"leão da prova" e "leão-de-teste" acham o mesmo verbete; o rótulo da opção é o atual', async () => {
    await registrar('verbete', 'GL-900001', 'alterar', { formaEmUso: 'leão da prova' })
    abrirItem('/item/CA00001')
    await screen.findByRole('heading', { level: 1 })
    // Abre o formulário pela tecla de atalho do app (Shift+H) e escolhe o termo.
    await apertarQuandoPronto('Shift+H', 'item')
    const form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    const campo = within(form).getByRole('combobox', { name: 'Termo' })
    await userEvent.type(campo, 'leão da prova')
    const lista = await screen.findByRole('listbox', { name: 'Termo' })
    expect(await within(lista).findByRole('option', { name: /^leão da prova/ })).toBeInTheDocument()
    await userEvent.clear(campo)
    await userEvent.type(campo, 'leão-de-teste')
    const lista2 = await screen.findByRole('listbox', { name: 'Termo' })
    expect(await within(lista2).findByRole('option', { name: /^leão da prova/ })).toBeInTheDocument()
    // achado pela forma antiga: nada de "Criar termo" (o verbete já existe)
    expect(within(lista2).queryByRole('option', { name: /Criar termo/ })).toBeNull()
    expect(within(lista2).getByRole('option', { name: /^leão da prova/ })).toHaveTextContent('antes: leão-de-teste')
  })
})

describe('a página do verbete do livro lista as hipóteses SKC que usam o termo', () => {
  it('junto com as do livro, com a marca SKC, o objeto e o link para a hipótese aberta; a contagem soma as duas', async () => {
    await hipoteseSkc('HY-vivos003-1', 'CA00002', ['GL-900003'], ['olhos de botão'])
    await hipoteseSkc('HY-vivos003-2', 'CA00001', ['GL-900002'], ['figura denteada']) // outro termo: não entra
    await hipoteseSkc('HY-vivos003-3', 'CA00001', ['GL-900003'], ['olhos de botão'])
    await registrar('hipotese', 'HY-vivos003-3', 'excluir') // excluída: não entra
    renderizarRota('/verbete/GL-900003')
    const hipoteses = await screen.findByRole('region', { name: 'Hipóteses com este termo' })
    const linhas = within(hipoteses).getAllByRole('link')
    // as do livro primeiro, depois as SKC
    expect(linhas.map((a) => a.getAttribute('href'))).toEqual(['/item/CA00003?hipotese=HY-900007', '/item/CA00002?hipotese=HY-vivos003-1'])
    expect(linhas[1]).toHaveTextContent('CA00002')
    expect(linhas[1]).toHaveTextContent('iconográfico · provável · SKC')
    expect(within(linhas[1]!).getByText('SKC')).toHaveClass('marca-skc')
    expect(within(linhas[0]!).queryByText('SKC')).toBeNull()
    expect(within(hipoteses).getByText('2', { selector: '.codigo' })).toHaveTextContent('2 hipóteses')
  })
})

describe('revisão 2, m3: o nome de um termo é sempre o da forma de VERBETE (pt), também para um verbete com pt_text', () => {
  it('GL-900003 (pt_text "olho em forma de botão"): a pílula guardada com a etiqueta continua com ela depois de editar e voltar', async () => {
    // a hipótese guarda o que o campo oferece (a etiqueta, com glosa)
    await hipoteseSkc('HY-vivos005-1', 'CA00003', ['GL-900003'], ['olhos (forma de botão)'])
    abrirItem('/item/CA00003')
    await userEvent.click(await screen.findByRole('button', { name: /Hipóteses por nível/ }))
    await waitFor(() => expect(linhaDe('HY-vivos005-1')).toHaveTextContent('olhos (forma de botão)'))
    await registrar('verbete', 'GL-900003', 'alterar', { formaEmUso: 'olhos (forma de gota)' })
    await waitFor(() => expect(linhaDe('HY-vivos005-1')).toHaveTextContent('olhos (forma de gota)'))
    await registrar('verbete', 'GL-900003', 'alterar', { formaEmUso: null })
    // de volta: a etiqueta do pacote, não a forma de texto corrido
    await waitFor(() => expect(linhaDe('HY-vivos005-1')).toHaveTextContent('olhos (forma de botão)'))
    expect(linhaDe('HY-vivos005-1')).not.toHaveTextContent('olho em forma de botão')
  })
})
