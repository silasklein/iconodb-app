/**
 * Tarefa 10 nas telas, sobre o pacote sintético: selecionar um trecho de uma leitura (livro e SKC) e registrar uma
 * hipótese SKC (NovaHipotese.dc.html, PC-ItemNovaHipotese.dc.html), a hipótese SKC em "Hipóteses por nível" e no
 * painel, a região acesa, a posição sobre uma hipótese do livro, e o "Registrar hipótese" do objeto SKC (Tarefa 9).
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { numerosDosObjetos } from '../banco/consultas'
import { definirFonteDosNumerosDoPacote, recarregarNumerosDoPacote } from '../objetos-skc/pacote'
import { shaDoTrecho } from '../notas/ancora'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { quantosAtalhos } from '../app/atalhos'
import { apertarQuandoPronto } from '../test/teclas'
import { teclasNaoDeclaradas } from '../test/atalhosDeclarados'
import { Item } from '../telas/Item'
import { Imagem } from '../telas/Imagem'
import { todosEventos } from '../usuario/armazem'
import { estadoAtual, registrar } from '../usuario/estado'
import { lerHipotese, lerPosicao } from './modelo'
import { chaveDoRascunho } from './rascunho'

vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
vi.mock('../pacote/imagens', async (original) => ({ ...(await original<typeof import('../pacote/imagens')>()), urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

function Local() {
  const { pathname, search } = useLocation()
  return <output data-testid="local">{`${pathname}${search}`}</output>
}
function abrir(caminho: string, state?: unknown) {
  const [pathname, busca] = caminho.split('?')
  return render(
    <MemoryRouter initialEntries={[{ pathname: pathname!, search: busca ? `?${busca}` : '', state }]}>
      <Routes>
        <Route path="/item/:numero" element={<Item />} />
        <Route path="/imagem/:id" element={<Imagem />} />
      </Routes>
      <Local />
    </MemoryRouter>,
  )
}
const local = () => screen.getByTestId('local').textContent

/** Seleciona `trecho` dentro do bloco de leitura (o primeiro texto que o contém) e avisa a mudança da seleção. */
function selecionar(bloco: Element, trecho: string) {
  const caminhante = document.createTreeWalker(bloco, NodeFilter.SHOW_TEXT)
  for (let t = caminhante.nextNode() as Text | null; t; t = caminhante.nextNode() as Text | null) {
    const i = t.data.indexOf(trecho)
    if (i < 0) continue
    const r = document.createRange()
    r.setStart(t, i)
    r.setEnd(t, i + trecho.length)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(r)
    act(() => {
      document.dispatchEvent(new Event('selectionchange'))
    })
    return
  }
  throw new Error(`trecho não achado: ${trecho}`)
}

const blocoDaLeitura = async (fonte: string) => {
  await screen.findByRole('heading', { level: 1 })
  return waitFor(() => {
    const b = document.querySelector(`[data-trecho-fonte="${fonte}"]`)
    if (!b) throw new Error('sem bloco')
    return b
  })
}

async function escolherTermo(texto: string, opcao: RegExp) {
  const campo = screen.getByRole('combobox', { name: 'Termo' })
  await userEvent.type(campo, texto)
  const lista = await screen.findByRole('listbox', { name: 'Termo' })
  await userEvent.click(await within(lista).findByRole('option', { name: opcao }))
}

const hipotesesSkc = () => [...(estadoAtual().registros.get('hipotese')?.values() ?? [])].filter((r) => !r.excluido).map(lerHipotese)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  Element.prototype.scrollIntoView = vi.fn()
})
afterAll(() => usarMotor(null))
beforeEach(async () => {
  instalarMatchMedia(375)
  localStorage.clear()
  window.getSelection()?.removeAllRanges()
  definirFonteDosNumerosDoPacote(numerosDosObjetos)
  await recarregarNumerosDoPacote()
  // O IndexedDB é um só no arquivo: cada teste começa sem hipóteses, regiões nem posições vivas.
  for (const tipo of ['hipotese', 'regiao', 'posicao', 'objeto'] as const) {
    for (const r of estadoAtual().registros.get(tipo)?.values() ?? []) if (!r.excluido) await registrar(tipo, r.id, 'excluir')
  }
  for (const r of estadoAtual().registros.get('ligacao')?.values() ?? []) if (r.campos.ativa === true) await registrar('ligacao', r.id, 'alterar', { ativa: false })
})
afterEach(() => definirFonteDosNumerosDoPacote(null))

