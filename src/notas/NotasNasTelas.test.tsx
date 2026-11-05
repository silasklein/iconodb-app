import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { todosEventos } from '../usuario/armazem'
import { estadoAtual, registrar } from '../usuario/estado'
import { esquecerPendentes } from '../usuario/pendentes'
import { shaDoTrecho } from './ancora'
import { esquecerAlvos } from './alvos'
import { apertarQuandoPronto } from '../test/teclas'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
  Element.prototype.scrollIntoView = vi.fn()
})
afterAll(() => usarMotor(null))
beforeEach(() => esquecerAlvos())
afterEach(() => {
  instalarMatchMedia(375)
  esquecerPendentes()
})

const criar = (reg: string, campos: Record<string, unknown>) => registrar('nota', reg, 'criar', { rascunho: false, ...campos } as never)

describe('links reversos e notas no verbete', () => {
  it('o verbete mostra as notas feitas nele e as que o citam, cada uma com o texto e a ligação', async () => {
    await criar('NT-tela0000-1', { texto: 'Nota direta sobre o leão.', alvoTipo: 'verbete', alvo: 'GL-900001' })
    await criar('NT-tela0000-2', { texto: 'Comparar com [[GL-900001|o leão]] e [[CA00002]].', alvoTipo: 'objeto', alvo: 'BA00001' })
    await criar('NT-tela0000-3', { texto: 'Esta nota não cita o leão.', alvoTipo: 'obra', alvo: 'BIB-900001' })
    renderizarRota('/verbete/GL-900001')
    const secao = await screen.findByRole('region', { name: 'Notas SKC' })
    expect(within(secao).getByRole('heading', { level: 2, name: 'Notas' })).toBeInTheDocument()
    const notas = within(secao).getAllByRole('article')
    expect(notas).toHaveLength(2)
    expect(notas[0]).toHaveTextContent('Nota direta sobre o leão.')
    expect(notas[1]).toHaveTextContent('Comparar com o leão e CA00002.')
    // a que só cita diz de onde vem ("em BA00001 …") e leva até lá; a direta não precisa
    await waitFor(() => expect(within(notas[1]!).getByRole('link', { name: /^em BA00001/ })).toHaveAttribute('href', '/item/BA00001'))
    expect(within(notas[0]!).queryByRole('link', { name: /^em / })).toBeNull()
    expect(within(secao).queryByText('Esta nota não cita o leão.')).toBeNull()
  })

  it('o que a nota cita leva ao objeto; uma nota excluída some dos links reversos e volta ao restaurar', async () => {
    await criar('NT-tela0000-4', { texto: 'Cita [[GL-900002|figura]]', alvoTipo: 'objeto', alvo: 'BA00002' })
    renderizarRota('/verbete/GL-900002')
    const secao = await screen.findByRole('region', { name: 'Notas SKC' })
    expect(await within(secao).findByRole('article')).toHaveTextContent('Cita figura')
    expect(within(secao).getByRole('link', { name: 'figura' })).toHaveAttribute('href', '/verbete/GL-900002')
    await act(async () => {
      await registrar('nota', 'NT-tela0000-4', 'excluir')
    })
    await waitFor(() => expect(within(secao).queryByRole('article')).toBeNull())
    expect(within(secao).getByText('Nenhuma nota ainda.')).toBeInTheDocument()
    await act(async () => {
      await registrar('nota', 'NT-tela0000-4', 'restaurar')
    })
    expect(await within(secao).findByRole('article')).toHaveTextContent('Cita figura')
  })

  it('sem notas: o estado vazio e o caminho para escrever a primeira (celular: abre a tela da nota)', async () => {
    renderizarRota('/verbete/GL-900009')
    const secao = await screen.findByRole('region', { name: 'Notas SKC' })
    expect(within(secao).getByText('Nenhuma nota ainda.')).toBeInTheDocument()
    expect(within(secao).getByRole('link', { name: 'Escrever nota' })).toHaveAttribute('href', '/nota/nova?alvoTipo=verbete&alvo=GL-900009')
  })
})

