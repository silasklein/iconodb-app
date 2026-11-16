/**
 * A Revisão com lista e detalhe (Parte 2C, bloco 3, Tarefa 11): no computador, a lista à esquerda e o caso à direita
 * (`?caso=`); no celular, o caso numa página. A citação não resolvida: onde aparece, a busca e as parecidas, «Ligar» (as N
 * iguais; a sem autor, só ela), «Nova obra com esta citação», a obra excluída que devolve as citações e o teclado. Só o
 * pacote sintético TESTE e citações inventadas.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { atalhoRegistrado } from '../app/atalhos'
import { executar, usarMotor } from '../banco/cliente'
import { criarObra, excluirObra, restaurarObra } from '../bibliografia/operacoes'
import { chaveDoCaso } from '../revisao/chave'
import { excluirLigacao, ligar } from '../revisao/ligacoes'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { estadoAtual, registrar } from '../usuario/estado'
import { Revisao } from './Revisao'

vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

const citacao = (entidadeId: string, detalhe: string) => chaveDoCaso({ tipo: 'citacao_nao_resolvida', entidade: 'item', entidadeId, detalhe })
const INVENTADO_5 = citacao('TESTE-0004', 'campo 7: Inventado 2001: 5')
const INVENTADO_9 = citacao('TESTE-0005', 'campo 7: Inventado 2001: 9')
const SEM_AUTOR = citacao('TESTE-0006', 'campo 7: 1999: 12; sem autor na citação')
const MEDIDA = chaveDoCaso({ tipo: 'medidas_nao_normalizadas', entidade: 'item', entidadeId: 'TESTE-0004', detalhe: '5 cm?' })

function Onde() {
  const { pathname, search } = useLocation()
  return <p data-testid="onde">{pathname + search}</p>
}
function OObjeto() {
  const { pathname, state } = useLocation()
  return (
    <p data-testid="objeto">
      {pathname} {JSON.stringify((state as { voltar?: unknown } | null)?.voltar ?? null)}
    </p>
  )
}
function abrir(url = '/revisao') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/revisao" element={<Revisao />} />
        <Route path="/item/:n" element={<OObjeto />} />
        <Route path="/obra/nova" element={<p>Nova obra</p>} />
        <Route path="/obra/:id" element={<OObjeto />} />
      </Routes>
      <Onde />
    </MemoryRouter>,
  )
}
const onde = () => new URL(`http://x${screen.getByTestId('onde').textContent}`)
const comCaso = (chave: string, extra = '') => `/revisao?${extra ? `${extra}&` : ''}${new URLSearchParams({ caso: chave })}`
const apoio = () => screen.getByText(/ · o que o processamento não decidiu sozinho/).textContent
const detalhe = () => screen.getByRole('region', { name: 'O caso escolhido' })
const listaDasCitacoes = () => screen.queryByRole('list', { name: 'Casos de Citações não resolvidas' })
const textosDaLista = () => [...(listaDasCitacoes()?.querySelectorAll('.revisao-caso-o-que') ?? [])].map((e) => e.textContent)

/** De fábrica: 4 citações + 1 tradução com termo alterado + 4 verbetes + 1 elemento + 2 pares = 12; + a medida = 13. */
const TOTAL = 13

beforeAll(async () => {
  usarMotor(await bancoDeTeste({ escrita: true }))
  await executar('INSERT INTO pub_TESTE.review_queue (entity, entity_id, reason, detail) VALUES (?, ?, ?, ?)', ['item', 'TESTE-0004', 'medidas_nao_normalizadas', '5 cm?'])
})
afterAll(() => usarMotor(null))
beforeEach(() => instalarMatchMedia(1280))
afterEach(async () => {
  instalarMatchMedia(1280)
  for (const r of estadoAtual().registros.get('revisao')?.values() ?? []) if (!r.excluido) await registrar('revisao', r.id, 'excluir')
  // a «Imaginária 2010» fica: excluir a chave dela desfaria a ligação que o pacote traz (foco 3)
  for (const r of estadoAtual().registros.get('citacao')?.values() ?? []) if (!r.excluido && r.id !== 'imaginaria 2010') await excluirLigacao(r.id)
})

