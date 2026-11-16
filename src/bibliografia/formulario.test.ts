/**
 * O formulário «Nova obra» sem a tela: o CSL que ele grava (só os campos dele), os nomes, a citação curta proposta, os
 * campos de uma citação impressa e as obras parecidas. Só dados inventados (TESTE).
 */
import { chicago, chicagoHtml } from './chicago'
import { CAMPOS_DO_FORMULARIO, lerDoZotero } from './colar'
import {
  anoDoCsl,
  camposDaCurta,
  camposVisiveis,
  chicagoDaObra,
  curtaProposta,
  formularioDoCsl,
  formularioVazio,
  montarCsl,
  MSG_ANO,
  MSG_SEM_TIPO,
  MSG_SEM_TITULO,
  nomesDoTexto,
  parecidas,
  textoDosNomes,
  tituloDobrado,
  type FormularioDaObra,
  type ObraParaComparar,
} from './formulario'
import type { Csl } from './modelo'

const f = (x: Partial<FormularioDaObra>): FormularioDaObra => ({ ...formularioVazio(), ...x })

describe('montarCsl: o CSL do formulário', () => {
  it('um livro: só os campos com valor, na ordem do formulário, o ano em número', () => {
    const { csl, erros } = montarCsl(f({ tipo: 'book', autores: 'Probe, Ana\nExemplo,  Bruno ', ano: '1993', titulo: ' Selos  de teste ', lugar: 'Cidade Fictícia', editora: 'Editora Imaginária' }))
    expect(erros).toEqual([])
    expect(csl).toEqual({
      type: 'book',
      author: [
        { family: 'Probe', given: 'Ana' },
        { family: 'Exemplo', given: 'Bruno' },
      ],
      issued: { 'date-parts': [[1993]] },
      title: 'Selos de teste',
      'publisher-place': 'Cidade Fictícia',
      publisher: 'Editora Imaginária',
    })
    expect(Object.keys(csl)).toEqual(['type', 'author', 'issued', 'title', 'publisher-place', 'publisher'])
  })

  it('o volume organizado é um livro com os organizadores no lugar dos autores', () => {
    const { csl } = montarCsl(f({ tipo: 'volume', organizadores: 'Probe, Ana', titulo: 'Coletânea de teste', ano: '2001' }))
    expect(csl).toEqual({ type: 'book', editor: [{ family: 'Probe', given: 'Ana' }], issued: { 'date-parts': [[2001]] }, title: 'Coletânea de teste' })
  })

  it('o capítulo: o livro (container-title), os organizadores e as páginas', () => {
    const { csl } = montarCsl(f({ tipo: 'chapter', autores: 'Probe, Ana', organizadores: 'Exemplo, Bruno', titulo: 'Um capítulo', fonte: 'Um livro', paginas: '12-34', ano: '2002' }))
    expect(csl).toMatchObject({ type: 'chapter', 'container-title': 'Um livro', editor: [{ family: 'Exemplo', given: 'Bruno' }], page: '12-34' })
  })

  it('nunca grava lista de nomes vazia nem texto vazio', () => {
    const { csl } = montarCsl(f({ tipo: 'book', autores: '\n  \n', organizadores: ' ', titulo: 'T', lugar: '   ', volume: '' }))
    expect(csl).toEqual({ type: 'book', title: 'T' })
  })

  it('só os campos do formulário saem (os de CAMPOS_DO_FORMULARIO)', () => {
    const tudo = f({ tipo: 'chapter', autores: 'A, B', organizadores: 'C, D', ano: '1', titulo: 'T', fonte: 'F', volume: 'V', paginas: 'P', lugar: 'L', editora: 'E', serie: 'S', curta: 'A 1' })
    const { csl } = montarCsl(tudo)
    expect(Object.keys(csl).every((c) => CAMPOS_DO_FORMULARIO.includes(c as never))).toBe(true)
    expect(Object.keys(csl)).toHaveLength(CAMPOS_DO_FORMULARIO.length)
  })

  it('os erros: sem tipo, sem título, o ano que não é número; o resto ainda monta a prévia', () => {
    const { csl, erros } = montarCsl(f({ ano: '1993a', autores: 'Probe, Ana' }))
    expect(erros.map((e) => [e.campo, e.texto])).toEqual([
      ['tipo', MSG_SEM_TIPO],
      ['ano', MSG_ANO],
      ['titulo', MSG_SEM_TITULO],
    ])
    expect(csl).toEqual({ author: [{ family: 'Probe', given: 'Ana' }] })
    for (const ano of ['0', '12345', 'ca. 1900', '-5', '19 93']) expect(montarCsl(f({ tipo: 'book', titulo: 'T', ano })).erros.map((e) => e.campo)).toEqual(['ano'])
    expect(montarCsl(f({ tipo: 'book', titulo: 'T', ano: ' 800 ' })).csl.issued).toEqual({ 'date-parts': [[800]] })
  })
})

