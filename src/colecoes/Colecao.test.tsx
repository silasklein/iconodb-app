import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { teclasNaoDeclaradas } from '../test/atalhosDeclarados'
import { todosEventos } from '../usuario/armazem'
import { estadoAtual, registrar } from '../usuario/estado'
import { totalDeEmergencias } from '../usuario/emergencia'
import { descarregarPendentes, esquecerPendentes } from '../usuario/pendentes'
import { esquecerAlvos } from '../notas/alvos'
import { lerColecao } from './modelo'
import { esquecerModoDaMemoria } from './preferencia'
import { acrescentarMembros, criarColecao } from './operacoes'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
  Element.prototype.scrollIntoView = vi.fn()
})
afterAll(() => usarMotor(null))
beforeEach(() => {
  localStorage.clear()
  esquecerModoDaMemoria()
  esquecerAlvos()
})
afterEach(() => {
  instalarMatchMedia(375)
  esquecerPendentes()
})

const membrosDe = (id: string) => lerColecao(estadoAtual().registro('colecao', id)!).membros.map((m) => m.ref)
const eventosDe = async (id: string) => (await todosEventos()).filter((e) => e.reg === id)
/** O link do objeto na linha (o primeiro; no celular a linha tem também o "Escrever nota", que é um link). */
const linkDoItem = (li: HTMLElement) => within(li).getAllByRole('link')[0]!
const anuncio = () => screen.getByTestId('anuncio')
const linhas = () => within(screen.getByRole('list', { name: 'Itens da coleção' })).getAllByRole('listitem')
const numerosNaTela = () => linhas().map((li) => within(li).getByRole('button', { name: /^Mover / }).getAttribute('aria-label')!.replace('Mover ', ''))

async function abrir(nome: string, membros: string[] = ['CA00001', 'CA00002', 'CA00003']) {
  const id = await criarColecao(nome, { membros })
  const tela = renderizarRota(`/grupo/${id}`)
  await screen.findByRole('heading', { level: 1, name: nome })
  if (membros.length > 0) await screen.findByRole('list', { name: 'Itens da coleção' })
  return { id, tela }
}

describe('uma coleção SKC abre como grupo', () => {
  it('o nome, o selo "SKC · Coleção", a contagem e os objetos na ordem da coleção, com número, tipo e sítio', async () => {
    await abrir('Abre como grupo', ['CA00003', 'CA00001'])
    expect(screen.getByText('SKC · Coleção')).toBeInTheDocument()
    const contagens = screen.getByRole('group', { name: 'O que há na coleção' })
    expect(within(contagens).getByText('Objetos').nextElementSibling).toHaveTextContent('2')
    expect(numerosNaTela()).toEqual(['CA00003', 'CA00001'])
    const segunda = linhas()[1]!
    expect(within(segunda).getByText('CA00001')).toBeInTheDocument()
    expect(await within(segunda).findByText('Pingente com leão-de-teste')).toBeInTheDocument()
    expect(linkDoItem(linhas()[0]!)).toHaveAttribute('href', '/item/CA00003')
    expect(linkDoItem(segunda)).toHaveAttribute('href', '/item/CA00001')
  })

  it('no celular tem Voltar às coleções e a lupa; no computador, a trilha', async () => {
    const { id } = await abrir('Voltar e trilha')
    expect(screen.getByRole('link', { name: 'Voltar às coleções' })).toHaveAttribute('href', '#/colecoes')
    expect(screen.getByRole('link', { name: 'Buscar' })).toHaveAttribute('href', '#/busca')
    void id
  })
  it('no computador a trilha leva às Coleções', async () => {
    instalarMatchMedia(1280)
    await abrir('Só a trilha')
    const trilha = screen.getByRole('navigation', { name: 'Trilha' })
    expect(within(trilha).getByRole('link', { name: 'Coleções' })).toHaveAttribute('href', '/colecoes')
    expect(trilha).toHaveTextContent('SKC')
  })

  it('abrir um objeto leva o contexto da coleção (os números NA ORDEM dela) e a origem para o Voltar', async () => {
    const { id } = await abrir('Contexto', ['CA00002', 'BA00001', 'CA00001'])
    await userEvent.click(linkDoItem(linhas()[1]!))
    const endereco = await screen.findByTestId('endereco')
    expect(endereco).toHaveTextContent('/item/BA00001')
    // o item mostra a coleção como origem e como posição ("2 / 3")
    const nav = await screen.findByRole('navigation', { name: 'Posição na coleção' })
    expect(within(nav).getByRole('link', { name: 'Contexto' })).toHaveAttribute('href', `/grupo/${id}`)
    await waitFor(() => expect(nav).toHaveTextContent('2 / 3'))
    expect(within(nav).getByRole('link', { name: 'Anterior: CA00002' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Próximo: CA00001' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar à coleção' })).toHaveAttribute('href', `#/grupo/${id}`)
  })

  it('uma coleção que não existe avisa e leva às coleções', async () => {
    renderizarRota('/grupo/CO-naoexiste-1')
    expect(await screen.findByRole('status')).toHaveTextContent('Coleção não encontrada')
    expect(screen.getByRole('link', { name: 'Ver as coleções' })).toHaveAttribute('href', '/colecoes')
  })

  it('sem objetos: estado vazio que diz como adicionar', async () => {
    await abrir('Vazia', [])
    expect(screen.getByText(/Nenhum objeto ainda/)).toHaveTextContent('Abra um objeto e toque em «Adicionar à coleção», ou cole códigos abaixo.')
    expect(screen.queryByRole('list', { name: 'Itens da coleção' })).toBeNull()
  })

  it('um objeto que ninguém conhece aparece pelo código, com o aviso, e pode ser tirado', async () => {
    await abrir('Desconhecido', ['CA00001', 'CA09999'])
    const linha = (await screen.findAllByRole('listitem')).find((li) => li.textContent?.includes('CA09999'))!
    await waitFor(() => expect(linha).toHaveTextContent('Não encontrado'))
    expect(within(linha).getByRole('button', { name: 'Tirar CA09999 da coleção' })).toBeInTheDocument()
  })
})

