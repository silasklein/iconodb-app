/**
 * Comparar (Tarefa 14) sobre o pacote sintético (CA00001 a CA00004, BA00001, BA00002): a bandeja de até 4 objetos lado a lado
 * no computador (imagem, ficha e leituras em linhas alinhadas, "≠" no que difere), um objeto por vez no celular (deslizar, a
 * posição "2 de 3", botões, ← →), remover e esvaziar com Desfazer, o que não coube, "+" por número, objetos SKC (com número,
 * rascunho, excluído, ainda não sincronizado) e o número do livro que o pacote não tem.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { processadaFalsa } from '../../tests/suporte/imagensDeTeste'
import { reabrirBanco, usarMotor } from '../banco/cliente'
import * as consultasModulo from '../banco/consultas'
import { numerosDosObjetos } from '../banco/consultas'
import { lerBandeja, REG_DA_BANDEJA } from '../comparar/modelo'
import * as operacoesModulo from '../comparar/operacoes'
import { acrescentarABandeja, acrescentarVariasABandeja, esvaziarBandeja, substituirBandeja, tirarDaBandeja } from '../comparar/operacoes'
import { B, ev } from '../../tests/suporte/eventosDeTeste'
import { campoDaOrdem, campoDaPresenca } from '../colecoes/modelo'
import { usarArmazemDasImagens, usarCacheDasImagens } from '../imagens-usuario/local'
import { adicionarImagem } from '../imagens-usuario/operacoes'
import { usarEscritaDasImagens } from '../imagens-usuario/urls'
import { objetoQueTeveONumero } from '../comparar/useColunas'
import { gruposDe, numeracaoDe } from '../objetos-skc/atual'
import { unirConfirmadosGuardados, esquecerConfirmados } from '../objetos-skc/confirmados'
import { pedirFocoNoAmpliar } from '../imagem/estado'
import { ligarObjetos } from '../objetos-skc/operacoes'
import { definirFonteDosNumerosDoPacote, recarregarNumerosDoPacote } from '../objetos-skc/pacote'
import { armazemMemoria } from '../pacote/armazem'
import { cacheMemoria } from '../pacote/imagens'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { definirSync, zerarSync } from '../../tests/suporte/syncSimulada'
import { estadoAtual, receberEventos, registrar } from '../usuario/estado'
import { Comparar } from './Comparar'
import { apertarQuandoPronto } from '../test/teclas'

vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
vi.mock('../pacote/imagens', async (original) => ({ ...(await original<typeof import('../pacote/imagens')>()), urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

function Local() {
  const { pathname, search, state } = useLocation()
  return (
    <output data-testid="local" data-state={JSON.stringify(state ?? null)}>
      {pathname + search}
    </output>
  )
}
/** O visualizador de imagem, em miniatura: "Fechar" faz o que o de verdade faz (pede o foco no "Ampliar" e volta no histórico). */
function Visualizador() {
  const navegar = useNavigate()
  return (
    <button
      type="button"
      onClick={() => {
        pedirFocoNoAmpliar()
        void navegar(-1)
      }}
    >
      Fechar o visualizador
    </button>
  )
}
/** Voltar no histórico, como o botão do navegador. */
function Historico() {
  const navegar = useNavigate()
  return (
    <>
      <button type="button" onClick={() => void navegar(-1)}>
        Voltar no histórico (teste)
      </button>
      {/* Uma entrega atrasada do roteador: o endereço chega sem o «pos» que a tela já pediu (veja o teste do gate D-11). */}
      <button type="button" onClick={() => void navegar('/comparar', { replace: true })}>
        Endereço sem a posição (teste)
      </button>
    </>
  )
}
function abrir(entradas: unknown[] = ['/comparar']) {
  return render(
    <MemoryRouter initialEntries={entradas as never} initialIndex={entradas.length - 1}>
      <Routes>
        <Route path="/comparar" element={<Comparar />} />
        <Route path="/imagem/:id" element={<Visualizador />} />
        <Route path="*" element={null} />
      </Routes>
      <Local />
      <Historico />
    </MemoryRouter>,
  )
}
const local = () => screen.getByTestId('local').textContent
const bandeja = () => lerBandeja(estadoAtual().registro('comparar', REG_DA_BANDEJA))
const colunas = () => screen.getAllByRole('region', { hidden: true }).filter((r) => r.classList.contains('comparar-coluna'))
const coluna = (nome: string) => screen.getByRole('region', { name: nome })
const linhasDe = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.comparar-celula')]
/** Sinal de que a tela e as teclas dela já estão prontas: a faixa das colunas (ou o texto de vazio) já foi desenhada. */
const pronto = async () => {
  await waitFor(() => expect(document.querySelector('.comparar-colunas, .comparar-vazio')).not.toBeNull())
  await waitFor(() => expect(document.querySelector('[aria-busy="true"].comparar-corpo')).toBeNull())
}

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  Element.prototype.scrollIntoView = vi.fn()
})
afterAll(() => usarMotor(null))
beforeEach(async () => {
  instalarMatchMedia(1280)
  usarArmazemDasImagens(armazemMemoria())
  usarCacheDasImagens(cacheMemoria())
  usarEscritaDasImagens(async () => null)
  definirFonteDosNumerosDoPacote(numerosDosObjetos)
  await recarregarNumerosDoPacote()
  await esvaziarBandeja()
  for (const r of estadoAtual().registros.get('objeto')?.values() ?? []) if (!r.excluido) await registrar('objeto', r.id, 'excluir')
  for (const r of estadoAtual().registros.get('ligacao')?.values() ?? []) if (r.campos.ativa === true) await registrar('ligacao', r.id, 'alterar', { ativa: false })
})
afterEach(() => {
  zerarSync()
  esquecerConfirmados()
  usarArmazemDasImagens(undefined)
  usarCacheDasImagens(undefined)
  usarEscritaDasImagens(undefined)
  definirFonteDosNumerosDoPacote(null)
  vi.restoreAllMocks()
  instalarMatchMedia(375)
})

let n = 0
async function objetoSkc(campos: Record<string, unknown> = {}): Promise<string> {
  const id = `OB-teste${String(++n).padStart(3, '0')}-${n}`.replace(/^OB-(.{8}).*-(\d+)$/, 'OB-$1-$2')
  await registrar('objeto', id, 'criar', { origemTipo: 'achado', achado: 'museu', periodo: 'CA', titulo: 'Peça de teste. Cobre.', ...campos } as never)
  return id
}

