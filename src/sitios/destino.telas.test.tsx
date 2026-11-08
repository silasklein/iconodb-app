/**
 * Parte 2C, bloco 2 (Tarefa 10): o sítio mesclado como um só em todo o app. O pacote sintético 8 traz TESTE-4 «Tel Probe Teste»
 * mesclado em TESTE-2 «Tell Probe Teste» (o redirecionamento livro → livro do processamento), TESTE-5 «Área Probe Teste» parte de
 * TESTE-2 e TESTE-6 «Túmulo Probe Teste» parte de TESTE-5; TESTE-7 e TESTE-8 sem relação. A grafia «Probetal Teste» de TESTE-2
 * está no pacote como `origem = 'usuario'`, mas o app lê as grafias da pessoa só da camada (F12): o teste a escreve na camada.
 */
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { buscar } from '../busca/consulta'
import { sugerir } from '../busca/sugestoes'
import { MemoryRouter } from 'react-router'
import { Menu } from '../telas/Menu'
import { tabelaDoPacote } from '../busca/fold'
import { montarFila } from '../revisao/fila'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { estadoAtual, registrar } from '../usuario/estado'
import { objetosPorSitio, sitiosNaoResolvidos, useOpcoesDeSitio, useSitiosVivos } from './doUsuario'
import { desfazerMescla, mesclarSitios } from './operacoes'
import { pacoteDeSitios } from './pacote'
import { destinosDosSitios, useResolucaoDeSitios } from './useResolucao'
import { resolverSitios } from './resolucao'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
  await registrar('sitio', 'TESTE-2', 'alterar', { grafias: [{ texto: 'Probetal Teste', tradicao: 'alema' }] })
  // Um sítio do usuário com um objeto SKC e um objeto do livro ligado a ele: mesclado em TESTE-1 no teste que o pede.
  await registrar('sitio', 'SI-aaaaaaaa-1', 'criar', { nome: 'Tell Absorvido Teste', lat: 30.04, lon: 31.24 })
  await registrar('objeto', 'OB-aaaaaaaa-1', 'criar', { periodo: 'CA', titulo: 'Objeto no absorvido', sitio: 'SI-aaaaaaaa-1', sitioNome: 'Tell Absorvido Teste', origemTipo: 'achado' })
  // Um objeto do livro trocado para o sítio absorvido do pacote.
  await registrar('item-sitio', 'CA00001', 'alterar', { sitio: 'TESTE-4', sitioNome: 'Tel Probe Teste' })
})
afterAll(() => usarMotor(null))
afterEach(() => instalarMatchMedia(375))

const linhas = () => [...document.querySelectorAll<HTMLElement>('.sitio-linha')].map((l) => l.dataset.sitio)
const pontos = () => [...document.querySelectorAll<HTMLElement>('[data-ponto]')].map((p) => p.getAttribute('aria-label')!)
const endereco = () => screen.getByTestId('endereco')
const linhaDe = (id: string) => document.querySelector<HTMLElement>(`.sitio-linha[data-sitio="${id}"]`)