describe('lista ou miniaturas, a escolha lembrada neste aparelho (spec 4.2)', () => {
  it('começa na lista; Miniaturas mostra a grade com a imagem de cada objeto e guarda a escolha', async () => {
    await abrir('Modos')
    const modo = screen.getByRole('group', { name: 'Modo de exibição' })
    expect(within(modo).getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(modo).getByRole('button', { name: 'Miniaturas' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(within(modo).getByRole('button', { name: 'Miniaturas' }))
    expect(within(modo).getByRole('button', { name: 'Miniaturas' })).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem('iconodb:colecao-modo')).toBe('miniaturas')
    const lista = screen.getByRole('list', { name: 'Itens da coleção' })
    expect(lista).toHaveClass('colecao-grade')
    await waitFor(() => expect(lista.querySelector('img')).toHaveAttribute('src', 'blob:imagens/TESTE/TESTE-0001/thumb-1.webp'))
    expect(lista.querySelectorAll('li')).toHaveLength(3)
  })

  it('a escolha volta numa tela nova (outra coleção) e não vira evento', async () => {
    localStorage.setItem('iconodb:colecao-modo', 'miniaturas')
    const antes = (await todosEventos()).length
    await abrir('Lembrada')
    expect(screen.getByRole('list', { name: 'Itens da coleção' })).toHaveClass('colecao-grade')
    expect(screen.getByRole('button', { name: 'Miniaturas' })).toHaveAttribute('aria-pressed', 'true')
    // só o evento de criar a coleção foi gravado
    expect((await todosEventos()).length).toBe(antes + 1)
  })

  it('o mesmo vale quando o localStorage falha: troca na hora, sem estourar', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cheio', 'QuotaExceededError')
    })
    try {
      await abrir('Sem armazenamento')
      await userEvent.click(screen.getByRole('button', { name: 'Miniaturas' }))
      expect(screen.getByRole('list', { name: 'Itens da coleção' })).toHaveClass('colecao-grade')
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('reordenar com o teclado: Alt+↑ e Alt+↓', () => {
  it('Alt+↓ no puxador desce o item um lugar, guarda a ordem (UM evento, UM campo) e anuncia a posição', async () => {
    const { id } = await abrir('Teclado')
    const antes = (await eventosDe(id)).length
    const puxador = within(linhas()[0]!).getByRole('button', { name: 'Mover CA00001' })
    puxador.focus()
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}')
    await waitFor(() => expect(membrosDe(id)).toEqual(['CA00002', 'CA00001', 'CA00003']))
    expect(numerosNaTela()).toEqual(['CA00002', 'CA00001', 'CA00003'])
    await waitFor(() => expect(anuncio()).toHaveTextContent('CA00001 movido para a posição 2 de 3'))
    const novos = (await eventosDe(id)).slice(antes)
    expect(novos).toHaveLength(1)
    expect(Object.keys(novos[0]!.campos)).toEqual(['i:CA00001'])
    // o foco acompanha o item
    expect(within(linhas()[1]!).getByRole('button', { name: 'Mover CA00001' })).toHaveFocus()
    // e de novo, e Alt+↑ volta
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}')
    await waitFor(() => expect(membrosDe(id)).toEqual(['CA00002', 'CA00003', 'CA00001']))
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}')
    await waitFor(() => expect(membrosDe(id)).toEqual(['CA00002', 'CA00001', 'CA00003']))
    expect(anuncio()).toHaveTextContent('CA00001 movido para a posição 2 de 3')
  })

  it('Alt+↑/↓ também vale com o foco em outro controle da linha (o link, o botão de tirar)', async () => {
    const { id } = await abrir('Qualquer controle da linha')
    const link = linkDoItem(linhas()[1]!)
    link.focus()
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}')
    await waitFor(() => expect(membrosDe(id)).toEqual(['CA00002', 'CA00001', 'CA00003']))
  })

  it('nas pontas não há para onde ir: avisa, sem gravar nada', async () => {
    const { id } = await abrir('Pontas')
    const antes = (await eventosDe(id)).length
    within(linhas()[0]!).getByRole('button', { name: 'Mover CA00001' }).focus()
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(anuncio()).toHaveTextContent('CA00001 já é o primeiro')
    within(linhas()[2]!).getByRole('button', { name: 'Mover CA00003' }).focus()
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(anuncio()).toHaveTextContent('CA00003 já é o último')
    expect((await eventosDe(id)).length).toBe(antes)
  })

  it('o MESMO aviso repetido é anunciado de novo: o texto troca de nó, e o leitor de tela só repete quando a região muda', async () => {
    await abrir('Aviso repetido')
    within(linhas()[0]!).getByRole('button', { name: 'Mover CA00001' }).focus()
    const noDoTexto = () => [...anuncio().children].findIndex((c) => c.textContent !== '')
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(anuncio()).toHaveTextContent('CA00001 já é o primeiro')
    const primeiro = noDoTexto()
    expect(primeiro).toBeGreaterThanOrEqual(0)
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(anuncio()).toHaveTextContent('CA00001 já é o primeiro')
    expect(noDoTexto()).not.toBe(primeiro)
    expect(noDoTexto()).toBeGreaterThanOrEqual(0)
    // só um dos dois nós tem texto de cada vez (o texto não se acumula)
    expect([...anuncio().children].filter((c) => c.textContent !== '')).toHaveLength(1)
  })

  it('são DUAS regiões vivas irmãs (cada uma com role=status e aria-live=polite), não uma região atômica com dois spans; a outra fica vazia', async () => {
    await abrir('Duas regiões')
    const regioes = [...anuncio().children]
    expect(regioes).toHaveLength(2)
    for (const r of regioes) {
      expect(r).toHaveAttribute('role', 'status')
      expect(r).toHaveAttribute('aria-live', 'polite')
      expect(r.children).toHaveLength(0) // o texto é da própria região, não de um filho dela
    }
    // o recipiente não é ele mesmo uma região viva (senão o leitor trataria as duas como uma só)
    expect(anuncio()).not.toHaveAttribute('aria-live')
    expect(anuncio()).not.toHaveAttribute('aria-atomic')
    expect(anuncio()).not.toHaveAttribute('role')
    within(linhas()[0]!).getByRole('button', { name: 'Mover CA00001' }).focus()
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}')
    const textos = () => [...anuncio().children].map((r) => r.textContent)
    const primeira = textos()
    expect([...primeira].sort()).toEqual(['', 'CA00001 já é o primeiro'])
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}')
    const segunda = textos()
    expect([...segunda].sort()).toEqual(['', 'CA00001 já é o primeiro'])
    expect(segunda).not.toEqual(primeira) // o mesmo aviso foi para a OUTRA região
  })

  it('a letra, as setas sem Alt e o Alt+seta dentro de um campo de texto NÃO mexem na ordem', async () => {
    instalarMatchMedia(1280)
    const { id } = await abrir('Digitando')
    const antes = (await eventosDe(id)).length
    // as setas puras no puxador, sem estar "pegando" o item, não fazem nada
    within(linhas()[0]!).getByRole('button', { name: 'Mover CA00001' }).focus()
    await userEvent.keyboard('{ArrowDown}j')
    // dentro do campo "Adicionar por código", Alt+seta é do campo
    const campo = screen.getByRole('textbox', { name: 'Adicionar por código' })
    await userEvent.click(campo)
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(membrosDe(id)).toEqual(['CA00001', 'CA00002', 'CA00003'])
    expect((await eventosDe(id)).length).toBe(antes)
  })

  it('as teclas ficam declaradas no catálogo (aria-keyshortcuts) e o puxador tem dica', async () => {
    await abrir('Declaradas')
    const puxador = within(linhas()[0]!).getByRole('button', { name: 'Mover CA00001' })
    expect(puxador).toHaveAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown')
    expect(puxador).toHaveAttribute('data-tip', expect.stringContaining('Alt+↑'))
    expect(teclasNaoDeclaradas(document.body)).toEqual([])
  })
})