describe('os nomes', () => {
  it('«Sobrenome, Nome»; sem vírgula, o nome inteiro (literal); só o sobrenome', () => {
    expect(nomesDoTexto('Probe, Ana\nUniversidade de Teste\nExemplo,\n, Só Nome')).toEqual([
      { family: 'Probe', given: 'Ana' },
      { literal: 'Universidade de Teste' },
      { family: 'Exemplo' },
      { literal: 'Só Nome' },
    ])
  })

  it('a linha que não mudou devolve o nome como era (nada se perde ao editar)', () => {
    const originais = [{ family: 'van der Probe', given: 'Ana', suffix: 'Jr.' }, { literal: 'Instituto de Teste' }]
    const t = textoDosNomes(originais)
    expect(t).toBe('van der Probe, Ana\nInstituto de Teste')
    expect(nomesDoTexto(t, originais)).toEqual(originais)
    expect(nomesDoTexto(`${t}\nNovo, Nome`, originais)).toEqual([...originais, { family: 'Novo', given: 'Nome' }])
  })
})

describe('a citação curta proposta', () => {
  it('o sobrenome e o ano; dois nomes com «/»; três ou mais com «et al.»; organizadores com «[ed.]»', () => {
    expect(curtaProposta(f({ autores: 'Probe, Ana', ano: '1993' }))).toBe('Probe 1993')
    expect(curtaProposta(f({ autores: 'Probe, Ana\nExemplo, Bruno', ano: '1993' }))).toBe('Probe/Exemplo 1993')
    expect(curtaProposta(f({ autores: 'Probe, Ana\nExemplo, Bruno\nAmostra, Cia', ano: '1993' }))).toBe('Probe et al. 1993')
    expect(curtaProposta(f({ organizadores: 'Probe, Ana', ano: '2002' }))).toBe('Probe [ed.] 2002')
    expect(curtaProposta(f({ autores: 'Instituto de Teste', ano: '2002' }))).toBe('Instituto de Teste 2002')
    expect(curtaProposta(f({ autores: 'Probe, Ana', ano: '19x' }))).toBe('Probe')
    expect(curtaProposta(f({ ano: '1993' }))).toBe('')
  })
})

describe('os campos de uma citação impressa (?curta= da Revisão)', () => {
  it('lê os sobrenomes e o ano; tira o localizador, «et al.» e «[ed.]»', () => {
    expect(camposDaCurta('Probe-Exemplo 1993: 12')).toEqual({ autores: 'Probe-Exemplo, ', organizadores: '', ano: '1993', curta: 'Probe-Exemplo 1993' })
    expect(camposDaCurta('Fictícia/Modelo [ed.] 2002: 196')).toEqual({ autores: '', organizadores: 'Fictícia, \nModelo, ', ano: '2002', curta: 'Fictícia/Modelo [ed.] 2002' })
    expect(camposDaCurta('Amostra et al. 1992a: 29–32')).toEqual({ autores: 'Amostra, ', organizadores: '', ano: '1992', curta: 'Amostra et al. 1992a' })
    expect(camposDaCurta('1997: 96')).toEqual({ autores: '', organizadores: '', ano: '1997', curta: '1997' })
    expect(camposDaCurta('Sem Ano')).toEqual({ autores: 'Sem Ano, ', organizadores: '', ano: '', curta: 'Sem Ano' })
  })
})

describe('o formulário a partir de um CSL (colado ou gravado)', () => {
  it('um livro só com organizadores é «Volume organizado»; os outros tipos como vêm; o tipo desconhecido fica vazio', () => {
    expect(formularioDoCsl({ type: 'book', editor: [{ family: 'P', given: 'A' }], title: 'T' }).tipo).toBe('volume')
    expect(formularioDoCsl({ type: 'book', author: [{ family: 'P' }], editor: [{ family: 'E' }], title: 'T' }).tipo).toBe('book')
    expect(formularioDoCsl({ type: 'document', title: 'T' }).tipo).toBe('document')
    expect(formularioDoCsl({ type: 'webpage', title: 'T' }).tipo).toBe('')
  })

  it('colar → formulário → CSL dá o mesmo CSL que o colar leu (para os quatro tipos)', () => {
    const textos = [
      '{"type":"book","title":"Selos de teste","author":[{"family":"Probe","given":"Ana"}],"issued":{"date-parts":[[1993,5]]},"publisher":"Editora Imaginária","publisher-place":"Cidade Fictícia","DOI":"10.0/x"}',
      '@article{k, author={Probe, Ana and Exemplo, Bruno}, title={Um artigo {\\\'e} de teste}, journal={Revista Inventada}, volume={7}, pages={12--34}, year={2001}}',
      '@incollection{k, author={Probe, Ana}, editor={Exemplo, Bruno}, title={Capítulo}, booktitle={Livro de teste}, pages={1--9}, year={2004}, publisher={Editora}, address={Lugar}}',
      '{"type":"book","title":"Coletânea","editor":[{"family":"Probe","given":"Ana"}],"issued":{"date-parts":[["2000"]]}}',
    ]
    for (const t of textos) {
      const lido = lerDoZotero(t)
      const { csl, erros } = montarCsl(formularioDoCsl(lido.csl))
      expect(erros).toEqual([])
      expect(csl).toEqual(lido.csl)
    }
  })
})