describe('o absorvido não aparece: a lista, o mapa, as opções e o nome vão ao destino', () => {
  it('a lista dos sítios não tem TESTE-4; TESTE-2 conta o objeto trocado para TESTE-4 e acha-se pelo nome dele', async () => {
    renderizarRota('/sitios')
    await waitFor(() => expect(linhas()).toContain('TESTE-2'))
    await waitFor(() => expect(linhas()).not.toContain('TESTE-4'))
    expect(linhas()).toEqual(['TESTE-5', 'TESTE-8', 'TESTE-1', 'TESTE-7', 'SI-aaaaaaaa-1', 'TESTE-2', 'TESTE-3', 'TESTE-6'])
    // 3 do livro + CA00001 trocado para TESTE-4 (absorvido); TESTE-5 e TESTE-6 (as partes) não têm objetos
    expect(linhaDe('TESTE-2')).toHaveTextContent('4 objetos')
    const campo = screen.getByRole('searchbox', { name: 'Buscar sítio' })
    await userEvent.type(campo, 'tel probe')
    await waitFor(() => expect(linhas()).toEqual(['TESTE-2']))
    await userEvent.clear(campo)
    await userEvent.type(campo, 'probetal')
    await waitFor(() => expect(linhas()).toEqual(['TESTE-2']))
  })

  it('o mapa não tem o ponto de TESTE-4 (outra coordenada que a de TESTE-2)', async () => {
    instalarMatchMedia(1280, { hover: true })
    renderizarRota('/sitios')
    await screen.findByRole('group', { name: 'Mapa dos sítios' })
    await waitFor(() => expect(pontos().some((p) => p.startsWith('Tell Probe Teste'))).toBe(true))
    await waitFor(() => expect(pontos().some((p) => p.startsWith('Tel Probe Teste'))).toBe(false))
    expect(pontos().find((p) => p.startsWith('Tell Probe Teste'))).toBe('Tell Probe Teste, 4 objetos')
  })

  it('as opções do campo de escolha não têm TESTE-4; TESTE-2 acha-se pelo nome dele e pela grafia da pessoa', async () => {
    const { result } = renderHook(() => useOpcoesDeSitio())
    await waitFor(() => expect(result.current.some((o) => o.id === 'TESTE-2' && o.grafias.includes('Tel Probe Teste'))).toBe(true))
    expect(result.current.map((o) => o.id)).not.toContain('TESTE-4')
    const t2 = result.current.find((o) => o.id === 'TESTE-2')!
    expect(t2.grafias).toEqual(expect.arrayContaining(['Probetal Teste', 'Tel Probe Teste']))
    expect(t2.objetos).toBe(4)
    // as grafias dos livros (sitio_grafia, origem livro) também acham: a de TESTE-1
    expect(result.current.find((o) => o.id === 'TESTE-1')!.grafias).toContain('al-Maḥṭaṣ Teste')
  })

  it('useSitiosVivos().nome(TESTE-4) é o nome do destino; a contagem da pessoa vai ao destino', async () => {
    const { result } = renderHook(() => ({ vivos: useSitiosVivos(), r: useResolucaoDeSitios() }))
    await waitFor(() => expect(result.current.r).not.toBeNull())
    await waitFor(() => expect(result.current.vivos.nome('TESTE-4', 'guardado')).toBe('Tell Probe Teste'))
    const destinos = destinosDosSitios(result.current.r!)
    expect(objetosPorSitio(estadoAtual(), destinos).get('TESTE-2')).toBe(1)
    expect(objetosPorSitio(estadoAtual(), destinos).has('TESTE-4')).toBe(false)
  })

  it('as sugestões da busca: «tel probe» e «probetal» sugerem Tell Probe Teste (TESTE-2), nunca TESTE-4', async () => {
    const tabela = await tabelaDoPacote()
    for (const q of ['tel probe', 'probetal']) {
      const s = await sugerir(q, { tabela })
      expect(s.sitios.map((x) => x.ref), q).toContain('TESTE-2')
      expect(s.sitios.map((x) => x.ref), q).not.toContain('TESTE-4')
      expect(s.sitios.find((x) => x.ref === 'TESTE-2')!.destino).toBe('/sitio/TESTE-2')
    }
  })
})

describe('a busca (a página inteira) vale pelo destino (especificação §7)', () => {
  const opcoesDoSitio = (r: Awaited<ReturnType<typeof buscar>>) => r.facetas.find((f) => f.chave === 'sitio')!.opcoes.map((o) => [o.valor, o.rotulo, o.n])

  it('a faceta Sítio mostra só destinos: o objeto trocado para TESTE-4 conta em Tell Probe Teste (TESTE-2)', async () => {
    const r = await buscar('mahtes', { escopo: 'tudo', filtros: {}, tabela: await tabelaDoPacote() })
    expect(r.numeros).toContain('CA00001')
    const opcoes = opcoesDoSitio(r)
    expect(opcoes.map(([v]) => v)).not.toContain('TESTE-4')
    expect(opcoes).toContainEqual(['TESTE-2', 'Tell Probe Teste', 1])
  })

  it('o nome de um absorvido acha os objetos do destino', async () => {
    const r = await buscar('tel probe', { escopo: 'local', filtros: {}, tabela: await tabelaDoPacote() })
    expect(r.numeros).toEqual(expect.arrayContaining(['CA00003', 'CA00004', 'BA00002']))
  })

  it('uma grafia da pessoa num absorvido acha os objetos do destino; o absorvido não aparece como acerto seu', async () => {
    await registrar('sitio', 'TESTE-4', 'alterar', { grafias: [{ texto: 'Absorvidal Teste', tradicao: 'alema' }] })
    const r = await buscar('absorvidal', { escopo: 'tudo', filtros: {}, tabela: await tabelaDoPacote() })
    expect(r.numeros).toEqual(expect.arrayContaining(['CA00003', 'CA00004', 'BA00002', 'CA00001']))
    expect(r.usuario.map((a) => a.ref)).not.toContain('TESTE-4')
  })

  it('o nome de um sítio seu mesclado em TESTE-1 acha os objetos de TESTE-1, e o sítio seu não aparece como acerto', async () => {
    await mesclarSitios('TESTE-1', 'SI-aaaaaaaa-1')
    try {
      const r = await buscar('tell absorvido', { escopo: 'tudo', filtros: {}, tabela: await tabelaDoPacote() })
      expect(r.numeros).toEqual(expect.arrayContaining(['CA00002', 'BA00001']))
      expect(r.usuario.map((a) => a.ref)).not.toContain('SI-aaaaaaaa-1')
      expect(opcoesDoSitio(r).map(([v]) => v)).not.toContain('SI-aaaaaaaa-1')
    } finally {
      await desfazerMescla('SI-aaaaaaaa-1', [])
    }
  })
})

