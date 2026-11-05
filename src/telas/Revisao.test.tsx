/**
 * Revisão com ações (Tarefa 13): os grupos que abrem, o lugar certo de cada tipo, «Deixar como está» e «Desfazer» (que
 * sobrevivem a recarregar e acompanham a sincronização), e a MESMA conta no Menu, no ponto da barra e na página.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { B, ev } from '../../tests/suporte/eventosDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { chaveDoCaso } from '../revisao/chave'
import { BarraSuperior } from '../ui/BarraSuperior'
import { carregarEstado, estadoAtual, receberEventos, registrar } from '../usuario/estado'
import { Menu } from './Menu'
import { Revisao, TEMPO_DO_AVISO_MS } from './Revisao'

// O Menu e a barra só contam quando há pacote no aparelho: aqui o armazém do app está vazio, e o banco de teste tem o seu.
vi.mock('../pacote/local', async (original) => {
  const real = await original<typeof import('../pacote/local')>()
  return { ...real, lerEstado: vi.fn(async (armazem?: Parameters<typeof real.lerEstado>[0]) => (await real.lerEstado(armazem).catch(() => null)) ?? ({ schema: 5 } as never)) }
})
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

function Onde() {
  const { pathname, search } = useLocation()
  return <p data-testid="onde">{pathname + search}</p>
}
function abrir(url = '/revisao', extra?: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Revisao />
      {extra}
      <Onde />
    </MemoryRouter>,
  )
}
const onde = () => screen.getByTestId('onde').textContent
const apoio = () => screen.getByText(/ · o que o processamento não decidiu sozinho/).textContent

/** Casos do pacote sintético (2, de fábrica) e os que os testes juntam: 4 verbetes a revisar completam a conta. */
const EXTRAS: [string, string, string, string][] = [
  ['passage', 'PA-TESTE-0003-cat-1', 'traducao_desatualizada', 'o texto mudou depois da tradução'],
  ['item', 'TESTE-0004', 'medidas_nao_normalizadas', '5 cm?'],
  ['item', 'TESTE-0001', 'sitio_nao_resolvido', "candidato 'Tell Inventado' (vermutlich)"], // o motivo e o formato reais do pacote
  ['item', 'TESTE-0002', 'sitio_nao_normalizado', 'Tell?'],
]
// De fábrica: 1 citação + 1 tradução com termo alterado = 2; +4 extras = 6; + 4 verbetes a revisar = 10; + 1 elemento sem região = 11.
// As 26 traduções de máquina ficam fora: «Traduções não revisadas» é só consulta.
const TOTAL = 11
const CHAVE_MEDIDA = chaveDoCaso({ tipo: 'medidas_nao_normalizadas', entidade: 'item', entidadeId: 'TESTE-0004', detalhe: '5 cm?' })

async function limpar() {
  for (const r of estadoAtual().registros.get('revisao')?.values() ?? []) if (!r.excluido) await registrar('revisao', r.id, 'excluir')
}

beforeAll(async () => {
  usarMotor(await bancoDeTeste({ escrita: true }))
  for (const [e, id, motivo, detalhe] of EXTRAS) await executar('INSERT INTO pub_TESTE.review_queue (entity, entity_id, reason, detail) VALUES (?, ?, ?, ?)', [e, id, motivo, detalhe])
})
afterAll(() => usarMotor(null))
beforeEach(() => instalarMatchMedia(375))
afterEach(async () => {
  instalarMatchMedia(375)
  await limpar()
})

