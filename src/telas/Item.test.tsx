import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { estadoDoGrupo } from '../app/origem'
import { executar, usarMotor } from '../banco/cliente'
import { grupo } from '../banco/consultas'
import type { EstadoVindoDaBusca } from '../busca/url'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Item } from './Item'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

function Destino() {
  const { pathname, search, state } = useLocation()
  return <pre data-testid="destino">{JSON.stringify({ pathname, search, state })}</pre>
}

function abrir(caminho: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: caminho.split('?')[0]!, search: caminho.includes('?') ? `?${caminho.split('?')[1]}` : '', state }]}>
      <Routes>
        <Route path="/item/:numero" element={<Item />} />
        <Route path="*" element={<Destino />} />
      </Routes>
      <Local />
    </MemoryRouter>,
  )
}
/** O endereço atual, para conferir redirecionamentos e o `?hipotese=`. */
function Local() {
  const { pathname, search, state } = useLocation()
  return <output data-testid="local" data-state={JSON.stringify(state ?? null)}>{`${pathname}${search}`}</output>
}
const local = () => screen.getByTestId('local').textContent
const leituras = () => screen.getByRole('region', { name: 'Leituras' })
const titulo = async () => screen.findByRole('heading', { level: 1 })

describe('Item', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterAll(() => usarMotor(null))
  afterEach(() => instalarMatchMedia(375))

  describe('cabeçalho, ficha e leituras', () => {
    it('o número fica no topo, com a origem em rótulo pequeno; depois a ficha curta e a imagem', async () => {
      abrir('/item/CA00001')
      expect(await titulo()).toHaveTextContent('Pingente com leão-de-teste. Pedra de teste.')
      const cabeca = screen.getByTestId('item-cabeca')
      expect(within(cabeca).getByText('CA00001')).toHaveClass('item-numero')
      expect(within(cabeca).getByText('TESTE I, 1')).toHaveClass('item-origem')
      const ficha = screen.getByRole('group', { name: 'Ficha' })
      expect(within(ficha).getByRole('link', { name: 'Maḥraṣ Teste' })).toHaveAttribute('href', '/sitio/TESTE-1')
      expect(ficha).toHaveTextContent('Calcolítico inicial de teste (4500–4000 aEC)')
      expect(ficha).toHaveTextContent('Musterstadt, Testmuseum, Inv. T-0001')
      expect(ficha).toHaveTextContent('H 4,2; B 3,1')
      // ordem no documento: cabeça, ficha, imagem, leituras
      const ordem = [cabeca, ficha, screen.getByRole('region', { name: 'Imagem' }), leituras()]
      for (let i = 1; i < ordem.length; i++) expect(ordem[i - 1]!.compareDocumentPosition(ordem[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('uma Leitura por publicação que tem o objeto (sem vagas vazias)', async () => {
      abrir('/item/CA00001')
      await titulo()
      expect(within(leituras()).getAllByTestId('leitura-fonte')).toHaveLength(1)
      expect(screen.queryByText(/Sem leitura deste objeto/)).toBeNull()
    })

    it('a imagem traço aparece invertida no item; tocar mostra o original', async () => {
      abrir('/item/CA00001')
      await titulo()
      await waitFor(() => expect(document.querySelector('.imagem-item-figura img')).toHaveStyle({ filter: 'invert(1)' }))
      await userEvent.click(screen.getByRole('button', { name: 'Mostrar o original' }))
      expect(document.querySelector<HTMLImageElement>('.imagem-item-figura img')!.style.filter).toBe('')
    })

    it('os links de termo levam ao verbete', async () => {
      abrir('/item/CA00001')
      await titulo()
      expect(within(leituras()).getByRole('link', { name: 'gravação de teste' })).toHaveAttribute('href', '/verbete/GL-900006')
    })

    it('Foco 4 no item real: com 𓀀 antes, a âncora marca exatamente "leão-de-teste"', async () => {
      abrir('/item/CA00002')
      await titulo()
      const ancora = within(leituras()).getByRole('link', { name: /^leão-de-teste/ })
      expect(within(ancora).getByText('leão-de-teste')).toHaveClass('termo-marcado')
      expect(ancora.firstChild!.textContent).toBe('leão-de-teste')
    })

    it('nenhum ícone de ação de escrita (nota, coleção, comparar, nova hipótese, trocar sítio) na 2A', async () => {
      abrir('/item/CA00001')
      await titulo()
      for (const nome of [/nota/i, /coleç/i, /compar/i, /registrar hipótese|nova hipótese/i, /trocar o sítio/i]) {
        expect(screen.queryByRole('link', { name: nome })).toBeNull()
        expect(screen.queryByRole('button', { name: nome })).toBeNull()
      }
    })

    it('o id do item na URL troca (replace) pelo número do objeto, mantendo o estado', async () => {
      const estado = estadoDoGrupo('GR-TESTE-I-01', 'Grupo', '/grupo/GR-TESTE-I-01')
      abrir('/item/TESTE-0002', estado)
      await waitFor(() => expect(local()).toBe('/item/CA00002'))
      expect(JSON.parse(screen.getByTestId('local').dataset.state!)).toEqual(estado)
      expect(await titulo()).toHaveTextContent('Placa de prova')
    })

    it('número que não existe: aviso e caminho de volta', async () => {
      abrir('/item/XX99999')
      expect(await screen.findByText('Objeto não encontrado.')).toBeInTheDocument()
    })
  })

  describe('anterior / próximo e Voltar', () => {
    it('"← 2 / 3 →" vem do contexto do grupo, e o Voltar leva ao grupo de origem', async () => {
      const g = (await grupo('GR-TESTE-I-01'))!
      const estado = estadoDoGrupo(g.id, g.titulo, '/grupo/GR-TESTE-I-01')
      abrir('/item/CA00002', estado)
      const nav = await screen.findByRole('navigation', { name: 'Posição no grupo' })
      expect(await within(nav).findByText('2 / 3')).toBeInTheDocument()
      expect(within(nav).getByRole('link', { name: g.titulo })).toHaveAttribute('href', '/grupo/GR-TESTE-I-01')
      expect(within(nav).getByRole('link', { name: 'Anterior: CA00001' })).toHaveAttribute('href', '/item/CA00001')
      expect(within(nav).getByRole('link', { name: 'Próximo: CA00003' })).toHaveAttribute('href', '/item/CA00003')
      expect(screen.getByRole('link', { name: 'Voltar ao grupo' })).toHaveAttribute('href', '#/grupo/GR-TESTE-I-01')
      // o próximo leva o mesmo contexto
      await userEvent.click(within(nav).getByRole('link', { name: 'Próximo: CA00003' }))
      await waitFor(() => expect(local()).toBe('/item/CA00003'))
      expect(JSON.parse(screen.getByTestId('local').dataset.state!)).toEqual(estado)
      expect(await within(await screen.findByRole('navigation', { name: 'Posição no grupo' })).findByText('3 / 3')).toBeInTheDocument()
    })

    it('sem estado, o contexto é o primeiro grupo do objeto', async () => {
      const g = (await grupo('GR-TESTE-I-01'))!
      abrir('/item/CA00001')
      const nav = await screen.findByRole('navigation', { name: 'Posição no grupo' })
      expect(await within(nav).findByText('1 / 3')).toBeInTheDocument()
      expect(within(nav).getByRole('link', { name: g.titulo })).toHaveAttribute('href', '/grupo/GR-TESTE-I-01')
      expect(within(nav).queryByRole('link', { name: /^Anterior/ })).toBeNull()
      expect(screen.getByRole('link', { name: 'Voltar ao grupo' })).toHaveAttribute('href', '#/grupo/GR-TESTE-I-01')
    })

    it('da busca: a posição é início + posição na janela, de total; Voltar volta à busca', async () => {
      const estado: EstadoVindoDaBusca = {
        contexto: { tipo: 'lista', ids: ['CA00003', 'CA00001'] },
        inicio: 10,
        total: 40,
        origem: { rotulo: 'Busca', caminho: '/busca?q=teste' },
      }
      abrir('/item/CA00001', estado)
      const nav = await screen.findByRole('navigation', { name: 'Posição na busca' })
      expect(await within(nav).findByText('12 / 40')).toBeInTheDocument()
      expect(within(nav).getByRole('link', { name: 'Busca' })).toHaveAttribute('href', '/busca?q=teste')
      expect(within(nav).getByRole('link', { name: 'Anterior: CA00003' })).toHaveAttribute('href', '/item/CA00003')
      expect(screen.getByRole('link', { name: 'Voltar à busca' })).toHaveAttribute('href', '#/busca?q=teste')
      await userEvent.click(within(nav).getByRole('link', { name: 'Anterior: CA00003' }))
      await waitFor(() => expect(local()).toBe('/item/CA00003'))
      expect(JSON.parse(screen.getByTestId('local').dataset.state!)).toEqual(estado)
    })

    it('← e → (fora de campo de texto) andam no contexto', async () => {
      abrir('/item/CA00002', estadoDoGrupo('GR-TESTE-I-01', 'G', '/grupo/GR-TESTE-I-01'))
      await screen.findByText('2 / 3')
      fireEvent.keyDown(document.body, { key: 'ArrowRight' })
      await waitFor(() => expect(local()).toBe('/item/CA00003'))
      await screen.findByText('3 / 3')
      fireEvent.keyDown(document.body, { key: 'ArrowLeft' })
      await waitFor(() => expect(local()).toBe('/item/CA00002'))
    })
  })

  describe('hipóteses', () => {
    it('uma hipótese sem âncora (termo_ausente) aparece só em "Hipóteses por nível"', async () => {
      abrir('/item/CA00002')
      await titulo()
      expect(leituras().querySelector('[data-hipotese="HY-900004"]')).toBeNull()
      expect(leituras().querySelector('[data-hipotese="HY-900003"]')).not.toBeNull()
      const botao = screen.getByRole('button', { name: /Hipóteses por nível/ })
      expect(botao).toHaveAttribute('aria-expanded', 'false')
      expect(botao).toHaveTextContent('2')
      await userEvent.click(botao)
      const secao = screen.getByRole('region', { name: 'Hipóteses por nível' })
      const linha = within(secao).getByRole('link', { name: /estrela de prova/ })
      expect(linha).toHaveTextContent('sem trecho no texto PT')
      expect(linha).toHaveTextContent('possível')
      expect(within(secao).getByRole('heading', { name: 'Iconológico · 1' })).toBeInTheDocument()
    })

    it('H mostra e esconde todas as hipóteses por nível (e rola até a seção, num efeito)', async () => {
      abrir('/item/CA00002')
      await titulo()
      vi.mocked(Element.prototype.scrollIntoView).mockClear()
      fireEvent.keyDown(document.body, { key: 'h' })
      expect(screen.getByRole('region', { name: 'Hipóteses por nível' })).toBeInTheDocument()
      await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled())
      expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts.at(-1)).toBe(document.getElementById('secao-hipoteses'))
      expect(screen.getByRole('button', { name: 'Ver todas as hipóteses por nível' })).toHaveAttribute('aria-expanded', 'true')
      fireEvent.keyDown(document.body, { key: 'H' })
      expect(screen.queryByRole('region', { name: 'Hipóteses por nível' })).toBeNull()
    })

    it('tocar na âncora abre a folha da hipótese (celular): modal, Esc fecha e o foco volta', async () => {
      abrir('/item/CA00002')
      await titulo()
      const ancora = within(leituras()).getByRole('link', { name: /^leão-de-teste/ })
      await userEvent.click(ancora)
      expect(local()).toBe('/item/CA00002?hipotese=HY-900003')
      const folha = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
      expect(folha).toHaveAttribute('aria-modal', 'true')
      expect(folha).toHaveClass('painel-hipotese-folha')
      expect(within(folha).getByText('Iconográfico · provável')).toBeInTheDocument()
      expect(within(folha).getByRole('heading', { level: 2, name: 'leão-de-teste' })).toBeInTheDocument()
      expect(within(folha).getByText('»Testlöwen mit erhobenem Schwanz«')).toHaveAttribute('lang', 'de')
      expect(within(folha).getByRole('link', { name: 'Abrir verbete' })).toHaveAttribute('href', '/verbete/GL-900001')
      expect(within(folha).getByRole('link', { name: 'Filtrar a busca por este termo' })).toHaveAttribute('href', '/busca?q=le%C3%A3o-de-teste&escopo=termo')
      expect(folha.contains(document.activeElement)).toBe(true)
      expect(ancora).toHaveClass('ancora-ativa')
      // o foco não sai da folha
      const focaveis = [...folha.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')]
      focaveis[focaveis.length - 1]!.focus()
      await userEvent.tab()
      expect(folha.contains(document.activeElement)).toBe(true)
      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(local()).toBe('/item/CA00002')
      expect(document.activeElement).toBe(within(leituras()).getByRole('link', { name: /^leão-de-teste/ }))
    })

    it('com a folha aberta, L e H não agem (as teclas são da folha)', async () => {
      abrir('/item/CA00002?hipotese=HY-900003')
      await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
      fireEvent.keyDown(document.body, { key: 'l' })
      expect(screen.queryByText(/Auf der Rückseite/)).toBeNull()
    })

    it('a hipótese sem âncora abre pela lista por nível', async () => {
      abrir('/item/CA00002')
      await titulo()
      await userEvent.click(screen.getByRole('button', { name: /Hipóteses por nível/ }))
      await userEvent.click(within(screen.getByRole('region', { name: 'Hipóteses por nível' })).getByRole('link', { name: /estrela de prova/ }))
      const folha = await screen.findByRole('dialog', { name: 'Hipótese estrela de prova' })
      expect(within(folha).getByText('Iconológico · possível')).toBeInTheDocument()
      expect(within(folha).getByText(/sem trecho no texto PT/)).toBeInTheDocument()
    })

    it('no computador, painel lateral de 380 px, não modal, terceira coluna da grade (nunca sobre a imagem)', async () => {
      instalarMatchMedia(1280)
      abrir('/item/CA00002?hipotese=HY-900003')
      const painel = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
      expect(painel).toHaveClass('painel-hipotese-lateral')
      expect(painel).not.toHaveAttribute('aria-modal', 'true')
      const imagem = screen.getByRole('region', { name: 'Imagem' })
      expect(imagem.contains(painel)).toBe(false)
      // filho direto da grade do item (terceira coluna a partir de 1160 px; por cima da leitura abaixo disso)
      const grade = document.querySelector('.item-pc')!
      expect(painel.parentElement).toBe(grade)
      expect(grade).toHaveClass('item-pc-com-painel')
      expect(screen.getByTestId('item-leitura-coluna').contains(painel)).toBe(false)
      // a barra H/L continua na tela
      expect(screen.getByRole('toolbar', { name: 'Ações do item' })).toBeInTheDocument()
      // L ainda funciona com o painel lateral aberto
      fireEvent.keyDown(document.body, { key: 'l' })
      expect(within(leituras()).getByText(/Auf der Rückseite/)).toHaveAttribute('lang', 'de')
      await userEvent.click(within(painel).getByRole('button', { name: 'Fechar o painel' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(document.querySelector('.item-pc')).not.toHaveClass('item-pc-com-painel')
    })

    it('o painel oferece o verbete de cada termo marcado no trecho', async () => {
      abrir('/item/CA00002?hipotese=HY-900003')
      const folha = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
      expect(within(folha).getByRole('link', { name: 'Abrir verbete' })).toHaveAttribute('href', '/verbete/GL-900001')
    })

    it('a região do elemento da hipótese aberta acende na imagem', async () => {
      abrir('/item/CA00003?hipotese=HY-900005')
      const folha = await screen.findByRole('dialog', { name: 'Hipótese figura denteada' })
      await waitFor(() => expect(document.querySelector('.imagem-item-regioes polygon')).not.toBeNull())
      expect(within(folha).getByText(/acesa na imagem/)).toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(document.querySelector('.imagem-item-regioes polygon')).toBeNull())
    })

    it('[ e ] andam pelas hipóteses na ordem do texto', async () => {
      abrir('/item/CA00003?hipotese=HY-900005')
      const folha = await screen.findByRole('dialog', { name: 'Hipótese figura denteada' })
      expect(within(folha).getByText('1 / 2 no texto')).toBeInTheDocument()
      await userEvent.click(within(folha).getByRole('button', { name: 'Hipótese seguinte no texto' }))
      await waitFor(() => expect(local()).toBe('/item/CA00003?hipotese=HY-900007'))
      expect(await screen.findByRole('dialog', { name: 'Hipótese olho em forma de botão' })).toBeInTheDocument()
    })
  })

  describe('PT / DE', () => {
    it('L mostra o original alemão (sem termos nem âncoras) e volta', async () => {
      abrir('/item/CA00001')
      await titulo()
      const botao = screen.getByRole('button', { name: 'Mostrar o original alemão' })
      expect(botao).toHaveAttribute('aria-pressed', 'false')
      fireEvent.keyDown(document.body, { key: 'L' })
      expect(within(leituras()).getByText(/Der Probeanhänger zeigt/)).toHaveAttribute('lang', 'de')
      expect(within(leituras()).queryByRole('link')).toBeNull()
      expect(botao).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(botao)
      expect(within(leituras()).getByRole('link', { name: 'gravação de teste' })).toBeInTheDocument()
    })

    it('"g l" é ir ao Glossário, não trocar o idioma', async () => {
      abrir('/item/CA00001')
      await titulo()
      fireEvent.keyDown(document.body, { key: 'g' })
      fireEvent.keyDown(document.body, { key: 'l' })
      expect(screen.getByRole('button', { name: 'Mostrar o original alemão' })).toHaveAttribute('aria-pressed', 'false')
      fireEvent.keyDown(document.body, { key: 'l' })
      expect(screen.getByRole('button', { name: 'Mostrar o original alemão' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('depois de "g", só as letras de atalho de ir são engolidas: setas e H continuam do item (correção 5)', async () => {
      abrir('/item/CA00002', estadoDoGrupo('GR-TESTE-I-01', 'G', '/grupo/GR-TESTE-I-01'))
      await screen.findByText('2 / 3')
      fireEvent.keyDown(document.body, { key: 'g' })
      fireEvent.keyDown(document.body, { key: 'h' })
      expect(screen.getByRole('region', { name: 'Hipóteses por nível' })).toBeInTheDocument()
      fireEvent.keyDown(document.body, { key: 'g' })
      fireEvent.keyDown(document.body, { key: 'ArrowRight' })
      await waitFor(() => expect(local()).toBe('/item/CA00003'))
    })

    it('L dentro de um campo de texto não troca', async () => {
      abrir('/item/CA00001')
      await titulo()
      const campo = document.createElement('input')
      document.body.append(campo)
      fireEvent.keyDown(campo, { key: 'l' })
      expect(screen.getByRole('button', { name: 'Mostrar o original alemão' })).toHaveAttribute('aria-pressed', 'false')
      campo.remove()
    })
  })

  describe('seções recolhíveis', () => {
    it('Catálogo, Paralelos e relações e Bibliografia abrem e fecham', async () => {
      abrir('/item/CA00001')
      await titulo()
      for (const nome of ['Catálogo', 'Paralelos e relações', 'Bibliografia']) {
        const botao = screen.getByRole('button', { name: new RegExp(`^${nome}`) })
        expect(botao).toHaveAttribute('aria-expanded', 'false')
        await userEvent.click(botao)
        expect(botao).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('region', { name: nome })).toBeInTheDocument()
      }
      const relacoes = screen.getByRole('region', { name: 'Paralelos e relações' })
      expect(within(relacoes).getByRole('link', { name: 'CA00002' })).toHaveAttribute('href', '/item/CA00002')
      expect(relacoes).toHaveTextContent('Autor 1999: 14 Nr. 5')
      const bib = screen.getByRole('region', { name: 'Bibliografia' })
      expect(within(bib).getAllByRole('link', { name: /Autor 1999/ })[0]).toHaveAttribute('href', '/obra/BIB-900001')
      expect(within(bib).getAllByText('Achados de teste no vale de prova')[0]!.tagName).toBe('I')
      const cat = screen.getByRole('region', { name: 'Catálogo' })
      expect(cat).toHaveTextContent('Escavação de teste de 1999')
    })
  })
})

describe('Item: links do texto achados na hora (R14)', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    await executar("UPDATE pub_TESTE.unit_pt_render SET texto = texto || ' Ver Autor 1999: 12 Nr. 3.' WHERE unit_id = 'PA-TESTE-0001-cat-1'")
    await executar("INSERT INTO pub_TESTE.passage_item VALUES ('PA-TESTE-0001-cat-1', 'TESTE-0002', 'mentions')")
  })
  afterAll(() => usarMotor(null))

  it('a citação leva à obra e o número a outro item', async () => {
    abrir('/item/CA00001')
    await titulo()
    expect(within(leituras()).getByRole('link', { name: 'Autor 1999: 12 Nr. 3, na bibliografia' })).toHaveAttribute('href', '/obra/BIB-900001')
    const numero = within(leituras()).getByRole('link', { name: 'Abrir CA00002, TESTE I, 2' })
    expect(numero).toHaveAttribute('href', '/item/CA00002')
    expect(numero).toHaveTextContent(/^2$/)
    await act(async () => {
      await userEvent.click(numero)
    })
    await waitFor(() => expect(local()).toBe('/item/CA00002'))
  })
})
