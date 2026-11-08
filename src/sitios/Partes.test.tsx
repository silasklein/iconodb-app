/**
 * Parte 2C, bloco 2 (Tarefa 12; telas aprovadas §3): as partes de um sítio em vários níveis. No todo, o código sob o título
 * («TESTE-2 · 6 objetos, 3 nas partes»), a seção «Partes» em árvore e, na grade, «em …» nos objetos que vêm de uma parte; na
 * parte, o caminho acima do título e «Não é parte de outro» (com «Desfazer»); a caixa «Marcar como parte de…».
 *
 * O pacote sintético traz a árvore Tell Probe Teste (TESTE-2) › Área Probe Teste (TESTE-5) › Túmulo Probe Teste (TESTE-6), e
 * Tel Probe Teste (TESTE-4) mesclado em TESTE-2. Os objetos do livro estão em TESTE-1 (3) e TESTE-2 (3).
 */
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { A, ev } from '../../tests/suporte/eventosDeTeste'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import type { Json } from '../usuario/eventos'
import { carregarEstado, estadoAtual, registrar } from '../usuario/estado'
import { trocarSitioDoObjeto } from './operacoes'
import { fundir } from '../usuario/fusao'
import type { OpcaoDeSitio } from './doUsuario'
import { arvoreDasPartes, avisoDoTodo, opcoesDeTodo, textoDaRecusa } from './Partes'
import { PACOTE_VAZIO, resolverSitios } from './resolucao'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

// ------------------------------------------------------------------------------------------------ as funções puras