describe('notas na obra, no sítio e no grupo', () => {
  it.each([
    ['/obra/BIB-900002', 'obra', 'BIB-900002', 'Autora 2004'],
    ['/sitio/TESTE-2', 'sitio', 'TESTE-2', 'Tell Probe'],
    ['/grupo/GR-TESTE-I-02', 'grupo', 'GR-TESTE-I-02', 'Selos de prova'],
  ])('%s mostra a nota feita nele', async (rota, tipo, ref, titulo) => {
    await criar(`NT-tela0000-${tipo}`, { texto: `Anotação em ${tipo}.`, alvoTipo: tipo, alvo: ref })
    renderizarRota(rota)
    const secao = await screen.findByRole('region', { name: 'Notas SKC' })
    expect(within(secao).getByText(`Anotação em ${tipo}.`)).toBeInTheDocument()
    expect(within(secao).getByRole('link', { name: 'Escrever nota' })).toHaveAttribute('href', `/nota/nova?alvoTipo=${tipo}&alvo=${ref}`)
    void titulo
  })
})

describe('notas no item', () => {
  it('o objeto tem a voz "SKC notas" na leitura: a data, o texto com links e "Escrever nota"', async () => {
    await criar('NT-tela0000-10', { texto: 'Comparar com [[CA00002|2]] antes de aceitar o [[GL-900001|leão]].', alvoTipo: 'objeto', alvo: 'CA00001' })
    renderizarRota('/item/CA00001')
    const leituras = await screen.findByRole('region', { name: 'Leituras' })
    const linha = within(leituras).getByRole('group', { name: 'SKC notas' })
    expect(within(linha).getByText('SKC')).toBeInTheDocument()
    const rotulo = within(linha).getByRole('link', { name: /^Editar a nota 1 de \d\d\/\d\d\/\d{4}$/ })
    expect(rotulo).toHaveAttribute('href', '/nota/NT-tela0000-10')
    expect(rotulo).toHaveTextContent(/^\[1\] · \d\d\/\d\d\/\d{4}$/)
    expect(await within(linha).findByRole('link', { name: '2 (CA00002)' })).toHaveAttribute('href', '/item/CA00002')
    expect(within(linha).getByRole('link', { name: 'leão' })).toHaveAttribute('href', '/verbete/GL-900001')
    expect(within(linha).getByRole('link', { name: 'Escrever nota' })).toHaveAttribute('href', '/nota/nova?alvoTipo=objeto&alvo=CA00001')
  })

  it('no celular o ícone "Escrever nota" do topo vai à tela da nota; sem nota ainda, a voz só tem "Escrever nota"', async () => {
    renderizarRota('/item/CA00004')
    const leituras = await screen.findByRole('region', { name: 'Leituras' })
    const linha = within(leituras).getByRole('group', { name: 'SKC notas' })
    expect(within(linha).queryByRole('article')).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Escrever nota' }).length).toBeGreaterThanOrEqual(2)
    const icone = screen.getAllByRole('link', { name: 'Escrever nota' }).find((a) => a.classList.contains('icon-button'))!
    expect(icone).toHaveAttribute('href', '/nota/nova?alvoTipo=objeto&alvo=CA00004')
    expect(icone).toHaveAttribute('data-tip', expect.stringContaining('N'))
  })

  it('a nota que cita o objeto (de outro objeto) aparece nele, dizendo de onde vem', async () => {
    await criar('NT-tela0000-11', { texto: 'Veja [[CA00004]].', alvoTipo: 'objeto', alvo: 'BA00002' })
    renderizarRota('/item/CA00004')
    const linha = within(await screen.findByRole('region', { name: 'Leituras' })).getByRole('group', { name: 'SKC notas' })
    expect(await within(linha).findByRole('article')).toHaveTextContent('Veja CA00004.')
    expect(await within(linha).findByRole('link', { name: /^em BA00002/ })).toHaveAttribute('href', '/item/BA00002')
  })

  it('decisão 40: a nota que cita a referência do objeto (no meio de um intervalo, ou o número do sistema solto) aparece nele, uma vez só', async () => {
    await criar('NT-tela0000-40', { texto: 'Série TESTE I: 1-3, 5; ver também CA00002 e TESTE I: 2.', alvoTipo: 'verbete', alvo: 'GL-900003' })
    await criar('NT-tela0000-41', { texto: 'Só TESTE I: 4.', alvoTipo: 'verbete', alvo: 'GL-900003' })
    for (const objeto of ['CA00003', 'CA00002']) {
      const { unmount } = renderizarRota(`/item/${objeto}`)
      const linha = within(await screen.findByRole('region', { name: 'Leituras' })).getByRole('group', { name: 'SKC notas' })
      // (outras notas deste arquivo também citam estes objetos: conta só esta, que aparece uma vez)
      const desta = () => within(linha).queryAllByRole('article').filter((a) => a.textContent?.includes('Série TESTE'))
      await waitFor(() => expect(desta(), objeto).toHaveLength(1))
      const nota = desta()[0]!
      expect(nota).toHaveTextContent('Série TESTE I: 1–3, 5; ver também CA00002 e TESTE I: 2.')
      expect(within(linha).queryAllByRole('article').some((a) => a.textContent?.includes('Só TESTE I: 4'))).toBe(false)
      expect(await within(nota).findByRole('link', { name: /^em / })).toHaveAttribute('href', '/verbete/GL-900003')
      unmount()
    }
  })

  it('decisão 40: "SKC: n" cita o objeto SKC com esse SKC, Nr.; a nota aparece na tela dele', async () => {
    await registrar('objeto', 'OB-citado00-1', 'criar', { numero: 'CA00047', nrSkc: '3', titulo: 'Selo citado.' })
    await criar('NT-tela0000-42', { texto: 'Parecido com SKC: 2-4.', alvoTipo: 'verbete', alvo: 'GL-900003' })
    renderizarRota('/item/OB-citado00-1')
    const linha = within(await screen.findByRole('region', { name: 'Leituras' })).getByRole('group', { name: 'SKC notas' })
    expect(await within(linha).findByRole('article')).toHaveTextContent('Parecido com SKC: 2–4.')
  })

  it('computador: "Escrever nota" abre o editor no lugar, com o rótulo e o foco; teclar grava; Salvar nota o fecha', async () => {
    instalarMatchMedia(1280)
    renderizarRota('/item/CA00002')
    const leituras = await screen.findByRole('region', { name: 'Leituras' })
    const linha = within(leituras).getByRole('group', { name: 'SKC notas' })
    await userEvent.click(within(linha).getByRole('button', { name: 'Escrever nota' }))
    const campo = await within(linha).findByRole('textbox', { name: /^Nota \[1\] · \d\d\/\d\d\/\d{4}$/ })
    expect(campo).toHaveFocus()
    await userEvent.type(campo, 'nota escrita no lugar')
    await userEvent.click(within(linha).getByRole('button', { name: 'Salvar nota' }))
    await waitFor(() => expect(within(linha).queryByRole('textbox')).toBeNull())
    expect(within(linha).getByText('nota escrita no lugar')).toBeInTheDocument()
    const nota = [...(estadoAtual().registros.get('nota')?.values() ?? [])].find((r) => r.campos.texto === 'nota escrita no lugar')!
    expect(nota.campos).toMatchObject({ alvoTipo: 'objeto', alvo: 'CA00002', rascunho: false })
  })

  it('computador: o rótulo da nota abre a edição no lugar; Esc fecha e guarda', async () => {
    instalarMatchMedia(1280)
    await criar('NT-tela0000-12', { texto: 'texto para editar', alvoTipo: 'objeto', alvo: 'CA00003' })
    renderizarRota('/item/CA00003')
    const linha = within(await screen.findByRole('region', { name: 'Leituras' })).getByRole('group', { name: 'SKC notas' })
    await userEvent.click(await within(linha).findByRole('button', { name: /^Editar a nota 1 de/ }))
    const campo = within(linha).getByRole('textbox')
    expect(campo).toHaveValue('texto para editar')
    await userEvent.type(campo, ' e mais')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(within(linha).queryByRole('textbox')).toBeNull())
    expect(await within(linha).findByText('texto para editar e mais')).toBeInTheDocument()
  })

  it('computador: a tecla N abre o editor de nota (fora de campos de texto)', async () => {
    instalarMatchMedia(1280)
    renderizarRota('/item/CA00001')
    const linha = within(await screen.findByRole('region', { name: 'Leituras' })).getByRole('group', { name: 'SKC notas' })
    await screen.findByRole('button', { name: 'Mostrar o original alemão' })
    await apertarQuandoPronto('n', 'item')
    expect(await within(linha).findByRole('textbox')).toHaveFocus()
  })
})