describe('a bandeja vazia', () => {
  it('diz que não há objetos, ensina como pôr e não mostra "Esvaziar"', async () => {
    abrir()
    await pronto()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Comparar · 0 objetos')
    expect(screen.getByText('Nenhum objeto na comparação.')).toBeInTheDocument()
    expect(screen.getByText(/Shift\+C/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar objeto à comparação' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Esvaziar a comparação' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mostrar só as diferenças' })).toBeNull()
  })
})

describe('no computador: os objetos lado a lado', () => {
  it('uma coluna por objeto, na ordem da bandeja, com o número, a origem e o tipo no cabeçalho e a imagem', async () => {
    await acrescentarVariasABandeja(['CA00002', 'CA00001'])
    abrir()
    await pronto()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Comparar · 2 objetos')
    const cs = await screen.findAllByRole('region', { name: /^CA0000[12]$/ })
    expect(cs.map((c) => c.getAttribute('aria-label'))).toEqual(['CA00002', 'CA00001'])
    const um = coluna('CA00001')
    expect(within(um).getByRole('heading', { level: 2 })).toHaveTextContent('Pingente com leão-de-teste. Pedra de teste.')
    expect(um).toHaveTextContent('CA00001 · TESTE I: 1')
    await waitFor(() => expect(within(um).getByRole('img', { name: /Imagem 1 de CA00001/ })).toBeInTheDocument())
    // a mesma imagem de traço do Item: invertida
    expect(within(um).getByRole('img', { name: /invertida/ })).toHaveStyle({ filter: 'invert(1)' })
    expect(within(um).getByRole('link', { name: 'Abrir o item CA00001' })).toHaveAttribute('href', '/item/CA00001')
  })

  it('as linhas são as mesmas, na mesma ordem e na mesma linha da grade, em todas as colunas', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002', 'CA00003'])
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00003' })
    await waitFor(() => expect(linhasDe(coluna('CA00001')).length).toBeGreaterThan(0))
    const de = (c: HTMLElement) => linhasDe(c).map((l) => `${l.style.gridRow}:${l.querySelector('dt')!.textContent!.replace('≠', '').trim()}`)
    const a = de(coluna('CA00001'))
    expect(de(coluna('CA00002'))).toEqual(a)
    expect(de(coluna('CA00003'))).toEqual(a)
    // a ficha, depois as hipóteses, depois a leitura
    expect(a.map((x) => x.split(':')[1])).toEqual(expect.arrayContaining(['Sítio', 'Data', 'Hipóteses']))
    // cabeçalho 1, imagem 2, linhas a partir da 3, pé na última
    expect(a[0]!.startsWith('3')).toBe(true)
    for (const c of ['CA00001', 'CA00002', 'CA00003']) {
      const col = coluna(c)
      expect(col.style.gridRow).toBe(`1 / span ${3 + a.length}`)
      expect(col.querySelector<HTMLElement>('.comparar-pe')!.style.gridRow).toBe(String(3 + a.length))
    }
  })

  it('marca com ≠ o que difere e não marca o que é igual; as hipóteses seguem o desenho (três níveis)', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002'])
    abrir()
    await pronto()
    await waitFor(() => expect(within(coluna('CA00001')).getByText('Hipóteses')).toBeInTheDocument())
    const celula = (c: string, rotulo: string) => linhasDe(coluna(c)).find((l) => l.querySelector('dt')!.textContent!.startsWith(rotulo))!
    const medidas1 = celula('CA00001', 'Medidas')
    const medidas2 = celula('CA00002', 'Medidas')
    expect(medidas1.querySelector('dd')).not.toBeNull()
    expect(medidas1.textContent).not.toEqual(medidas2.textContent)
    expect(within(medidas1).getByRole('img', { name: 'difere' })).toHaveTextContent('≠')
    const hip = celula('CA00001', 'Hipóteses')
    expect(hip).toHaveTextContent(/\d+ pré-iconográficas? · \d+ iconográficas? · \d+ iconológicas?|Nenhuma hipótese/)
    // o que é igual nos dois não leva ≠ (o acervo de teste é o mesmo museu? se for, não difere)
    for (const l of [...linhasDe(coluna('CA00001'))]) {
      const outra = linhasDe(coluna('CA00002')).find((x) => x.querySelector('dt')!.textContent!.replace('≠', '') === l.querySelector('dt')!.textContent!.replace('≠', ''))!
      expect(l.classList.contains('comparar-difere')).toBe(outra.classList.contains('comparar-difere'))
    }
  })

  it('"Mostrar só as diferenças" esconde o que é igual e volta a mostrar', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002'])
    abrir()
    await pronto()
    await waitFor(() => expect(linhasDe(coluna('CA00001')).length).toBeGreaterThan(0))
    const todas = linhasDe(coluna('CA00001')).length
    const diferentes = linhasDe(coluna('CA00001')).filter((l) => l.classList.contains('comparar-difere')).length
    const botao = screen.getByRole('button', { name: 'Mostrar só as diferenças' })
    expect(botao).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(botao)
    expect(botao).toHaveAttribute('aria-pressed', 'true')
    expect(linhasDe(coluna('CA00001'))).toHaveLength(diferentes)
    expect(linhasDe(coluna('CA00002'))).toHaveLength(diferentes)
    // o cabeçalho, a imagem e o pé continuam
    expect(within(coluna('CA00001')).getByRole('heading', { level: 2 })).toBeInTheDocument()
    expect(within(coluna('CA00001')).getByRole('link', { name: 'Abrir o item CA00001' })).toBeInTheDocument()
    await userEvent.click(botao)
    expect(linhasDe(coluna('CA00001'))).toHaveLength(todas)
  })

  it('com um objeto só não há o que comparar: sem o botão das diferenças e sem ≠', async () => {
    await acrescentarVariasABandeja(['CA00001'])
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00001' })
    expect(screen.queryByRole('button', { name: 'Mostrar só as diferenças' })).toBeNull()
    expect(screen.queryByRole('img', { name: 'difere' })).toBeNull()
  })

  it('quatro objetos cabem lado a lado', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002', 'CA00003', 'CA00004'])
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00004' })
    expect(screen.getByTestId('comparar-colunas')).toHaveAttribute('data-n', '4')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Comparar · 4 objetos')
  })

  it('um campo que um objeto não tem é uma célula vazia, na mesma linha dos outros', async () => {
    const a = await objetoSkc({ titulo: 'Com tudo', material: 'Cobre', acervo: 'Museu A' })
    const b = await objetoSkc({ titulo: 'Sem material' })
    await acrescentarVariasABandeja([a, b])
    abrir()
    await pronto()
    const [ca, cb] = await waitFor(() => {
      const cs = colunas()
      expect(cs).toHaveLength(2)
      return cs
    })
    const material = (c: HTMLElement) => linhasDe(c).find((l) => l.querySelector('dt')!.textContent!.startsWith('Material'))!
    expect(material(ca!).style.gridRow).toBe(material(cb!).style.gridRow)
    expect(material(ca!)).toHaveTextContent('Cobre')
    expect(material(cb!)).toHaveClass('comparar-celula-vazia')
    expect(material(cb!)).toHaveTextContent('sem dado')
    expect(material(cb!).querySelector('p')).toBeNull()
  })

  it('um texto longo vira "Ler tudo" na própria linha e não desloca as outras linhas', async () => {
    const longo = 'Um texto bem longo sobre o objeto. '.repeat(30)
    const a = await objetoSkc({ titulo: 'A', leitura: longo })
    const b = await objetoSkc({ titulo: 'B', leitura: 'Curto.' })
    await acrescentarVariasABandeja([a, b])
    abrir()
    await pronto()
    const [ca, cb] = await waitFor(() => {
      const cs = colunas()
      expect(cs).toHaveLength(2)
      return cs
    })
    const linhas = (c: HTMLElement) => linhasDe(c).map((l) => l.style.gridRow)
    const antes = linhas(ca!)
    expect(linhas(cb!)).toEqual(antes)
    const botao = within(ca!).getByRole('button', { name: 'Ler tudo' })
    expect(within(cb!).queryByRole('button', { name: 'Ler tudo' })).toBeNull()
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(ca!.querySelector('.comparar-texto-recolhido')).not.toBeNull()
    await userEvent.click(botao)
    expect(within(ca!).getByRole('button', { name: 'Recolher' })).toHaveAttribute('aria-expanded', 'true')
    expect(ca!.querySelector('.comparar-texto-recolhido')).toBeNull()
    expect(linhas(ca!)).toEqual(antes)
    expect(linhas(cb!)).toEqual(antes)
  })

  it('a leitura de um livro sem tradução aparece em alemão, marcada', async () => {
    const a = await objetoSkc({ titulo: 'Só SKC', leitura: 'Minha leitura.' })
    await acrescentarVariasABandeja([a, 'CA00001'])
    abrir()
    await pronto()
    await waitFor(() => expect(colunas()).toHaveLength(2))
    // as duas leituras estão em linhas próprias (uma por sigla), cada objeto com a sua e a célula vazia da outra
    await waitFor(() => expect(document.querySelectorAll('.comparar-celula-leitura').length).toBeGreaterThanOrEqual(4))
    const skc = [...document.querySelectorAll<HTMLElement>('.comparar-celula-leitura')].filter((l) => l.querySelector('dt')!.textContent!.startsWith('SKC'))
    expect(skc).toHaveLength(2)
    expect(skc.filter((l) => l.classList.contains('comparar-celula-vazia'))).toHaveLength(1)
    expect(skc.map((l) => l.style.gridRow)[0]).toBe(skc.map((l) => l.style.gridRow)[1])
  })
})