describe('no computador: a lista à esquerda e o caso à direita', () => {
  it('escolher um caso o mostra no detalhe e no endereço; «Marcar como resolvido» passa ao seguinte', async () => {
    abrir('/revisao?abrir=medidas-nao-organizadas')
    expect(await screen.findByText('Escolha um caso na lista. ↑ ↓ andam pela lista; Enter abre.')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Filtrar' })).toBeInTheDocument()
    const linha = screen.getByRole('link', { name: /^5 cm\?/ })
    await userEvent.click(linha)
    expect(onde().searchParams.get('caso')).toBe(MEDIDA)
    expect(screen.getByRole('link', { name: /^5 cm\?/ })).toHaveAttribute('aria-current', 'true')
    const d = detalhe()
    expect(within(d).getByRole('heading', { level: 2, name: '5 cm?' })).toBeInTheDocument()
    expect(within(d).getByText(/Medidas não organizadas · 1 de 1/)).toBeInTheDocument()
    expect(within(d).getByRole('link', { name: 'Abrir o objeto' })).toHaveAttribute('href', '#/item/CA00004')
    await userEvent.click(within(d).getByRole('button', { name: 'Marcar como resolvido' }))
    await waitFor(() => expect(apoio()).toContain(`${TOTAL - 1} casos`))
    // era o único do grupo: o detalhe fica vazio, o foco vai ao cabeçalho do grupo (M5) e o aviso deixa desfazer
    await waitFor(() => expect(onde().searchParams.get('caso')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Medidas não organizadas/ })))
    expect(screen.getByText('CA00004: marcado como resolvido.')).toBeInTheDocument()
  })

  it('o grupo do caso escolhido abre uma vez; depois se recolhe pelo cabeçalho (M4)', async () => {
    abrir(comCaso(MEDIDA))
    const cab = await screen.findByRole('button', { name: /^Medidas não organizadas/ })
    await waitFor(() => expect(cab).toHaveAttribute('aria-expanded', 'true'))
    expect(onde().searchParams.get('abrir')).toBe('medidas-nao-organizadas')
    await userEvent.click(cab)
    expect(cab).toHaveAttribute('aria-expanded', 'false')
    expect(onde().searchParams.get('caso')).toBe(MEDIDA) // o detalhe fica
    expect(within(detalhe()).getByRole('heading', { level: 2, name: '5 cm?' })).toBeInTheDocument()
  })

  it('com o filtro, os grupos abrem sozinhos e se recolhem pelo cabeçalho', async () => {
    abrir('/revisao?filtro=inventado')
    const cab = await screen.findByRole('button', { name: /^Citações não resolvidas/ })
    expect(cab).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(cab)
    expect(cab).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(cab)
    expect(cab).toHaveAttribute('aria-expanded', 'true')
  })

  it('o caso que saiu da fila diz isso; o celular abre a mesma chave numa página', async () => {
    abrir(comCaso('nao-existe'))
    expect(await screen.findByText('Este caso não está mais na fila.')).toBeInTheDocument()
  })

  it('o filtro mostra só os casos com o texto, e os grupos deles abertos', async () => {
    abrir('/revisao')
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Filtrar' }), 'inventado')
    expect(onde().searchParams.get('filtro')).toBe('inventado')
    expect(textosDaLista()).toEqual(['Inventado 2001: 5', 'Inventado 2001: 9'])
    expect(screen.getAllByRole('listitem').filter((li) => li.dataset.grupo)).toHaveLength(1)
  })
})

