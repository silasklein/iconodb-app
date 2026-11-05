/**
 * Tarefa 11, a leitura mostra a forma em uso do usuário no lugar da forma do pacote, nos trechos de termo.
 *
 * ARMADILHA DOS DESLOCAMENTOS (re-revisão da Tarefa 10, Minor 5): as âncoras das hipóteses são posições (code points)
 * no texto GUARDADO (`unit_pt_render.texto`). Mostrar outra forma muda só o que APARECE: a peça do termo continua
 * guardando o `data-b`/`data-b-fim` do texto guardado, e o texto de que as posições e o sha saem não muda nunca.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import type { Ancora, Termo } from '../banco/tipos'
import { shaDoTrecho } from '../notas/ancora'
import { conferirAncora, ancoraDoTrecho } from '../hipoteses/ancora'
import { lerHipotese } from '../hipoteses/modelo'
import { intervaloNoBloco, trechoDoIntervalo } from '../hipoteses/selecao'
import { textoGuardado } from '../hipoteses/textosNaTela'
import { numerosDosObjetos } from '../banco/consultas'
import { Leitura } from '../item/Leitura'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { definirFonteDosNumerosDoPacote, recarregarNumerosDoPacote } from '../objetos-skc/pacote'
import { Item } from '../telas/Item'
import { estadoAtual, registrar } from '../usuario/estado'

vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
vi.mock('../pacote/imagens', async (original) => ({ ...(await original<typeof import('../pacote/imagens')>()), urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

const TEXTO = 'No verso está o sinal 𓀀 ao lado de um leão-de-teste de cauda erguida; talvez uma estrela de prova.'
const cp = (s: string) => [...TEXTO.slice(0, TEXTO.indexOf(s))].length
const TERMO: Termo = { glId: 'GL-900001', inicio: cp('leão'), fim: cp('leão') + 13 }
const ANCORA_DO_TERMO: Ancora = { hipoteseId: 'HY-900003', glId: 'GL-900001', inicio: cp('leão'), fim: cp('leão') + 13, nivel: 'iconographic', modalidade: 'probable' }
const ANCORA_DEPOIS: Ancora = { hipoteseId: 'HY-900005', glId: 'GL-900008', inicio: cp('estrela'), fim: cp('estrela') + 16, nivel: 'iconographic', modalidade: 'probable' }

function desenhar(props: Partial<Parameters<typeof Leitura>[0]> = {}) {
  return render(
    <MemoryRouter>
      <Leitura fonte="TESTE I: 2" publicacao="TESTE" texto={TEXTO} original="Original." termos={[TERMO]} ancoras={[]} trechoId="PA-TESTE-0002-cat-1" {...props} />
    </MemoryRouter>,
  )
}
const formaEmUso = (id: string, forma: string | null) => registrar('verbete', id, 'alterar', { formaEmUso: forma })

// A regra de quando a forma em uso substitui o texto (revisão 1, I1) lê o `pt` e o `pt_text` do pacote.
beforeAll(async () => {
  usarMotor(await bancoDeTeste())
})
afterAll(() => usarMotor(null))
afterEach(() => instalarMatchMedia(375))

describe('Leitura: a forma em uso no lugar da do pacote, só no que aparece', () => {
  it('o termo aparece com a forma do usuário; o link, a posição guardada e o texto guardado seguem os do pacote', async () => {
    await formaEmUso('GL-900001', 'leão da prova')
    const { container } = desenhar()
    const link = await screen.findByRole('link', { name: 'leão da prova (na tradução: leão-de-teste)' })
    expect(link).toHaveTextContent(/^leão da prova$/)
    expect(link).toHaveAttribute('href', '/verbete/GL-900001')
    // As posições da peça são as do texto guardado (o termo do pacote tem 13 caracteres, a forma em uso, 13 também: só
    // a conta importa), e o texto registrado para a âncora é o guardado.
    expect(link).toHaveAttribute('data-b', String(TEXTO.indexOf('leão')))
    expect(link).toHaveAttribute('data-b-fim', String(TEXTO.indexOf('leão') + 'leão-de-teste'.length))
    expect(textoGuardado('PA-TESTE-0002-cat-1', 'pt')).toBe(TEXTO)
    expect(container.querySelector('[data-trecho-fonte]')).toHaveTextContent('um leão da prova de cauda')
  })

  it('voltar à proposta (null) devolve a forma do pacote', async () => {
    await formaEmUso('GL-900001', 'outra')
    desenhar()
    await screen.findByRole('link', { name: 'outra (na tradução: leão-de-teste)' })
    await formaEmUso('GL-900001', null)
    expect(await screen.findByRole('link', { name: 'leão-de-teste' })).toBeInTheDocument()
  })

  it('no começo da frase a forma mantém a maiúscula do texto ("Selo de teste" → "Selo de prova")', async () => {
    await formaEmUso('GL-900009', 'selo de prova')
    const texto = 'Selo de teste com estrela de prova.'
    desenhar({ texto, termos: [{ glId: 'GL-900009', inicio: 0, fim: 13 }] })
    expect(await screen.findByRole('link', { name: 'Selo de prova (na tradução: Selo de teste)' })).toBeInTheDocument()
  })

  it('dentro de uma âncora o termo marcado também mostra a forma, e o nome da âncora a acompanha', async () => {
    await formaEmUso('GL-900001', 'leão da prova')
    desenhar({ ancoras: [ANCORA_DO_TERMO] })
    const ancora = await screen.findByRole('link', { name: /^leão da prova/ })
    expect(ancora).toHaveClass('ancora')
    expect(within(ancora).getByText('leão da prova')).toHaveClass('termo-marcado')
    expect(within(ancora).getByText('leão da prova')).toHaveAttribute('data-b-fim', String(TEXTO.indexOf('leão') + 'leão-de-teste'.length))
    expect(ancora).toHaveAccessibleName('leão da prova, na tradução: leão-de-teste, hipótese: iconográfico, provável')
  })

  it('a dica do termo (forma em uso, texto do tradutor) vai DENTRO da prévia da hipótese: uma caixa só, sem esconder a informação', async () => {
    instalarMatchMedia(1280, { hover: true })
    // Termo inteiro e escrito como no pacote: é trocado, e a dica diz o que o tradutor escreveu.
    await formaEmUso('GL-900001', 'leão da prova')
    desenhar({ ancoras: [ANCORA_DO_TERMO], resumoDaHipotese: () => ({ termo: 'leão da prova', sobre: 'o objeto inteiro' }) })
    const ancora = await screen.findByRole('link', { name: /^leão da prova/ })
    expect(document.querySelector('.ancora-previa')).toBeNull()
    await userEvent.hover(ancora)
    const previa = document.querySelectorAll<HTMLElement>('.ancora-previa')
    expect(previa).toHaveLength(1)
    expect(previa[0]).toHaveTextContent('Na tradução: leão-de-teste')
    expect(previa[0]).toHaveTextContent('Termo: leão da prova · sobre o objeto inteiro')
    expect(previa[0]).toHaveTextContent('Iconográfico · provável')
    // Sem forma em uso não há dica no termo, e a prévia não inventa uma.
    await formaEmUso('GL-900001', null)
    await userEvent.unhover(ancora)
    await userEvent.hover(await screen.findByRole('link', { name: /^leão-de-teste/ }))
    expect(document.querySelector('.ancora-previa')).not.toHaveTextContent(/Na tradução|Forma em uso/)
  })

  it('um termo cortado por uma âncora (só uma parte dentro) fica como está: sem repetir a forma em cada pedaço', async () => {
    await formaEmUso('GL-900001', 'leão da prova')
    const meio: Ancora = { ...ANCORA_DO_TERMO, inicio: cp('leão') + 5 }
    const { container } = desenhar({ ancoras: [meio] })
    await waitFor(() => expect(container.querySelector('.ancora')).not.toBeNull())
    const bloco = container.querySelector('[data-trecho-fonte]')!
    expect(bloco.textContent).toContain('leão-de-teste')
    expect(bloco.textContent).not.toContain('leão da prova')
  })

  it('forma MAIS LONGA e MAIS CURTA: a seleção depois do termo e dentro da âncora segue sendo a do texto guardado', async () => {
    const { container, rerender } = desenhar({ ancoras: [ANCORA_DEPOIS] })
    const bloco = () => container.querySelector('[data-trecho-fonte]') as HTMLElement
    const doTexto = (trecho: string) => {
      const caminhante = document.createTreeWalker(bloco(), NodeFilter.SHOW_TEXT)
      for (let n = caminhante.nextNode() as Text | null; n; n = caminhante.nextNode() as Text | null) {
        const i = n.data.indexOf(trecho)
        if (i < 0) continue
        const r = document.createRange()
        r.setStart(n, i)
        r.setEnd(n, i + trecho.length)
        return r
      }
      throw new Error(`não achado: ${trecho}`)
    }
    for (const forma of ['leão-de-teste da época de transição do reino do sul', 'leão']) {
      await formaEmUso('GL-900001', forma)
      rerender(
        <MemoryRouter>
          <Leitura fonte="TESTE I: 2" publicacao="TESTE" texto={TEXTO} original="Original." termos={[TERMO]} ancoras={[ANCORA_DEPOIS]} trechoId="PA-TESTE-0002-cat-1" />
        </MemoryRouter>,
      )
      await screen.findByRole('link', { name: `${forma} (na tradução: leão-de-teste)` })
      for (const trecho of ['de cauda', 'estrela de prova', 'de prova']) {
        const t = trechoDoIntervalo(doTexto(trecho))!
        expect(TEXTO.slice(t.inicio, t.fim), `${trecho} com "${forma}"`).toBe(trecho)
      }
      // A âncora depois do termo continua cobrindo exatamente as mesmas palavras.
      expect(container.querySelector('.ancora')).toHaveTextContent(/^estrela de prova/)
      // E de volta: o trecho guardado vira o mesmo intervalo na tela.
      const dentro = intervaloNoBloco(bloco(), TEXTO.indexOf('de cauda'), TEXTO.indexOf('de cauda') + 8)!
      expect(dentro.toString()).toBe('de cauda')
      // Uma ponta dentro do termo vai à borda dele: o termo, que aparece com outra forma, é indivisível.
      const termo = container.querySelector('a.termo')!.firstChild as Text
      const r = document.createRange()
      r.setStart(termo, Math.min(2, termo.data.length - 1))
      r.setEnd(doTexto('cauda').endContainer, doTexto('cauda').endOffset)
      const t = trechoDoIntervalo(r)!
      expect(TEXTO.slice(t.inicio, t.fim)).toBe('leão-de-teste de cauda')
    }
  })

  it('a âncora calculada com a forma em uso à vista é a mesma e o sha confere com o texto guardado', async () => {
    await formaEmUso('GL-900001', 'leão')
    const { container } = desenhar()
    const bloco = container.querySelector('[data-trecho-fonte]') as HTMLElement
    const caminhante = document.createTreeWalker(bloco, NodeFilter.SHOW_TEXT)
    let alvo: Range | null = null
    for (let n = caminhante.nextNode() as Text | null; n && !alvo; n = caminhante.nextNode() as Text | null) {
      const i = n.data.indexOf('estrela de prova')
      if (i >= 0) {
        alvo = document.createRange()
        alvo.setStart(n, i)
        alvo.setEnd(n, i + 16)
      }
    }
    const t = trechoDoIntervalo(alvo!)!
    const ancora = await ancoraDoTrecho({ fonte: t.fonte, lingua: 'pt', texto: textoGuardado(t.fonte, 'pt')!, inicio: t.inicio, fim: t.fim })
    expect(ancora).toMatchObject({ trecho: 'estrela de prova', inicio: cp('estrela'), fim: cp('estrela') + 16 })
    expect(ancora!.sha).toBe(await shaDoTrecho(TEXTO))
    expect(await conferirAncora(ancora!, textoGuardado(t.fonte, 'pt')!)).toBe('ok')
  })
})

describe('na tela do item: editar o termo não mexe nas âncoras já registradas nem acende "texto mudou"', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })
  beforeEach(async () => {
    definirFonteDosNumerosDoPacote(numerosDosObjetos)
    await recarregarNumerosDoPacote()
  })
  afterEach(() => definirFonteDosNumerosDoPacote(null))

  const ID = 'HY-testeaaa-11'
  function abrir(caminho: string) {
    const [pathname, busca] = caminho.split('?')
    return render(
      <MemoryRouter initialEntries={[{ pathname: pathname!, search: busca ? `?${busca}` : '' }]}>
        <Routes>
          <Route path="/item/:numero" element={<Item />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('hipótese SKC em "estrela de prova" (depois do termo): longa e curta, a marca cobre as mesmas palavras e o painel não avisa', async () => {
    // A âncora como o app a grava: posições do texto guardado (code points) e o sha dele.
    const texto = 'No verso está o sinal 𓀀 ao lado de um leão-de-teste de cauda erguida; talvez uma estrela de prova.'
    const inicio = [...texto.slice(0, texto.indexOf('estrela'))].length
    await registrar('hipotese', ID, 'criar', {
      objeto: 'CA00002',
      sobre: 'objeto',
      elemento: null,
      elementoRotulo: '',
      termos: ['GL-900001'],
      termosRotulos: ['leão-de-teste'],
      nivel: 'iconographic',
      modalidade: 'probable',
      justificativa: '',
      ancora: { fonte: 'PA-TESTE-0002-cat-1', lingua: 'pt', inicio, fim: inicio + 16, trecho: 'estrela de prova', sha: await shaDoTrecho(texto) },
    })
    for (const forma of ['leão-de-teste da época de transição do reino do sul', 'leão']) {
      await formaEmUso('GL-900001', forma)
      const { unmount } = abrir(`/item/CA00002?hipotese=${ID}`)
      const painel = await screen.findByRole('dialog', { name: /^Hipótese / })
      await waitFor(() => expect(document.querySelector(`[data-hipotese="${ID}"]`)).toHaveTextContent('estrela de prova'))
      // O termo, mostrado com a forma nova, em toda a leitura.
      expect(document.querySelector('[data-trecho-fonte="PA-TESTE-0002-cat-1"]')).toHaveTextContent(forma)
      expect(await within(painel).findByText('estrela de prova', { exact: false })).toBeInTheDocument()
      // Dá tempo da conferência assíncrona (SHA-256) terminar: nada de "texto mudou".
      await new Promise((r) => setTimeout(r, 80))
      expect(within(painel).queryByText(/O texto da fonte mudou|A tradução mudou/)).toBeNull()
      expect(lerHipotese(estadoAtual().registro('hipotese', ID)!).ancora).toMatchObject({ inicio, fim: inicio + 16, trecho: 'estrela de prova' })
      unmount()
    }
  })

  it('uma hipótese nova num trecho depois do termo, com a forma nova à vista, ancora no texto guardado', async () => {
    await formaEmUso('GL-900001', 'leão da época de transição do reino do sul')
    abrir('/item/CA00002')
    const bloco = await waitFor(() => {
      const b = document.querySelector('[data-trecho-fonte="PA-TESTE-0002-cat-1"]')
      if (!b) throw new Error('sem bloco')
      return b
    })
    await screen.findByRole('link', { name: /^leão da época de transição do reino do sul/ })
    const caminhante = document.createTreeWalker(bloco, NodeFilter.SHOW_TEXT)
    for (let n = caminhante.nextNode() as Text | null; n; n = caminhante.nextNode() as Text | null) {
      const i = n.data.indexOf('erguida')
      if (i < 0) continue
      const r = document.createRange()
      r.setStart(n, i)
      r.setEnd(n, i + 7)
      const t = trechoDoIntervalo(r)!
      const texto = textoGuardado('PA-TESTE-0002-cat-1', 'pt')!
      expect(texto.slice(t.inicio, t.fim)).toBe('erguida')
      const a = await ancoraDoTrecho({ fonte: t.fonte, lingua: 'pt', texto, inicio: t.inicio, fim: t.fim })
      expect(a).toMatchObject({ trecho: 'erguida', inicio: [...texto.slice(0, texto.indexOf('erguida'))].length })
      return
    }
    throw new Error('sem texto')
  })
})
void userEvent