describe('objetos SKC e o que não está aqui', () => {
  it('um objeto SKC com número: o número, "SKC" e a marca provisório; a ficha vem do objeto', async () => {
    const id = await objetoSkc({ titulo: 'Selo de teste', material: 'Esteatita', altura: '3', largura: '2' })
    await acrescentarVariasABandeja([id, 'CA00001'])
    abrir()
    await pronto()
    const c = await screen.findByRole('region', { name: /^CA\d{5}$/ , hidden: true }).catch(() => null)
    void c
    await waitFor(() => expect(colunas()).toHaveLength(2))
    const skc = colunas().find((x) => x.textContent!.includes('Selo de teste'))!
    expect(skc).toHaveTextContent(/CA\d{5}\s*· SKCprovisório/)
    expect(skc).toHaveTextContent('Esteatita')
    expect(skc).toHaveTextContent('3 × 2 cm')
    // o link leva ao número, não ao id
    expect(within(skc).getByRole('link', { name: /Abrir o item/ }).getAttribute('href')).toMatch(/^\/item\/CA\d{5}$/)
  })

  it('um rascunho sem número aparece como "Sem número" e leva ao id', async () => {
    const id = await objetoSkc({ titulo: 'Rascunho', periodo: null })
    await acrescentarVariasABandeja([id])
    abrir()
    await pronto()
    const col = await screen.findByRole('region', { name: id })
    expect(col).toHaveTextContent('Sem número')
    expect(within(col).getByRole('link', { name: /Abrir o item/ })).toHaveAttribute('href', `/item/${id}`)
  })

  it('um objeto excluído aparece com a marca "excluído", com os dados; não derruba a tela', async () => {
    const id = await objetoSkc({ titulo: 'Vai ser excluído' })
    await acrescentarVariasABandeja([id, 'CA00001'])
    await registrar('objeto', id, 'excluir')
    abrir()
    await pronto()
    await waitFor(() => expect(colunas()).toHaveLength(2))
    const col = colunas().find((x) => x.textContent!.includes('Vai ser excluído'))!
    expect(within(col).getByText('excluído')).toHaveClass('marca-excluido')
    expect(within(col).getByRole('button', { name: /Tirar da comparação: / })).toBeInTheDocument()
  })

  it('um id que este aparelho ainda não tem: "ainda não sincronizado", a coluna fica na grade e dá para tirar', async () => {
    await acrescentarVariasABandeja(['OB-outroapa-7', 'CA00001'])
    abrir()
    await pronto()
    const col = await screen.findByRole('region', { name: 'OB-outroapa-7' })
    expect(within(col).getByText('ainda não sincronizado')).toHaveClass('marca-excluido')
    expect(col).toHaveTextContent('ainda não chegou a este aparelho')
    // as linhas existem também nesta coluna, vazias
    await waitFor(() => expect(linhasDe(col).length).toBeGreaterThan(0))
    expect(linhasDe(col).every((l) => l.classList.contains('comparar-celula-vazia'))).toBe(true)
    await userEvent.click(within(col).getByRole('button', { name: 'Tirar da comparação: OB-outroapa-7' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'OB-outroapa-7' })).toBeNull())
  })

  it('o objeto chega depois (outro aparelho): a coluna passa a ter os dados', async () => {
    await acrescentarVariasABandeja(['OB-chegando-1'])
    abrir()
    await pronto()
    expect(await screen.findByText('ainda não sincronizado')).toBeInTheDocument()
    await act(async () => {
      await registrar('objeto', 'OB-chegando-1', 'criar', { origemTipo: 'achado', achado: 'x', periodo: 'CA', titulo: 'Chegou' } as never)
    })
    expect(await screen.findByText('Chegou')).toBeInTheDocument()
    expect(screen.queryByText('ainda não sincronizado')).toBeNull()
  })

  it('um número que o pacote não tem: "não encontrado", sem derrubar a tela', async () => {
    await acrescentarVariasABandeja(['CA09999', 'CA00001'])
    abrir()
    await pronto()
    const col = await screen.findByRole('region', { name: 'CA09999' })
    await waitFor(() => expect(within(col).getByText('não encontrado')).toBeInTheDocument())
    expect(col).toHaveTextContent('Este número não está no pacote.')
  })

  it('a imagem do usuário aparece com a marca SKC e o crédito, como no Item', async () => {
    const id = await objetoSkc({ titulo: 'Com foto' })
    await adicionarImagem({ objeto: id }, processadaFalsa(), { tipo: 'tons', legenda: 'vista frontal', credito: 'Museu de Teste', principal: false })
    await acrescentarVariasABandeja([id])
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:usuario/1')
    abrir()
    await pronto()
    const col = await waitFor(() => {
      const cs = colunas()
      expect(cs).toHaveLength(1)
      return cs[0]!
    })
    expect(await within(col).findByText('Museu de Teste · vista frontal')).toBeInTheDocument()
    expect(within(col).getByText('SKC', { selector: '.marca-skc' })).toBeInTheDocument()
  })
})

describe('as ligações e os números da Tarefa 9', () => {
  it('objetos ligados são colunas separadas, cada uma com a marca «ligado a …»; só a que não é a principal abre sozinha (?sozinho=1)', async () => {
    const id = await objetoSkc({ titulo: 'Principal ligado' })
    await ligarObjetos(id, 'CA00001')
    const principal = gruposDe(estadoAtual()).principal('CA00001')
    const livroEhPrincipal = principal === 'CA00001'
    await acrescentarVariasABandeja(['CA00001', id])
    abrir()
    await pronto()
    await waitFor(() => expect(colunas()).toHaveLength(2))
    const livro = coluna('CA00001')
    const skc = colunas().find((c) => c !== livro)!
    expect(within(livro).getByRole('heading', { level: 2 })).toHaveTextContent('Pingente com leão-de-teste.')
    const numeroSkc = numeracaoDe(estadoAtual()).porId.get(id)!.numero!
    const secundaria = livroEhPrincipal ? skc : livro
    const principalDaColuna = livroEhPrincipal ? 'CA00001' : numeroSkc
    expect(within(secundaria).getByText(`ligado a ${principalDaColuna}`)).toBeInTheDocument()
    const outra = livroEhPrincipal ? livro : skc
    expect(within(outra).queryByText(/^ligado a /)).toBeNull()
    // o link da secundária leva a ELA, sem redirecionar ao principal; o da principal é o comum
    const alvoDaSecundaria = livroEhPrincipal ? `/item/${encodeURIComponent(numeroSkc)}?sozinho=1` : '/item/CA00001?sozinho=1'
    expect(within(secundaria).getByRole('link', { name: /Abrir o item/ })).toHaveAttribute('href', alvoDaSecundaria)
    expect(within(outra).getByRole('link', { name: /Abrir o item/ })).toHaveAttribute('href', livroEhPrincipal ? '/item/CA00001' : `/item/${encodeURIComponent(numeroSkc)}`)
  })

  it('as hipóteses da coluna principal contam as do grupo, como o Item; a secundária conta só as dela (m8)', async () => {
    const id = await objetoSkc({ titulo: 'Com hipótese' })
    await ligarObjetos(id, 'CA00001')
    const principal = gruposDe(estadoAtual()).principal('CA00001')
    const secundario = principal === 'CA00001' ? id : 'CA00001'
    await registrar('hipotese', 'HY-grupoaaa-1', 'criar', { objeto: secundario, sobre: 'objeto', elemento: null, elementoRotulo: '', termos: [], termosRotulos: [], nivel: 'iconological', modalidade: 'probable', justificativa: 'do grupo', ancora: null })
    await acrescentarVariasABandeja(['CA00001', id])
    abrir()
    await pronto()
    await waitFor(() => expect(colunas()).toHaveLength(2))
    const hip = (c: HTMLElement) => linhasDe(c).find((l) => l.querySelector('dt')!.textContent!.startsWith('Hipóteses'))!
    const colunaDe = (ref: string) => (ref === 'CA00001' ? coluna('CA00001') : colunas().find((c) => c !== coluna('CA00001'))!)
    await waitFor(() => expect(hip(colunaDe(principal))).toHaveTextContent(/1 iconológica(?!s)/))
    expect(hip(colunaDe(secundario))).toHaveTextContent(/1 iconológica(?!s)/)
  })

  it('o número provisório que um objeto SKC teve e perdeu leva ao objeto (o mesmo que o Item faz), e o número de agora não', () => {
    const info = (id: string, numero: string | null, pedido: string | null, reserva: string | null = null) => ({ id, numero, pedido, reserva })
    const numeracao = {
      porId: new Map([
        ['OB-aaaaaaaa-1', info('OB-aaaaaaaa-1', 'CA00006', 'CA00005')],
        ['OB-aaaaaaaa-2', info('OB-aaaaaaaa-2', 'CA00007', 'CA00007')],
        ['OB-aaaaaaaa-3', info('OB-aaaaaaaa-3', 'CA00009', 'CA00008', 'CA00008')],
      ]),
    }
    const achar = (n: string) => objetoQueTeveONumero(n, numeracao as never)
    expect(achar('CA00005')).toBe('OB-aaaaaaaa-1')
    expect(achar('CA00006')).toBeNull()
    expect(achar('CA00007')).toBeNull()
    // uma reserva de livro não é um objeto SKC
    expect(achar('CA00008')).toBeNull()
    expect(achar('CA00099')).toBeNull()
  })
})

