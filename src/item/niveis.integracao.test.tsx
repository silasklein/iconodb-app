/**
 * Tarefa 18, decisão 35, nas telas e sobre o pacote sintético: os níveis em destaque no Item, com as hipóteses do livro e as
 * SKC (inclusive a que a pessoa edita e a de um termo criado por ela), o painel (computador) e a folha (celular).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { atalhoRegistrado } from '../app/atalhos'
import { shaDoTrecho } from '../notas/ancora'
import { usarMotor } from '../banco/cliente'
import { numerosDosObjetos } from '../banco/consultas'
import { definirFonteDosNumerosDoPacote, recarregarNumerosDoPacote } from '../objetos-skc/pacote'
import { teclasNaoDeclaradas } from '../test/atalhosDeclarados'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Item } from '../telas/Item'
import { estadoAtual, registrar } from '../usuario/estado'
import type { Nivel } from '../banco/tipos'

vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
vi.mock('../pacote/imagens', async (original) => ({ ...(await original<typeof import('../pacote/imagens')>()), urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

function abrir(caminho: string) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/item/:numero" element={<Item />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Um id novo a cada hipótese: o de uma excluída não volta a valer (o IndexedDB é um só no arquivo).
let proximo = 100
const criarSkc = async (nivel: Nivel, rotulo: string, termo = 'GL-900001', objeto = 'CA00001') => {
  const id = `HY-testeaaa-${proximo++}`
  await registrar('hipotese', id, 'criar', { objeto, sobre: 'objeto', elemento: null, elementoRotulo: '', termos: [termo], termosRotulos: [rotulo], nivel, modalidade: 'probable', justificativa: '', ancora: null })
  return id
}

/** O texto de CA00002 (pacote sintético): a hipótese do livro está no «leão-de-teste»; a SKC vai em «estrela de prova», depois dela. */
const TEXTO_DE_CA00002 = 'No verso está o sinal 𓀀 ao lado de um leão-de-teste de cauda erguida; talvez uma estrela de prova.'
const criarSkcNoTexto = async (nivel: Nivel) => {
  const id = `HY-testeaaa-${proximo++}`
  const inicio = TEXTO_DE_CA00002.indexOf('estrela') - 1 // o 𓀀 é 1 code point e 2 unidades UTF-16
  await registrar('hipotese', id, 'criar', {
    objeto: 'CA00002',
    sobre: 'objeto',
    elemento: null,
    elementoRotulo: '',
    termos: ['GL-900002'],
    termosRotulos: ['figura denteada'],
    nivel,
    modalidade: 'probable',
    justificativa: '',
    ancora: { fonte: 'PA-TESTE-0002-cat-1', lingua: 'pt', inicio, fim: inicio + 16, trecho: 'estrela de prova', sha: await shaDoTrecho(TEXTO_DE_CA00002) },
  })
  return id
}

const cheios = (el: Element | null) => el?.querySelectorAll('rect[data-cheio="true"]').length

async function abrirSecao() {
  await screen.findByRole('heading', { level: 1 })
  const botao = await screen.findByRole('button', { name: /Hipóteses por nível/ })
  if (botao.getAttribute('aria-expanded') !== 'true') await userEvent.click(botao)
  return screen.findByRole('region', { name: 'Hipóteses por nível' })
}

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  Element.prototype.scrollIntoView = vi.fn()
})
afterAll(() => usarMotor(null))
beforeEach(async () => {
  instalarMatchMedia(375)
  localStorage.clear()
  definirFonteDosNumerosDoPacote(numerosDosObjetos)
  await recarregarNumerosDoPacote()
  for (const tipo of ['hipotese', 'verbete', 'regiao', 'posicao'] as const) {
    for (const r of estadoAtual().registros.get(tipo)?.values() ?? []) if (!r.excluido) await registrar(tipo, r.id, 'excluir')
  }
})
afterEach(() => definirFonteDosNumerosDoPacote(null))

