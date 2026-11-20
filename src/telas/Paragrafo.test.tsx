/**
 * Etapa 4, Tarefa 25: a página do § (tela 2 aprovada; decisão 91, a4, a5 e a8; decisão 85), sobre o pacote sintético: o
 * TESTEG (o modelo do GGG) e o TESTEGEN (o do GGIG). O § 2 tem dois trechos, a nota 2, duas correções de leitura no primeiro
 * trecho (Maḥteṣ, lido «Mahtes»; Pl., lido «PI.») e cita as figuras 1a (F200001) e 1b (CA00004). Tudo inventado.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { ROTAS } from '../app/routes'
import { executar, usarMotor } from '../banco/cliente'
import { ROTA_DO_PARAGRAFO } from '../banco/paragrafos'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { esquecerAbaDoCelular, Paragrafo } from './Paragrafo'
import { esquecerLinguasDaMemoria } from './textoDoParagrafo'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

/** O endereço e o estado de agora. */
function Local() {
  const { pathname, state } = useLocation()
  return <output data-testid="local" data-state={JSON.stringify(state ?? null)}>{pathname}</output>
}
const local = () => screen.getByTestId('local').textContent
const estado = () => JSON.parse(screen.getByTestId('local').dataset.state!) as unknown

function Outra() {
  const { pathname } = useLocation()
  return <h1>Outra {pathname}</h1>
}

function abrir(caminho: string, state?: unknown, antes: string[] = []) {
  return render(
    <MemoryRouter initialEntries={[...antes, { pathname: caminho, state }]} initialIndex={antes.length}>
      <Routes>
        <Route path={ROTA_DO_PARAGRAFO} element={<Paragrafo />} />
        <Route path="*" element={<Outra />} />
      </Routes>
      <Local />
    </MemoryRouter>,
  )
}

const titulo = () => screen.findByRole('heading', { level: 1, name: /^TESTEG § \d+$/ })
const coluna = (nome: string) => screen.getByRole('region', { name: nome })