describe('a lista dos tipos', () => {
  it('mostra o total (a fila, os verbetes a revisar) e os grupos do maior para o menor', async () => {
    abrir()
    expect(await screen.findByText(`${TOTAL} casos · o que o processamento não decidiu sozinho`)).toBeInTheDocument()
    const grupos = [...screen.getByRole('list', { name: 'Casos por tipo' }).querySelectorAll<HTMLElement>(':scope > li')]
    expect(grupos.map((li) => li.dataset.grupo)).toEqual([
      'verbetes-a-revisar',
      'sitios-nao-resolvidos',
      'citacoes-nao-resolvidas',
      'medidas-nao-organizadas',
      'regioes-a-desenhar',
      'traducoes-com-termo-alterado',
      'traducoes-desatualizadas',
      'traducoes-nao-revisadas', // só consulta: por último, e fora do total
    ])
    expect(grupos.map((li) => li.querySelector('.revisao-grupo-quantidade')!.textContent)).toEqual(['4', '2', '1', '1', '1', '1', '1', '26'])
  })

  it('os grupos abrem e fecham pelo botão, e o que está aberto fica no endereço', async () => {
    abrir()
    const cab = await screen.findByRole('button', { name: /^Medidas não organizadas/ })
    expect(cab).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(cab)
    expect(cab).toHaveAttribute('aria-expanded', 'true')
    expect(onde()).toBe('/revisao?abrir=medidas-nao-organizadas')
    const casos = screen.getByRole('list', { name: 'Casos de Medidas não organizadas' })
    expect(within(casos).getByText('5 cm?')).toBeInTheDocument()
    await userEvent.click(cab)
    expect(onde()).toBe('/revisao')
    expect(screen.queryByRole('list', { name: 'Casos de Medidas não organizadas' })).toBeNull()
  })

  it('voltar à tela com o endereço de antes encontra os mesmos grupos abertos', async () => {
    abrir('/revisao?abrir=medidas-nao-organizadas,citacoes-nao-resolvidas')
    expect(await screen.findByRole('list', { name: 'Casos de Medidas não organizadas' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Casos de Citações não resolvidas' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Casos de Sítios não resolvidos' })).toBeNull()
  })

  it('«Verbetes a revisar» só conta e leva ao Glossário filtrado', async () => {
    abrir()
    const link = await screen.findByRole('link', { name: /^Verbetes a revisar/ })
    expect(link).toHaveAttribute('href', '/glossario?revisar=1')
    expect(link).toHaveTextContent('4')
  })

  it('no celular tem Voltar; no computador não repete (a barra superior leva às seções)', async () => {
    const { unmount } = abrir()
    await screen.findByRole('list', { name: 'Casos por tipo' })
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '#/')
    unmount()
    instalarMatchMedia(1280)
    abrir()
    await screen.findByRole('list', { name: 'Casos por tipo' })
    expect(screen.queryByRole('link', { name: 'Voltar' })).not.toBeInTheDocument()
  })

  it('sem o banco no aparelho avisa', async () => {
    usarMotor({ abrir: async () => ({ estado: 'sem-pacote' }), reabrir: async () => ({ estado: 'sem-pacote' }), executar: async () => [] })
    try {
      abrir()
      expect(await screen.findByRole('alert')).toHaveTextContent('O banco ainda não está no aparelho.')
    } finally {
      usarMotor(await bancoDeTeste({ escrita: true }))
      for (const [e, id, motivo, detalhe] of EXTRAS) await executar('INSERT INTO pub_TESTE.review_queue (entity, entity_id, reason, detail) VALUES (?, ?, ?, ?)', [e, id, motivo, detalhe])
    }
  })
})

