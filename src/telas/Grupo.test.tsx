import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { grupo } from '../banco/consultas'
import { urlImagem } from '../pacote/imagens'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Grupo } from './Grupo'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

function Item() {
  const { pathname, state } = useLocation()
  return <pre data-testid="item">{JSON.stringify({ pathname, state })}</pre>
}

function abrir(id = 'GR-TESTE-I-01') {
  return render(
    <MemoryRouter initialEntries={[`/grupo/${id}`]}>
      <Routes>
        <Route path="/grupo/:id" element={<Grupo />} />
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
    expect(await screen.findByRole('heading', { level: 1, name: g.titulo })).toBeInTheDocument()
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
    expect(g.introducao).not.toBeNull()
    const botao = await screen.findByRole('button', { name: 'Ler a introdução' })
    await userEvent.click(botao)
    const regiao = screen.getByRole('region', { name: 'Introdução do grupo' })
    expect(regiao).toHaveTextContent((g.introducao!.texto ?? g.introducao!.original).slice(0, 30))
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
      origem: { rotulo: g.titulo, caminho: '/grupo/GR-TESTE-I-01' },
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
    abrir()
    await screen.findByRole('heading', { level: 1 })
    const trilha = screen.getByRole('navigation', { name: 'Trilha' })
    expect(within(trilha).getByRole('link', { name: 'Coleções' })).toHaveAttribute('href', '/colecoes?obra=TESTE-I')
    expect(trilha).toHaveTextContent('TESTE I')
    expect(screen.queryByRole('link', { name: 'Voltar às coleções' })).not.toBeInTheDocument()
  })

  it('um grupo que não existe avisa e volta às coleções', async () => {
    abrir('GR-NAO-HA')
    expect(await screen.findByRole('status')).toHaveTextContent('Grupo não encontrado')
    expect(screen.getByRole('link', { name: 'Ver as coleções' })).toHaveAttribute('href', '/colecoes')
  })
})
