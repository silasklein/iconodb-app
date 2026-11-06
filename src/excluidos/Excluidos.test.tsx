/**
 * 2C, bloco 1, Tarefa 3: a tela «Excluídos» (`#/excluidos`, spec §4) sobre o pacote sintético. A lista por tipo, a aprovação
 * no lugar antes de restaurar (foco em «Cancelar»; só o «Restaurar» da caixa grava), a mensagem viva «Restaurado: …» com
 * «Ver», «Restaurar o objeto» numa linha cujo objeto também está excluído, a origem publicada e a que nunca chegou.
 */
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { renderizarRota } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { gravarConfig, lerConfig } from '../usuario/diarioLocal'
import { estadoAtual, registrar } from '../usuario/estado'
import { CHAVE_DOS_NOMES, esquecerNomesGuardados } from './nomesGuardados'
import type { Tipo } from '../usuario/eventos'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

beforeAll(async () => usarMotor(await bancoDeTeste()))
afterAll(() => usarMotor(null))
// m-2: o mapa de nomes guardados (P5) vive no módulo e no IndexedDB: nada passa de um teste para o outro
afterEach(() => esquecerNomesGuardados())
beforeEach(async () => {
  esquecerNomesGuardados()
  await gravarConfig(CHAVE_DOS_NOMES, undefined)
  instalarMatchMedia(375)
  // Cada teste começa sem nada excluído (restaurar é uma marca nova; nada se apaga).
  for (const r of [...estadoAtual().excluidos]) await registrar(r.tipo, r.id, 'restaurar')
})

let n = 0
const excluido = (tipo: Tipo, id: string) => estadoAtual().registro(tipo, id)?.excluido ?? null
async function notaExcluida(texto: string, alvo = 'CA00001'): Promise<string> {
  const id = `NT-texcl003-${++n}`
  await registrar('nota', id, 'criar', { texto, alvoTipo: 'objeto', alvo })
  await registrar('nota', id, 'excluir')
  return id
}