describe('tirar, esvaziar e desfazer', () => {
  it('tirar um objeto: a coluna sai, a mensagem diz qual e Desfazer o põe de volta no mesmo lugar', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002', 'CA00003'])
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00002' })
    await userEvent.click(within(coluna('CA00002')).getByRole('button', { name: 'Tirar da comparação: CA00002' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'CA00002' })).toBeNull())
    expect(bandeja().itens).toEqual(['CA00001', 'CA00003'])
    await waitFor(() => expect(screen.getByRole('status', { name: 'Mensagem de Comparar' })).toHaveTextContent('CA00002 tirado da comparação.'))
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await screen.findByRole('region', { name: 'CA00002' })
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002', 'CA00003'])
    expect(screen.getAllByRole('region', { name: /^CA0000\d$/ }).map((r) => r.getAttribute('aria-label'))).toEqual(['CA00001', 'CA00002', 'CA00003'])
  })

  it('esvaziar tira todos de uma vez e oferece Desfazer (nada se perde em silêncio)', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002'])
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00002' })
    await userEvent.click(screen.getByRole('button', { name: 'Esvaziar a comparação' }))
    await waitFor(() => expect(bandeja().todos).toHaveLength(0))
    expect(await screen.findByText('Nenhum objeto na comparação.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('status', { name: 'Mensagem de Comparar' })).toHaveTextContent('Comparação esvaziada: 2 objetos tirados.'))
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await screen.findByRole('region', { name: 'CA00002' })
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002'])
  })

  it('depois de tirar, o foco não se perde: vai ao "Tirar" da coluna que ocupa o lugar', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002'])
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00002' })
    await userEvent.click(within(coluna('CA00001')).getByRole('button', { name: 'Tirar da comparação: CA00001' }))
    await waitFor(() => expect(within(coluna('CA00002')).getByRole('button', { name: 'Tirar da comparação: CA00002' })).toHaveFocus())
  })

  // I2 (revisão 1): nenhum destes toca no "+" antes, que era o que escondia a perda de foco.
  it('depois de «Esvaziar» o foco vai ao «Desfazer» da mensagem (o botão que foi clicado some)', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002'])
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00002' })
    await userEvent.click(screen.getByRole('button', { name: 'Esvaziar a comparação' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desfazer' })).toHaveFocus())
    expect(document.activeElement).not.toBe(document.body)
  })

  it('depois de tirar o único objeto o foco vai ao «+», achado na hora (sem ter clicado nele)', async () => {
    await acrescentarVariasABandeja(['CA00001'])
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00001' })
    await userEvent.click(within(coluna('CA00001')).getByRole('button', { name: 'Tirar da comparação: CA00001' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adicionar objeto à comparação' })).toHaveFocus())
  })

  it('depois de tirar um de «Não couberam» o foco vai ao «Tirar» seguinte da lista; no último, ao «+»', async () => {
    await registrar('comparar', REG_DA_BANDEJA, estadoAtual().registro('comparar', REG_DA_BANDEJA) ? 'alterar' : 'criar', Object.fromEntries(['CA00001', 'CA00002', 'CA00003', 'CA00004', 'BA00001', 'BA00002'].flatMap((r, i) => [[`m:${r}`, true], [`i:${r}`, 1024 * (i + 1)]])))
    abrir()
    await pronto()
    const lista = await screen.findByRole('region', { name: 'Não couberam' })
    await userEvent.click(within(lista).getByRole('button', { name: 'Tirar da comparação: BA00001' }))
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Não couberam' })).getByRole('button', { name: 'Tirar da comparação: BA00002' })).toHaveFocus())
    await userEvent.click(within(screen.getByRole('region', { name: 'Não couberam' })).getByRole('button', { name: 'Tirar da comparação: BA00002' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adicionar objeto à comparação' })).toHaveFocus())
  })
})

describe('o que não coube (depois de dois aparelhos acrescentarem sem se ver)', () => {
  const seis = ['CA00001', 'CA00002', 'CA00003', 'CA00004', 'BA00001', 'BA00002']
  async function semear() {
    await registrar('comparar', REG_DA_BANDEJA, estadoAtual().registro('comparar', REG_DA_BANDEJA) ? 'alterar' : 'criar', Object.fromEntries(seis.flatMap((r, i) => [[`m:${r}`, true], [`i:${r}`, 1024 * (i + 1)]])))
  }

  it('mostra 4 colunas e diz quais não couberam, pelo número', async () => {
    await semear()
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00004' })
    expect(screen.getAllByRole('region', { name: /^(CA|BA)\d{5}$/ })).toHaveLength(4)
    const aviso = screen.getByRole('region', { name: 'Não couberam' })
    expect(aviso).toHaveTextContent('2 objetos não couberam')
    expect(within(aviso).getAllByRole('listitem').map((l) => l.textContent)).toEqual(['BA00001Tirar', 'BA00002Tirar'])
  })

  it('tirar um da bandeja faz o primeiro que não coube entrar', async () => {
    await semear()
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00004' })
    await userEvent.click(within(coluna('CA00002')).getByRole('button', { name: 'Tirar da comparação: CA00002' }))
    await screen.findByRole('region', { name: 'BA00001' })
    expect(within(screen.getByRole('region', { name: 'Não couberam' })).getAllByRole('listitem')).toHaveLength(1)
  })

  it('tirar um dos que não couberam o tira de vez (com Desfazer)', async () => {
    await semear()
    abrir()
    await pronto()
    const aviso = await screen.findByRole('region', { name: 'Não couberam' })
    await userEvent.click(within(aviso).getByRole('button', { name: 'Tirar da comparação: BA00001' }))
    await waitFor(() => expect(bandeja().todos.map((m) => m.ref)).not.toContain('BA00001'))
    await waitFor(() => expect(screen.getByRole('status', { name: 'Mensagem de Comparar' })).toHaveTextContent('BA00001 tirado da comparação.'))
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(bandeja().todos.map((m) => m.ref)).toContain('BA00001'))
  })

  it('o título conta só os 4 da bandeja', async () => {
    await semear()
    abrir()
    await pronto()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Comparar · 4 objetos')
  })
})

describe('"+" por número', () => {
  async function abrirForm() {
    abrir()
    await pronto()
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar objeto à comparação' }))
    return screen.getByRole('form', { name: 'Adicionar por número' })
  }

  it('escrever um número do livro põe o objeto na bandeja e fecha o campo', async () => {
    const form = await abrirForm()
    const campo = within(form).getByLabelText('Número do objeto')
    expect(campo).toHaveFocus()
    await userEvent.type(campo, 'ca00002{Enter}')
    await screen.findByRole('region', { name: 'CA00002' })
    expect(bandeja().itens).toEqual(['CA00002'])
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Adicionar por número' })).toBeNull())
    await waitFor(() => expect(screen.getByRole('status', { name: 'Mensagem de Comparar' })).toHaveTextContent('CA00002 entrou na comparação.'))
  })

  it('o número de um objeto SKC entra pelo id dele', async () => {
    const id = await objetoSkc({ titulo: 'Pelo número' })
    const numero = numeracaoDe(estadoAtual()).porId.get(id)!.numero!
    const form = await abrirForm()
    await userEvent.type(within(form).getByLabelText('Número do objeto'), `${numero}{Enter}`)
    await waitFor(() => expect(bandeja().itens).toEqual([id]))
  })

  it('texto que não é número e número que não existe dão o erro em linha, sem gravar', async () => {
    const form = await abrirForm()
    const campo = within(form).getByLabelText('Número do objeto')
    await userEvent.type(campo, 'abc{Enter}')
    expect(await within(form).findByRole('alert')).toHaveTextContent('Escreva o número do objeto (ex.: CA00023).')
    await userEvent.clear(campo)
    await userEvent.type(campo, 'CA09999{Enter}')
    expect(await within(form).findByRole('alert')).toHaveTextContent('Não achei o objeto CA09999.')
    expect(bandeja().todos).toEqual([])
    expect(campo).toHaveFocus()
  })

  it('o mesmo objeto de novo: "já está", nada a gravar; Esc fecha o campo e o foco volta ao "+"', async () => {
    await acrescentarVariasABandeja(['CA00001'])
    const form = await abrirForm()
    await userEvent.type(within(form).getByLabelText('Número do objeto'), 'CA00001{Enter}')
    await waitFor(() => expect(screen.getByRole('status', { name: 'Mensagem de Comparar' })).toHaveTextContent('CA00001 já está na comparação.'))
    expect(bandeja().itens).toEqual(['CA00001'])
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Adicionar por número' })).toBeNull())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adicionar objeto à comparação' })).toHaveFocus())
  })

  it('com 4 na bandeja diz que está cheia e não grava', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002', 'CA00003', 'CA00004'])
    const form = await abrirForm()
    await userEvent.type(within(form).getByLabelText('Número do objeto'), 'BA00001{Enter}')
    await waitFor(() => expect(screen.getByRole('status', { name: 'Mensagem de Comparar' })).toHaveTextContent('A comparação já tem 4 objetos. Tire um para pôr outro.'))
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002', 'CA00003', 'CA00004'])
  })
})

