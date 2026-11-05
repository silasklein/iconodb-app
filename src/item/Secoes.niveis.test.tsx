/**
 * Tarefa 18, decisão 35: "Hipóteses por nível" com cada nível em destaque (ItemNiveis.dc.html, PC-ItemNiveis.dc.html).
 * Dados sintéticos TESTE; nada de conteúdo de livro.
 */
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import type { Hipotese, Nivel } from '../banco/tipos'
import type { HipoteseSkc } from '../hipoteses/modelo'
import type { PorNivel } from '../hipoteses/doUsuario'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { contarHipoteses, HipotesesPorNivel } from './Secoes'

const livro = (id: string, nivel: Nivel, nome: string, extra: Partial<Hipotese> = {}): Hipotese => ({
  id,
  nivel,
  modalidade: 'asserted',
  publicacao: 'TESTE',
  locator: null,
  passagemId: null,
  citacao: null,
  citacaoInicio: null,
  citacaoFim: null,
  citadaDe: null,
  alvo: { tipo: 'item', id: 'IT-1', numero: 'CA00001', itemId: 'IT-1', rotulo: null },
  termos: [{ glId: 'GL-900001', pt: nome, de: null }],
  autores: [],
  verificacao: 'recorded',
  religiosidade: null,
  ancora: { unidade: 'U', metodo: 'termo', glId: 'GL-900001', inicio: 0, fim: 3 },
  ...extra,
})
const skc = (id: string, nivel: Nivel | null, nome: string, extra: Partial<HipoteseSkc> = {}): HipoteseSkc => ({
  id,
  objeto: 'CA00001',
  sobre: { tipo: 'objeto' },
  termos: [{ id: 'GL-900001', rotulo: nome }],
  nivel,
  modalidade: 'probable',
  justificativa: '',
  ancora: null,
  excluido: false,
  criadoEm: '1',
  ...extra,
})
const SEM_SKC: PorNivel = { pre_iconographic: [], iconographic: [], iconological: [], semNivel: [] }

function desenhar(porNivel: Partial<Record<Nivel, Hipotese[]>>, doUsuario: Partial<PorNivel> = {}, outras: Hipotese[] = [], acoes?: ReactNode) {
  const item = {
    hipotesesPorNivel: { pre_iconographic: [], iconographic: [], iconological: [], ...porNivel },
    outrasHipoteses: outras,
  }
  return render(
    <MemoryRouter initialEntries={['/item/CA00001']}>
      <HipotesesPorNivel item={item} skc={{ ...SEM_SKC, ...doUsuario }} acoes={acoes} />
    </MemoryRouter>,
  )
}

const bloco = (nome: string) => screen.getByRole('region', { name: nome })