describe('camposVisiveis: o que cada tipo mostra, e todo campo com valor', () => {
  it('o artigo mostra a revista e o volume; o livro não, salvo se têm valor', () => {
    expect(camposVisiveis(f({ tipo: 'article-journal' }))).toEqual(['autores', 'ano', 'titulo', 'fonte', 'volume', 'paginas'])
    expect(camposVisiveis(f({ tipo: 'book' }))).not.toContain('fonte')
    expect(camposVisiveis(f({ tipo: 'book', fonte: 'Revista Inventada' }))).toContain('fonte')
    expect(camposVisiveis(f({ tipo: 'volume' }))).toEqual(['organizadores', 'ano', 'titulo', 'lugar', 'editora', 'serie'])
    expect(camposVisiveis(f({ tipo: 'chapter' }))).toEqual(['autores', 'organizadores', 'ano', 'titulo', 'fonte', 'paginas', 'lugar', 'editora', 'serie'])
  })
})

describe('a prévia é exatamente o chicago()', () => {
  it('o texto e o html são os de chicago() e chicagoHtml() do CSL que se grava', () => {
    const { csl } = montarCsl(f({ tipo: 'book', autores: 'Probe, Ana', ano: '1993', titulo: 'Selos & sinetes', lugar: 'Cidade Fictícia', editora: 'Editora Imaginária' }))
    expect(chicagoDaObra(csl)).toEqual({ texto: chicago(csl as Csl), html: chicagoHtml(csl as Csl) })
    expect(chicagoDaObra({ type: 'book' })).toBeNull()
    expect(chicagoDaObra({ type: 'webpage', title: 'T' })).toBeNull()
  })
})

describe('as parecidas', () => {
  const obra = (id: string, curtas: string[], csl: Record<string, unknown> | null, skc = false): ObraParaComparar => ({ id, curtas, csl, skc })
  const livro = obra('BIB-900001', ['Probe 1993'], { type: 'book', author: [{ family: 'Probe', given: 'Ana' }], title: 'Selos de teste!', issued: { 'date-parts': [[1993]] } })
  const mesmoAutor = obra('BIB-900002', ['Probe 1993b'], { type: 'book', author: [{ family: 'Próbe' }], title: 'Outro', issued: { 'date-parts': [[1993]] } })
  const mesmoTitulo = obra('BIB-900003', ['Amostra 2000'], { type: 'book', author: [{ family: 'Amostra' }], title: 'SELOS DE TESTE', issued: { 'date-parts': [[2000]] } })
  const outra = obra('BIB-900004', ['Outra 1993'], { type: 'book', author: [{ family: 'Outra' }], title: 'Nada', issued: { 'date-parts': [[1993]] } })
  const mesmaChave = obra('BIB-aaaaaaaa-1', ['Probe 1993'], { type: 'book', title: 'Um título diferente' }, true)

  it('a «quase igual» (chave, ano e título dobrado) vem primeiro; depois a mesma chave, o mesmo autor e ano, o mesmo título', () => {
    const alvo = { csl: { type: 'book', author: [{ family: 'Probe', given: 'A.' }], title: 'Selos  de   teste', issued: { 'date-parts': [[1993]] } }, curta: 'Probe 1993' }
    expect(parecidas(alvo, [outra, mesmoTitulo, mesmoAutor, mesmaChave, livro]).map((p) => [p.obra.id, p.motivo])).toEqual([
      ['BIB-900001', 'quase'],
      ['BIB-aaaaaaaa-1', 'chave'],
      ['BIB-900002', 'autor-e-ano'],
      ['BIB-900003', 'titulo'],
    ])
  })

  it('o ano em texto ("1993") conta como o mesmo; a citação com localizador também', () => {
    const alvo = { csl: { type: 'book', title: 'selos de teste', issued: { 'date-parts': [['1993']] } }, curta: 'Probe 1993: 4' }
    expect(parecidas(alvo, [livro]).map((p) => p.motivo)).toEqual(['quase'])
  })

  it('nada parecido: lista vazia; o limite', () => {
    expect(parecidas({ csl: { type: 'book', title: 'Inédito' }, curta: 'Ninguém 1800' }, [livro, outra])).toEqual([])
    const muitas = Array.from({ length: 10 }, (_, i) => obra(`BIB-90010${i}`, ['Probe 1993'], null))
    expect(parecidas({ csl: { title: 'x' }, curta: 'Probe 1993' }, muitas)).toHaveLength(6)
  })

  it('o título dobrado e o ano seguem o processamento', () => {
    expect(tituloDobrado('  Ḫirbet: «Teste»—de Prova! ')).toBe('hirbet teste de prova')
    expect(anoDoCsl({ issued: { 'date-parts': [[1993, 4]] } })).toBe('1993')
    expect(anoDoCsl({ issued: { literal: ' 1993 ' } })).toBe('1993')
    expect(anoDoCsl({ issued: {} })).toBeNull()
    expect(anoDoCsl({})).toBeNull()
  })
})