describe('o Menu conta os sítios como a lista', () => {
  it('8 sítios: os 8 do pacote menos TESTE-4 (mesclado em TESTE-2), mais o seu', async () => {
    render(
      <MemoryRouter>
        <Menu variante="folha" aoFechar={() => undefined} />
      </MemoryRouter>,
    )
    const sitiosLink = await screen.findByRole('link', { name: /Sítios/ })
    await waitFor(() => expect(sitiosLink).toHaveTextContent('8 sítios'))
  })
})

describe('um sítio do usuário mesclado num do livro (mescladoEm), e a mescla desfeita', () => {
  it('some da lista e das opções; os objetos dele contam em TESTE-1; desfeita a mescla, volta', async () => {
    const opcoes = renderHook(() => useOpcoesDeSitio())
    await waitFor(() => expect(opcoes.result.current.map((o) => o.id)).toContain('SI-aaaaaaaa-1'))
    expect(opcoes.result.current.find((o) => o.id === 'TESTE-1')!.objetos).toBe(3)
    await act(() => mesclarSitios('TESTE-1', 'SI-aaaaaaaa-1'))
    await waitFor(() => expect(opcoes.result.current.map((o) => o.id)).not.toContain('SI-aaaaaaaa-1'))
    // 3 do livro + o objeto SKC do absorvido
    expect(opcoes.result.current.find((o) => o.id === 'TESTE-1')!.objetos).toBe(4)
    expect(opcoes.result.current.find((o) => o.id === 'TESTE-1')!.grafias).toContain('Tell Absorvido Teste')

    const tela = renderizarRota('/sitios')
    await waitFor(() => expect(linhas()).toContain('TESTE-1'))
    await waitFor(() => expect(linhas()).not.toContain('SI-aaaaaaaa-1'))
    expect(linhaDe('TESTE-1')).toHaveTextContent('4 objetos')
    tela.unmount()

    await act(() => desfazerMescla('SI-aaaaaaaa-1', []))
    await waitFor(() => expect(opcoes.result.current.map((o) => o.id)).toContain('SI-aaaaaaaa-1'))
    expect(opcoes.result.current.find((o) => o.id === 'TESTE-1')!.objetos).toBe(3)
    renderizarRota('/sitios')
    await waitFor(() => expect(linhas()).toContain('SI-aaaaaaaa-1'))
  })
})