describe('cada nível é um bloco (decisão 35)', () => {
  beforeEach(() => instalarMatchMedia(375))

  it('título, linha explicativa e contagem; o título é o nome escrito, sem a contagem dentro dele', () => {
    desenhar({
      pre_iconographic: [livro('HY-900101', 'pre_iconographic', 'olhos de teste'), livro('HY-900102', 'pre_iconographic', 'boca de teste')],
      iconographic: [livro('HY-900103', 'iconographic', 'figura de teste')],
      iconological: [livro('HY-900104', 'iconological', 'ideia de teste')],
    })
    const pre = bloco('Pré-iconográfico')
    expect(within(pre).getByRole('heading', { level: 3, name: 'Pré-iconográfico' })).toBeInTheDocument()
    expect(within(pre).getByText('O que se vê')).toBeInTheDocument()
    expect(within(pre).getByText('2 hipóteses')).toBeInTheDocument()
    expect(within(bloco('Iconográfico')).getByText('O que significa')).toBeInTheDocument()
    expect(within(bloco('Iconográfico')).getByText('1 hipótese')).toBeInTheDocument()
    expect(within(bloco('Iconológico')).getByText('O que revela da cultura')).toBeInTheDocument()
  })

  it('a contagem tem texto de verdade para o leitor de tela («2 hipóteses»), e o número escrito fica fora da leitura (nada de aria-label num span)', () => {
    desenhar({ pre_iconographic: [livro('HY-900101', 'pre_iconographic', 'olhos de teste'), livro('HY-900102', 'pre_iconographic', 'boca de teste')] })
    const cabeca = bloco('Pré-iconográfico').querySelector('.nivel-cabeca') as HTMLElement
    expect(cabeca.querySelector('[aria-label]')).toBeNull()
    const contagem = cabeca.querySelector('.nivel-contagem') as HTMLElement
    expect(within(contagem).getByText('2')).toHaveAttribute('aria-hidden', 'true')
    expect(within(contagem).getByText('2 hipóteses')).toHaveClass('so-leitor')
    // O texto que sobra para o leitor de tela (sem o que é aria-hidden) é só «2 hipóteses».
    const lido = [...contagem.childNodes].filter((n) => !(n instanceof HTMLElement && n.getAttribute('aria-hidden') === 'true')).map((n) => n.textContent).join('')
    expect(lido).toBe('2 hipóteses')
  })

  it('o bloco leva o marcador do nível no título (■□□, ■■□, ■■■), só os quadrados: o nome já está escrito ao lado e o leitor de tela o ouve uma vez', () => {
    desenhar({
      pre_iconographic: [livro('HY-900101', 'pre_iconographic', 'olhos de teste')],
      iconographic: [livro('HY-900103', 'iconographic', 'figura de teste')],
      iconological: [livro('HY-900104', 'iconological', 'ideia de teste')],
    })
    const cabeca = (nome: string) => bloco(nome).querySelector('.nivel-cabeca') as HTMLElement
    expect(cabeca('Pré-iconográfico').querySelectorAll('rect[data-cheio="true"]')).toHaveLength(1)
    expect(cabeca('Iconográfico').querySelectorAll('rect[data-cheio="true"]')).toHaveLength(2)
    expect(cabeca('Iconológico').querySelectorAll('rect[data-cheio="true"]')).toHaveLength(3)
    for (const nome of ['Pré-iconográfico', 'Iconográfico', 'Iconológico']) {
      expect(cabeca(nome).querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      expect(cabeca(nome).textContent).not.toMatch(/nível/i)
    }
    // O nome da região e o do título são o nome do nível, uma vez: a árvore de acessibilidade não repete «nível …».
    expect(bloco('Pré-iconográfico')).toHaveAccessibleName('Pré-iconográfico')
  })

  it('cada linha leva o marcador do próprio nível; o nome do link NÃO repete o nível (o bloco já o diz), e começa pelo termo', () => {
    desenhar({
      pre_iconographic: [livro('HY-900101', 'pre_iconographic', 'olhos de teste')],
      iconological: [livro('HY-900104', 'iconological', 'ideia de teste')],
    })
    const l1 = bloco('Pré-iconográfico').querySelector('[data-hipotese-linha="HY-900101"]') as HTMLElement
    expect(l1.querySelectorAll('rect[data-cheio="true"]')).toHaveLength(1)
    expect(l1.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(l1).toHaveAccessibleName(/^olhos de teste objeto inteiro/)
    expect(within(bloco('Pré-iconográfico')).getByRole('link', { name: /^olhos de teste/ })).toBe(l1)
    const l3 = bloco('Iconológico').querySelector('[data-hipotese-linha="HY-900104"]') as HTMLElement
    expect(l3.querySelectorAll('rect[data-cheio="true"]')).toHaveLength(3)
    expect(l3).toHaveAccessibleName(/^ideia de teste/)
    for (const l of [l1, l3]) expect(l.textContent).not.toMatch(/nível/i)
  })

  it('nível sem hipótese não aparece (decisão: nada de bloco vazio); a legenda ainda diz os três', () => {
    desenhar({ iconographic: [livro('HY-900103', 'iconographic', 'figura de teste')] })
    expect(screen.queryByRole('region', { name: 'Pré-iconográfico' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Iconológico' })).toBeNull()
    expect(bloco('Iconográfico')).toBeInTheDocument()
    const legenda = screen.getByRole('group', { name: 'Legenda dos níveis' })
    expect(legenda).toHaveTextContent('Pré-iconográfico')
    expect(legenda).toHaveTextContent('Iconológico')
  })

  it('a legenda aparece uma vez; sem hipótese nenhuma, só a frase de vazio e nenhuma legenda', () => {
    const { unmount } = desenhar({
      pre_iconographic: [livro('HY-900101', 'pre_iconographic', 'olhos de teste')],
      iconographic: [livro('HY-900103', 'iconographic', 'figura de teste')],
    })
    expect(screen.getAllByRole('group', { name: 'Legenda dos níveis' })).toHaveLength(1)
    unmount()
    desenhar({})
    expect(screen.getByText('Nenhuma hipótese registrada para este objeto.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Legenda dos níveis' })).toBeNull()
  })

  it('decisão 52: a legenda vem DEPOIS de «Registrar hipótese» (e dos blocos), não entre eles', () => {
    desenhar({ iconographic: [livro('HY-900103', 'iconographic', 'figura de teste')] }, {}, [], <button type="button">Registrar hipótese</button>)
    const botao = screen.getByRole('button', { name: 'Registrar hipótese' })
    const legenda = screen.getByRole('group', { name: 'Legenda dos níveis' })
    const ultimaLinha = bloco('Iconográfico').querySelector('[data-hipotese-linha]') as HTMLElement
    expect(ultimaLinha.compareDocumentPosition(botao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(botao.compareDocumentPosition(legenda) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('celular: legenda compacta, de uma linha («■□□ vê · ■■□ significa · ■■■ cultura»), com os nomes completos para o leitor de tela', () => {
    desenhar({ iconographic: [livro('HY-900103', 'iconographic', 'figura de teste')] })
    const legenda = screen.getByRole('group', { name: 'Legenda dos níveis' })
    expect(legenda).toHaveClass('nivel-legenda-compacta')
    const itens = legenda.querySelectorAll('.nivel-legenda-item')
    expect(itens).toHaveLength(3)
    expect([...itens].map((i) => i.querySelectorAll('rect[data-cheio="true"]').length)).toEqual([1, 2, 3])
    expect([...itens].map((i) => i.querySelector('[aria-hidden="true"]:not(svg)')?.textContent)).toEqual(['vê', 'significa', 'cultura'])
    // 30×8 (o tamanho do painel), como no desenho, e a frase explicativa fica só no computador.
    expect(legenda.querySelector('svg')).toHaveAttribute('width', '30')
    expect(legenda).not.toHaveTextContent('Quadrados cheios')
    expect(within(legenda).getByText('Pré-iconográfico, o que se vê')).toHaveClass('so-leitor')
    expect(within(legenda).getByText('Iconológico, o que revela da cultura')).toHaveClass('so-leitor')
  })

  it('computador: a legenda é a do desenho (uma linha por nível, nome e explicação, e a regra dos quadrados)', () => {
    instalarMatchMedia(1280)
    desenhar({ iconographic: [livro('HY-900103', 'iconographic', 'figura de teste')] })
    const legenda = screen.getByRole('group', { name: 'Legenda dos níveis' })
    expect(legenda).not.toHaveClass('nivel-legenda-compacta')
    expect(legenda.querySelectorAll('.nivel-legenda-linha')).toHaveLength(3)
    expect(within(legenda).getByText('Pré-iconográfico')).toBeInTheDocument()
    expect(within(legenda).getByText(/O que revela da cultura/)).toBeInTheDocument()
    expect(legenda).toHaveTextContent('Quadrados cheios = profundidade da interpretação. O nome escrito fica sempre ao lado no título do nível e no painel.')
    expect(legenda.querySelector('svg')).toHaveAttribute('width', '30')
    expect(legenda.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('os títulos «Sem nível» e «Sobre outros objetos» guardam a coluna do marcador vazia: ficam na mesma vertical dos dos níveis', () => {
    desenhar(
      { iconographic: [livro('HY-900103', 'iconographic', 'figura de teste')] },
      { semNivel: [skc('HY-testeaaa-3', null, 'sem nível de teste')] },
      [livro('HY-900110', 'iconographic', 'figura de outro', { alvo: { tipo: 'item', id: 'IT-2', numero: 'CA00002', itemId: 'IT-2', rotulo: null } })],
    )
    for (const nome of ['Iconográfico', 'Sem nível', 'Sobre outros objetos']) {
      const cabeca = bloco(nome).querySelector('.nivel-cabeca') as HTMLElement
      expect(cabeca.children, nome).toHaveLength(3)
      // A primeira coluna é o marcador (ou um vazio no lugar dele); depois, os títulos; por fim, a contagem.
      expect(cabeca.children[1]).toHaveClass('nivel-titulos')
      expect(cabeca.children[2]).toHaveClass('nivel-contagem')
    }
    expect((bloco('Sem nível').querySelector('.nivel-cabeca') as HTMLElement).children[0]).toBeEmptyDOMElement()
  })

  it('o mesmo bloco duas vezes na página (o Item e o Objeto SKC): ids únicos, e cada região é nomeada pelo próprio título', () => {
    const item = { hipotesesPorNivel: { pre_iconographic: [], iconographic: [livro('HY-900103', 'iconographic', 'figura de teste')], iconological: [] }, outrasHipoteses: [] }
    render(
      <MemoryRouter initialEntries={['/item/CA00001']}>
        <HipotesesPorNivel item={item} skc={SEM_SKC} />
        <HipotesesPorNivel item={item} skc={SEM_SKC} />
      </MemoryRouter>,
    )
    const regioes = screen.getAllByRole('region', { name: 'Iconográfico' })
    expect(regioes).toHaveLength(2)
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('celular: o alvo e «sem trecho no texto PT» ficam numa segunda linha, e a certeza à direita', () => {
    desenhar({ iconological: [livro('HY-900104', 'iconological', 'ideia de teste', { ancora: null })] })
    const linha = bloco('Iconológico').querySelector('[data-hipotese-linha="HY-900104"]') as HTMLElement
    const nome = linha.querySelector('.item-hipotese-linha-nome') as HTMLElement
    const sobre = linha.querySelector('.item-hipotese-linha-sobre') as HTMLElement
    expect(nome).toHaveTextContent('ideia de teste')
    expect(sobre).toHaveTextContent('objeto inteiro · sem trecho no texto PT')
    // Linhas separadas: o nome e o alvo são irmãos, sem o «·» na ponta do nome.
    expect(nome.parentElement).toBe(sobre.parentElement)
    expect(nome).not.toHaveTextContent('·')
    expect(linha.querySelector('.item-hipotese-linha-modalidade')).toHaveTextContent('afirmada')
    // O «·» do aviso anda junto com ele (nunca sobra sozinho na ponta da linha) e os «·» são só visuais: o nome do link não os lê.
    const aviso = sobre.querySelector('.item-hipotese-linha-aviso') as HTMLElement
    expect(aviso.textContent).toBe('·\u00a0sem trecho no texto PT')
    expect(linha.textContent).toContain('·')
    expect(linha).toHaveAccessibleName(/ideia de teste.*objeto inteiro.*sem trecho no texto PT.*afirmada/)
    expect(linha.getAttribute('aria-label') ?? '').not.toContain('·')
    expect(linha.querySelector('.item-hipotese-linha-sep')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('as hipóteses SKC entram no nível delas (decisão 35 + Tarefa 10)', () => {
  beforeEach(() => instalarMatchMedia(375))

  it('a linha SKC leva o marcador, a marca SKC e conta no bloco junto com as do livro', () => {
    desenhar(
      { iconographic: [livro('HY-900103', 'iconographic', 'figura de teste')] },
      { iconographic: [skc('HY-testeaaa-1', 'iconographic', 'forma de teste')], iconological: [skc('HY-testeaaa-2', 'iconological', 'ideia sua')] },
    )
    const ico = bloco('Iconográfico')
    expect(within(ico).getByText('2 hipóteses')).toBeInTheDocument()
    expect(ico.querySelectorAll('[data-hipotese-linha]')).toHaveLength(2)
    const linha = ico.querySelector('[data-hipotese-linha="HY-testeaaa-1"]') as HTMLElement
    expect(linha.querySelectorAll('rect[data-cheio="true"]')).toHaveLength(2)
    expect(linha).not.toHaveTextContent(/nível/i)
    expect(linha).toHaveTextContent('SKC')
    // Um bloco só com SKC também aparece, com a contagem certa.
    expect(within(bloco('Iconológico')).getByText('1 hipótese')).toBeInTheDocument()
  })

  it('a contagem do bloco é o número de linhas dele, e a da seção, a soma de todas (SKC sem nível inclusive)', () => {
    const porNivel = { iconographic: [livro('HY-900103', 'iconographic', 'figura de teste')] }
    const doUsuario = { iconographic: [skc('HY-testeaaa-1', 'iconographic', 'forma de teste')], semNivel: [skc('HY-testeaaa-3', null, 'sem nível de teste')] }
    desenhar(porNivel, doUsuario)
    for (const nome of ['Iconográfico', 'Sem nível']) {
      const b = bloco(nome)
      const n = b.querySelectorAll('[data-hipotese-linha]').length
      expect(within(b).getByText(n === 1 ? '1 hipótese' : `${n} hipóteses`)).toBeInTheDocument()
    }
    expect(contarHipoteses({ hipotesesPorNivel: { pre_iconographic: [], iconographic: porNivel.iconographic, iconological: [] } }, { ...SEM_SKC, ...doUsuario })).toBe(3)
  })

  it('SKC sem nível: nem quadrados nem texto de nível; o bloco «Sem nível» não leva explicação inventada', () => {
    desenhar({}, { semNivel: [skc('HY-testeaaa-3', null, 'sem nível de teste')] })
    const b = bloco('Sem nível')
    expect(b.querySelector('svg')).toBeNull()
    expect(b).not.toHaveTextContent(/nível pré|nível icon/)
    expect(within(b).getByRole('link', { name: /sem nível de teste/ })).toBeInTheDocument()
    expect(b.querySelector('.nivel-explica')).toBeNull()
    expect(within(b).getByText('1 hipótese')).toBeInTheDocument()
  })

  it('SKC com termo criado pelo usuário (decisão 41): o rótulo guardado é o nome, com o marcador', () => {
    desenhar({}, { iconological: [skc('HY-testeaaa-4', 'iconological', 'termo só meu', { termos: [{ id: 'GL-testeaaa-1', rotulo: 'termo só meu' }] })] })
    const linha = bloco('Iconológico').querySelector('[data-hipotese-linha="HY-testeaaa-4"]') as HTMLElement
    expect(linha).toHaveTextContent('termo só meu')
    expect(linha.querySelectorAll('rect[data-cheio="true"]')).toHaveLength(3)
  })

  it('SKC sem trecho: «sem trecho» na segunda linha, junto do alvo', () => {
    desenhar({}, { iconographic: [skc('HY-testeaaa-1', 'iconographic', 'forma de teste')] })
    const sobre = bloco('Iconográfico').querySelector('.item-hipotese-linha-sobre')!
    expect(sobre).toHaveTextContent('objeto inteiro · sem trecho')
    expect(sobre.querySelector('.item-hipotese-linha-aviso')!.textContent).toBe('·\u00a0sem trecho')
  })
})

describe('hipóteses sobre outros objetos', () => {
  beforeEach(() => instalarMatchMedia(375))

  const outra = () => livro('HY-900110', 'iconographic', 'figura de outro', { alvo: { tipo: 'item', id: 'IT-2', numero: 'CA00002', itemId: 'IT-2', rotulo: null } })

  it('o bloco «Sobre outros objetos» não leva marcador no título, e cada linha leva o do próprio nível', () => {
    desenhar({}, {}, [outra()])
    const b = bloco('Sobre outros objetos')
    expect(b.querySelector('.nivel-cabeca svg')).toBeNull()
    const linha = b.querySelector('[data-hipotese-linha="HY-900110"]') as HTMLElement
    expect(linha.querySelectorAll('rect[data-cheio="true"]')).toHaveLength(2)
    expect(within(b).getByText('1 hipótese')).toBeInTheDocument()
  })

  it('aqui os níveis se misturam, então o nível de cada linha CONTINUA no nome do link, mas depois do termo («figura de outro, …, nível iconográfico»)', () => {
    desenhar({}, {}, [outra(), livro('HY-900111', 'iconological', 'ideia de outro', { alvo: { tipo: 'item', id: 'IT-2', numero: 'CA00002', itemId: 'IT-2', rotulo: null } })])
    const b = bloco('Sobre outros objetos')
    const um = within(b).getByRole('link', { name: /^figura de outro/ })
    expect(um).toHaveAccessibleName(/^figura de outro.*nível iconográfico/)
    expect(within(b).getByRole('link', { name: /^ideia de outro.*nível iconológico/ })).toBeInTheDocument()
    expect(um.getAttribute('aria-label') ?? um.textContent).not.toMatch(/^nível/)
  })
})
