/**
 * Parte 2C, bloco 2 (Tarefa 11): a caixa «Mesclar» com o outro já escolhido (`outroInicial`, como a Revisão a abre na Tarefa 15)
 * e o caso «seu × dos livros». As telas da página do sítio estão em src/telas/Sitio.test.tsx.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { A, ev } from '../../tests/suporte/eventosDeTeste'
import type { IndiceDeNotas } from '../notas/indiceDeNotas'
import { ladosEmOrdem } from '../revisao/pares'
import { fundir } from '../usuario/fusao'
import { usarMotor } from '../banco/cliente'
import { estadoAtual, registrar } from '../usuario/estado'
import { Mesclar, MescladoAqui, sobreOsSitios, useSobreOsSitios } from './Mesclar'
import { PACOTE_VAZIO, resolverSitios } from './resolucao'

vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  await registrar('sitio', 'SI-mesclarb-1', 'criar', { nome: 'Tell Exemplo', grafias: [{ texto: 'Tel Exemplo' }] })
  await registrar('objeto', 'OB-mesclarb-1', 'criar', { periodo: 'CA', titulo: 'Objeto do exemplo', sitio: 'SI-mesclarb-1', sitioNome: 'Tell Exemplo', origemTipo: 'achado' })
  await registrar('nota', 'NT-mesclarb-1', 'criar', { texto: 'uma nota', alvoTipo: 'sitio', alvo: 'SI-mesclarb-1' })
})
afterAll(() => usarMotor(null))

const abrir = (id: string, outroInicial?: string, aoFechar = vi.fn()) =>
  render(
    <MemoryRouter>
      <Mesclar id={id} outroInicial={outroInicial} aoFechar={aoFechar} />
    </MemoryRouter>,
  )

describe('<Mesclar outroInicial>', () => {
  it('abre já em «Qual fica?»: o do livro sugerido, o seu com «seu», o id e a contagem', async () => {
    abrir('SI-mesclarb-1', 'TESTE-1')
    const caixa = await screen.findByRole('group', { name: 'Mesclar Tell Exemplo e Maḥteṣ Teste' })
    expect(within(caixa).getByText('Sugestão: o do livro fica.')).toBeInTheDocument()
    expect(within(caixa).getByRole('radio', { name: /Maḥteṣ Teste/ })).toBeChecked()
    expect(within(caixa).getByRole('radio', { name: /Tell Exemplo/ }).closest('label')).toHaveTextContent('Tell ExemploseuSI-mesclarb-11 objeto')
    await waitFor(() => expect(within(caixa).getByRole('button', { name: 'Cancelar' })).toHaveFocus())
    expect(within(caixa).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'o nome «Tell Exemplo» e a grafia «Tel Exemplo» passam a ser grafias de Maḥteṣ Teste;',
      'o objeto e a nota de Tell Exemplo passam a contar em Maḥteṣ Teste;',
      'a coordenada que vale é a de Maḥteṣ Teste.',
    ])
  })

  it('«Cancelar» fecha sem gravar; «Mesclar» grava no que entra e fecha', async () => {
    const aoFechar = vi.fn()
    const r = abrir('SI-mesclarb-1', 'TESTE-1', aoFechar)
    const caixa = await screen.findByRole('group', { name: /^Mesclar Tell Exemplo e/ })
    await userEvent.click(within(caixa).getByRole('button', { name: 'Cancelar' }))
    expect(aoFechar).toHaveBeenCalledTimes(1)
    expect(estadoAtual().registro('sitio', 'SI-mesclarb-1')?.campos.mescladoEm).toBeUndefined()
    await userEvent.click(within(caixa).getByRole('button', { name: 'Mesclar' }))
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(2))
    expect(estadoAtual().registro('sitio', 'SI-mesclarb-1')?.campos.mescladoEm).toBe('TESTE-1')
    r.unmount()
    await registrar('sitio', 'SI-mesclarb-1', 'alterar', { mescladoEm: null })
  })

  it('I1: só as notas vivas feitas no sítio contam (a única nota excluída não vira «a nota»)', async () => {
    await registrar('sitio', 'SI-mesclarc-1', 'criar', { nome: 'Tell Sem Nota' })
    await registrar('nota', 'NT-mesclarc-1', 'criar', { texto: 'nota que será excluída', alvoTipo: 'sitio', alvo: 'SI-mesclarc-1' })
    await registrar('nota', 'NT-mesclarc-1', 'excluir')
    // uma nota de outro alvo que só cita o sítio também não é «a nota dele»
    await registrar('nota', 'NT-mesclarc-2', 'criar', { texto: 'veja [[SI-mesclarc-1|o tell]]', alvoTipo: 'objeto', alvo: 'CA00001' })
    abrir('SI-mesclarc-1', 'TESTE-1')
    const caixa = await screen.findByRole('group', { name: 'Mesclar Tell Sem Nota e Maḥteṣ Teste' })
    expect(within(caixa).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'o nome «Tell Sem Nota» passa a ser grafia de Maḥteṣ Teste;',
      'a coordenada que vale é a de Maḥteṣ Teste.',
    ])
  })

  it('um par que não vale (o outro já foi mesclado): volta a «Com qual sítio?»', async () => {
    abrir('TESTE-2', 'TESTE-4')
    expect(await screen.findByRole('group', { name: 'Mesclar Tell Probe Teste com outro sítio' })).toBeInTheDocument()
  })
})

/**
 * M-1: um sítio seu que o processamento publicou com um id de livro (o pacote sintético: `SI-teste123-1` → TESTE-3, «criado»)
 * continua seu. TESTE-2 é o contrário: um `SI-…` só leva a ele (não o criou), e ele continua do livro.
 */
