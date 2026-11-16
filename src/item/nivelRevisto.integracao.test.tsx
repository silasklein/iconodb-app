/**
 * Parte 2C, bloco 3, Tarefa 13, nas telas e sobre o pacote sintético: rever o nível de uma hipótese dos livros no painel (no
 * celular e no computador) muda o cabeçalho, o marcador do texto, o bloco e as contagens de «Hipóteses por nível»; «Voltar ao
 * nível automático» desfaz. HY-900006 (CA00003) já vem revista no pacote (`level_auto`). Só ids TESTE.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { numerosDosObjetos } from '../banco/consultas'
import { definirFonteDosNumerosDoPacote, recarregarNumerosDoPacote } from '../objetos-skc/pacote'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { reverNivel } from '../hipoteses/niveis'
import { Item } from '../telas/Item'
import { estadoAtual, registrar } from '../usuario/estado'

vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
vi.mock('../pacote/imagens', async (original) => ({ ...(await original<typeof import('../pacote/imagens')>()), urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

function abrir(caminho: string) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/item/:numero" element={<Item />} />
      </Routes>
    </MemoryRouter>,
  )
}

const cheios = (el: Element | null) => el?.querySelectorAll('rect[data-cheio="true"]').length
const etiqueta = (painel: HTMLElement) => painel.querySelector('.painel-hipotese-etiqueta') as HTMLElement
/** O que o leitor de tela ouve da âncora da hipótese no texto: «, hipótese: <nível>, <certeza>». */
const notaDaAncora = (id: string) => document.querySelector(`a.ancora[data-hipotese="${id}"] .so-leitor`)?.textContent

async function abrirSecao() {
  const botao = await screen.findByRole('button', { name: /Hipóteses por nível/ })
  if (botao.getAttribute('aria-expanded') !== 'true') await userEvent.click(botao)
  return screen.findByRole('region', { name: 'Hipóteses por nível' })
}
const blocoDe = (secao: HTMLElement, id: string) => secao.querySelector(`[data-hipotese-linha="${id}"]`)?.closest('section')

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  Element.prototype.scrollIntoView = vi.fn()
})
afterAll(() => usarMotor(null))
beforeEach(async () => {
  localStorage.clear()
  definirFonteDosNumerosDoPacote(numerosDosObjetos)
  await recarregarNumerosDoPacote()
  for (const r of estadoAtual().registros.get('nivel')?.values() ?? []) if (!r.excluido) await registrar('nivel', r.id, 'excluir')
})
afterEach(() => definirFonteDosNumerosDoPacote(null))