describe('selecionar um trecho e registrar uma hipótese SKC', () => {
  it('a seleção na leitura mostra "Registrar hipótese" (Shift+H); o formulário guarda a âncora em code points com o sha', async () => {
    abrir('/item/CA00002')
    const bloco = await blocoDaLeitura('PA-TESTE-0002-cat-1')
    expect(bloco).toHaveAttribute('data-trecho-lingua', 'pt')
    expect(screen.queryByRole('button', { name: 'Registrar hipótese' })).toBeNull()
    selecionar(bloco, 'estrela de prova')
    const botao = await screen.findByRole('button', { name: 'Registrar hipótese' })
    expect(botao).toHaveAttribute('aria-keyshortcuts', 'Shift+H')
    await userEvent.click(botao)

    const form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    expect(within(form).getByRole('heading', { name: 'Nova hipótese · SKC' })).toBeInTheDocument()
    expect(within(form).getByText('estrela de prova')).toBeInTheDocument()
    expect(within(form).getByText(/TESTE I: 2, selecionado no texto/)).toBeInTheDocument()
    // Sobre: o objeto inteiro (escolhido) e o botão da região nova.
    expect(within(form).getByRole('button', { name: 'objeto inteiro' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(form).getByRole('button', { name: /Marcar uma região nova na imagem/ })).toBeInTheDocument()
    // Nível e Certeza: iconográfico e provável já escolhidos (como no board).
    expect(within(form).getByRole('radio', { name: 'iconográfico' })).toHaveAttribute('aria-checked', 'true')
    expect(within(form).getByRole('radio', { name: 'provável' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(within(form).getByRole('radio', { name: 'iconológico' }))
    await userEvent.click(within(form).getByRole('radio', { name: 'possível' }))
    await escolherTermo('leão', /^leão-de-teste/)
    expect(within(form).getByRole('button', { name: 'Tirar o termo leão-de-teste' })).toBeInTheDocument()
    await userEvent.type(within(form).getByRole('textbox', { name: 'Justificativa' }), 'como o de CA00001')
    expect(teclasNaoDeclaradas(document.body)).toEqual([])
    await userEvent.click(within(form).getByRole('button', { name: 'Registrar hipótese' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull())
    const [h] = hipotesesSkc()
    const texto = 'No verso está o sinal 𓀀 ao lado de um leão-de-teste de cauda erguida; talvez uma estrela de prova.'
    const inicio = [...texto].join('').indexOf('estrela') - 1 // o 𓀀 é 1 code point e 2 unidades UTF-16
    expect(h).toMatchObject({
      objeto: 'CA00002',
      sobre: { tipo: 'objeto' },
      termos: [{ id: 'GL-900001', rotulo: 'leão-de-teste' }],
      nivel: 'iconological',
      modalidade: 'possible',
      justificativa: 'como o de CA00001',
      ancora: { fonte: 'PA-TESTE-0002-cat-1', lingua: 'pt', inicio, fim: inicio + 16, trecho: 'estrela de prova', sha: await shaDoTrecho(texto) },
    })
    expect(localStorage.getItem(chaveDoRascunho('CA00002'))).toBeNull()
    // O trecho fica marcado no texto, e abre a hipótese.
    const marca = await waitFor(() => {
      const m = document.querySelector(`.item-leituras [data-hipotese="${h!.id}"]`)
      if (!m) throw new Error('sem marca')
      return m
    })
    expect(marca).toHaveTextContent('estrela de prova')
    // Em "Hipóteses por nível", com o rótulo SKC.
    await userEvent.click(screen.getByRole('button', { name: /Hipóteses por nível/ }))
    const secao = screen.getByRole('region', { name: 'Hipóteses por nível' })
    const linha = secao.querySelector(`[data-hipotese-linha="${h!.id}"]`)!
    expect(linha).toHaveTextContent(/leão-de-teste.*SKC/)
    expect(within(secao).getByRole('heading', { name: 'Iconológico' })).toBeInTheDocument()
    expect(within(within(secao).getByRole('region', { name: 'Iconológico' })).getByText('2 hipóteses')).toBeInTheDocument()
  })

  it('termo é obrigatório: o erro aparece em linha e o foco vai ao campo; nada é gravado', async () => {
    abrir('/item/CA00002')
    selecionar(await blocoDaLeitura('PA-TESTE-0002-cat-1'), 'talvez')
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar hipótese' }))
    const form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    await userEvent.click(within(form).getByRole('button', { name: 'Registrar hipótese' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Escolha pelo menos um termo.')
    expect(within(form).getByRole('combobox', { name: 'Termo' })).toHaveFocus()
    expect(hipotesesSkc()).toHaveLength(0)
  })

  it('Shift+H sem seleção abre o formulário sem trecho; Esc fecha GUARDANDO o rascunho (revisão 1, I2); Shift+H o retoma; Descartar pede confirmação', async () => {
    const primeiro = abrir('/item/CA00001')
    await screen.findByRole('heading', { level: 1 })
    await screen.findByRole('button', { name: 'Mostrar o original alemão', hidden: true })
    await apertarQuandoPronto('Shift+H', 'item')
    let form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    expect(within(form).queryByText(/selecionado no texto/)).toBeNull()
    // O elemento do livro aparece como opção de "Sobre".
    expect(within(form).getByRole('button', { name: 'leão-de-teste' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.type(within(form).getByRole('textbox', { name: 'Justificativa' }), 'uma justificativa longa')
    expect(localStorage.getItem(chaveDoRascunho('CA00001'))).not.toBeNull()
    await apertarQuandoPronto('Escape', 'hipotese', within(form).getByRole('textbox', { name: 'Justificativa' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull())
    // O rascunho fica (fechado): nada se perde por um Esc.
    expect(JSON.parse(localStorage.getItem(chaveDoRascunho('CA00001'))!)).toMatchObject({ justificativa: 'uma justificativa longa', aberto: false })
    // h sozinho continua abrindo "Hipóteses por nível", com o botão que retoma a hipótese em preparo.
    await apertarQuandoPronto('h', 'item')
    const secao = await screen.findByRole('region', { name: 'Hipóteses por nível' })
    expect(within(secao).getByRole('button', { name: 'Retomar a hipótese em preparo' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull()
    // Recarregar com o formulário FECHADO não o reabre sozinho.
    primeiro.unmount()
    abrir('/item/CA00001')
    await screen.findByRole('heading', { level: 1 })
    await screen.findByRole('button', { name: 'Mostrar o original alemão', hidden: true })
    expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull()
    // Shift+H retoma de onde estava; o × também só fecha.
    await apertarQuandoPronto('Shift+H', 'item')
    form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    expect(within(form).getByRole('textbox', { name: 'Justificativa' })).toHaveValue('uma justificativa longa')
    await userEvent.click(within(form).getByRole('button', { name: 'Fechar (o rascunho fica guardado)' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull())
    expect(localStorage.getItem(chaveDoRascunho('CA00001'))).not.toBeNull()
    // Descartar: pede confirmação; "Continuar" volta ao formulário; "Descartar" apaga.
    await apertarQuandoPronto('Shift+H', 'item')
    form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    await userEvent.click(within(form).getByRole('button', { name: 'Descartar' }))
    const confirmar = within(form).getByRole('group', { name: 'Descartar esta hipótese em preparo?' })
    await userEvent.click(within(confirmar).getByRole('button', { name: 'Continuar' }))
    expect(within(form).getByRole('textbox', { name: 'Justificativa' })).toHaveValue('uma justificativa longa')
    await userEvent.click(within(form).getByRole('button', { name: 'Descartar' }))
    await userEvent.click(within(within(form).getByRole('group', { name: 'Descartar esta hipótese em preparo?' })).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull())
    expect(localStorage.getItem(chaveDoRascunho('CA00001'))).toBeNull()
  })

  it('um rascunho fechado sem nada preenchido não fica; um novo trecho selecionado entra no rascunho retomado', async () => {
    abrir('/item/CA00002')
    const bloco = await blocoDaLeitura('PA-TESTE-0002-cat-1')
    await screen.findByRole('button', { name: 'Mostrar o original alemão', hidden: true })
    await apertarQuandoPronto('Shift+H', 'item')
    let form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    await apertarQuandoPronto('Escape', 'hipotese')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull())
    expect(localStorage.getItem(chaveDoRascunho('CA00002'))).toBeNull()
    // Com algo preenchido, fecha e guarda; um trecho novo entra no rascunho retomado (o resto fica).
    await apertarQuandoPronto('Shift+H', 'item')
    form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    await escolherTermo('leão', /^leão-de-teste/)
    await userEvent.click(within(form).getByRole('button', { name: 'Fechar (o rascunho fica guardado)' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull())
    selecionar(bloco, 'talvez')
    await waitFor(() => expect(document.querySelector('.botao-do-trecho')).not.toBeNull())
    await userEvent.click(document.querySelector<HTMLElement>('.botao-do-trecho')!)
    form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    expect(within(form).getByText('talvez')).toBeInTheDocument()
    expect(within(form).getByRole('button', { name: 'Tirar o termo leão-de-teste' })).toBeInTheDocument()
  })

  it('M4: um rascunho cuja hipótese reservada já foi gravada (recarregou entre gravar e "criado") não reabre', async () => {
    await registrar('hipotese', 'HY-testeaaa-90', 'criar', { objeto: 'CA00001', sobre: 'objeto', termos: ['GL-900001'], termosRotulos: ['leão-de-teste'], nivel: 'iconographic', modalidade: 'probable', justificativa: '', ancora: null })
    localStorage.setItem(
      chaveDoRascunho('CA00001'),
      JSON.stringify({ objeto: 'CA00001', sobre: { tipo: 'objeto' }, termos: [{ id: 'GL-900001', rotulo: 'leão-de-teste' }], nivel: 'iconographic', modalidade: 'probable', justificativa: 'depois', reserva: { hipotese: 'HY-testeaaa-90', regiao: null }, criado: null, aberto: true }),
    )
    abrir('/item/CA00001')
    await screen.findByRole('heading', { level: 1 })
    await screen.findByRole('button', { name: 'Mostrar o original alemão', hidden: true })
    expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull()
    expect(localStorage.getItem(chaveDoRascunho('CA00001'))).toBeNull()
  })

  it('recarregar com o formulário aberto o reabre como estava; o rascunho com a reserva gravada não cria outra hipótese', async () => {
    const primeiro = abrir('/item/CA00001')
    await screen.findByRole('heading', { level: 1 })
    await screen.findByRole('button', { name: 'Mostrar o original alemão', hidden: true })
    await apertarQuandoPronto('Shift+H', 'item')
    let form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    await escolherTermo('figura', /figura denteada/)
    await userEvent.click(await within(form).findByRole('button', { name: 'leão-de-teste' }))
    primeiro.unmount()

    abrir('/item/CA00001')
    form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    expect(within(form).getByRole('button', { name: 'Tirar o termo figura denteada' })).toBeInTheDocument()
    expect(await within(form).findByRole('button', { name: 'leão-de-teste' })).toHaveAttribute('aria-pressed', 'true')
    const registrarBotao = within(form).getByRole('button', { name: 'Registrar hipótese' })
    // Dois cliques seguidos: uma hipótese só.
    await act(async () => {
      fireEvent.click(registrarBotao)
      fireEvent.click(registrarBotao)
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull())
    // O segundo clique, se tivesse passado, terminaria depois do primeiro: espera as gravações em curso.
    await act(() => new Promise((r) => setTimeout(r, 200)))
    const hs = hipotesesSkc()
    expect(hs).toHaveLength(1)
    expect(hs[0]).toMatchObject({ objeto: 'CA00001', sobre: { tipo: 'elemento', id: 'EL-900002', rotulo: 'leão-de-teste' }, ancora: null })
    const criares = (await todosEventos()).filter((e) => e.tipo === 'hipotese' && e.op === 'criar' && e.reg === hs[0]!.id)
    expect(criares).toHaveLength(1)
  })
})

describe('revisão 3, M5: o rascunho em duas abas e no visualizador', () => {
  /** Outra aba gravou (ou apagou) o rascunho: o localStorage muda e esta aba recebe o evento `storage`. */
  const outraAba = (objeto: string, rascunho: Record<string, unknown> | null) => {
    const chave = chaveDoRascunho(objeto)
    const antes = localStorage.getItem(chave)
    const novo = rascunho === null ? null : JSON.stringify({ objeto, sobre: { tipo: 'objeto' }, termos: [], nivel: 'iconographic', modalidade: 'probable', justificativa: '', reserva: null, criado: null, aberto: true, ancora: null, ...rascunho })
    if (novo === null) localStorage.removeItem(chave)
    else localStorage.setItem(chave, novo)
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: chave, oldValue: antes, newValue: novo, storageArea: localStorage }))
    })
  }

  it('o formulário aberto aqui e o rascunho mudado em outra aba: avisa, não sobrescreve sem perguntar, e deixa escolher', async () => {
    abrir('/item/CA00001')
    await screen.findByRole('heading', { level: 1 })
    await screen.findByRole('button', { name: 'Mostrar o original alemão', hidden: true })
    await apertarQuandoPronto('Shift+H', 'item')
    const form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    const campo = within(form).getByRole('textbox', { name: 'Justificativa' })
    await userEvent.type(campo, 'desta aba')
    outraAba('CA00001', { justificativa: 'da outra aba', aberto: true })
    const aviso = await within(form).findByRole('group', { name: 'Esta hipótese em preparo mudou em outra aba' })
    // Enquanto não escolhe, o que se digita aqui não apaga o da outra aba.
    await userEvent.type(within(form).getByRole('textbox', { name: 'Justificativa' }), ' e mais')
    expect(JSON.parse(localStorage.getItem(chaveDoRascunho('CA00001'))!).justificativa).toBe('da outra aba')
    await userEvent.click(within(aviso).getByRole('button', { name: 'Usar a da outra aba' }))
    expect(within(form).getByRole('textbox', { name: 'Justificativa' })).toHaveValue('da outra aba')
    expect(within(form).queryByRole('group', { name: /mudou em outra aba/ })).toBeNull()
    // De novo, e agora fica a desta aba (gravada por cima, de propósito).
    outraAba('CA00001', { justificativa: 'outra vez', aberto: true })
    await userEvent.click(within(await within(form).findByRole('group', { name: /mudou em outra aba/ })).getByRole('button', { name: 'Manter a desta aba' }))
    expect(JSON.parse(localStorage.getItem(chaveDoRascunho('CA00001'))!).justificativa).toBe('da outra aba')
    // Descartada na outra aba (sem reserva nem "criado" vistos): avisa também; o que apaga a desta diz que apaga (m2).
    outraAba('CA00001', null)
    const saiu = await within(form).findByRole('group', { name: 'Esta hipótese em preparo foi descartada em outra aba' })
    await userEvent.click(within(saiu).getByRole('button', { name: 'Descartar a desta aba' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull())
    expect(localStorage.getItem(chaveDoRascunho('CA00001'))).toBeNull()
  })

  const abrirComRascunho = async (justificativa: string) => {
    localStorage.setItem(
      chaveDoRascunho('CA00001'),
      JSON.stringify({ objeto: 'CA00001', sobre: { tipo: 'objeto' }, termos: [{ id: 'GL-900001', rotulo: 'leão-de-teste' }], nivel: 'iconographic', modalidade: 'probable', justificativa, reserva: null, criado: null, aberto: true, ancora: null }),
    )
    abrir('/item/CA00001')
    // A tela inteira carregada (o formulário não remonta depois): só então a "outra aba" escreve.
    await screen.findByRole('heading', { level: 1 })
    await screen.findByRole('button', { name: 'Mostrar o original alemão', hidden: true })
    return screen.findByRole('dialog', { name: 'Nova hipótese' })
  }
  const mesma = { termos: [{ id: 'GL-900001', rotulo: 'leão-de-teste' }], justificativa: 'mesma' }
  // Um id por teste: o IndexedDB é um só no arquivo, e um registro excluído no beforeEach não volta com outro criar.
  const reservaDe = (hipotese: string) => ({ hipotese, regiao: null, termos: {} })
  const reserva = reservaDe('HY-testeaaa-99')
  const gravarNaOutraAba = (id = 'HY-testeaaa-99') =>
    registrar('hipotese', id, 'criar', { objeto: 'CA00001', sobre: 'objeto', elemento: null, elementoRotulo: '', termos: ['GL-900001'], termosRotulos: ['leão-de-teste'], nivel: 'iconographic', modalidade: 'probable', justificativa: 'mesma', ancora: null })

  it('revisão 4, I2: a outra aba registrou o MESMO rascunho: aqui não se registra outra cópia; "Abrir a registrada" leva a ela', async () => {
    const form = await abrirComRascunho('mesma')
    // A outra aba reserva o id, grava e marca "criado": só a reserva difere, então esta aba a adota em silêncio.
    outraAba('CA00001', { ...mesma, reserva })
    expect(within(form).queryByRole('group', { name: /outra aba/ })).toBeNull()
    outraAba('CA00001', { ...mesma, reserva, criado: 'HY-testeaaa-99' })
    await act(() => gravarNaOutraAba())
    outraAba('CA00001', null)
    const aviso = await within(form).findByRole('group', { name: 'Esta hipótese foi registrada na outra aba' })
    expect(within(aviso).queryByRole('button', { name: /Manter/ })).toBeNull()
    // Registrar (botão ou Ctrl+Enter) não faz outra: o foco vai ao aviso.
    await userEvent.click(within(form).getByRole('button', { name: 'Registrar hipótese' }))
    expect(within(aviso).getByRole('button', { name: 'Abrir a registrada' })).toHaveFocus()
    await act(() => new Promise((r) => setTimeout(r, 100)))
    expect(hipotesesSkc().map((h) => h.id)).toEqual(['HY-testeaaa-99'])
    await userEvent.click(within(aviso).getByRole('button', { name: 'Abrir a registrada' }))
    await waitFor(() => expect(local()).toBe('/item/CA00001?hipotese=HY-testeaaa-99'))
    expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull()
    expect(localStorage.getItem(chaveDoRascunho('CA00001'))).toBeNull()
  })

  it('revisão 4, I2: com um texto diferente aqui, a registrada na outra aba também é reconhecida (pelo "criado" visto); outra cópia só se escolhida', async () => {
    const form = await abrirComRascunho('desta aba')
    outraAba('CA00001', { ...mesma, reserva: reservaDe('HY-testeaaa-98') })
    await within(form).findByRole('group', { name: 'Esta hipótese em preparo mudou em outra aba' })
    outraAba('CA00001', { ...mesma, reserva: reservaDe('HY-testeaaa-98'), criado: 'HY-testeaaa-98' })
    // O registro ainda não chegou a esta aba quando o rascunho some: o "criado" visto basta.
    outraAba('CA00001', null)
    const aviso = await within(form).findByRole('group', { name: 'Esta hipótese foi registrada na outra aba' })
    await act(() => gravarNaOutraAba('HY-testeaaa-98'))
    await userEvent.click(within(aviso).getByRole('button', { name: 'Registrar esta como outra hipótese' }))
    await waitFor(() => expect(hipotesesSkc()).toHaveLength(2))
    const outra = hipotesesSkc().find((h) => h.id !== 'HY-testeaaa-98')!
    expect(outra.justificativa).toBe('desta aba')
  })

  it('revisão 4, m1 e m3: Esc com o conflito aberto não fecha nem grava por cima: o foco vai ao aviso; resolvido, o foco fica no formulário; o aviso é lido numa região viva que já existia', async () => {
    const form = await abrirComRascunho('desta aba')
    const viva = form.querySelector('.nova-hipotese-aviso-vivo')!
    expect(viva).toHaveAttribute('role', 'status')
    expect(viva).toHaveTextContent('')
    outraAba('CA00001', { ...mesma, justificativa: 'terceira' })
    const aviso = await within(form).findByRole('group', { name: 'Esta hipótese em preparo mudou em outra aba' })
    expect(form.querySelector('.nova-hipotese-aviso-vivo')).toBe(viva)
    expect(viva).toHaveTextContent('mudou em outra aba')
    await apertarQuandoPronto('Escape', 'hipotese', within(form).getByRole('textbox', { name: 'Justificativa' }))
    expect(screen.getByRole('dialog', { name: 'Nova hipótese' })).toBeInTheDocument()
    expect(within(aviso).getByRole('button', { name: 'Usar a da outra aba' })).toHaveFocus()
    expect(JSON.parse(localStorage.getItem(chaveDoRascunho('CA00001'))!).justificativa).toBe('terceira')
    await userEvent.click(within(aviso).getByRole('button', { name: 'Usar a da outra aba' }))
    expect(within(form).getByRole('heading', { name: 'Nova hipótese · SKC' })).toHaveFocus()
    outraAba('CA00001', { ...mesma, justificativa: 'quarta' })
    await userEvent.click(within(await within(form).findByRole('group', { name: /mudou em outra aba/ })).getByRole('button', { name: 'Manter a desta aba' }))
    expect(within(form).getByRole('heading', { name: 'Nova hipótese · SKC' })).toHaveFocus()
  })

  it('com o formulário fechado, um rascunho guardado em outra aba vira "Retomar a hipótese em preparo"', async () => {
    abrir('/item/CA00001')
    await screen.findByRole('heading', { level: 1 })
    await screen.findByRole('button', { name: 'Mostrar o original alemão', hidden: true })
    await apertarQuandoPronto('h', 'item')
    const secao = await screen.findByRole('region', { name: 'Hipóteses por nível' })
    expect(within(secao).getByRole('button', { name: 'Registrar hipótese' })).toBeInTheDocument()
    outraAba('CA00001', { justificativa: 'da outra aba', aberto: false })
    expect(await within(secao).findByRole('button', { name: 'Retomar a hipótese em preparo' })).toBeInTheDocument()
    outraAba('CA00001', null)
    expect(await within(secao).findByRole('button', { name: 'Registrar hipótese' })).toBeInTheDocument()
  })

  const desenharNoVisualizador = async () => {
    const camada = await screen.findByTestId('desenho-camada')
    Object.defineProperty(camada, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 }) })
    Object.defineProperty(camada, 'offsetWidth', { value: 200 })
    Object.defineProperty(camada, 'offsetHeight', { value: 100 })
    for (const [x, y] of [[20, 10], [100, 10], [100, 50], [21, 11]] as const) {
      fireEvent.pointerDown(camada, { clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'mouse' })
      fireEvent.pointerUp(camada, { clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'mouse' })
    }
    await userEvent.type(await screen.findByRole('textbox', { name: 'Nomear o elemento da região nova' }), 'juba')
  }

  it('visualizador aberto da Revisão (?desenhar=EL-…): já marcando, com o elemento escolhido; salvar grava a região do elemento do livro', async () => {
    abrir('/imagem/IMG-TESTE-0001-1?desenhar=EL-900002')
    // já marcando, sem tocar em «Marcar região»
    expect(await screen.findByRole('button', { name: 'Marcar região', pressed: true })).toBeInTheDocument()
    const camada = await screen.findByTestId('desenho-camada')
    Object.defineProperty(camada, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 }) })
    Object.defineProperty(camada, 'offsetWidth', { value: 200 })
    Object.defineProperty(camada, 'offsetHeight', { value: 100 })
    for (const [x, y] of [[20, 10], [100, 10], [100, 50], [21, 11]] as const) {
      fireEvent.pointerDown(camada, { clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'mouse' })
      fireEvent.pointerUp(camada, { clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'mouse' })
    }
    const escolha = await screen.findByRole('combobox', { name: 'Ou é mais uma região de' })
    expect((escolha as HTMLSelectElement).value).toBe('EL-900002')
    expect(screen.getByRole('textbox', { name: 'Nomear o elemento da região nova' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar a região' }))
    await waitFor(() => expect([...(estadoAtual().registros.get('regiao')?.values() ?? [])].filter((r) => !r.excluido)).toHaveLength(1))
    const [rg] = [...estadoAtual().registros.get('regiao')!.values()]
    expect(rg!.campos).toMatchObject({ imagem: 'IMG-TESTE-0001-1', objeto: 'CA00001', elementoId: 'EL-900002' })
  })

  it('visualizador, "Salvar e registrar hipótese" com uma hipótese em preparo: pergunta antes; "Pôr a região nela" guarda o resto', async () => {
    localStorage.setItem(
      chaveDoRascunho('CA00001'),
      JSON.stringify({ objeto: 'CA00001', sobre: { tipo: 'objeto' }, termos: [{ id: 'GL-900002', rotulo: 'figura denteada' }], nivel: 'iconological', modalidade: 'possible', justificativa: 'em preparo', reserva: null, criado: null, aberto: false, ancora: null }),
    )
    abrir('/imagem/IMG-TESTE-0001-1')
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar região' }))
    await desenharNoVisualizador()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e registrar hipótese' }))
    const pergunta = await screen.findByRole('group', { name: 'Já há uma hipótese em preparo neste objeto' })
    // Nada gravado nem sobrescrito antes da escolha.
    expect([...(estadoAtual().registros.get('regiao')?.values() ?? [])].filter((r) => !r.excluido)).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem(chaveDoRascunho('CA00001'))!).justificativa).toBe('em preparo')
    await userEvent.click(within(pergunta).getByRole('button', { name: 'Pôr a região nela' }))
    await waitFor(() => expect(local()).toBe('/item/CA00001'))
    const [rg] = [...estadoAtual().registros.get('regiao')!.values()].filter((r) => !r.excluido)
    const r = JSON.parse(localStorage.getItem(chaveDoRascunho('CA00001'))!)
    expect(r).toMatchObject({ justificativa: 'em preparo', nivel: 'iconological', termos: [{ id: 'GL-900002' }], sobre: { tipo: 'elemento', id: rg!.id, rotulo: 'juba' }, aberto: true })
    expect(await screen.findByRole('dialog', { name: 'Nova hipótese' })).toBeInTheDocument()
  })

  it('visualizador: "Começar outra" troca a em preparo pela nova; o rascunho é o do PRINCIPAL do grupo (não o do membro dono da imagem)', async () => {
    await registrar('ligacao', 'CA00001|CA00002', 'criar', { a: 'CA00001', b: 'CA00002', ativa: true })
    localStorage.setItem(
      chaveDoRascunho('CA00001'),
      JSON.stringify({ objeto: 'CA00001', sobre: { tipo: 'objeto' }, termos: [], nivel: 'iconographic', modalidade: 'probable', justificativa: 'velha', reserva: null, criado: null, aberto: false, ancora: null }),
    )
    abrir('/imagem/IMG-TESTE-0002-1')
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar região' }))
    await desenharNoVisualizador()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e registrar hipótese' }))
    await userEvent.click(within(await screen.findByRole('group', { name: 'Já há uma hipótese em preparo neste objeto' })).getByRole('button', { name: 'Começar outra' }))
    await waitFor(() => expect(localStorage.getItem(chaveDoRascunho('CA00001'))).toContain('juba'))
    expect(localStorage.getItem(chaveDoRascunho('CA00002'))).toBeNull()
    const r = JSON.parse(localStorage.getItem(chaveDoRascunho('CA00001'))!)
    expect(r).toMatchObject({ objeto: 'CA00001', justificativa: '', sobre: { tipo: 'elemento', rotulo: 'juba' } })
  })

  const comEmPreparo = (sobre: Record<string, unknown> = { tipo: 'objeto' }) =>
    localStorage.setItem(
      chaveDoRascunho('CA00001'),
      JSON.stringify({ objeto: 'CA00001', sobre, termos: [], nivel: 'iconographic', modalidade: 'probable', justificativa: 'em preparo', reserva: null, criado: null, aberto: false, ancora: null }),
    )

  it('revisão 4, I1: na pergunta, Enter aciona o botão em foco (a tecla Enter do visualizador não a engole)', async () => {
    comEmPreparo()
    abrir('/imagem/IMG-TESTE-0001-1')
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar região' }))
    await desenharNoVisualizador()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e registrar hipótese' }))
    const pergunta = await screen.findByRole('group', { name: 'Já há uma hipótese em preparo neste objeto' })
    expect(within(pergunta).getByRole('button', { name: 'Pôr a região nela' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(local()).toBe('/item/CA00001'))
    expect(JSON.parse(localStorage.getItem(chaveDoRascunho('CA00001'))!)).toMatchObject({ justificativa: 'em preparo', sobre: { tipo: 'elemento', rotulo: 'juba' } })
  })

  it('revisão 4, I1 e m3: Esc na pergunta volta ao nome da região, com o desenho e o nome guardados e o foco em "Salvar e registrar hipótese"', async () => {
    comEmPreparo()
    abrir('/imagem/IMG-TESTE-0001-1')
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar região' }))
    await desenharNoVisualizador()
    const antes = quantosAtalhos('Escape', 'visualizador')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e registrar hipótese' }))
    await screen.findByRole('group', { name: 'Já há uma hipótese em preparo neste objeto' })
    // A pergunta registra o próprio Esc num efeito (mais um mapa além do do visualizador): espera, e só então aperta.
    await waitFor(() => expect(quantosAtalhos('Escape', 'visualizador')).toBeGreaterThan(antes))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Já há uma hipótese em preparo neste objeto' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Nomear o elemento da região nova' })).toHaveValue('juba')
    expect(screen.getByRole('button', { name: 'Salvar e registrar hipótese' })).toHaveFocus()
    expect(document.querySelectorAll('.desenho-ponto')).toHaveLength(3)
    expect([...(estadoAtual().registros.get('regiao')?.values() ?? [])].filter((r) => !r.excluido)).toHaveLength(0)
    // "Voltar" faz o mesmo, com o foco no mesmo botão.
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e registrar hipótese' }))
    await userEvent.click(within(await screen.findByRole('group', { name: 'Já há uma hipótese em preparo neste objeto' })).getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('button', { name: 'Salvar e registrar hipótese' })).toHaveFocus()
  })

  it('revisão 4, m4: a pergunta diz o "Sobre" que a região vai substituir na hipótese em preparo', async () => {
    comEmPreparo({ tipo: 'nova', regiao: { imagem: 'IMG-TESTE-0001-1', pontos: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]], nome: 'cauda', pai: null } })
    abrir('/imagem/IMG-TESTE-0001-1')
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar região' }))
    await desenharNoVisualizador()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e registrar hipótese' }))
    expect(await screen.findByRole('group', { name: 'Já há uma hipótese em preparo neste objeto' })).toHaveTextContent('no lugar de «região nova cauda, ainda não salva»')
  })
})

describe('Shift+H com o formulário aberto (computador: o painel não é modal)', () => {
  it('não recomeça o formulário: o que foi preenchido continua', async () => {
    instalarMatchMedia(1280)
    abrir('/item/CA00001')
    await screen.findByRole('heading', { level: 1 })
    await screen.findByRole('button', { name: 'Mostrar o original alemão' })
    await apertarQuandoPronto('Shift+H', 'item')
    const form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    await escolherTermo('figura', /figura denteada/)
    ;(document.activeElement as HTMLElement | null)?.blur()
    await apertarQuandoPronto('Shift+H', 'item')
    expect(within(screen.getByRole('dialog', { name: 'Nova hipótese' })).getByRole('button', { name: 'Tirar o termo figura denteada' })).toBeInTheDocument()
    expect(form.isConnected).toBe(true)
    // E o rascunho guardado também (um recarregar agora reabre com o termo).
    expect(JSON.parse(localStorage.getItem(chaveDoRascunho('CA00001'))!).termos).toEqual([{ id: 'GL-900002', rotulo: 'figura denteada' }])
  })
})

describe('I4: a leitura de um livro LIGADO, na tela do principal', () => {
  it('um trecho selecionado nela ancora (com o texto guardado dela) e a hipótese fica marcada nela', async () => {
    // Um livro ligado a outro: CA00001 é o principal, a leitura de CA00002 aparece junto.
    await registrar('ligacao', 'CA00001|CA00002', 'criar', { a: 'CA00001', b: 'CA00002', ativa: true })
    abrir('/item/CA00001')
    const bloco = await blocoDaLeitura('PA-TESTE-0002-cat-1')
    await screen.findByRole('button', { name: 'Mostrar o original alemão', hidden: true })
    selecionar(bloco, 'estrela de prova')
    await waitFor(() => expect(document.querySelector('.botao-do-trecho')).not.toBeNull())
    await userEvent.click(document.querySelector<HTMLElement>('.botao-do-trecho')!)
    const form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    expect(within(form).getByText('estrela de prova')).toBeInTheDocument()
    expect(within(form).getByText(/TESTE I: 2, selecionado no texto/)).toBeInTheDocument()
    await escolherTermo('estrela', /^estrela de prova/)
    await userEvent.click(within(form).getByRole('button', { name: 'Registrar hipótese' }))
    await waitFor(() => expect(hipotesesSkc()).toHaveLength(1))
    const [h] = hipotesesSkc()
    expect(h!.ancora).toMatchObject({ fonte: 'PA-TESTE-0002-cat-1', lingua: 'pt', trecho: 'estrela de prova' })
    await waitFor(() => expect(bloco.querySelector(`[data-hipotese="${h!.id}"]`)).toHaveTextContent('estrela de prova'))
  })
})

describe('revisão 3, M13: âncoras no original (de) de um livro ligado', () => {
  it('com o original à vista, a hipótese ancorada nele é marcada também na leitura do livro ligado, com a fonte no painel', async () => {
    await registrar('ligacao', 'CA00001|CA00002', 'criar', { a: 'CA00001', b: 'CA00002', ativa: true })
    await registrar('hipotese', 'HY-testeaaa-73', 'criar', {
      objeto: 'CA00001',
      sobre: 'objeto',
      elemento: null,
      elementoRotulo: '',
      termos: ['GL-900001'],
      termosRotulos: ['leão-de-teste'],
      nivel: 'iconographic',
      modalidade: 'probable',
      justificativa: '',
      ancora: { fonte: 'PA-TESTE-0002-cat-1', lingua: 'de', inicio: 0, fim: 3, trecho: 'Auf', sha: 'c'.repeat(64) },
    })
    abrir('/item/CA00001')
    await blocoDaLeitura('PA-TESTE-0002-cat-1')
    await userEvent.click(await screen.findByRole('button', { name: 'Mostrar o original alemão', hidden: true }))
    const original = await waitFor(() => {
      const b = document.querySelector('[data-trecho-fonte="PA-TESTE-0002-cat-1"][data-trecho-lingua="de"]')
      if (!b) throw new Error('sem o original')
      return b
    })
    await waitFor(() => expect(original.querySelector('[data-hipotese="HY-testeaaa-73"]')).toHaveTextContent('Auf'))
    await userEvent.click(original.querySelector<HTMLElement>('[data-hipotese="HY-testeaaa-73"]')!)
    const painel = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
    expect(await within(painel).findByText(/· TESTE I: 2/)).toBeInTheDocument()
    expect(await within(painel).findByText(/O texto da fonte mudou/)).toBeInTheDocument()
  })
})

describe('revisão 3, M14: a seleção na leitura SKC desenhada de verdade (citação, link, bordas por elemento, marcas combinantes)', () => {
  // "é" decomposto (e + U+0301: 2 code points) e um 𓀀 (1 code point, 2 unidades UTF-16) antes do link e da citação.
  const LEITURA = 'Um cafe\u0301 𓀀 junto de [[CA00002|o outro]] e TESTE I: 2, com um leão.'
  const cps = (ate: number) => [...LEITURA.slice(0, ate)].length

  it('pontas em texto, em bordas de elemento e atravessando a citação viram posições do texto guardado (e code points na âncora)', async () => {
    const ob = 'OB-testeaaa-14'
    await registrar('objeto', ob, 'criar', { origemTipo: 'publicacao', periodo: 'CA', pedido: 'CA00005', titulo: 'Seleção', leitura: LEITURA })
    abrir(`/item/${ob}`)
    const bloco = (await blocoDaLeitura(ob)) as HTMLElement
    // A citação "TESTE I: 2" desenhada como link (o número), e o link [[…]] com o rótulo.
    await waitFor(() => expect(within(bloco).getByRole('link', { name: /^o outro/ })).toBeInTheDocument())
    await waitFor(() => expect(bloco.querySelector('.citacao-link')).not.toBeNull())
    const { trechoDoIntervalo } = await import('./selecao')
    const { ancoraDoTrecho } = await import('./ancora')
    const pecaDe = (el: Element) => el.closest('[data-b]')!
    const link = pecaDe(within(bloco).getByRole('link', { name: /^o outro/ }))
    const numero = pecaDe(bloco.querySelector('.citacao-link')!)
    const raiz = link.parentElement!
    const indice = (el: Element) => [...raiz.childNodes].indexOf(el)
    const r = (a: [Node, number], b: [Node, number]) => {
      const x = document.createRange()
      x.setStart(...a)
      x.setEnd(...b)
      return x
    }
    const ancora = async (x: Range) => {
      const t = trechoDoIntervalo(x)!
      return ancoraDoTrecho({ fonte: t.fonte, lingua: t.lingua, texto: LEITURA, inicio: t.inicio, fim: t.fim })
    }
    const inicioDoLink = LEITURA.indexOf('[[')
    const fimDoLink = LEITURA.indexOf(']]') + 2

    // 1. Começa e termina EXATAMENTE nas bordas do link, dadas como (elemento pai, índice do filho), como o Safari dá.
    expect(trechoDoIntervalo(r([raiz, indice(link)], [raiz, indice(link) + 1]))).toMatchObject({ inicio: inicioDoLink, fim: fimDoLink })
    // ... e como (o próprio elemento, 0) e (o próprio elemento, nº de filhos).
    expect(trechoDoIntervalo(r([link, 0], [link, link.childNodes.length]))).toMatchObject({ inicio: inicioDoLink, fim: fimDoLink })
    expect(await ancora(r([raiz, indice(link)], [raiz, indice(link) + 1]))).toMatchObject({ inicio: cps(inicioDoLink), fim: cps(fimDoLink), trecho: '[[CA00002|o outro]]' })

    // 2. Atravessa a citação inteira: do meio de "junto" até o meio de "com".
    const antes = [...raiz.querySelectorAll('[data-b]')].find((e) => e.textContent?.includes('junto'))!.firstChild as Text
    const depois = [...raiz.querySelectorAll('[data-b]')].find((e) => e.textContent?.includes('com um'))!.firstChild as Text
    const x = r([antes, antes.data.indexOf('junto') + 2], [depois, depois.data.indexOf('com') + 2])
    const comCitacao = { inicio: LEITURA.indexOf('junto') + 2, fim: LEITURA.indexOf('com um') + 2 }
    expect(trechoDoIntervalo(x)).toMatchObject(comCitacao)
    expect(await ancora(x)).toMatchObject({ inicio: cps(comCitacao.inicio), fim: cps(comCitacao.fim), trecho: LEITURA.slice(comCitacao.inicio, comCitacao.fim) })
    // Uma ponta DENTRO do número da citação vai à borda dele (indivisível), dos dois lados.
    const noNumero = numero.querySelector('a')!.firstChild as Text
    const doNumero = { inicio: LEITURA.indexOf('2,'), fim: LEITURA.indexOf('2,') + 1 }
    expect(trechoDoIntervalo(r([noNumero, 0], [depois, 0]))).toMatchObject({ inicio: doNumero.inicio })
    expect(trechoDoIntervalo(r([antes, 0], [noNumero, 0]))).toMatchObject({ fim: doNumero.fim })
    // Borda de elemento logo DEPOIS do número da citação (o fim fica no fim dele).
    expect(trechoDoIntervalo(r([antes, 0], [raiz, indice(numero) + 1]))).toMatchObject({ fim: doNumero.fim })

    // 3. Marcas combinantes: "café" com o acento decomposto entra inteiro (5 code points), e as posições do 𓀀 em diante
    //    contam 1 code point por ele.
    const cafe = [...raiz.querySelectorAll('[data-b]')].find((e) => e.textContent?.includes('cafe'))!.firstChild as Text
    const i = cafe.data.indexOf('cafe')
    expect(await ancora(r([cafe, i], [cafe, i + 'cafe\u0301'.length]))).toMatchObject({ inicio: cps(LEITURA.indexOf('cafe')), fim: cps(LEITURA.indexOf('cafe')) + 5, trecho: 'cafe\u0301' })
    expect(cps(fimDoLink)).toBe(fimDoLink - 1)
  })
})

describe('I8: selecionar uma palavra da leitura SKC com duplo clique', () => {
  it('o duplo (ou triplo) clique deixa a leitura como está, para selecionar; um clique só, sem seleção, abre o editor', async () => {
    const ob = 'OB-testeaaa-8'
    await registrar('objeto', ob, 'criar', { origemTipo: 'publicacao', periodo: 'CA', pedido: 'CA00005', titulo: 'Remate', leitura: 'Um leão sentado.' })
    abrir(`/item/${ob}`)
    const bloco = await blocoDaLeitura(ob)
    const user = userEvent.setup()
    // Como o navegador: click (detail 1), click (detail 2), dblclick; no triplo, mais um click (detail 3).
    const palavra = bloco.querySelector('span[data-b]')!
    fireEvent.click(palavra, { detail: 1 })
    fireEvent.click(palavra, { detail: 2 })
    fireEvent.dblClick(palavra, { detail: 2 })
    await act(() => new Promise((r) => setTimeout(r, 600)))
    expect(screen.queryByRole('textbox', { name: 'Leitura SKC' })).toBeNull()
    const ainda = document.querySelector(`[data-trecho-fonte="${ob}"] span[data-b]`)!
    fireEvent.click(ainda, { detail: 1 })
    fireEvent.click(ainda, { detail: 2 })
    fireEvent.click(ainda, { detail: 3 })
    await act(() => new Promise((r) => setTimeout(r, 600)))
    expect(screen.queryByRole('textbox', { name: 'Leitura SKC' })).toBeNull()
    // Um clique só abre o editor (decisão 37), depois de esperar se vem um segundo clique.
    window.getSelection()?.removeAllRanges()
    await user.click(document.querySelector(`[data-trecho-fonte="${ob}"] span[data-b]`)!)
    expect(await screen.findByRole('textbox', { name: 'Leitura SKC' })).toBeInTheDocument()
  })
})

describe('a hipótese SKC aberta', () => {
  it('no painel: nível, certeza e SKC; o trecho, o elemento (aceso na imagem) e a justificativa lida limpa', async () => {
    const id = 'HY-testeaaa-1'
    await registrar('regiao', 'RG-testeaaa-1', 'criar', { imagem: 'IMG-TESTE-0001-1', objeto: 'CA00001', seletor: '<polygon points="0.1,0.1 0.5,0.1 0.5,0.5"/>', elemento: 'juba', elementoId: null, pai: 'EL-900002' })
    await registrar('hipotese', id, 'criar', {
      objeto: 'CA00001',
      sobre: 'elemento',
      elemento: 'RG-testeaaa-1',
      elementoRotulo: 'juba',
      termos: ['GL-900001'],
      termosRotulos: ['leão-de-teste'],
      nivel: 'iconographic',
      modalidade: 'probable',
      justificativa: 'ver [[CA00002]] e CA00003',
      ancora: null,
    })
    abrir(`/item/CA00001?hipotese=${id}`)
    const painel = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
    expect(within(painel).getByText('Iconográfico · provável · SKC')).toBeInTheDocument()
    expect(within(painel).getByText(/juba/)).toBeInTheDocument()
    expect(within(painel).getByText(/acesa na imagem/)).toBeInTheDocument()
    expect(screen.getByText('Região acesa: juba')).toBeInTheDocument()
    // M2: a região acesa tem um contorno escuro por baixo do traço claro (destaca do desenho de traço e de uma foto clara).
    const svg = await waitFor(() => {
      const el = document.querySelector('.imagem-item-regioes')
      if (!el) throw new Error('sem svg')
      return el
    })
    expect([...svg.querySelectorAll('polygon')].map((p) => p.getAttribute('class'))).toEqual(['regiao-halo', 'regiao-traco'])
    expect(within(painel).getByRole('link', { name: 'CA00002' })).toBeInTheDocument()
    // M3: um número solto (decisão 40) também vira link na leitura limpa.
    expect(await within(painel).findByRole('link', { name: 'CA00003' })).toHaveAttribute('href', '/item/CA00003')
    // Editar a justificativa abre o código cru (decisão 37).
    await userEvent.click(within(painel).getByRole('button', { name: 'Editar a justificativa' }))
    expect(within(painel).getByRole('textbox', { name: 'Justificativa' })).toHaveValue('ver [[CA00002]] e CA00003')
  })

  it('revisão 3, Minor 4: tirar o último termo na edição diz por que não tira (nada de botão mudo)', async () => {
    const id = 'HY-testeaaa-40'
    await registrar('hipotese', id, 'criar', { objeto: 'CA00002', sobre: 'objeto', elemento: null, elementoRotulo: '', termos: ['GL-900001'], termosRotulos: ['leão-de-teste'], nivel: 'iconographic', modalidade: 'probable', justificativa: '', ancora: null })
    abrir(`/item/CA00002?hipotese=${id}`)
    const painel = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
    await userEvent.click(within(painel).getByRole('button', { name: 'Editar a hipótese' }))
    await userEvent.click(within(painel).getByRole('button', { name: 'Tirar o termo leão-de-teste' }))
    expect(await within(painel).findByRole('alert')).toHaveTextContent('Uma hipótese precisa de pelo menos um termo')
    expect(lerHipotese(estadoAtual().registro('hipotese', id)!).termos.map((t) => t.id)).toEqual(['GL-900001'])
    // Com outro termo escolhido, o primeiro sai, e o aviso some.
    await escolherTermo('figura', /figura denteada/)
    await waitFor(() => expect(lerHipotese(estadoAtual().registro('hipotese', id)!).termos.map((t) => t.id)).toEqual(['GL-900001', 'GL-900002']))
    expect(within(painel).queryByRole('alert')).toBeNull()
    await userEvent.click(within(painel).getByRole('button', { name: 'Tirar o termo leão-de-teste' }))
    await waitFor(() => expect(lerHipotese(estadoAtual().registro('hipotese', id)!).termos.map((t) => t.id)).toEqual(['GL-900002']))
  })

  it('M10: numa âncora na tradução (pt), o aviso diz "a tradução mudou"; "Já conferi" grava o sha de agora', async () => {
    const id = 'HY-testeaaa-2'
    await registrar('hipotese', id, 'criar', {
      objeto: 'CA00002',
      sobre: 'objeto',
      elemento: null,
      elementoRotulo: '',
      termos: ['GL-900001'],
      termosRotulos: ['leão-de-teste'],
      nivel: 'iconographic',
      modalidade: 'probable',
      justificativa: '',
      ancora: { fonte: 'PA-TESTE-0002-cat-1', lingua: 'pt', inicio: 74, fim: 90, trecho: 'estrela de prova', sha: 'c'.repeat(64) },
    })
    abrir(`/item/CA00002?hipotese=${id}`)
    const painel = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
    // A âncora "pt" é no texto da tradução (desvio deliberado da §7.6, src/hipoteses/modelo.ts): o aviso nomeia a tradução.
    expect((await within(painel).findByText(/A tradução mudou/)).closest('p')).toHaveTextContent('A tradução mudou desde que você marcou este trecho')
    expect(within(painel).queryByText(/O texto da fonte mudou/)).toBeNull()
    await userEvent.click(within(painel).getByRole('button', { name: 'Já conferi' }))
    await waitFor(() => expect(within(painel).queryByText(/A tradução mudou/)).toBeNull())
    expect(lerHipotese(estadoAtual().registro('hipotese', id)!).ancora?.sha).toMatch(/^[0-9a-f]{64}$/)
    expect(lerHipotese(estadoAtual().registro('hipotese', id)!).ancora?.sha).not.toBe('c'.repeat(64))
  })

  it('M10: numa âncora no original (de), o aviso continua "O texto da fonte mudou"', async () => {
    const id = 'HY-testeaaa-3'
    await registrar('hipotese', id, 'criar', {
      objeto: 'CA00002',
      sobre: 'objeto',
      elemento: null,
      elementoRotulo: '',
      termos: ['GL-900001'],
      termosRotulos: ['leão-de-teste'],
      nivel: 'iconographic',
      modalidade: 'probable',
      justificativa: '',
      ancora: { fonte: 'PA-TESTE-0002-cat-1', lingua: 'de', inicio: 0, fim: 3, trecho: 'Auf', sha: 'c'.repeat(64) },
    })
    abrir(`/item/CA00002?hipotese=${id}`)
    const painel = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
    expect(await within(painel).findByText(/O texto da fonte mudou/)).toBeInTheDocument()
    expect(within(painel).queryByText(/A tradução mudou/)).toBeNull()
  })
})

describe('a posição sobre uma hipótese do livro', () => {
  it('concordo, discordo ou em aberto, com justificativa opcional, no painel da hipótese', async () => {
    abrir('/item/CA00002?hipotese=HY-900003')
    const painel = await screen.findByRole('dialog', { name: /^Hipótese/ })
    const grupo = await within(painel).findByRole('radiogroup', { name: 'Sua posição' })
    expect(within(grupo).getAllByRole('radio').map((r) => r.textContent)).toEqual(['concordo', 'discordo', 'em aberto'])
    await userEvent.click(within(grupo).getByRole('radio', { name: 'discordo' }))
    await waitFor(() => expect(within(grupo).getByRole('radio', { name: 'discordo' })).toHaveAttribute('aria-checked', 'true'))
    expect(lerPosicao(estadoAtual().registro('posicao', 'HY-900003')!).posicao).toBe('discordo')
    await userEvent.click(within(painel).getByRole('button', { name: 'Escrever a justificativa' }))
    const campo = within(painel).getByRole('textbox', { name: 'Justificativa da posição' })
    await userEvent.type(campo, 'a cauda não é de leão')
    fireEvent.blur(campo)
    await waitFor(() => expect(lerPosicao(estadoAtual().registro('posicao', 'HY-900003')!).justificativa).toBe('a cauda não é de leão'))
    await userEvent.click(within(painel).getByRole('button', { name: 'Tirar a posição' }))
    await waitFor(() => expect(lerPosicao(estadoAtual().registro('posicao', 'HY-900003')!).posicao).toBeNull())
  })
})

describe('regiões no visualizador', () => {
  it('Marcar região (E): toques põem pontos, tocar no primeiro fecha; nomear e salvar grava o polígono (R4) na imagem', async () => {
    abrir('/imagem/IMG-TESTE-0001-1', { ampliada: true, original: false })
    const marcar = await screen.findByRole('button', { name: 'Marcar região' })
    expect(marcar).toHaveAttribute('aria-keyshortcuts', 'E')
    await userEvent.click(marcar)
    expect(marcar).toHaveAttribute('aria-pressed', 'true')
    const camada = await screen.findByTestId('desenho-camada')
    // A camada mede 200 × 100 na tela (sem giro, sem ampliação).
    Object.defineProperty(camada, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 }) })
    Object.defineProperty(camada, 'offsetWidth', { value: 200 })
    Object.defineProperty(camada, 'offsetHeight', { value: 100 })
    const tocar = (x: number, y: number) => {
      fireEvent.pointerDown(camada, { clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'mouse' })
      fireEvent.pointerUp(camada, { clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'mouse' })
    }
    tocar(20, 10)
    tocar(100, 10)
    tocar(100, 50)
    expect(screen.getByText(/3 pontos/)).toBeInTheDocument()
    // Desfazer tira o último; põe de novo e fecha no primeiro.
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer o último ponto' }))
    expect(screen.getByText(/2 pontos/)).toBeInTheDocument()
    // Concluir com 2 pontos diz por que não concluiu (M6).
    await userEvent.click(screen.getByRole('button', { name: 'Concluir a região' }))
    expect(screen.getByText(/Ponha pelo menos 3 pontos/)).toBeInTheDocument()
    tocar(100, 50)
    tocar(21, 11)
    const nome = await screen.findByRole('textbox', { name: 'Nomear o elemento da região nova' })
    await userEvent.type(nome, 'juba')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar a região' }))
    await waitFor(() => expect([...(estadoAtual().registros.get('regiao')?.values() ?? [])].filter((r) => !r.excluido)).toHaveLength(1))
    const [rg] = [...estadoAtual().registros.get('regiao')!.values()].filter((r) => !r.excluido)
    expect(rg!.campos).toMatchObject({ imagem: 'IMG-TESTE-0001-1', objeto: 'CA00001', seletor: '<polygon points="0.1,0.1 0.5,0.1 0.5,0.5"/>', elemento: 'juba', elementoId: null })
    // A região aparece na lista de regiões (leitor de tela, no celular).
    expect(await screen.findByRole('list', { name: 'Regiões da imagem' })).toHaveTextContent('juba')
  })
})

describe('objeto SKC (Tarefa 9): hipóteses como num objeto do livro', () => {
  it('"Registrar hipótese" abre o formulário; um trecho da leitura SKC ancora no texto guardado (com os [[…]])', async () => {
    const ob = 'OB-testeaaa-1'
    const leitura = 'Como [[CA00002|o outro]], um leão sentado.'
    await registrar('objeto', ob, 'criar', { origemTipo: 'publicacao', periodo: 'CA', pedido: 'CA00005', titulo: 'Remate', leitura })
    abrir(`/item/${ob}`)
    const bloco = await blocoDaLeitura(ob)
    expect(bloco).toHaveAttribute('data-trecho-lingua', 'skc')
    // O botão da barra abre o formulário (sem o aviso de "próxima versão").
    await userEvent.click((await screen.findAllByRole('button', { name: 'Registrar hipótese' }))[0]!)
    expect(await screen.findByRole('dialog', { name: 'Nova hipótese' })).toBeInTheDocument()
    expect(screen.queryByText(/chega na próxima versão/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Fechar (o rascunho fica guardado)' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull())

    selecionar(bloco, 'um leão')
    await waitFor(() => expect(document.querySelector('.botao-do-trecho')).not.toBeNull())
    await userEvent.click(document.querySelector<HTMLElement>('.botao-do-trecho')!)
    const form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    expect(within(form).getByText(/SKC, selecionado no texto/)).toBeInTheDocument()
    await escolherTermo('leão', /^leão-de-teste/)
    await userEvent.click(within(form).getByRole('button', { name: 'Registrar hipótese' }))
    await waitFor(() => expect(hipotesesSkc()).toHaveLength(1))
    const [h] = hipotesesSkc()
    const inicio = leitura.indexOf('um leão')
    expect(h).toMatchObject({ objeto: ob, ancora: { fonte: ob, lingua: 'skc', inicio, fim: inicio + 7, trecho: 'um leão', sha: await shaDoTrecho(leitura) } })
    // "Hipóteses por nível" do objeto SKC lista a hipótese com o rótulo SKC; o trecho fica marcado na leitura SKC.
    const secao = await screen.findByRole('region', { name: 'Hipóteses por nível' })
    expect(secao.querySelector(`[data-hipotese-linha="${h!.id}"]`)).toHaveTextContent(/leão-de-teste.*SKC/)
    await waitFor(() => expect(document.querySelector(`[data-hipotese="${h!.id}"]`)).toHaveTextContent('um leão'))
    await userEvent.click(document.querySelector<HTMLElement>(`[data-hipotese="${h!.id}"]`)!)
    expect(await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })).toBeInTheDocument()
    expect(local()).toBe(`/item/${ob}?hipotese=${h!.id}`)
  })
})

describe('revisão 3, M13: depois de desfazer a ligação', () => {
  it('a hipótese ancorada na leitura SKC do antigo membro vai com a leitura: a marca aparece e o texto é conferido', async () => {
    const a = 'OB-testeaaa-31'
    const b = 'OB-testeaaa-32'
    const leitura = 'Um leão sentado ao lado de um cervo.'
    await registrar('objeto', a, 'criar', { origemTipo: 'publicacao', periodo: 'CA', pedido: 'CA00005', titulo: 'A', leitura: 'Leitura de A.' })
    await registrar('objeto', b, 'criar', { origemTipo: 'publicacao', periodo: 'CA', pedido: 'CA00006', titulo: 'B', leitura })
    // Registrada na tela do principal (objeto = A), com o trecho na leitura de B, quando estavam ligados.
    const inicio = leitura.indexOf('um cervo')
    await registrar('hipotese', 'HY-testeaaa-31', 'criar', {
      objeto: a,
      sobre: 'objeto',
      elemento: null,
      elementoRotulo: '',
      termos: ['GL-900001'],
      termosRotulos: ['leão-de-teste'],
      nivel: 'iconographic',
      modalidade: 'probable',
      justificativa: '',
      ancora: { fonte: b, lingua: 'skc', inicio, fim: inicio + 8, trecho: 'um cervo', sha: 'c'.repeat(64) },
    })
    abrir(`/item/${b}`)
    const bloco = await blocoDaLeitura(b)
    await waitFor(() => expect(bloco.querySelector('[data-hipotese="HY-testeaaa-31"]')).toHaveTextContent('um cervo'))
    await userEvent.click(bloco.querySelector<HTMLElement>('[data-hipotese="HY-testeaaa-31"]')!)
    const painel = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
    expect(await within(painel).findByText(/O texto da fonte mudou/)).toBeInTheDocument()
  })
})

describe('região nova da hipótese', () => {
  const geometria = (camada: HTMLElement) => {
    Object.defineProperty(camada, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 }) })
    Object.defineProperty(camada, 'offsetWidth', { value: 200 })
    Object.defineProperty(camada, 'offsetHeight', { value: 100 })
  }
  const tocarEm = (camada: HTMLElement, x: number, y: number) => {
    fireEvent.pointerDown(camada, { clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'mouse' })
    fireEvent.pointerUp(camada, { clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'mouse' })
  }

  it('computador: marcada na coluna da imagem com o formulário ao lado; vira o elemento novo da hipótese (uma gravação)', async () => {
    instalarMatchMedia(1280)
    abrir('/item/CA00001')
    await screen.findByRole('heading', { level: 1 })
    await screen.findByRole('button', { name: 'Mostrar o original alemão' })
    await apertarQuandoPronto('Shift+H', 'item')
    const form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    expect(form).not.toHaveAttribute('aria-modal')
    await userEvent.click(within(form).getByRole('button', { name: 'Marcar uma região nova na imagem' }))
    expect(within(form).getByRole('button', { name: 'Região nova, desenhando na imagem' })).toHaveAttribute('aria-pressed', 'true')
    const barra = screen.getByRole('toolbar', { name: 'Marcar região' })
    const camada = screen.getByTestId('desenho-camada')
    geometria(camada)
    tocarEm(camada, 20, 10)
    tocarEm(camada, 100, 10)
    tocarEm(camada, 100, 50)
    await userEvent.click(within(barra).getByRole('button', { name: 'Concluir a região' }))
    expect(screen.queryByRole('toolbar', { name: 'Marcar região' })).toBeNull()
    expect(within(form).getByRole('button', { name: /Região nova, 3 pontos/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.type(within(form).getByRole('textbox', { name: 'Nome do elemento novo' }), 'juba')
    await escolherTermo('leão', /^leão-de-teste/)
    await userEvent.click(within(form).getByRole('button', { name: 'Registrar hipótese' }))
    await waitFor(() => expect(hipotesesSkc()).toHaveLength(1))
    const [h] = hipotesesSkc()
    expect(h!.sobre).toMatchObject({ tipo: 'elemento', rotulo: 'juba' })
    const rg = estadoAtual().registro('regiao', (h!.sobre as { id: string }).id)!
    expect(rg.campos).toMatchObject({ imagem: 'IMG-TESTE-0001-1', objeto: 'CA00001', seletor: '<polygon points="0.1,0.1 0.5,0.1 0.5,0.5"/>', elemento: 'juba' })
    // "Desfazer" do aviso tira a hipótese E a região que ela criou (revisão 1, I6): nada fica órfão.
    // O aviso aparece logo DEPOIS da gravação (o estado já tem a hipótese um instante antes): espera por ele.
    await userEvent.click(await waitFor(() => within(screen.getByRole('status', { name: 'Aviso' })).getByRole('button', { name: 'Desfazer' })))
    await waitFor(() => expect(estadoAtual().registro('hipotese', h!.id)!.excluido).toBe(true))
    expect(estadoAtual().registro('regiao', rg.id)!.excluido).toBe(true)
  })

  it('I6: excluir uma região no visualizador avisa quantas hipóteses falam do elemento, pede confirmação e pode ser desfeito', async () => {
    instalarMatchMedia(1280)
    await registrar('regiao', 'RG-testeaaa-5', 'criar', { imagem: 'IMG-TESTE-0001-1', objeto: 'CA00001', seletor: '<polygon points="0.1,0.1 0.5,0.1 0.5,0.5"/>', elemento: 'juba', elementoId: null, pai: null })
    for (const n of [5, 6]) {
      await registrar('hipotese', `HY-testeaaa-${n}`, 'criar', { objeto: 'CA00001', sobre: 'elemento', elemento: 'RG-testeaaa-5', elementoRotulo: 'juba', termos: ['GL-900001'], termosRotulos: ['leão-de-teste'], nivel: 'iconographic', modalidade: 'probable', justificativa: '', ancora: null })
    }
    abrir('/imagem/IMG-TESTE-0001-1', { ampliada: true, original: false })
    const painel = await screen.findByRole('complementary', { name: 'Elementos e regiões' })
    await userEvent.click(within(painel).getByRole('button', { name: 'Excluir a região juba' }))
    const confirmar = within(painel).getByRole('group', { name: 'Excluir a região juba?' })
    expect(confirmar).toHaveTextContent('2 hipóteses falam deste elemento')
    await userEvent.click(within(confirmar).getByRole('button', { name: 'Cancelar' }))
    expect(estadoAtual().registro('regiao', 'RG-testeaaa-5')!.excluido).toBe(false)
    await userEvent.click(within(painel).getByRole('button', { name: 'Excluir a região juba' }))
    await userEvent.click(within(within(painel).getByRole('group', { name: 'Excluir a região juba?' })).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(estadoAtual().registro('regiao', 'RG-testeaaa-5')!.excluido).toBe(true))
    const aviso = within(await screen.findByRole('complementary', { name: 'Elementos e regiões' })).getByRole('status')
    expect(aviso).toHaveTextContent('Região excluída')
    await userEvent.click(within(aviso).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(estadoAtual().registro('regiao', 'RG-testeaaa-5')!.excluido).toBe(false))
  })

  it('I3: marcando na coluna da imagem, as outras imagens ficam presas (sem trocar de imagem no meio do desenho)', async () => {
    instalarMatchMedia(1280)
    abrir('/item/CA00001')
    await screen.findByRole('heading', { level: 1 })
    await screen.findByRole('button', { name: 'Mostrar o original alemão' })
    expect(await screen.findByRole('button', { name: 'Imagem seguinte' })).toBeInTheDocument()
    await apertarQuandoPronto('Shift+H', 'item')
    const form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    await userEvent.click(within(form).getByRole('button', { name: 'Marcar uma região nova na imagem' }))
    expect(screen.queryByRole('button', { name: 'Imagem seguinte' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Imagem anterior' })).toBeNull()
    expect(screen.getByText(/a região fica na imagem 1 \/ 2/)).toBeInTheDocument()
    // Concluir com menos de 3 pontos diz por quê (M6).
    const camada = screen.getByTestId('desenho-camada')
    geometria(camada)
    tocarEm(camada, 20, 10)
    await userEvent.click(within(screen.getByRole('toolbar', { name: 'Marcar região' })).getByRole('button', { name: 'Concluir a região' }))
    expect(screen.getByText(/Ponha pelo menos 3 pontos/)).toBeInTheDocument()
    // Cancelar devolve as setas.
    await userEvent.click(within(screen.getByRole('toolbar', { name: 'Marcar região' })).getByRole('button', { name: 'Marcar região' }))
    expect(await screen.findByRole('button', { name: 'Imagem seguinte' })).toBeInTheDocument()
  })

  it('celular: o formulário leva ao visualizador já marcando; "Concluir e voltar à hipótese" volta com a região no formulário', async () => {
    abrir('/item/CA00001')
    await screen.findByRole('heading', { level: 1 })
    await screen.findByRole('button', { name: 'Mostrar o original alemão', hidden: true })
    await apertarQuandoPronto('Shift+H', 'item')
    let form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    await escolherTermo('leão', /^leão-de-teste/)
    await userEvent.click(within(form).getByRole('button', { name: 'Marcar uma região nova na imagem' }))
    await waitFor(() => expect(local()).toBe('/imagem/IMG-TESTE-0001-1'))
    expect(await screen.findByRole('button', { name: 'Marcar região' })).toHaveAttribute('aria-pressed', 'true')
    const camada = await screen.findByTestId('desenho-camada')
    geometria(camada)
    tocarEm(camada, 20, 10)
    tocarEm(camada, 100, 10)
    tocarEm(camada, 100, 50)
    tocarEm(camada, 20, 10)
    await userEvent.click(screen.getByRole('button', { name: 'Concluir e voltar à hipótese' }))
    await waitFor(() => expect(local()).toBe('/item/CA00001'))
    form = await screen.findByRole('dialog', { name: 'Nova hipótese' })
    expect(within(form).getByRole('button', { name: 'Tirar o termo leão-de-teste' })).toBeInTheDocument()
    expect(within(form).getByRole('button', { name: /Região nova, 3 pontos/ })).toHaveAttribute('aria-pressed', 'true')
    // Sem nome, não registra: o erro em linha.
    await userEvent.click(within(form).getByRole('button', { name: 'Registrar hipótese' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Dê um nome ao elemento novo.')
    expect(hipotesesSkc()).toHaveLength(0)
  })
})
