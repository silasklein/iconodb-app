/**
 * 2C, bloco 1, Tarefa 2: «Excluir o objeto» no fim da página de um objeto SKC (confirmação no lugar, como «Excluir o sítio»),
 * e o que o objeto excluído deixa de aparecer (Meus objetos, coleções, mapa dos sítios, Glossário) sem que nada seja apagado:
 * `restaurarObjeto` devolve tudo ao mesmo lugar. Sobre o pacote sintético (CA00001 a CA00004), com a camada do usuário do arquivo.
 */
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { numerosDosObjetos } from '../banco/consultas'
import { useColecao, useColecoes } from '../colecoes/useColecoes'
import { criarColecao } from '../colecoes/operacoes'
import { PainelSkc } from '../colecoes/PainelSkc'
import { hipotesesDoVerbete, objetosPorVerbeteSkc } from '../glossario/doUsuario'
import { usarArmazemDasImagens, usarCacheDasImagens } from '../imagens-usuario/local'
import { usarEscritaDasImagens } from '../imagens-usuario/urls'
import { armazemMemoria } from '../pacote/armazem'
import { cacheMemoria } from '../pacote/imagens'
import { chaveDoAlvo } from '../notas/links'
import { descreverAlvo, resolverAlvos } from '../notas/alvos'
import { objetosPorSitio } from '../sitios/doUsuario'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Icon } from '../ui/Icon'
import { Item } from '../telas/Item'
import { estadoAtual, registrar } from '../usuario/estado'
import { gravarConfig } from '../usuario/diarioLocal'
import { CHAVE_DOS_CONFIRMADOS, esquecerConfirmados, unirConfirmadosGuardados } from './confirmados'
import { excluirObjeto, restaurarObjeto } from './operacoes'
import { definirFonteDosNumerosDoPacote, recarregarNumerosDoPacote } from './pacote'

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
        <Route path="/colecoes" element={<PainelSkc />} />
      </Routes>
      <Local />
    </MemoryRouter>,
  )
}

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  Element.prototype.scrollIntoView = vi.fn()
})
afterAll(() => usarMotor(null))
beforeEach(async () => {
  instalarMatchMedia(375)
  usarArmazemDasImagens(armazemMemoria())
  usarCacheDasImagens(cacheMemoria())
  usarEscritaDasImagens(async () => null)
  localStorage.clear()
  definirFonteDosNumerosDoPacote(numerosDosObjetos)
  await recarregarNumerosDoPacote()
  for (const r of estadoAtual().registros.get('objeto')?.values() ?? []) if (!r.excluido) await registrar('objeto', r.id, 'excluir')
  await gravarConfig(CHAVE_DOS_CONFIRMADOS, undefined)
  esquecerConfirmados()
})
afterEach(() => {
  usarArmazemDasImagens(undefined)
  usarCacheDasImagens(undefined)
  usarEscritaDasImagens(undefined)
  definirFonteDosNumerosDoPacote(null)
})

let n = 0
async function objeto(campos: Record<string, unknown>): Promise<string> {
  const id = `OB-texclui1-${++n}`
  await registrar('objeto', id, 'criar', { origemTipo: 'publicacao', ...campos } as never)
  return id
}
async function foto(alvo: string) {
  const id = `IM-texclui1-${++n}`
  await registrar('imagem', id, 'criar', { alvoTipo: 'objeto', alvo, formato: 'jpeg', extensao: 'jpg', nome: 'x.jpg', tipo: 'tons' } as never)
}
const nota = (alvo: string, texto = 'nota de prova') => registrar('nota', `NT-texclui1-${++n}`, 'criar', { texto, alvoTipo: 'objeto', alvo } as never)
const hipotese = (alvo: string) => registrar('hipotese', `HI-texclui1-${++n}`, 'criar', { objeto: alvo, nivel: 'iconographic', termos: ['GL-texclui1-1'] } as never)

