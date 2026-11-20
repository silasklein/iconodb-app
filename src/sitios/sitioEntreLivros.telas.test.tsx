/**
 * Etapa 4, Tarefa 27 (fix round 1; revisão do branch, I1): o mesmo sítio do registro nos dois livros. O registro dos sítios é um
 * só, e o livro em parágrafos reusa o número de um sítio que o catálogo já tem. O pipeline grava então a mescla
 * `<LIVRO>-n → <CATÁLOGO>-n` (`tipo 'sitio'`, `criado 0`) e não sugere o par do mesmo número; o app já trata a mescla de ponta a
 * ponta e não precisa de outra regra. Este teste fixa isso: o TESTEG ganha o sítio 2 (o mesmo «Tell Probe Teste» do TESTE-2, na
 * mesma coordenada), com a figura TESTEG-0001a (F200001) achada nele, e a linha `TESTEG-2 → TESTE-2`. A lista dos sítios, o
 * mapa, os pares da Revisão (um par antigo do mesmo número, como o pipeline gravava antes) e a mescla da pessoa no TESTE-2
 * valem para os dois como um. Só dados TESTE inventados (banco de escrita).
 */
import { renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { paresDaRevisao } from '../revisao/pares'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { estadoAtual, registrar } from '../usuario/estado'
import { useSitiosVivos } from './doUsuario'
import { mesclasDoPacote } from '../pacote/redirecionamentos'
import { pacoteDeSitios } from './pacote'
import { resolverSitios } from './resolucao'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

beforeAll(async () => {
  usarMotor(await bancoDeTeste({ escrita: true }))
  usarFoldDoPacoteSintetico()
  await executar(`INSERT INTO pub_TESTEG.site (id, name_entry_id, literal_name, lat, lon, coord_method, coord_source)
    VALUES (2, 'GL-900005', 'Tell Probe Teste', 31.9132, 35.2071, 'gazetteer', 'https://example.org/gazetteer/tell-probe-teste')`)
  await executar(`INSERT INTO pub_TESTEG.assertion (subject_type, subject_id, field, value, site_id, certainty, publication, locator, is_primary)
    VALUES ('item', 'TESTEG-0001a', 'findspot', 'Tell Probe Teste', 2, 'certain', 'TESTEG', '§2', 1)`)
  await executar("INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('TESTEG-2', 'TESTE-2', 'sitio', 0)")
  // o par do mesmo número que o pipeline sugeria antes da correção: com a mescla, ele não fica aberto
  await executar("INSERT INTO main.sitio_par_sugerido (a, b, motivo) VALUES ('TESTE-2', 'TESTEG-2', 'coordenada')")
})
afterAll(() => usarMotor(null))
afterEach(() => instalarMatchMedia(375))

const linhas = () => [...document.querySelectorAll<HTMLElement>('.sitio-linha')].map((l) => l.dataset.sitio)
const linhaDe = (id: string) => document.querySelector<HTMLElement>(`.sitio-linha[data-sitio="${id}"]`)
const pontos = () => [...document.querySelectorAll<HTMLElement>('[data-ponto]')].map((p) => p.getAttribute('aria-label')!)
const objetosNaLinha = (id: string) => Number(/(\d+) objetos?/.exec(linhaDe(id)?.textContent ?? '')?.[1] ?? NaN)

describe('o sítio do livro em parágrafos com o número de um sítio do catálogo (mescla do pacote)', () => {
  it('a mescla do pacote vale (os dois sítios existem)', async () => {
    expect((await mesclasDoPacote()).get('TESTEG-2')).toBe('TESTE-2')
  })

  it('a lista dos sítios tem um só «Tell Probe Teste», com a figura contada nele; «Todas» não conta o do livro em parágrafos', async () => {
    instalarMatchMedia(1280, { hover: true })
    renderizarRota('/sitios')
    await waitFor(() => expect(linhas()).toContain('TESTE-2'))
    expect(linhas()).not.toContain('TESTEG-2')
    expect(linhas()).toEqual(['TESTE-5', 'TESTE-8', 'TESTE-1', 'TESTE-7', 'TESTEG-9', 'TESTE-2', 'TESTE-3', 'TESTE-6'])
    // os 3 objetos do catálogo e a figura F200001
    await waitFor(() => expect(linhaDe('TESTE-2')).toHaveTextContent('4 objetos'))
    expect(screen.getByRole('button', { name: /^Todas, / })).toHaveAccessibleName('Todas, 8 sítios')
  })

  it('o mapa tem um ponto só nessa coordenada, e o cartão é de um sítio (não «2 sítios neste ponto»)', async () => {
    instalarMatchMedia(1280, { hover: true })
    renderizarRota('/sitios')
    await screen.findByRole('group', { name: 'Mapa dos sítios' })
    await waitFor(() => expect(pontos().filter((p) => p.startsWith('Tell Probe Teste'))).toEqual(['Tell Probe Teste, 4 objetos']))
    await userEvent.click(screen.getByRole('button', { name: 'Tell Probe Teste, 4 objetos' }))
    expect(await screen.findByRole('dialog', { name: 'Sítio selecionado: Tell Probe Teste' })).toBeInTheDocument()
    expect(screen.queryByText(/2 sítios neste ponto/)).toBeNull()
  })

  it('o par do mesmo número não fica aberto na Revisão (é «mesclados»); os outros pares continuam abertos', async () => {
    const pacote = await pacoteDeSitios()
    const { abertos, resolvidos } = paresDaRevisao(resolverSitios(estadoAtual(), pacote), pacote)
    expect(abertos.map((p) => `${p.a}|${p.b}`)).toEqual(['TESTE-1|TESTE-7', 'TESTE-1|TESTE-8'])
    expect(resolvidos).toEqual([{ par: { a: 'TESTE-2', b: 'TESTEG-2', motivo: 'coordenada' }, como: 'mesclados' }])
  })

  it.each([375, 1280])('fix round 2: «Mesclado aqui» mostra o livro e o número de cada cópia, e o mesmo nome se distingue (%i px)', async (largura) => {
    instalarMatchMedia(largura, { hover: largura >= 768 })
    renderizarRota('/sitio/TESTE-2')
    // a contagem não muda: os 3 objetos do catálogo e a figura
    expect(await screen.findByText('TESTE-2 · 4 objetos')).toBeInTheDocument()
    const dados = screen.getByRole('region', { name: 'Dados do sítio' })
    await waitFor(() => expect(dados.querySelectorAll('.sitio-mesclado')).toHaveLength(2))
    // em ordem de id: TESTE-4 (o mesclado do pacote 8) e TESTEG-2, o mesmo «Tell Probe Teste» do livro em parágrafos
    expect([...dados.querySelectorAll('.sitio-mesclado')].map((l) => l.textContent)).toEqual([
      'Tel Probe Teste(dos livros)· TESTE-4desfazer',
      'Tell Probe Teste(dos livros)· TESTEG-2desfazer',
    ])
    // o mesmo nome do sítio que ficou: só o número o distingue
    expect(screen.getAllByText('Tell Probe Teste').length).toBeGreaterThan(1)
  })

  it('a mescla que a pessoa fez no TESTE-2 vale também para o do livro em parágrafos', async () => {
    instalarMatchMedia(1280, { hover: true })
    const antes = renderizarRota('/sitios')
    await waitFor(() => expect(objetosNaLinha('TESTE-2')).toBe(4))
    const soma = objetosNaLinha('TESTE-1') + objetosNaLinha('TESTE-2')
    antes.unmount()

    await registrar('sitio', 'TESTE-2', 'alterar', { mescladoEm: 'TESTE-1' })
    renderizarRota('/sitios')
    await waitFor(() => expect(linhas()).not.toContain('TESTE-2'))
    expect(linhas()).not.toContain('TESTEG-2')
    await waitFor(() => expect(objetosNaLinha('TESTE-1')).toBe(soma))
    // a figura achada no sítio do livro em parágrafos tem o nome do destino da pessoa
    const vivos = renderHook(() => useSitiosVivos())
    await waitFor(() => expect(vivos.result.current.nome('TESTEG-2', 'Tell Probe Teste')).toBe('Maḥteṣ Teste'))
    const r = resolverSitios(estadoAtual(), await pacoteDeSitios())
    expect(r.destino('TESTEG-2')).toBe('TESTE-1')
  })
})
