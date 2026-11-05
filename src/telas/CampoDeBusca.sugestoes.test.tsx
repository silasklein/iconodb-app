import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { destacar } from '../busca/destaque'
import { lerTabelaDeFold } from '../busca/fold'
import { LIMITE_DE_RECENTES, adicionarRecente, lerRecentes } from '../busca/recentes'
import { semSugestoes, sugerir, type Categoria, type Sugestao, type Sugestoes } from '../busca/sugestoes'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { CampoDeBusca } from './CampoDeBusca'

/**
 * O campo de busca com sugestões e buscas recentes (decisão 32). `sugerir` (as consultas) é simulada: aqui se olha só o
 * campo e a lista (combobox ARIA, teclado, toque, recentes). As consultas são testadas em busca/sugestoes.test.ts.
 */
vi.mock('../busca/sugestoes', async (original) => ({ ...(await original<typeof import('../busca/sugestoes')>()), sugerir: vi.fn() }))
vi.mock('../ui/Miniatura', () => ({ Miniatura: ({ caminho }: { caminho: string }) => <img data-testid="miniatura" data-caminho={caminho} alt="" /> }))

const tabela = lerTabelaDeFold(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/fold.json'), 'utf8')))

function sug(categoria: Categoria, ref: string, rotulo: string, extra: Partial<Sugestao> = {}, digitado = 'ib'): Sugestao {
  return {
    chave: `${categoria}:${ref}`,
    categoria,
    alvoTipo: categoria === 'verbetes' ? 'verbete' : categoria === 'objetos' ? 'objeto' : categoria === 'sitios' ? 'sitio' : categoria === 'obras' ? 'obra' : 'colecao',
    ref,
    rotulo,
    trechos: destacar(rotulo, digitado, tabela),
    complemento: null,
    complementoTrechos: [],
    codigo: null,
    codigoTrechos: [],
    id: null,
    miniatura: null,
    skc: false,
    destino: `/${categoria}/${ref}`,
    recente: rotulo,
    ...extra,
  }
}
const respostaIb = (): Sugestoes => ({
  verbetes: [sug('verbetes', 'GL-900006', 'íbex', { id: 'GL-900006', destino: '/verbete/GL-900006' }), sug('verbetes', 'GL-900504', 'íbex de teste', { id: 'GL-900504', destino: '/verbete/GL-900504' })],
  objetos: [
    sug('objetos', 'CA00023', 'Peça de teste', {
      codigo: 'CA00023',
      codigoTrechos: [{ texto: 'CA00023', forte: false }],
      complemento: 'TESTE I: 60 · Tell íbix',
      complementoTrechos: destacar('TESTE I: 60 · Tell íbix', 'ib', tabela),
      miniatura: 'imagens/TESTE/TESTE-0060/thumb-1.webp',
      destino: '/item/CA00023',
      recente: 'CA00023',
    }),
  ],
  sitios: [sug('sitios', 'TESTE-12', 'Tell íbix', { complemento: 'Levante Sul · 1 objeto', complementoTrechos: [{ texto: 'Levante Sul · 1 objeto', forte: false }], destino: '/sitio/TESTE-12' })],
  obras: [sug('obras', 'BIB-1', 'Aterra 1989a', { destino: '/obra/BIB-1' })],
  colecoes: [],
})

function Campo({ aoEnviar = vi.fn(), navegar = vi.fn(), inicial = '', aoMudar = vi.fn() }: { aoEnviar?: (t: string) => void; navegar?: (c: string) => void; inicial?: string; aoMudar?: (t: string) => void }) {
  const [valor, setValor] = useState(inicial)
  return (
    <>
      <button type="button">fora</button>
      <CampoDeBusca
        id="q"
        valor={valor}
        aoMudar={(t) => {
          aoMudar(t)
          setValor(t)
        }}
        aoEnviar={aoEnviar}
        navegar={navegar}
        atalho
      />
    </>
  )
}
const campo = () => screen.getByRole('combobox', { name: 'Buscar' })
const opcoes = () => screen.queryAllByRole('option')
const nomes = () => opcoes().map((o) => o.textContent)

beforeEach(() => {
  localStorage.clear()
  vi.mocked(sugerir).mockReset()
  vi.mocked(sugerir).mockImplementation(async () => respostaIb())
})

describe('CampoDeBusca com sugestões (combobox)', () => {
  it('sem "navegar" continua um campo de busca simples (sem lista, sem recentes)', async () => {
    render(<CampoDeBusca id="q" valor="íb" aoMudar={() => {}} aoEnviar={() => {}} />)
    const c = screen.getByRole('searchbox', { name: 'Buscar' })
    await userEvent.click(c)
    await new Promise((r) => setTimeout(r, 200))
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(sugerir).not.toHaveBeenCalled()
  })

  it('o papel é combobox, ligado à lista: aria-expanded, aria-controls, aria-autocomplete', async () => {
    render(<Campo />)
    expect(campo()).toHaveAttribute('aria-autocomplete', 'list')
    expect(campo()).toHaveAttribute('aria-expanded', 'false')
    expect(campo()).not.toHaveAttribute('aria-controls')
    await userEvent.type(campo(), 'íb')
    const lista = await screen.findByRole('listbox', { name: 'Sugestões para «íb»' })
    expect(campo()).toHaveAttribute('aria-expanded', 'true')
    expect(campo()).toHaveAttribute('aria-controls', lista.id)
    expect(campo()).not.toHaveAttribute('aria-activedescendant')
  })

  it('digitar "íb" mostra as sugestões por categoria, o "Ver todos" e o resumo para o leitor de tela', async () => {
    render(<Campo />)
    await userEvent.type(campo(), 'íb')
    const lista = await screen.findByRole('listbox', { name: 'Sugestões para «íb»' })
    const grupos = within(lista).getAllByRole('group')
    expect(grupos.map((g) => g.getAttribute('aria-label'))).toEqual(['Verbetes', 'Objetos', 'Sítios', 'Obras'])
    expect(within(grupos[0]!).getAllByRole('option')).toHaveLength(2)
    expect(nomes().at(-1)).toMatch(/Ver todos os resultados para «íb»/)
    expect(screen.getByRole('status')).toHaveTextContent('5 sugestões em 4 categorias')
    // o objeto: miniatura, número em fonte de código, origem
    const objeto = within(grupos[1]!).getByRole('option')
    expect(within(objeto).getByTestId('miniatura')).toHaveAttribute('data-caminho', 'imagens/TESTE/TESTE-0060/thumb-1.webp')
    expect(within(objeto).getByText('CA00023')).toHaveClass('codigo')
    expect(objeto).toHaveTextContent('TESTE I: 60')
  })

  it('a parte digitada fica em negrito, com acento ("ib" marca "íb")', async () => {
    render(<Campo />)
    await userEvent.type(campo(), 'ib')
    await screen.findByRole('listbox')
    const primeira = opcoes()[0]!
    const fortes = [...primeira.querySelectorAll('.forte')].map((f) => f.textContent)
    expect(fortes).toEqual(['íb'])
    expect(primeira.textContent).toContain('íbex')
    const segunda = opcoes()[1]!
    expect([...segunda.querySelectorAll('.forte')].map((f) => f.textContent)).toEqual(['íb'])
    // o complemento do objeto também
    const objeto = opcoes()[2]!
    expect([...objeto.querySelectorAll('.sugestao-complemento .forte')].map((f) => f.textContent)).toEqual(['íb'])
  })

  it('tocar (clicar) numa sugestão vai direto ao destino e a põe nas recentes; o foco continua no campo', async () => {
    const navegar = vi.fn()
    render(<Campo navegar={navegar} />)
    await userEvent.type(campo(), 'íb')
    await userEvent.click(await screen.findByRole('option', { name: /íbex de teste/ }))
    expect(navegar).toHaveBeenCalledExactlyOnceWith('/verbete/GL-900504')
    expect(lerRecentes()).toEqual(['íbex de teste'])
    expect(campo()).toHaveFocus()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('o objeto escolhido entra nas recentes pelo número', async () => {
    const navegar = vi.fn()
    render(<Campo navegar={navegar} />)
    await userEvent.type(campo(), 'íb')
    await userEvent.click(await screen.findByRole('option', { name: /CA00023/ }))
    expect(navegar).toHaveBeenCalledWith('/item/CA00023')
    expect(lerRecentes()).toEqual(['CA00023'])
  })

  it('↓ ↑ percorrem as opções (e passam por "nenhuma"): aria-activedescendant e aria-selected', async () => {
    render(<Campo />)
    await userEvent.type(campo(), 'íb')
    await screen.findByRole('listbox')
    const todas = opcoes()
    expect(todas).toHaveLength(6) // 5 sugestões + Ver todos
    await userEvent.keyboard('{ArrowDown}')
    expect(campo()).toHaveAttribute('aria-activedescendant', todas[0]!.id)
    expect(todas[0]).toHaveAttribute('aria-selected', 'true')
    expect(todas[1]).toHaveAttribute('aria-selected', 'false')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(campo()).toHaveAttribute('aria-activedescendant', todas[2]!.id)
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}')
    expect(campo()).not.toHaveAttribute('aria-activedescendant') // voltou a "nenhuma"
    await userEvent.keyboard('{ArrowUp}')
    expect(campo()).toHaveAttribute('aria-activedescendant', todas[5]!.id) // dá a volta: "Ver todos"
    await userEvent.keyboard('{ArrowDown}')
    expect(campo()).not.toHaveAttribute('aria-activedescendant')
    // as setas não movem o cursor do campo
    expect(campo()).toHaveValue('íb')
  })

  it('Enter com uma opção ativa vai ao destino dela; o resto do texto do campo não é enviado', async () => {
    const navegar = vi.fn()
    const aoEnviar = vi.fn()
    render(<Campo navegar={navegar} aoEnviar={aoEnviar} />)
    await userEvent.type(campo(), 'íb')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}')
    expect(navegar).toHaveBeenCalledExactlyOnceWith('/item/CA00023')
    expect(aoEnviar).not.toHaveBeenCalled()
  })

  it('Enter sem seleção vai aos resultados (aoEnviar) e guarda a busca nas recentes', async () => {
    const navegar = vi.fn()
    const aoEnviar = vi.fn()
    render(<Campo navegar={navegar} aoEnviar={aoEnviar} />)
    await userEvent.type(campo(), 'íb')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Enter}')
    expect(aoEnviar).toHaveBeenCalledExactlyOnceWith('íb')
    expect(navegar).not.toHaveBeenCalled()
    expect(lerRecentes()).toEqual(['íb'])
  })

  it('"Ver todos os resultados" (tocar ou ↑ + Enter) vai aos resultados', async () => {
    const aoEnviar = vi.fn()
    render(<Campo aoEnviar={aoEnviar} />)
    await userEvent.type(campo(), 'íb')
    await userEvent.click(await screen.findByRole('option', { name: /Ver todos os resultados/ }))
    expect(aoEnviar).toHaveBeenLastCalledWith('íb')
    await userEvent.click(campo())
    await userEvent.keyboard('{ArrowUp}{Enter}')
    expect(aoEnviar).toHaveBeenCalledTimes(2)
  })

  it('Esc fecha a lista e mantém o texto; Esc de novo limpa; com o campo vazio, sai do campo', async () => {
    render(<Campo />)
    await userEvent.type(campo(), 'íb')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(campo()).toHaveAttribute('aria-expanded', 'false')
    expect(campo()).toHaveValue('íb')
    expect(campo()).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(campo()).toHaveValue('')
    expect(campo()).toHaveFocus()
    await userEvent.keyboard('{Escape}') // sem recentes, a lista nem abriu
    expect(campo()).not.toHaveFocus()
  })

  it('depois do Esc, a seta ou digitar reabre a lista', async () => {
    render(<Campo />)
    await userEvent.type(campo(), 'íb')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await userEvent.keyboard('e')
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
  })

  it('clicar fora fecha a lista; tirar o foco (Tab) também', async () => {
    render(<Campo />)
    await userEvent.type(campo(), 'íb')
    await screen.findByRole('listbox')
    await userEvent.click(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
    await userEvent.click(campo())
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
    await userEvent.tab()
    await userEvent.tab()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('menos de 2 letras: sem lista; sem nenhuma sugestão: sem lista, e o leitor ouve "Nenhuma sugestão"', async () => {
    render(<Campo />)
    await userEvent.type(campo(), 'í')
    await new Promise((r) => setTimeout(r, 250))
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(sugerir).not.toHaveBeenCalled()
    vi.mocked(sugerir).mockImplementation(async () => semSugestoes())
    await userEvent.type(campo(), 'b')
    await waitFor(() => expect(sugerir).toHaveBeenCalled())
    expect(screen.queryByRole('listbox')).toBeNull()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Nenhuma sugestão'))
  })

  it('uma resposta velha não substitui uma nova', async () => {
    const pendentes: { texto: string; resolver: (s: Sugestoes) => void }[] = []
    vi.mocked(sugerir).mockImplementation((texto: string) => new Promise<Sugestoes>((resolver) => pendentes.push({ texto, resolver })))
    render(<Campo />)
    await userEvent.type(campo(), 'ib')
    await waitFor(() => expect(pendentes).toHaveLength(1))
    await userEvent.type(campo(), 'e')
    await waitFor(() => expect(pendentes).toHaveLength(2))
    expect(pendentes.map((p) => p.texto)).toEqual(['ib', 'ibe'])
    // a nova chega primeiro; a velha, depois
    await act(async () => pendentes[1]!.resolver({ ...semSugestoes(), verbetes: [sug('verbetes', 'GL-2', 'íbex novo', {}, 'ibe')] }))
    expect(await screen.findByRole('option', { name: /íbex novo/ })).toBeInTheDocument()
    await act(async () => pendentes[0]!.resolver({ ...semSugestoes(), verbetes: [sug('verbetes', 'GL-1', 'resposta velha')] }))
    expect(screen.queryByRole('option', { name: /resposta velha/ })).toBeNull()
    expect(screen.getByRole('option', { name: /íbex novo/ })).toBeInTheDocument()
  })

  it('espera ~120 ms: digitar rápido faz uma consulta só, do texto final', async () => {
    render(<Campo />)
    await userEvent.type(campo(), 'ibex', { delay: 10 })
    await screen.findByRole('listbox')
    expect(vi.mocked(sugerir).mock.calls.map((c) => c[0])).toEqual(['ibex'])
  })
})

describe('a lista que ainda é do texto anterior (corrida entre digitar e responder)', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  async function digitarComRelogioFalso() {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    // O Testing Library só avança os relógios falsos se achar um `jest` global (no vitest não há).
    vi.stubGlobal('jest', { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) })
    const usuario = userEvent.setup({ delay: null })
    const navegar = vi.fn()
    const aoEnviar = vi.fn()
    render(<Campo navegar={navegar} aoEnviar={aoEnviar} />)
    await usuario.type(campo(), 'mah')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(130) // a espera de 120 ms + a resposta
    })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    return { usuario, navegar, aoEnviar }
  }

  it('↓ e depois mais uma letra: Enter dentro da espera vai aos resultados do texto de agora, não à opção velha', async () => {
    const { usuario, navegar, aoEnviar } = await digitarComRelogioFalso()
    await usuario.keyboard('{ArrowDown}')
    expect(campo()).toHaveAttribute('aria-activedescendant')
    await usuario.type(campo(), 't') // a lista de "mah" ainda está na tela; a de "maht" ainda não chegou
    expect(campo()).not.toHaveAttribute('aria-activedescendant')
    await usuario.keyboard('{Enter}')
    expect(navegar).not.toHaveBeenCalled()
    expect(aoEnviar).toHaveBeenCalledExactlyOnceWith('maht')
  })

  it('enquanto a lista é velha, ↓ e ↑ não escolhem opção; quando a nova chega, voltam a valer', async () => {
    const { usuario } = await digitarComRelogioFalso()
    await usuario.type(campo(), 'r')
    await usuario.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}')
    expect(campo()).not.toHaveAttribute('aria-activedescendant')
    expect(opcoes().every((o) => o.getAttribute('aria-selected') === 'false')).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(130)
    })
    await usuario.keyboard('{ArrowDown}')
    expect(campo()).toHaveAttribute('aria-activedescendant', opcoes()[0]!.id)
  })

  it('digitar zera a opção ativa na hora', async () => {
    const { usuario } = await digitarComRelogioFalso()
    await usuario.keyboard('{ArrowDown}{ArrowDown}')
    expect(campo()).toHaveAttribute('aria-activedescendant')
    await usuario.type(campo(), 'r')
    expect(campo()).not.toHaveAttribute('aria-activedescendant')
  })
})

