/**
 * "Comparar (n/4)" no Item e no objeto SKC, a tecla Shift+C (que não é a C da coleção), a mensagem de cada caso e o Menu com
 * o mesmo contador, sobre o pacote sintético.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { numerosDosObjetos } from '../banco/consultas'
import { definirFonteDosNumerosDoPacote, recarregarNumerosDoPacote } from '../objetos-skc/pacote'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Item } from '../telas/Item'
import { Menu } from '../telas/Menu'
import { estadoAtual, registrar } from '../usuario/estado'
import { lerBandeja, REG_DA_BANDEJA } from './modelo'
import { acrescentarVariasABandeja, esvaziarBandeja } from './operacoes'
import { apertarQuandoPronto } from '../test/teclas'

vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
vi.mock('../pacote/imagens', async (original) => ({ ...(await original<typeof import('../pacote/imagens')>()), urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

function Local() {
  const { pathname } = useLocation()
  return <output data-testid="local">{pathname}</output>
}
function abrir(caminho: string) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/item/:numero" element={<Item />} />
        <Route path="*" element={null} />
      </Routes>
      <Local />
    </MemoryRouter>,
  )
}
const local = () => screen.getByTestId('local').textContent
const bandeja = () => lerBandeja(estadoAtual().registro('comparar', REG_DA_BANDEJA))
const aviso = () => screen.getByRole('status', { name: 'Mensagem da comparação' })
/** Sinal de que as teclas do item já estão registradas (o ícone de idioma é desenhado pelo mesmo componente que as registra). */
const pronto = () => screen.findByRole('button', { name: 'Mostrar o original alemão', hidden: true })

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  Element.prototype.scrollIntoView = vi.fn()
})
afterAll(() => usarMotor(null))
beforeEach(async () => {
  instalarMatchMedia(1280)
  definirFonteDosNumerosDoPacote(numerosDosObjetos)
  await recarregarNumerosDoPacote()
  await esvaziarBandeja()
  for (const r of estadoAtual().registros.get('objeto')?.values() ?? []) if (!r.excluido) await registrar('objeto', r.id, 'excluir')
})
afterEach(() => {
  definirFonteDosNumerosDoPacote(null)
  instalarMatchMedia(375)
})