describe('o Item com os níveis em destaque', () => {
  it('livro + SKC: um bloco por nível, a contagem de cada um é a das linhas, e a da seção é a soma; a excluída não conta', async () => {
    await criarSkc('pre_iconographic', 'olho meu')
    const ideia = await criarSkc('iconological', 'ideia minha')
    const apagada = await criarSkc('iconological', 'ideia apagada')
    abrir('/item/CA00001')
    // O livro dá 1 pré-iconográfica (HY-900002) e 1 iconográfica (HY-900001); as SKC, 1 + 2.
    const botao = await screen.findByRole('button', { name: /Hipóteses por nível/ })
    await waitFor(() => expect(botao).toHaveTextContent('5'))
    await registrar('hipotese', apagada, 'excluir')
    await waitFor(() => expect(botao).toHaveTextContent('4'))
    const secao = await abrirSecao()
    const esperado: [string, number][] = [
      ['Pré-iconográfico', 2],
      ['Iconográfico', 1],
      ['Iconológico', 1],
    ]
    for (const [nome, n] of esperado) {
      const bloco = within(secao).getByRole('region', { name: nome })
      expect(bloco.querySelectorAll('[data-hipotese-linha]')).toHaveLength(n)
      expect(within(bloco).getByText(n === 1 ? '1 hipótese' : `${n} hipóteses`)).toBeInTheDocument()
    }
    expect(secao.querySelector(`[data-hipotese-linha="${apagada}"]`)).toBeNull()
    expect(secao.querySelectorAll('[data-hipotese-linha]')).toHaveLength(4)
    // Uma legenda só, e o marcador de cada linha é o do bloco dela.
    expect(within(secao).getAllByRole('group', { name: 'Legenda dos níveis' })).toHaveLength(1)
    expect(cheios(secao.querySelector(`[data-hipotese-linha="${ideia}"]`))).toBe(3)
    expect(cheios(secao.querySelector('[data-hipotese-linha="HY-900002"]'))).toBe(1)
  })

  it('SKC de um termo criado pela pessoa (decisão 41): entra no nível dela, com o marcador, e o painel abre', async () => {
    await registrar('verbete', 'GL-testeaaa-9', 'criar', { forma: 'termo só meu', status: 'proposed' })
    const id = await criarSkc('iconological', 'termo só meu', 'GL-testeaaa-9')
    abrir('/item/CA00001')
    const secao = await abrirSecao()
    const linha = await waitFor(() => {
      const l = secao.querySelector<HTMLElement>(`[data-hipotese-linha="${id}"]`)
      if (!l) throw new Error('sem linha')
      return l
    })
    expect(linha).toHaveTextContent('termo só meu')
    expect(linha.closest('section')).toHaveAccessibleName('Iconológico')
    expect(cheios(linha)).toBe(3)
    await userEvent.click(linha)
    const painel = await screen.findByRole('dialog', { name: 'Hipótese termo só meu' })
    expect(cheios(painel.querySelector('.painel-hipotese-etiqueta'))).toBe(3)
  })
})

describe.each([
  ['celular (folha)', 375],
  ['computador (painel lateral)', 1280],
])('o painel da hipótese no %s', (_nome, largura) => {
  beforeEach(() => instalarMatchMedia(largura))

  it('livro: o cabeçalho leva o marcador do nível, com o nome escrito ao lado e sem «nível …» por cima', async () => {
    abrir('/item/CA00001?hipotese=HY-900001')
    const painel = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
    const etiqueta = painel.querySelector('.painel-hipotese-etiqueta')
    expect(cheios(etiqueta)).toBe(2)
    expect(etiqueta).toHaveTextContent(/^Iconográfico · /)
    expect((etiqueta as HTMLElement).textContent).not.toMatch(/nível/i)
  })

  it('SKC: o marcador do cabeçalho e o da linha seguem o nível que a pessoa edita, na hora', async () => {
    const id = await criarSkc('iconographic', 'figura denteada', 'GL-900002')
    const seletor = `[data-hipotese-linha="${id}"]`
    abrir('/item/CA00001')
    const secao = await abrirSecao()
    const linha = await waitFor(() => {
      const l = secao.querySelector<HTMLElement>(seletor)
      if (!l) throw new Error('sem linha')
      return l
    })
    expect(cheios(linha)).toBe(2)
    await userEvent.click(linha)
    const painel = await screen.findByRole('dialog', { name: 'Hipótese figura denteada' })
    const etiqueta = () => painel.querySelector('.painel-hipotese-etiqueta') as HTMLElement
    expect(cheios(etiqueta())).toBe(2)
    expect(etiqueta()).toHaveTextContent('SKC')
    await userEvent.click(within(painel).getByRole('button', { name: 'Editar a hipótese' }))
    await userEvent.click(within(painel).getByRole('radio', { name: 'iconológico' }))
    await waitFor(() => expect(cheios(etiqueta())).toBe(3))
    expect(etiqueta()).toHaveTextContent(/^Iconológico · /)
    expect(etiqueta()).not.toHaveTextContent('Iconográfico')
    // A linha atrás do painel mudou de bloco e de marcador; as contagens acompanham.
    await waitFor(() => expect(cheios(secao.querySelector(seletor))).toBe(3))
    expect(secao.querySelector(seletor)!.closest('section')).toHaveAccessibleName('Iconológico')
    expect(within(within(secao).getByRole('region', { name: 'Iconográfico' })).getByText('1 hipótese')).toBeInTheDocument()
    expect(within(within(secao).getByRole('region', { name: 'Iconológico' })).getByText('1 hipótese')).toBeInTheDocument()
  })
})

