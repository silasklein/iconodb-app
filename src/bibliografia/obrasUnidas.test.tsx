/**
 * Etapa 4, Tarefa 27 (decisão 92, c6): as obras repetidas da Bibliografia unidas no fechamento. O pipeline apaga a repetida do
 * `bib_entry`, passa as citações dela à que fica e grava `redirecionamento` (`tipo 'obra'`, `criado 0`) de um número do livro
 * para outro. O número antigo continua valendo no app: o endereço `/obra/<antigo>` leva à obra que ficou, a citação que a
 * pessoa ligou ao número antigo abre a que ficou (com a referência dela), e as notas feitas na antiga aparecem na que ficou.
 * Aqui a linha sintética `BIB-800001` → `BIB-900001` entra num banco de escrita (o pacote sintético não tem obra unida); só
 * dados TESTE inventados.
 */
import { screen, waitFor, within } from '@testing-library/react'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { item } from '../banco/consultas'
import { redirecionamentosDoPacote } from '../pacote/redirecionamentos'
import { ligar, excluirLigacao } from '../revisao/ligacoes'
import { referenciasComLigacoes } from '../revisao/referencias'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { estadoAtual, registrar } from '../usuario/estado'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

const endereco = () => screen.getByTestId('endereco').textContent

beforeAll(async () => {
  usarMotor(await bancoDeTeste({ escrita: true }))
  usarFoldDoPacoteSintetico()
  // a obra unida (BIB-800001, que não está mais no bib_entry) e duas linhas que não valem: um destino que não existe e a
  // mesma obra
  await executar(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('BIB-800001', 'BIB-900001', 'obra', 0),
    ('BIB-800002', 'BIB-999998', 'obra', 0), ('BIB-900002', 'BIB-900002', 'obra', 0)`)
  await registrar('nota', 'NT-aaaaaaaa-81', 'criar', { texto: 'nota feita na obra antes da união', alvoTipo: 'obra', alvo: 'BIB-800001' })
})
afterAll(() => usarMotor(null))
afterEach(() => instalarMatchMedia(375))

describe('a obra unida (redirecionamento de um número do livro para outro)', () => {
  it('o redirecionamento vale só para uma obra que existe e que não é a própria', async () => {
    const mapa = await redirecionamentosDoPacote()
    expect(mapa.get('BIB-800001')).toBe('BIB-900001')
    expect(mapa.has('BIB-800002')).toBe(false)
    expect(mapa.has('BIB-900002')).toBe(false)
  })

  it.each([375, 1280])('o endereço antigo /obra/BIB-800001 leva à obra que ficou (%i px)', async (largura) => {
    instalarMatchMedia(largura)
    renderizarRota('/obra/BIB-800001')
    await waitFor(() => expect(endereco()).toBe('/obra/BIB-900001'))
    expect(await screen.findByText('BIB-900001')).toBeInTheDocument()
    expect(screen.queryByText('Obra não encontrada')).toBeNull()
  })

  it('um número que não existe e não foi unido continua «Obra não encontrada»', async () => {
    renderizarRota('/obra/BIB-800002')
    expect(await screen.findByText('Obra não encontrada')).toBeInTheDocument()
    expect(endereco()).toBe('/obra/BIB-800002')
  })

  it('a citação que a pessoa ligou ao número antigo abre a obra que ficou, com a referência dela', async () => {
    const refs = (await item('CA00004'))!.bibliografia
    const nao = refs.find((r) => r.bruto === 'Inventado 2001: 5')!
    expect(nao.obraId).toBeNull()
    await ligar('inventado 2001', 'BIB-800001')
    try {
      const mapa = await redirecionamentosDoPacote()
      const [r] = referenciasComLigacoes(estadoAtual(), [nao], new Map(), undefined, mapa)
      expect(r!.obraId).toBe('BIB-900001')
      expect(r!.resolvida).toBe(true)
      expect(r!.ligadaPorVoce).toBe(true)
    } finally {
      await excluirLigacao('inventado 2001')
    }
  })

  it('a nota feita na obra antiga aparece na obra que ficou', async () => {
    renderizarRota('/obra/BIB-900001')
    const notas = await screen.findByRole('region', { name: 'Notas SKC' })
    await waitFor(() => expect(within(notas).getByText(/nota feita na obra antes da união/)).toBeInTheDocument())
  })
})
