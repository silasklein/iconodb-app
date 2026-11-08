/**
 * Tarefa 13: «Outras grafias» na página do sítio, agrupadas por tradição (telas aprovadas §4): na ordem da lista das
 * tradições, depois «sem tradição» (as dos livros sem tradição) e, por último, «sem origem» (as suas sem tradição).
 */
import { render, screen, within } from '@testing-library/react'
import { fundir } from '../usuario/fusao'
import { GrafiasAgrupadas, gruposDasGrafias, nomeImpressoNasGrafias, textoDosLivros } from './Grafias'
import { grafiasDoSitio, PACOTE_VAZIO, resolverSitios, type GrafiaVista } from './resolucao'

const v = (texto: string, grupo: GrafiaVista['grupo'], mais: Partial<GrafiaVista> = {}): GrafiaVista => ({
  texto,
  tradicao: grupo === 'sem-tradicao' || grupo === 'sem-origem' ? null : grupo,
  livros: [],
  doUsuario: grupo !== 'sem-tradicao',
  grupo,
  ...mais,
})

const vistas: GrafiaVista[] = [
  v('Tell Exemplo', 'sem-origem'),
  v('Tall Teste', 'sem-tradicao', { livros: [{ sigla: 'TESTE', pagina: '40' }] }),
  v('Testheim', 'alema', { livros: [{ sigla: 'TESTE II', pagina: null }] }),
  v('Tel Test', 'hebraica-moderna'),
  v('Tall et-Test', 'arabe', { doUsuario: false, livros: [{ sigla: 'TESTE', pagina: '12' }] }),
  v('Tel Exemplo', 'sem-origem'),
  v('Tal Arabe', 'arabe'),
]

describe('gruposDasGrafias', () => {
  it('na ordem da lista das tradições, depois «sem tradição» e, por último, «sem origem»; dentro do grupo, a ordem de chegada', () => {
    expect(gruposDasGrafias(vistas).map((g) => [g.rotulo, g.grafias.map((x) => x.texto)])).toEqual([
      ['árabe', ['Tall et-Test', 'Tal Arabe']],
      ['hebraica moderna', ['Tel Test']],
      ['alemã', ['Testheim']],
      ['sem tradição', ['Tall Teste']],
      ['sem origem', ['Tell Exemplo', 'Tel Exemplo']],
    ])
  })

  it('cada tradição tem o rótulo em minúsculas', () => {
    const todas = (['arabe', 'hebraica-moderna', 'biblica', 'grega-latina', 'alema', 'inglesa', 'francesa', 'portuguesa', 'outra'] as const).map((t) => v(t, t))
    expect(gruposDasGrafias(todas).map((g) => g.rotulo)).toEqual(['árabe', 'hebraica moderna', 'bíblica', 'grega/latina', 'alemã', 'inglesa', 'francesa', 'portuguesa', 'outra'])
  })
})

describe('textoDosLivros', () => {
  it('a sigla e a página; sem página, só a sigla; vários livros separados por «;»', () => {
    expect(textoDosLivros([{ sigla: 'TESTE', pagina: '12' }])).toBe('TESTE, p. 12')
    expect(textoDosLivros([{ sigla: 'TESTE II', pagina: null }])).toBe('TESTE II')
    expect(textoDosLivros([{ sigla: 'TESTE', pagina: '12' }, { sigla: 'TESTE II', pagina: '4' }])).toBe('TESTE, p. 12; TESTE II, p. 4')
  })
})

describe('GrafiasAgrupadas', () => {
  it('cada grupo com o rótulo; a do livro com a sigla e a página; as suas com «SKC» e o livro que você deu', () => {
    render(<GrafiasAgrupadas grafias={vistas} />)
    const grupos = screen.getAllByRole('group')
    expect(grupos.map((g) => g.getAttribute('aria-label'))).toEqual(['árabe', 'hebraica moderna', 'alemã', 'sem tradição', 'sem origem'])
    const arabe = within(grupos[0]!).getAllByRole('listitem')
    expect(arabe[0]).toHaveTextContent(/^Tall et-TestTESTE, p\. 12$/)
    expect(within(arabe[0]!).queryByText('SKC')).toBeNull()
    expect(within(grupos[2]!).getByRole('listitem')).toHaveTextContent(/^TestheimSKCTESTE II$/)
    expect(within(within(grupos[2]!).getByRole('listitem')).getByText('SKC')).toHaveClass('marca-skc')
    expect(within(grupos[3]!).getByRole('listitem')).toHaveTextContent(/^Tall TesteTESTE, p\. 40$/)
    expect(within(grupos[4]!).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Tell ExemploSKC', 'Tel ExemploSKC'])
  })
})

describe('nomeImpressoNasGrafias: o «como impresso: …» sob o nome sai só se o impresso está entre as grafias mostradas', () => {
  const linha = (texto: string) => ({ sitio: 'TESTE-1', texto, tradicao: null, sigla: 'TESTE', pagina: '3', origem: 'livro' as const })
  const pacote = (texto: string) => ({ ...PACOTE_VAZIO, sitios: new Set(['TESTE-1']), grafias: [linha(texto)] })
  const vistas = (nome: string, impresso: string) => grafiasDoSitio(resolverSitios(fundir([]), pacote(impresso)), 'TESTE-1', pacote(impresso), () => nome)

  it('pacote 8 com o nome corrigido: o impresso aparece como grafia do livro, com a página, e o «como impresso» sai', () => {
    expect(nomeImpressoNasGrafias(vistas('Tell Novo', 'Bēt Šeʾān'), 'Bēt Šeʾān')).toBe(true)
  })

  it('o impresso só difere do nome pelos diacríticos: a grafia não é mostrada (é a chave do nome de agora), e o «como impresso» fica', () => {
    expect(vistas('Bet Sean', 'Bēt Šeʾān')).toEqual([])
    expect(nomeImpressoNasGrafias(vistas('Bet Sean', 'Bēt Šeʾān'), 'Bēt Šeʾān')).toBe(false)
  })

  it('pacote 5–7 (sem grafias dos livros) ou uma grafia sua com a mesma chave: fica', () => {
    expect(nomeImpressoNasGrafias([], 'Bēt Šeʾān')).toBe(false)
    expect(nomeImpressoNasGrafias([v('Bēt Šeʾān', 'sem-origem')], 'Bēt Šeʾān')).toBe(false)
  })
})