describe('método de entrada (IME): Enter e Esc que confirmam ou cancelam a composição não valem', () => {
  const composicoes: [string, KeyboardEventInit][] = [
    ['isComposing', { isComposing: true }],
    ['keyCode 229', { keyCode: 229 }],
  ]

  it.each(composicoes)('Enter durante a composição (%s) não abre a opção ativa nem envia', async (_nome, init) => {
    const navegar = vi.fn()
    const aoEnviar = vi.fn()
    render(<Campo navegar={navegar} aoEnviar={aoEnviar} />)
    await userEvent.type(campo(), 'íb')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{ArrowDown}')
    const ativa = campo().getAttribute('aria-activedescendant')
    expect(ativa).not.toBeNull()
    fireEvent.keyDown(campo(), { key: 'Enter', ...init })
    expect(navegar).not.toHaveBeenCalled()
    expect(aoEnviar).not.toHaveBeenCalled()
    expect(campo()).toHaveAttribute('aria-activedescendant', ativa!)
    expect(lerRecentes()).toEqual([])
  })

  it.each(composicoes)('Esc durante a composição (%s) não fecha a lista nem limpa o texto', async (_nome, init) => {
    render(<Campo />)
    await userEvent.type(campo(), 'íb')
    await screen.findByRole('listbox')
    fireEvent.keyDown(campo(), { key: 'Escape', ...init })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(campo()).toHaveValue('íb')
  })

  it.each(composicoes)('Esc durante a composição (%s) num campo sem sugestões também não limpa', (_nome, init) => {
    const mudar = vi.fn()
    render(<CampoDeBusca id="q" valor="íb" aoMudar={mudar} aoEnviar={() => {}} />)
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Buscar' }), { key: 'Escape', ...init })
    expect(mudar).not.toHaveBeenCalled()
  })
})