describe('no celular: um objeto por vez', () => {
  beforeEach(() => instalarMatchMedia(375))

  function medir(faixa: HTMLElement, largura = 300) {
    Object.defineProperty(faixa, 'clientWidth', { configurable: true, value: largura })
    const rolar = vi.fn()
    faixa.scrollTo = rolar as never
    return rolar
  }

  it('mostra a posição ("1 de 3"), os botões andam (e dão a volta) e a faixa rola até o objeto', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002', 'CA00003'])
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00003' })
    const rolar = medir(screen.getByTestId('comparar-colunas'))
    const nav = screen.getByRole('navigation', { name: 'Posição na comparação' })
    expect(within(nav).getByRole('status')).toHaveTextContent('1 de 3')
    await userEvent.click(within(nav).getByRole('button', { name: 'Objeto seguinte' }))
    expect(within(nav).getByRole('status')).toHaveTextContent('2 de 3')
    expect(rolar).toHaveBeenLastCalledWith(expect.objectContaining({ left: 300 }))
    await userEvent.click(within(nav).getByRole('button', { name: 'Objeto seguinte' }))
    expect(within(nav).getByRole('status')).toHaveTextContent('3 de 3')
    await userEvent.click(within(nav).getByRole('button', { name: 'Objeto seguinte' }))
    expect(within(nav).getByRole('status')).toHaveTextContent('1 de 3')
    await userEvent.click(within(nav).getByRole('button', { name: 'Objeto anterior' }))
    expect(within(nav).getByRole('status')).toHaveTextContent('3 de 3')
    expect(rolar).toHaveBeenLastCalledWith(expect.objectContaining({ left: 600 }))
  })

  it('deslizar (a faixa rola) atualiza a posição', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002', 'CA00003'])
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00003' })
    const faixa = screen.getByTestId('comparar-colunas')
    medir(faixa)
    faixa.scrollLeft = 600
    fireEvent.scroll(faixa)
    expect(within(screen.getByRole('navigation', { name: 'Posição na comparação' })).getByRole('status')).toHaveTextContent('3 de 3')
    faixa.scrollLeft = 310
    fireEvent.scroll(faixa)
    expect(within(screen.getByRole('navigation', { name: 'Posição na comparação' })).getByRole('status')).toHaveTextContent('2 de 3')
  })

  it('← e → andam entre os objetos: cada tecla é apertada uma vez só, depois da tela pronta', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002'])
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00002' })
    medir(screen.getByTestId('comparar-colunas'))
    const pos = () => within(screen.getByRole('navigation', { name: 'Posição na comparação' })).getByRole('status')
    expect(pos()).toHaveTextContent('1 de 2')
    await apertarQuandoPronto('ArrowRight', 'comparar')
    await waitFor(() => expect(pos()).toHaveTextContent('2 de 2'))
    await apertarQuandoPronto('ArrowLeft', 'comparar')
    await waitFor(() => expect(pos()).toHaveTextContent('1 de 2'))
  })

  it('com um objeto só não há posição nem botões de andar', async () => {
    await acrescentarVariasABandeja(['CA00001'])
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00001' })
    expect(screen.queryByRole('navigation', { name: 'Posição na comparação' })).toBeNull()
  })

  it('tirar o último da fila volta a posição para dentro da lista', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002'])
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00002' })
    medir(screen.getByTestId('comparar-colunas'))
    await userEvent.click(screen.getByRole('button', { name: 'Objeto seguinte' }))
    await userEvent.click(within(coluna('CA00002')).getByRole('button', { name: 'Tirar da comparação: CA00002' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'CA00002' })).toBeNull())
    expect(screen.queryByRole('navigation', { name: 'Posição na comparação' })).toBeNull()
  })
})

describe('teclado', () => {
  it('no computador ← e → não fazem nada (todas as colunas estão à vista); a mesma tecla age no celular, no mesmo teste', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002'])
    // primeiro a prova de que a tecla funciona: no celular ela anda
    instalarMatchMedia(375)
    const celular = abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00002' })
    const pos = () => within(screen.getByRole('navigation', { name: 'Posição na comparação' })).getByRole('status')
    expect(await apertarQuandoPronto('ArrowRight', 'comparar')).toBe(false) // alguém tomou a tecla
    await waitFor(() => expect(pos()).toHaveTextContent('2 de 2'))
    celular.unmount()
    // agora o computador: a mesma tecla fica livre
    instalarMatchMedia(1280)
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00002' })
    expect(screen.queryByRole('navigation', { name: 'Posição na comparação' })).toBeNull()
    expect(await apertarQuandoPronto('ArrowRight', 'comparar')).toBe(true) // ninguém tomou a tecla
    expect(await apertarQuandoPronto('ArrowLeft', 'comparar')).toBe(true)
  })

  it('Esc fecha a comparação e volta à tela de antes (uma tecla só, depois da tela pronta)', async () => {
    await acrescentarVariasABandeja(['CA00001'])
    abrir(['/item/CA00001', '/comparar'])
    await pronto()
    await screen.findByRole('region', { name: 'CA00001' })
    await apertarQuandoPronto('Escape', 'global')
    await waitFor(() => expect(local()).toBe('/item/CA00001'))
  })

  it('"Fechar a comparação" volta também; sem tela de antes, vai ao Início', async () => {
    abrir(['/comparar'])
    await pronto()
    await userEvent.click(screen.getByRole('button', { name: 'Fechar a comparação' }))
    expect(local()).toBe('/')
  })
})

describe('a mensagem de Comparar todos (decisão 44)', () => {
  const estado = (r: Awaited<ReturnType<typeof substituirBandeja>>) => ({
    aviso: '2 objetos de TESTE I: 1–2 entraram na comparação, no lugar de 3 objetos que estavam.',
    desfazer: { previa: r.previa, entraram: r.entraram, hlc: r.hlc },
  })

  it('chega pelo estado do roteador e aparece, dizendo o que ficou de fora', async () => {
    await acrescentarVariasABandeja(['CA00001'])
    abrir([{ pathname: '/comparar', state: { aviso: '4 objetos de TESTE I: 1–6 entraram na comparação. 2 objetos ficaram de fora (a comparação leva até 4): CA00005, CA00006.' } }])
    await pronto()
    expect(screen.getByRole('status', { name: 'Mensagem de Comparar' })).toHaveTextContent('2 objetos ficaram de fora (a comparação leva até 4): CA00005, CA00006.')
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
  })

  it('«Desfazer» devolve exatamente a bandeja de antes (mesmos objetos, mesma ordem), num só evento', async () => {
    await acrescentarVariasABandeja(['CA00003', 'CA00001', 'CA00004'])
    const antes = bandeja().todos
    const r = await substituirBandeja(['CA00002', 'BA00001'])
    abrir([{ pathname: '/comparar', state: estado(r) }])
    await pronto()
    await screen.findByRole('region', { name: 'BA00001' })
    expect(bandeja().itens).toEqual(['CA00002', 'BA00001'])
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(bandeja().todos).toEqual(antes))
    await screen.findByRole('region', { name: 'CA00004' })
    expect(screen.getAllByRole('region', { name: /^CA0000\d$/ }).map((c) => c.getAttribute('aria-label'))).toEqual(['CA00003', 'CA00001', 'CA00004'])
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
  })

  it('o Desfazer continua valendo depois de recarregar a página (o estado do histórico fica, a tela monta de novo)', async () => {
    await acrescentarVariasABandeja(['CA00003', 'CA00001'])
    const antes = bandeja().todos
    const r = await substituirBandeja(['CA00002', 'CA00004', 'BA00001'])
    const estadoDoHistorico = JSON.parse(JSON.stringify({ pathname: '/comparar', state: estado(r) })) // o que o navegador guarda e devolve
    const primeira = abrir([estadoDoHistorico])
    await pronto()
    primeira.unmount() // recarregar: tudo da tela some
    abrir([estadoDoHistorico])
    await pronto()
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(bandeja().todos).toEqual(antes))
  })

  it('depois de usado, o Desfazer sai do estado do histórico (recarregar não o oferece de novo)', async () => {
    const r = await substituirBandeja(['CA00002'])
    abrir([{ pathname: '/comparar', state: estado(r) }])
    await pronto()
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull())
    await waitFor(() => expect(screen.getByTestId('local').dataset.state).toBe('null'))
  })

  it('um estado malformado no histórico não derruba a tela nem oferece Desfazer', async () => {
    abrir([{ pathname: '/comparar', state: { aviso: 'x', desfazer: { previa: 'não é lista', entraram: 3 } } }])
    await pronto()
    expect(screen.getByRole('status', { name: 'Mensagem de Comparar' })).toHaveTextContent('x')
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
  })
})