describe('o detalhe da citação', () => {
  it('onde aparece (o campo 7 com a citação marcada), «Abrir o objeto» com «‹ Revisão» que volta ao caso, e a Nova obra', async () => {
    abrir(comCaso(INVENTADO_5))
    const d = detalhe()
    expect(await within(d).findByRole('heading', { level: 2, name: 'Inventado 2001: 5' })).toBeInTheDocument()
    expect(within(d).getByText('Citação não resolvida · 2 de 4')).toBeInTheDocument()
    await waitFor(() => expect(d.querySelector('mark')?.textContent).toBe('Inventado 2001: 5'))
    expect(d.querySelector('.revisao-detalhe-texto')?.textContent).toBe('Testhausen, Sammlung Probe, Nr. 4. Autor 1999: 20; Inventado 2001: 5.')
    expect(d.querySelector('.revisao-detalhe-texto')).toHaveAttribute('lang', 'de') // a língua da publicação
    expect(await within(d).findByText('Nenhuma obra da Bibliografia tem este autor e este ano.')).toBeInTheDocument()
    const nova = within(d).getByRole('link', { name: 'Nova obra com esta citação' })
    // o grupo do caso escolhido abriu no endereço (M4): a volta leva os dois
    await waitFor(() => expect(onde().searchParams.get('abrir')).toBe('citacoes-nao-resolvidas'))
    const volta = screen.getByTestId('onde').textContent!
    expect(volta).toContain(`caso=${encodeURIComponent(INVENTADO_5).replace(/~/g, '%7E')}`)
    expect(nova).toHaveAttribute('href', `/obra/nova?citacao=inventado%202001&curta=${encodeURIComponent('Inventado 2001: 5')}&volta=${encodeURIComponent(volta)}`)
    expect(within(d).getByRole('button', { name: 'Marcar como resolvida sem ligar' })).toHaveAttribute('aria-keyshortcuts', 'D')
    // o objeto aberto daqui volta a este caso (decisão 85): o caminho leva o ?caso=
    await userEvent.click(within(d).getByRole('link', { name: 'Abrir o objeto CA00004' }))
    const objeto = await screen.findByTestId('objeto')
    expect(objeto.textContent).toContain('/item/CA00004')
    expect(objeto.textContent).toContain(`"rotulo":"Revisão","caminho":"${volta}"`)
  })

  it('a citação desligada no objeto: a Nova obra leva a exceção dela para tirar junto (M1)', async () => {
    const ex = 'inventado 2001@TESTE|TESTE-0004|Inventado 2001: 5'
    await ligar(ex, null)
    abrir(comCaso(INVENTADO_5))
    const nova = await within(detalhe()).findByRole('link', { name: 'Nova obra com esta citação' })
    await waitFor(() => expect(new URL(`http://x${nova.getAttribute('href')}`).searchParams.getAll('excecao')).toEqual([ex]))
  })

  it('a busca acha as obras dos livros e as do usuário (com a marca SKC)', async () => {
    const minha = await criarObra({ type: 'book', title: 'Um Livro de Teste', author: [{ family: 'Exemplar' }], issued: { 'date-parts': [[2001]] } }, 'Exemplar 2001')
    abrir(comCaso(INVENTADO_5))
    const busca = await within(detalhe()).findByRole('searchbox', { name: 'Procurar por autor, ano ou título' })
    await userEvent.type(busca, '2001')
    const obras = await within(detalhe()).findByRole('list', { name: 'Obras para ligar' })
    expect(within(obras).getByText('Exemplar 2001')).toBeInTheDocument()
    expect(within(obras).getByText('SKC')).toBeInTheDocument()
    await userEvent.clear(busca)
    await userEvent.type(busca, 'autora 2004')
    await waitFor(() => expect(within(detalhe()).getByRole('list', { name: 'Obras para ligar' }).textContent).toContain('Autora 2004'))
    await excluirObra(minha)
  })

  it('«Ligar» liga as N iguais de uma vez e as tira da fila; o detalhe passa ao seguinte; U desfaz', async () => {
    abrir(comCaso(INVENTADO_5))
    await userEvent.type(await within(detalhe()).findByRole('searchbox', { name: 'Procurar por autor, ano ou título' }), 'Autora 2004')
    const ligar = await within(detalhe()).findByRole('button', { name: 'Ligar as 2 citações “Inventado 2001” a «Autora 2004»' })
    expect(ligar).toHaveTextContent('Ligar as 2 citações “Inventado 2001”')
    await userEvent.click(ligar)
    await waitFor(() => expect(textosDaLista()).toEqual(['Fantasma 1888: 3: obra fora da bibliografia', '1999: 12; sem autor na citação']))
    expect(apoio()).toContain(`${TOTAL - 2} casos`)
    expect(screen.getByText('2 citações ligadas por você a obras, fora da fila.')).toBeInTheDocument()
    expect(screen.getByText('«Inventado 2001»: as 2 citações ligadas a «Autora 2004».')).toBeInTheDocument()
    expect(estadoAtual().registro('citacao', 'inventado 2001')?.campos.obra).toBe('BIB-900002')
    // o vizinho que continua na fila (a outra «Inventado» saiu junto)
    await waitFor(() => expect(onde().searchParams.get('caso')).toBe(SEM_AUTOR))
    await waitFor(() => expect(document.activeElement).toBe(within(detalhe()).getByRole('heading', { level: 2 })))
    // U desfaz: as duas voltam, e o caso volta ao detalhe
    await waitFor(() => expect(atalhoRegistrado('u', 'revisao')).toBe(true))
    fireEvent.keyDown(document.body, { key: 'u' })
    await waitFor(() => expect(textosDaLista()).toHaveLength(4))
    await waitFor(() => expect(onde().searchParams.get('caso')).toBe(INVENTADO_5))
    expect(estadoAtual().registro('citacao', 'inventado 2001')?.excluido).toBe(true)
  })

  it('a citação sem autor liga só ela (a exceção da ocorrência)', async () => {
    abrir(comCaso(SEM_AUTOR))
    const d = detalhe()
    expect(await within(d).findByText('Sem autor na citação: «Ligar» liga só esta ocorrência.')).toBeInTheDocument()
    await userEvent.type(within(d).getByRole('searchbox', { name: 'Procurar por autor, ano ou título' }), 'Autor 1999')
    await userEvent.click(await within(d).findByRole('button', { name: 'Ligar a citação “1999: 12” a «Autor 1999»' }))
    await waitFor(() => expect(textosDaLista()).toEqual(['Fantasma 1888: 3: obra fora da bibliografia', 'Inventado 2001: 5', 'Inventado 2001: 9']))
    expect(estadoAtual().registro('citacao', '-@TESTE|TESTE-0006|1999: 12')?.campos.obra).toBe('BIB-900001')
    expect(estadoAtual().registro('citacao', '1999')).toBeUndefined()
  })

  it('a citação ligada: o detalhe diz a obra e «Desfazer a ligação» a devolve à fila', async () => {
    const { unmount } = abrir(comCaso(INVENTADO_9))
    await userEvent.type(await within(detalhe()).findByRole('searchbox', { name: 'Procurar por autor, ano ou título' }), 'Autor 1999')
    await userEvent.click(await within(detalhe()).findByRole('button', { name: /^Ligar as 2 citações “Inventado 2001” a «Autor 1999»/ }))
    await waitFor(() => expect(textosDaLista()).toHaveLength(2))
    unmount()
    // voltar ao caso ligado (como volta a Nova obra depois de salvar)
    abrir(comCaso(INVENTADO_9))
    const d = detalhe()
    expect(await within(d).findByText('Citação ligada por você')).toBeInTheDocument()
    expect(await within(d).findByRole('link', { name: 'Autor 1999' })).toHaveAttribute('href', '/obra/BIB-900001')
    await userEvent.click(within(d).getByRole('button', { name: 'Desfazer a ligação' }))
    await waitFor(() => expect(within(d).getByText(/^Citação não resolvida · /)).toBeInTheDocument())
    expect(estadoAtual().registro('citacao', 'inventado 2001')?.excluido).toBe(true)
  })

  it('Tarefa 14 (N3 da Tarefa 11): a obra ligada abre com a origem leve, e a página dela mostra «‹ Revisão» que volta ao caso', async () => {
    await ligar('inventado 2001', 'BIB-900001')
    abrir(comCaso(INVENTADO_9))
    const link = await within(detalhe()).findByRole('link', { name: 'Autor 1999' })
    await userEvent.click(link)
    const pagina = await screen.findByTestId('objeto')
    expect(pagina.textContent).toContain('/obra/BIB-900001')
    const voltar = JSON.parse(pagina.textContent!.slice(pagina.textContent!.indexOf(' ') + 1)) as { rotulo: string; caminho: string }
    expect(voltar.rotulo).toBe('Revisão')
    expect(new URL(`http://x${voltar.caminho}`).searchParams.get('caso')).toBe(INVENTADO_9)
  })
})