describe('no celular, o teclado e a altura da lista', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'visualViewport')
  afterEach(() => {
    if (original) Object.defineProperty(window, 'visualViewport', original)
    else delete (window as unknown as Record<string, unknown>).visualViewport
    document.body.style.paddingBottom = ''
    vi.restoreAllMocks()
  })
  const viewport = (height: number, offsetTop = 0) => {
    const ouvintes = new Map<string, Set<() => void>>()
    const vv = {
      height,
      offsetTop,
      addEventListener: (n: string, f: () => void) => ouvintes.set(n, (ouvintes.get(n) ?? new Set()).add(f)),
      removeEventListener: (n: string, f: () => void) => ouvintes.get(n)?.delete(f),
      emitir: (n: string) => ouvintes.get(n)?.forEach((f) => f()),
    }
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
    return vv
  }
  const altura = () => (document.querySelector('.sugestoes') as HTMLElement).style.getPropertyValue('--sugestoes-altura')

  it('a lista não passa da parte visível: o que sobra da altura visível abaixo do campo (já no topo), e acompanha o teclado', async () => {
    const vv = viewport(500)
    Element.prototype.scrollIntoView = vi.fn()
    vi.spyOn(HTMLFormElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 400, bottom: 470, height: 70 } as DOMRect)
    render(<Campo />)
    await userEvent.type(campo(), 'íb')
    await screen.findByRole('listbox')
    // o campo vai ao topo (12 px) e ocupa 70: sobram 500 - 82 - 12 de folga = 406
    await waitFor(() => expect(altura()).toBe('406px'))
    // o teclado fecha: a janela visível cresce
    vv.height = 800
    act(() => vv.emitir('resize'))
    expect(altura()).toBe('706px')
    delete (Element.prototype as unknown as Record<string, unknown>).scrollIntoView
  })

  it('com a lista aberta a página ganha espaço no fim (para o campo poder subir até o topo); ao fechar, volta', async () => {
    viewport(500)
    document.body.style.paddingBottom = '3px'
    render(<Campo />)
    await userEvent.type(campo(), 'íb')
    await screen.findByRole('listbox')
    // O espaço vem do efeito depois de a lista abrir (sob carga, um pouco depois do listbox).
    await waitFor(() => expect(document.body.style.paddingBottom).toBe('500px'))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(document.body.style.paddingBottom).toBe('3px'))
  })
})