describe('o Desfazer de «Comparar todos» só vale enquanto a bandeja é a que a troca produziu (N1)', () => {
  const estado = (r: Awaited<ReturnType<typeof substituirBandeja>>, aviso = 'Entraram.') => ({ aviso, desfazer: { previa: r.previa, entraram: r.entraram, hlc: r.hlc } })
  const desfazerNaTela = () => screen.queryByRole('button', { name: 'Desfazer' })
  const estadoDoHistorico = () => JSON.parse(screen.getByTestId('local').dataset.state!) as { aviso?: string; desfazer?: unknown } | null

  it('(a) trocar e desfazer devolve a bandeja de antes exatamente, com os que não couberam', async () => {
    // 4 na bandeja + 1 que não coube (dois aparelhos que acrescentaram sem se ver)
    await registrar('comparar', REG_DA_BANDEJA, estadoAtual().registro('comparar', REG_DA_BANDEJA) ? 'alterar' : 'criar', Object.fromEntries(['CA00003', 'CA00001', 'CA00004', 'BA00002', 'CA00002'].flatMap((r, i) => [[`m:${r}`, true], [`i:${r}`, 1024 * (i + 1)]])))
    const antes = bandeja()
    expect(antes.excedentes).toHaveLength(1)
    const r = await substituirBandeja(['BA00001'])
    abrir([{ pathname: '/comparar', state: estado(r) }])
    await pronto()
    await screen.findByRole('region', { name: 'BA00001' })
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(bandeja().todos).toEqual(antes.todos))
    expect(bandeja().itens).toEqual(antes.itens)
    expect(bandeja().excedentes).toEqual(antes.excedentes)
  })

  it('(b) trocar e depois acrescentar um objeto: o Desfazer deixa de ser oferecido e sai do histórico', async () => {
    await acrescentarVariasABandeja(['CA00003', 'CA00004'])
    const r = await substituirBandeja(['CA00001', 'CA00002'])
    abrir([{ pathname: '/comparar', state: estado(r) }])
    await pronto()
    expect(await screen.findByRole('button', { name: 'Desfazer' })).toBeInTheDocument() // o caso positivo, antes
    // um acréscimo vindo de fora da tela (o botão «Comparar» do Item, outra aba): a tela não o anuncia
    await act(() => acrescentarABandeja('CA00003'))
    await screen.findByRole('region', { name: 'CA00003' })
    await waitFor(() => expect(desfazerNaTela()).toBeNull())
    expect(screen.getByRole('status', { name: 'Mensagem de Comparar' })).not.toHaveTextContent('Desfazer')
    await waitFor(() => expect(estadoDoHistorico()?.desfazer).toBeUndefined())
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002', 'CA00003'])
  })

  it('(c) trocar, trocar de novo e voltar no histórico: o Desfazer antigo não volta e nada é tirado', async () => {
    await acrescentarVariasABandeja(['CA00003', 'CA00001', 'CA00004'])
    const r1 = await substituirBandeja(['CA00002', 'BA00001'])
    const e1 = { pathname: '/comparar', state: JSON.parse(JSON.stringify(estado(r1, 'Primeira troca.'))) as unknown }
    const r2 = await substituirBandeja(['BA00001', 'BA00002'])
    const e3 = { pathname: '/comparar', state: estado(r2, 'Segunda troca.') }
    // [primeira troca] → [outra tela] → [segunda troca]: a tela da segunda troca está aberta
    abrir([{ pathname: '/comparar', state: e1.state }, '/item/CA00001', e3])
    await pronto()
    await screen.findByRole('region', { name: 'BA00002' })
    expect(await screen.findByRole('button', { name: 'Desfazer' })).toBeInTheDocument() // prova de que, aqui, ele é oferecido
    const antes = bandeja().todos
    await userEvent.click(screen.getByRole('button', { name: 'Voltar no histórico (teste)' }))
    await waitFor(() => expect(local()).toBe('/item/CA00001'))
    await userEvent.click(screen.getByRole('button', { name: 'Voltar no histórico (teste)' }))
    await waitFor(() => expect(local()).toBe('/comparar'))
    await screen.findByRole('region', { name: 'BA00002' })
    expect(screen.getByRole('status', { name: 'Mensagem de Comparar' })).toHaveTextContent('Primeira troca.')
    await waitFor(() => expect(estadoDoHistorico()?.desfazer).toBeUndefined())
    expect(desfazerNaTela()).toBeNull()
    expect(bandeja().todos).toEqual(antes) // nada foi tirado nem devolvido
    expect(bandeja().itens).toEqual(['BA00001', 'BA00002'])
  })

  it('(d) uma sincronização de outro aparelho muda a bandeja com a tela aberta: o Desfazer some', async () => {
    const r = await substituirBandeja(['CA00001', 'CA00002'])
    abrir([{ pathname: '/comparar', state: estado(r) }])
    await pronto()
    expect(await screen.findByRole('button', { name: 'Desfazer' })).toBeInTheDocument()
    // o outro aparelho acrescenta CA00003 (evento com relógio mais novo, como chegaria pela sincronização)
    await act(() =>
      receberEventos([
        ev({ ap: B, seq: 1, ms: Date.now() + 60_000, tipo: 'comparar', reg: 'bandeja', op: 'alterar', campos: { [campoDaPresenca('CA00003')]: true, [campoDaOrdem('CA00003')]: 99_000 } }),
      ]),
    )
    await screen.findByRole('region', { name: 'CA00003' })
    await waitFor(() => expect(desfazerNaTela()).toBeNull())
    await waitFor(() => expect(estadoDoHistorico()?.desfazer).toBeUndefined())
    expect(bandeja().itens).toContain('CA00003')
  })

  it('(d2) esvaziar depois da troca esconde o Desfazer da troca (o de «Esvaziar» é outro e vale)', async () => {
    const r = await substituirBandeja(['CA00001', 'CA00002'])
    abrir([{ pathname: '/comparar', state: estado(r) }])
    await pronto()
    await screen.findByRole('button', { name: 'Desfazer' })
    await userEvent.click(screen.getByRole('button', { name: 'Esvaziar a comparação' }))
    await waitFor(() => expect(bandeja().todos).toEqual([]))
    // a mensagem agora é a do Esvaziar, com o Desfazer dele
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(bandeja().itens).toEqual(['CA00001', 'CA00002']))
  })

  it('na hora do clique a bandeja é conferida de novo: se o Desfazer recusa (a bandeja mudou entre o render e o toque), nada é tirado e a tela diz', async () => {
    const r = await substituirBandeja(['CA00001', 'CA00002'])
    abrir([{ pathname: '/comparar', state: estado(r) }])
    await pronto()
    const botao = await screen.findByRole('button', { name: 'Desfazer' })
    // A conferência de verdade (a bandeja de agora contra o que a troca produziu) é testada em operacoes.test.ts; aqui, o que a TELA faz
    // quando ela recusa: o clique é real e a recusa vem do espião, sem ler os detalhes internos do React.
    const desfazer = vi.spyOn(operacoesModulo, 'desfazerSubstituicao').mockResolvedValueOnce(false)
    const antes = [...bandeja().itens]
    await userEvent.click(botao)
    await waitFor(() => expect(screen.getByRole('status', { name: 'Mensagem de Comparar' })).toHaveTextContent('A bandeja mudou; não dá mais para desfazer.'))
    expect(desfazer).toHaveBeenCalledTimes(1)
    expect(desfazer).toHaveBeenCalledWith(r.previa, r.entraram, r.hlc)
    desfazer.mockRestore()
    expect([...bandeja().itens]).toEqual(antes) // nada foi tirado
    expect(desfazerNaTela()).toBeNull()
  })

  it('T17-C-1 (P1): a bandeja volta ao mesmo conteúdo por outro caminho (pôs e tirou de uma vez): o Desfazer da troca não volta a ser oferecido', async () => {
    const r = await substituirBandeja(['CA00001', 'CA00002'])
    abrir([{ pathname: '/comparar', state: estado(r) }])
    await pronto()
    expect(await screen.findByRole('button', { name: 'Desfazer' })).toBeInTheDocument() // o caso positivo, antes
    // duas gravações, uma depois da outra: a tela pode ver a bandeja do meio (com CA00003), e aí já a regra do conteúdo tira
    // a oferta. Este caso guarda o resultado, mas não distingue a correção; quem a distingue é o teste seguinte (uma escrita só).
    await act(async () => {
      await acrescentarABandeja('CA00003')
      await tirarDaBandeja('CA00003')
    })
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002'])
    await waitFor(() => expect(desfazerNaTela()).toBeNull())
    await waitFor(() => expect(estadoDoHistorico()?.desfazer).toBeUndefined())
  })

  it('T17-C-1 (P1, uma escrita só): regravar a mesma ordem deixa a bandeja igual, mas o último evento já não é o da troca: o Desfazer some', async () => {
    const r = await substituirBandeja(['CA00001', 'CA00002'])
    abrir([{ pathname: '/comparar', state: estado(r) }])
    await pronto()
    expect(await screen.findByRole('button', { name: 'Desfazer' })).toBeInTheDocument() // o caso positivo, antes
    // Uma só escrita (outro aparelho regrava a posição de CA00001 com o mesmo valor): a tela nunca vê outro conteúdo.
    const reg = estadoAtual().registro('comparar', 'bandeja')!
    const campo = campoDaOrdem('CA00001')
    await act(() => registrar('comparar', 'bandeja', 'alterar', { [campo]: reg.campos[campo] as number }))
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002'])
    expect(estadoAtual().registro('comparar', 'bandeja')!.alteradoEm).not.toBe(r.hlc)
    await waitFor(() => expect(desfazerNaTela()).toBeNull())
    await waitFor(() => expect(estadoDoHistorico()?.desfazer).toBeUndefined())
  })

  it('T17-C-1 (P5): a bandeja foi esvaziada antes de a tela abrir (outro aparelho): a tela vazia não oferece o Desfazer da troca, que sai do histórico', async () => {
    const r = await substituirBandeja(['CA00001', 'CA00002'])
    await esvaziarBandeja()
    abrir([{ pathname: '/comparar', state: estado(r) }])
    await pronto()
    expect(screen.getByText('Nenhum objeto na comparação.')).toBeInTheDocument()
    expect(desfazerNaTela()).toBeNull()
    await waitFor(() => expect(estadoDoHistorico()?.desfazer).toBeUndefined())
  })

  it('T17-C-1: enquanto o estado do usuário ainda não foi lido (a bandeja parece vazia), a oferta espera; lido, ela vale', async () => {
    const r = await substituirBandeja(['CA00001', 'CA00002'])
    definirSync({ iniciado: false })
    abrir([{ pathname: '/comparar', state: estado(r) }])
    await pronto()
    expect(estadoDoHistorico()?.desfazer).toBeDefined() // ninguém julgou ainda
    definirSync({ iniciado: true })
    expect(await screen.findByRole('button', { name: 'Desfazer' })).toBeInTheDocument() // a bandeja confere: segue valendo
    expect(estadoDoHistorico()?.desfazer).toBeDefined()
  })

  it('T17-C-5: se a gravação do Desfazer falha, a oferta fica com a falha ao lado, e tentar de novo desfaz', async () => {
    const r = await substituirBandeja(['CA00002', 'BA00001'])
    abrir([{ pathname: '/comparar', state: estado(r) }])
    await pronto()
    const falha = vi.spyOn(operacoesModulo, 'desfazerSubstituicao').mockRejectedValueOnce(new Error('disco cheio'))
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    const aviso = screen.getByRole('status', { name: 'Mensagem de Comparar' })
    await waitFor(() => expect(aviso).toHaveTextContent('Não foi possível guardar a mudança; tente de novo.'))
    expect(aviso).toHaveTextContent('Entraram.') // a mensagem de antes continua
    expect(within(aviso).getByRole('button', { name: 'Desfazer' })).toBeInTheDocument() // e a oferta também
    expect(estadoDoHistorico()?.desfazer).toBeDefined()
    falha.mockRestore()
    await userEvent.click(within(aviso).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(bandeja().itens).toEqual([]))
    await waitFor(() => expect(desfazerNaTela()).toBeNull())
  })

  it('T17-C-4: depois do Desfazer da troca o foco vai ao «+» (o botão clicado some; o foco não cai no corpo da página)', async () => {
    const r = await substituirBandeja(['CA00002'])
    abrir([{ pathname: '/comparar', state: estado(r) }])
    await pronto()
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(desfazerNaTela()).toBeNull())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adicionar objeto à comparação' })).toHaveFocus())
  })

  it('T17-C-4: depois do Desfazer de «Tirar» e de «Esvaziar» o foco também vai ao «+»; e se uma sincronização tira a coluna do botão que tem o foco, ele não se perde', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002'])
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00002' })
    await userEvent.click(within(coluna('CA00001')).getByRole('button', { name: 'Tirar da comparação: CA00001' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(desfazerNaTela()).toBeNull())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adicionar objeto à comparação' })).toHaveFocus())
    await userEvent.click(screen.getByRole('button', { name: 'Esvaziar a comparação' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(desfazerNaTela()).toBeNull())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adicionar objeto à comparação' })).toHaveFocus())
    // o botão «Tirar» de CA00002 tem o foco; outro aparelho tira CA00002: a coluna e o botão somem
    within(coluna('CA00002')).getByRole('button', { name: 'Tirar da comparação: CA00002' }).focus()
    await act(() => receberEventos([ev({ ap: B, seq: 2, ms: Date.now() + 60_000, tipo: 'comparar', reg: 'bandeja', op: 'alterar', campos: { [campoDaPresenca('CA00002')]: null } })]))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'CA00002' })).toBeNull())
    await waitFor(() => expect(document.body).not.toHaveFocus())
    expect(document.activeElement?.closest('.comparar')).not.toBeNull()
  })

  it('(e) recarregar com a bandeja intacta continua oferecendo o Desfazer (o estado do histórico fica e a tela confere)', async () => {
    await acrescentarVariasABandeja(['CA00003', 'CA00001'])
    const antes = bandeja().todos
    const r = await substituirBandeja(['CA00002', 'CA00004'])
    const doHistorico = JSON.parse(JSON.stringify({ pathname: '/comparar', state: estado(r) }))
    const primeira = abrir([doHistorico])
    await pronto()
    await screen.findByRole('button', { name: 'Desfazer' })
    primeira.unmount()
    abrir([doHistorico])
    await pronto()
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(bandeja().todos).toEqual(antes))
  })
})

