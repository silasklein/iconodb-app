// @vitest-environment node
import { CAMPOS_DO_CHICAGO, chicago, noAlcance, TIPOS_DO_CHICAGO } from './chicago'
import { CAMPOS_DO_FORMULARIO, latex, lerDoZotero, NAO_RECONHECIDO, SEM_TIPO, SEM_TITULO, TIPOS_MAPEADOS } from './colar'
import type { Csl } from './modelo'

// Só autores e títulos inventados: o repositório é público.

/** O resultado é seguro para o formulário: só os campos dele, nenhum vazio, e a prévia em Chicago não lança. */
function confereSeguro(r: ReturnType<typeof lerDoZotero>) {
  for (const campo of Object.keys(r.csl)) expect(CAMPOS_DO_FORMULARIO).toContain(campo)
  for (const v of Object.values(r.csl)) {
    expect(v).not.toBe('')
    if (Array.isArray(v)) expect(v.length).toBeGreaterThan(0)
  }
  if (r.csl.type !== undefined) expect(TIPOS_DO_CHICAGO).toContain(r.csl.type)
  if (r.csl.type && r.csl.title) {
    expect(noAlcance(r.csl as Csl)).toBe(true)
    expect(() => chicago(r.csl as Csl)).not.toThrow()
  }
  expect(Array.isArray(r.faltou)).toBe(true)
  if (r.formato === null) expect(r.csl).toEqual({})
}