describe('o endereço de um sítio absorvido leva ao destino (Foco da revisão 2)', () => {
  it('/sitio/TESTE-4 chega a /sitio/TESTE-2 com state.mescladoDe = TESTE-4, mantendo a busca do endereço', async () => {
    renderizarRota('/sitio/TESTE-4?filtro=probe')
    expect(await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })).toBeInTheDocument()
    expect(endereco()).toHaveTextContent('/sitio/TESTE-2?filtro=probe')
    expect(JSON.parse(endereco().dataset.estado!)).toEqual({ mescladoDe: 'TESTE-4' })
  })

  it('/sitio/<SI-…> mesclado leva ao destino com mescladoDe = o SI-…; um SI-… publicado (sem mescla) leva sem aviso', async () => {
    await mesclarSitios('TESTE-1', 'SI-aaaaaaaa-1')
    try {
      const r = renderizarRota('/sitio/SI-aaaaaaaa-1')
      expect(await screen.findByRole('heading', { level: 1, name: 'Maḥteṣ Teste' })).toBeInTheDocument()
      expect(JSON.parse(endereco().dataset.estado!)).toEqual({ mescladoDe: 'SI-aaaaaaaa-1' })
      r.unmount()
    } finally {
      await desfazerMescla('SI-aaaaaaaa-1', [])
    }
    renderizarRota('/sitio/SI-teste123-2')
    expect(await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })).toBeInTheDocument()
    expect(endereco()).toHaveTextContent('/sitio/TESTE-2')
    expect(endereco().dataset.estado).toBe('null')
  })

  it('o link [[TESTE-4|x]] de uma nota leva a TESTE-2', async () => {
    await registrar('nota', 'NT-aaaaaaaa-1', 'criar', { texto: 'veja [[TESTE-4|o tel]]', alvoTipo: 'objeto', alvo: 'CA00004' })
    renderizarRota('/nota/NT-aaaaaaaa-1')
    const link = (await screen.findAllByRole('link', { name: 'o tel' }))[0]!
    expect(link).toHaveAttribute('href', '/sitio/TESTE-4')
    await userEvent.click(link)
    expect(await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })).toBeInTheDocument()
    expect(endereco()).toHaveTextContent(/^\/sitio\/TESTE-2$/)
  })

  it('/sitios?foco=TESTE-4 abre o mapa no ponto de TESTE-2', async () => {
    instalarMatchMedia(1280, { hover: true })
    renderizarRota('/sitios?foco=TESTE-4')
    const cartao = await screen.findByRole('dialog')
    expect(within(cartao).getByText('Tell Probe Teste')).toBeInTheDocument()
  })
})

describe('Revisão: um objeto ligado a um sítio absorvido não é «sítio não resolvido»', () => {
  it('nem o do livro trocado para TESTE-4, nem o SKC cujo sítio foi mesclado', async () => {
    const pacote = await pacoteDeSitios()
    await mesclarSitios('TESTE-1', 'SI-aaaaaaaa-1')
    try {
      const destinos = destinosDosSitios(resolverSitios(estadoAtual(), pacote))
      const s = sitiosNaoResolvidos(estadoAtual(), [{ itemId: 'TESTE-0001', numero: 'CA00001' }], destinos)
      expect(s).toMatchObject({ pacote: [], resolvidasPeloUsuario: 1, skc: [], total: 0 })
      // A fila com a linha do pacote (o objeto do livro sem sítio, que a pessoa trocou para TESTE-4): resolvida, e nenhum caso aberto.
      const linhas = [{ tipo: 'sitio_nao_normalizado', entidade: 'item', entidadeId: 'TESTE-0001', detalhe: '', numero: 'CA00001' }]
      const fila = montarFila({ linhas, lugares: null, verbetesDoPacote: [], numeracao: { porId: new Map(), rascunhos: [] }, estado: estadoAtual(), pacoteDeSitios: pacote })
      expect(fila.sitiosLigados).toBe(1)
      expect(fila.grupos.flatMap((g) => g.abertos).filter((c) => c.tipo === 'sitio-skc' || c.tipo === 'sitio_nao_normalizado')).toEqual([])
    } finally {
      await desfazerMescla('SI-aaaaaaaa-1', [])
    }
  })
})