describe('excluir uma nota no lugar (computador)', () => {
  it('a nota some da lista e a seção oferece Desfazer, que a traz de volta', async () => {
    instalarMatchMedia(1280)
    await criar('NT-tela0000-30', { texto: 'Nota para excluir.', alvoTipo: 'verbete', alvo: 'GL-900005' })
    renderizarRota('/verbete/GL-900005')
    const secao = await screen.findByRole('region', { name: 'Notas SKC' })
    await userEvent.click(await within(secao).findByRole('button', { name: /^Editar a nota 1 de/ }))
    await userEvent.click(within(secao).getByRole('button', { name: 'Excluir nota' }))
    const aviso = await within(secao).findByText('Nota excluída.')
    expect(aviso.closest('[role="status"]')).not.toBeNull()
    expect(within(secao).queryByRole('article')).toBeNull()
    expect(within(secao).queryByRole('textbox')).toBeNull()
    expect(estadoAtual().registro('nota', 'NT-tela0000-30')?.excluido).toBe(true)
    await userEvent.click(within(secao).getByRole('button', { name: 'Desfazer' }))
    expect(await within(secao).findByRole('article')).toHaveTextContent('Nota para excluir.')
    expect(within(secao).queryByText('Nota excluída.')).toBeNull()
    expect(estadoAtual().registro('nota', 'NT-tela0000-30')?.excluido).toBe(false)
  })
})