describe('o botão Comparar no Item', () => {
  it('"Comparar (0/4)": ao clicar o objeto entra, a mensagem diz e o contador sobe', async () => {
    abrir('/item/CA00001')
    await pronto()
    const botao = screen.getByRole('button', { name: 'Comparar (0/4)' })
    expect(botao).toHaveAttribute('aria-keyshortcuts', 'Shift+C')
    expect(botao).toHaveAttribute('data-tip', 'Comparar (0/4) (Shift+C)')
    await userEvent.click(botao)
    await waitFor(() => expect(bandeja().itens).toEqual(['CA00001']))
    await waitFor(() => expect(aviso()).toHaveTextContent('CA00001 entrou na comparação (1/4).'))
    expect(await screen.findByRole('button', { name: 'Comparar (1/4)' })).toBeInTheDocument()
    await waitFor(() => expect(within(aviso()).getByRole('link', { name: 'Abrir Comparar' })).toHaveAttribute('href', '/comparar'))
  })

  it('o mesmo objeto duas vezes não grava de novo e a mensagem diz que já está', async () => {
    abrir('/item/CA00001')
    await pronto()
    await userEvent.click(screen.getByRole('button', { name: 'Comparar (0/4)' }))
    await waitFor(() => expect(bandeja().itens).toEqual(['CA00001']))
    const eventos = estadoAtual().historico(REG_DA_BANDEJA, 'm:CA00001', 'comparar').length
    await userEvent.click(screen.getByRole('button', { name: 'Comparar (1/4)' }))
    await waitFor(() => expect(aviso()).toHaveTextContent('CA00001 já está na comparação.'))
    expect(bandeja().itens).toEqual(['CA00001'])
    expect(estadoAtual().historico(REG_DA_BANDEJA, 'm:CA00001', 'comparar')).toHaveLength(eventos)
  })

  it('com 4 na bandeja: diz que está cheia, não grava e oferece abrir Comparar para tirar um', async () => {
    await acrescentarVariasABandeja(['CA00002', 'CA00003', 'CA00004', 'BA00001'])
    abrir('/item/CA00001')
    await pronto()
    await userEvent.click(screen.getByRole('button', { name: 'Comparar (4/4)' }))
    await waitFor(() => expect(aviso()).toHaveTextContent('A comparação já tem 4 objetos. Abra Comparar para tirar um.'))
    expect(bandeja().itens).toEqual(['CA00002', 'CA00003', 'CA00004', 'BA00001'])
    await userEvent.click(within(aviso()).getByRole('link', { name: 'Abrir Comparar' }))
    expect(local()).toBe('/comparar')
  })

  it('Shift+C faz o mesmo que o botão', async () => {
    abrir('/item/CA00001')
    await pronto()
    await apertarQuandoPronto('Shift+C', 'item')
    await waitFor(() => expect(bandeja().itens).toEqual(['CA00001']))
  })

  it('Shift+C não faz também o C (a folha das coleções não abre) e o C sozinho não põe na comparação', async () => {
    abrir('/item/CA00001')
    await pronto()
    await apertarQuandoPronto('Shift+C', 'item')
    await waitFor(() => expect(bandeja().itens).toEqual(['CA00001']))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('region', { name: /coleç/i })).toBeNull()
    await esvaziarBandeja()
    await apertarQuandoPronto('c', 'item')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adicionar à coleção' })).toHaveAttribute('aria-expanded', 'true'))
    expect(bandeja().todos).toEqual([])
  })

  it('no celular o botão também está (alvo de toque), na barra do topo', async () => {
    instalarMatchMedia(375)
    abrir('/item/CA00001')
    await screen.findByRole('button', { name: 'Comparar (0/4)' })
  })

  it('a dica e o rótulo de todo lugar vêm do mesmo contador', async () => {
    await acrescentarVariasABandeja(['CA00002', 'CA00003'])
    abrir('/item/CA00001')
    await pronto()
    expect(screen.getByRole('button', { name: 'Comparar (2/4)' })).toBeInTheDocument()
  })
})

describe('o botão Comparar num objeto SKC', () => {
  it('põe o objeto na bandeja pelo id (que não muda com o número provisório); Shift+C também', async () => {
    const id = 'OB-skcteste-1'
    await registrar('objeto', id, 'criar', { origemTipo: 'achado', achado: 'x', periodo: 'CA', titulo: 'Selo SKC' } as never)
    abrir(`/item/${id}`)
    const botao = await screen.findByRole('button', { name: 'Comparar (0/4)' })
    await userEvent.click(botao)
    await waitFor(() => expect(bandeja().itens).toEqual([id]))
    await waitFor(() => expect(aviso()).toHaveTextContent(/entrou na comparação \(1\/4\)\./))
    await esvaziarBandeja()
    await screen.findByRole('button', { name: 'Comparar (0/4)' })
    // As teclas do objeto SKC já estão registradas (o botão que o mesmo componente desenha está na tela): uma tecla só, e então se espera o resultado.
    await apertarQuandoPronto('Shift+C', 'item')
    await waitFor(() => expect(bandeja().itens).toEqual([id]))
  })
})

describe('o Menu', () => {
  it('"Comparar" leva a /comparar e mostra o contador, o mesmo do botão', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002'])
    render(
      <MemoryRouter>
        <Menu variante="folha" aoFechar={() => {}} gatilho={null} />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: 'Menu' })
    const link = within(nav).getByRole('link', { name: /Comparar/ })
    expect(link).toHaveAttribute('href', '/comparar')
    expect(link).toHaveTextContent('2/4')
  })
})