describe('a citação resolvida sem ligar', () => {
  it('ainda se liga; ligada, fica no detalhe como «ligada»', async () => {
    await registrar('revisao', INVENTADO_5, 'criar', { tipo: 'citacao_nao_resolvida' })
    abrir(comCaso(INVENTADO_5))
    const d = detalhe()
    expect(await within(d).findByText('Citação resolvida por você, sem ligar')).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: 'Devolver à fila' })).toBeInTheDocument()
    await userEvent.type(within(d).getByRole('searchbox', { name: 'Procurar por autor, ano ou título' }), 'Autor 1999')
    await userEvent.click(await within(d).findByRole('button', { name: /^Ligar as 2 citações/ }))
    expect(await within(detalhe()).findByText('Citação ligada por você')).toBeInTheDocument()
    expect(onde().searchParams.get('caso')).toBe(INVENTADO_5)
  })
})

describe('a obra do usuário excluída (foco 3)', () => {
  it('devolve as citações à fila; «Restaurar» as liga de novo', async () => {
    abrir('/revisao?abrir=citacoes-nao-resolvidas')
    await waitFor(() => expect(textosDaLista()).toHaveLength(4))
    const obra = await act(() => criarObra({ type: 'book', title: 'Livro Inventado', author: [{ family: 'Inventado' }], issued: { 'date-parts': [[2001]] } }, 'Inventado 2001', { ligarA: 'inventado 2001' }))
    await waitFor(() => expect(textosDaLista()).toHaveLength(2))
    await act(() => excluirObra(obra))
    await waitFor(() => expect(textosDaLista()).toEqual(['Fantasma 1888: 3: obra fora da bibliografia', 'Inventado 2001: 5', 'Inventado 2001: 9', '1999: 12; sem autor na citação']))
    expect(apoio()).toContain(`${TOTAL} casos`)
    await act(() => restaurarObra(obra))
    await waitFor(() => expect(textosDaLista()).toHaveLength(2))
    await act(() => excluirObra(obra))
  })

  it('Tarefa 14 (fix round 1): a obra publicada cujas origens você excluiu desliga na hora as citações ligadas pelo id do livro', async () => {
    // a obra sua BIB-teste123-1 foi publicada como BIB-900090 (pacote 10, `criado` 1); a Revisão liga «Inventado 2001» ao id do livro
    await registrar('obra', 'BIB-teste123-1', 'criar', { csl: { type: 'book', title: 'Selos sonhados no planalto fictício' }, curta: 'Imaginária 2010' })
    await ligar('inventado 2001', 'BIB-900090')
    abrir('/revisao?abrir=citacoes-nao-resolvidas')
    await waitFor(() => expect(textosDaLista()).toEqual(['Fantasma 1888: 3: obra fora da bibliografia', '1999: 12; sem autor na citação']))
    // «Excluir a sua obra»: a obra sai no build seguinte (`obras_que_saem`), e as citações ligadas a ela voltam já, também a que
    // o pacote traz ligada pelo usuário («Imaginária 2010: 3»)
    await act(() => registrar('obra', 'BIB-teste123-1', 'excluir'))
    await waitFor(() =>
      expect(textosDaLista()).toEqual(['Fantasma 1888: 3: obra fora da bibliografia', 'Inventado 2001: 5', 'Inventado 2001: 9', '1999: 12; sem autor na citação', 'Imaginária 2010: 3']),
    )
    // «Restaurar» liga de novo (nada foi apagado: a ligação continua na camada)
    expect(estadoAtual().registro('citacao', 'inventado 2001')?.campos.obra).toBe('BIB-900090')
    await act(() => registrar('obra', 'BIB-teste123-1', 'restaurar'))
    await waitFor(() => expect(textosDaLista()).toEqual(['Fantasma 1888: 3: obra fora da bibliografia', '1999: 12; sem autor na citação']))
    // a origem fica viva (como o pacote a traz): excluída, ela devolveria a «Imaginária 2010: 3» à fila dos testes seguintes
  })

  it('M1 (revisão final): a obra publicada cujas origens você excluiu não se oferece para «Ligar» (a busca e as parecidas)', async () => {
    if (!estadoAtual().registro('obra', 'BIB-teste123-1'))
      await registrar('obra', 'BIB-teste123-1', 'criar', { csl: { type: 'book', title: 'Selos sonhados no planalto fictício' }, curta: 'Imaginária 2010' })
    abrir(comCaso(INVENTADO_5))
    const ligarAImaginaria = () => within(detalhe()).queryAllByRole('button', { name: /a «Imaginária 2010»$/ })
    await userEvent.type(await within(detalhe()).findByRole('searchbox', { name: 'Procurar por autor, ano ou título' }), 'Imaginária')
    await waitFor(() => expect(ligarAImaginaria()).toHaveLength(1))       // viva, ela se oferece
    await act(() => registrar('obra', 'BIB-teste123-1', 'excluir'))
    await waitFor(() => expect(ligarAImaginaria()).toHaveLength(0))
    // a «Imaginária 2010: 3» volta à fila; nas parecidas dela (o sobrenome e o ano) a obra que sai também não aparece
    await userEvent.click(await screen.findByRole('link', { name: /^Imaginária 2010: 3/ }))
    expect(await within(detalhe()).findByRole('heading', { level: 2, name: 'Imaginária 2010: 3' })).toBeInTheDocument()
    expect(within(detalhe()).getByText('Nenhuma obra da Bibliografia tem este autor e este ano.')).toBeInTheDocument()
    expect(ligarAImaginaria()).toHaveLength(0)
    // restaurada, a citação do pacote volta ligada a ela e sai da fila
    await act(() => registrar('obra', 'BIB-teste123-1', 'restaurar'))
    await waitFor(() => expect(screen.queryByRole('link', { name: /^Imaginária 2010: 3/ })).toBeNull())
  })
})

