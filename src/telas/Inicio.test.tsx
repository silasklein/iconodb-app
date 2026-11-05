import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { grupos } from '../banco/consultas'
import { urlImagem } from '../pacote/imagens'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { definirSync, zerarSync } from '../../tests/suporte/syncSimulada'
import { Inicio } from './Inicio'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

function Onde() {
  const { pathname, search } = useLocation()
  return <p data-testid="onde">{pathname + search}</p>
}

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="*" element={<Onde />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Início', () => {
  beforeAll(async () => usarMotor(await bancoDeTeste()))
  afterAll(() => usarMotor(null))
  afterEach(() => instalarMatchMedia(375))

  it('mostra o logo 38 x 22, o título e as contagens do pacote', async () => {
    abrir()
    const logo = screen.getByRole('img', { name: 'Logo SKC' })
    expect(logo).toHaveAttribute('width', '38')
    expect(logo).toHaveAttribute('height', '22')
    expect(screen.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeInTheDocument()
    const contagens = screen.getByRole('group', { name: 'O que há no banco' })
    await waitFor(() => expect(within(contagens).getByText('Objetos').nextElementSibling).toHaveTextContent('6'))
    expect(within(contagens).getByText('Hipóteses').nextElementSibling).toHaveTextContent('9')
    expect(within(contagens).getByText('Verbetes').nextElementSibling).toHaveTextContent('10') // com o GL-900010 (Tarefa 16)
  })

  it('tem o campo de busca com nome visível "Buscar" e o placeholder genérico', () => {
    abrir()
    const campo = screen.getByRole('combobox', { name: 'Buscar' })
    expect(campo).toHaveAttribute('placeholder', 'termo, sítio ou número…')
    expect(screen.getByText('Buscar', { selector: 'label' })).toBeVisible()
  })

  it('Enter leva à Busca com o que foi digitado', async () => {
    abrir()
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar' }), 'leão{Enter}')
    expect(screen.getByTestId('onde')).toHaveTextContent('/busca?q=le%C3%A3o')
  })

  it('oferece as entradas Coleções, Glossário, Sítios, Bibliografia e Minhas notas', () => {
    abrir()
    const nav = screen.getByRole('navigation', { name: 'Entradas' })
    const esperado: [string, string][] = [
      ['Coleções', '/colecoes'],
      ['Glossário', '/glossario'],
      ['Sítios', '/sitios'],
      ['Bibliografia', '/bibliografia'],
      ['Minhas notas', '/notas'],
    ]
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(esperado.map(([nome]) => nome))
    for (const [nome, href] of esperado) expect(within(nav).getByRole('link', { name: nome })).toHaveAttribute('href', href)
  })

  it('a imagem decorativa é a capa do primeiro grupo do pacote', async () => {
    abrir()
    const primeiro = (await grupos())[0]!
    expect(primeiro.capa).not.toBeNull()
    const imagem = await waitFor(() => {
      const el = document.querySelector('.inicio-capa img')
      expect(el).not.toBeNull()
      return el!
    })
    expect(imagem).toHaveAttribute('src', `blob:${primeiro.capa!.miniatura}`)
    expect(imagem).toHaveAttribute('alt', '')
    expect(urlImagem).toHaveBeenCalledWith(primeiro.capa!.miniatura)
  })

  it('sem a imagem no aparelho e sem internet, não desenha nada no lugar (nem imagem quebrada)', async () => {
    vi.mocked(urlImagem).mockResolvedValueOnce(null)
    abrir()
    await screen.findByRole('heading', { level: 1 })
    await new Promise((r) => setTimeout(r, 20))
    expect(document.querySelector('.inicio-capa img')).toBeNull()
  })

  describe('celular', () => {
    it('tem a lupa, o menu e, tudo sincronizado, nenhum indicador de sincronização', () => {
      zerarSync()
      abrir()
      expect(screen.getByRole('button', { name: 'Buscar' })).toHaveAttribute('aria-keyshortcuts', '/')
      expect(screen.getByRole('button', { name: 'Abrir o menu' })).toBeInTheDocument()
      expect(screen.queryByLabelText(/sincroniz/i)).not.toBeInTheDocument()
    })

    it('com algo por enviar, o indicador (com o ponto) aparece antes da lupa e abre o menu', async () => {
      zerarSync()
      definirSync({ porEnviar: 3 })
      abrir()
      const indicador = screen.getByRole('button', { name: '3 alterações por enviar — abrir sincronização' })
      expect(indicador.querySelector('[data-marca="ponto"]')).not.toBeNull()
      expect(indicador.nextElementSibling).toBe(screen.getByRole('button', { name: 'Buscar' }))
      await userEvent.click(indicador)
      expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument()
      expect(indicador).toHaveAttribute('aria-expanded', 'true')
      zerarSync()
    })

    it('a lupa leva o foco ao campo', async () => {
      abrir()
      await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))
      expect(screen.getByRole('combobox', { name: 'Buscar' })).toHaveFocus()
    })

    it('o menu abre como folha, Esc fecha e o foco volta ao botão', async () => {
      abrir()
      const botao = screen.getByRole('button', { name: 'Abrir o menu' })
      await userEvent.click(botao)
      expect(botao).toHaveAttribute('aria-expanded', 'true')
      const folha = screen.getByRole('dialog', { name: 'Menu' })
      expect(folha).toHaveClass('menu-folha')
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
      expect(botao).toHaveFocus()
    })
  })

  describe('computador', () => {
    it('não repete o logo, a lupa e o menu (a barra superior os traz) e tem o campo grande', () => {
      instalarMatchMedia(1280)
      abrir()
      act(() => definirSync({ porEnviar: 3 }))
      expect(screen.queryByRole('button', { name: 'Abrir o menu' })).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/por enviar/)).not.toBeInTheDocument()
      act(() => zerarSync())
      expect(screen.queryByRole('img', { name: 'Logo SKC' })).not.toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Buscar' })).toBeInTheDocument()
      expect(document.querySelector('.campo-busca-inicio')).not.toBeNull()
      expect(screen.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeInTheDocument()
    })
  })
})