describe('«Excluir o objeto» na página do objeto SKC', () => {
  it('é o último bloco da página, depois das notas, com o ícone «excluir»; um objeto do livro não o tem', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'Selo. Pedra.' })
    abrir(`/item/${id}`)
    const botao = await screen.findByRole('button', { name: 'Excluir o objeto' })
    const { container } = render(<Icon name="excluir" size={18} />)
    expect(botao.querySelector('svg')!.innerHTML).toBe(container.querySelector('svg')!.innerHTML)
    const leituras = screen.getByRole('region', { name: 'Leituras' })
    expect(leituras.compareDocumentPosition(botao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const ligacoes = screen.getByRole('heading', { name: 'Este objeto aparece num livro?' })
    expect(ligacoes.compareDocumentPosition(botao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('num objeto do livro não há «Excluir o objeto»', async () => {
    abrir('/item/CA00001')
    await screen.findByTestId('item-cabeca')
    expect(screen.queryByRole('button', { name: 'Excluir o objeto' })).toBeNull()
  })

  it('número confirmado, com foto e nota: a confirmação diz o que fica guardado e que o número fica reservado; o foco vai a Cancelar', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'Selo. Pedra.' })
    await unirConfirmadosGuardados({ [id]: 'CA00005', [`SKC:${id}`]: '1' })
    await foto(id)
    await nota(id)
    abrir(`/item/${id}`)
    const gatilho = await screen.findByRole('button', { name: 'Excluir o objeto' })
    await userEvent.click(gatilho)
    const grupo = await screen.findByRole('group', { name: 'Excluir o objeto CA00005?' })
    expect(grupo).toHaveTextContent('Excluir o objeto CA00005? A foto e a nota dele ficam guardadas e voltam se você restaurar. O número CA00005 fica reservado para ele.')
    expect(within(grupo).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Excluir o objeto' })).toBeNull()
    expect(estadoAtual().registro('objeto', id)!.excluido).toBe(false)
    // Cancelar fecha e devolve o foco ao botão de origem
    await userEvent.click(within(grupo).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('group', { name: /Excluir o objeto/ })).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Excluir o objeto' })).toHaveFocus())
    expect(estadoAtual().registro('objeto', id)!.excluido).toBe(false)
  })

  it('sem nada junto: só o número reservado; sem número: o título da ficha entre «»; uma coisa só concorda no singular', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'Selo. Pedra.' })
    await unirConfirmadosGuardados({ [id]: 'CA00005' })
    const a = abrir(`/item/${id}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir o objeto' }))
    expect(await screen.findByRole('group', { name: 'Excluir o objeto CA00005?' })).toHaveTextContent('Excluir o objeto CA00005? O número CA00005 fica reservado para ele.')
    a.unmount()

    const sem = await objeto({ periodo: null, titulo: 'Rascunho. Barro.' })
    await foto(sem)
    await hipotese(sem)
    await hipotese(sem)
    const b = abrir(`/item/${sem}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir o objeto' }))
    const grupo = await screen.findByRole('group', { name: 'Excluir o objeto «Rascunho. Barro.»?' })
    expect(grupo).toHaveTextContent('Excluir o objeto «Rascunho. Barro.»? A foto e as 2 hipóteses dele ficam guardadas e voltam se você restaurar.')
    expect(grupo).not.toHaveTextContent('reservado')
    b.unmount()

    const so = await objeto({ periodo: null, titulo: 'Só uma nota.' })
    await nota(so)
    abrir(`/item/${so}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir o objeto' }))
    expect(await screen.findByRole('group', { name: 'Excluir o objeto «Só uma nota.»?' })).toHaveTextContent('A nota dele fica guardada e volta se você restaurar.')
  })

  it('«Excluir» grava o evento e a página mostra «Objeto excluído. Restaurar», com o foco em «Restaurar»; Restaurar desfaz', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'Selo. Pedra.' })
    await nota(id)
    abrir(`/item/${id}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir o objeto' }))
    const grupo = await screen.findByRole('group', { name: /Excluir o objeto/ })
    await userEvent.click(within(grupo).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(estadoAtual().registro('objeto', id)!.excluido).toBe(true))
    const aviso = await screen.findByText(/Objeto excluído\./)
    expect(aviso).toHaveTextContent('Objeto excluído. Restaurar')
    expect(screen.queryByRole('group', { name: /Excluir o objeto/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Excluir o objeto' })).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restaurar' })).toHaveFocus())
    // nada mais foi escrito: a nota continua viva
    expect([...(estadoAtual().registros.get('nota')?.values() ?? [])].filter((r) => r.campos.alvo === id && !r.excluido)).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(estadoAtual().registro('objeto', id)!.excluido).toBe(false))
    expect(await screen.findByRole('button', { name: 'Excluir o objeto' })).toBeInTheDocument()
  })

  it('P1 (aprovação): logo depois de salvar, excluir tira «Objeto salvo.»; fica só «Objeto excluído. Restaurar»', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'Selo TESTE. Pedra.' })
    render(
      <MemoryRouter initialEntries={[{ pathname: `/item/${id}`, state: { objetoNovo: { imagensComErro: 0 } } }]}>
        <Routes>
          <Route path="/item/:numero" element={<Item />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/^Objeto salvo/)).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir o objeto' }))
    await userEvent.click(within(await screen.findByRole('group', { name: /Excluir o objeto/ })).getByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText(/Objeto excluído\./)).toHaveTextContent('Objeto excluído. Restaurar')
    expect(screen.queryByText(/Objeto salvo/)).toBeNull()
    // m-3: «Restaurar» na mesma visita não traz de volta o aviso de salvo
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(estadoAtual().registro('objeto', id)!.excluido).toBe(false))
    expect(await screen.findByRole('button', { name: 'Excluir o objeto' })).toBeInTheDocument()
    expect(screen.queryByText(/Objeto salvo/)).toBeNull()
  })

  it('foco da revisão 5: abrir o objeto excluído pelo endereço dele mostra o aviso e não quebra', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'Selo. Pedra.' })
    await foto(id)
    await nota(id)
    await hipotese(id)
    await excluirObjeto(id)
    abrir(`/item/${id}`)
    expect(await screen.findByText(/Objeto excluído\./)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Selo. Pedra.' })).toBeInTheDocument()
    expect(screen.queryByText(/Não foi possível|Algo deu errado/)).toBeNull()
  })
})

