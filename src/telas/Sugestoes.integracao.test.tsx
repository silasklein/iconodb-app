import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { usarTabelaDeFold } from '../busca/fold'
import { lerRecentes, adicionarRecente } from '../busca/recentes'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { BarraSuperior } from '../ui/BarraSuperior'
import { Busca } from './Busca'
import { Inicio } from './Inicio'

/**
 * As sugestões nos três lugares onde há campo de busca (decisão 32): o Início, a barra superior e a tela Busca,
 * sobre o pacote sintético de verdade (consultas, dobra e miniaturas incluídas; só a rede e a sincronização são simuladas).
 */
vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

function Onde() {
  const { pathname, search } = useLocation()
  return <p data-testid="onde">{pathname + search}</p>
}
const onde = () => screen.getByTestId('onde').textContent

function abrir(url: string, ...extras: React.ReactNode[]) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      {extras}
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/busca" element={<Busca />} />
        <Route path="*" element={<p>outra tela</p>} />
      </Routes>
      <Onde />
    </MemoryRouter>,
  )
}
const campo = () => screen.getByRole('combobox', { name: 'Buscar' })

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
})
afterAll(() => {
  usarMotor(null)
  usarTabelaDeFold(null)
})
beforeEach(() => localStorage.clear())
afterEach(() => instalarMatchMedia(375))

describe('sugestões no Início', () => {
  it('celular: digitar mostra os verbetes e os objetos do pacote; tocar vai direto ao destino', async () => {
    abrir('/')
    await userEvent.type(campo(), 'lea')
    const lista = await screen.findByRole('listbox', { name: 'Sugestões para «lea»' })
    expect(within(lista).getByRole('group', { name: 'Verbetes' })).toBeInTheDocument()
    const objetos = within(lista).getByRole('group', { name: 'Objetos' })
    // o tipo curto, o número e a miniatura (pelo caminho do pacote, via urlImagem)
    const ca1 = within(objetos).getByRole('option', { name: /CA00001/ })
    expect(ca1).toHaveTextContent('Pingente com leão-de-teste')
    await waitFor(() => expect(ca1.querySelector('img')).toHaveAttribute('src', 'blob:imagens/TESTE/TESTE-0001/thumb-1.webp'))
    expect([...lista.querySelectorAll('.forte')].every((f) => f.textContent === 'leã')).toBe(true)

    await userEvent.click(within(lista).getByRole('option', { name: /^leão-de-teste/ }))
    expect(onde()).toBe('/verbete/GL-900001')
    expect(lerRecentes()).toEqual(['leão-de-teste'])
  })

  it('computador: ↓ Enter abre a sugestão; Enter sem seleção vai à Busca; as recentes voltam no campo vazio', async () => {
    instalarMatchMedia(1280)
    abrir('/')
    await userEvent.type(campo(), 'mah')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{ArrowDown}')
    const ativa = document.getElementById(campo().getAttribute('aria-activedescendant')!)!
    expect(ativa).toHaveAttribute('aria-selected', 'true')
    expect(document.querySelector('.sugestoes-rodape')).toHaveTextContent('↑↓ navegar')
    await userEvent.keyboard('{ArrowUp}{Enter}')
    expect(onde()).toBe('/busca?q=mah')
    expect(lerRecentes()).toEqual(['mah'])
  })

  it('campo vazio em foco: as buscas recentes deste aparelho', async () => {
    for (const r of ['Mepido', 'íbex']) adicionarRecente(r)
    abrir('/')
    await userEvent.click(campo())
    const lista = await screen.findByRole('listbox', { name: 'Buscas recentes' })
    expect(within(lista).getAllByRole('option').map((o) => o.textContent)).toEqual(['íbex', 'Mepido'])
    await userEvent.click(within(lista).getByRole('option', { name: 'Mepido' }))
    expect(onde()).toBe('/busca?q=Mepido')
  })
})

describe('sugestões na barra superior (computador)', () => {
  it('fora da Busca: a lista sai sob o campo da barra e escolher leva ao destino', async () => {
    instalarMatchMedia(1280)
    abrir('/colecoes', <BarraSuperior />)
    await userEvent.type(campo(), 'tell')
    const lista = await screen.findByRole('listbox')
    expect(lista.closest('.sugestoes')).not.toBeNull()
    expect(lista.closest('.campo-busca-barra')).not.toBeNull()
    await userEvent.click(within(within(lista).getByRole('group', { name: 'Sítios' })).getByRole('option', { name: /Tell Probe Teste/ }))
    expect(onde()).toBe('/sitio/TESTE-2')
  })

  it('na Busca: digitar continua atualizando o resultado e a lista aparece por cima, sem mexer no resultado', async () => {
    instalarMatchMedia(1280)
    abrir('/busca?q=mahtes', <BarraSuperior />)
    const resultados = await screen.findByRole('region', { name: 'Resultados' })
    expect(await within(resultados).findByRole('link', { name: /CA00002/ })).toBeInTheDocument()
    await userEvent.clear(campo())
    await userEvent.type(campo(), 'tell')
    await waitFor(() => expect(onde()).toBe('/busca?q=tell'))
    const lista = await screen.findByRole('listbox')
    expect(within(within(lista).getByRole('group', { name: 'Sítios' })).getByRole('option', { name: /Tell Probe Teste/ })).toBeInTheDocument()
    // o resultado continua no lugar, não dentro nem empurrado pela lista
    expect(resultados.contains(lista)).toBe(false)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(campo()).toHaveValue('tell')
  })
})

describe('sugestões na tela Busca (celular)', () => {
  it('o campo da página tem a lista; Enter ainda busca; a sugestão leva ao destino', async () => {
    abrir('/busca?q=mahtes')
    await screen.findByRole('region', { name: 'Resultados' })
    await userEvent.clear(campo())
    await userEvent.type(campo(), 'lea')
    await waitFor(() => expect(onde()).toBe('/busca?q=lea'))
    const lista = await screen.findByRole('listbox')
    expect(within(lista).getByRole('option', { name: /^leão-de-teste/ })).toBeInTheDocument()
    await userEvent.click(within(lista).getByRole('option', { name: /CA00001/ }))
    expect(onde()).toBe('/item/CA00001')
  })
})