describe('lerDoZotero: CSL JSON', () => {
  it('livro, como o Zotero copia: só os campos do formulário, e o resto nomeado em faltou', () => {
    const texto = JSON.stringify([{
      id: 'http://zotero.org/users/local/AbCdEf/items/TESTE001',
      type: 'book',
      title: 'Selos de um reino imaginário',
      'collection-title': 'Estudos Fictícios',
      publisher: 'Editora Imaginária',
      'publisher-place': 'Vila Imaginária',
      'number-of-pages': '320',
      source: 'Catálogo Inventado',
      ISBN: '000-0-00-000000-0',
      language: 'pt',
      DOI: '10.0000/teste.0001',
      URL: 'https://exemplo.invalid/obra',
      author: [{ family: 'Probe', given: 'Ana' }, { family: 'Exemplo', given: 'Bruno' }],
      issued: { 'date-parts': [['2010', '5']] },
      accessed: { 'date-parts': [['2026', 11, 15]] },
    }])
    const r = lerDoZotero(texto)
    expect(r.formato).toBe('csl-json')
    expect(r.csl).toEqual({
      type: 'book',
      author: [{ family: 'Probe', given: 'Ana' }, { family: 'Exemplo', given: 'Bruno' }],
      issued: { 'date-parts': [[2010]] },
      title: 'Selos de um reino imaginário',
      publisher: 'Editora Imaginária',
      'publisher-place': 'Vila Imaginária',
      'collection-title': 'Estudos Fictícios',
    })
    expect(Object.keys(r.csl)).toEqual(['type', 'author', 'issued', 'title', 'publisher-place', 'publisher',
      'collection-title'])
    expect(r.faltou).toEqual(['fora do formulário: number-of-pages, source, ISBN, language, DOI, URL, accessed'])
    expect(chicago(r.csl as Csl)).toBe('Probe, Ana, and Bruno Exemplo. 2010. Selos de um reino imaginário. Estudos Fictícios. Editora Imaginária.')
    confereSeguro(r)
  })

  it('capítulo, com o livro, os organizadores e as páginas', () => {
    const r = lerDoZotero(JSON.stringify({
      type: 'chapter',
      title: 'O selo inventado',
      'container-title': 'Livro de teste',
      author: [{ family: 'Probe', given: 'Ana' }],
      editor: [{ family: 'Exemplo', given: 'Bruno' }, { family: 'Amostra', given: 'Carla' }],
      issued: { 'date-parts': [[1999]] },
      page: '12-34',
      volume: 2,
      issue: '3',
    }))
    expect(r.formato).toBe('csl-json')
    expect(r.csl).toEqual({
      type: 'chapter',
      author: [{ family: 'Probe', given: 'Ana' }],
      editor: [{ family: 'Exemplo', given: 'Bruno' }, { family: 'Amostra', given: 'Carla' }],
      issued: { 'date-parts': [[1999]] },
      title: 'O selo inventado',
      'container-title': 'Livro de teste',
      volume: '2',
      page: '12-34',
    })
    expect(r.faltou).toEqual(['fora do formulário: issue'])
    confereSeguro(r)
  })

  it('lista com 3 itens: lê o primeiro e diz quantos ignorou', () => {
    const item = (t: string) => ({ type: 'book', title: t, author: [{ family: 'Probe', given: 'Ana' }] })
    const r = lerDoZotero(JSON.stringify([item('Primeira obra'), item('Segunda obra'), item('Terceira obra')]))
    expect(r.formato).toBe('csl-json')
    expect(r.csl.title).toBe('Primeira obra')
    expect(r.faltou).toEqual(['2 obras ignoradas: só a primeira foi lida'])
    expect(lerDoZotero(JSON.stringify([item('A'), item('B')])).faltou).toEqual(['1 obra ignorada: só a primeira foi lida'])
  })

  it('o ano em texto vale como ano (R2); mês e dia ficam de fora', () => {
    const ano = (issued: unknown) => lerDoZotero(JSON.stringify({ type: 'book', title: 'T', issued }))
    expect(ano({ 'date-parts': [['2000']] }).csl.issued).toEqual({ 'date-parts': [[2000]] })
    expect(ano({ 'date-parts': [[' 2000 ']] }).csl.issued).toEqual({ 'date-parts': [[2000]] })
    expect(ano({ 'date-parts': [[2000, 3, 1]] }).csl.issued).toEqual({ 'date-parts': [[2000]] })
    expect(ano({ raw: '1987' }).csl.issued).toEqual({ 'date-parts': [[1987]] })
    expect(ano({ literal: '1987' }).csl.issued).toEqual({ 'date-parts': [[1987]] })
    const intervalo = ano({ 'date-parts': [[1990], [1991]] })
    expect(intervalo.csl.issued).toEqual({ 'date-parts': [[1990]] })
    expect(intervalo.faltou).toContain('só o primeiro ano do intervalo foi lido: 1990–1991')
    for (const [issued, aviso] of [
      [{ literal: 's.d.' }, 'ano não lido: s.d.'],
      [{ 'date-parts': [['2000a']] }, 'ano não lido: 2000a'],
      [{ 'date-parts': [[2000.5]] }, 'ano não lido: 2000.5'],
      [{ 'date-parts': [[0]] }, 'ano não lido: 0'],
      ['cerca de 1900', 'ano não lido: cerca de 1900'],
    ] as const) {
      const r = ano(issued)
      expect(r.csl.issued).toBeUndefined()
      expect(r.faltou).toContain(aviso)
    }
  })

  it('os nomes: partículas juntadas, literal mantido, sufixo e nomes estranhos avisados', () => {
    const r = lerDoZotero(JSON.stringify({
      type: 'book', title: 'T',
      author: [
        { family: 'Probe', given: 'Ana', 'non-dropping-particle': 'van der' },
        { family: 'Exemplo', given: 'Bruno', 'dropping-particle': 'de', suffix: 'Jr.' },
        { literal: 'Instituto Imaginário' },
        'Nome Solto',
        { family: '  ', given: '' },
      ],
      editor: [],
    }))
    expect(r.csl.author).toEqual([
      { family: 'van der Probe', given: 'Ana' },
      { family: 'Exemplo', given: 'Bruno de' },
      { literal: 'Instituto Imaginário' },
    ])
    expect(r.csl).not.toHaveProperty('editor')
    expect(r.faltou).toEqual(['sufixo de nome deixado de fora: Jr.', '2 nomes não lidos em autores'])
    confereSeguro(r)
  })

  it('os outros tipos do Zotero vão para os quatro, com o aviso (R1)', () => {
    expect(TIPOS_MAPEADOS).toEqual({
      thesis: 'book', report: 'book', manuscript: 'book', 'paper-conference': 'chapter', 'entry-encyclopedia': 'chapter',
      'article-magazine': 'article-journal', 'article-newspaper': 'article-journal',
    })
    for (const [original, novo] of Object.entries(TIPOS_MAPEADOS)) {
      const r = lerDoZotero(JSON.stringify({ type: original, title: 'T' }))
      expect(r.csl.type).toBe(novo)
      expect(r.faltou).toEqual([`tipo ${original} tratado como ${novo}`])
      confereSeguro(r)
    }
    for (const t of TIPOS_DO_CHICAGO) expect(lerDoZotero(JSON.stringify({ type: t, title: 'T' })).faltou).toEqual([])
  })

  it('um tipo sem mapa fica de fora, e o formulário pede a escolha', () => {
    const r = lerDoZotero(JSON.stringify({ type: 'webpage', title: 'Página inventada', URL: 'https://exemplo.invalid' }))
    expect(r.formato).toBe('csl-json')
    expect(r.csl).toEqual({ title: 'Página inventada' })
    expect(r.faltou).toEqual(['tipo webpage sem equivalente: escolha o tipo', 'fora do formulário: URL'])
  })

  it('sem título, ou com valores que não são texto: diz o que faltou', () => {
    const r = lerDoZotero(JSON.stringify({ type: 'book', author: [{ family: 'Probe' }], title: ['x'], volume: true,
      publisher: '   ' }))
    expect(r.csl).toEqual({ type: 'book', author: [{ family: 'Probe' }] })
    expect(r.faltou).toEqual(['título não lido', 'volume não lido', SEM_TITULO])
  })
})

