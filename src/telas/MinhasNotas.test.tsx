import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { A, ev, T0 } from '../../tests/suporte/eventosDeTeste'
import { usarMotor } from '../banco/cliente'
import { esquecerAlvos } from '../notas/alvos'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { estadoAtual, receberEventos, registrar } from '../usuario/estado'
import { esquecerPendentes } from '../usuario/pendentes'

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

const DIA = 24 * 60 * 60 * 1000
const dia = (ms: number) => {
  const d = new Date(ms)
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`
}
let seq = 0
const criar = (reg: string, ms: number, campos: Record<string, unknown>) =>
  receberEventos([ev({ ap: A, seq: ++seq, ms, tipo: 'nota', reg, op: 'criar', campos: { rascunho: false, ...campos } as never })])
const endereco = () => screen.getByTestId('endereco').textContent

describe('Minhas notas sem nenhuma nota', () => {
  it('diz que não há notas e como escrever a primeira; o Voltar leva ao início', async () => {
    renderizarRota('/notas')
    expect(screen.getByRole('heading', { level: 1, name: 'Minhas notas' })).toBeInTheDocument()
    expect(await screen.findByText('Nenhuma nota ainda.')).toBeInTheDocument()
    expect(screen.getByText(/Abra um objeto, um verbete, uma obra, um sítio ou um grupo e toque em «Escrever nota»/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '#/')
  })
})

describe('Minhas notas sem nenhuma nota, no computador (E-18)', () => {
  beforeEach(() => instalarMatchMedia(1280))

  it('a explicação fica à esquerda e o painel da direita fica em branco, sem «Escolha uma nota na lista.»', async () => {
    renderizarRota('/notas')
    expect(await screen.findByText('Nenhuma nota ainda.')).toBeInTheDocument()
    expect(screen.queryByText('Escolha uma nota na lista.')).not.toBeInTheDocument()
    expect(document.querySelector('.lista-principal')!.textContent).toBe('')
  })
})

describe('Minhas notas no celular: por data, a mais recente primeiro', () => {
  beforeAll(async () => {
    await criar('NT-aaaaaaaa-101', T0, { texto: 'O leão de Maḥteṣ, ver [[GL-900001|leão-de-teste]]', alvoTipo: 'objeto', alvo: 'CA00001' })
    await criar('NT-aaaaaaaa-102', T0 + 1000, { texto: 'Comparar com [[BIB-900001|Autora 2004]]', alvoTipo: 'verbete', alvo: 'GL-900002' })
    await criar('NT-aaaaaaaa-103', T0 + DIA + 5000, { texto: 'Nota sobre o sítio', alvoTipo: 'sitio', alvo: 'TESTE-2' })
    await criar('NT-aaaaaaaa-104', T0 + 2 * DIA, { texto: 'Rascunho ainda não salvo', alvoTipo: 'obra', alvo: 'BIB-900002', rascunho: true })
    await criar('NT-aaaaaaaa-105', T0 + 3 * DIA, { texto: 'Esta foi excluída', alvoTipo: 'grupo', alvo: 'GR-TESTE-I-01' })
    await receberEventos([ev({ ap: A, seq: ++seq, ms: T0 + 3 * DIA + 1, tipo: 'nota', reg: 'NT-aaaaaaaa-105', op: 'excluir' })])
  })

  it('uma seção por dia (data e contagem), da mais nova à mais antiga; as excluídas não aparecem', async () => {
    renderizarRota('/notas')
    await screen.findByText('Nota sobre o sítio')
    const datas = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(datas).toEqual([dia(T0 + 2 * DIA), dia(T0 + DIA), dia(T0)])
    const doPrimeiro = screen.getByRole('region', { name: `Notas de ${dia(T0)}` })
    expect(within(doPrimeiro).getByText('2')).toBeInTheDocument()
    expect(within(doPrimeiro).getByText('notas')).toHaveClass('so-leitor')
    expect(within(doPrimeiro).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/nota/NT-aaaaaaaa-102', '/nota/NT-aaaaaaaa-101'])
    expect(screen.queryByText('Esta foi excluída')).toBeNull()
    expect(screen.getByText('SKC · por data, a mais recente primeiro')).toBeInTheDocument()
  })

  it('cada nota: [n], a que alvo pertence, o texto com os links só como texto, e a que se liga', async () => {
    renderizarRota('/notas')
    const nota = (await screen.findByText(/O leão de Maḥteṣ/)).closest('a')!
    expect(nota).toHaveAttribute('href', '/nota/NT-aaaaaaaa-101')
    // nenhum link dentro do link da nota; o rótulo do [[…]] aparece, a marcação não
    expect(nota.querySelector('a')).toBeNull()
    expect(nota).toHaveTextContent('O leão de Maḥteṣ, ver leão-de-teste')
    expect(nota).toHaveTextContent('Ligada a leão-de-teste')
    expect(nota.textContent).not.toMatch(/\[\[|GL-900001/)
    await waitFor(() => expect(nota).toHaveTextContent(/\[1\] · \d\d\/\d\d\/\d{4} · em CA00001 · .+/))
    const rascunho = screen.getByText('Rascunho ainda não salvo').closest('a')!
    expect(rascunho).toHaveTextContent(/rascunho/)
  })

  it('a busca filtra pelo texto dobrado e fica no endereço; sem resultado, diz e oferece limpar', async () => {
    renderizarRota('/notas')
    await screen.findByText(/O leão de Maḥteṣ/)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar nas notas' }), 'LEAO mahtes')
    await waitFor(() => expect(screen.queryByText('Nota sobre o sítio')).toBeNull())
    expect(screen.getByText(/O leão de Maḥteṣ/)).toBeInTheDocument()
    expect(endereco()).toMatch(/^\/notas\?filtro=LEAO(\+|%20)mahtes$/)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar nas notas' }), ' zebra')
    expect(await screen.findByText('Nenhuma nota encontrada.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpar a busca e o filtro' }))
    expect(await screen.findByText('Nota sobre o sítio')).toBeInTheDocument()
    expect(endereco()).toBe('/notas')
  })

  it('"Ligada a" filtra pelo alvo ou pelo que a nota cita, e fica no endereço', async () => {
    renderizarRota('/notas')
    await screen.findByText(/O leão de Maḥteṣ/)
    const seletor = screen.getByRole('combobox', { name: 'Ligada a' })
    expect(within(seletor).getAllByRole('option').map((o) => o.textContent)).toEqual(['qualquer coisa', 'um objeto', 'um verbete', 'uma hipótese', 'uma obra', 'um sítio', 'um grupo', 'uma coleção'])
    await userEvent.selectOptions(seletor, 'obra')
    await waitFor(() => expect(screen.queryByText('Nota sobre o sítio')).toBeNull())
    // a nota do verbete cita uma obra; o rascunho é da própria obra
    expect(screen.getByText(/Comparar com Autora 2004/)).toBeInTheDocument()
    expect(screen.getByText('Rascunho ainda não salvo')).toBeInTheDocument()
    expect(screen.queryByText(/O leão de Maḥteṣ/)).toBeNull()
    expect(endereco()).toBe('/notas?ligada=obra')
  })

  it('o endereço com ?filtro e ?ligada abre já filtrado', async () => {
    renderizarRota('/notas?filtro=sitio&ligada=sitio')
    expect(await screen.findByText('Nota sobre o sítio')).toBeInTheDocument()
    expect(screen.queryByText(/O leão/)).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Ligada a' })).toHaveValue('sitio')
    expect(screen.getByRole('searchbox', { name: 'Buscar nas notas' })).toHaveValue('sitio')
  })

  it('uma nota nova aparece na lista na hora', async () => {
    renderizarRota('/notas')
    await screen.findByText(/O leão de Maḥteṣ/)
    await act(async () => {
      await registrar('nota', 'NT-aaaaaaaa-110', 'criar', { texto: 'Nota recém-escrita', alvoTipo: 'verbete', alvo: 'GL-900003', rascunho: false })
    })
    expect(await screen.findByText('Nota recém-escrita')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 })[0]).toHaveTextContent(dia(Date.now()))
  })
})

describe('Minhas notas no computador: a lista e a nota lado a lado', () => {
  beforeEach(() => instalarMatchMedia(1280))

  it('sem nota escolhida, o painel pede para escolher; escolher abre o editor com o texto e o rótulo', async () => {
    renderizarRota('/notas')
    expect(await screen.findByText('Escolha uma nota na lista.')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('link', { name: /Nota sobre o sítio/ }))
    expect(endereco()).toBe('/nota/NT-aaaaaaaa-103')
    // uma nota que já existe abre para ler (o texto como no quadro); «Editar» passa ao campo
    const leitura = await screen.findByRole('group', { name: /^Nota \[1\] · \d\d\/\d\d\/\d{4}$/ })
    expect(leitura).toHaveTextContent('Nota sobre o sítio')
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(await screen.findByRole('textbox', { name: /^Nota \[1\] · \d\d\/\d\d\/\d{4}$/ })).toHaveValue('Nota sobre o sítio')
    // a lista continua ali, com a nota escolhida marcada
    expect(screen.getByRole('link', { name: /Nota sobre o sítio/ })).toHaveAttribute('aria-current', 'page')
  })

  it('a barra da nota tem Inserir link, Excluir nota e Salvar nota; sair do campo grava e a lista mostra o texto novo', async () => {
    renderizarRota('/nota/NT-aaaaaaaa-103')
    const barra = await screen.findByRole('toolbar', { name: 'Ações da nota' })
    // lendo: Editar; no campo: Inserir link no lugar dele
    expect(within(barra).getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(within(barra).queryByRole('button', { name: 'Inserir link para objeto, verbete ou obra' })).toBeNull()
    await userEvent.click(within(barra).getByRole('button', { name: 'Editar' }))
    expect(await within(barra).findByRole('button', { name: 'Inserir link para objeto, verbete ou obra' })).toBeInTheDocument()
    expect(within(barra).getByRole('button', { name: 'Excluir nota' })).toBeInTheDocument()
    expect(within(barra).getByRole('button', { name: 'Salvar nota' })).toBeInTheDocument()
    const campo = await screen.findByRole('textbox', { name: /^Nota \[1\]/ })
    await userEvent.type(campo, ' e mais um pouco')
    await userEvent.tab()
    await waitFor(() => expect(screen.getByRole('link', { name: /Nota sobre o sítio e mais um pouco/ })).toBeInTheDocument())
  })

  it('"Ligada a" e "Aparece em" dizem para onde a nota leva e onde ela aparece', async () => {
    renderizarRota('/nota/NT-aaaaaaaa-102')
    const painel = await screen.findByRole('region', { name: 'Ligações da nota' })
    expect(within(painel).getByText('Ligada a')).toBeInTheDocument()
    const obras = await within(painel).findAllByRole('link', { name: 'Autora 2004' })
    expect(obras.map((a) => a.getAttribute('href'))).toEqual(['/obra/BIB-900001', '/obra/BIB-900001'])
    expect(within(painel).getByText('Aparece em')).toBeInTheDocument()
    expect(within(painel).getAllByRole('link').map((a) => a.getAttribute('href'))).toContain('/verbete/GL-900002')
  })
})

describe('a tela da nota no celular', () => {
  it('rótulo visível, o lugar da nota, o campo grande com o texto, e as ações no topo', async () => {
    renderizarRota('/nota/NT-aaaaaaaa-101')
    // lê limpo: o rótulo do link, sem o código; Editar mostra o código
    const leitura = await screen.findByRole('group', { name: /^Nota \[1\] · \d\d\/\d\d\/\d{4}$/ })
    expect(leitura).toHaveTextContent('O leão de Maḥteṣ, ver leão-de-teste')
    expect(leitura.textContent).not.toContain('[[')
    expect((await screen.findAllByRole('link', { name: /^CA00001/ }))[0]).toHaveAttribute('href', '/item/CA00001')
    const topo = screen.getByRole('toolbar', { name: 'Ações da nota' })
    await userEvent.click(within(topo).getByRole('button', { name: 'Editar' }))
    const campo = await screen.findByRole('textbox', { name: /^Nota \[1\] · \d\d\/\d\d\/\d{4}$/ })
    expect(campo).toHaveValue('O leão de Maḥteṣ, ver [[GL-900001|leão-de-teste]]')
    expect(within(topo).getByRole('button', { name: 'Inserir link para objeto, verbete ou obra' })).toBeInTheDocument()
    expect(within(topo).getByRole('button', { name: 'Salvar nota' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Fechar e voltar' })).toBeInTheDocument()
  })

  it('"Fechar e voltar" (e Esc) guardam o rascunho e levam ao lugar da nota quando não há histórico', async () => {
    renderizarRota('/nota/NT-aaaaaaaa-102')
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    const campo = await screen.findByRole('textbox', { name: /^Nota \[1\]/ })
    await userEvent.type(campo, '!')
    await userEvent.click(screen.getByRole('link', { name: 'Fechar e voltar' }))
    expect(endereco()).toBe('/verbete/GL-900002')
    await waitFor(() => expect(estadoAtual().registro('nota', 'NT-aaaaaaaa-102')?.campos.texto).toMatch(/Autora 2004\]\]!$/))
  })

  it('Salvar nota tira a marca de rascunho e volta', async () => {
    renderizarRota('/nota/NT-aaaaaaaa-104')
    await screen.findByRole('group', { name: /rascunho$/ })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nota' }))
    await waitFor(() => expect(estadoAtual().registro('nota', 'NT-aaaaaaaa-104')?.campos.rascunho).toBe(false))
    await waitFor(() => expect(endereco()).toBe('/obra/BIB-900002'))
  })

  it('uma nota que não existe: aviso e o caminho para Minhas notas', async () => {
    renderizarRota('/nota/NT-aaaaaaaa-999')
    expect(await screen.findByText('Nota não encontrada.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver minhas notas' })).toHaveAttribute('href', '/notas')
  })

  it('excluir mostra a nota excluída, com Restaurar que a traz de volta', async () => {
    renderizarRota('/nota/NT-aaaaaaaa-103')
    await screen.findByRole('group', { name: /^Nota \[1\]/ })
    await userEvent.click(screen.getByRole('button', { name: 'Excluir nota' }))
    expect(await screen.findByText('Nota excluída.')).toBeInTheDocument()
    expect(estadoAtual().registro('nota', 'NT-aaaaaaaa-103')?.excluido).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar nota' }))
    expect(await screen.findByRole('group', { name: /^Nota \[1\]/ })).toHaveTextContent(/^Nota sobre o sítio/)
    expect(estadoAtual().registro('nota', 'NT-aaaaaaaa-103')?.excluido).toBe(false)
  })
})

describe('uma nota nova (/nota/nova): o celular escreve na tela da nota', () => {
  it('o primeiro texto cria a nota; o endereço passa a ser o da nota sem recriar o campo', async () => {
    renderizarRota('/nota/nova?alvoTipo=objeto&alvo=CA00003')
    const campo = await screen.findByRole('textbox', { name: /^Nota \[\d+\] · \d\d\/\d\d\/\d{4}$/ })
    expect(campo).toHaveFocus()
    await userEvent.type(campo, 'a ideia nova')
    // (sem sair do campo: sair dele volta à leitura, que troca o campo de propósito)
    await waitFor(() => expect(endereco()).toMatch(/^\/nota\/NT-/), { timeout: 4000 })
    // o mesmo campo, com o texto e sem perder o que se digitou
    expect(screen.getByRole('textbox', { name: /^Nota \[/ })).toBe(campo)
    expect(campo).toHaveValue('a ideia nova')
    const achar = () => [...(estadoAtual().registros.get('nota')?.values() ?? [])].find((r) => r.campos.texto === 'a ideia nova')
    await waitFor(() => expect(achar()).toBeDefined())
    expect(achar()!.campos).toMatchObject({ alvoTipo: 'objeto', alvo: 'CA00003', rascunho: true })
    expect(endereco()).toBe(`/nota/${achar()!.id}`)
  })

  it('uma nota nova num objeto guarda o sha do texto da fonte que o descreve (spec §7.6), também pela tela da nota', async () => {
    renderizarRota('/nota/nova?alvoTipo=objeto&alvo=CA00001')
    const campo = await screen.findByRole('textbox', { name: /^Nota \[\d+\]/ })
    await userEvent.type(campo, 'nota com âncora vinda da tela da nota')
    await userEvent.tab()
    const achar = () => [...(estadoAtual().registros.get('nota')?.values() ?? [])].find((r) => r.campos.texto === 'nota com âncora vinda da tela da nota')
    await waitFor(() => expect(achar()).toBeDefined())
    const ancoras = achar()!.campos.ancoras as { p: string; sha: string }[]
    expect(ancoras.map((a) => a.p)).toContain('PA-TESTE-0001-cat-1')
    expect(ancoras.every((a) => /^[0-9a-f]{64}$/.test(a.sha))).toBe(true)
  })

  it('numa nota nova em outro tipo de alvo (um verbete) não há âncora: nada a conferir na fonte', async () => {
    renderizarRota('/nota/nova?alvoTipo=verbete&alvo=GL-900004')
    const campo = await screen.findByRole('textbox', { name: /^Nota \[\d+\]/ })
    await userEvent.type(campo, 'nota de verbete sem âncora')
    await userEvent.tab()
    const achar = () => [...(estadoAtual().registros.get('nota')?.values() ?? [])].find((r) => r.campos.texto === 'nota de verbete sem âncora')
    await waitFor(() => expect(achar()).toBeDefined())
    expect(achar()!.campos.ancoras).toBeUndefined()
  })

  it('sem lugar (alvo ausente ou desconhecido), não há onde escrever', async () => {
    renderizarRota('/nota/nova?alvoTipo=planeta&alvo=X')
    expect(await screen.findByText('Esta nota não tem um lugar.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