describe('cada tipo tem a sua ação (o lugar certo)', () => {
  const caso = async (grupo: string) => {
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${grupo}`) }))
    return within(screen.getByRole('list', { name: new RegExp(`^Casos de ${grupo}`) })).getAllByRole('listitem')[0]!
  }

  it('citação: resolve na bibliografia, procurando o autor; o trecho sem item não tem número para abrir', async () => {
    abrir()
    const li = await caso('Citações não resolvidas')
    expect(within(li).getByText('Fantasma 1888: 3: obra fora da bibliografia')).toBeInTheDocument()
    expect(within(li).getByRole('link', { name: 'Resolver na bibliografia' })).toHaveAttribute('href', '#/bibliografia?filtro=Fantasma')
    expect(within(li).getByText('—')).toBeInTheDocument()
    expect(within(li).queryByRole('link', { name: /Abrir —/ })).toBeNull() // sem número, nada de link «Abrir —»
    expect(within(li).getByText(/TESTE I · introdução, seção 9 · /)).toBeInTheDocument()
    expect(within(li).queryByText(/PA-TESTE/)).toBeNull()
  })

  it('tradução com termo alterado: abre o verbete', async () => {
    abrir()
    const li = await caso('Traduções com termo alterado')
    expect(within(li).getByRole('link', { name: 'Abrir o verbete' })).toHaveAttribute('href', '#/verbete/GL-900003')
  })

  it('tradução desatualizada, num trecho de um item: o número e a ação abrem o objeto', async () => {
    abrir()
    const li = await caso('Traduções desatualizadas')
    expect(within(li).getByRole('link', { name: 'Abrir CA00003' })).toHaveAttribute('href', '/item/CA00003')
    expect(within(li).getByRole('link', { name: 'Abrir o objeto' })).toHaveAttribute('href', '#/item/CA00003')
    expect(within(li).getByText('TESTE I: 3 · trecho')).toBeInTheDocument()
  })

  it('medidas: abre o objeto', async () => {
    abrir()
    const li = await caso('Medidas não organizadas')
    expect(within(li).getByRole('link', { name: 'Abrir o objeto' })).toHaveAttribute('href', '#/item/CA00004')
    expect(within(li).getByText('TESTE I: 4 · catálogo')).toBeInTheDocument()
  })

  it('sítio: «Escolher o sítio» abre o objeto já na escolha do sítio (?corrigir=sitio)', async () => {
    abrir()
    const li = await caso('Sítios não resolvidos')
    expect(within(li).getByRole('link', { name: 'Escolher o sítio' })).toHaveAttribute('href', '#/item/CA00001?corrigir=sitio')
    expect(within(li).getByText("candidato 'Tell Inventado' (vermutlich)")).toBeInTheDocument()
  })

  it('rascunho sem número: «Escolher o período» leva ao objeto com ?corrigir=periodo', async () => {
    await registrar('objeto', 'OB-aaaaaaaa-9', 'criar', { titulo: 'Escaraveu sem período' })
    try {
      abrir()
      const li = await caso('Objetos sem número')
      expect(within(li).getByText('Escaraveu sem período')).toBeInTheDocument()
      expect(within(li).getByRole('link', { name: 'Escolher o período' })).toHaveAttribute('href', '#/item/OB-aaaaaaaa-9?corrigir=periodo')
      // não há o que «deixar como está» num rascunho: só ganhar o período
      expect(within(li).queryByRole('button', { name: /^Deixar como está/ })).toBeNull()
      expect(within(li).queryByRole('link', { name: /Abrir —/ })).toBeNull()
    } finally {
      await registrar('objeto', 'OB-aaaaaaaa-9', 'excluir')
    }
  })

  it('objeto SKC com sítio só escrito: no mesmo grupo dos sítios, com «Escolher o sítio»', async () => {
    await registrar('objeto', 'OB-aaaaaaaa-8', 'criar', { periodo: 'CA', titulo: 'Selo', sitio: '', sitioNome: 'Miš' })
    try {
      abrir()
      await screen.findByText(`${TOTAL + 1} casos · o que o processamento não decidiu sozinho`)
      const grupo = await caso('Sítios não resolvidos')
      expect(grupo).toBeInTheDocument()
      const link = screen.getAllByRole('link', { name: 'Escolher o sítio' }).find((a) => a.getAttribute('href')?.includes('OB-aaaaaaaa-8'))
      expect(link).toHaveAttribute('href', '#/item/OB-aaaaaaaa-8?corrigir=sitio')
    } finally {
      await registrar('objeto', 'OB-aaaaaaaa-8', 'excluir')
    }
  })
})

describe('«Regiões a desenhar»', () => {
  const regiao = { imagem: 'IMG-TESTE-0001-1', objeto: 'CA00001', seletor: '<polygon points="0.1,0.1 0.9,0.1 0.5,0.9"/>', elemento: 'leão-de-teste', elementoId: 'EL-900002', pai: null }

  it('«Desenhar a região» abre o visualizador na imagem do item, pronto para desenhar esse elemento', async () => {
    abrir('/revisao?abrir=regioes-a-desenhar')
    const lista = await screen.findByRole('list', { name: 'Casos de Regiões a desenhar' })
    const li = within(lista).getAllByRole('listitem')[0]!
    expect(within(li).getByText('leão-de-teste (Testlöwe)')).toBeInTheDocument()
    expect(within(li).getByText('TESTE I: 1 · elemento')).toBeInTheDocument()
    expect(within(li).getByRole('link', { name: 'Desenhar a região' })).toHaveAttribute('href', '#/imagem/IMG-TESTE-0001-1?desenhar=EL-900002')
    expect(within(li).getByRole('link', { name: 'Abrir CA00001' })).toHaveAttribute('href', '/item/CA00001')
  })

  it('desenhar uma região para o elemento o resolve (página, Menu e barra), excluí-la o reabre', async () => {
    instalarMatchMedia(1280)
    abrir('/revisao', (
      <>
        <BarraSuperior busca={false} />
        <Menu variante="popover" aoFechar={() => undefined} />
      </>
    ))
    const barra = () => screen.getByRole('link', { name: /^Revisão, / }).getAttribute('aria-label')
    const menu = () => within(screen.getByRole('navigation', { name: 'Menu' })).getByRole('link', { name: /Revisão/ }).textContent
    await waitFor(() => expect(menu()).toContain(`${TOTAL} casos`))
    await act(() => registrar('regiao', 'RG-aaaaaaaa-5', 'criar', regiao))
    await waitFor(() => expect(apoio()).toContain(`${TOTAL - 1} casos`))
    expect(menu()).toContain(`${TOTAL - 1} casos`)
    expect(barra()).toBe(`Revisão, ${TOTAL - 1} pendências`)
    expect(screen.queryByRole('button', { name: /^Regiões a desenhar/ })).toBeNull() // o grupo esvaziou
    await act(() => registrar('regiao', 'RG-aaaaaaaa-5', 'excluir'))
    await waitFor(() => expect(apoio()).toContain(`${TOTAL} casos`))
    expect(menu()).toContain(`${TOTAL} casos`)
    expect(barra()).toBe(`Revisão, ${TOTAL} pendências`)
    expect(screen.getByRole('button', { name: /^Regiões a desenhar/ })).toHaveTextContent('1')
  })

  it('«Deixar como está» e «Desfazer» também valem', async () => {
    abrir('/revisao?abrir=regioes-a-desenhar')
    await userEvent.click(await screen.findByRole('button', { name: 'Deixar como está: CA00001' }))
    await waitFor(() => expect(apoio()).toContain(`${TOTAL - 1} casos`))
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer: CA00001' }))
    await waitFor(() => expect(apoio()).toContain(`${TOTAL} casos`))
  })
})

describe('«Traduções não revisadas» (só consulta)', () => {
  it('mostra a contagem e o aviso, não entra no total, e a lista é limitada (25 e «Mostrar mais»)', async () => {
    abrir('/revisao?abrir=traducoes-nao-revisadas')
    const cab = await screen.findByRole('button', { name: /^Traduções não revisadas/ })
    expect(cab).toHaveTextContent('26')
    expect(cab).toHaveTextContent(/só para consulta/)
    expect(apoio()).toBe(`${TOTAL} casos · o que o processamento não decidiu sozinho`)
    expect(screen.getByText('Só para consulta: não entra no total.')).toBeInTheDocument()
    const lista = screen.getByRole('list', { name: 'Casos de Traduções não revisadas' })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(25)
    expect(within(lista).queryByRole('button', { name: /Deixar como está/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Mostrar mais 1 (25 de 26)' })).toBeInTheDocument()
    // cada linha leva ao trecho
    const links = within(lista).getAllByRole('link', { name: /^Abrir o (trecho|campo)$/ })
    expect(links.length).toBeGreaterThan(0)
    for (const a of links) expect(a.getAttribute('href')).toMatch(/^#\/(item|grupo)\//)
  })

  it('o Menu e o ponto da barra ignoram o grupo (e não o carregam)', async () => {
    instalarMatchMedia(1280)
    abrir('/revisao', (
      <>
        <BarraSuperior busca={false} />
        <Menu variante="popover" aoFechar={() => undefined} />
      </>
    ))
    await waitFor(() => expect(within(screen.getByRole('navigation', { name: 'Menu' })).getByRole('link', { name: /Revisão/ }).textContent).toContain(`${TOTAL} casos`))
    expect(screen.getByRole('link', { name: /^Revisão, / })).toHaveAttribute('aria-label', `Revisão, ${TOTAL} pendências`)
    expect(within(screen.getByRole('navigation', { name: 'Menu' })).queryByText(/Traduções não revisadas/)).toBeNull()
  })
})

describe('Deixar como está e Desfazer', () => {
  it('marca como resolvido: sai da contagem, o caso passa a «Resolvidos por você» com Desfazer, e há um aviso com Desfazer', async () => {
    abrir('/revisao?abrir=medidas-nao-organizadas')
    await screen.findByText(`${TOTAL} casos · o que o processamento não decidiu sozinho`)
    await userEvent.click(screen.getByRole('button', { name: 'Deixar como está: CA00004' }))
    await waitFor(() => expect(apoio()).toBe(`${TOTAL - 1} casos · o que o processamento não decidiu sozinho`))
    expect(screen.getByText('1 resolvido por você, fora da contagem.')).toBeInTheDocument()
    // o evento é um `revisao` com a chave estável do caso
    const r = estadoAtual().registro('revisao', CHAVE_MEDIDA)!
    expect(r.excluido).toBe(false)
    expect(r.campos).toEqual({ tipo: 'medidas_nao_normalizadas' })
    expect(estadoAtual().marcaDeExclusao('revisao', CHAVE_MEDIDA)?.op).toBe('restaurar')
    // o grupo continua listado (com 0) e o caso está em «Resolvidos por você»
    const cab = screen.getByRole('button', { name: /^Medidas não organizadas/ })
    expect(cab).toHaveTextContent('0')
    expect(screen.getByRole('heading', { level: 3, name: 'Resolvidos por você · 1' })).toBeInTheDocument()
    const resolvidos = screen.getByRole('list', { name: 'Resolvidos de Medidas não organizadas' })
    expect(within(resolvidos).getByText('5 cm?')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Casos de Medidas não organizadas' })).toBeNull()
    // O aviso vem depois da gravação (uma atualização à parte da contagem): espera por ele, não confere de imediato.
    expect(await screen.findByRole('status')).toHaveTextContent('CA00004: marcado como resolvido.')
    // Desfazer pelo aviso
    await userEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(apoio()).toBe(`${TOTAL} casos · o que o processamento não decidiu sozinho`))
    expect(estadoAtual().registro('revisao', CHAVE_MEDIDA)!.excluido).toBe(true)
    expect(screen.getByRole('list', { name: 'Casos de Medidas não organizadas' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('status', { hidden: true })).toBeEmptyDOMElement())
  })

  it('Desfazer na linha do caso resolvido; marcar de novo é restaurar (um registro só)', async () => {
    abrir('/revisao?abrir=medidas-nao-organizadas')
    const antes = estadoAtual().registros.get('revisao')?.size ?? 0
    await userEvent.click(await screen.findByRole('button', { name: 'Deixar como está: CA00004' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer: CA00004' }))
    await waitFor(() => expect(apoio()).toBe(`${TOTAL} casos · o que o processamento não decidiu sozinho`))
    await userEvent.click(screen.getByRole('button', { name: 'Deixar como está: CA00004' }))
    await waitFor(() => expect(apoio()).toBe(`${TOTAL - 1} casos · o que o processamento não decidiu sozinho`))
    expect(estadoAtual().registros.get('revisao')!.size - antes).toBeLessThanOrEqual(1) // restaurar, não um segundo registro
    expect(estadoAtual().registro('revisao', CHAVE_MEDIDA)!.excluido).toBe(false)
  })

  it('sobrevive a recarregar (o estado é refeito do IndexedDB) e o Desfazer funciona depois', async () => {
    const { unmount } = abrir('/revisao?abrir=medidas-nao-organizadas')
    await userEvent.click(await screen.findByRole('button', { name: 'Deixar como está: CA00004' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desfazer: CA00004' })).toBeInTheDocument())
    unmount()
    await act(async () => {
      await carregarEstado()
    })
    abrir('/revisao?abrir=medidas-nao-organizadas')
    await screen.findByText(`${TOTAL - 1} casos · o que o processamento não decidiu sozinho`)
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer: CA00004' }))
    await waitFor(() => expect(apoio()).toBe(`${TOTAL} casos · o que o processamento não decidiu sozinho`))
  })

  it('o foco vai ao próximo caso do grupo (ou ao grupo, se era o último)', async () => {
    abrir('/revisao?abrir=sitios-nao-resolvidos')
    const botoes = await screen.findAllByRole('button', { name: /^Deixar como está/ })
    expect(botoes).toHaveLength(2)
    await userEvent.click(botoes[0]!)
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Deixar como está/ })).toHaveLength(1))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Deixar como está/ })).toHaveFocus())
    await userEvent.click(screen.getByRole('button', { name: /^Deixar como está/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Sítios não resolvidos/ })).toHaveFocus())
  })

  const inserirDatacoes = async (n: number) => {
    for (let i = 0; i < n; i++) await executar('INSERT INTO pub_TESTE.review_queue (entity, entity_id, reason, detail) VALUES (?, ?, ?, ?)', ['item', 'TESTE-0005', 'datacao_nao_normalizada', `datação ${i}`])
  }
  const apagarDatacoes = () => executar("DELETE FROM pub_TESTE.review_queue WHERE reason = 'datacao_nao_normalizada'")
  const linhasDe = (nome: string) => within(screen.getByRole('list', { name: nome })).getAllByRole('listitem').length

  it('«Mostrar mais» aparece com mais de 25 casos, mostra de 100 em 100 e fica no endereço', async () => {
    await inserirDatacoes(130)
    try {
      abrir('/revisao?abrir=datacoes-nao-organizadas')
      await screen.findByRole('list', { name: 'Casos de Datações não organizadas' })
      expect(linhasDe('Casos de Datações não organizadas')).toBe(25)
      await userEvent.click(screen.getByRole('button', { name: 'Mostrar mais 100 (25 de 130)' }))
      expect(linhasDe('Casos de Datações não organizadas')).toBe(125)
      // T17-B-19: o botão some ao ser usado, mas o foco não se perde: vai à primeira linha que apareceu (a 26ª)
      const lista = screen.getByRole('list', { name: 'Casos de Datações não organizadas' })
      await waitFor(() => expect(document.activeElement?.closest('li')).toBe(within(lista).getAllByRole('listitem')[25]))
      expect(onde()).toBe('/revisao?abrir=datacoes-nao-organizadas&ate=datacoes-nao-organizadas%3A125')
      await userEvent.click(screen.getByRole('button', { name: 'Mostrar mais 5 (125 de 130)' }))
      expect(linhasDe('Casos de Datações não organizadas')).toBe(130)
      expect(screen.queryByRole('button', { name: /^Mostrar mais/ })).toBeNull()
    } finally {
      await apagarDatacoes()
    }
  })

  it('o que está mostrado volta com o endereço (voltar da ficha encontra a lista como estava)', async () => {
    await inserirDatacoes(30)
    try {
      abrir('/revisao?abrir=datacoes-nao-organizadas&ate=datacoes-nao-organizadas%3A30')
      await screen.findByRole('list', { name: 'Casos de Datações não organizadas' })
      expect(linhasDe('Casos de Datações não organizadas')).toBe(30)
      expect(screen.queryByRole('button', { name: /^Mostrar mais/ })).toBeNull()
    } finally {
      await apagarDatacoes()
    }
  })

  it('«Resolvidos por você» também mostra 25 e o resto por «Mostrar mais»', async () => {
    await inserirDatacoes(30)
    const chaves = Array.from({ length: 30 }, (_, i) => chaveDoCaso({ tipo: 'datacao_nao_normalizada', entidade: 'item', entidadeId: 'TESTE-0005', detalhe: `datação ${i}` }))
    try {
      for (const c of chaves) {
        await registrar('revisao', c, 'criar', { tipo: 'datacao_nao_normalizada' })
        await registrar('revisao', c, 'restaurar')
      }
      abrir('/revisao?abrir=datacoes-nao-organizadas')
      await screen.findByRole('heading', { level: 3, name: 'Resolvidos por você · 30' })
      expect(linhasDe('Resolvidos de Datações não organizadas')).toBe(25)
      await userEvent.click(screen.getByRole('button', { name: 'Mostrar mais 5 resolvidos (25 de 30)' }))
      expect(linhasDe('Resolvidos de Datações não organizadas')).toBe(30)
      await waitFor(() => expect(document.activeElement?.closest('li')).toBe(within(screen.getByRole('list', { name: 'Resolvidos de Datações não organizadas' })).getAllByRole('listitem')[25]))
    } finally {
      await apagarDatacoes()
    }
  })

  it('uma gravação que falha avisa, não perde nada e deixa tentar de novo', async () => {
    const armazem = await import('../usuario/armazem')
    abrir('/revisao?abrir=medidas-nao-organizadas')
    const botao = await screen.findByRole('button', { name: 'Deixar como está: CA00004' })
    const espiao = vi.spyOn(armazem, 'gravarNovosEventos').mockRejectedValueOnce(new Error('disco cheio'))
    await userEvent.click(botao)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível guardar; tente de novo. Nada foi perdido.')
    expect(screen.getByRole('button', { name: 'Deixar como está: CA00004' })).toBeInTheDocument()
    espiao.mockRestore()
    await userEvent.click(screen.getByRole('button', { name: 'Deixar como está: CA00004' }))
    await waitFor(() => expect(apoio()).toBe(`${TOTAL - 1} casos · o que o processamento não decidiu sozinho`))
  })
})

describe('atalhos D e U e o aviso', () => {
  const nomeDoBotao = 'Deixar como está: CA00004'
  const tecla = (key: string, alvo: Element = document.body) => fireEvent.keyDown(alvo, { key })
  const resolvido = () => estadoAtual().registro('revisao', CHAVE_MEDIDA)?.excluido === false

  it('D deixa como está o caso em foco; o foco segue para o próximo, e o botão diz «D»', async () => {
    abrir('/revisao?abrir=sitios-nao-resolvidos')
    const botoes = await screen.findAllByRole('button', { name: /^Deixar como está/ })
    expect(botoes[0]).toHaveAttribute('aria-keyshortcuts', 'D')
    botoes[0]!.focus()
    tecla('d', botoes[0]!)
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Deixar como está/ })).toHaveLength(1))
    expect(screen.getByRole('button', { name: /^Desfazer: /, hidden: false })).toBeInTheDocument()
  })

  it('D vale com o foco em qualquer controle da linha (o número, a ação) e não faz nada fora de uma linha', async () => {
    abrir('/revisao?abrir=medidas-nao-organizadas')
    await screen.findByRole('button', { name: nomeDoBotao })
    tecla('d') // foco no corpo: nada
    tecla('d', screen.getByRole('button', { name: /^Medidas não organizadas/ })) // no cabeçalho do grupo: nada
    expect(resolvido()).toBe(false)
    const acao = screen.getByRole('link', { name: 'Abrir o objeto' })
    acao.focus()
    tecla('d', acao)
    await waitFor(() => expect(estadoAtual().registro('revisao', CHAVE_MEDIDA)!.excluido).toBe(false))
  })

  it('U desfaz o último «Deixar como está»; de novo, ou sem nada feito, não faz nada', async () => {
    abrir('/revisao?abrir=medidas-nao-organizadas')
    await screen.findByRole('button', { name: nomeDoBotao })
    tecla('u') // nada feito ainda
    expect(resolvido()).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: nomeDoBotao }))
    await waitFor(() => expect(apoio()).toBe(`${TOTAL - 1} casos · o que o processamento não decidiu sozinho`))
    expect(within(await screen.findByRole('status')).getByRole('button', { name: 'Desfazer' })).toHaveAttribute('aria-keyshortcuts', 'U')
    tecla('u')
    await waitFor(() => expect(apoio()).toBe(`${TOTAL} casos · o que o processamento não decidiu sozinho`))
    expect(estadoAtual().registro('revisao', CHAVE_MEDIDA)!.excluido).toBe(true)
    tecla('u')
    await new Promise((r) => setTimeout(r, 30))
    expect(estadoAtual().registro('revisao', CHAVE_MEDIDA)!.excluido).toBe(true)
  })

  it('D e U não valem dentro de um campo de texto', async () => {
    abrir('/revisao?abrir=medidas-nao-organizadas', <input aria-label="Campo de teste" />)
    const botao = await screen.findByRole('button', { name: nomeDoBotao })
    const campo = screen.getByLabelText('Campo de teste')
    campo.focus()
    await userEvent.keyboard('du')
    expect(campo).toHaveValue('du')
    expect(resolvido()).toBe(false)
    // e uma linha com foco só vale fora do campo
    botao.focus()
    tecla('d', botao)
    await waitFor(() => expect(estadoAtual().registro('revisao', CHAVE_MEDIDA)!.excluido).toBe(false))
    campo.focus()
    tecla('u', campo)
    await new Promise((r) => setTimeout(r, 30))
    expect(estadoAtual().registro('revisao', CHAVE_MEDIDA)!.excluido).toBe(false)
  })

  it('o aviso some sozinho depois de uns segundos, mas U ainda desfaz', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] })
    try {
      abrir('/revisao?abrir=medidas-nao-organizadas')
      await userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) }).click(await screen.findByRole('button', { name: nomeDoBotao }))
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('CA00004: marcado como resolvido.'))
      // O aviso aparece no DOM antes de os efeitos daquela renderização rodarem (ela veio de fora de um act, depois da
      // gravação): o temporizador do aviso só é armado nos efeitos, junto com o foco que vai ao cabeçalho do grupo.
      // Avançar o relógio antes disso não dispara nada e o temporizador nasce depois (era o teste instável). Então:
      // espera o foco chegar (os efeitos rodaram, o temporizador está armado) e só então avança.
      await waitFor(() => expect(screen.getByRole('button', { name: /^Medidas não organizadas/ })).toHaveFocus())
      await act(async () => {
        vi.advanceTimersByTime(TEMPO_DO_AVISO_MS + 100)
      })
      expect(screen.getByRole('status', { hidden: true })).toBeEmptyDOMElement()
      tecla('u')
      await waitFor(() => expect(estadoAtual().registro('revisao', CHAVE_MEDIDA)!.excluido).toBe(true))
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('uma conta só: página, Menu e ponto da barra', () => {
  const tela = () => (
    <>
      <BarraSuperior busca={false} />
      <Menu variante="popover" aoFechar={() => undefined} />
    </>
  )
  const barra = () => screen.getByRole('link', { name: /^Revisão, / }).getAttribute('aria-label')
  const menu = () => within(screen.getByRole('navigation', { name: 'Menu' })).getByRole('link', { name: /Revisão/ }).textContent

  it('resolver um caso baixa um nos três, no mesmo ciclo', async () => {
    instalarMatchMedia(1280)
    abrir('/revisao?abrir=medidas-nao-organizadas', tela())
    await waitFor(() => expect(menu()).toContain(`${TOTAL} casos`))
    expect(barra()).toBe(`Revisão, ${TOTAL} pendências`)
    expect(apoio()).toContain(`${TOTAL} casos`)
    await userEvent.click(screen.getByRole('button', { name: 'Deixar como está: CA00004' }))
    // um só waitFor: quando a página mudou, o Menu e a barra já mudaram junto
    await waitFor(() => expect(apoio()).toContain(`${TOTAL - 1} casos`))
    expect(menu()).toContain(`${TOTAL - 1} casos`)
    expect(barra()).toBe(`Revisão, ${TOTAL - 1} pendências`)
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer: CA00004' }))
    await waitFor(() => expect(apoio()).toContain(`${TOTAL} casos`))
    expect(menu()).toContain(`${TOTAL} casos`)
    expect(barra()).toBe(`Revisão, ${TOTAL} pendências`)
  })

  it('um evento que chega da sincronização (outro aparelho resolveu um caso) atualiza os três', async () => {
    instalarMatchMedia(1280)
    abrir('/revisao?abrir=medidas-nao-organizadas', tela())
    await waitFor(() => expect(menu()).toContain(`${TOTAL} casos`))
    const doOutro = ev({ ap: B, seq: 1, ms: Date.now() + 60_000, tipo: 'revisao', reg: CHAVE_MEDIDA, op: 'criar', campos: { tipo: 'medidas_nao_normalizadas' } })
    await act(async () => {
      await receberEventos([doOutro, ev({ ap: B, seq: 1, n: 1, ms: Date.now() + 60_000, tipo: 'revisao', reg: CHAVE_MEDIDA, op: 'restaurar' })])
    })
    await waitFor(() => expect(apoio()).toContain(`${TOTAL - 1} casos`))
    expect(menu()).toContain(`${TOTAL - 1} casos`)
    expect(barra()).toBe(`Revisão, ${TOTAL - 1} pendências`)
    expect(screen.getByRole('button', { name: 'Desfazer: CA00004' })).toBeInTheDocument()
    // e o outro aparelho desfaz: volta nos três
    const desfaz = ev({ ap: B, seq: 2, ms: Date.now() + 120_000, tipo: 'revisao', reg: CHAVE_MEDIDA, op: 'excluir' })
    await act(async () => {
      await receberEventos([desfaz])
    })
    await waitFor(() => expect(apoio()).toContain(`${TOTAL} casos`))
    expect(menu()).toContain(`${TOTAL} casos`)
    expect(barra()).toBe(`Revisão, ${TOTAL} pendências`)
    await registrar('revisao', CHAVE_MEDIDA, 'restaurar') // limpa para o próximo teste
  })

  it('ligar o sítio de um objeto (também o que ainda não sincronizou) e aprovar um verbete baixam nos três', async () => {
    instalarMatchMedia(1280)
    abrir('/revisao', tela())
    await waitFor(() => expect(menu()).toContain(`${TOTAL} casos`))
    await act(() => registrar('item-sitio', 'CA00001', 'alterar', { sitio: 'TESTE-2', sitioNome: 'Tell Probe Teste' }))
    await waitFor(() => expect(apoio()).toContain(`${TOTAL - 1} casos`))
    expect(menu()).toContain(`${TOTAL - 1} casos`)
    expect(barra()).toBe(`Revisão, ${TOTAL - 1} pendências`)
    await act(() => registrar('verbete', 'GL-900002', 'alterar', { status: 'approved', formaAprovada: null }))
    await waitFor(() => expect(apoio()).toContain(`${TOTAL - 2} casos`))
    expect(menu()).toContain(`${TOTAL - 2} casos`)
    // um sítio que ainda não chegou a este aparelho resolve (não é problema da pessoa)
    await act(() => registrar('item-sitio', 'CA00002', 'alterar', { sitio: 'SI-bbbbbbbb-1', sitioNome: 'Tell Remoto' }))
    await waitFor(() => expect(apoio()).toContain(`${TOTAL - 3} casos`))
    expect(barra()).toBe(`Revisão, ${TOTAL - 3} pendências`)
    // limpa
    await registrar('item-sitio', 'CA00001', 'alterar', { sitio: null, sitioNome: null })
    await registrar('item-sitio', 'CA00002', 'alterar', { sitio: null, sitioNome: null })
    await registrar('verbete', 'GL-900002', 'alterar', { status: 'proposed' })
  })
})
