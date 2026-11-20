/**
 * Tarefa 4 do plano «O IPIAO lido no formato do §»: os links de uma linha da leitura (os números do catálogo e as figuras
 * citadas). Frases inventadas.
 */
import type { ReferenciaDoParagrafo } from '../banco/tipos'
import { linksDaLinha } from './linksDaLeitura'

const REF = (numero: number, objeto: string, sufixo = '', volume = 'I'): ReferenciaDoParagrafo => ({ itemId: `TESTE-${numero}${sufixo}`, objeto, numero, sufixo, volume })

describe('linksDaLinha', () => {
  it('o número do catálogo citado, numa remissão, vai ao objeto; o que não é citado fica texto', () => {
    const texto = 'Figuras de prova em pingentes (1–3); vgl. 5 und 7a.'
    const links = linksDaLinha(texto, [], [REF(1, 'CA00001'), REF(3, 'CA00003'), REF(7, 'CA00007', 'a')], 'TESTE', 'I')
    expect(links.map((l) => [texto.slice(l.inicio, l.fim), l.destino, l.rotulo])).toEqual([
      ['1', '/item/CA00001', 'Abrir CA00001, TESTE I: 1'],
      ['3', '/item/CA00003', 'Abrir CA00003, TESTE I: 3'],
      ['7a', '/item/CA00007', 'Abrir CA00007, TESTE I: 7a'],
    ])
  })

  it('o número fora de remissão («a 3. fase») e o que está num termo não viram link', () => {
    const texto = 'Na 3 fase de teste (3. fase) o leão 3 aparece.'
    expect(linksDaLinha(texto, [], [REF(3, 'CA00003')], 'TESTE', 'I')).toEqual([])
    const termo = 'O selo (3) de teste.'
    // o termo cobre «(3)» em code points
    expect(linksDaLinha(termo, [{ glId: 'GL-1', inicio: 7, fim: 10 }], [REF(3, 'CA00003')], 'TESTE', 'I')).toEqual([])
  })

  it('a referência a uma figura citada («Abb. 2») vai ao objeto dela; sem menções, nada', () => {
    const texto = 'Ein Testsiegel (Abb. 2) und (4).'
    const links = linksDaLinha(texto, [], [REF(2, 'F200002'), REF(4, 'CA00004')], 'TESTE', 'I')
    expect(links.map((l) => [texto.slice(l.inicio, l.fim), l.destino])).toEqual([
      ['Abb. 2', '/item/F200002'],
      ['4', '/item/CA00004'],
    ])
    expect(linksDaLinha(texto, [], [], 'TESTE', 'I')).toEqual([])
  })
  it('fix final (m2): a remissão a um número de outro volume diz o volume dele no nome acessível (a numeração é única na obra)', () => {
    const texto = 'Compare-se o pingente de teste (45) e o selo (3).'
    const links = linksDaLinha(texto, [], [REF(3, 'CA00003'), REF(45, 'CA00045', '', 'II')], 'TESTE', 'I')
    expect(links.map((l) => [texto.slice(l.inicio, l.fim), l.destino, l.rotulo])).toEqual([
      ['45', '/item/CA00045', 'Abrir CA00045, TESTE II: 45'],
      ['3', '/item/CA00003', 'Abrir CA00003, TESTE I: 3'],
    ])
    // sem o volume na referência (o § e os pacotes de antes), o do passo
    const semVolume: ReferenciaDoParagrafo = { itemId: 'TESTE-45', objeto: 'CA00045', numero: 45, sufixo: '' }
    expect(linksDaLinha(texto, [], [semVolume], 'TESTE', 'I').map((l) => l.rotulo)).toEqual(['Abrir CA00045, TESTE I: 45'])
  })
})