describe('M-1: um sítio seu publicado (id de livro) continua «seu»', () => {
  function MescladosEm({ id }: { id: string }) {
    const sobre = useSobreOsSitios()
    return sobre ? <MescladoAqui id={id} sobre={sobre} aoAbrir={() => {}} aoDesfazer={() => {}} /> : null
  }

  it('«Qual fica?»: o publicado diz «seu», e o do livro é o sugerido, mesmo com número maior (TESTE-7 antes de TESTE-3)', async () => {
    abrir('TESTE-3', 'TESTE-7')
    const caixa = await screen.findByRole('group', { name: /^Mesclar Tell Usuário.* e Maḥtiṣ Teste$/ })
    expect(within(caixa).getByText('Sugestão: o do livro fica.')).toBeInTheDocument()
    expect(within(caixa).getByRole('radio', { name: /Maḥtiṣ Teste/ })).toBeChecked()
    expect(within(caixa).getByRole('radio', { name: /Tell Usuário/ }).closest('label')).toHaveTextContent(/^Tell Usuário.*seuTESTE-3/)
    expect(within(caixa).getByRole('radio', { name: /Maḥtiṣ Teste/ }).closest('label')).toHaveTextContent(/^Maḥtiṣ Testedos livrosTESTE-7/)
  })

  it('o do livro a que um sítio seu só leva (TESTE-2, sem «criado») continua «dos livros»', async () => {
    abrir('TESTE-2', 'TESTE-7')
    const caixa = await screen.findByRole('group', { name: 'Mesclar Tell Probe Teste e Maḥtiṣ Teste' })
    expect(within(caixa).getByText('Sugestão: o de número menor, que entrou primeiro.')).toBeInTheDocument()
    expect(within(caixa).getByRole('radio', { name: /Tell Probe Teste/ }).closest('label')).toHaveTextContent(/^Tell Probe Testedos livrosTESTE-2/)
  })

  it('«Mesclado aqui»: o publicado mesclado num sítio do livro sai «(seu)»', async () => {
    await registrar('sitio', 'TESTE-3', 'alterar', { mescladoEm: 'TESTE-7' })
    try {
      render(
        <MemoryRouter>
          <MescladosEm id="TESTE-7" />
        </MemoryRouter>,
      )
      await waitFor(() => expect([...document.querySelectorAll('.sitio-mesclado')].map((l) => l.textContent)).toEqual([expect.stringMatching(/^Tell Usuário.*\(seu\)desfazer$/)]))
    } finally {
      await registrar('sitio', 'TESTE-3', 'alterar', { mescladoEm: null })
    }
  })
})

describe('M-1: sobreOsSitios.criadoEm de um sítio seu publicado', () => {
  it('é o do `criar` do SI-… que o criou (não o de uma correção feita depois no id do livro): entre dois seus, o que entrou primeiro', () => {
    const estado = fundir([
      ev({ ap: A, seq: 1, ms: 1000, tipo: 'sitio', reg: 'SI-aaaaaaaa-9', op: 'criar', campos: { nome: 'Tell Teste' } }),
      ev({ ap: A, seq: 2, ms: 2000, tipo: 'sitio', reg: 'SI-bbbbbbbb-1', op: 'criar', campos: { nome: 'Tall Teste' } }),
      ev({ ap: A, seq: 3, ms: 3000, tipo: 'sitio', reg: 'TESTE-91', op: 'alterar', campos: { regiao: 'Negev' } }),
    ])
    const pacote = { ...PACOTE_VAZIO, sitios: new Set(['TESTE-91']), publicados: new Map([['SI-aaaaaaaa-9', 'TESTE-91']]), criados: new Set(['TESTE-91']) }
    const r = resolverSitios(estado, pacote)
    const sobre = sobreOsSitios(estado, r, pacote, null, null, { ligadasA: () => [] } as unknown as IndiceDeNotas)
    expect(sobre.criadoEm('TESTE-91')).toBe(estado.registro('sitio', 'SI-aaaaaaaa-9')!.criadoEm)
    expect(ladosEmOrdem('SI-bbbbbbbb-1', 'TESTE-91', sobre.criadoEm, r.eDoUsuario)).toEqual({ fica: 'TESTE-91', outro: 'SI-bbbbbbbb-1' })
  })
})
