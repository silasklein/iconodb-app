/**
 * Parte 2C, bloco 3, Tarefa 12 nas telas (quadro «Verbete seu, completo»): a página do verbete do usuário mostra os campos
 * completos como a do verbete dos livros; «Editar os dados» os abre no lugar e cada mudança se grava na hora; «Outra língua»
 * acrescenta e tira linhas; o hebraico e o árabe com `dir="rtl"` no campo e na página; a busca dobrada do Glossário acha a
 * forma em árabe e em hebraico (foco 5); e o verbete dos livros mostra as outras línguas (`other_forms`). Dados sintéticos.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { estadoAtual, registrar } from '../usuario/estado'
import type { Campos } from '../usuario/eventos'
import { lerVerbeteSkc, type CamposCompletos } from './modelo'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

const COMPLETO = 'GL-cccccccc-1'
const VAZIO = 'GL-cccccccc-2'
const DE_BUSCA = 'GL-cccccccc-3'
const OUTRAS = 'GL-cccccccc-4'

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
  await registrar('verbete', COMPLETO, 'criar', { forma: 'sacerdote de prova', status: 'proposed' })
  const todos: Campos[] = [
    { tipo: 'concept' },
    { genero: 'm' },
    { numero: 'sg' },
    { de: 'Prüfpriester' },
    { en: 'trial priest' },
    { he: 'כֹּהֵן נִסָּיוֹן' },
    { ar: 'كَاهِن تَجْرِبَة' },
    { outras: [{ lingua: 'francês', forma: 'prêtre d’essai' }, { lingua: 'siríaco', forma: '' }] },
    { variantes: ['Pruefpriester', 'Probepriester'] },
    { pai: 'GL-900001' },
    { iconclass: ['11Q7'] },
    { sssl: ['9.9.9'] },
  ]
  for (const campos of todos) await registrar('verbete', COMPLETO, 'alterar', campos)
  await registrar('verbete', VAZIO, 'criar', { forma: 'oferente de teste', status: 'proposed' })
  await registrar('verbete', DE_BUSCA, 'criar', { forma: 'lâmpada de ensaio', status: 'proposed' })
  await registrar('verbete', DE_BUSCA, 'alterar', { tipo: 'technical' })
  await registrar('verbete', DE_BUSCA, 'alterar', { ar: 'مِصْبَاح اِخْتِبَار' })
  await registrar('verbete', DE_BUSCA, 'alterar', { he: 'מְנוֹרַת נִסָּיוֹן' })
  await registrar('verbete', DE_BUSCA, 'alterar', { outras: [{ lingua: 'persa', forma: 'چراغ آزمایشی' }] })
  await registrar('verbete', OUTRAS, 'criar', { forma: 'vaso de ensaio', status: 'proposed' })
})
afterAll(() => usarMotor(null))
afterEach(() => instalarMatchMedia(375))

const campos = (id: string): CamposCompletos => lerVerbeteSkc(estadoAtual().registro('verbete', id)!).campos
const gravado = (id: string) => estadoAtual().registro('verbete', id)!.campos
const dd = (rotulo: string) => screen.getByText(rotulo, { selector: 'dt' }).nextElementSibling as HTMLElement

describe('a página do verbete do usuário mostra os campos como a do verbete dos livros', () => {
  it('o tipo na etiqueta; gênero e número; as línguas (hebraico e árabe com dir="rtl"); as outras línguas inteiras; o pai; Iconclass, SSSL e variantes', async () => {
    renderizarRota(`/verbete/${COMPLETO}`)
    await screen.findByRole('heading', { level: 1, name: 'sacerdote de prova' })
    expect(screen.getByText('Conceito · SKC · a revisar')).toBeInTheDocument()
    expect(dd('Gênero')).toHaveTextContent('masculino')
    expect(dd('Número')).toHaveTextContent('singular')
    const dados = screen.getByRole('region', { name: 'Dados do verbete' })
    expect(within(dados).getByText('Prüfpriester', { selector: 'dd' })).toHaveAttribute('lang', 'de')
    expect(within(dados).getByText('trial priest', { selector: 'dd' })).toHaveAttribute('lang', 'en')
    for (const [texto, lang] of [
      ['כֹּהֵן נִסָּיוֹן', 'he'],
      ['كَاهِن تَجْرِبَة', 'ar'],
    ]) {
      // a direção num <bdi> dentro do dd (fix round 1, N2); a língua no dd
      const el = within(dados).getByText(texto!, { selector: 'bdi' })
      expect(el).toHaveAttribute('dir', 'rtl')
      expect(el.closest('dd')).toHaveAttribute('lang', lang)
    }
    // a linha pela metade (só «siríaco») não aparece
    const outras = dd('Outras línguas')
    expect(within(outras).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['francês prêtre d’essai'])
    expect(within(outras).getByText('prêtre d’essai')).toHaveAttribute('dir', 'auto')
    expect(within(dd('Pai')).getByRole('link', { name: 'leão-de-teste' })).toHaveAttribute('href', '/verbete/GL-900001')
    expect(dd('Iconclass')).toHaveTextContent('11Q7')
    expect(dd('SSSL')).toHaveTextContent('9.9.9')
    expect(dd('Variantes')).toHaveTextContent('Pruefpriester, Probepriester')
    // a ordem é a do verbete dos livros
    expect(within(dados).getAllByRole('term').map((t) => t.textContent)).toEqual(['Alemão', 'Inglês', 'Árabe', 'Hebraico', 'Outras línguas', 'Pai', 'Iconclass', 'SSSL', 'Variantes'])
  })

  it('sem campos completos, nada de «Dados do verbete» (nenhuma linha vazia); «Editar os dados» os abre', async () => {
    renderizarRota(`/verbete/${VAZIO}`)
    await screen.findByRole('heading', { level: 1, name: 'oferente de teste' })
    expect(screen.getByText('Verbete do SKC · a revisar')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Dados do verbete' })).toBeNull()
    expect(screen.queryByText('Gênero')).toBeNull()
    const editar = screen.getByRole('button', { name: 'Editar os dados' })
    expect(editar).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(editar)
    expect(editar).toHaveAttribute('aria-pressed', 'true')
    const form = screen.getByRole('region', { name: 'Dados do verbete' })
    for (const rotulo of ['Gênero', 'Número', 'Alemão', 'Inglês', 'Hebraico', 'Árabe', 'Variantes (uma por linha)', 'Iconclass', 'SSSL']) expect(within(form).getByLabelText(rotulo)).toBeInTheDocument()
    expect(within(form).getByRole('combobox', { name: 'Termo mais geral' })).toBeInTheDocument()
    expect(within(form).getByRole('radiogroup', { name: 'Tipo' })).toBeInTheDocument()
    expect(within(form).getByRole('group', { name: 'Outra língua' })).toBeInTheDocument()
    expect(within(form).getByText(/Cada mudança se grava na hora/)).toBeInTheDocument()
  })
})

describe('«Editar os dados»: cada campo grava na hora e relê', () => {
  it('tipo, gênero, número, as quatro línguas, variantes, Iconclass, SSSL e o termo mais geral', async () => {
    const r = renderizarRota(`/verbete/${VAZIO}`)
    await screen.findByRole('heading', { level: 1, name: 'oferente de teste' })
    await userEvent.click(screen.getByRole('button', { name: 'Editar os dados' }))
    const form = screen.getByRole('region', { name: 'Dados do verbete' })

    await userEvent.click(within(form).getByRole('radio', { name: 'Termo técnico' }))
    await waitFor(() => expect(campos(VAZIO).tipo).toBe('technical'))
    expect(screen.getByText('Técnico · SKC · a revisar')).toBeInTheDocument()
    expect(within(form).getByRole('radio', { name: 'Termo técnico' })).toHaveAttribute('aria-checked', 'true')

    await userEvent.selectOptions(within(form).getByLabelText('Gênero'), 'feminino')
    await waitFor(() => expect(campos(VAZIO).genero).toBe('f'))
    await userEvent.selectOptions(within(form).getByLabelText('Número'), 'plural')
    await waitFor(() => expect(campos(VAZIO).numero).toBe('pl'))

    // hebraico e árabe: o campo é da direita para a esquerda
    expect(within(form).getByLabelText('Hebraico')).toHaveAttribute('dir', 'rtl')
    expect(within(form).getByLabelText('Árabe')).toHaveAttribute('dir', 'rtl')
    expect(within(form).getByLabelText('Hebraico')).toHaveAttribute('lang', 'he')
    expect(within(form).getByLabelText('Alemão')).not.toHaveAttribute('dir')
    for (const [rotulo, campo, texto] of [
      ['Alemão', 'de', '  Opfer   Probe '],
      ['Inglês', 'en', 'offering trial'],
      ['Hebraico', 'he', 'מַקְרִיב'],
      ['Árabe', 'ar', 'مُقَدِّم'],
    ] as const) {
      await userEvent.type(within(form).getByLabelText(rotulo), texto)
      await userEvent.tab()
      await waitFor(() => expect(campos(VAZIO)[campo]).toBe(texto.trim().replace(/\s+/g, ' ')))
      // um campo por evento, com o nome do pipeline
      expect(gravado(VAZIO)[campo]).toBe(texto.trim().replace(/\s+/g, ' '))
    }

    await userEvent.type(within(form).getByLabelText('Variantes (uma por linha)'), 'Opferprobe{Enter}{Enter}Opferprobe{Enter}Probeopfer')
    await userEvent.tab()
    await waitFor(() => expect(gravado(VAZIO).variantes).toEqual(['Opferprobe', 'Probeopfer']))
    await userEvent.type(within(form).getByLabelText('Iconclass'), '11Q7{Enter}25F23(+1)')
    await userEvent.tab()
    await waitFor(() => expect(gravado(VAZIO).iconclass).toEqual(['11Q7', '25F23(+1)']))
    await userEvent.type(within(form).getByLabelText('SSSL'), '1.2.3')
    await userEvent.tab()
    await waitFor(() => expect(gravado(VAZIO).sssl).toEqual(['1.2.3']))

    // o termo mais geral: escolhido da lista (do livro ou do usuário); apagar e sair o tira
    const pai = within(form).getByRole('combobox', { name: 'Termo mais geral' })
    await userEvent.type(pai, 'sacerdote')
    await userEvent.click(await within(form).findByRole('option', { name: /sacerdote de prova/ }))
    await waitFor(() => expect(gravado(VAZIO).pai).toBe(COMPLETO))
    expect(pai).toHaveValue('sacerdote de prova')
    await userEvent.clear(pai)
    await userEvent.type(pai, 'leão')
    await userEvent.click(await within(form).findByRole('option', { name: /^leão-de-teste/ }))
    await waitFor(() => expect(gravado(VAZIO).pai).toBe('GL-900001'))
    // um texto que não é escolhido não vale
    await userEvent.clear(pai)
    await userEvent.type(pai, 'xyz')
    expect(within(form).getByText('Escolha um verbete da lista; o termo mais geral continua «leão-de-teste».')).toBeInTheDocument()
    await userEvent.tab()
    expect(gravado(VAZIO).pai).toBe('GL-900001')
    // o próprio verbete não é opção
    await userEvent.clear(pai)
    await userEvent.type(pai, 'oferente')
    expect(within(form).queryByRole('option', { name: /oferente de teste/ })).toBeNull()
    await userEvent.clear(pai)
    await userEvent.tab()
    await waitFor(() => expect(gravado(VAZIO).pai).toBeNull())

    // relê: fechar a edição mostra a leitura; reabrir a página, os campos com o que foi gravado
    await userEvent.click(screen.getByRole('button', { name: 'Editar os dados' }))
    const dados = screen.getByRole('region', { name: 'Dados do verbete' })
    expect(within(dados).getByText('Opfer Probe', { selector: 'dd' })).toBeInTheDocument()
    expect(within(dados).getByText('מַקְרִיב', { selector: 'bdi' })).toHaveAttribute('dir', 'rtl')
    expect(within(dados).getByText('مُقَدِّم', { selector: 'bdi' })).toHaveAttribute('dir', 'rtl')
    expect(dd('Gênero')).toHaveTextContent('feminino')
    expect(dd('Número')).toHaveTextContent('plural')
    r.unmount()
    renderizarRota(`/verbete/${VAZIO}`)
    await screen.findByRole('heading', { level: 1, name: 'oferente de teste' })
    await userEvent.click(screen.getByRole('button', { name: 'Editar os dados' }))
    const de_novo = screen.getByRole('region', { name: 'Dados do verbete' })
    expect(within(de_novo).getByLabelText('Alemão')).toHaveValue('Opfer Probe')
    expect(within(de_novo).getByLabelText('Árabe')).toHaveValue('مُقَدِّم')
    expect(within(de_novo).getByLabelText('Gênero')).toHaveValue('f')
    expect(within(de_novo).getByLabelText('Variantes (uma por linha)')).toHaveValue('Opferprobe\nProbeopfer')
    expect(within(de_novo).getByLabelText('Iconclass')).toHaveValue('11Q7\n25F23(+1)')
    expect(within(de_novo).getByRole('radio', { name: 'Termo técnico' })).toHaveAttribute('aria-checked', 'true')

    // apagar um texto limpa o campo (null)
    await userEvent.clear(within(de_novo).getByLabelText('Inglês'))
    await userEvent.tab()
    await waitFor(() => expect(gravado(VAZIO).en).toBeNull())
    await userEvent.selectOptions(within(de_novo).getByLabelText('Número'), '—')
    await waitFor(() => expect(gravado(VAZIO).numero).toBeNull())
  })
})

describe('«Outra língua» acrescenta e tira linhas', () => {
  it('«+ Outra língua» abre uma linha; escrita, grava ao sair do grupo; o × a tira; uma linha vazia não é gravada', async () => {
    renderizarRota(`/verbete/${OUTRAS}`)
    await screen.findByRole('heading', { level: 1, name: 'vaso de ensaio' })
    await userEvent.click(screen.getByRole('button', { name: 'Editar os dados' }))
    const grupo = screen.getByRole('group', { name: 'Outra língua' })
    const mais = within(grupo).getByRole('button', { name: 'Outra língua' })

    await userEvent.click(mais)
    await waitFor(() => expect(within(grupo).getByRole('textbox', { name: 'Outra língua 1: a língua' })).toHaveFocus())
    await userEvent.keyboard('francês')
    await userEvent.type(within(grupo).getByRole('textbox', { name: 'Outra língua 1: a forma' }), 'vase d’essai')
    await userEvent.click(mais)
    await userEvent.type(within(grupo).getByRole('textbox', { name: 'Outra língua 2: a língua' }), 'grego')
    await userEvent.type(within(grupo).getByRole('textbox', { name: 'Outra língua 2: a forma' }), 'ἀγγεῖον')
    expect(within(grupo).getByRole('textbox', { name: 'Outra língua 2: a forma' })).toHaveAttribute('dir', 'auto')
    // sair do grupo grava a lista inteira
    await userEvent.click(screen.getByRole('heading', { level: 1 }))
    await waitFor(() =>
      expect(gravado(OUTRAS).outras).toEqual([
        { lingua: 'francês', forma: 'vase d’essai' },
        { lingua: 'grego', forma: 'ἀγγεῖον' },
      ]),
    )

    // o × tira a linha e grava na hora
    await userEvent.click(within(grupo).getByRole('button', { name: 'Tirar a linha francês' }))
    await waitFor(() => expect(gravado(OUTRAS).outras).toEqual([{ lingua: 'grego', forma: 'ἀγγεῖον' }]))
    expect(within(grupo).queryByRole('textbox', { name: 'Outra língua 2: a língua' })).toBeNull()
    expect(within(grupo).getByRole('textbox', { name: 'Outra língua 1: a língua' })).toHaveValue('grego')
    expect(mais).toHaveFocus()

    // uma linha acrescentada e deixada vazia some ao sair, sem gravar nada
    const antes = estadoAtual().registro('verbete', OUTRAS)!.alteradoEm
    await userEvent.click(mais)
    await userEvent.click(screen.getByRole('heading', { level: 1 }))
    await waitFor(() => expect(within(grupo).queryByRole('textbox', { name: 'Outra língua 2: a língua' })).toBeNull())
    expect(estadoAtual().registro('verbete', OUTRAS)!.alteradoEm).toBe(antes)

    // uma linha pela metade é gravada (nada se perde), mas a leitura só mostra as inteiras
    await userEvent.click(mais)
    await userEvent.type(within(grupo).getByRole('textbox', { name: 'Outra língua 2: a língua' }), 'latim')
    await userEvent.click(screen.getByRole('heading', { level: 1 }))
    await waitFor(() => expect(gravado(OUTRAS).outras).toEqual([{ lingua: 'grego', forma: 'ἀγγεῖον' }, { lingua: 'latim', forma: '' }]))
    await userEvent.click(screen.getByRole('button', { name: 'Editar os dados' }))
    expect(within(dd('Outras línguas')).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['grego ἀγγεῖον'])

    // tirar todas grava null
    await userEvent.click(screen.getByRole('button', { name: 'Editar os dados' }))
    const g2 = screen.getByRole('group', { name: 'Outra língua' })
    await userEvent.click(within(g2).getByRole('button', { name: 'Tirar a linha latim' }))
    await userEvent.click(within(g2).getByRole('button', { name: 'Tirar a linha grego' }))
    await waitFor(() => expect(gravado(OUTRAS).outras).toBeNull())
  })
})

describe('a busca dobrada do Glossário acha as formas do verbete do usuário (foco 5)', () => {
  const linhas = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('a.lista-linha')).map((a) => a.getAttribute('href')?.split('?')[0])

  it.each([
    ['o árabe sem os sinais vocálicos', 'اختبار'],
    ['o árabe como foi escrito', 'مِصْبَاح'],
    ['o hebraico sem os pontos', 'מנורת נסיון'],
    ['a forma em outra língua', 'آزمایشی'],
  ])('%s', async (_, consulta) => {
    renderizarRota('/glossario')
    await waitFor(() => expect(linhas()).toContain(`/verbete/${DE_BUSCA}`))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar no glossário' }), consulta)
    await waitFor(() => expect(linhas()).toEqual([`/verbete/${DE_BUSCA}`]))
  })

  it('as outras línguas e as variantes também; o tipo dado põe o verbete na aba dele', async () => {
    const r = renderizarRota('/glossario')
    await waitFor(() => expect(linhas()).toContain(`/verbete/${COMPLETO}`))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar no glossário' }), 'pretre dessai')
    await waitFor(() => expect(linhas()).toEqual([`/verbete/${COMPLETO}`]))
    r.unmount()
    renderizarRota('/glossario?tipo=tecnicos')
    await waitFor(() => expect(linhas()).toContain(`/verbete/${DE_BUSCA}`))
    expect(linhas()).not.toContain(`/verbete/${COMPLETO}`)
  })
})

describe('o verbete dos livros mostra as outras línguas (other_forms)', () => {
  it('cada língua com a forma, na ordem do pacote', async () => {
    renderizarRota('/verbete/GL-900010')
    await screen.findByRole('heading', { level: 1, name: 'amuleto de prova' })
    const outras = dd('Outras línguas')
    expect(within(outras).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['grego φυλακτήριον δοκιμῆς', 'latim amuletum probationis'])
  })

  it('sem outras línguas, nenhuma linha', async () => {
    renderizarRota('/verbete/GL-900001')
    await screen.findByRole('heading', { level: 1, name: 'leão-de-teste' })
    expect(screen.queryByText('Outras línguas')).toBeNull()
  })
})

describe('no computador', () => {
  it('a edição fica no painel e não passa para outro verbete', async () => {
    instalarMatchMedia(1280)
    renderizarRota(`/verbete/${COMPLETO}`)
    await screen.findByRole('heading', { level: 2, name: 'sacerdote de prova' })
    await userEvent.click(screen.getByRole('button', { name: 'Editar os dados' }))
    expect(screen.getByLabelText('Alemão')).toHaveValue('Prüfpriester')
    await userEvent.click(document.querySelector<HTMLAnchorElement>(`a.lista-linha[href^="/verbete/${OUTRAS}"]`)!)
    await screen.findByRole('heading', { level: 2, name: 'vaso de ensaio' })
    expect(screen.getByRole('button', { name: 'Editar os dados' })).toHaveAttribute('aria-pressed', 'false')
  })
})