describe('as teclas do Item seguem iguais', () => {
  it('h abre e fecha «Hipóteses por nível»; Shift+H abre a nova hipótese; nenhuma tecla nova ficou sem declaração', async () => {
    await criarSkc('iconographic', 'figura minha', 'GL-900002')
    abrir('/item/CA00001')
    await screen.findByRole('heading', { level: 1 })
    const botao = await screen.findByRole('button', { name: /Hipóteses por nível/ })
    // O mapa de teclas do item é registrado num efeito: espera o registro antes de apertar (revisão 2 da Tarefa 16, N5).
    await waitFor(() => expect(atalhoRegistrado('h', 'item')).toBe(true))
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(document.body, { key: 'h' })
    await waitFor(() => expect(botao).toHaveAttribute('aria-expanded', 'true'))
    expect(await screen.findByRole('region', { name: 'Pré-iconográfico' })).toBeInTheDocument()
    expect(teclasNaoDeclaradas(document.body)).toEqual([])
    fireEvent.keyDown(document.body, { key: 'h' })
    await waitFor(() => expect(botao).toHaveAttribute('aria-expanded', 'false'))
    await waitFor(() => expect(atalhoRegistrado('Shift+H', 'item')).toBe(true))
    fireEvent.keyDown(document.body, { key: 'H', shiftKey: true })
    expect(await screen.findByRole('dialog', { name: 'Nova hipótese' })).toBeInTheDocument()
  })

  it('[ e ] trocam de hipótese no texto com o painel aberto: o título e o marcador do cabeçalho acompanham', async () => {
    // CA00002 tem a hipótese do livro (iconográfica, ■■□) e, depois dela no texto, uma SKC pré-iconográfica (■□□).
    await criarSkcNoTexto('pre_iconographic')
    abrir('/item/CA00002?hipotese=HY-900003')
    const livro = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
    expect(cheios(livro.querySelector('.painel-hipotese-etiqueta'))).toBe(2)
    // A ordem no texto conta as duas; o mapa de teclas do painel é registrado num efeito: espera os dois antes de apertar.
    await within(livro).findByText('1 / 2 no texto')
    await waitFor(() => expect(atalhoRegistrado(']', 'hipotese')).toBe(true))
    fireEvent.keyDown(document.body, { key: ']' })
    const skc = await screen.findByRole('dialog', { name: 'Hipótese figura denteada' })
    expect(cheios(skc.querySelector('.painel-hipotese-etiqueta'))).toBe(1)
    expect(screen.queryByRole('dialog', { name: 'Hipótese leão-de-teste' })).toBeNull()
    await within(skc).findByText('2 / 2 no texto')
    fireEvent.keyDown(document.body, { key: '[' })
    const volta = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
    expect(cheios(volta.querySelector('.painel-hipotese-etiqueta'))).toBe(2)
  })
})

describe('a prévia do mouse no Item (computador): junto do trecho, com o termo e o alvo da hipótese', () => {
  beforeEach(() => instalarMatchMedia(1280, { hover: true }))

  it('hipótese do livro e hipótese SKC: «Termo: … · sobre …» vem do nome vivo e do alvo da hipótese', async () => {
    await criarSkcNoTexto('pre_iconographic')
    abrir('/item/CA00002')
    const livro = await screen.findByRole('link', { name: /^leão-de-teste, hipótese: iconográfico/ })
    await userEvent.hover(livro)
    const previa = livro.querySelector('.ancora-previa')!
    expect(previa).toHaveTextContent('Iconográfico · provável')
    expect(previa).toHaveTextContent('Termo: leão-de-teste · sobre o objeto inteiro')
    await userEvent.unhover(livro)
    const skc = await screen.findByRole('link', { name: /^estrela de prova, hipótese SKC: pré-iconográfico/ })
    await userEvent.hover(skc)
    expect(skc.querySelector('.ancora-previa')).toHaveTextContent('Termo: figura denteada · sobre o objeto inteiro')
    expect(cheios(skc.querySelector('.ancora-previa'))).toBe(1)
  })
})