describe('"O texto da fonte mudou" (§7.6)', () => {
  const passagem = 'PA-TESTE-0001-cat-1'
  const original = async () => {
    const { item } = await import('../banco/consultas')
    return (await item('CA00001'))!.leituras.find((l) => l.passagemId === passagem)!.original
  }

  it('a nota guarda o sha do trecho; se o texto de agora é outro, a nota mostra o aviso e "Já conferi" grava o sha novo', async () => {
    const velho = await shaDoTrecho('Um texto de antes, que o livro tinha na edição anterior.')
    await criar('NT-tela0000-20', { texto: 'Nota ancorada no trecho.', alvoTipo: 'objeto', alvo: 'CA00001', ancoras: [{ p: passagem, sha: velho }] })
    renderizarRota('/item/CA00001')
    const nota = await screen.findByText('Nota ancorada no trecho.')
    const artigo = nota.closest('article')!
    const aviso = await within(artigo).findByRole('status')
    expect(aviso).toHaveTextContent('O texto da fonte mudou')
    // a nota continua ligada ao objeto e legível
    expect(artigo).toHaveTextContent('Nota ancorada no trecho.')
    await userEvent.click(within(artigo).getByRole('button', { name: 'Já conferi' }))
    await waitFor(() => expect(within(artigo).queryByRole('status')).toBeNull())
    expect(estadoAtual().registro('nota', 'NT-tela0000-20')?.campos.ancoras).toEqual([{ p: passagem, sha: await shaDoTrecho(await original()) }])
    const eventos = (await todosEventos()).filter((e) => e.reg === 'NT-tela0000-20')
    expect(eventos.at(-1)).toMatchObject({ op: 'alterar', campos: { ancoras: [{ p: passagem }] } })
  })

  it('texto da fonte igual ao guardado: nenhum aviso', async () => {
    await criar('NT-tela0000-21', { texto: 'Nota com o trecho igual.', alvoTipo: 'objeto', alvo: 'CA00001', ancoras: [{ p: passagem, sha: await shaDoTrecho(await original()) }] })
    renderizarRota('/item/CA00001')
    const artigo = (await screen.findByText('Nota com o trecho igual.')).closest('article')!
    await new Promise((r) => setTimeout(r, 50))
    expect(within(artigo).queryByRole('status')).toBeNull()
  })

  it('o trecho que já não está no pacote também avisa', async () => {
    await criar('NT-tela0000-22', { texto: 'Nota de um trecho que saiu.', alvoTipo: 'objeto', alvo: 'CA00001', ancoras: [{ p: 'PA-TESTE-SUMIU', sha: 'c'.repeat(64) }] })
    renderizarRota('/item/CA00001')
    const artigo = (await screen.findByText('Nota de um trecho que saiu.')).closest('article')!
    expect(await within(artigo).findByRole('status')).toHaveTextContent('O trecho da fonte não está mais no pacote')
  })

  it('nota sem âncoras (de outro alvo, ou criada sem WebCrypto) nunca mostra o aviso', async () => {
    await criar('NT-tela0000-23', { texto: 'Sem âncora.', alvoTipo: 'objeto', alvo: 'CA00001' })
    renderizarRota('/item/CA00001')
    const artigo = (await screen.findByText('Sem âncora.')).closest('article')!
    await new Promise((r) => setTimeout(r, 50))
    expect(within(artigo).queryByRole('status')).toBeNull()
  })
})
