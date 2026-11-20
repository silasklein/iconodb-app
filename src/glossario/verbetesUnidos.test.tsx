/**
 * Etapa 4, Tarefa 27 (revisão do branch, I2): os verbetes do glossário unidos de um livro para outro. Quando o processamento
 * funde dois verbetes, o que sai deixa o `glossary_entry` e o pacote grava `redirecionamento` (`tipo 'verbete'`, `criado 0`) de
 * um `GL-<dígitos>` para outro. O número antigo continua valendo no app: o endereço `/verbete/<antigo>` leva ao que ficou, as
 * notas feitas no antigo aparecem no que ficou, as hipóteses SKC com o termo antigo também, e um `[[GL-<antigo>]]` abre o que
 * ficou. Nada disso é «Este verbete veio de você» (`criado 0`).
 * Aqui a linha sintética `GL-800001` → `GL-900002` entra num banco de escrita (o pacote sintético não tem verbete unido); só
 * dados TESTE inventados.
 */
import { renderHook, screen, waitFor, within } from '@testing-library/react'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { useHipotesesDoVerbete, useNomeVivo } from './doUsuario'
import { resolverAlvos } from '../notas/alvos'
import { chaveDoAlvo } from '../notas/links'
import { criadosDoPacote, redirecionamentosDoPacote } from '../pacote/redirecionamentos'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { estadoAtual, registrar } from '../usuario/estado'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

const endereco = () => screen.getByTestId('endereco').textContent

beforeAll(async () => {
  usarMotor(await bancoDeTeste({ escrita: true }))
  usarFoldDoPacoteSintetico()
  // o verbete unido (GL-800001, que não está mais no glossary_entry) e três linhas que não valem: um destino que não existe,
  // o próprio verbete e uma origem que o pacote ainda tem (GL-900001 existe: um redirecionamento esconderia um verbete vivo)
  await executar(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-800001', 'GL-900002', 'verbete', 0),
    ('GL-800002', 'GL-999998', 'verbete', 0), ('GL-900004', 'GL-900004', 'verbete', 0), ('GL-900001', 'GL-900003', 'verbete', 0)`)
  await registrar('nota', 'NT-aaaaaaaa-91', 'criar', { texto: 'nota feita no verbete antes da união', alvoTipo: 'verbete', alvo: 'GL-800001' })
  await registrar('hipotese', 'HY-aaaaaaaa-91', 'criar', {
    objeto: 'CA00001',
    sobre: 'objeto',
    elemento: null,
    elementoRotulo: '',
    termos: ['GL-800001'],
    termosRotulos: ['termo antigo da união'],
    nivel: 'iconographic',
    modalidade: 'possible',
    justificativa: 'ver [[GL-800001|o termo antigo]]',
    ancora: null,
  })
})
afterAll(() => usarMotor(null))
afterEach(() => instalarMatchMedia(375))

describe('o verbete unido (redirecionamento de um número do livro para outro)', () => {
  it('vale só para um destino que existe, que não é o próprio, e de uma origem que o pacote não tem mais', async () => {
    const mapa = await redirecionamentosDoPacote()
    expect(mapa.get('GL-800001')).toBe('GL-900002')
    expect(mapa.has('GL-800002')).toBe(false)
    expect(mapa.has('GL-900004')).toBe(false)
    expect(mapa.has('GL-900001')).toBe(false)
    // criado 0: o destino não veio de você
    expect((await criadosDoPacote()).has('GL-800001')).toBe(false)
  })

  it.each([375, 1280])('o endereço antigo /verbete/GL-800001 leva ao verbete que ficou, sem «veio de você» (%i px)', async (largura) => {
    instalarMatchMedia(largura)
    renderizarRota('/verbete/GL-800001?q=x')
    // o endereço é trocado (replace), com a busca de antes
    await waitFor(() => expect(endereco()).toBe('/verbete/GL-900002?q=x'))
    expect((await screen.findAllByRole('heading', { name: /figura denteada/ })).length).toBeGreaterThan(0)
    expect(screen.queryByText('Verbete não encontrado')).toBeNull()
    expect(screen.queryByText('Este verbete veio de você')).toBeNull()
  })

  it('o verbete que existe abre como sempre (GL-900001, com uma linha inválida para ele)', async () => {
    renderizarRota('/verbete/GL-900001')
    expect(await screen.findByRole('heading', { level: 1, name: /leão-de-teste/ })).toBeInTheDocument()
    expect(endereco()).toBe('/verbete/GL-900001')
  })

  it('um número que não existe e não foi unido continua «Verbete não encontrado»', async () => {
    renderizarRota('/verbete/GL-800002')
    expect(await screen.findByText('Verbete não encontrado')).toBeInTheDocument()
    expect(endereco()).toBe('/verbete/GL-800002')
  })

  it('a nota feita no verbete antigo aparece no que ficou', async () => {
    renderizarRota('/verbete/GL-900002')
    const notas = await screen.findByRole('region', { name: 'Notas SKC' })
    await waitFor(() => expect(within(notas).getByText(/nota feita no verbete antes da união/)).toBeInTheDocument())
  })

  it('a hipótese SKC com o termo antigo está no verbete que ficou, com o nome dele', async () => {
    const h = renderHook(() => useHipotesesDoVerbete('GL-900002'))
    await waitFor(() => expect(h.result.current.map((x) => x.id)).toContain('HY-aaaaaaaa-91'))
    const nome = renderHook(() => useNomeVivo())
    await waitFor(() => expect(nome.result.current('GL-800001', 'termo antigo da união')).toBe('figura denteada'))
    renderizarRota('/verbete/GL-900002')
    await waitFor(() => expect(document.querySelector('a.hipotese-linha[href="/item/CA00001?hipotese=HY-aaaaaaaa-91"]')).not.toBeNull())
  })

  it('[[GL-800001|…]] abre o verbete que ficou', async () => {
    const r = await resolverAlvos([{ tipo: 'verbete', ref: 'GL-800001' }], estadoAtual())
    expect(r.get(chaveDoAlvo('verbete', 'GL-800001'))).toMatchObject({ existe: true, rota: '/verbete/GL-900002', rotulo: 'figura denteada' })
  })
})