describe('T17-B-30: o espaço no fim da página no celular não pula nem fica preso', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'visualViewport')
  afterEach(() => {
    if (original) Object.defineProperty(window, 'visualViewport', original)
    else delete (window as unknown as Record<string, unknown>).visualViewport
    document.body.style.paddingBottom = ''
    instalarMatchMedia(375)
  })

  it('digitar algo sem sugestão não tira o espaço (a página não pula com o teclado ainda aberto); Esc o devolve', async () => {
    Object.defineProperty(window, 'visualViewport', { value: { height: 500, offsetTop: 0, addEventListener() {}, removeEventListener() {} }, configurable: true })
    document.body.style.paddingBottom = '3px'
    render(<Campo />)
    await userEvent.type(campo(), 'íb')
    await screen.findByRole('listbox')
    await waitFor(() => expect(document.body.style.paddingBottom).toBe('500px'))
    await userEvent.clear(campo())
    await userEvent.type(campo(), 'zzzzqx') // nada casa: a lista some, o teclado continua
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(document.body.style.paddingBottom).toBe('500px')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(document.body.style.paddingBottom).toBe('3px'))
  })

  it('girar para a largura do computador com a lista aberta devolve o espaço', async () => {
    const largura = instalarMatchMedia(375)
    Object.defineProperty(window, 'visualViewport', { value: { height: 500, offsetTop: 0, addEventListener() {}, removeEventListener() {} }, configurable: true })
    document.body.style.paddingBottom = '3px'
    render(<Campo />)
    await userEvent.type(campo(), 'íb')
    await screen.findByRole('listbox')
    await waitFor(() => expect(document.body.style.paddingBottom).toBe('500px'))
    act(() => largura(1024))
    await waitFor(() => expect(document.body.style.paddingBottom).toBe('3px'))
  })
})

