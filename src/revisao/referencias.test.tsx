/**
 * A citação ligada no objeto (Tarefa 11): a referência abre a obra, com a marca «ligada por você»; «Desligar esta citação»
 * cria a exceção nula (só esta ocorrência; a igual em outro objeto continua ligada) e a citação volta à fila; «Religar» a
 * devolve à chave. Só o pacote sintético TESTE e citações inventadas.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { citacoesNaoResolvidasNoPacote, item, linhasDaFila } from '../banco/consultas'
import type { ReferenciaBibliografica } from '../banco/tipos'
import { criarObra, excluirObra } from '../bibliografia/operacoes'
import { BibliografiaDoObjeto } from './BibliografiaDoObjeto'
import { acharLinks } from '../item/links'
import { estadoAtual } from '../usuario/estado'
import { montarFila } from './fila'
import { excluirLigacao, ligar } from './ligacoes'
import { referenciasComLigacoes, useReferenciasComLigacoes } from './referencias'

vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
// o `ligar` de verdade, que um teste faz falhar uma vez
vi.mock('./ligacoes', async (original) => {
  const real = await original<typeof import('./ligacoes')>()
  return { ...real, ligar: vi.fn(real.ligar) }
})

let refs4: ReferenciaBibliografica[]
let refs5: ReferenciaBibliografica[]

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  refs4 = (await item('CA00004'))!.bibliografia
  refs5 = (await item('BA00001'))!.bibliografia
})
afterAll(() => usarMotor(null))
afterEach(async () => {
  for (const r of estadoAtual().registros.get('citacao')?.values() ?? []) if (!r.excluido && r.id !== 'imaginaria 2010') await excluirLigacao(r.id)
})

function Secao({ refs }: { refs: ReferenciaBibliografica[] }) {
  const b = useReferenciasComLigacoes(refs)
  return (
    <MemoryRouter>
      <BibliografiaDoObjeto referencias={b} />
    </MemoryRouter>
  )
}
const linhaDe = (texto: string) => screen.getByText(texto).closest('li')!

async function abertasNaFila(): Promise<string[]> {
  const f = montarFila({
    linhas: await linhasDaFila(),
    lugares: null,
    verbetesDoPacote: [],
    estado: estadoAtual(),
    numeracao: { porId: new Map(), rascunhos: [] },
    citacoes: await citacoesNaoResolvidasNoPacote(),
  })
  return f.grupos.find((g) => g.id === 'citacoes-nao-resolvidas')?.abertos.map((c) => c.o_que) ?? []
}

describe('a citação ligada no objeto', () => {
  it('abre a obra, com «ligada por você» e a forma Chicago da obra; o texto também a liga', async () => {
    await ligar('inventado 2001', 'BIB-900002')
    const r = referenciasComLigacoes(estadoAtual(), refs4).find((x) => x.bruto === 'Inventado 2001: 5')!
    expect(r).toMatchObject({ obraId: 'BIB-900002', resolvida: true, ligadaPorVoce: true, ocorrencia: 'inventado 2001@TESTE|TESTE-0004|Inventado 2001: 5', desligadaPorVoce: null })
    // a resolvida pelo processamento continua como estava, sem a marca
    expect(referenciasComLigacoes(estadoAtual(), refs4).find((x) => x.bruto === 'Autor 1999: 20')).toMatchObject({ obraId: 'BIB-900001', ligadaPorVoce: false })
    const texto = 'Testhausen, Sammlung Probe, Nr. 4. Autor 1999: 20; Inventado 2001: 5.'
    const links = acharLinks(texto, [], { fonte: 'TESTE I: 4', itemId: 'TESTE-0004', bibliografia: referenciasComLigacoes(estadoAtual(), refs4), remissoes: [] })
    expect(links.map((l) => l.destino)).toContain('/obra/BIB-900002')

    render(<Secao refs={refs4} />)
    const li = linhaDe('Inventado 2001: 5')
    expect(within(li).getByRole('link', { name: 'Inventado 2001: 5' })).toHaveAttribute('href', '/obra/BIB-900002')
    expect(within(li).getByText('ligada por você')).toBeInTheDocument()
    await waitFor(() => expect(li.querySelector('.bibliografia-chicago')?.textContent).toMatch(/\S/)) // o Chicago da obra dos livros
  })

  it('a obra do usuário: o Chicago vem do CSL dela', async () => {
    const obra = await criarObra({ type: 'book', title: 'Livro Inventado', author: [{ family: 'Inventado', given: 'Ana' }], issued: { 'date-parts': [[2001]] } }, 'Inventado 2001', { ligarA: 'inventado 2001' })
    const r = referenciasComLigacoes(estadoAtual(), refs5).find((x) => x.bruto === 'Inventado 2001: 9')!
    expect(r.obraId).toBe(obra)
    expect(r.chicago).toContain('Livro Inventado')
    await excluirObra(obra)
    expect(referenciasComLigacoes(estadoAtual(), refs5).find((x) => x.bruto === 'Inventado 2001: 9')).toMatchObject({ obraId: null, resolvida: false, ligadaPorVoce: false })
  })

  it('«Desligar esta citação» cria a exceção nula: só esta ocorrência sai, e volta à fila; «Religar» a devolve à chave', async () => {
    await ligar('inventado 2001', 'BIB-900002')
    expect(await abertasNaFila()).not.toContain('Inventado 2001: 5')
    render(<Secao refs={refs4} />)
    await userEvent.click(within(linhaDe('Inventado 2001: 5')).getByRole('button', { name: 'Desligar esta citação: Inventado 2001: 5' }))
    await waitFor(() => expect(within(linhaDe('Inventado 2001: 5')).getByText('desligada por você')).toBeInTheDocument())
    expect(within(linhaDe('Inventado 2001: 5')).queryByRole('link')).toBeNull()
    expect(estadoAtual().registro('citacao', 'inventado 2001@TESTE|TESTE-0004|Inventado 2001: 5')?.campos.obra).toBeNull()
    // a igual do outro objeto continua ligada; esta volta à fila
    expect(referenciasComLigacoes(estadoAtual(), refs5).find((x) => x.bruto === 'Inventado 2001: 9')?.obraId).toBe('BIB-900002')
    expect(await abertasNaFila()).toContain('Inventado 2001: 5')
    expect(await abertasNaFila()).not.toContain('Inventado 2001: 9')
    // o foco fica na linha: no botão que entrou no lugar
    await waitFor(() => expect(document.activeElement).toBe(within(linhaDe('Inventado 2001: 5')).getByRole('button', { name: 'Religar: Inventado 2001: 5' })))
    await userEvent.click(within(linhaDe('Inventado 2001: 5')).getByRole('button', { name: 'Religar: Inventado 2001: 5' }))
    await waitFor(() => expect(within(linhaDe('Inventado 2001: 5')).getByRole('link', { name: 'Inventado 2001: 5' })).toHaveAttribute('href', '/obra/BIB-900002'))
    expect(await abertasNaFila()).not.toContain('Inventado 2001: 5')
    await waitFor(() => expect(document.activeElement).toBe(within(linhaDe('Inventado 2001: 5')).getByRole('button', { name: 'Desligar esta citação: Inventado 2001: 5' })))
  })

  it('a sem autor, ligada pela própria ocorrência: desligada não tem «Religar» (a chave não a alcança); «Desfazer» devolve a obra (R2)', async () => {
    const refs6 = (await item('BA00002'))!.bibliografia
    await ligar('-@TESTE|TESTE-0006|1999: 12', 'BIB-900001')
    render(<Secao refs={refs6} />)
    const linha = () => linhaDe('1999: 12')
    expect(within(linha()).getByRole('link', { name: '1999: 12' })).toHaveAttribute('href', '/obra/BIB-900001')
    await userEvent.click(within(linha()).getByRole('button', { name: 'Desligar esta citação: 1999: 12' }))
    await waitFor(() => expect(within(linha()).getByText('desligada por você')).toBeInTheDocument())
    expect(within(linha()).queryByRole('button', { name: /^Religar/ })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(within(linha()).getByText('1999: 12')))
    expect(await abertasNaFila()).toContain('1999: 12; sem autor na citação')
    expect(screen.getByRole('status')).toHaveTextContent('«1999: 12»: desligada. Volta à fila da Revisão.')
    await userEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(within(linha()).getByRole('link', { name: '1999: 12' })).toHaveAttribute('href', '/obra/BIB-900001'))
    expect(estadoAtual().registro('citacao', '-@TESTE|TESTE-0006|1999: 12')?.campos.obra).toBe('BIB-900001')
    expect(await abertasNaFila()).not.toContain('1999: 12; sem autor na citação')
    await waitFor(() => expect(document.activeElement).toBe(within(linha()).getByRole('button', { name: 'Desligar esta citação: 1999: 12' })))
  })

  it('uma gravação que falha avisa e não muda nada', async () => {
    await ligar('inventado 2001', 'BIB-900002')
    vi.mocked(ligar).mockRejectedValueOnce(new Error('falhou'))
    render(<Secao refs={refs4} />)
    await userEvent.click(within(linhaDe('Inventado 2001: 5')).getByRole('button', { name: 'Desligar esta citação: Inventado 2001: 5' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível guardar; tente de novo. Nada foi perdido.')
    expect(within(linhaDe('Inventado 2001: 5')).getByText('ligada por você')).toBeInTheDocument()
  })

  it('a ligação do usuário que o pacote já traz tem a marca e se desliga do mesmo jeito', async () => {
    const refs6 = (await item('BA00002'))!.bibliografia
    const r = referenciasComLigacoes(estadoAtual(), refs6).find((x) => x.bruto === 'Imaginária 2010: 3')!
    expect(r).toMatchObject({ obraId: 'BIB-900090', ligadaPorVoce: true })
    await ligar(r.ocorrencia!, null)
    expect(referenciasComLigacoes(estadoAtual(), refs6).find((x) => x.bruto === 'Imaginária 2010: 3')).toMatchObject({ obraId: null, desligadaPorVoce: r.ocorrencia })
    expect(await abertasNaFila()).toContain('Imaginária 2010: 3')
    await excluirLigacao(r.ocorrencia!)
  })
})