describe('lerDoZotero: BibTeX', () => {
  it('@book com acento {\\\'e} e {Ü}ber', () => {
    const r = lerDoZotero(String.raw`@book{probe_selos_2010,
  title = {{{Ü}ber} die Siegel von Caf{\'e} {Imaginär}},
  author = {Probe, Ana and Exemplo, Bruno and M{\"o}ller, J{\'e}r{\^o}me},
  year = {2010},
  address = {Vila Imagin{\'a}ria},
  publisher = {Editora Fict{\'\i}cia},
  series = {Estudos {Inventados}},
  isbn = {000-0-00-000000-0},
  langid = {german},
  month = may,
}`)
    expect(r.formato).toBe('bibtex')
    expect(r.csl).toEqual({
      type: 'book',
      author: [{ family: 'Probe', given: 'Ana' }, { family: 'Exemplo', given: 'Bruno' },
        { family: 'Möller', given: 'Jérôme' }],
      issued: { 'date-parts': [[2010]] },
      title: 'Über die Siegel von Café Imaginär',
      'publisher-place': 'Vila Imaginária',
      publisher: 'Editora Fictícia',
      'collection-title': 'Estudos Inventados',
    })
    expect(r.faltou).toEqual(['fora do formulário: isbn, langid, month'])
    confereSeguro(r)
  })

  it('@article com journal, volume e pages (o «--» vira «–», como no resto do texto)', () => {
    const r = lerDoZotero(`@article{exemplo1987,
  author = "Exemplo, Bruno",
  title = "Um artigo de teste",
  journal = {Revista Imagin{\\'a}ria},
  volume = 12,
  number = {3},
  pages = {12--34},
  year = 1987,
  doi = {10.0000/teste.0002},
}`)
    expect(r.formato).toBe('bibtex')
    expect(r.csl).toEqual({
      type: 'article-journal',
      author: [{ family: 'Exemplo', given: 'Bruno' }],
      issued: { 'date-parts': [[1987]] },
      title: 'Um artigo de teste',
      'container-title': 'Revista Imaginária',
      volume: '12',
      page: '12–34',
    })
    expect(r.faltou).toEqual(['fora do formulário: number, doi'])
    expect(chicago(r.csl as Csl)).toBe('Exemplo, Bruno. 1987. “Um artigo de teste.” Revista Imaginária 12: 12–34.')
  })

  it('@incollection com booktitle e editor', () => {
    const r = lerDoZotero(`@incollection{probe1999,
  author = {Ana Probe},
  editor = {Bruno Exemplo and Carla van der Amostra},
  title = {O capítulo inventado},
  booktitle = {Livro de {Teste}},
  pages = {5--9},
  publisher = {Editora Imaginária},
  address = {Vila Imaginária},
  year = {1999}
}`)
    expect(r.formato).toBe('bibtex')
    expect(r.csl).toEqual({
      type: 'chapter',
      author: [{ family: 'Probe', given: 'Ana' }],
      editor: [{ family: 'Exemplo', given: 'Bruno' }, { family: 'van der Amostra', given: 'Carla' }],
      issued: { 'date-parts': [[1999]] },
      title: 'O capítulo inventado',
      'container-title': 'Livro de Teste',
      page: '5–9',
      'publisher-place': 'Vila Imaginária',
      publisher: 'Editora Imaginária',
    })
    expect(r.faltou).toEqual([])
    confereSeguro(r)
  })

  it('@collection e @book só com organizadores', () => {
    for (const tipo of ['collection', 'book']) {
      const r = lerDoZotero(`@${tipo}{x, editor = {Exemplo, Bruno}, title = {Coletânea de teste}, year = {2001}}`)
      expect(r.csl).toEqual({ type: 'book', editor: [{ family: 'Exemplo', given: 'Bruno' }],
        issued: { 'date-parts': [[2001]] }, title: 'Coletânea de teste' })
      expect(r.faltou).toEqual([])
      expect(chicago(r.csl as Csl)).toBe('Exemplo, Bruno, ed. 2001. Coletânea de teste.')
    }
  })

  it('os outros tipos do BibTeX: mapeados com aviso, ou sem equivalente', () => {
    const tipo = (t: string, extra = '') => lerDoZotero(`@${t}{x, title = {T}, author = {Probe, Ana}${extra}}`)
    expect(tipo('phdthesis', ', school = {Universidade Imaginária}')).toMatchObject({
      csl: { type: 'book', publisher: 'Universidade Imaginária' }, faltou: ['tipo @phdthesis tratado como book'] })
    expect(tipo('techreport').csl.type).toBe('book')
    expect(tipo('unpublished').faltou).toEqual(['tipo @unpublished tratado como book'])
    expect(tipo('inproceedings', ', booktitle = {Atas inventadas}')).toMatchObject({
      csl: { type: 'chapter', 'container-title': 'Atas inventadas' }, faltou: ['tipo @inproceedings tratado como chapter'] })
    expect(tipo('misc')).toMatchObject({ csl: { type: 'document' }, faltou: ['tipo @misc tratado como document'] })
    expect(tipo('ARTICLE', ', journal = {R}').csl).toMatchObject({ type: 'article-journal', 'container-title': 'R' })
    const online = tipo('online', ', url = {https://exemplo.invalid}')
    expect(online.formato).toBe('bibtex')
    expect(online.csl).toEqual({ author: [{ family: 'Probe', given: 'Ana' }], title: 'T' })
    expect(online.faltou).toEqual(['tipo @online sem equivalente: escolha o tipo', 'fora do formulário: url'])
    // O tipo que vem do protótipo de um objeto não é um tipo.
    expect(tipo('constructor').faltou[0]).toBe('tipo @constructor sem equivalente: escolha o tipo')
  })

  it('a revista só no artigo e o livro só no capítulo', () => {
    const r = lerDoZotero('@book{x, title = {T}, booktitle = {B}, journal = {J}}')
    expect(r.csl).toEqual({ type: 'book', title: 'T' })
    expect(r.faltou).toEqual(['fora do formulário: booktitle, journal'])
  })

  it('chaves aninhadas, aspas, @string com #, parênteses, @comment e várias entradas', () => {
    const r = lerDoZotero(`@comment{ isto não é uma entrada @book{falsa, title={Falsa}} }
@string{ editora = "Editora " }
@BOOK(probe2010,
  Title = "Um {t{\\'i}tulo {com {chaves}}} aninhadas",
  AUTHOR = {{Instituto Imagin{\\'a}rio} and Ana Probe and others},
  Publisher = editora # {Imagin{\\'a}ria},
  Year = "2010",
  note = {contato: ana@exemplo.invalid {e} mais}
)
@article{segunda, title = {Outra}}
@misc{terceira, title = {Mais uma}}`)
    expect(r.formato).toBe('bibtex')
    expect(r.csl).toEqual({
      type: 'book',
      author: [{ literal: 'Instituto Imaginário' }, { family: 'Probe', given: 'Ana' }],
      issued: { 'date-parts': [[2010]] },
      title: 'Um título com chaves aninhadas',
      publisher: 'Editora Imaginária',
    })
    expect(r.faltou).toEqual(['2 obras ignoradas: só a primeira foi lida', '«et al.» deixado de fora em autores',
      'fora do formulário: note'])
  })

  it('nomes: «Sobrenome, Jr., Nome», «Nome von Sobrenome», um nome só', () => {
    const r = lerDoZotero('@book{x, title = {T}, author = {Probe, Jr., Ana and Bruno de la Exemplo and Amostra}}')
    expect(r.csl.author).toEqual([{ family: 'Probe', given: 'Ana' }, { family: 'de la Exemplo', given: 'Bruno' },
      { family: 'Amostra' }])
    expect(r.faltou).toEqual(['sufixo de nome deixado de fora: Jr.'])
  })

  it('date do biblatex, ano que não é ano', () => {
    const ler = (campo: string) => lerDoZotero(`@book{x, title = {T}, ${campo}}`)
    expect(ler('date = {2004-05-01}').csl.issued).toEqual({ 'date-parts': [[2004]] })
    expect(ler('date = {2004}').csl.issued).toEqual({ 'date-parts': [[2004]] })
    expect(ler('year = {2004}, date = {1999}').faltou).toEqual(['fora do formulário: date'])
    for (const [campo, aviso] of [['year = {2004a}', 'ano não lido: 2004a'], ['year = {[1900?]}', 'ano não lido: [1900?]'],
      ['date = {circa 1900}', 'ano não lido: circa 1900']]) {
      const r = ler(campo!)
      expect(r.csl.issued).toBeUndefined()
      expect(r.faltou).toContain(aviso)
    }
  })

  it('«et al.» e «others» não são autores: saem, com um aviso só', () => {
    for (const fim of ['et al.', 'et al', 'et~al.', 'Et Al.', 'others', 'Others', '{others}']) {
      const r = lerDoZotero(`@book{x, title = {T}, author = {Probe, Ana and ${fim}}, year = {2001}, editor = {Exemplo, Bruno and others}}`)
      expect(r.csl.author).toEqual([{ family: 'Probe', given: 'Ana' }])
      expect(r.csl.editor).toEqual([{ family: 'Exemplo', given: 'Bruno' }])
      expect(r.faltou).toEqual(['«et al.» deixado de fora em autores', '«et al.» deixado de fora em organizadores'])
      expect(chicago(r.csl as Csl)).toBe('Probe, Ana. 2001. T. Edited by Bruno Exemplo.')
    }
    const duas = lerDoZotero('@book{x, title = {T}, author = {Probe, Ana and others and et al.}}')
    expect(duas.faltou).toEqual(['«et al.» deixado de fora em autores'])
    // Um sobrenome que só começa assim continua nome, e «Etal» sozinho também.
    expect(lerDoZotero('@book{x, title = {T}, author = {Etalia, Ana and Othersen, Bruno and Etal}}').csl.author).toEqual([
      { family: 'Etalia', given: 'Ana' }, { family: 'Othersen', given: 'Bruno' }, { family: 'Etal' }])
    expect(lerDoZotero('@book{x, title = {T}, author = {Probe, Ana and et.al.}}').csl.author).toEqual([
      { family: 'Probe', given: 'Ana' }])
  })

  it('um comando LaTeX desconhecido fica visível e entra no aviso; o grego vira letra', () => {
    const r = lerDoZotero(String.raw`@book{x, title = {Selo $\alpha$ e \foo{x} com \textit{grifo} e \bar baz},
      author = {Probe, Ana}, publisher = {Editora \foo{} Imaginária}}`)
    expect(r.csl.title).toBe(String.raw`Selo α e \foo{x} com grifo e \bar baz`)
    expect(r.csl.publisher).toBe(String.raw`Editora \foo{} Imaginária`)
    expect(r.faltou).toEqual([String.raw`comandos LaTeX não convertidos: \foo, \bar`])
    const um = lerDoZotero(String.raw`@book{x, title = {Um \novo título}}`)
    expect(um.csl.title).toBe(String.raw`Um \novo título`)
    expect(um.faltou).toEqual([String.raw`comando LaTeX não convertido: \novo`])
    // Os conhecidos não avisam.
    expect(lerDoZotero(String.raw`@book{x, title = {$\Omega$ \emph{e} \'e \ss{} {\noopsort{b}}T}}`)).toMatchObject({
      csl: { title: 'Ω e é ß T' }, faltou: [] })
    // O aviso vale também nos nomes, e não nos campos fora do formulário.
    const nome = lerDoZotero(String.raw`@book{x, title = {T}, author = {\Probe, Ana}, note = {\fora}}`)
    expect(nome.csl.author).toEqual([{ family: String.raw`\Probe`, given: 'Ana' }])
    expect(nome.faltou).toEqual([String.raw`comando LaTeX não convertido: \Probe`, 'fora do formulário: note'])
  })

  it('o intervalo do date do biblatex dá o aviso, como no CSL JSON', () => {
    const r = lerDoZotero('@book{x, title = {T}, date = {2000/2001}}')
    expect(r.csl.issued).toEqual({ 'date-parts': [[2000]] })
    expect(r.faltou).toEqual(['só o primeiro ano do intervalo foi lido: 2000–2001'])
    expect(lerDoZotero('@book{x, title = {T}, date = {2000-05/2000-06}}').faltou).toEqual([])
    expect(lerDoZotero('@book{x, title = {T}, date = {2000/}}').csl.issued).toEqual({ 'date-parts': [[2000]] })
  })

  it('entrada cortada: fica o que foi lido, sem lançar', () => {
    const r = lerDoZotero('@book{x, author = {Probe, Ana}, title = {Título sem fec')
    expect(r.formato).toBe('bibtex')
    expect(r.csl).toEqual({ type: 'book', author: [{ family: 'Probe', given: 'Ana' }], title: 'Título sem fec' })
    confereSeguro(r)
  })
})