describe('no celular, com o campo longe do topo (o Início)', () => {
  let rolar: ReturnType<typeof vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>>
  let posicao: ReturnType<typeof vi.spyOn<HTMLFormElement, 'getBoundingClientRect'>>
  beforeEach(() => {
    rolar = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>()
    Element.prototype.scrollIntoView = rolar
    posicao = vi.spyOn(HTMLFormElement.prototype, 'getBoundingClientRect')
  })
  // Mesmo se uma espera falhar, o jsdom volta ao normal para os testes seguintes.
  afterEach(() => {
    posicao.mockRestore()
    // @ts-expect-error volta ao jsdom, que não tem scrollIntoView
    delete Element.prototype.scrollIntoView
  })

  it('ao abrir a lista, leva o campo ao topo; com o campo já no alto, não mexe na rolagem', async () => {
    posicao.mockReturnValue({ top: 460 } as DOMRect)
    const semLista = document.body.style.paddingBottom
    render(<Campo />)
    await userEvent.type(campo(), 'íb')
    await screen.findByRole('listbox')
    // A rolagem vem do efeito depois de a lista abrir (sob carga, um pouco depois do listbox).
    await waitFor(() => expect(rolar).toHaveBeenCalledExactlyOnceWith({ block: 'start' }))
    await userEvent.clear(campo())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(document.body.style.paddingBottom).toBe(semLista))
    rolar.mockClear()
    posicao.mockReturnValue({ top: 70 } as DOMRect)
    await userEvent.type(campo(), 'íb')
    await screen.findByRole('listbox')
    // O mesmo efeito que rolaria já rodou quando o espaço do fim da página aparece: só então a ausência prova algo.
    await waitFor(() => expect(document.body.style.paddingBottom).not.toBe(semLista))
    expect(rolar).not.toHaveBeenCalled()
  })
})