describe('o objeto excluído some das listas e volta ao restaurar', () => {
  it('Meus objetos', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'Selo. Pedra.' })
    await objeto({ periodo: 'CA', titulo: 'Outro. Barro.' })
    abrir('/colecoes')
    const secao = await screen.findByRole('region', { name: 'Meus objetos' })
    await waitFor(() => expect(secao).toHaveTextContent('Selo'))
    await act(() => excluirObjeto(id))
    await waitFor(() => expect(secao).not.toHaveTextContent('Selo'))
    expect(secao).toHaveTextContent('Outro')
    await act(() => restaurarObjeto(id))
    await waitFor(() => expect(secao).toHaveTextContent('Selo'))
  })

  it('coleção: a linha sai, a contagem desce, e a linha volta ao mesmo lugar ao restaurar', async () => {
    const a = await objeto({ periodo: 'CA', titulo: 'Primeiro.' })
    const b = await objeto({ periodo: 'CA', titulo: 'Segundo.' })
    const c = await objeto({ periodo: 'CA', titulo: 'Terceiro.' })
    const col = await criarColecao('Prova da exclusão', { membros: [a, b, c] })
    const { result } = renderHook(() => ({ um: useColecao(col), todas: useColecoes() }))
    expect(result.current.um!.membros.map((m) => m.ref)).toEqual([a, b, c])
    await act(() => excluirObjeto(b))
    expect(result.current.um!.membros.map((m) => m.ref)).toEqual([a, c])
    expect(result.current.todas.vivas.find((x) => x.id === col)!.membros).toHaveLength(2)
    // o registro da coleção não foi tocado
    expect(estadoAtual().registro('colecao', col)!.campos[`m:${b}`]).toBe(true)
    await act(() => restaurarObjeto(b))
    expect(result.current.um!.membros.map((m) => m.ref)).toEqual([a, b, c])
  })

  it('coleção que guarda o número (CA00005) em vez do id: também some e volta', async () => {
    const a = await objeto({ periodo: 'CA', titulo: 'Primeiro.' })
    await unirConfirmadosGuardados({ [a]: 'CA00005' })
    const col = await criarColecao('Por número', { membros: ['CA00005', 'CA00001'] })
    const { result } = renderHook(() => useColecao(col))
    await waitFor(() => expect(result.current!.membros.map((m) => m.ref).sort()).toEqual(['CA00001', 'CA00005']))
    await act(() => excluirObjeto(a))
    expect(result.current!.membros.map((m) => m.ref)).toEqual(['CA00001'])
    await act(() => restaurarObjeto(a))
    expect(result.current!.membros.map((m) => m.ref).sort()).toEqual(['CA00001', 'CA00005'])
  })

  it('mapa dos sítios: o objeto excluído sai da contagem do sítio', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'No sítio.', sitio: 'TESTE-1' })
    expect(objetosPorSitio(estadoAtual()).get('TESTE-1')).toBe(1)
    await excluirObjeto(id)
    expect(objetosPorSitio(estadoAtual()).get('TESTE-1') ?? 0).toBe(0)
    await restaurarObjeto(id)
    expect(objetosPorSitio(estadoAtual()).get('TESTE-1')).toBe(1)
  })

  it('Glossário: as hipóteses do objeto excluído saem do verbete e da contagem de objetos, e voltam', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'Com hipótese.' })
    await registrar('verbete', 'GL-texclui1-1', 'criar', { forma: 'termo de prova', status: 'proposed' } as never)
    await hipotese(id)
    expect(hipotesesDoVerbete(estadoAtual(), 'GL-texclui1-1')).toHaveLength(1)
    expect(objetosPorVerbeteSkc(estadoAtual()).get('GL-texclui1-1')).toBe(1)
    await excluirObjeto(id)
    expect(hipotesesDoVerbete(estadoAtual(), 'GL-texclui1-1')).toHaveLength(0)
    expect(objetosPorVerbeteSkc(estadoAtual()).get('GL-texclui1-1') ?? 0).toBe(0)
    await restaurarObjeto(id)
    expect(hipotesesDoVerbete(estadoAtual(), 'GL-texclui1-1')).toHaveLength(1)
  })
})

describe('as notas sobre o objeto excluído', () => {
  it('continuam em «Minhas notas», com o alvo «(excluído)»; restaurado, o alvo volta ao que era', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'Selo. Pedra.' })
    await unirConfirmadosGuardados({ [id]: 'CA00005' })
    const nome = async () => {
      const mapa = await resolverAlvos([{ tipo: 'objeto', ref: id }], estadoAtual())
      return descreverAlvo('objeto', id, mapa.get(chaveDoAlvo('objeto', id)))
    }
    expect(await nome()).not.toContain('(excluído)')
    await excluirObjeto(id)
    expect(await nome()).toBe('CA00005 (excluído)')
    await restaurarObjeto(id)
    expect(await nome()).not.toContain('(excluído)')
  })

  it('sem número, o título aparece com a marca', async () => {
    const id = await objeto({ periodo: null, titulo: 'Rascunho. Barro.' })
    await excluirObjeto(id)
    const mapa = await resolverAlvos([{ tipo: 'objeto', ref: id }], estadoAtual())
    expect(descreverAlvo('objeto', id, mapa.get(chaveDoAlvo('objeto', id)))).toBe('Rascunho. Barro. (excluído)')
  })
})