describe('no celular: a lista de hoje, e o caso numa página', () => {
  it('o texto da linha abre a página do caso; «Ligar» volta à lista sem o caso', async () => {
    instalarMatchMedia(375)
    abrir('/revisao?abrir=citacoes-nao-resolvidas')
    // a lista de hoje: o número, as ações na linha
    await waitFor(() => expect(textosDaLista()).toHaveLength(4))
    const li = listaDasCitacoes()!.querySelectorAll('li')[1]!
    expect(within(li).getByRole('link', { name: 'Abrir CA00004' })).toBeInTheDocument()
    expect(within(li).getByRole('button', { name: 'Deixar como está: CA00004' })).toBeInTheDocument()
    expect(screen.queryByRole('searchbox', { name: 'Filtrar' })).toBeNull()
    await userEvent.click(within(li).getByRole('link', { name: /^Inventado 2001: 5/ }))
    expect(onde().searchParams.get('caso')).toBe(INVENTADO_5)
    expect(screen.queryByRole('list', { name: 'Casos por tipo' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Voltar à Revisão' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 2, name: 'Inventado 2001: 5' })).toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Procurar por autor, ano ou título' }), 'Autora 2004')
    await userEvent.click(await screen.findByRole('button', { name: /^Ligar as 2 citações/ }))
    await waitFor(() => expect(onde().searchParams.get('caso')).toBeNull())
    await waitFor(() => expect(textosDaLista()).toEqual(['Fantasma 1888: 3: obra fora da bibliografia', '1999: 12; sem autor na citação']))
    expect(screen.getByText('«Inventado 2001»: as 2 citações ligadas a «Autora 2004».')).toBeInTheDocument()
  })
})