describe('a tela', () => {
  it('título, apoio e, sem nada excluído, o texto da lista vazia', async () => {
    renderizarRota('/excluidos')
    expect(await screen.findByRole('heading', { level: 1, name: 'Excluídos' })).toBeInTheDocument()
    expect(screen.getByText('O que você excluiu fica guardado e pode voltar.')).toBeInTheDocument()
    expect(screen.getByText('Nada excluído. O que você excluir aparece aqui e pode ser restaurado.')).toBeInTheDocument()
  })

  it('um grupo por tipo, com a contagem; a linha com o nome (que abre o item), onde estava e quando, e «Restaurar»', async () => {
    const id = await notaExcluida('Rever a datação')
    await registrar('colecao', 'CO-texcl003-1', 'criar', { nome: 'Selos de teste' })
    await registrar('colecao', 'CO-texcl003-1', 'excluir')
    renderizarRota('/excluidos')
    const notas = await screen.findByRole('region', { name: 'Notas' })
    expect(within(notas).getByText('1')).toBeInTheDocument()
    const nome = within(notas).getByRole('link', { name: '«Rever a datação»' })
    expect(nome).toHaveAttribute('href', `/nota/${id}`)
    expect(within(notas).getByText(/^nota em CA00001 · hoje, \d\d:\d\d$/)).toBeInTheDocument()
    expect(within(notas).getByRole('button', { name: 'Restaurar' })).toBeInTheDocument()
    const colecoes = screen.getByRole('region', { name: 'Coleções' })
    expect(within(colecoes).getByRole('link', { name: 'Selos de teste' })).toBeInTheDocument()
    // a ordem dos grupos: Notas antes de Coleções
    expect(notas.compareDocumentPosition(colecoes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText('Nada excluído. O que você excluir aparece aqui e pode ser restaurado.')).toBeNull()
  })
})

describe('restaurar, com aprovação', () => {
  it('«Restaurar» abre a caixa no lugar (foco em «Cancelar»); «Cancelar» não grava e devolve o foco', async () => {
    const usuario = userEvent.setup()
    const id = await notaExcluida('Rever a datação')
    renderizarRota('/excluidos')
    const notas = await screen.findByRole('region', { name: 'Notas' })
    const gatilho = within(notas).getByRole('button', { name: 'Restaurar' })
    await usuario.click(gatilho)
    const caixa = within(notas).getByRole('group', { name: 'Restaurar a nota em CA00001?' })
    expect(caixa).toHaveTextContent('Restaurar a nota em CA00001?')
    const cancelar = within(caixa).getByRole('button', { name: 'Cancelar' })
    expect(cancelar).toHaveFocus()
    expect(within(caixa).getByRole('button', { name: 'Restaurar' })).toBeInTheDocument()
    // com a caixa aberta, o «Restaurar» da linha sai (só o da caixa grava)
    expect(within(notas).getAllByRole('button', { name: 'Restaurar' })).toHaveLength(1)
    expect(excluido('nota', id)).toBe(true)
    await usuario.click(cancelar)
    expect(within(notas).queryByRole('group')).toBeNull()
    expect(within(notas).getByRole('button', { name: 'Restaurar' })).toHaveFocus()
    expect(excluido('nota', id)).toBe(true)
  })

  it('o «Restaurar» da caixa grava: a linha sai e a mensagem viva diz «Restaurado: …» com «Ver»', async () => {
    const usuario = userEvent.setup()
    const id = await notaExcluida('Rever a datação')
    renderizarRota('/excluidos')
    const notas = await screen.findByRole('region', { name: 'Notas' })
    await usuario.click(within(notas).getByRole('button', { name: 'Restaurar' }))
    const caixa = within(notas).getByRole('group', { name: 'Restaurar a nota em CA00001?' })
    await usuario.click(within(caixa).getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(excluido('nota', id)).toBe(false))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Notas' })).toBeNull())
    expect(screen.getByText('Nada excluído. O que você excluir aparece aqui e pode ser restaurado.')).toBeInTheDocument()
    const mensagem = screen.getByRole('status', { name: 'Mensagem dos excluídos' })
    await waitFor(() => expect(mensagem).toHaveTextContent('Restaurado: «Rever a datação».'))
    expect(within(mensagem).getByRole('link', { name: 'Ver' })).toHaveAttribute('href', `/nota/${id}`)
    // sem mais linhas, o foco vai ao título (nunca se perde no corpo da página)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Excluídos' })).toHaveFocus())
  })

  it('depois de restaurar, o foco vai ao «Restaurar» da linha que ficou no lugar', async () => {
    const usuario = userEvent.setup()
    await notaExcluida('mais antiga')
    await notaExcluida('mais nova')
    renderizarRota('/excluidos')
    const notas = await screen.findByRole('region', { name: 'Notas' })
    const [primeira] = within(notas).getAllByRole('button', { name: 'Restaurar' })
    expect(primeira).toHaveAccessibleDescription('«mais nova»')
    await usuario.click(primeira!)
    await usuario.click(within(within(notas).getByRole('group')).getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(within(notas).getAllByRole('button', { name: 'Restaurar' })).toHaveLength(1))
    const resta = within(notas).getByRole('button', { name: 'Restaurar' })
    expect(resta).toHaveAccessibleDescription('«mais antiga»')
    await waitFor(() => expect(resta).toHaveFocus())
  })

  it('a caixa de um objeto conta o que volta junto e para onde; restaurar escreve um só evento «restaurar»', async () => {
    const usuario = userEvent.setup()
    const ob = 'OB-texcl003-1'
    await registrar('objeto', ob, 'criar', { origemTipo: 'publicacao', periodo: 'CA', titulo: 'Selo sintético de teste.' })
    await registrar('objeto', ob, 'alterar', { numero: 'CA00005' })
    await registrar('imagem', 'IM-texcl003-1', 'criar', { alvoTipo: 'objeto', alvo: ob, nome: 'IMG_2041.HEIC', formato: 'jpeg' })
    await registrar('nota', 'NT-texcl003-90', 'criar', { texto: 'n', alvoTipo: 'objeto', alvo: ob })
    await registrar('colecao', 'CO-texcl003-2', 'criar', { nome: 'Selos para comparar', [`m:${ob}`]: true, [`i:${ob}`]: 1024 })
    await registrar('objeto', ob, 'excluir')
    renderizarRota('/excluidos')
    const objetos = await screen.findByRole('region', { name: 'Objetos SKC' })
    expect(within(objetos).getByRole('link', { name: 'CA00005' })).toHaveAttribute('href', `/item/${ob}`)
    expect(within(objetos).getByText(/^Selo sintético de teste\. · hoje, /)).toBeInTheDocument()
    await usuario.click(within(objetos).getByRole('button', { name: 'Restaurar' }))
    const caixa = within(objetos).getByRole('group', { name: 'Restaurar o objeto CA00005?' })
    expect(caixa).toHaveTextContent(
      'Restaurar o objeto CA00005? Voltam com ele a foto e a nota. Ele volta às listas e à coleção «Selos para comparar», no mesmo lugar, com o mesmo número.',
    )
    const antes = estadoAtual().marcaDeExclusao('objeto', ob)
    await usuario.click(within(caixa).getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(excluido('objeto', ob)).toBe(false))
    expect(estadoAtual().marcaDeExclusao('objeto', ob)?.op).toBe('restaurar')
    expect(estadoAtual().marcaDeExclusao('objeto', ob)?.hlc).not.toBe(antes?.hlc)
    await waitFor(() => expect(screen.getByRole('status', { name: 'Mensagem dos excluídos' })).toHaveTextContent('Restaurado: CA00005.'))
  })

  it('a foto excluída de um objeto excluído: «o objeto dela também está excluído» e «Restaurar o objeto», que restaura só o objeto', async () => {
    const usuario = userEvent.setup()
    const ob = 'OB-texcl003-2'
    await registrar('objeto', ob, 'criar', { origemTipo: 'publicacao', periodo: 'CA', titulo: 'Outro selo.' })
    await registrar('objeto', ob, 'alterar', { numero: 'CA00006' })
    await registrar('imagem', 'IM-texcl003-2', 'criar', { alvoTipo: 'objeto', alvo: ob, nome: 'IMG_2041.HEIC', formato: 'jpeg' })
    await registrar('imagem', 'IM-texcl003-2', 'excluir')
    await registrar('objeto', ob, 'excluir')
    renderizarRota('/excluidos')
    const fotos = await screen.findByRole('region', { name: 'Fotos' })
    expect(within(fotos).getByText(/^foto de CA00006 · o objeto dela também está excluído · hoje, /)).toBeInTheDocument()
    const doObjeto = within(fotos).getByRole('button', { name: 'Restaurar o objeto' })
    await usuario.click(doObjeto)
    const caixa = within(fotos).getByRole('group', { name: 'Restaurar o objeto CA00006?' })
    expect(within(caixa).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    await usuario.click(within(caixa).getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(excluido('objeto', ob)).toBe(false))
    expect(excluido('imagem', 'IM-texcl003-2')).toBe(true)
    await waitFor(() => expect(within(fotos).queryByRole('button', { name: 'Restaurar o objeto' })).toBeNull())
    expect(within(fotos).getByText(/^foto de CA00006 · hoje, /)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Objetos SKC' })).toBeNull()
  })
})

describe('entradas publicadas', () => {
  it('a origem publicada que o pacote ainda traz: «sai dos livros na próxima importação» e a caixa do sítio publicado', async () => {
    const usuario = userEvent.setup()
    await registrar('sitio', 'SI-teste123-1', 'criar', { nome: 'Tell Usuário Teste' })
    await registrar('sitio', 'SI-teste123-1', 'excluir')
    renderizarRota('/excluidos')
    const sitios = await screen.findByRole('region', { name: 'Sítios' })
    expect(await within(sitios).findByText(/^sai dos livros na próxima importação · hoje, /)).toBeInTheDocument()
    await usuario.click(within(sitios).getByRole('button', { name: 'Restaurar' }))
    const caixa = within(sitios).getByRole('group', { name: 'Restaurar o sítio «Tell Usuário Teste»?' })
    expect(caixa).toHaveTextContent(
      'Restaurar o sítio «Tell Usuário Teste»? Ele continua nos livros, com o mesmo TESTE-3, e os objetos e notas ligados a ele voltam a se ligar a ele.',
    )
    // T3-e: o número dos livros não quebra no hífen («TESTE-» / «3»)
    expect(within(caixa).getByText('TESTE-3')).toHaveClass('exc-sem-quebra')
  })

  it('P5: o nome da origem só com a marca fica guardado neste aparelho e continua depois da importação (sem o redirecionamento)', async () => {
    await act(() => registrar('verbete', 'GL-teste123-1', 'excluir'))
    // antes da importação: o pacote traz a entrada; a tela mostra o nome e o guarda
    const r = renderizarRota('/excluidos')
    const verbetes = await screen.findByRole('region', { name: 'Verbetes' })
    expect(await within(verbetes).findByRole('link', { name: 'amuleto de prova' })).toBeInTheDocument()
    await waitFor(async () => expect(await lerConfig(CHAVE_DOS_NOMES)).toEqual({ 'GL-teste123-1': 'amuleto de prova' }))
    r.unmount()
    // depois da importação: a entrada saiu dos livros (sem o redirecionamento); o app foi reaberto (a memória esquecida)
    usarMotor(await bancoDeTeste({ escrita: true }))
    try {
      await executar(`DELETE FROM main.redirecionamento WHERE de = 'GL-teste123-1'`)
      esquecerNomesGuardados()
      renderizarRota('/excluidos')
      const depois = await screen.findByRole('region', { name: 'Verbetes' })
      expect(await within(depois).findByText('amuleto de prova')).toBeInTheDocument()
      expect(within(depois).queryByText(/GL-teste123-1/)).toBeNull()
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })

  it('a origem que nunca chegou (só a marca): o nome da entrada dos livros, nunca o id', async () => {
    await act(() => registrar('verbete', 'GL-teste123-1', 'excluir'))
    renderizarRota('/excluidos')
    const verbetes = await screen.findByRole('region', { name: 'Verbetes' })
    expect(await within(verbetes).findByRole('link', { name: 'amuleto de prova' })).toBeInTheDocument()
    expect(within(verbetes).queryByText(/GL-teste123-1/)).toBeNull()
  })
})

describe('revisão 1', () => {
  it('as origens excluídas da mesma entrada dos livros voltam juntas, numa só gravação, e a aprovação diz isso', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    try {
      await executar(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('SI-eeeeeeee-1', 'TESTE-3', 'sitio', 1)`)
      await registrar('sitio', 'SI-teste123-1', 'criar', { nome: 'Tell Usuário Teste' })
      await registrar('sitio', 'SI-eeeeeeee-1', 'criar', { nome: 'Tell Outro Teste' })
      await registrar('sitio', 'SI-teste123-1', 'excluir')
      await registrar('sitio', 'SI-eeeeeeee-1', 'excluir')
      const usuario = userEvent.setup()
      renderizarRota('/excluidos')
      const sitios = await screen.findByRole('region', { name: 'Sítios' })
      const pergunta = 'Restaurar os seus 2 sítios «Tell Outro Teste» e «Tell Usuário Teste»?'
      await waitFor(() => expect(within(sitios).getAllByText(/sai dos livros na próxima importação/)).toHaveLength(2))
      await usuario.click(within(sitios).getAllByRole('button', { name: 'Restaurar' })[0]!)
      const caixa = within(sitios).getByRole('group', { name: pergunta })
      expect(caixa).toHaveTextContent(`${pergunta} Eles continuam nos livros, com o mesmo TESTE-3, e os objetos e notas ligados a eles voltam a se ligar a eles.`)
      await usuario.click(within(caixa).getByRole('button', { name: 'Restaurar' }))
      await waitFor(() => expect([excluido('sitio', 'SI-teste123-1'), excluido('sitio', 'SI-eeeeeeee-1')]).toEqual([false, false]))
      const gravacao = (id: string) => estadoAtual().marcaDeExclusao('sitio', id)!.evento.split('-').slice(0, 2).join('-')
      expect(gravacao('SI-teste123-1')).toBe(gravacao('SI-eeeeeeee-1'))
      await waitFor(() => expect(screen.getByRole('status', { name: 'Mensagem dos excluídos' })).toHaveTextContent('Restaurado: Tell Outro Teste e Tell Usuário Teste.'))
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Sítios' })).toBeNull())
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })

  it('um nome que já termina em ponto não ganha outro na mensagem', async () => {
    const usuario = userEvent.setup()
    const ob = 'OB-texcl003-3'
    await registrar('objeto', ob, 'criar', { origemTipo: 'publicacao', titulo: 'Selo sem número.' })
    await registrar('objeto', ob, 'excluir')
    renderizarRota('/excluidos')
    const objetos = await screen.findByRole('region', { name: 'Objetos SKC' })
    await usuario.click(within(objetos).getByRole('button', { name: 'Restaurar' }))
    await usuario.click(within(within(objetos).getByRole('group')).getByRole('button', { name: 'Restaurar' }))
    const mensagem = screen.getByRole('status', { name: 'Mensagem dos excluídos' })
    expect(await within(mensagem).findByText('Restaurado: Selo sem número.')).toBeInTheDocument()
  })

  it('a mensagem com o foco em «Ver» espera; quando o foco sai, ela some no tempo seguinte (nunca fica para sempre)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
    try {
      const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const id = await notaExcluida('Nota do relógio')
      renderizarRota('/excluidos')
      const notas = await screen.findByRole('region', { name: 'Notas' })
      await usuario.click(within(notas).getByRole('button', { name: 'Restaurar' }))
      await usuario.click(within(within(notas).getByRole('group')).getByRole('button', { name: 'Restaurar' }))
      await waitFor(() => expect(excluido('nota', id)).toBe(false))
      const mensagem = screen.getByRole('status', { name: 'Mensagem dos excluídos' })
      const ver = await within(mensagem).findByRole('link', { name: 'Ver' })
      act(() => ver.focus())
      act(() => vi.advanceTimersByTime(8000))
      expect(mensagem).toHaveTextContent('Restaurado: «Nota do relógio».')
      act(() => screen.getByRole('heading', { level: 1 }).focus())
      act(() => vi.advanceTimersByTime(8000))
      expect(mensagem).toHaveTextContent(/^$/)
    } finally {
      vi.useRealTimers()
    }
  })
})
