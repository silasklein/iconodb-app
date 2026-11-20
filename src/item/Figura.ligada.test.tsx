/**
 * Etapa 4, Tarefa 27 (o ponto da revisão da Tarefa 24): a figura de um livro em parágrafos que chega a um objeto por uma LIGAÇÃO
 * do usuário (outro objeto, não a peça juntada) também tem a sua voz entre as leituras do principal: a sigla e o número, e
 * «Discutida em», com o crédito. No pacote de verdade o pipeline junta o GGG e o IPIAO num objeto só (a2), mas a pessoa pode
 * ligar no app um objeto a uma figura que ficou sozinha. Sobre o pacote sintético: CA00001 (TESTE I: 1) ligado a F200001 (a
 * figura TESTEG 1a, sem catálogo).
 */
import { screen, waitFor, within } from '@testing-library/react'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { excluirLigacao, ligar } from '../revisao/ligacoes'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { estadoAtual, registrar } from '../usuario/estado'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
})
afterAll(() => usarMotor(null))
afterEach(async () => {
  instalarMatchMedia(375)
  for (const r of estadoAtual().registros.get('ligacao')?.values() ?? []) if (r.campos.ativa === true) await registrar('ligacao', r.id, 'alterar', { ativa: false })
})

describe('a figura ligada pelo usuário tem a sua voz no principal', () => {
  it.each([375, 1280])('CA00001 ligado a F200001: a voz «TESTEG 1a» com «Discutida em» e o crédito (%i px)', async (largura) => {
    instalarMatchMedia(largura)
    await registrar('ligacao', 'CA00001|F200001', 'criar', { a: 'CA00001', b: 'F200001', ativa: true })
    renderizarRota('/item/CA00001')
    const leituras = await screen.findByRole('region', { name: 'Leituras' })
    const voz = await within(leituras).findByRole('group', { name: 'TESTEG: 1a' })
    expect(within(voz).getByText('TESTEG')).toBeInTheDocument()
    expect(within(voz).getByText('1a')).toBeInTheDocument()
    await waitFor(() => expect(voz).toHaveTextContent(/Discutida em/))
    expect(voz).toHaveTextContent(/Crédito:/)
  })
})

describe('fix round 1 da Tarefa 27 (M8): o crédito da figura ligada usa a bibliografia como o app a mostra', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    // a citação do crédito da figura 1a, sem obra no pacote (o pacote sintético não tem `bib_ref` no TESTEG)
    await executar(`INSERT INTO pub_TESTEG.bib_ref (publication, item_id, category, raw, short_cite, pages, bib_entry_id, status)
      VALUES ('TESTEG', 'TESTEG-0001a', 7, 'Autor 1999: 22', 'Autor 1999', '22', NULL, 'unresolved')`)
  })
  afterAll(() => usarMotor(null))

  it.each([375, 1280])('a citação que a pessoa ligou a uma obra no app é link na voz da figura ligada (%i px)', async (largura) => {
    instalarMatchMedia(largura)
    await ligar('autor 1999', 'BIB-900002')
    try {
      await registrar('ligacao', 'CA00001|F200001', 'criar', { a: 'CA00001', b: 'F200001', ativa: true })
      renderizarRota('/item/CA00001')
      const leituras = await screen.findByRole('region', { name: 'Leituras' })
      const voz = await within(leituras).findByRole('group', { name: 'TESTEG: 1a' })
      await waitFor(() => expect(within(voz).getByRole('link', { name: /Autor 1999: 22/ })).toHaveAttribute('href', '/obra/BIB-900002'))
    } finally {
      await excluirLigacao('autor 1999')
    }
  })
})