describe('opcoesDeTodo, avisoDoTodo e arvoreDasPartes (a árvore das telas aprovadas)', () => {
  let seq = 0
  const sit = (reg: string, campos: Record<string, Json>, op: 'criar' | 'alterar' = 'criar') => ev({ ap: A, seq: ++seq, tipo: 'sitio', reg, op, campos })
  // Tell Teste (TESTE-3) › Área Teste BB › Túmulo T-1; Área Teste CC; Tell Exemplo mesclado em Tell Teste; Khirbet Modelo à parte.
  // Os ids estão fora da ordem alfabética dos nomes, para a árvore mostrar que a ordem é a dos nomes.
  const estado = fundir([
    sit('SI-aaaaaaaa-1', { nome: 'Área Teste CC', parteDe: 'TESTE-3' }),
    sit('SI-aaaaaaaa-2', { nome: 'Túmulo T-1', parteDe: 'SI-aaaaaaaa-3' }),
    sit('SI-aaaaaaaa-3', { nome: 'Área Teste BB', parteDe: 'TESTE-3' }),
    sit('SI-aaaaaaaa-4', { nome: 'Tell Exemplo', mescladoEm: 'TESTE-3' }),
    sit('SI-aaaaaaaa-7', { nome: 'Khirbet Modelo' }),
  ])
  const r = resolverSitios(estado, { ...PACOTE_VAZIO, sitios: new Set(['TESTE-3']) })
  const NOMES: Record<string, string> = {
    'TESTE-3': 'Tell Teste',
    'SI-aaaaaaaa-1': 'Área Teste CC',
    'SI-aaaaaaaa-2': 'Túmulo T-1',
    'SI-aaaaaaaa-3': 'Área Teste BB',
    'SI-aaaaaaaa-4': 'Tell Exemplo',
    'SI-aaaaaaaa-7': 'Khirbet Modelo',
  }
  const nome = (id: string) => NOMES[id] ?? id
  const op = (id: string, objetos: number, mais: Partial<OpcaoDeSitio> = {}): OpcaoDeSitio => ({
    id,
    nome: nome(id),
    regiao: 'Região Teste',
    doUsuario: id.startsWith('SI-'),
    nomeDoLivro: null,
    grafias: [],
    objetos,
    ...mais,
  })
  // como `opcoesDeSitio` as dá: sem o absorvido (o nome dele é grafia do destino), em ordem alfabética
  const opcoes = [
    op('SI-aaaaaaaa-3', 4),
    op('SI-aaaaaaaa-1', 1),
    op('SI-aaaaaaaa-7', 2),
    op('TESTE-3', 12, { grafias: ['Tell Exemplo'] }),
    op('SI-aaaaaaaa-2', 1),
  ]
  const ver = (lista: ReturnType<typeof opcoesDeTodo>) => lista.map((o) => [o.rotulo, o.nivel ?? 0, o.apoio])

  it('arvoreDasPartes: todos os níveis, irmãos em ordem alfabética', () => {
    expect(arvoreDasPartes(r, 'TESTE-3', nome)).toEqual([
      { id: 'SI-aaaaaaaa-3', nivel: 1 },
      { id: 'SI-aaaaaaaa-2', nivel: 2 },
      { id: 'SI-aaaaaaaa-1', nivel: 1 },
    ])
    expect(arvoreDasPartes(r, 'SI-aaaaaaaa-7', nome)).toEqual([])
  })

  it('opcoesDeTodo: em árvore, as partes recuadas sob o todo; o apoio de um sítio de cima e o de uma parte', () => {
    expect(ver(opcoesDeTodo(r, 'SI-aaaaaaaa-7', opcoes, 'teste'))).toEqual([
      ['Tell Teste', 0, 'Região Teste · 12 objetos'],
      ['Área Teste BB', 1, 'parte de Tell Teste · SKC'],
      ['Túmulo T-1', 2, 'parte de Área Teste BB · SKC'],
      ['Área Teste CC', 1, 'parte de Tell Teste · SKC'],
    ])
    // um sítio seu de cima diz «SKC»
    expect(ver(opcoesDeTodo(r, 'TESTE-3', opcoes, 'khirbet'))).toEqual([['Khirbet Modelo', 0, 'Região Teste · SKC · 2 objetos']])
    // a parte cujo todo não está no resultado vem sem recuo
    expect(ver(opcoesDeTodo(r, 'SI-aaaaaaaa-7', opcoes, 'tumulo'))).toEqual([['Túmulo T-1', 0, 'parte de Área Teste BB · SKC']])
  })

  it('opcoesDeTodo: fora da lista o próprio sítio e os descendentes; a grafia que casou vai no apoio', () => {
    expect(ver(opcoesDeTodo(r, 'SI-aaaaaaaa-3', opcoes, 'teste'))).toEqual([
      ['Tell Teste', 0, 'Região Teste · 12 objetos'],
      ['Área Teste CC', 1, 'parte de Tell Teste · SKC'],
    ])
    expect(ver(opcoesDeTodo(r, 'SI-aaaaaaaa-3', opcoes, 'tell exemplo'))).toEqual([['Tell Teste', 0, 'Região Teste · Tell Exemplo · 12 objetos']])
    expect(opcoesDeTodo(r, 'TESTE-3', opcoes, 'teste')).toEqual([])
    // sem texto (menos de 2 letras), nada
    expect(opcoesDeTodo(r, 'SI-aaaaaaaa-7', opcoes, 't')).toEqual([])
  })

  it('M1: o limite conta só as linhas de cima; as partes de um todo que casou não tiram os outros da lista', () => {
    // de Túmulo T-1, «el» casa com Khirbet Modelo e com Tell Teste (que traz Área Teste BB e Área Teste CC)
    expect(ver(opcoesDeTodo(r, 'SI-aaaaaaaa-2', opcoes, 'el', 1))).toEqual([['Khirbet Modelo', 0, 'Região Teste · SKC · 2 objetos']])
    expect(ver(opcoesDeTodo(r, 'SI-aaaaaaaa-2', opcoes, 'el', 2)).map(([rotulo, nivel]) => [rotulo, nivel])).toEqual([
      ['Khirbet Modelo', 0],
      ['Tell Teste', 0],
      ['Área Teste BB', 1],
      ['Área Teste CC', 1],
    ])
  })

  it('textoDaRecusa (M5): por que o escolhido deixou de poder ser o todo', () => {
    expect(textoDaRecusa(r, 'TESTE-3', 'SI-aaaaaaaa-2', 'descendente', nome)).toBe('Túmulo T-1 é parte de Área Teste BB: um sítio não pode ser parte de uma parte dele.')
    expect(textoDaRecusa(r, 'SI-aaaaaaaa-7', 'SI-aaaaaaaa-4', 'mesclado', nome)).toBe(
      'Tell Exemplo foi mesclado em Tell Teste e não é mais um sítio à parte: não pode ser parte de outro nem ter partes. Escolha Tell Teste.',
    )
    expect(textoDaRecusa(r, 'SI-aaaaaaaa-7', 'SI-aaaaaaaa-9', 'excluido', nome)).toBe('SI-aaaaaaaa-9 foi excluído; escolha outro sítio.')
    expect(textoDaRecusa(r, 'SI-aaaaaaaa-7', 'TESTE-3', 'mesmo', nome)).toBe('Tell Teste e Khirbet Modelo agora são um só; escolha outro sítio.')
  })

  it('avisoDoTodo: os dois textos das telas aprovadas', () => {
    expect(avisoDoTodo(r, 'SI-aaaaaaaa-3', 'túmulo', nome)).toBe('Túmulo T-1 é parte de Área Teste BB: um sítio não pode ser parte de uma parte dele.')
    expect(avisoDoTodo(r, 'SI-aaaaaaaa-3', 'tell exemplo', nome)).toBe(
      'Tell Exemplo foi mesclado em Tell Teste e não é mais um sítio à parte: não pode ser parte de outro nem ter partes. Escolha Tell Teste.',
    )
    // o texto que já acha o destino pelo nome não precisa da explicação; nada casa: null
    expect(avisoDoTodo(r, 'SI-aaaaaaaa-7', 'tell', nome)).toBeNull()
    expect(avisoDoTodo(r, 'SI-aaaaaaaa-7', 'khirbet', nome)).toBeNull()
    // um sítio mesclado no próprio sítio não manda escolher o próprio sítio
    expect(avisoDoTodo(r, 'TESTE-3', 'exemplo', nome)).toBeNull()
  })
})