describe('T17-C-9: o pacote troca com a tela aberta', () => {
  it('o objeto do livro é lido de novo do pacote novo (o que estava guardado por número não fica velho)', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002'])
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00002' })
    const leitor = vi.spyOn(consultasModulo, 'item')
    await act(async () => void (await reabrirBanco())) // a sincronização trouxe um pacote novo
    await waitFor(() => expect(leitor.mock.calls.map((c) => c[0]).sort()).toEqual(['CA00001', 'CA00002']))
    await pronto()
    expect(screen.getByRole('region', { name: 'CA00001' })).toBeInTheDocument()
    leitor.mockRestore()
  })
})

describe('«só as diferenças» com menos de 2 objetos (N2)', () => {
  it('com ?dif=1 e um objeto só, a ficha continua à vista (a opção é ignorada) e a tela não fica sem linhas', async () => {
    await acrescentarVariasABandeja(['CA00001'])
    abrir(['/comparar?dif=1'])
    await pronto()
    const um = await screen.findByRole('region', { name: 'CA00001' })
    expect(um.querySelectorAll('.comparar-celula').length).toBeGreaterThan(0)
    expect(screen.queryByText('Nenhuma diferença nos dados mostrados.')).toBeNull()
  })

  it('ligar «só as diferenças» com 2 e tirar um: as linhas voltam; ao acrescentar de novo, a opção ainda está ligada', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002'])
    abrir()
    await pronto()
    await screen.findByRole('region', { name: 'CA00002' })
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar só as diferenças' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mostrar só as diferenças' })).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(within(coluna('CA00002')).getByRole('button', { name: 'Tirar da comparação: CA00002' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'CA00002' })).toBeNull())
    expect(screen.queryByText('Nenhuma diferença nos dados mostrados.')).toBeNull()
    expect(coluna('CA00001').querySelectorAll('.comparar-celula').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await screen.findByRole('region', { name: 'CA00002' })
    expect(screen.getByRole('button', { name: 'Mostrar só as diferenças' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('o ajuste fino da revisão 1', () => {
  it('m7: a região viva existe desde o começo, vazia, e a mensagem escrita nela é anunciada', async () => {
    abrir()
    await pronto()
    const regiao = screen.getByRole('status', { name: 'Mensagem de Comparar' })
    expect(regiao).not.toHaveAttribute('hidden')
    expect(regiao).toBeEmptyDOMElement()
    const form = await (async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Adicionar objeto à comparação' }))
      return screen.getByRole('form', { name: 'Adicionar por número' })
    })()
    await userEvent.type(within(form).getByLabelText('Número do objeto'), 'CA00001{Enter}')
    await waitFor(() => expect(screen.getByRole('status', { name: 'Mensagem de Comparar' })).toHaveTextContent('CA00001 entrou na comparação.'))
    expect(screen.getByRole('status', { name: 'Mensagem de Comparar' })).toBe(regiao) // o mesmo elemento: o texto chegou nele
  })

  it('m7: o nome acessível de «Tirar» contém o texto visível (rótulo no nome) e há um só nome para a lista que não coube', async () => {
    await acrescentarVariasABandeja(['CA00001'])
    abrir()
    await pronto()
    const botao = await screen.findByRole('button', { name: 'Tirar da comparação: CA00001' })
    expect(botao).toHaveTextContent('Tirar da comparação')
    expect(document.body.textContent).not.toMatch(/lista de espera/)
    expect(document.querySelector('[aria-label*="lista de espera"]')).toBeNull()
  })

  it('m2: o «+» com o número provisório que um objeto SKC perdeu leva ao objeto, como o Item', async () => {
    const id = await objetoSkc({ pedido: 'CA00005', titulo: 'Perdeu o número' })
    await act(() => unirConfirmadosGuardados({ [id]: 'CA00007' }))
    abrir()
    await pronto()
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar objeto à comparação' }))
    await userEvent.type(within(screen.getByRole('form', { name: 'Adicionar por número' })).getByLabelText('Número do objeto'), 'CA00005{Enter}')
    await waitFor(() => expect(bandeja().itens).toEqual([id]))
  })

  it('m4: tirar, desfazer ou acrescentar não faz as outras colunas voltarem a «Carregando…» nem remontar a imagem', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002', 'CA00003'])
    abrir()
    await pronto()
    await waitFor(() => expect(within(coluna('CA00001')).getByRole('img', { name: /Imagem 1 de CA00001/ })).toBeInTheDocument())
    const img = within(coluna('CA00001')).getByRole('img', { name: /Imagem 1 de CA00001/ })
    const ocupadas: string[] = []
    const observador = new MutationObserver(() => {
      if (document.body.textContent?.includes('Carregando…')) ocupadas.push('carregando')
      if (document.querySelector('.comparar-corpo[aria-busy="true"]')) ocupadas.push('busy')
    })
    observador.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
    await userEvent.click(within(coluna('CA00002')).getByRole('button', { name: 'Tirar da comparação: CA00002' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'CA00002' })).toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await screen.findByRole('region', { name: 'CA00002' })
    // o sinal positivo de que a tela assentou: CA00002 voltou com a ficha e a imagem, e nada está ocupado
    await waitFor(() => expect(within(coluna('CA00002')).getByRole('img', { name: /Imagem 1 de CA00002/ })).toBeInTheDocument())
    await waitFor(() => expect(document.querySelector('.comparar-corpo[aria-busy="true"]')).toBeNull())
    observador.disconnect()
    expect(ocupadas).toEqual([])
    expect(within(coluna('CA00001')).getByRole('img', { name: /Imagem 1 de CA00001/ })).toBe(img)
  })

  it('m4: acrescentar um número novo só põe «Carregando…» na coluna nova; as outras ficam como estão', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002'])
    abrir()
    await pronto()
    await waitFor(() => expect(within(coluna('CA00001')).getByRole('img', { name: /Imagem 1 de CA00001/ })).toBeInTheDocument())
    await waitFor(() => expect(within(coluna('CA00002')).getByRole('img', { name: /Imagem 1 de CA00002/ })).toBeInTheDocument())
    const img1 = within(coluna('CA00001')).getByRole('img', { name: /Imagem 1 de CA00001/ })
    const img2 = within(coluna('CA00002')).getByRole('img', { name: /Imagem 1 de CA00002/ })
    const carregandoNasAntigas: string[] = []
    const observador = new MutationObserver(() => {
      for (const ref of ['CA00001', 'CA00002']) {
        const c = document.querySelector(`[role="region"][aria-label="${ref}"]`)
        if (c?.textContent?.includes('Carregando…')) carregandoNasAntigas.push(ref)
      }
    })
    observador.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar objeto à comparação' }))
    await userEvent.type(within(screen.getByRole('form', { name: 'Adicionar por número' })).getByLabelText('Número do objeto'), 'CA00003{Enter}')
    await screen.findByRole('region', { name: 'CA00003' })
    await waitFor(() => expect(within(coluna('CA00003')).getByRole('img', { name: /Imagem 1 de CA00003/ })).toBeInTheDocument())
    await waitFor(() => expect(document.querySelector('.comparar-corpo[aria-busy="true"]')).toBeNull())
    observador.disconnect()
    expect(carregandoNasAntigas).toEqual([])
    expect(within(coluna('CA00001')).getByRole('img', { name: /Imagem 1 de CA00001/ })).toBe(img1)
    expect(within(coluna('CA00002')).getByRole('img', { name: /Imagem 1 de CA00002/ })).toBe(img2)
  })

  it('m6: a posição no celular e «só as diferenças» ficam no endereço, e quem abre assim já os encontra', async () => {
    instalarMatchMedia(375)
    await acrescentarVariasABandeja(['CA00001', 'CA00002', 'CA00003'])
    abrir(['/comparar?pos=3&dif=1'])
    await pronto()
    await screen.findByRole('region', { name: 'CA00003' })
    expect(within(screen.getByRole('navigation', { name: 'Posição na comparação' })).getByRole('status')).toHaveTextContent('3 de 3')
    expect(screen.getByRole('button', { name: 'Mostrar só as diferenças' })).toHaveAttribute('aria-pressed', 'true')
    expect(local()).toBe('/comparar?pos=3&dif=1')
    await userEvent.click(screen.getByRole('button', { name: 'Objeto seguinte' }))
    await waitFor(() => expect(local()).toBe('/comparar?dif=1'))
    await userEvent.click(screen.getByRole('button', { name: 'Objeto seguinte' }))
    await waitFor(() => expect(local()).toBe('/comparar?dif=1&pos=2'))
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar só as diferenças' }))
    await waitFor(() => expect(local()).toBe('/comparar?pos=2'))
  })

  it('17c-fix1 (gate D-11): se o roteador entrega um endereço sem o «pos» depois de a tela pedir o dela, a tela o põe de volta', async () => {
    // No celular, o «Objeto seguinte» rola a faixa com suavidade: a rolagem passa pela coluna de antes e volta, a tela pede
    // «?pos=2», depois sem «pos», depois «?pos=2» de novo, e o roteador pode entregar esses endereços atrasados. Se o último a
    // chegar é o sem «pos», o endereço fica errado com a tela em «2 de 3». Aqui, o mesmo efeito, de forma determinada.
    instalarMatchMedia(375)
    await acrescentarVariasABandeja(['CA00001', 'CA00002', 'CA00003'])
    abrir(['/comparar'])
    await pronto()
    await screen.findByRole('region', { name: 'CA00003' })
    await userEvent.click(screen.getByRole('button', { name: 'Objeto seguinte' }))
    await waitFor(() => expect(local()).toBe('/comparar?pos=2'))
    await userEvent.click(screen.getByRole('button', { name: 'Endereço sem a posição (teste)' }))
    await waitFor(() => expect(local()).toBe('/comparar?pos=2'))
    expect(within(screen.getByRole('navigation', { name: 'Posição na comparação' })).getByRole('status')).toHaveTextContent('2 de 3')
  })

  it('m6: a posição não se perde enquanto a bandeja ainda está chegando', async () => {
    instalarMatchMedia(375)
    abrir(['/comparar?pos=2'])
    await pronto()
    expect(local()).toBe('/comparar?pos=2')
  })

  it('m6: «Ampliar a imagem» na comparação não anuncia o atalho Z (que ali não faz nada), leva ao visualizador e, na volta, devolve o foco ao botão DA coluna e mantém a posição', async () => {
    instalarMatchMedia(375)
    await acrescentarVariasABandeja(['CA00001', 'CA00002', 'CA00003'])
    abrir(['/comparar'])
    await pronto()
    await screen.findByRole('region', { name: 'CA00003' })
    await userEvent.click(screen.getByRole('button', { name: 'Objeto seguinte' }))
    await waitFor(() => expect(local()).toBe('/comparar?pos=2'))
    const botao = await within(coluna('CA00002')).findByRole('link', { name: 'Ampliar a imagem' })
    expect(botao).not.toHaveAttribute('aria-keyshortcuts')
    expect(botao.getAttribute('data-tip')).toBe('Ampliar a imagem')
    await userEvent.click(botao)
    await waitFor(() => expect(local()).toMatch(/^\/imagem\//))
    await userEvent.click(await screen.findByRole('button', { name: 'Fechar o visualizador' }))
    await waitFor(() => expect(local()).toBe('/comparar?pos=2'))
    await screen.findByRole('region', { name: 'CA00002' })
    await waitFor(() => expect(within(coluna('CA00002')).getByRole('link', { name: 'Ampliar a imagem' })).toHaveFocus())
    expect(within(screen.getByRole('navigation', { name: 'Posição na comparação' })).getByRole('status')).toHaveTextContent('2 de 3')
  })
})
