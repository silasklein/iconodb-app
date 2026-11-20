/**
 * Tarefa 4 do plano «O IPIAO lido no formato do §»: a página de leitura (desenhos 1 e 2 aprovados), sobre o pacote sintético.
 * O `TESTE` é o modelo do catálogo (src/banco/leitura.test.ts): o passo da p. 11 é o 2.º de 2 do bloco da subcoleção
 * GR-TESTE-I-01-02; o da p. 9 tem o panorama e a legenda («Mapa») e cita as entradas 1–3 («(1–3)»); a entrada 1 está na
 * subcoleção GR-TESTE-I-01-01. Tudo inventado (repositório público).
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { atalhoRegistrado } from '../app/atalhos'
import { guardarPosicao } from '../app/rolagem'
import { ROTAS } from '../app/routes'
import { executar, usarMotor } from '../banco/cliente'
import { registrar } from '../usuario/estado'
import * as leituraModulo from '../banco/leitura'
import { rotaDaEntrada, rotaDoTrecho } from '../banco/leitura'
import { esquecerPreferenciasDaMemoria, lerPosicao } from '../leitura/preferencias'
import { instalarIntersecao } from '../test/intersecao'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { esquecerAbaDaLeitura, Leitura, ROTA_DA_LEITURA_DA_ENTRADA, ROTA_DA_LEITURA_DO_TRECHO } from './Leitura'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

function Local() {
  const { pathname, state } = useLocation()
  return <output data-testid="local" data-state={JSON.stringify(state ?? null)}>{pathname}</output>
}
const local = () => screen.getByTestId('local').textContent

function Outra() {
  const { pathname } = useLocation()
  return <h1>Outra {pathname}</h1>
}

function abrir(caminho: string, state?: unknown, key?: string) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: caminho, state, key }]}>
      <Routes>
        <Route path={ROTA_DA_LEITURA_DO_TRECHO} element={<Leitura />} />
        <Route path={ROTA_DA_LEITURA_DA_ENTRADA} element={<Leitura />} />
        <Route path="*" element={<Outra />} />
      </Routes>
      <Local />
    </MemoryRouter>,
  )
}

const P11 = 'PA-TESTE-I.S.11-ovw-1'
const titulo = (nome: string | RegExp) => screen.findByRole('heading', { level: 1, name: nome })
const coluna = (nome: string) => screen.getByRole('region', { name: nome })

describe('a página de leitura (desenhos 1 e 2)', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterAll(() => usarMotor(null))
  beforeEach(() => vi.mocked(Element.prototype.scrollIntoView).mockClear())
  afterEach(() => {
    instalarMatchMedia(375)
    localStorage.clear()
    esquecerPreferenciasDaMemoria()
    esquecerAbaDaLeitura()
  })

  it('as rotas /ler/:sigla/trecho/:id e /ler/:sigla/entrada/:chave estão registradas', () => {
    expect(ROTAS.map((r) => r.path)).toEqual(expect.arrayContaining(['/ler/:sigla/trecho/:id', '/ler/:sigla/entrada/:chave']))
  })

  describe.each([
    ['celular', 375],
    ['computador', 1280],
  ] as const)('%s', (aparelho, largura) => {
    beforeEach(() => instalarMatchMedia(largura))

    it('o passo de texto: o caminho, o título, a etiqueta do tipo, as setas e a meta com «ler do começo»', async () => {
      abrir(rotaDoTrecho('TESTE', P11))
      expect(await titulo('TESTE I, p. 11')).toBeInTheDocument()
      expect(screen.getByText('Introdução da subcoleção', { selector: '.ler-tipo' })).toBeInTheDocument()
      const caminho = screen.getByTestId('paragrafo-caminho')
      expect(caminho).toHaveTextContent(/^TESTE I · /)
      expect(within(caminho).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/grupo/GR-TESTE-I-01', '/grupo/GR-TESTE-I-01-02'])
      const setas = screen.getByRole('navigation', { name: 'Passos vizinhos' })
      // o nome diz o sentido (revisão da Tarefa 4): na entrada 1, os dois vizinhos são «p. 10»
      expect(within(setas).getByRole('link', { name: 'Anterior: p. 10' })).toHaveAttribute('href', rotaDoTrecho('TESTE', 'PA-TESTE-I.S.10-ovw-2'))
      expect(within(setas).getByRole('link', { name: 'Seguinte: TESTE I: 2' })).toHaveAttribute('href', rotaDaEntrada('TESTE', '2'))
      expect(within(setas).getByRole('link', { name: 'Seguinte: TESTE I: 2' })).toHaveTextContent(/^TESTE I: 2$/)
      const meta = screen.getByTestId('ler-meta')
      expect(meta).toHaveTextContent(/^p\. 11 · página 2 de 2 da introdução da subcoleção · ler do começo$/)
      expect(within(meta).getByRole('link', { name: 'ler do começo' })).toHaveAttribute('href', rotaDoTrecho('TESTE', 'PA-TESTE-I.S.10-ovw-2'))
      // sem figuras citadas na p. 11, sem a faixa
      expect(screen.queryByRole('region', { name: 'Figuras citadas' })).toBeNull()
    })

    it('a chegada pelo 1º trecho do passo: o foco no título, sem rolar nem marcar o trecho; a posição fica guardada', async () => {
      abrir(rotaDoTrecho('TESTE', P11))
      const h1 = await titulo('TESTE I, p. 11')
      await waitFor(() => expect(h1).toHaveFocus())
      expect(h1).toHaveAttribute('tabindex', '-1')
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
      expect(document.querySelectorAll('.ler-linha-alvo')).toHaveLength(0)
      expect(document.querySelectorAll('[data-trecho][tabindex]')).toHaveLength(0)
      expect(lerPosicao('TESTE')).toBe(rotaDoTrecho('TESTE', P11))
    })

    it('a entrada: o foco no título; os dois vizinhos «p. 10» têm nomes diferentes', async () => {
      abrir(rotaDaEntrada('TESTE', '1'))
      const h1 = await titulo('TESTE I: 1')
      await waitFor(() => expect(h1).toHaveFocus())
      const setas = screen.getByRole('navigation', { name: 'Passos vizinhos' })
      expect(within(setas).getAllByRole('link').map((a) => a.getAttribute('aria-label'))).toEqual(['Anterior: p. 10', 'Seguinte: p. 10'])
    })

    it('o trecho pedido no meio do passo (a legenda da p. 9): rola até ele e põe o foco', async () => {
      vi.mocked(Element.prototype.scrollIntoView).mockClear()
      abrir(rotaDoTrecho('TESTE', 'PA-TESTE-I.S.9-cap-1'))
      await titulo('TESTE I, p. 9')
      await waitFor(() => expect(document.activeElement).toHaveAttribute('data-trecho', 'PA-TESTE-I.S.9-cap-1'))
      // a marca só no trecho pedido no meio do passo, no português (na coluna à vista)
      expect(document.activeElement).toHaveClass('ler-linha-alvo')
      expect(document.activeElement!.closest('section')).toHaveAttribute('aria-label', 'Português')
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
      // só o trecho pedido entra na ordem do foco
      expect(document.querySelectorAll('[data-trecho="PA-TESTE-I.S.9-ovw-1"][tabindex]')).toHaveLength(0)
    })

    it('com movimento reduzido, a rolagem até o trecho é imediata', async () => {
      const semReducao = window.matchMedia
      window.matchMedia = ((q: string) =>
        /prefers-reduced-motion:\s*reduce/.test(q) ? { matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} } : semReducao(q)) as typeof window.matchMedia
      try {
        abrir(rotaDoTrecho('TESTE', 'PA-TESTE-I.S.9-cap-1'))
        await titulo('TESTE I, p. 9')
        await waitFor(() => expect(document.activeElement).toHaveAttribute('data-trecho', 'PA-TESTE-I.S.9-cap-1'))
        expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' })
      } finally {
        window.matchMedia = semReducao
      }
    })

    it('no Voltar do navegador (POP) com a posição guardada, não rola (quem rola é useRestaurarRolagem); o foco fica', async () => {
      guardarPosicao('entrada-guardada', 420)
      try {
        abrir(rotaDoTrecho('TESTE', 'PA-TESTE-I.S.9-cap-1'), undefined, 'entrada-guardada')
        await titulo('TESTE I, p. 9')
        await waitFor(() => expect(document.activeElement).toHaveAttribute('data-trecho', 'PA-TESTE-I.S.9-cap-1'))
        expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
      } finally {
        sessionStorage.clear()
      }
    })

    it('o português e o pé: a etiqueta do tipo antes da frase quando o tipo muda', async () => {
      abrir(rotaDoTrecho('TESTE', P11))
      await titulo('TESTE I, p. 11')
      expect(coluna('Português')).toHaveTextContent('Um sinal de teste sozinho ainda não faz uma figura de prova')
      const pe = screen.getByRole('navigation', { name: 'Passo anterior e seguinte' })
      const [antes, depois] = within(pe).getAllByRole('link')
      expect(antes).toHaveAttribute('href', rotaDoTrecho('TESTE', 'PA-TESTE-I.S.10-ovw-2'))
      expect(antes).toHaveTextContent(/^‹ p\. 10Figuras de prova e sinais de teste/)
      expect(depois).toHaveAttribute('href', rotaDaEntrada('TESTE', '2'))
      expect(depois).toHaveTextContent(/^TESTE I: 2 ›Entrada do catálogo · No verso está o sinal/)
    })

    it('‹ › anda trocando a entrada do histórico e levando a origem', async () => {
      const voltar = { rotulo: 'Busca', caminho: '/busca' }
      abrir(rotaDoTrecho('TESTE', P11), { voltar })
      await titulo('TESTE I, p. 11')
      await userEvent.click(within(screen.getByRole('navigation', { name: 'Passos vizinhos' })).getByRole('link', { name: 'Seguinte: TESTE I: 2' }))
      expect(await titulo('TESTE I: 2')).toBeInTheDocument()
      expect(local()).toBe(rotaDaEntrada('TESTE', '2'))
      expect(JSON.parse(screen.getByTestId('local').dataset.state!)).toEqual({ voltar })
      expect(lerPosicao('TESTE')).toBe(rotaDaEntrada('TESTE', '2'))
    })

    it('o passo da p. 9: a legenda com a etiqueta «Mapa»; os números do catálogo citados são links ao objeto', async () => {
      abrir(rotaDoTrecho('TESTE', 'PA-TESTE-I.S.9-cap-1'))
      await titulo('TESTE I, p. 9')
      expect(screen.getByText('Introdução do grupo', { selector: '.ler-tipo' })).toBeInTheDocument()
      const pt = coluna('Português')
      expect(within(pt).getByText('Mapa')).toBeInTheDocument()
      // a legenda não tem tradução
      expect(within(pt).getByText('sem tradução ainda; o original:')).toBeInTheDocument()
      // «(1–3)»: o 1 e o 3 são remissões às entradas citadas
      expect(within(pt).getByRole('link', { name: 'Abrir CA00001, TESTE I: 1' })).toHaveTextContent(/^1$/)
      expect(within(pt).getByRole('link', { name: 'Abrir CA00001, TESTE I: 1' })).toHaveAttribute('href', '/item/CA00001')
      expect(within(pt).getByRole('link', { name: 'Abrir CA00003, TESTE I: 3' })).toHaveAttribute('href', '/item/CA00003')
      expect(within(pt).getByRole('link', { name: 'leões-de-teste' })).toHaveAttribute('href', '/verbete/GL-900001')
      const faixa = screen.getByRole('region', { name: 'Figuras citadas' })
      expect(within(faixa).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/item/CA00001', '/item/CA00002', '/item/CA00003'])
      expect(screen.queryByRole('button', { name: /Mostrar todas/ })).toBeNull()
    })

    it('o mapa da legenda (§ 9): o texto, o mapa do app com os sítios da parte e o toque num ponto abre o cartão do sítio', async () => {
      abrir(rotaDoTrecho('TESTE', 'PA-TESTE-I.S.9-cap-1'))
      await titulo('TESTE I, p. 9')
      // as entradas 1 e 2 em Maḥteṣ Teste (TESTE-1), a 3 em Tell Probe Teste (TESTE-2): dois sítios, os dois com coordenada
      const regiao = await screen.findByRole('region', { name: 'Mapa do app: 2 sítios das entradas desta parte' })
      expect(regiao).toHaveTextContent(/^Mapa do app: 2 sítios das entradas desta parte/)
      // o mapa logo abaixo da linha «Mapa»: no celular, dentro da coluna; no computador, na largura das duas colunas
      const linha = document.querySelector<HTMLElement>('.paragrafo-coluna-pt [data-trecho="PA-TESTE-I.S.9-cap-1"]')!
      if (aparelho === 'celular') expect(linha.nextElementSibling).toBe(regiao)
      else {
        expect(regiao.closest('.paragrafo-coluna')).toBeNull()
        expect(regiao.parentElement).toHaveClass('ler-linguas')
        expect(regiao.style.gridColumn).toBe('1 / -1')
      }
      const palco = await within(regiao).findByRole('group', { name: 'Mapa dos sítios' })
      await waitFor(() => expect(palco.querySelectorAll('[data-ponto]')).toHaveLength(2))
      const nomes = [...palco.querySelectorAll('[data-ponto]')].map((p) => p.getAttribute('aria-label')!.replace(/, \d+ objetos?$/, ''))
      expect(nomes.sort()).toEqual(['Maḥteṣ Teste', 'Tell Probe Teste'])
      await userEvent.click(within(palco).getByRole('button', { name: /^Tell Probe Teste, / }))
      const cartao = await screen.findByRole('dialog', { name: 'Sítio selecionado: Tell Probe Teste' })
      expect(within(cartao).getByRole('link', { name: 'Abrir sítio' })).toHaveAttribute('href', '/sitio/TESTE-2')
      expect(cartao).toHaveClass(aparelho === 'celular' ? 'cartao-ponto-folha' : 'cartao-ponto-flutuante')
    })

    it('o passo sem legenda não tem o mapa do app', async () => {
      abrir(rotaDoTrecho('TESTE', P11))
      await titulo('TESTE I, p. 11')
      expect(screen.queryByText(/^Mapa do app/)).toBeNull()
      expect(screen.queryByRole('group', { name: 'Mapa dos sítios' })).toBeNull()
    })

    it('o passo da entrada: o título, a etiqueta cheia, a peça, «Abrir a ficha completa» e as linhas com os rótulos', async () => {
      abrir(rotaDaEntrada('TESTE', '1'))
      expect(await titulo('TESTE I: 1')).toBeInTheDocument()
      expect(screen.getByText('Entrada do catálogo', { selector: '.ler-tipo' })).toHaveClass('ler-tipo-entrada')
      expect(screen.getByRole('link', { name: 'Abrir a ficha completa' })).toHaveAttribute('href', '/item/CA00001')
      expect(screen.getByRole('link', { name: 'A peça de TESTE I: 1, na ficha' })).toHaveAttribute('href', '/item/CA00001')
      expect(screen.getByTestId('ler-meta')).toHaveTextContent(/^p\. 10 · a única entrada da subcoleção$/)
      const pt = coluna('Português')
      expect(within(pt).getByText('Descrição')).toBeInTheDocument()
      expect(within(pt).getByText('3 · Local e contexto do achado')).toBeInTheDocument()
      expect(within(pt).getByText('5 · Suporte, material e estado')).toBeInTheDocument()
      expect(pt).toHaveTextContent('O pingente de prova mostra um leão-de-teste')
      if (aparelho === 'celular') await userEvent.click(screen.getByRole('tab', { name: 'DE' }))
      const de = coluna('Alemão')
      expect(within(de).getByText('Descrição')).toBeInTheDocument()
      expect(within(de).getByText('3 · Local e contexto do achado')).toBeInTheDocument()
      expect(de).toHaveTextContent('Der Probeanhänger zeigt einen Testlöwen')
      expect(lerPosicao('TESTE')).toBe(rotaDaEntrada('TESTE', '1'))
    })

    it('o passo que não existe: o aviso e o link às coleções', async () => {
      abrir(rotaDoTrecho('TESTE', 'NAO-EXISTE'))
      expect(await screen.findByText('Este passo não está no pacote.')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Ir às coleções' })).toHaveAttribute('href', '/colecoes')
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
      expect(lerPosicao('TESTE')).toBeNull()
    })

    it('a entrada que não existe e a obra que não é de leitura também', async () => {
      const { unmount } = abrir(rotaDaEntrada('TESTE', '1x'))
      expect(await screen.findByText('Este passo não está no pacote.')).toBeInTheDocument()
      unmount()
      abrir(rotaDoTrecho('TESTEG', 'PA-TESTEG-§2-txt-1'))
      expect(await screen.findByText('Este passo não está no pacote.')).toBeInTheDocument()
    })

    it('fix final (m5): no erro, o aviso com «Tentar de novo» e o «‹ origem», como no passo que não existe', async () => {
      const falha = vi.spyOn(leituraModulo, 'passoDaLeitura').mockRejectedValue(new Error('banco fora do ar'))
      try {
        abrir(rotaDoTrecho('TESTE', P11), { voltar: { rotulo: 'Busca', caminho: '/busca?q=selo' } })
        expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
        const origem = screen.getByRole('navigation', { name: 'Origem' })
        expect(within(origem).getByRole('link', { name: 'Busca' })).toHaveAttribute('href', '/busca?q=selo')
        // no celular, o voltar do topo também é o da origem
        if (aparelho === 'celular') expect(screen.getByRole('link', { name: 'Voltar (Busca)' })).toHaveAttribute('href', '#/busca?q=selo')
      } finally {
        falha.mockRestore()
      }
    })
  })

  describe('computador: DE | PT, o alemão aberto por padrão (q2 A)', () => {
    beforeEach(() => instalarMatchMedia(1280))

    it('as duas colunas; o ✕ fecha o alemão e o trilho o reabre; a escolha fica lembrada, à parte da do §', async () => {
      const { unmount } = abrir(rotaDoTrecho('TESTE', P11))
      await titulo('TESTE I, p. 11')
      expect(coluna('Alemão')).toHaveTextContent('Ein Testzeichen allein ergibt noch keine Prüfgestalt')
      expect(coluna('Alemão')).toHaveAttribute('lang', 'de')
      // Tarefa 6 (o desenho aprovado, 01-texto #aberto): o ano do volume no cabeçalho do alemão e no trilho
      expect(coluna('Alemão').querySelector('.paragrafo-cab')).toHaveTextContent('AlemãoTESTE I 2020, p. 11')
      expect(coluna('Português')).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Inglês' })).toBeNull()
      expect(screen.queryByRole('tablist')).toBeNull()
      expect(screen.queryByRole('switch')).toBeNull()

      await userEvent.click(screen.getByRole('button', { name: 'Fechar o alemão' }))
      expect(screen.queryByRole('region', { name: 'Alemão' })).toBeNull()
      expect(JSON.parse(localStorage.getItem('iconodb:leitura-linguas')!)).toEqual({ de: false })
      expect(localStorage.getItem('iconodb:paragrafo-linguas')).toBeNull()

      unmount()
      abrir(rotaDaEntrada('TESTE', '1'))
      await titulo('TESTE I: 1')
      expect(screen.queryByRole('region', { name: 'Alemão' })).toBeNull()
      await userEvent.click(screen.getByRole('button', { name: 'Abrir o Alemão · TESTE I 2020' }))
      expect(coluna('Alemão')).toBeInTheDocument()
      expect(JSON.parse(localStorage.getItem('iconodb:leitura-linguas')!)).toEqual({ de: true })
    })
  })

  describe('celular: as abas PT · DE', () => {
    beforeEach(() => instalarMatchMedia(375))

    it('abre no PT; DE mostra o alemão; não há EN nem ✕', async () => {
      abrir(rotaDoTrecho('TESTE', P11))
      await titulo('TESTE I, p. 11')
      const abas = screen.getByRole('tablist', { name: 'Língua' })
      expect(within(abas).getAllByRole('tab').map((t) => [t.textContent, t.getAttribute('aria-selected')])).toEqual([
        ['PT', 'true'],
        ['DE', 'false'],
      ])
      expect(screen.getByRole('tabpanel')).toContainElement(coluna('Português'))
      // Tarefa 6 (o desenho aprovado): a aba PT já diz a língua; sem o cabeçalho «Português · tradução automática»
      expect(coluna('Português').querySelector('.paragrafo-cab')).toBeNull()
      expect(coluna('Português')).not.toHaveTextContent('tradução automática')
      await userEvent.click(within(abas).getByRole('tab', { name: 'DE' }))
      expect(coluna('Alemão')).toHaveTextContent('Ein Testzeichen allein')
      expect(coluna('Alemão').querySelector('.paragrafo-cab')).toHaveTextContent('TESTE I 2020, p. 11')
      expect(screen.queryByRole('region', { name: 'Português' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Fechar o alemão' })).toBeNull()
    })
  })
})

describe('linhas que o pacote sintético não tem (banco de escrita)', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    Element.prototype.scrollIntoView = vi.fn()
    // o trecho da p. 11 sem português; o campo 3 da entrada 1 com a tradução desatualizada
    await executar(`DELETE FROM pub_TESTE.unit_pt_render WHERE unit_id = '${P11}'`)
    await executar("UPDATE pub_TESTE.catalog_field SET translation_stale = 1 WHERE unit_id = 'TESTE-0001#3'")
    // nove figuras sintéticas citadas na p. 11
    for (let i = 1; i <= 9; i++) {
      await executar(
        `INSERT INTO pub_TESTE.item (id, publication, kind, number, suffix, volume) VALUES ('TESTE-F0${i}', 'TESTE', 'figura', ${100 + i}, '', 'I')`,
      )
      await executar(`INSERT INTO pub_TESTE.passage_item (passage_id, item_id, role) VALUES ('${P11}', 'TESTE-F0${i}', 'mentions')`)
    }
  })
  afterAll(() => usarMotor(null))
  afterEach(() => {
    instalarMatchMedia(375)
    localStorage.clear()
    esquecerPreferenciasDaMemoria()
    esquecerAbaDaLeitura()
  })

  it.each([375, 1280])('sem português: «sem tradução ainda; o original:» e o alemão (%i px)', async (largura) => {
    instalarMatchMedia(largura)
    abrir(rotaDoTrecho('TESTE', P11))
    await titulo('TESTE I, p. 11')
    const pt = coluna('Português')
    expect(within(pt).getByText('sem tradução ainda; o original:')).toBeInTheDocument()
    expect(pt).toHaveTextContent('Ein Testzeichen allein ergibt noch keine Prüfgestalt')
  })

  it.each([375, 1280])('a tradução desatualizada leva a marca (%i px)', async (largura) => {
    instalarMatchMedia(largura)
    abrir(rotaDaEntrada('TESTE', '1'))
    await titulo('TESTE I: 1')
    const pt = coluna('Português')
    expect(within(pt).getAllByText('tradução desatualizada')).toHaveLength(1)
  })

  it('no computador, a faixa com 9 figuras mostra 8 e «Mostrar todas (9)», que abre o resto', async () => {
    instalarMatchMedia(1280)
    abrir(rotaDoTrecho('TESTE', P11))
    await titulo('TESTE I, p. 11')
    const faixa = screen.getByRole('region', { name: 'Figuras citadas' })
    expect(within(faixa).getByRole('heading', { level: 2 })).toHaveTextContent(/Figuras citadas\s*9/)
    expect(within(faixa).getAllByRole('link')).toHaveLength(8)
    const mais = within(faixa).getByRole('button', { name: 'Mostrar todas (9)' })
    expect(mais).toHaveAttribute('aria-expanded', 'false')
    // Tarefa 6: o botão diz o que controla (a faixa das figuras)
    expect(mais.getAttribute('aria-controls')).toBe(faixa.querySelector('.paragrafo-faixa')!.id)
    expect(mais.getAttribute('aria-controls')).toBeTruthy()
    await userEvent.click(mais)
    expect(within(faixa).getAllByRole('link')).toHaveLength(9)
    expect(mais).toHaveAttribute('aria-expanded', 'true')
  })

  it('no celular, a faixa rola com as 9 e não tem o botão', async () => {
    instalarMatchMedia(375)
    abrir(rotaDoTrecho('TESTE', P11))
    await titulo('TESTE I, p. 11')
    const faixa = screen.getByRole('region', { name: 'Figuras citadas' })
    expect(within(faixa).getAllByRole('link')).toHaveLength(9)
    expect(within(faixa).queryByRole('button')).toBeNull()
  })
})

describe('o mapa da legenda com a camada do usuário (§ 9: o sítio de cada entrada é o mesmo que o objeto mostra)', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    Element.prototype.scrollIntoView = vi.fn()
    // a entrada 3 passa a ter o achado num sítio sem coordenada (TESTE-5, Área Probe Teste)
    await executar("UPDATE pub_TESTE.assertion SET site_id = 5 WHERE subject_id = 'TESTE-0003' AND field = 'findspot'")
  })
  afterAll(() => usarMotor(null))
  afterEach(() => {
    instalarMatchMedia(375)
    localStorage.clear()
    esquecerPreferenciasDaMemoria()
    esquecerAbaDaLeitura()
  })

  const pontosDoMapa = (regiao: HTMLElement) =>
    [...regiao.querySelectorAll('[data-ponto]')].map((p) => p.getAttribute('aria-label')!.replace(/, \d+ objetos?$/, '')).sort()

  it.each([375, 1280])('o sítio sem coordenada conta à parte e não vira ponto (%i px)', async (largura) => {
    instalarMatchMedia(largura)
    abrir(rotaDoTrecho('TESTE', 'PA-TESTE-I.S.9-cap-1'))
    await titulo('TESTE I, p. 9')
    const regiao = await screen.findByRole('region', { name: 'Mapa do app: 1 sítio das entradas desta parte · 1 sem coordenada' })
    await waitFor(() => expect(pontosDoMapa(regiao)).toEqual(['Maḥteṣ Teste']))
  })

  it('a troca de sítio, a coordenada corrigida e a mescla da camada do usuário valem no mapa', async () => {
    instalarMatchMedia(1280)
    // a entrada 2 trocada para um sítio novo do usuário, com coordenada; o sítio sem coordenada ganha uma (a correção)
    await registrar('sitio', 'SI-leitura0-1', 'criar', { nome: 'Tell da Leitura', lat: 31.2, lon: 35.3 })
    await registrar('item-sitio', 'CA00002', 'alterar', { sitio: 'SI-leitura0-1', sitioNome: 'Tell da Leitura' })
    await registrar('sitio', 'TESTE-5', 'alterar', { lat: 31.4, lon: 35.4 })
    const primeiro = abrir(rotaDoTrecho('TESTE', 'PA-TESTE-I.S.9-cap-1'))
    await titulo('TESTE I, p. 9')
    let regiao = await screen.findByRole('region', { name: 'Mapa do app: 3 sítios das entradas desta parte' })
    await waitFor(() => expect(pontosDoMapa(regiao)).toEqual(['Maḥteṣ Teste', 'Tell da Leitura', 'Área Probe Teste']))
    primeiro.unmount()

    // o sítio novo mesclado no do livro: o ponto dele some, e a entrada 2 fica no ponto do livro
    await registrar('sitio', 'SI-leitura0-1', 'alterar', { mescladoEm: 'TESTE-1' })
    abrir(rotaDoTrecho('TESTE', 'PA-TESTE-I.S.9-cap-1'))
    await titulo('TESTE I, p. 9')
    regiao = await screen.findByRole('region', { name: 'Mapa do app: 2 sítios das entradas desta parte' })
    await waitFor(() => expect(pontosDoMapa(regiao)).toEqual(['Maḥteṣ Teste', 'Área Probe Teste']))
  })
})

describe('Tarefa 2 (revisão da Tarefa 1, m1): os sítios do pacote lidos uma vez por pacote, não a cada mapa', () => {
  // o motor do pacote sintético, contando as consultas que juntam os objetos por sítio (a de `sitios()`)
  let consultasDosSitios = 0
  beforeAll(async () => {
    const banco = await bancoDeTeste()
    usarMotor({
      abrir: () => banco.abrir(),
      reabrir: () => banco.reabrir(),
      executar: (sql, parametros) => {
        if (sql.includes("a.field = 'findspot' AND a.site_id IS NOT NULL")) consultasDosSitios++
        return banco.executar(sql, parametros)
      },
    })
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterAll(() => usarMotor(null))
  afterEach(() => {
    instalarMatchMedia(375)
    localStorage.clear()
    esquecerPreferenciasDaMemoria()
    esquecerAbaDaLeitura()
  })

  it('dois mapas montados (outra abertura da página e a troca de aba no celular) leem os sítios uma vez', async () => {
    instalarMatchMedia(375)
    const primeiro = abrir(rotaDoTrecho('TESTE', 'PA-TESTE-I.S.9-cap-1'))
    await titulo('TESTE I, p. 9')
    await screen.findByRole('region', { name: 'Mapa do app: 2 sítios das entradas desta parte' })
    const depoisDoPrimeiro = consultasDosSitios
    expect(depoisDoPrimeiro).toBeGreaterThan(0)
    primeiro.unmount()

    abrir(rotaDoTrecho('TESTE', 'PA-TESTE-I.S.9-cap-1'))
    await titulo('TESTE I, p. 9')
    await screen.findByRole('region', { name: 'Mapa do app: 2 sítios das entradas desta parte' })
    // DE e de volta ao PT: o mapa sai e é montado de novo
    await userEvent.click(screen.getByRole('tab', { name: 'DE' }))
    await userEvent.click(screen.getByRole('tab', { name: 'PT' }))
    await screen.findByRole('region', { name: 'Mapa do app: 2 sítios das entradas desta parte' })
    expect(consultasDosSitios).toBe(depoisDoPrimeiro)
  })
})

describe('Tarefa 2 (revisão da Tarefa 1, m2): os atalhos do mapa na leitura só valem com o mapa à vista ou com o foco nele', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterAll(() => usarMotor(null))
  let intersecao: ReturnType<typeof instalarIntersecao>
  beforeEach(() => {
    intersecao = instalarIntersecao()
  })
  afterEach(() => {
    intersecao.remover()
    instalarMatchMedia(375)
    localStorage.clear()
    esquecerPreferenciasDaMemoria()
    esquecerAbaDaLeitura()
  })

  it.each([375, 1280])('fora da vista e sem foco, + − 0 r ficam livres; à vista ou com o foco no mapa, valem (%i px)', async (largura) => {
    instalarMatchMedia(largura)
    abrir(rotaDoTrecho('TESTE', 'PA-TESTE-I.S.9-cap-1'))
    await titulo('TESTE I, p. 9')
    const regiao = await screen.findByRole('region', { name: 'Mapa do app: 2 sítios das entradas desta parte' })
    const palco = await within(regiao).findByRole('group', { name: 'Mapa dos sítios' })
    await waitFor(() => expect(palco.querySelectorAll('[data-ponto]')).toHaveLength(2))
    const registrados = () => ['+', '-', '=', '_', '0', 'r'].map((t) => atalhoRegistrado(t, 'mapa'))
    // o mapa montado, mas fora da vista: nenhum atalho do mapa na página
    expect(registrados()).toEqual([false, false, false, false, false, false])
    expect(palco).not.toHaveAttribute('data-atalhos')

    act(() => intersecao.mudar(true))
    await waitFor(() => expect(registrados()).toEqual([true, true, true, true, true, true]))
    expect(palco).toHaveAttribute('data-atalhos', '')
    act(() => intersecao.mudar(false))
    await waitFor(() => expect(registrados()).toEqual([false, false, false, false, false, false]))

    // fora da vista, o foco no mapa (o palco é uma parada de Tab) liga; o foco fora dele desliga
    act(() => palco.focus())
    await waitFor(() => expect(atalhoRegistrado('+', 'mapa')).toBe(true))
    act(() => screen.getByRole('heading', { level: 1 }).focus())
    await waitFor(() => expect(atalhoRegistrado('+', 'mapa')).toBe(false))
  })

  it.each([375, 1280])('fix 1: o cartão aberto não liga os atalhos com o mapa fora da vista; à vista, o Esc fecha o cartão (%i px)', async (largura) => {
    instalarMatchMedia(largura)
    abrir(rotaDoTrecho('TESTE', 'PA-TESTE-I.S.9-cap-1'))
    await titulo('TESTE I, p. 9')
    const regiao = await screen.findByRole('region', { name: 'Mapa do app: 2 sítios das entradas desta parte' })
    const palco = await within(regiao).findByRole('group', { name: 'Mapa dos sítios' })
    await waitFor(() => expect(palco.querySelectorAll('[data-ponto]')).toHaveLength(2))
    act(() => intersecao.mudar(true))
    await userEvent.click(within(palco).getByRole('button', { name: /^Tell Probe Teste, / }))
    await screen.findByRole('dialog', { name: 'Sítio selecionado: Tell Probe Teste' })

    // o mapa (e o cartão, que fica dentro dele) rolado para fora, o foco fora do mapa: nenhum atalho do mapa
    act(() => intersecao.mudar(false))
    act(() => screen.getByRole('heading', { level: 1 }).focus())
    await waitFor(() => expect(atalhoRegistrado('Escape', 'mapa')).toBe(false))
    expect(atalhoRegistrado('+', 'mapa')).toBe(false)
    expect(palco).not.toHaveAttribute('data-atalhos')
    expect(screen.getByRole('dialog', { name: 'Sítio selecionado: Tell Probe Teste' })).toBeInTheDocument()

    // de volta à vista: o Esc fecha o cartão
    act(() => intersecao.mudar(true))
    await waitFor(() => expect(palco).toHaveAttribute('data-atalhos', ''))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Sítio selecionado/ })).toBeNull())
  })
})