describe('latex: do BibTeX ao texto', () => {
  it.each([
    [String.raw`{\'e}`, 'é'], [String.raw`\'e`, 'é'], [String.raw`\'{e}`, 'é'], [String.raw`{\"o}`, 'ö'],
    [String.raw`\"{O}`, 'Ö'], [String.raw`{\c c}`, 'ç'], [String.raw`\c{C}`, 'Ç'], [String.raw`\~n`, 'ñ'],
    [String.raw`\^{a}`, 'â'], ['\\`a', 'à'], [String.raw`\'{\i}`, 'í'], [String.raw`{\ss}`, 'ß'],
    [String.raw`\o{}`, 'ø'], [String.raw`\v{s}`, 'š'], [String.raw`\u{g}`, 'ğ'], [String.raw`\H{o}`, 'ő'],
    [String.raw`\aa`, 'å'], [String.raw`\={a}`, 'ā'], [String.raw`\.{z}`, 'ż'], [String.raw`A \& B`, 'A & B'],
    [String.raw`50\%`, '50%'], ['a--b', 'a–b'], ['a---b', 'a—b'], ['a~b', 'a b'], ['``x\'\'', '“x”'],
    [String.raw`\textit{Itálico} e \emph{ênfase}`, 'Itálico e ênfase'], [String.raw`{{{Ü}ber}}`, 'Über'],
    ['  muitos   espaços \n e linhas ', 'muitos espaços e linhas'], ['\\', ''], [String.raw`\'`, ''],
    [String.raw`$\alpha$`, 'α'], [String.raw`\alpha`, 'α'], [String.raw`$\Delta\varphi$`, 'Δφ'], [String.raw`\$5`, '$5'],
    [String.raw`\foo`, String.raw`\foo`], [String.raw`\foo{x}`, String.raw`\foo{x}`], [String.raw`\foo{a{b}c}d`, String.raw`\foo{abc}d`],
    [String.raw`\foo bar`, String.raw`\foo bar`], [String.raw`\textbf{negrito}`, 'negrito'], [String.raw`\mbox{caixa}`, 'caixa'],
    [String.raw`{\noopsort{z}}Título`, 'Título'], [String.raw`\'{}x`, 'x'], [String.raw`a\'{}`, 'a'], [String.raw`\'{{e}}`, 'é'],
    [String.raw`\c c`, 'ç'], [String.raw`{\'E}cole`, 'École'],
  ])('%s → %s', (de, para) => {
    expect(latex(de)).toBe(para)
  })
})