describe.each([
  ['celular (folha)', 375],
  ['computador (painel lateral)', 1280],
])('o nível de uma hipótese do livro no %s', (_nome, largura) => {
  beforeEach(() => instalarMatchMedia(largura))

  it('rever muda o marcador do painel e do texto, o bloco e as contagens; voltar ao automático desfaz', async () => {
    abrir('/item/CA00001')
    const secao = await abrirSecao()
    await waitFor(() => expect(blocoDe(secao, 'HY-900001')).toHaveAccessibleName('Iconográfico'))
    expect(notaDaAncora('HY-900001')).toMatch(/hipótese: iconográfico, /)
    await userEvent.click(secao.querySelector<HTMLElement>('[data-hipotese-linha="HY-900001"]')!)
    const painel = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
    const grupo = within(painel).getByRole('radiogroup', { name: 'Nível' })
    expect(within(grupo).getByRole('radio', { name: 'iconográfico' })).toHaveAttribute('aria-checked', 'true')
    expect(painel).not.toHaveTextContent('Nível revisto por você')
    expect(within(painel).queryByRole('button', { name: 'Voltar ao nível automático' })).toBeNull()
    expect(painel).toHaveTextContent('Só o nível muda: o trecho, o termo e a certeza continuam os do livro.')

    await userEvent.click(within(grupo).getByRole('radio', { name: 'iconológico' }))
    await waitFor(() => expect(cheios(etiqueta(painel))).toBe(3))
    expect(etiqueta(painel)).toHaveTextContent(/^Iconológico · Afirmada/i)
    expect(painel).toHaveTextContent('Nível revisto por você · o automático era iconográfico.')
    expect(estadoAtual().registro('nivel', 'HY-900001')).toMatchObject({ excluido: false, campos: { nivel: 'iconological' } })
    // atrás do painel: o marcador do texto, o bloco e as contagens
    await waitFor(() => expect(notaDaAncora('HY-900001')).toMatch(/hipótese: iconológico, /))
    expect(blocoDe(secao, 'HY-900001')).toHaveAccessibleName('Iconológico')
    expect(within(secao).queryByRole('region', { name: 'Iconográfico' })).toBeNull()
    expect(within(within(secao).getByRole('region', { name: 'Iconológico' })).getByText('1 hipótese')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Hipóteses por nível/ })).toHaveTextContent('2')
    // o trecho, o termo e a certeza não mudam
    expect(painel).toHaveTextContent('leão-de-teste')

    await userEvent.click(within(painel).getByRole('button', { name: 'Voltar ao nível automático' }))
    await waitFor(() => expect(painel).not.toHaveTextContent('Nível revisto por você'))
    const iconografico = within(grupo).getByRole('radio', { name: 'iconográfico' })
    expect(iconografico).toHaveAttribute('aria-checked', 'true')
    await waitFor(() => expect(iconografico).toHaveFocus())
    expect(cheios(etiqueta(painel))).toBe(2)
    expect(estadoAtual().registro('nivel', 'HY-900001')?.excluido).toBe(true)
    await waitFor(() => expect(notaDaAncora('HY-900001')).toMatch(/hipótese: iconográfico, /))
    expect(blocoDe(secao, 'HY-900001')).toHaveAccessibleName('Iconográfico')
  })

  it('depois de publicado (`level_auto`): o registro vivo tem a nota; voltar o exclui e a hipótese vai ao automático; «Restaurar» devolve', async () => {
    // A camada tem o registro que o pacote publicou (o nível da pessoa, o mesmo do `level`).
    await reverNivel('HY-900006', 'iconographic')
    abrir('/item/CA00003?hipotese=HY-900006')
    const painel = await screen.findByRole('dialog', { name: /^Hipótese / })
    await waitFor(() => expect(painel).toHaveTextContent('Nível revisto por você · o automático era pré-iconográfico.'))
    expect(within(painel).getByRole('radio', { name: 'iconográfico' })).toHaveAttribute('aria-checked', 'true')
    // M1: a nota é uma região viva, e o seletor é descrito por ela e pela ajuda
    const nota = within(painel).getByRole('status')
    expect(nota).toHaveTextContent('Nível revisto por você · o automático era pré-iconográfico.')
    const grupo = within(painel).getByRole('radiogroup', { name: 'Nível' })
    expect(grupo).toHaveAccessibleDescription(/^Nível revisto por você · o automático era pré-iconográfico\. Só o nível muda:/)

    await userEvent.click(within(painel).getByRole('button', { name: 'Voltar ao nível automático' }))
    await waitFor(() => expect(painel).not.toHaveTextContent('Nível revisto por você'))
    expect(estadoAtual().registro('nivel', 'HY-900006')?.excluido).toBe(true)
    expect(within(painel).getByRole('radio', { name: 'pré-iconográfico' })).toHaveAttribute('aria-checked', 'true')
    expect(cheios(etiqueta(painel))).toBe(1)
    // a região viva continua montada, vazia
    expect(within(painel).getByRole('status')).toBe(nota)
    expect(nota).toBeEmptyDOMElement()
    const secao = await abrirSecao()
    expect(blocoDe(secao, 'HY-900006')).toHaveAccessibleName('Pré-iconográfico')

    // «Restaurar» (Excluídos) devolve o nível da pessoa, com a nota
    await registrar('nivel', 'HY-900006', 'restaurar')
    await waitFor(() => expect(nota).toHaveTextContent('Nível revisto por você · o automático era pré-iconográfico.'))
    await waitFor(() => expect(blocoDe(secao, 'HY-900006')).toHaveAccessibleName('Iconográfico'))
  })

  it('depois de publicado, sem registro vivo: vale o automático, sem nota', async () => {
    abrir('/item/CA00003?hipotese=HY-900006')
    const painel = await screen.findByRole('dialog', { name: /^Hipótese / })
    await waitFor(() => expect(within(painel).getByRole('radio', { name: 'pré-iconográfico' })).toHaveAttribute('aria-checked', 'true'))
    expect(painel).not.toHaveTextContent('Nível revisto por você')
    expect(within(painel).queryByRole('button', { name: 'Voltar ao nível automático' })).toBeNull()
    expect(cheios(etiqueta(painel))).toBe(1)
  })
})

describe('a hipótese que sumiu do pacote e a SKC', () => {
  beforeEach(() => instalarMatchMedia(375))

  it('foco 4: o nível revisto de uma hipótese que o pacote não tem não muda nada nem quebra a tela', async () => {
    await registrar('nivel', 'HY-999999', 'criar', { nivel: 'iconological' })
    abrir('/item/CA00001')
    const secao = await abrirSecao()
    await waitFor(() => expect(blocoDe(secao, 'HY-900001')).toHaveAccessibleName('Iconográfico'))
    expect(blocoDe(secao, 'HY-900002')).toHaveAccessibleName('Pré-iconográfico')
    expect(within(secao).queryByRole('region', { name: 'Iconológico' })).toBeNull()
  })

  it('a hipótese SKC fica como era: o nível dela se edita em «Editar a hipótese», sem a nota nem o registro `nivel`', async () => {
    const id = 'HY-testeaaa-77'
    await registrar('hipotese', id, 'criar', { objeto: 'CA00001', sobre: 'objeto', elemento: null, elementoRotulo: '', termos: ['GL-900002'], termosRotulos: ['figura denteada'], nivel: 'iconographic', modalidade: 'probable', justificativa: '', ancora: null })
    abrir(`/item/CA00001?hipotese=${id}`)
    const painel = await screen.findByRole('dialog', { name: 'Hipótese figura denteada' })
    expect(painel).not.toHaveTextContent('Só o nível muda')
    expect(within(painel).queryByRole('radiogroup', { name: 'Nível' })).toBeNull()
    await userEvent.click(within(painel).getByRole('button', { name: 'Editar a hipótese' }))
    await userEvent.click(within(painel).getByRole('radio', { name: 'iconológico' }))
    await waitFor(() => expect(estadoAtual().registro('hipotese', id)?.campos.nivel).toBe('iconological'))
    expect(estadoAtual().registro('nivel', id)).toBeUndefined()
    expect(painel).not.toHaveTextContent('Nível revisto por você')
  })
})