describe('Tarefa 13: os nomes dos sítios mesclados viram grafias, com a origem', () => {
  it('na página de TESTE-1: o seu, «sem origem» (com «SKC»); em «Corrigir», sem ×, e a tradição dada fica no registro dele, então desfazer deixa TESTE-1 como estava', async () => {
    await mesclarSitios('TESTE-1', 'SI-aaaaaaaa-1')
    renderizarRota('/sitio/TESTE-1')
    await screen.findByRole('heading', { level: 1, name: 'Maḥteṣ Teste' })
    const dl = screen.getByRole('region', { name: 'Dados do sítio' })
    // a grafia do livro de TESTE-1 (F5: «al-Maḥṭaṣ Teste», p. 4) espera a tradição; o nome impresso é o nome de agora e não aparece
    await waitFor(() => expect(within(dl).getByRole('group', { name: 'sem tradição' })).toHaveTextContent(/^sem tradiçãoal-Maḥṭaṣ TesteTESTE, p\. 4$/))
    expect(within(dl).getByRole('group', { name: 'sem origem' })).toHaveTextContent(/^sem origemTell Absorvido TesteSKC$/)
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    const lista = screen.getByRole('list', { name: 'Outras grafias do sítio' })
    const linha = within(lista)
      .getAllByRole('listitem')
      .find((li) => li.textContent?.startsWith('Tell Absorvido Teste'))!
    expect(within(linha).getByText('SKC')).toBeInTheDocument()
    expect(within(linha).queryByRole('button', { name: /Tirar a grafia/ })).toBeNull()
    await userEvent.selectOptions(within(linha).getByRole('combobox', { name: 'Tradição de Tell Absorvido Teste' }), 'Inglesa')
    await waitFor(() => expect(estadoAtual().registro('sitio', 'SI-aaaaaaaa-1')!.campos.grafias).toEqual([{ texto: 'Tell Absorvido Teste', tradicao: 'inglesa' }]))
    expect(estadoAtual().registro('sitio', 'TESTE-1')?.campos.grafias).toBeUndefined()
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    await waitFor(() => expect(within(dl).getByRole('group', { name: 'inglesa' })).toHaveTextContent('Tell Absorvido TesteSKC'))
    await act(() => desfazerMescla('SI-aaaaaaaa-1', []))
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Dados do sítio' })).queryByText('Tell Absorvido Teste')).toBeNull())
    await registrar('sitio', 'SI-aaaaaaaa-1', 'alterar', { grafias: null })
  })

  it('I1: livro → livro (TESTE-8 em TESTE-1, no app): a tradição dada na grafia do livro de TESTE-8 fica no registro de TESTE-8; desfeita a mescla, TESTE-1 fica como estava e TESTE-8 guarda a tradição', async () => {
    const antes = estadoAtual().registro('sitio', 'TESTE-1')?.campos.grafias
    await mesclarSitios('TESTE-1', 'TESTE-8')
    renderizarRota('/sitio/TESTE-1')
    await screen.findByRole('heading', { level: 1, name: 'Maḥteṣ Teste' })
    const dl = screen.getByRole('region', { name: 'Dados do sítio' })
    // o nome impresso de TESTE-8 (p. 9) é uma grafia do livro, à espera da tradição, sem «SKC»
    await waitFor(() => expect(within(dl).getByRole('group', { name: 'sem tradição' })).toHaveTextContent('Ḫirbet Vizinha TesteTESTE, p. 9'))
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    const lista = screen.getByRole('list', { name: 'Outras grafias do sítio' })
    const linha = within(lista)
      .getAllByRole('listitem')
      .find((li) => li.textContent?.startsWith('Ḫirbet Vizinha Teste'))!
    expect(within(linha).getByText('do livro TESTE, p. 9')).toBeInTheDocument()
    expect(within(linha).queryByRole('button')).toBeNull()
    expect(within(linha).queryByRole('combobox', { name: /^Livro/ })).toBeNull()
    await userEvent.selectOptions(within(linha).getByRole('combobox', { name: 'Tradição de Ḫirbet Vizinha Teste' }), 'Árabe')
    await waitFor(() => expect(estadoAtual().registro('sitio', 'TESTE-8')!.campos.grafias).toEqual([{ texto: 'Ḫirbet Vizinha Teste', livro: 'TESTE', tradicao: 'arabe' }]))
    expect(estadoAtual().registro('sitio', 'TESTE-1')?.campos.grafias).toEqual(antes)
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    await waitFor(() => expect(within(dl).getByRole('group', { name: 'árabe' })).toHaveTextContent('Ḫirbet Vizinha TesteTESTE, p. 9'))
    await act(() => desfazerMescla('TESTE-8', []))
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Dados do sítio' })).queryByText('Ḫirbet Vizinha Teste')).toBeNull())
    const r = resolverSitios(estadoAtual(), await pacoteDeSitios())
    expect(r.destino('TESTE-8')).toBe('TESTE-8')
    expect(r.grafiasDoUsuario('TESTE-8')).toEqual([{ texto: 'Ḫirbet Vizinha Teste', livro: 'TESTE', tradicao: 'arabe' }])
    expect(r.grafiasDoUsuario('TESTE-1')).toEqual(antes ?? [])
    await registrar('sitio', 'TESTE-8', 'alterar', { grafias: null, mescladoEm: null })
  })
})