/**
 * O limite dos testes de tempo. A leitura linear leva poucas dezenas de milissegundos (103 ms sob carga, na revisão); a
 * quadrática levava segundos. O limite é folgado para não falhar numa máquina de CI ocupada.
 */
const LIMITE_MS = 1000

describe('lerDoZotero: lixo nunca trava (foco 1)', () => {
  it.each([
    ['@a{', 70000], ['@a{k ', 40000], ['@book{k, x=1 ', 16000], ['@a(', 70000], ['@a(k, x={', 25000],
    ['@string{', 25000], ['@comment{', 22000], ['@a{k, x="', 22000], ['{', 200000], ['\\a', 100000],
  ] as const)('200 KB de %j repetido: lê em tempo linear', (pedaco, vezes) => {
    const texto = pedaco.repeat(vezes)
    expect(texto.length).toBeGreaterThan(190_000)
    const inicio = performance.now()
    lerDoZotero(texto)
    expect(performance.now() - inicio).toBeLessThan(LIMITE_MS)
  })

  it.each([String.raw`\foo{`, String.raw`\'{`, String.raw`\noopsort{`, String.raw`\textit{$\alpha`, ' and '])(
    '200 KB de %j num título e nos autores: lê em tempo linear', (pedaco) => {
      const miolo = pedaco.repeat(Math.ceil(100_000 / pedaco.length))
      const inicio = performance.now()
      const r = lerDoZotero(`@book{x, title = {${miolo}}, author = {${miolo}}}`)
      expect(performance.now() - inicio).toBeLessThan(LIMITE_MS)
      expect(r.formato).toBe('bibtex')
    })

  it('o latex de um comando desconhecido conta o nome', () => {
    const vistos = new Set<string>()
    expect(latex(String.raw`\foo $\alpha$ \bar{x} \foo`, vistos)).toBe(String.raw`\foo α \bar{x} \foo`)
    expect([...vistos]).toEqual([String.raw`\foo`, String.raw`\bar`])
  })

  it.each([
    '', '   ', 'um texto qualquer', 'Probe, Ana. 2010. Selos. Vila Imaginária.', 'ana@exemplo.invalid', 'a@b{c}',
    '{', '[', '{{{{', '}}}}', '{"a":', 'null', 'true', '123', '"texto"', '\\', '@', '@book', '@book{', '@book{chave',
    '@book{chave}', '@book{,}', '@{x, title={T}}', '@string{a = "b"}', '@comment{x}', '\uFEFF', '\u0000\u0001',
  ])('texto qualquer → formato null: %j', (texto) => {
    const r = lerDoZotero(texto)
    expect(r).toEqual({ csl: {}, formato: null, faltou: [NAO_RECONHECIDO] })
  })

  it.each([
    { name: 'pacote', version: '1.0.0' },
    { type: 'module', name: 'x', title: 'não é CSL' },
    { items: [{ type: 'book', title: 'T' }] },
    [{ foo: 1 }, { type: 'book', title: 'T' }],
    { type: 'book' },
    { type: 'book', title: '' },
    { type: 'BOOK', title: 'T' },
    [],
    [null],
    [[{ type: 'book', title: 'T' }]],
    { type: 'constructor', title: 'T' },
  ])('JSON que não é CSL → null: %j', (json) => {
    expect(lerDoZotero(JSON.stringify(json))).toEqual({ csl: {}, formato: null, faltou: [NAO_RECONHECIDO] })
  })

  it('valores de outro tipo no texto não chegam a lançar', () => {
    for (const x of [null, undefined, 3, {}, [], Symbol('x')]) {
      expect(lerDoZotero(x as unknown as string)).toEqual({ csl: {}, formato: null, faltou: [NAO_RECONHECIDO] })
    }
  })

  it('com tipo e sem título, ou com um tipo de BibTeX desconhecido: lê e diz o que faltou', () => {
    const r = lerDoZotero(JSON.stringify({ type: 'book', author: [{ family: 'Probe', given: 'Ana' }] }))
    expect(r.formato).toBe('csl-json')
    expect(r.faltou).toEqual([SEM_TITULO])
    expect(lerDoZotero('@book{x, author = {Probe, Ana}}').faltou).toEqual([SEM_TITULO])
    expect(lerDoZotero('@nada{x, title = {T}}').faltou).toEqual(['tipo @nada sem equivalente: escolha o tipo'])
    expect(SEM_TIPO).toBe('sem tipo: escolha o tipo')
  })

  it('textos grandes e chaves profundas', () => {
    const fundo = '@book{x, title = ' + '{'.repeat(20000) + 'T' + '}'.repeat(20000) + '}'
    expect(lerDoZotero(fundo).csl.title).toBe('T')
    expect(lerDoZotero('['.repeat(20000) + ']'.repeat(20000)).formato).toBeNull()
    expect(lerDoZotero('{'.repeat(20000)).formato).toBeNull()
    expect(lerDoZotero('@'.repeat(50000)).formato).toBeNull()
    expect(lerDoZotero('@book{x, title = {' + 'a and '.repeat(20000) + '}}').formato).toBe('bibtex')
    const r = lerDoZotero('@book{x, author = {' + 'Probe, Ana and '.repeat(2000) + 'Exemplo, Bruno}, title = {T}}')
    expect((r.csl.author as unknown[]).length).toBe(2001)
  })

  it('mil textos sorteados, com pedaços de CSL e BibTeX, nunca lançam e só dão campos do formulário', () => {
    // Um gerador fixo (mulberry32): a rodada é sempre a mesma.
    let semente = 0x1c0d0b
    const sorteio = () => {
      semente = (semente + 0x6d2b79f5) | 0
      let t = Math.imul(semente ^ (semente >>> 15), 1 | semente)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const pedacos = ['@book{', '@article(', '@string{', '@comment{', 'title', 'author', 'editor', 'year', '=', '{', '}',
      '"', ',', ' and ', 'others', '#', '\\\'', '\\"', '\\c', '\\i', '\\', '~', '--', 'Probe, Ana', 'Exemplo',
      '{"type":"book"', '"title":', '"author":[{"family":"Probe"}]', '"issued":{"date-parts":[["2000"]]}', '[', ']',
      ':', 'null', '1999', 'Á', 'א', '\uD83D', ' ', '\n', 'constructor', '__proto__', 'webpage', 'thesis']
    const amostras = [
      JSON.stringify({ type: 'chapter', title: 'T', 'container-title': 'L', editor: [{ family: 'E' }], page: '1-2' }),
      '@incollection{x, author = {Probe, Ana}, title = {T}, booktitle = {L}, pages = {1--2}, year = {2000}}',
    ]
    for (let n = 0; n < 1000; n++) {
      let texto: string
      if (n % 2) {
        texto = ''
        const k = Math.floor(sorteio() * 30)
        for (let j = 0; j < k; j++) texto += pedacos[Math.floor(sorteio() * pedacos.length)]
      } else {
        // Uma amostra boa, cortada e remendada.
        const base = amostras[n % 4 === 0 ? 0 : 1]!
        const a = Math.floor(sorteio() * base.length)
        const b = Math.floor(sorteio() * base.length)
        texto = base.slice(0, Math.min(a, b)) + pedacos[Math.floor(sorteio() * pedacos.length)] + base.slice(Math.max(a, b))
      }
      let r: ReturnType<typeof lerDoZotero> | undefined
      expect(() => { r = lerDoZotero(texto) }, texto).not.toThrow()
      confereSeguro(r!)
    }
  })
})

describe('os campos do formulário', () => {
  it('estão todos no alcance do Chicago do app', () => {
    for (const campo of CAMPOS_DO_FORMULARIO) expect(CAMPOS_DO_CHICAGO).toContain(campo)
    expect([...CAMPOS_DO_FORMULARIO]).toEqual(['type', 'author', 'editor', 'issued', 'title', 'container-title', 'volume',
      'page', 'publisher-place', 'publisher', 'collection-title'])
  })

  it('um CSL com todos os campos do Zotero sai só com os do formulário', () => {
    const r = lerDoZotero(JSON.stringify({
      id: 'TESTE', type: 'article-journal', title: 'T', 'container-title': 'R', volume: '1', issue: '2', page: '3',
      author: [{ family: 'Probe', given: 'Ana' }], translator: [{ family: 'Exemplo' }], issued: { 'date-parts': [[2000]] },
      DOI: 'x', URL: 'y', language: 'en', edition: '2', 'number-of-volumes': '3', 'collection-number': '4',
      'container-title-short': 'R.', 'title-short': 'T.', note: 'n', abstract: 'a', genre: 'g', number: '5', 'et-al': true,
    }))
    expect(Object.keys(r.csl)).toEqual(['type', 'author', 'issued', 'title', 'container-title', 'volume', 'page'])
    expect(r.faltou).toEqual(['fora do formulário: issue, translator, DOI, URL, language, edition, number-of-volumes, '
      + 'collection-number, container-title-short, title-short, note, abstract, genre, number, et-al'])
    confereSeguro(r)
  })
})