describe('reordenar sem arrastar: pegar o item (uma só tecla ou toque, sem gesto de arrasto)', () => {
  it('tocar no puxador "pega" o item: aparecem Subir e Descer, as setas movem, Esc solta', async () => {
    const { id } = await abrir('Pegar')
    const puxador = within(linhas()[0]!).getByRole('button', { name: 'Mover CA00001' })
    expect(puxador).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(puxador)
    expect(puxador).toHaveAttribute('aria-pressed', 'true')
    const descer = within(linhas()[0]!).getByRole('button', { name: 'Descer CA00001' })
    expect(within(linhas()[0]!).getByRole('button', { name: 'Subir CA00001' })).toBeInTheDocument()
    await userEvent.click(descer)
    await waitFor(() => expect(membrosDe(id)).toEqual(['CA00002', 'CA00001', 'CA00003']))
    // ainda pegando: a seta do teclado, no puxador, também move
    within(linhas()[1]!).getByRole('button', { name: 'Mover CA00001' }).focus()
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(membrosDe(id)).toEqual(['CA00002', 'CA00003', 'CA00001']))
    await userEvent.keyboard('{Escape}')
    expect(within(linhas()[2]!).getByRole('button', { name: 'Mover CA00001' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Descer CA00001' })).toBeNull()
  })
})

describe('reordenar arrastando (ponteiro: mouse e toque)', () => {
  function simularCaixas() {
    const ul = screen.getByRole('list', { name: 'Itens da coleção' })
    for (const li of ul.querySelectorAll('li')) {
      Object.defineProperty(li, 'getBoundingClientRect', {
        configurable: true,
        value: () => {
          const i = [...ul.children].indexOf(li)
          return { left: 0, right: 300, top: i * 60, bottom: i * 60 + 60, width: 300, height: 60, x: 0, y: i * 60, toJSON: () => ({}) }
        },
      })
    }
  }
  const eventoDoPonteiro = (y: number, tipo = 'mouse') => ({ pointerId: 7, pointerType: tipo, button: 0, clientX: 20, clientY: y })

  it('arrastar o primeiro até a posição do último reordena ao soltar, grava UM evento e anuncia', async () => {
    const { id } = await abrir('Arrasto')
    simularCaixas()
    const antes = (await eventosDe(id)).length
    const puxador = within(linhas()[0]!).getByRole('button', { name: 'Mover CA00001' })
    expect(puxador).toHaveStyle({ touchAction: 'none' })
    fireEvent.pointerDown(puxador, eventoDoPonteiro(30))
    fireEvent.pointerMove(puxador, eventoDoPonteiro(100))
    // durante o arrasto a lista já mostra onde o item vai ficar, e nada foi gravado ainda
    expect(numerosNaTela()).toEqual(['CA00002', 'CA00001', 'CA00003'])
    expect((await eventosDe(id)).length).toBe(antes)
    fireEvent.pointerMove(puxador, eventoDoPonteiro(170))
    expect(numerosNaTela()).toEqual(['CA00002', 'CA00003', 'CA00001'])
    fireEvent.pointerUp(puxador, eventoDoPonteiro(170))
    await waitFor(() => expect(membrosDe(id)).toEqual(['CA00002', 'CA00003', 'CA00001']))
    expect(numerosNaTela()).toEqual(['CA00002', 'CA00003', 'CA00001'])
    await waitFor(() => expect(anuncio()).toHaveTextContent('CA00001 movido para a posição 3 de 3'))
    const novos = (await eventosDe(id)).slice(antes)
    expect(novos).toHaveLength(1)
    expect(Object.keys(novos[0]!.campos)).toEqual(['i:CA00001'])
  })

  it('reordenar a lista reinsere o nó do puxador e o navegador solta a captura: o pointerup que chega a OUTRO elemento ainda solta', async () => {
    const { id } = await abrir('Captura perdida')
    simularCaixas()
    const puxador = within(linhas()[0]!).getByRole('button', { name: 'Mover CA00001' })
    fireEvent.pointerDown(puxador, eventoDoPonteiro(30))
    fireEvent.pointerMove(puxador, eventoDoPonteiro(100))
    fireEvent.pointerMove(document.body, eventoDoPonteiro(170))
    expect(numerosNaTela()).toEqual(['CA00002', 'CA00003', 'CA00001'])
    fireEvent.pointerUp(document.body, eventoDoPonteiro(170))
    await waitFor(() => expect(membrosDe(id)).toEqual(['CA00002', 'CA00003', 'CA00001']))
    // soltou os ouvintes: um pointermove depois não mexe em nada
    fireEvent.pointerMove(document.body, eventoDoPonteiro(30))
    expect(numerosNaTela()).toEqual(['CA00002', 'CA00003', 'CA00001'])
  })

  it('um toque no puxador sem arrastar não move nada (é "pegar")', async () => {
    const { id } = await abrir('Toque')
    simularCaixas()
    const antes = (await eventosDe(id)).length
    const puxador = within(linhas()[1]!).getByRole('button', { name: 'Mover CA00002' })
    fireEvent.pointerDown(puxador, eventoDoPonteiro(90, 'touch'))
    fireEvent.pointerUp(puxador, eventoDoPonteiro(90, 'touch'))
    fireEvent.click(puxador)
    expect(puxador).toHaveAttribute('aria-pressed', 'true')
    expect(membrosDe(id)).toEqual(['CA00001', 'CA00002', 'CA00003'])
    expect((await eventosDe(id)).length).toBe(antes)
  })

  it('Esc no meio do arrasto cancela: a lista volta e nada é gravado; o clique que sobra não "pega" o item', async () => {
    const { id } = await abrir('Cancela')
    simularCaixas()
    const antes = (await eventosDe(id)).length
    const puxador = within(linhas()[0]!).getByRole('button', { name: 'Mover CA00001' })
    fireEvent.pointerDown(puxador, eventoDoPonteiro(30))
    fireEvent.pointerMove(puxador, eventoDoPonteiro(170))
    expect(numerosNaTela()).toEqual(['CA00002', 'CA00003', 'CA00001'])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(numerosNaTela()).toEqual(['CA00001', 'CA00002', 'CA00003'])
    fireEvent.pointerUp(puxador, eventoDoPonteiro(170))
    fireEvent.click(puxador)
    expect((await eventosDe(id)).length).toBe(antes)
    expect(puxador).toHaveAttribute('aria-pressed', 'false')
  })

  it('pointercancel (o sistema tomou o toque) também cancela', async () => {
    const { id } = await abrir('Cancelado pelo sistema')
    simularCaixas()
    const puxador = within(linhas()[0]!).getByRole('button', { name: 'Mover CA00001' })
    fireEvent.pointerDown(puxador, eventoDoPonteiro(30, 'touch'))
    fireEvent.pointerMove(puxador, eventoDoPonteiro(170, 'touch'))
    fireEvent.pointerCancel(puxador, eventoDoPonteiro(170, 'touch'))
    expect(numerosNaTela()).toEqual(['CA00001', 'CA00002', 'CA00003'])
    expect(membrosDe(id)).toEqual(['CA00001', 'CA00002', 'CA00003'])
  })

  it('o botão direito do mouse não começa um arrasto', async () => {
    await abrir('Botão direito')
    simularCaixas()
    const puxador = within(linhas()[0]!).getByRole('button', { name: 'Mover CA00001' })
    fireEvent.pointerDown(puxador, { ...eventoDoPonteiro(30), button: 2 })
    fireEvent.pointerMove(puxador, eventoDoPonteiro(170))
    expect(numerosNaTela()).toEqual(['CA00001', 'CA00002', 'CA00003'])
  })

  it('na grade de miniaturas o arrasto também reordena', async () => {
    localStorage.setItem('iconodb:colecao-modo', 'miniaturas')
    const { id } = await abrir('Arrasto na grade')
    const ul = screen.getByRole('list', { name: 'Itens da coleção' })
    // duas colunas: cada cartão 100 x 120
    for (const li of ul.querySelectorAll('li')) {
      Object.defineProperty(li, 'getBoundingClientRect', {
        configurable: true,
        value: () => {
          const i = [...ul.children].indexOf(li)
          const left = (i % 2) * 110
          const top = Math.floor(i / 2) * 140
          return { left, right: left + 100, top, bottom: top + 120, width: 100, height: 120, x: left, y: top, toJSON: () => ({}) }
        },
      })
    }
    const puxador = within(ul.querySelectorAll('li')[0] as HTMLElement).getByRole('button', { name: 'Mover CA00001' })
    fireEvent.pointerDown(puxador, { pointerId: 3, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(puxador, { pointerId: 3, pointerType: 'mouse', clientX: 160, clientY: 10 })
    fireEvent.pointerUp(puxador, { pointerId: 3, pointerType: 'mouse', clientX: 160, clientY: 10 })
    await waitFor(() => expect(membrosDe(id)).toEqual(['CA00002', 'CA00001', 'CA00003']))
  })
})

describe('tirar da coleção e desfazer', () => {
  it('Tirar escreve null no campo, o objeto some, e "Desfazer" o devolve ao MESMO lugar, sem duplicar', async () => {
    const { id } = await abrir('Tira e desfaz')
    await userEvent.click(within(linhas()[1]!).getByRole('button', { name: 'Tirar CA00002 da coleção' }))
    await waitFor(() => expect(numerosNaTela()).toEqual(['CA00001', 'CA00003']))
    const aviso = await screen.findByText(/CA00002 tirado da coleção/)
    expect(aviso.closest('[role="status"]')).not.toBeNull()
    expect((await eventosDe(id)).at(-1)!.campos).toEqual({ 'm:CA00002': null })
    await userEvent.click(within(aviso.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(numerosNaTela()).toEqual(['CA00001', 'CA00002', 'CA00003']))
    expect(membrosDe(id)).toEqual(['CA00001', 'CA00002', 'CA00003'])
    // O aviso sai num render depois do da lista (sob carga, não no mesmo instante).
    await waitFor(() => expect(screen.queryByText(/CA00002 tirado da coleção/)).toBeNull())
  })

  it('tirar e acrescentar de novo à mão (pelo código) não duplica', async () => {
    const { id } = await abrir('Sem duplicar')
    await userEvent.click(within(linhas()[0]!).getByRole('button', { name: 'Tirar CA00001 da coleção' }))
    await waitFor(() => expect(membrosDe(id)).toEqual(['CA00002', 'CA00003']))
    await userEvent.type(screen.getByRole('textbox', { name: 'Adicionar por código' }), 'CA00001 CA00001 CA00002')
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(membrosDe(id)).toEqual(['CA00002', 'CA00003', 'CA00001']))
  })
})

describe('adicionar por código (colar vários)', () => {
  it('põe no fim os códigos que o pacote tem, diz quantos entraram e o que não achou ou ignorou', async () => {
    const { id } = await abrir('Por código', ['CA00001'])
    const campo = screen.getByRole('textbox', { name: 'Adicionar por código' })
    await userEvent.type(campo, 'ba00001, CA00001{Enter}CA99999 xyz BA00002')
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(membrosDe(id)).toEqual(['CA00001', 'BA00001', 'BA00002']))
    const resultado = await screen.findByText(/2 objetos adicionados/)
    expect(resultado.closest('[role="status"]')).not.toBeNull()
    expect(resultado).toHaveTextContent('Já estava na coleção: CA00001')
    const erro = screen.getByRole('alert')
    expect(erro).toHaveTextContent('Não achei: CA99999')
    expect(erro).toHaveTextContent('Não parece um código: xyz')
    expect(campo).toHaveValue('')
  })

  it('campo vazio: erro ao lado do campo, sem botão desabilitado', async () => {
    await abrir('Código vazio')
    const botao = screen.getByRole('button', { name: 'Adicionar' })
    expect(botao).toBeEnabled()
    await userEvent.click(botao)
    expect(screen.getByRole('alert')).toHaveTextContent('Cole ao menos um código, como CA00001.')
    expect(screen.getByRole('textbox', { name: 'Adicionar por código' })).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('renomear no lugar', () => {
  it('Renomear troca o título por um campo com o nome; Enter salva; o evento é só o nome', async () => {
    const { id } = await abrir('Nome antigo')
    const antes = (await eventosDe(id)).length
    await userEvent.click(screen.getByRole('button', { name: 'Renomear' }))
    const campo = screen.getByRole('textbox', { name: 'Nome da coleção' })
    expect(campo).toHaveValue('Nome antigo')
    expect(campo).toHaveFocus()
    await userEvent.clear(campo)
    await userEvent.type(campo, '  Nome novo{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'Nome novo' })).toBeInTheDocument()
    const novos = (await eventosDe(id)).slice(antes)
    expect(novos).toHaveLength(1)
    expect(novos[0]).toMatchObject({ op: 'alterar', campos: { nome: 'Nome novo' } })
    expect(screen.getByRole('button', { name: 'Renomear' })).toHaveFocus()
  })

  it('nome vazio: erro junto ao campo, o campo continua e nada é gravado; Esc cancela', async () => {
    const { id } = await abrir('Não esvazia')
    const antes = (await eventosDe(id)).length
    await userEvent.click(screen.getByRole('button', { name: 'Renomear' }))
    const campo = screen.getByRole('textbox', { name: 'Nome da coleção' })
    await userEvent.clear(campo)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Escreva um nome para a coleção.')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect((await eventosDe(id)).length).toBe(antes)
    await userEvent.type(campo, 'x')
    expect(screen.queryByRole('alert')).toBeNull()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Nome da coleção' })).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Não esvazia' })).toBeInTheDocument()
    expect((await eventosDe(id)).length).toBe(antes)
  })
})

describe('a descrição da coleção (spec 3: o nome, a descrição e os itens)', () => {
  const campoDescricao = () => screen.getByRole('textbox', { name: 'Descrição' })

  it('sem descrição só há um botão discreto; ele abre o campo "Descrição" com o foco', async () => {
    await abrir('Sem descrição')
    expect(screen.queryByRole('textbox', { name: 'Descrição' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar descrição' }))
    expect(campoDescricao()).toHaveFocus()
    expect(screen.getByText('Descrição')).toBeVisible() // o rótulo é visível, não só o nome acessível
    expect(screen.queryByRole('button', { name: 'Adicionar descrição' })).toBeNull()
  })

  it('sair do campo (blur) grava só a descrição, aparada, e ela fica na tela', async () => {
    const { id } = await abrir('Descreve ao sair')
    const antes = (await eventosDe(id)).length
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar descrição' }))
    await userEvent.type(campoDescricao(), '  Selos com íbices, da coleção de teste.  ')
    expect((await eventosDe(id)).length).toBe(antes) // enquanto digita, nada
    await userEvent.tab()
    await waitFor(async () => expect((await eventosDe(id)).length).toBe(antes + 1))
    const novo = (await eventosDe(id)).at(-1)!
    expect(novo).toMatchObject({ op: 'alterar', campos: { descricao: 'Selos com íbices, da coleção de teste.' } })
    expect(Object.keys(novo.campos)).toEqual(['descricao'])
    expect(campoDescricao()).toHaveValue('Selos com íbices, da coleção de teste.')
  })

  it('uma coleção com descrição já mostra o campo preenchido; sem mudança, sair do campo não grava', async () => {
    const id = await criarColecao('Já descrita', { descricao: 'O que ela reúne.', membros: ['CA00001'] })
    renderizarRota(`/grupo/${id}`)
    await screen.findByRole('heading', { level: 1, name: 'Já descrita' })
    expect(campoDescricao()).toHaveValue('O que ela reúne.')
    const antes = (await eventosDe(id)).length
    campoDescricao().focus()
    await userEvent.tab()
    expect((await eventosDe(id)).length).toBe(antes)
  })

  it('apagar tudo e sair grava a descrição vazia e volta ao botão discreto', async () => {
    const id = await criarColecao('Apaga a descrição', { descricao: 'Vai sumir.' })
    renderizarRota(`/grupo/${id}`)
    await screen.findByRole('heading', { level: 1, name: 'Apaga a descrição' })
    await userEvent.clear(campoDescricao())
    await userEvent.tab()
    expect(await screen.findByRole('button', { name: 'Adicionar descrição' })).toBeInTheDocument()
    expect((await eventosDe(id)).at(-1)!.campos).toEqual({ descricao: '' })
  })

  it('Ctrl/⌘S (descarregar o que está pendente) grava o texto digitado SEM sair do campo', async () => {
    const { id } = await abrir('Salvar sem sair')
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar descrição' }))
    await userEvent.type(campoDescricao(), 'Ainda digitando')
    expect(campoDescricao()).toHaveFocus()
    const antes = (await eventosDe(id)).length
    await descarregarPendentes()
    expect((await eventosDe(id)).length).toBe(antes + 1)
    expect((await eventosDe(id)).at(-1)!.campos).toEqual({ descricao: 'Ainda digitando' })
    // chamar de novo, sem nada novo, não grava de novo
    await descarregarPendentes()
    expect((await eventosDe(id)).length).toBe(antes + 1)
  })

  it('parar de digitar por 1 s grava sozinho, sem sair do campo (nem Ctrl/⌘S)', async () => {
    const { id } = await abrir('Grava sozinho')
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar descrição' }))
    await userEvent.type(campoDescricao(), 'Parei de digitar')
    expect(campoDescricao()).toHaveFocus()
    await waitFor(() => expect(lerColecao(estadoAtual().registro('colecao', id)!).descricao).toBe('Parei de digitar'), { timeout: 4000 })
    expect(campoDescricao()).toHaveFocus()
    expect(campoDescricao()).toHaveValue('Parei de digitar')
  })

  it('a página indo embora (pagehide) logo depois de digitar guarda o texto de forma SÍNCRONA, e a abertura seguinte o recupera', async () => {
    const { id, tela } = await abrir('Recarrega na hora')
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar descrição' }))
    await userEvent.type(campoDescricao(), 'texto um')
    window.dispatchEvent(new Event('pagehide'))
    expect(totalDeEmergencias()).toBe(1) // antes de qualquer espera: o IndexedDB pode ser cortado
    tela.unmount()
    await waitFor(() => expect(totalDeEmergencias()).toBe(0)) // a gravação chegou ao IndexedDB e limpou a entrada
    expect(lerColecao(estadoAtual().registro('colecao', id)!).descricao).toBe('texto um')
  })

  it('sair da tela com texto por gravar também grava (não se perde)', async () => {
    const { id, tela } = await abrir('Sai da tela')
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar descrição' }))
    await userEvent.type(campoDescricao(), 'Escrita na hora de sair')
    tela.unmount()
    await waitFor(() => expect(lerColecao(estadoAtual().registro('colecao', id)!).descricao).toBe('Escrita na hora de sair'))
  })

  it('uma descrição que chega de outro aparelho aparece, se o campo não está em uso', async () => {
    const { id } = await abrir('Chega de fora a descrição')
    await act(async () => {
      await registrar('colecao', id, 'alterar', { descricao: 'Veio de outro aparelho' })
    })
    await waitFor(() => expect(campoDescricao()).toHaveValue('Veio de outro aparelho'))
  })

  it('na coleção excluída não há edição de descrição', async () => {
    const id = await criarColecao('Excluída e descrita', { descricao: 'Texto.' })
    await registrar('colecao', id, 'excluir')
    renderizarRota(`/grupo/${id}`)
    await screen.findByText(/Coleção «Excluída e descrita» excluída/)
    expect(screen.queryByRole('textbox', { name: 'Descrição' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Adicionar descrição' })).toBeNull()
  })
})

describe('excluir e restaurar a coleção', () => {
  it('Excluir marca a coleção como excluída (reversível), diz o nome e oferece Restaurar; os objetos continuam guardados', async () => {
    const { id } = await abrir('Para excluir')
    await userEvent.click(screen.getByRole('button', { name: 'Excluir coleção' }))
    const aviso = await screen.findByText(/Coleção «Para excluir» excluída/)
    expect(aviso.closest('[role="status"]')).not.toBeNull()
    expect(estadoAtual().registro('colecao', id)!.excluido).toBe(true)
    expect(screen.queryByRole('list', { name: 'Itens da coleção' })).toBeNull()
    expect(membrosDe(id)).toEqual(['CA00001', 'CA00002', 'CA00003'])
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar coleção' }))
    expect(await screen.findByRole('list', { name: 'Itens da coleção' })).toBeInTheDocument()
    expect(estadoAtual().registro('colecao', id)!.excluido).toBe(false)
    expect(numerosNaTela()).toEqual(['CA00001', 'CA00002', 'CA00003'])
    expect((await eventosDe(id)).map((e) => e.op)).toEqual(['criar', 'excluir', 'restaurar'])
  })

  it('abrir uma coleção já excluída (um link velho) mostra o aviso com Restaurar, não "não encontrada"', async () => {
    const id = await criarColecao('Excluída antes', { membros: ['CA00001'] })
    await registrar('colecao', id, 'excluir')
    renderizarRota(`/grupo/${id}`)
    expect(await screen.findByText(/Coleção «Excluída antes» excluída/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restaurar coleção' })).toBeInTheDocument()
  })
})

describe('nota por item da coleção (editor da Tarefa 6)', () => {
  it('no celular "Escrever nota" leva à tela da nota, com o alvo "item da coleção"', async () => {
    const { id } = await abrir('Nota no celular', ['CA00001'])
    const botao = within(linhas()[0]!).getByRole('link', { name: 'Escrever nota sobre CA00001' })
    expect(botao).toHaveTextContent('Escrever nota')
    expect(botao).toHaveAttribute('href', `/nota/nova?alvoTipo=colecao-item&alvo=${encodeURIComponent(`${id}/CA00001`)}`)
  })

  it('no computador "Escrever nota" abre o editor no lugar, na linha do item', async () => {
    instalarMatchMedia(1280)
    await abrir('Nota no computador', ['CA00001', 'CA00002'])
    await userEvent.click(within(linhas()[1]!).getByRole('button', { name: 'Escrever nota sobre CA00002' }))
    const campo = await within(linhas()[1]!).findByRole('textbox', { name: /^Nota \[1\]/ })
    expect(campo).toHaveFocus()
    expect(within(linhas()[0]!).queryByRole('textbox')).toBeNull()
  })

  it('as notas do item aparecem na linha dele (e só nela), e continuam lá depois de tirar e pôr o objeto de volta', async () => {
    const id = await criarColecao('Notas nas linhas', { membros: ['CA00001', 'CA00002'] })
    await registrar('nota', 'NT-colnota1-1', 'criar', { texto: 'Conferir a escala.', alvoTipo: 'colecao-item', alvo: `${id}/CA00002`, rascunho: false })
    renderizarRota(`/grupo/${id}`)
    await screen.findByRole('list', { name: 'Itens da coleção' })
    expect(within(linhas()[1]!).getByText('Conferir a escala.')).toBeInTheDocument()
    expect(within(linhas()[0]!).queryByText('Conferir a escala.')).toBeNull()
    await userEvent.click(within(linhas()[1]!).getByRole('button', { name: 'Tirar CA00002 da coleção' }))
    await waitFor(() => expect(numerosNaTela()).toEqual(['CA00001']))
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(numerosNaTela()).toEqual(['CA00001', 'CA00002']))
    expect(within(linhas()[1]!).getByText('Conferir a escala.')).toBeInTheDocument()
  })

  it('o editor aberto numa linha não perde o que foi digitado se o objeto sai da coleção (a rede de segurança grava o rascunho no alvo certo)', async () => {
    instalarMatchMedia(1280)
    const { id } = await abrir('Rascunho seguro', ['CA00001', 'CA00002'])
    await userEvent.click(within(linhas()[1]!).getByRole('button', { name: 'Escrever nota sobre CA00002' }))
    const campo = await within(linhas()[1]!).findByRole('textbox', { name: /^Nota \[1\]/ })
    await userEvent.type(campo, 'Texto que não pode se perder')
    await userEvent.click(within(linhas()[1]!).getByRole('button', { name: 'Tirar CA00002 da coleção' }))
    await waitFor(() => expect(numerosNaTela()).toEqual(['CA00001']))
    await waitFor(() => {
      const notas = [...(estadoAtual().registros.get('nota')?.values() ?? [])].filter((n) => n.campos.alvo === `${id}/CA00002`)
      expect(notas).toHaveLength(1)
      expect(notas[0]!.campos).toMatchObject({ alvoTipo: 'colecao-item', texto: 'Texto que não pode se perder', rascunho: true })
    })
  })

  it('na grade de miniaturas o cartão do item com nota mostra que há nota', async () => {
    localStorage.setItem('iconodb:colecao-modo', 'miniaturas')
    const id = await criarColecao('Notas na grade', { membros: ['CA00001', 'CA00002'] })
    await registrar('nota', 'NT-colnota2-1', 'criar', { texto: 'Uma nota.', alvoTipo: 'colecao-item', alvo: `${id}/CA00001`, rascunho: false })
    renderizarRota(`/grupo/${id}`)
    const grade = await screen.findByRole('list', { name: 'Itens da coleção' })
    const cartoes = within(grade).getAllByRole('listitem')
    expect(within(cartoes[0]!).getByText('1 nota')).toBeInTheDocument()
    expect(within(cartoes[1]!).queryByText(/nota/)).toBeNull()
  })
})

describe('várias coleções e o resto da camada do usuário', () => {
  it('outro aparelho acrescenta um objeto e a tela aberta o mostra (sem recarregar)', async () => {
    const { id } = await abrir('Chega de fora', ['CA00001'])
    await act(async () => {
      await acrescentarMembros(id, ['BA00002'])
    })
    await waitFor(() => expect(numerosNaTela()).toEqual(['CA00001', 'BA00002']))
  })

  it('o nome é de uma linha só: Shift+Enter não faz nada e uma quebra colada vira espaço', async () => {
    await abrir('Uma linha')
    await userEvent.click(screen.getByRole('button', { name: 'Renomear' }))
    const campo = screen.getByRole('textbox', { name: 'Nome da coleção' })
    await userEvent.clear(campo)
    await userEvent.type(campo, 'abc{Shift>}{Enter}{/Shift}')
    expect(campo).toHaveValue('abc')
    expect(campo).toHaveFocus()
    await userEvent.clear(campo)
    await userEvent.paste('um\ndois')
    expect(campo).toHaveValue('um dois')
  })

  it('qualquer sequência de espaços, tabs ou quebras vira um só espaço ao digitar, ao colar e ao abrir um nome antigo; gravar apara só as pontas', async () => {
    const id = await criarColecao('Nome\t  com   tabs', { membros: [] })
    renderizarRota(`/grupo/${id}`)
    await screen.findByRole('heading', { level: 1 })
    const antes = (await eventosDe(id)).length
    await userEvent.click(screen.getByRole('button', { name: 'Renomear' }))
    const campo = screen.getByRole('textbox', { name: 'Nome da coleção' })
    expect(campo).toHaveValue('Nome com tabs')
    await userEvent.clear(campo)
    await userEvent.paste('a\t\tb  c\n\nd')
    expect(campo).toHaveValue('a b c d')
    // Aberto e fechado sem mexer: nada é gravado.
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Renomear' }))
    await userEvent.keyboard('{Enter}')
    expect((await eventosDe(id)).length).toBe(antes)
  })

  it('digitar um segundo espaço no meio do nome não move o cursor', async () => {
    await abrir('Selo')
    await userEvent.click(screen.getByRole('button', { name: 'Renomear' }))
    const campo = screen.getByRole('textbox', { name: 'Nome da coleção' }) as HTMLTextAreaElement
    await userEvent.clear(campo)
    await userEvent.type(campo, 'ab cd')
    campo.setSelectionRange(3, 3) // «ab |cd»
    await userEvent.keyboard(' ') // segundo espaço: «ab  cd» -> «ab cd», cursor logo depois do primeiro espaço
    expect(campo).toHaveValue('ab cd')
    expect(campo.selectionStart).toBe(3)
    expect(campo.selectionEnd).toBe(3)
    await userEvent.keyboard('X')
    expect(campo).toHaveValue('ab Xcd')
  })

  it('colar um trecho com tab no meio do nome deixa o cursor depois do trecho colado', async () => {
    await abrir('Selo')
    await userEvent.click(screen.getByRole('button', { name: 'Renomear' }))
    const campo = screen.getByRole('textbox', { name: 'Nome da coleção' }) as HTMLTextAreaElement
    await userEvent.clear(campo)
    await userEvent.type(campo, 'ab cd')
    campo.setSelectionRange(2, 2) // «ab| cd»
    await userEvent.paste('1\t\t2')
    expect(campo).toHaveValue('ab1 2 cd')
    expect(campo.selectionStart).toBe(5) // depois do «2»
    expect(campo.selectionEnd).toBe(5)
  })

  it.each([
    ['isComposing', { isComposing: true }],
    ['keyCode 229 (Safari)', { keyCode: 229 }],
  ])('Enter durante uma composição (IME, %s) não grava nem fecha o campo', async (_nome, init) => {
    const { id } = await abrir('Composição')
    const antes = (await eventosDe(id)).length
    await userEvent.click(screen.getByRole('button', { name: 'Renomear' }))
    const campo = screen.getByRole('textbox', { name: 'Nome da coleção' })
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Outro')
    fireEvent.keyDown(campo, { key: 'Enter', ...init })
    await act(async () => { await new Promise((r) => setTimeout(r, 100)) })
    expect(screen.getByRole('textbox', { name: 'Nome da coleção' })).toHaveValue('Outro')
    expect((await eventosDe(id)).length).toBe(antes)
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Outro' })).toBeInTheDocument()
  })

  it('o texto escondido que dá a largura ao campo traz o nome atual e o digitado, para o campo não encolher', async () => {
    await abrir('Nome atual comprido')
    await userEvent.click(screen.getByRole('button', { name: 'Renomear' }))
    const campo = screen.getByRole('textbox', { name: 'Nome da coleção' })
    await userEvent.clear(campo)
    await userEvent.type(campo, 'x')
    const sombras = [...document.querySelectorAll('.colecao-titulo-fantasma > *')].map((e) => e.textContent)
    expect(sombras).toEqual(['Nome atual comprido', 'x'])
  })
})