describe('buscas recentes', () => {
  beforeEach(() => {
    for (const r of ['Aterra', 'leão', 'CA00023', 'Mepido', 'íbex']) adicionarRecente(r)
  })

  it('campo vazio em foco mostra as recentes (a mais nova primeiro), com o aviso de que ficam só neste aparelho', async () => {
    render(<Campo />)
    expect(screen.queryByRole('listbox')).toBeNull()
    await userEvent.click(campo())
    const lista = await screen.findByRole('listbox', { name: 'Buscas recentes' })
    expect(within(lista).getAllByRole('option').map((o) => o.textContent)).toEqual(['íbex', 'Mepido', 'CA00023', 'leão', 'Aterra'])
    expect(screen.getByText(/ficam só neste aparelho/)).toBeInTheDocument()
    expect(within(lista).getByText('CA00023')).toHaveClass('codigo')
    expect(screen.getByRole('status')).toHaveTextContent('5 buscas recentes')
    expect(sugerir).not.toHaveBeenCalled()
  })

  it('só aparecem com o campo vazio: com texto, as sugestões substituem a lista', async () => {
    render(<Campo />)
    await userEvent.click(campo())
    await screen.findByRole('listbox', { name: 'Buscas recentes' })
    await userEvent.type(campo(), 'íb')
    await screen.findByRole('listbox', { name: 'Sugestões para «íb»' })
    expect(screen.queryByRole('listbox', { name: 'Buscas recentes' })).toBeNull()
  })

  it('sem recentes, o campo vazio em foco não abre nada', async () => {
    localStorage.clear()
    render(<Campo />)
    await userEvent.click(campo())
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('tocar numa recente faz a busca (campo e envio) e a sobe ao topo', async () => {
    const aoEnviar = vi.fn()
    const aoMudar = vi.fn()
    render(<Campo aoEnviar={aoEnviar} aoMudar={aoMudar} />)
    await userEvent.click(campo())
    await userEvent.click(await screen.findByRole('option', { name: 'leão' }))
    expect(aoMudar).toHaveBeenCalledWith('leão')
    expect(aoEnviar).toHaveBeenCalledExactlyOnceWith('leão')
    expect(lerRecentes()[0]).toBe('leão')
    expect(campo()).toHaveValue('leão')
  })

  it('o × remove só aquela; "Limpar" remove todas', async () => {
    render(<Campo />)
    await userEvent.click(campo())
    await screen.findByRole('listbox')
    await userEvent.click(screen.getByRole('button', { name: 'Remover «Mepido» das buscas recentes' }))
    expect(lerRecentes()).toEqual(['íbex', 'CA00023', 'leão', 'Aterra'])
    expect(opcoes().map((o) => o.textContent)).toEqual(['íbex', 'CA00023', 'leão', 'Aterra'])
    expect(campo()).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Limpar' }))
    expect(lerRecentes()).toEqual([])
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('↑↓ Enter funcionam nas recentes; Shift+Delete remove a ativa', async () => {
    const aoEnviar = vi.fn()
    render(<Campo aoEnviar={aoEnviar} />)
    await userEvent.click(campo())
    await screen.findByRole('listbox')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(campo()).toHaveAttribute('aria-activedescendant', opcoes()[1]!.id)
    await userEvent.keyboard('{Shift>}{Delete}{/Shift}')
    expect(lerRecentes()).toEqual(['íbex', 'CA00023', 'leão', 'Aterra'])
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(aoEnviar).toHaveBeenCalledExactlyOnceWith('íbex')
  })

  it('Esc fecha as recentes; Esc de novo sai do campo (vazio)', async () => {
    render(<Campo />)
    await userEvent.click(campo())
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(campo()).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(campo()).not.toHaveFocus()
  })

  it('guarda no máximo 8, sem repetir (enviar a mesma busca sobe ao topo)', async () => {
    localStorage.clear()
    for (let i = 1; i <= 9; i++) adicionarRecente(`busca ${i}`)
    const aoEnviar = vi.fn()
    render(<Campo aoEnviar={aoEnviar} />)
    await userEvent.type(campo(), 'BUSCA 5{Enter}')
    const guardadas = lerRecentes()
    expect(guardadas).toHaveLength(LIMITE_DE_RECENTES)
    expect(guardadas.filter((x) => x.toLowerCase() === 'busca 5')).toEqual(['BUSCA 5'])
    expect(guardadas[0]).toBe('BUSCA 5')
  })

  it('"Limpar a busca" (o × do campo) esvazia e mostra as recentes de novo', async () => {
    render(<Campo inicial="íb" />)
    await userEvent.click(campo())
    await screen.findByRole('listbox', { name: /Sugestões/ })
    fireEvent.click(screen.getByRole('button', { name: 'Limpar a busca' }))
    expect(campo()).toHaveValue('')
    expect(await screen.findByRole('listbox', { name: 'Buscas recentes' })).toBeInTheDocument()
  })
})