// ------------------------------------------------------------------------------------------------ as telas

beforeAll(usarFoldDoPacoteSintetico)
afterEach(() => {
  usarMotor(null)
  vi.restoreAllMocks()
})

const opcoesNaLista = () =>
  screen.queryAllByRole('option').map((o) => [o.querySelector('.form-escolha-rotulo')!.textContent, o.getAttribute('data-nivel'), o.querySelector('.form-escolha-apoio')?.textContent ?? null])

/** Cada teste começa sem nada na camada do usuário (o diário de eventos apagado e o estado relido). */
function apagarCamada() {
  return new Promise<void>((ok, falha) => {
    const r = indexedDB.deleteDatabase('iconodb-usuario')
    r.onsuccess = () => ok()
    r.onerror = () => falha(r.error)
    r.onblocked = () => falha(new Error('banco bloqueado'))
  })
}

describe('Partes na página do sítio', () => {
  beforeEach(async () => {
    usarMotor(await bancoDeTeste())
    await apagarCamada()
    await carregarEstado()
    expect(estadoAtual().registros.get('sitio')?.size ?? 0).toBe(0)
  })

  it('I1: um objeto do livro do todo que a pessoa ligou a uma parte conta na parte (aqui, na página da parte e na lista)', async () => {
    // TESTE-0003 (CA00003) é achado de Tell Probe Teste (TESTE-2) no livro; a pessoa o liga ao Túmulo Probe Teste (TESTE-6)
    await trocarSitioDoObjeto('CA00003', 'TESTE-6', 'Túmulo Probe Teste')
    const r = renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    expect(await screen.findByText('TESTE-2 · 3 objetos, 1 nas partes')).toBeInTheDocument()
    const partes = screen.getByRole('region', { name: 'Partes' })
    await waitFor(() =>
      expect([...partes.querySelectorAll('.sitio-parte')].map((l) => l.textContent)).toEqual(['Área Probe Teste1 objeto', '└Túmulo Probe Teste1 objeto']),
    )
    const objetos = screen.getByRole('region', { name: 'Objetos deste sítio' })
    const cartoes = within(objetos).getAllByRole('link')
    expect(cartoes.map((c) => [c.getAttribute('href'), c.querySelector('.cartao-sitio')?.textContent])).toEqual([
      ['/item/CA00004', 'Tell Probe Teste'],
      ['/item/BA00002', 'Tell Probe Teste'],
      ['/item/CA00003', 'em Túmulo Probe Teste'],
    ])
    r.unmount()
    // a página do túmulo diz o mesmo número
    const r2 = renderizarRota('/sitio/TESTE-6')
    await screen.findByRole('heading', { level: 1, name: 'Túmulo Probe Teste' })
    expect(await screen.findByText('TESTE-6 · 1 objeto')).toBeInTheDocument()
    r2.unmount()
    // e a lista dos sítios: o todo 3, a área 1, o túmulo 1
    const { container } = renderizarRota('/sitios')
    const n = (id: string) => container.querySelector(`[data-sitio="${id}"] .lista-n`)?.textContent
    await waitFor(() => expect([n('TESTE-2'), n('TESTE-5'), n('TESTE-6')]).toEqual(['3 objetos', '1 objeto', '1 objeto']))
  })

  it('no todo: «, 3 nas partes» sob o título, a seção «Partes» em árvore e, na grade, «em …» nos objetos que vêm de uma parte', async () => {
    // Maḥteṣ Teste (TESTE-1, 3 objetos) passa a ser parte do Túmulo Probe Teste: o terceiro nível sob Tell Probe Teste
    await registrar('sitio', 'TESTE-1', 'alterar', { parteDe: 'TESTE-6' })
    try {
      renderizarRota('/sitio/TESTE-2')
      await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
      expect(await screen.findByText('TESTE-2 · 6 objetos, 3 nas partes')).toHaveClass('codigo')
      const partes = screen.getByRole('region', { name: 'Partes' })
      expect(within(partes).getByRole('heading', { name: 'Partes' })).toBeInTheDocument()
      expect(partes.querySelector('.detalhe-secao-topo .codigo')).toHaveTextContent(/^3$/)
      const linhas = () => [...partes.querySelectorAll('.sitio-parte')].map((l) => [l.getAttribute('data-nivel'), l.textContent])
      await waitFor(() =>
        expect(linhas()).toEqual([
          ['1', 'Área Probe Teste3 objetos'],
          ['2', '└Túmulo Probe Teste3 objetos'],
          ['3', '└Maḥteṣ Teste3 objetos'],
        ]),
      )
      expect(within(partes).getByRole('link', { name: 'Túmulo Probe Teste' })).toHaveAttribute('href', '/sitio/TESTE-6')
      expect(within(partes).getByRole('link', { name: 'Maḥteṣ Teste' })).toHaveAttribute('href', '/sitio/TESTE-1')
      // o «└» é desenho: o leitor de tela ouve a lista dentro da lista
      expect(partes.querySelector('.sitio-parte-ramo')).toHaveAttribute('aria-hidden', 'true')
      const objetos = screen.getByRole('region', { name: 'Objetos deste sítio' })
      expect(within(objetos).getByText('6')).toBeInTheDocument()
      const cartoes = within(objetos).getAllByRole('link')
      expect(cartoes).toHaveLength(6)
      // os do próprio sítio primeiro; os da parte dizem de qual
      expect(cartoes.map((c) => /em Maḥteṣ Teste/.test(c.textContent ?? ''))).toEqual([false, false, false, true, true, true])
    } finally {
      await registrar('sitio', 'TESTE-1', 'alterar', { parteDe: null })
    }
  })

  it('sem objetos nas partes, o código é o de hoje; a seção conta todos os descendentes', async () => {
    const r = renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    expect(await screen.findByText('TESTE-2 · 3 objetos')).toBeInTheDocument()
    const partes = screen.getByRole('region', { name: 'Partes' })
    expect(partes.querySelector('.detalhe-secao-topo .codigo')).toHaveTextContent(/^2$/)
    expect([...partes.querySelectorAll('.sitio-parte')].map((l) => l.textContent)).toEqual(['Área Probe Teste0 objetos', '└Túmulo Probe Teste0 objetos'])
    r.unmount()
    // um sítio sem partes não tem a seção
    renderizarRota('/sitio/TESTE-1')
    await screen.findByRole('heading', { level: 1, name: 'Maḥteṣ Teste' })
    expect(screen.queryByRole('region', { name: 'Partes' })).not.toBeInTheDocument()
  })

  it('sítios seus: a marca «SKC», irmãos em ordem alfabética, as contagens já somadas as das partes de baixo', async () => {
    await registrar('sitio', 'SI-partesaa-4', 'criar', { nome: 'Tell Teste', regiao: 'Região Teste' })
    await registrar('sitio', 'SI-partesaa-1', 'criar', { nome: 'Área Teste CC', parteDe: 'SI-partesaa-4' })
    await registrar('sitio', 'SI-partesaa-2', 'criar', { nome: 'Área Teste BB', parteDe: 'SI-partesaa-4' })
    await registrar('sitio', 'SI-partesaa-3', 'criar', { nome: 'Túmulo T-1', parteDe: 'SI-partesaa-2' })
    const objeto = (n: number, sitio: string, nome: string) =>
      registrar('objeto', `OB-partesaa-${n}`, 'criar', { periodo: 'CA', titulo: `Objeto ${n}`, sitio, sitioNome: nome, origemTipo: 'achado' })
    await objeto(1, 'SI-partesaa-4', 'Tell Teste')
    await objeto(2, 'SI-partesaa-2', 'Área Teste BB')
    await objeto(3, 'SI-partesaa-3', 'Túmulo T-1')
    await objeto(4, 'SI-partesaa-1', 'Área Teste CC')
    renderizarRota('/sitio/SI-partesaa-4')
    await screen.findByRole('heading', { level: 1, name: 'Tell Teste' })
    expect(await screen.findByText('SI-partesaa-4 · 4 objetos, 3 nas partes')).toBeInTheDocument()
    const partes = screen.getByRole('region', { name: 'Partes' })
    await waitFor(() =>
      expect([...partes.querySelectorAll('.sitio-parte')].map((l) => l.textContent)).toEqual([
        'Área Teste BBSKC2 objetos',
        '└Túmulo T-1SKC1 objeto',
        'Área Teste CCSKC1 objeto',
      ]),
    )
    const objetos = screen.getByRole('region', { name: 'Objetos deste sítio' })
    await waitFor(() => expect(within(objetos).getAllByRole('link')).toHaveLength(4))
    // na ordem da árvore: o do todo, Área Teste BB, Túmulo T-1, Área Teste CC
    expect(within(objetos).getAllByRole('link').map((c) => c.querySelector('.cartao-sitio')?.textContent)).toEqual([
      'Tell Teste',
      'em Área Teste BB',
      'em Túmulo T-1',
      'em Área Teste CC',
    ])
  })

  it('na parte: o caminho acima do título (cada nível abre a página dele; o último sem link) e os três links', async () => {
    const r = renderizarRota('/sitio/TESTE-6')
    const titulo = await screen.findByRole('heading', { level: 1, name: 'Túmulo Probe Teste' })
    const caminho = await screen.findByRole('navigation', { name: 'Caminho' })
    expect(caminho).toHaveTextContent(/^Tell Probe Teste›Área Probe Teste›Túmulo Probe Teste$/)
    expect(within(caminho).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Tell Probe Teste', '/sitio/TESTE-2'],
      ['Área Probe Teste', '/sitio/TESTE-5'],
    ])
    expect(within(caminho).getByText('Túmulo Probe Teste')).toHaveAttribute('aria-current', 'page')
    expect(caminho.compareDocumentPosition(titulo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const links = screen.getByRole('button', { name: 'Mesclar com outro sítio…' }).parentElement!
    expect(within(links).getAllByRole('button').map((b) => b.textContent)).toEqual(['Mesclar com outro sítio…', 'Marcar como parte de…', 'Não é parte de outro'])
    // o todo de cima não tem caminho nem «Não é parte de outro»
    r.unmount()
    renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    expect(screen.queryByRole('navigation', { name: 'Caminho' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Não é parte de outro' })).not.toBeInTheDocument()
  })

  it('«Não é parte de outro» solta na hora; o aviso com «Desfazer» grava de volta a parte que vinha do pacote', async () => {
    renderizarRota('/sitio/TESTE-6')
    await screen.findByRole('heading', { level: 1, name: 'Túmulo Probe Teste' })
    const soltar = await screen.findByRole('button', { name: 'Não é parte de outro' })
    await userEvent.click(soltar)
    await waitFor(() => expect(estadoAtual().registro('sitio', 'TESTE-6')?.campos.parteDe).toBeNull())
    const aviso = await screen.findByText('Túmulo Probe Teste não é mais parte de Área Probe Teste.')
    const desfazer = within(aviso.closest('p')!).getByRole('button', { name: 'Desfazer' })
    await waitFor(() => expect(desfazer).toHaveFocus())
    // M3: quem chega ao botão pelo foco ouve também a mensagem
    expect(desfazer).toHaveAccessibleDescription('Túmulo Probe Teste não é mais parte de Área Probe Teste.')
    expect(screen.queryByRole('navigation', { name: 'Caminho' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Não é parte de outro' })).not.toBeInTheDocument()
    await userEvent.click(desfazer)
    await waitFor(() => expect(estadoAtual().registro('sitio', 'TESTE-6')?.campos.parteDe).toBe('TESTE-5'))
    expect(await screen.findByRole('navigation', { name: 'Caminho' })).toBeInTheDocument()
    expect(screen.queryByText(/não é mais parte de/)).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Não é parte de outro' })).toHaveFocus())
  })

  it('«Desfazer» grava de volta a parte que a pessoa tinha escrito', async () => {
    await registrar('sitio', 'TESTE-1', 'alterar', { parteDe: 'TESTE-6' })
    try {
      renderizarRota('/sitio/TESTE-1')
      await screen.findByRole('heading', { level: 1, name: 'Maḥteṣ Teste' })
      await userEvent.click(await screen.findByRole('button', { name: 'Não é parte de outro' }))
      await waitFor(() => expect(estadoAtual().registro('sitio', 'TESTE-1')?.campos.parteDe).toBeNull())
      const aviso = await screen.findByText('Maḥteṣ Teste não é mais parte de Túmulo Probe Teste.')
      await userEvent.click(within(aviso.closest('p')!).getByRole('button', { name: 'Desfazer' }))
      await waitFor(() => expect(estadoAtual().registro('sitio', 'TESTE-1')?.campos.parteDe).toBe('TESTE-6'))
    } finally {
      await registrar('sitio', 'TESTE-1', 'alterar', { parteDe: null })
    }
  })

  it('«Marcar como parte de…»: no lugar, foco no campo; as opções em árvore; «Marcar como parte» só com uma escolhida, e grava parteDe', async () => {
    renderizarRota('/sitio/TESTE-1')
    await screen.findByRole('heading', { level: 1, name: 'Maḥteṣ Teste' })
    const gatilho = await screen.findByRole('button', { name: 'Marcar como parte de…' })
    expect(gatilho).toHaveAttribute('aria-expanded', 'false')
    // Cancelar fecha e devolve o foco ao link
    await userEvent.click(gatilho)
    let caixa = await screen.findByRole('group', { name: 'Maḥteṣ Teste é parte de qual sítio?' })
    expect(gatilho).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(within(caixa).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('group', { name: /é parte de qual sítio/ })).not.toBeInTheDocument()
    expect(gatilho).toHaveFocus()
    try {
      await userEvent.click(gatilho)
      caixa = await screen.findByRole('group', { name: 'Maḥteṣ Teste é parte de qual sítio?' })
      const campo = within(caixa).getByRole('combobox', { name: 'Maḥteṣ Teste é parte de qual sítio?' })
      await waitFor(() => expect(campo).toHaveFocus())
      const marcar = within(caixa).getByRole('button', { name: 'Marcar como parte' })
      expect(marcar).toBeDisabled()
      await userEvent.type(campo, 'probe')
      await waitFor(() =>
        expect(opcoesNaLista()).toEqual([
          ['Tell Probe Teste', null, '3 objetos'],
          ['Área Probe Teste', '1', 'parte de Tell Probe Teste'],
          ['Túmulo Probe Teste', '2', 'parte de Área Probe Teste'],
        ]),
      )
      expect(marcar).toBeDisabled()
      await userEvent.click(screen.getByRole('option', { name: /^Túmulo Probe Teste/ }))
      expect(campo).toHaveValue('Túmulo Probe Teste')
      expect(marcar).toBeEnabled()
      // escrever de novo desfaz a escolha
      await userEvent.type(campo, 'x')
      expect(marcar).toBeDisabled()
      await userEvent.clear(campo)
      await userEvent.type(campo, 'tumulo')
      await userEvent.click(await screen.findByRole('option', { name: /^Túmulo Probe Teste/ }))
      await userEvent.click(marcar)
      await waitFor(() => expect(estadoAtual().registro('sitio', 'TESTE-1')?.campos.parteDe).toBe('TESTE-6'))
      expect(screen.queryByRole('group', { name: /é parte de qual sítio/ })).not.toBeInTheDocument()
      await waitFor(() => expect(gatilho).toHaveFocus())
      expect(await screen.findByRole('navigation', { name: 'Caminho' })).toHaveTextContent('Tell Probe Teste›Área Probe Teste›Túmulo Probe Teste›Maḥteṣ Teste')
    } finally {
      await act(() => registrar('sitio', 'TESTE-1', 'alterar', { parteDe: null }))
    }
  })

  it('M5: se a árvore mudou depois da escolha, «Marcar como parte» não grava e diz por quê', async () => {
    renderizarRota('/sitio/TESTE-1')
    await screen.findByRole('heading', { level: 1, name: 'Maḥteṣ Teste' })
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar como parte de…' }))
    const caixa = await screen.findByRole('group', { name: 'Maḥteṣ Teste é parte de qual sítio?' })
    await userEvent.type(within(caixa).getByRole('combobox'), 'tumulo')
    await userEvent.click(await screen.findByRole('option', { name: /^Túmulo Probe Teste/ }))
    // outro aparelho (ou aba), antes do toque: o Túmulo passa a ser parte de Maḥteṣ Teste
    await act(() => registrar('sitio', 'TESTE-6', 'alterar', { parteDe: 'TESTE-1' }))
    const marcar = within(caixa).getByRole('button', { name: 'Marcar como parte' })
    await userEvent.click(marcar)
    expect(await within(caixa).findByRole('alert')).toHaveTextContent('Túmulo Probe Teste é parte de Maḥteṣ Teste: um sítio não pode ser parte de uma parte dele.')
    expect(estadoAtual().registro('sitio', 'TESTE-1')?.campos.parteDe).toBeUndefined()
    expect(marcar).toBeDisabled()
    // escrever de novo tira a explicação
    await userEvent.type(within(caixa).getByRole('combobox'), 'x')
    expect(within(caixa).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('M6: a explicação e as opções são uma lista só (a explicação logo acima das opções)', async () => {
    renderizarRota('/sitio/TESTE-5')
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar como parte de…' }))
    const caixa = await screen.findByRole('group', { name: 'Área Probe Teste é parte de qual sítio?' })
    await userEvent.type(within(caixa).getByRole('combobox'), 'tel probe')
    const aviso = await within(caixa).findByText(/^Tel Probe Teste foi mesclado em Tell Probe Teste/)
    expect(aviso).toHaveClass('form-escolha-aviso-junto')
    expect(aviso.nextElementSibling).toHaveClass('form-escolha-lista', 'form-escolha-lista-com-aviso')
  })

  it('a caixa não oferece as partes do próprio sítio nem o mesclado, e diz por quê (os textos das telas aprovadas)', async () => {
    renderizarRota('/sitio/TESTE-5')
    await screen.findByRole('heading', { level: 1, name: 'Área Probe Teste' })
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar como parte de…' }))
    const caixa = await screen.findByRole('group', { name: 'Área Probe Teste é parte de qual sítio?' })
    const campo = within(caixa).getByRole('combobox')
    await userEvent.type(campo, 'túmulo')
    expect(await within(caixa).findByText('Túmulo Probe Teste é parte de Área Probe Teste: um sítio não pode ser parte de uma parte dele.')).toHaveAttribute('role', 'status')
    expect(opcoesNaLista()).toEqual([])
    await userEvent.clear(campo)
    await userEvent.type(campo, 'tel probe')
    expect(
      await within(caixa).findByText('Tel Probe Teste foi mesclado em Tell Probe Teste e não é mais um sítio à parte: não pode ser parte de outro nem ter partes. Escolha Tell Probe Teste.'),
    ).toBeInTheDocument()
    expect(opcoesNaLista()).toEqual([['Tell Probe Teste', null, 'Tel Probe Teste · 3 objetos']])
    // o próprio sítio não está na lista
    await userEvent.clear(campo)
    await userEvent.type(campo, 'area probe')
    expect(opcoesNaLista()).toEqual([])
  })

  it('num sítio excluído, nem «Marcar como parte de…» nem «Não é parte de outro»', async () => {
    await registrar('sitio', 'SI-partesbb-1', 'criar', { nome: 'Tell Solto Teste', parteDe: 'TESTE-2' })
    await registrar('sitio', 'SI-partesbb-1', 'excluir')
    renderizarRota('/sitio/SI-partesbb-1')
    await screen.findByText(/Este sítio foi excluído/)
    expect(screen.queryByRole('button', { name: 'Marcar como parte de…' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Não é parte de outro' })).not.toBeInTheDocument()
  })
})