describe('a página do § (tela 2)', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterAll(() => usarMotor(null))
  afterEach(() => {
    instalarMatchMedia(375)
    localStorage.clear()
    esquecerLinguasDaMemoria()
    esquecerAbaDoCelular()
  })

  it('a rota /paragrafo/:sigla/:numero está registrada', () => {
    expect(ROTAS.map((r) => r.path)).toContain('/paragrafo/:sigla/:numero')
  })

  describe.each([
    ['celular', 375],
    ['computador', 1280],
  ] as const)('%s', (aparelho, largura) => {
    beforeEach(() => instalarMatchMedia(largura))

    it('o cabeçalho: o caminho em português com os links, «TESTEG § 2», as setas, as páginas e a posição na seção', async () => {
      abrir('/paragrafo/TESTEG/2')
      expect(await titulo()).toHaveTextContent('TESTEG § 2')
      const caminho = screen.getByTestId('paragrafo-caminho')
      expect(caminho).toHaveTextContent('TESTEG · I. Época de teste e imagens de prova › 1. Selos de prova da fase de teste')
      expect(within(caminho).getByRole('link', { name: 'I. Época de teste e imagens de prova' })).toHaveAttribute('href', '/grupo/GR-TESTEG-01')
      expect(within(caminho).getByRole('link', { name: '1. Selos de prova da fase de teste' })).toHaveAttribute('href', '/grupo/GR-TESTEG-01-01')
      const setas = screen.getByRole('navigation', { name: '§§ vizinhos' })
      expect(within(setas).getByRole('link', { name: '§ 1' })).toHaveAttribute('href', '/paragrafo/TESTEG/1')
      expect(within(setas).getByRole('link', { name: '§ 3' })).toHaveAttribute('href', '/paragrafo/TESTEG/3')
      // o primeiro da seção não tem «ler a seção do começo»
      expect(screen.getByTestId('paragrafo-meta')).toHaveTextContent(/^p\. 6 · primeiro de 2 §§ da seção$/)
    })

    it('as figuras citadas: a faixa com as duas figuras, que levam a origem («‹ TESTEG § 2», decisão 85)', async () => {
      abrir('/paragrafo/TESTEG/2')
      await titulo()
      const faixa = screen.getByRole('region', { name: 'Figuras citadas' })
      expect(within(faixa).getByRole('heading', { level: 2 })).toHaveTextContent(/Figuras citadas\s*2/)
      const cartoes = within(faixa).getAllByRole('link')
      expect(cartoes.map((c) => c.getAttribute('href'))).toEqual(['/item/F200001', '/item/CA00004'])
      expect(cartoes[0]).toHaveTextContent('TESTEG: 1a')
      expect(cartoes[1]).toHaveTextContent('TESTEG: 1b')
      await userEvent.click(cartoes[0]!)
      expect(local()).toBe('/item/F200001')
      expect(estado()).toMatchObject({ voltar: { rotulo: 'TESTEG § 2', caminho: '/paragrafo/TESTEG/2' } })
    })

    it('o português: os termos ligados ao verbete e as referências às figuras ligadas ao objeto', async () => {
      abrir('/paragrafo/TESTEG/2')
      await titulo()
      const pt = coluna('Português')
      expect(pt).toHaveTextContent('Dois selos de prova de Maḥteṣ Teste mostram um leão-de-teste (Abb. 1a) e o seu verso (Abb. 1b); cf. Pl. 3.')
      expect(pt).toHaveTextContent('A gravação de teste dos dois selos de prova é rasa; a estrela de prova falta no verso.')
      expect(within(pt).getByRole('link', { name: 'leão-de-teste' })).toHaveAttribute('href', '/verbete/GL-900001')
      expect(within(pt).getByRole('link', { name: 'gravação de teste' })).toHaveAttribute('href', '/verbete/GL-900006')
      expect(within(pt).getByRole('link', { name: 'Abb. 1a' })).toHaveAttribute('href', '/item/F200001')
      expect(within(pt).getAllByRole('link', { name: 'Abb. 1b' })[0]!).toHaveAttribute('href', '/item/CA00004')
      expect(within(pt).getByText('tradução automática do alemão corrigido')).toBeInTheDocument()
    })

    it('as notas no pé de cada língua', async () => {
      abrir('/paragrafo/TESTEG/2')
      await titulo()
      const notas = within(coluna('Português')).getByRole('list', { name: 'Notas' })
      expect(within(notas).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
        '2Nota de prova sobre a gravação de teste, inventada para o teste do aplicativo. Cf. Abb. 1b.',
      ])
      // Tarefa 26: a figura citada na nota é um link ao objeto, como no texto
      expect(within(notas).getByRole('link', { name: 'Abb. 1b' })).toHaveAttribute('href', '/item/CA00004')
    })

    it('o pé: o § anterior e o seguinte com a primeira frase', async () => {
      abrir('/paragrafo/TESTEG/2')
      await titulo()
      const pe = screen.getByRole('navigation', { name: '§ anterior e seguinte' })
      const [antes, depois] = within(pe).getAllByRole('link')
      expect(antes).toHaveAttribute('href', '/paragrafo/TESTEG/1')
      expect(antes).toHaveTextContent('‹ § 1Este livro de teste inventado ordena as suas imagens de prova em parágrafos; cada frase é uma frase de teste.')
      expect(depois).toHaveAttribute('href', '/paragrafo/TESTEG/3')
      expect(depois).toHaveTextContent('§ 3 ›Um escaravelho de teste de Tell Achado Teste (Abb. 2) encerra a série de prova.')
    })

    it('‹ › anda em ordem: o § 3 é o segundo da seção, com «ler a seção do começo»; o § 1, do capítulo, sem anterior', async () => {
      abrir('/paragrafo/TESTEG/2')
      await titulo()
      await userEvent.click(within(screen.getByRole('navigation', { name: '§§ vizinhos' })).getByRole('link', { name: '§ 3' }))
      expect(await screen.findByRole('heading', { level: 1, name: 'TESTEG § 3' })).toBeInTheDocument()
      expect(local()).toBe('/paragrafo/TESTEG/3')
      await waitFor(() => expect(coluna('Português')).toHaveTextContent('Um escaravelho de teste de Tell Achado Teste'))
      const meta = screen.getByTestId('paragrafo-meta')
      expect(meta).toHaveTextContent(/^p\. 7 · segundo de 2 §§ da seção · ler a seção do começo$/)
      expect(within(meta).getByRole('link', { name: 'ler a seção do começo' })).toHaveAttribute('href', '/paragrafo/TESTEG/2')
      expect(within(screen.getByRole('navigation', { name: '§§ vizinhos' })).queryByRole('link', { name: '§ 4' })).toBeNull()

      await userEvent.click(within(screen.getByRole('navigation', { name: '§ anterior e seguinte' })).getByRole('link', { name: /§ 2/ }))
      await userEvent.click(await within(await screen.findByRole('navigation', { name: '§§ vizinhos' })).findByRole('link', { name: '§ 1' }))
      expect(await screen.findByRole('heading', { level: 1, name: 'TESTEG § 1' })).toBeInTheDocument()
      await waitFor(() => expect(screen.getByTestId('paragrafo-meta')).toHaveTextContent(/^p\. 5 · o único § do capítulo$/))
      expect(screen.getByTestId('paragrafo-caminho')).toHaveTextContent(/^TESTEG · I\. Época de teste e imagens de prova$/)
      expect(within(screen.getByRole('navigation', { name: '§§ vizinhos' })).getAllByRole('link').map((a) => a.textContent)).toEqual(['§ 2'])
    })

    it('o «Voltar» de origem (decisão 85): «‹ Figura TESTEG: 1a» volta no histórico; ‹ › a leva junto', async () => {
      const voltar = { rotulo: 'Figura TESTEG: 1a', caminho: '/item/F200001' }
      abrir('/paragrafo/TESTEG/2', { voltar }, ['/item/F200001'])
      await titulo()
      if (aparelho === 'computador') {
        const origem = screen.getByRole('navigation', { name: 'Origem' })
        const link = within(origem).getByRole('link', { name: 'Figura TESTEG: 1a' })
        expect(link).toHaveTextContent(/^‹\s*Figura TESTEG: 1a$/)
        expect(link).toHaveAttribute('href', '/item/F200001')
      } else {
        // no celular, o ícone do topo diz a origem
        expect(screen.getByRole('link', { name: 'Voltar (Figura TESTEG: 1a)' })).toHaveAttribute('href', '#/item/F200001')
      }
      // andar para o § 3 leva a origem
      await userEvent.click(within(screen.getByRole('navigation', { name: '§§ vizinhos' })).getByRole('link', { name: '§ 3' }))
      expect(await screen.findByRole('heading', { level: 1, name: 'TESTEG § 3' })).toBeInTheDocument()
      expect(estado()).toEqual({ voltar })
      const volta =
        aparelho === 'computador'
          ? within(screen.getByRole('navigation', { name: 'Origem' })).getByRole('link', { name: 'Figura TESTEG: 1a' })
          : screen.getByRole('link', { name: 'Voltar (Figura TESTEG: 1a)' })
      await userEvent.click(volta)
      expect(await screen.findByRole('heading', { level: 1, name: 'Outra /item/F200001' })).toBeInTheDocument()
    })

    it('sem origem: nada de «‹ …»; no celular o Voltar do topo vai à seção', async () => {
      abrir('/paragrafo/TESTEG/2')
      await titulo()
      expect(screen.queryByRole('navigation', { name: 'Origem' })).toBeNull()
      if (aparelho === 'celular') expect(screen.getByRole('link', { name: 'Voltar à seção' })).toHaveAttribute('href', '#/grupo/GR-TESTEG-01-01')
    })

    it('o § que não existe: o aviso e o link às coleções', async () => {
      abrir('/paragrafo/TESTEG/99')
      expect(await screen.findByText('Este § não está no pacote.')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Ir às coleções' })).toHaveAttribute('href', '/colecoes')
    })
  })

  describe('computador: o português no centro, o alemão e o inglês nos trilhos (decisão 91, a4)', () => {
    beforeEach(() => instalarMatchMedia(1280))

    it('abre só com o português; o trilho abre o alemão e o inglês, o X fecha; a escolha fica lembrada', async () => {
      const { unmount } = abrir('/paragrafo/TESTEG/2')
      await titulo()
      expect(screen.queryByRole('region', { name: 'Alemão' })).toBeNull()
      expect(screen.queryByRole('region', { name: 'Inglês' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Abrir o Alemão · TESTEG 2021' })).toHaveTextContent('Alemão · TESTEG 2021')
      expect(screen.getByRole('button', { name: 'Abrir o Inglês · TESTEGEN 2022' })).toHaveTextContent('Inglês · TESTEGEN 2022')

      await userEvent.click(screen.getByRole('button', { name: 'Abrir o Alemão · TESTEG 2021' }))
      const de = coluna('Alemão')
      expect(de).toHaveAttribute('lang', 'de')
      expect(de).toHaveTextContent('Zwei Probesiegel aus Maḥteṣ Teste zeigen einen Testlöwen (Abb. 1a) und seine Rückseite (Abb. 1b); vgl. Pl. 3.')
      expect(de).toHaveTextContent('TESTEG 2021, p. 6 · lido e corrigido')
      expect(within(de).getAllByRole('link', { name: 'Abb. 1b' })[0]!).toHaveAttribute('href', '/item/CA00004')
      expect(within(within(de).getByRole('list', { name: 'Notas' })).getByRole('listitem')).toHaveTextContent('Probenote zur Testgravur, erfunden für den Test der App.')
      expect(screen.queryByRole('button', { name: 'Abrir o Alemão · TESTEG 2021' })).toBeNull()

      await userEvent.click(screen.getByRole('button', { name: 'Abrir o Inglês · TESTEGEN 2022' }))
      const en = coluna('Inglês')
      expect(en).toHaveAttribute('lang', 'en')
      expect(en).toHaveTextContent('Two probe seals from Mahtes Teste show a test lion (illus. 1a) and its reverse (illus. 1b).')
      expect(en).toHaveTextContent('TESTEGEN 2022 § 2, p. 6 · lido e corrigido')
      // as três línguas lado a lado, cada trecho na mesma linha
      expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(expect.arrayContaining(['Alemão', 'Português', 'Inglês']))

      // a escolha fica lembrada neste aparelho
      unmount()
      abrir('/paragrafo/TESTEG/3')
      await titulo()
      expect(coluna('Alemão')).toBeInTheDocument()
      expect(coluna('Inglês')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Fechar o alemão' }))
      expect(screen.queryByRole('region', { name: 'Alemão' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Abrir o Alemão · TESTEG 2021' })).toBeInTheDocument()
      expect(JSON.parse(localStorage.getItem('iconodb:paragrafo-linguas')!)).toEqual({ de: false, en: true })
    })
  })

  describe('celular: as abas PT · DE · EN', () => {
    beforeEach(() => instalarMatchMedia(375))

    it('abre no PT; DE mostra o alemão e EN o inglês, um de cada vez', async () => {
      abrir('/paragrafo/TESTEG/2')
      await titulo()
      const abas = screen.getByRole('tablist', { name: 'Língua' })
      expect(within(abas).getAllByRole('tab').map((t) => [t.textContent, t.getAttribute('aria-selected')])).toEqual([
        ['PT', 'true'],
        ['DE', 'false'],
        ['EN', 'false'],
      ])
      expect(screen.getByRole('tabpanel')).toContainElement(coluna('Português'))
      expect(screen.queryByRole('button', { name: 'Abrir o Alemão · TESTEG 2021' })).toBeNull()

      await userEvent.click(within(abas).getByRole('tab', { name: 'DE' }))
      expect(coluna('Alemão')).toHaveTextContent('Die Testgravur beider Probesiegel ist flach')
      expect(screen.queryByRole('region', { name: 'Português' })).toBeNull()
      // no celular não há X: a aba troca
      expect(screen.queryByRole('button', { name: 'Fechar o alemão' })).toBeNull()

      await userEvent.click(within(abas).getByRole('tab', { name: 'EN' }))
      const en = coluna('Inglês')
      expect(en).toHaveTextContent('Two probe seals from Mahtes Teste')
      // o segundo trecho não tem inglês alinhado
      expect(within(en).getByText('Sem inglês para este trecho.')).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Alemão' })).toBeNull()
    })

    it('a aba fica a mesma ao andar de um § ao outro', async () => {
      abrir('/paragrafo/TESTEG/2')
      await titulo()
      await userEvent.click(screen.getByRole('tab', { name: 'DE' }))
      await userEvent.click(within(screen.getByRole('navigation', { name: '§§ vizinhos' })).getByRole('link', { name: '§ 3' }))
      expect(await screen.findByRole('heading', { level: 1, name: 'TESTEG § 3' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'DE' })).toHaveAttribute('aria-selected', 'true')
      expect(coluna('Alemão')).toHaveTextContent('Ein Testskarabäus aus Tell Achado Teste (Abb. 2) schließt die Probereihe ab.')
    })
  })

  describe.each([
    ['celular', 375],
    ['computador', 1280],
  ] as const)('«Mostrar o que foi corrigido» (%s)', (aparelho, largura) => {
    beforeEach(() => instalarMatchMedia(largura))

    const abrirAlemao = async () => {
      abrir('/paragrafo/TESTEG/2')
      await titulo()
      if (aparelho === 'computador') await userEvent.click(screen.getByRole('button', { name: 'Abrir o Alemão · TESTEG 2021' }))
      else await userEvent.click(screen.getByRole('tab', { name: 'DE' }))
      return coluna('Alemão')
    }

    it('desligado, o texto corrido; ligado, as duas correções sublinhadas; o toque mostra o lido e a regra', async () => {
      const de = await abrirAlemao()
      const chave = within(de).getByRole('switch', { name: /Mostrar o que foi corrigido/ })
      expect(chave).toHaveTextContent('2')
      expect(chave).toHaveAttribute('aria-checked', 'false')
      expect(within(de).queryByRole('button', { name: 'Maḥteṣ' })).toBeNull()
      expect(de.querySelectorAll('.paragrafo-corrigido')).toHaveLength(0)

      await userEvent.click(chave)
      expect(chave).toHaveAttribute('aria-checked', 'true')
      const marcadas = [...de.querySelectorAll('.paragrafo-corrigido')].map((e) => e.textContent)
      expect(marcadas).toEqual(['Maḥteṣ', 'Pl.'])
      // o texto continua o mesmo (o corrigido)
      expect(de).toHaveTextContent('Zwei Probesiegel aus Maḥteṣ Teste zeigen einen Testlöwen (Abb. 1a) und seine Rückseite (Abb. 1b); vgl. Pl. 3.')

      await userEvent.click(within(de).getByRole('button', { name: 'Maḥteṣ' }))
      const cartao = screen.getByRole('dialog', { name: 'O que foi lido' })
      expect(within(cartao).getAllByRole('term').map((t) => t.textContent)).toEqual(['Lido', 'Corrigido', 'Regra'])
      expect(within(cartao).getAllByRole('definition').map((t) => t.textContent)).toEqual([
        '«Mahtes»',
        '«Maḥteṣ»',
        'acento restaurado pela lista de formas certas (IPIAO e glossário)',
      ])
      expect(cartao).toHaveTextContent('A tradução, a busca e o app usam o texto corrigido.')
      expect(within(de).getByRole('button', { name: 'Maḥteṣ' })).toHaveAttribute('aria-expanded', 'true')

      // outra correção troca o cartão; Esc fecha
      await userEvent.click(within(de).getByRole('button', { name: 'Pl.' }))
      expect(within(screen.getByRole('dialog', { name: 'O que foi lido' })).getAllByRole('definition')[0]).toHaveTextContent('«PI.»')
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog', { name: 'O que foi lido' })).toBeNull()

      // desligar tira as marcas
      await userEvent.click(within(de).getByRole('button', { name: 'Maḥteṣ' }))
      await userEvent.click(chave)
      expect(de.querySelectorAll('.paragrafo-corrigido')).toHaveLength(0)
      expect(screen.queryByRole('dialog', { name: 'O que foi lido' })).toBeNull()
    })

    it('Tarefa 6 (revisão da Tarefa 25, 8): o cartão aberto se reposiciona quando a janela muda de tamanho', async () => {
      const de = await abrirAlemao()
      await userEvent.click(within(de).getByRole('switch', { name: /Mostrar o que foi corrigido/ }))
      const gatilho = within(de).getByRole('button', { name: 'Maḥteṣ' })
      let esquerda = 120
      const original = HTMLElement.prototype.getBoundingClientRect
      const medida = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this === gatilho) return { left: esquerda, right: esquerda + 60, top: 80, bottom: 100, width: 60, height: 20, x: esquerda, y: 80, toJSON: () => ({}) } as DOMRect
        if (this.classList.contains('paragrafo')) return { left: 0, right: 1000, top: 0, bottom: 2000, width: 1000, height: 2000, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
        return original.call(this)
      })
      await userEvent.click(gatilho)
      const cartao = screen.getByRole('dialog', { name: 'O que foi lido' })
      expect([cartao.style.top, cartao.style.left]).toEqual(['108px', '120px'])
      // a janela muda (o texto reflui): a correção vai a outro lugar, e o cartão a acompanha
      esquerda = 400
      fireEvent(window, new Event('resize'))
      expect([cartao.style.top, cartao.style.left]).toEqual(['108px', '400px'])
      medida.mockRestore()
    })

    it('o português não tem a chave; o inglês sem correção também não', async () => {
      abrir('/paragrafo/TESTEG/2')
      await titulo()
      expect(within(coluna('Português')).queryByRole('switch')).toBeNull()
      if (aparelho === 'computador') await userEvent.click(screen.getByRole('button', { name: 'Abrir o Inglês · TESTEGEN 2022' }))
      else await userEvent.click(screen.getByRole('tab', { name: 'EN' }))
      expect(within(coluna('Inglês')).queryByRole('switch')).toBeNull()
    })
  })

  describe.each([
    ['celular', 375],
    ['computador', 1280],
  ] as const)('fix 1: as chamadas de nota e o inglês (%s; linhas sintéticas num banco de escrita)', (aparelho, largura) => {
    beforeAll(async () => {
      usarMotor(await bancoDeTeste({ escrita: true }))
      // a chamada da nota 2 colada a uma referência («Abb. 1b²», I2) e uma chamada sem nota no § («⁷»), no português; a chamada
      // no fim do alemão; o inglês também tem uma, que fica texto (o GGIG numera as notas por capítulo)
      await executar(
        "UPDATE pub_TESTEG.unit_pt_render SET texto = 'Dois selos de prova de Maḥteṣ Teste mostram um leão-de-teste (Abb. 1a) e o seu verso Abb. 1b²; cf. Pl. 3⁷.' WHERE unit_id = 'PA-TESTEG-§2-txt-1'",
      )
      await executar("UPDATE pub_TESTEG.passage SET text = text || '²' WHERE id = 'PA-TESTEG-§2-txt-1'")
      await executar("UPDATE pub_TESTEGEN.passage SET text = text || '²' WHERE id = 'PA-TESTEGEN-§2-txt-1'")
    })
    afterAll(async () => usarMotor(await bancoDeTeste()))
    beforeEach(() => instalarMatchMedia(largura))

    it('a chamada leva à nota e a nota volta à chamada; a referência colada à chamada continua ligada à figura', async () => {
      abrir('/paragrafo/TESTEG/2')
      await titulo()
      const pt = coluna('Português')
      expect(within(pt).getAllByRole('link', { name: 'Abb. 1b' })[0]!).toHaveTextContent(/^Abb\. 1b$/)
      expect(within(pt).getAllByRole('link', { name: 'Abb. 1b' })[0]!).toHaveAttribute('href', '/item/CA00004')
      const chamada = within(pt).getAllByRole('link', { name: 'nota 2' })[0]!
      expect(chamada).toHaveTextContent('²')
      // a chamada a uma nota que o § não tem fica texto
      expect(within(pt).queryByRole('link', { name: 'nota 7' })).toBeNull()
      expect(pt).toHaveTextContent('cf. Pl. 3⁷.')

      await userEvent.click(chamada)
      const nota = within(within(pt).getByRole('list', { name: 'Notas' })).getByRole('listitem')
      expect(nota).toHaveFocus()
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
      expect(local()).toBe('/paragrafo/TESTEG/2')
      await userEvent.click(within(nota).getByRole('link', { name: 'Voltar à chamada da nota 2' }))
      expect(chamada).toHaveFocus()
    })

    it('o alemão liga as chamadas; o inglês as deixa como texto; o inglês tem a página da tradução', async () => {
      abrir('/paragrafo/TESTEG/2')
      await titulo()
      if (aparelho === 'computador') await userEvent.click(screen.getByRole('button', { name: 'Abrir o Alemão · TESTEG 2021' }))
      else await userEvent.click(screen.getByRole('tab', { name: 'DE' }))
      const de = coluna('Alemão')
      await userEvent.click(within(de).getAllByRole('link', { name: 'nota 2' })[0]!)
      expect(within(within(de).getByRole('list', { name: 'Notas' })).getByRole('listitem')).toHaveFocus()

      if (aparelho === 'computador') await userEvent.click(screen.getByRole('button', { name: 'Abrir o Inglês · TESTEGEN 2022' }))
      else await userEvent.click(screen.getByRole('tab', { name: 'EN' }))
      const en = coluna('Inglês')
      expect(en).toHaveTextContent('and its reverse (illus. 1b).²')
      expect(within(en).queryByRole('link', { name: 'nota 2' })).toBeNull()
      expect(within(en).queryByRole('link', { name: /Voltar à chamada/ })).toBeNull()
      expect(en).toHaveTextContent('TESTEGEN 2022 § 2, p. 6 · lido e corrigido')
    })
  })
})

describe('fix round 1 da Tarefa 27 (M2): a aba EN do celular num § sem inglês', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    Element.prototype.scrollIntoView = vi.fn()
    // o § 3 sem inglês (o livro tem mais §§ que a tradução)
    await executar("UPDATE pub_TESTEGEN.passage SET aligned_passage = NULL WHERE id = 'PA-TESTEGEN-§3-txt-1'")
  })
  afterAll(() => usarMotor(null))
  beforeEach(() => instalarMatchMedia(375))
  afterEach(() => {
    instalarMatchMedia(375)
    esquecerAbaDoCelular()
  })

  it('o § sem inglês mostra o PT com a aba PT selecionada e alcançável pelo teclado', async () => {
    abrir('/paragrafo/TESTEG/2')
    await titulo()
    await userEvent.click(screen.getByRole('tab', { name: 'EN' }))
    await userEvent.click(within(screen.getByRole('navigation', { name: '§§ vizinhos' })).getByRole('link', { name: '§ 3' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'TESTEG § 3' })).toBeInTheDocument()
    const abas = screen.getByRole('tablist', { name: 'Língua' })
    expect(within(abas).getAllByRole('tab').map((t) => [t.textContent, t.getAttribute('aria-selected'), t.tabIndex])).toEqual([
      ['PT', 'true', 0],
      ['DE', 'false', -1],
    ])
    expect(screen.getByRole('tabpanel')).toContainElement(coluna('Português'))
    // a seta leva ao DE, como sempre
    within(abas).getByRole('tab', { name: 'PT' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(within(abas).getByRole('tab', { name: 'DE' })).toHaveAttribute('aria-selected', 'true')
    expect(within(abas).getByRole('tab', { name: 'DE' })).toHaveFocus()
  })
})