describe('o teclado', () => {
  it('↑ ↓ andam pela lista, Enter abre o caso (de novo, vai ao detalhe), D marca no detalhe e U desfaz', async () => {
    abrir('/revisao?abrir=citacoes-nao-resolvidas')
    await waitFor(() => expect(textosDaLista()).toHaveLength(4))
    await waitFor(() => expect(atalhoRegistrado('ArrowDown', 'revisao')).toBe(true))
    const cabeca = screen.getByRole('button', { name: /^Citações não resolvidas/ })
    cabeca.focus()
    fireEvent.keyDown(cabeca, { key: 'ArrowDown' })
    expect(document.activeElement).toHaveTextContent(/^Fantasma 1888/)
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toHaveTextContent(/^Inventado 2001: 5/)
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    // só o escolhido entra no Tab; os outros, pelas setas
    expect(document.activeElement).toHaveAttribute('tabindex', '-1')
    await userEvent.keyboard('{Enter}')
    expect(onde().searchParams.get('caso')).toBe(INVENTADO_5)
    expect(screen.getByRole('link', { name: /^Inventado 2001: 5/ })).toHaveAttribute('tabindex', '0')
    await userEvent.keyboard('{Enter}')
    const titulo = within(detalhe()).getByRole('heading', { level: 2 })
    expect(document.activeElement).toBe(titulo)
    fireEvent.keyDown(titulo, { key: 'd' })
    await waitFor(() => expect(estadoAtual().registro('revisao', INVENTADO_5)?.excluido).toBe(false))
    // o detalhe passou ao seguinte
    await waitFor(() => expect(onde().searchParams.get('caso')).toBe(INVENTADO_9))
    fireEvent.keyDown(document.body, { key: 'u' })
    await waitFor(() => expect(estadoAtual().registro('revisao', INVENTADO_5)?.excluido).toBe(true))
    await waitFor(() => expect(onde().searchParams.get('caso')).toBe(INVENTADO_5))
  })
})
