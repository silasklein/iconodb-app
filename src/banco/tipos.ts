/**
 * Os tipos que as consultas devolvem às telas. Objetos simples, sem SQL.
 *
 * Deslocamentos (`inicio`/`fim` de termos, âncoras e citações) ficam em CODE POINTS,
 * como o pipeline em Python os grava (R49); quem desenha o texto converte para UTF-16
 * (Tarefa 8, `codepointsParaUtf16`).
 */
import type { ReferenciaDeFonte } from './referencias'

/** O "número" de um objeto (CA00001); um item sem objeto atribuído usa o id do item. */
export type Numero = string

export type Nivel = 'pre_iconographic' | 'iconographic' | 'iconological'
export type Modalidade = 'asserted' | 'probable' | 'possible' | 'questioned'
export type Certeza = 'certain' | 'doubtful' | 'unknown'
export type ModoDeExibicao = 'traco' | 'tons'
export type EstadoDaTraducao = 'machine' | 'reviewed'

export const NIVEIS: readonly Nivel[] = ['pre_iconographic', 'iconographic', 'iconological']

export interface Contagens {
  objetos: number
  hipoteses: number
  verbetes: number
}

/** A fila de revisão do pacote, somada em todas as bases (comum e publicações). */
export interface Pendencias {
  total: number
  /** Do tipo com mais casos para o com menos; `tipo` é o motivo gravado no pipeline (review_queue.reason). */
  porTipo: { tipo: string; rotulo: string; quantidade: number }[]
}

/** Ocorrência de um verbete do glossário no texto português. */
export interface Termo {
  glId: string
  inicio: number
  fim: number
}

/** Uma hipótese marcada no texto português (só as ancoradas por termo). */
export interface Ancora {
  hipoteseId: string
  glId: string
  inicio: number
  fim: number
  /** Null só numa hipótese SKC sem nível (ou sem certeza): nada é inventado no lugar. */
  nivel: Nivel | null
  modalidade: Modalidade | null
}

/** A leitura de uma fonte (uma por item-membro do objeto que tem descrição de catálogo). */
export interface Leitura {
  /** Rótulo da fonte, como "TESTE I: 2" (decisão 39). */
  fonte: string
  publicacao: string
  itemId: string
  passagemId: string
  /** Texto português renderizado; null quando o trecho não tem tradução. */
  texto: string | null
  /** O texto da fonte, como impresso (alemão). */
  original: string
  termos: Termo[]
  ancoras: Ancora[]
  estado: EstadoDaTraducao | null
  /** A fonte mudou depois da tradução. */
  desatualizada: boolean
}

export interface ItemDaFonte {
  id: string
  publicacao: string
  /** 'figura': a figura de um livro em parágrafos (o GGG), sem os campos do catálogo (pacote 11). */
  tipo: 'catalog' | 'intro_figure' | 'figura'
  /** "TESTE I: 2", "TESTE I: Abb. 1" ou, numa figura do livro em parágrafos, "GGG: 3b", sem «Abb.» (decisão 39). */
  origem: string
  /** A mesma referência em partes, para juntar várias numa linha (`formatarReferencias`). */
  referencia: ReferenciaDeFonte
}

export interface Imagem {
  id: string
  itemId: string
  ordinal: number
  display_mode: ModoDeExibicao | null
  /** Caminho no pacote da imagem de tela (o que `urlImagem` espera). */
  tela: string | null
  /** Caminho no pacote da miniatura. */
  miniatura: string | null
  largura: number | null
  altura: number | null
  credito: string | null
  /** Graus (horário) com que o livro imprime a figura. */
  rotacao: number | null
}

export interface DatacaoCssl {
  codigo: string
  relacao: 'within' | 'overlaps'
  aproximada: boolean
}

export interface Datacao {
  itemId: string
  esquema: string
  periodoDe: string | null
  periodoAte: string | null
  qualificador: string | null
  anoDe: number | null
  anoAte: number | null
  aproximada: boolean
  certeza: Certeza
  motivo: string | null
  cssl: DatacaoCssl[]
}

export interface SitioDoItem {
  /** "<SIGLA>-<n>": o sítio é de uma publicação. */
  id: string
  /** O item cujo achado deu o sítio (na peça de dois livros, a figura que diz «pela fig. X no § N»; revisão do branch, M3). */
  itemId: string
  /** Forma em uso (verbete-nome em português) ou, sem verbete, como impresso. */
  nome: string
  literal: string
  glId: string | null
  lat: number | null
  lon: number | null
  certeza: Certeza
  /** O contexto do achado (assertion `context`), como impresso. */
  contexto: string | null
  /** O achado «do texto» (decisão 90.1; `assertion.reason = 'do_texto'`): tirado do texto do livro, não de uma ficha. */
  doTexto: boolean
  /** O trecho de onde o achado «do texto» veio (`assertion.passage_id`); null no achado comum e no tirado do crédito. */
  trechoId: string | null
  /** O § desse trecho (`passage.locator` «§N»), para o link à página do §; null sem trecho. */
  paragrafo: number | null
}

export interface Medida {
  dim: string
  cm: number | null
  qualificador: string | null
}

export interface Medidas {
  /** Campo 6, como impresso. */
  texto: string | null
  valores: Medida[]
}

export interface CampoDoCatalogo {
  itemId: string
  /** 3–8; 0 = aparato não dividido. */
  categoria: number
  unidade: string
  literal: string
  texto: string | null
  termos: Termo[]
  estado: EstadoDaTraducao | null
  desatualizada: boolean
}

export interface AlvoDaHipotese {
  tipo: 'item' | 'artifact' | 'element'
  id: string
  /** Número do objeto do alvo (o item, ou o item do elemento). */
  numero: Numero | null
  /** O item do alvo (o próprio item, ou o item do elemento); null para artefato. */
  itemId: string | null
  /** Rótulo do elemento (português, senão como no texto); null para o objeto inteiro. */
  rotulo: string | null
}

export interface TermoDaHipotese {
  glId: string
  /** Forma em uso (pt_text quando há, senão pt). */
  pt: string | null
  de: string | null
}

export interface Autor {
  nome: string
  papel: 'author' | 'reported' | 'reporter'
}

export interface AncoraDaHipotese {
  unidade: string
  metodo: 'termo' | 'sem_termo' | 'termo_ausente'
  glId: string | null
  inicio: number | null
  fim: number | null
}

export interface Hipotese {
  id: string
  nivel: Nivel
  /**
   * O nível automático quando o processamento aplicou um nível revisto pelo usuário (pacote 10, `hypothesis.level_auto`): então
   * `nivel` é o do usuário e este é o que a atribuição automática deu. null: o nível não foi revisto (ou o pacote é anterior).
   */
  nivelAutomatico: Nivel | null
  modalidade: Modalidade
  publicacao: string | null
  locator: string | null
  passagemId: string | null
  /** Recorte literal (alemão) que sustenta a hipótese. */
  citacao: string | null
  citacaoInicio: number | null
  citacaoFim: number | null
  /** Item cujo texto contém a citação, quando a hipótese é sobre outro item. */
  citadaDe: string | null
  alvo: AlvoDaHipotese
  termos: TermoDaHipotese[]
  autores: Autor[]
  verificacao: 'recorded' | 'source_checked' | 'passage_checked'
  religiosidade: 'attributed' | 'rejected' | 'open' | 'not_treated' | null
  ancora: AncoraDaHipotese | null
}

export type HipotesesPorNivel = Record<Nivel, Hipotese[]>

export interface Paralelo {
  grau: 'strict' | 'comparable'
  numero: Numero | null
  itemId: string | null
  externo: string | null
  semelhanca: string | null
  locator: string | null
}

/** Item citado no texto do objeto ("(cf. 2)"), por passage_item `mentions`. */
export interface Remissao {
  itemId: string
  /** null: a remissão aponta para um item que não existe no pacote. */
  numero: Numero | null
  origem: string | null
}

export interface Relacoes {
  paralelos: Paralelo[]
  remissoes: Remissao[]
}

export interface ReferenciaBibliografica {
  id: number
  /** A sigla da publicação (`bib_ref.publication`): com o trecho ou o item e o `raw`, identifica a citação entre os pacotes. */
  sigla: string
  itemId: string | null
  categoria: number | null
  bruto: string
  curta: string | null
  paginas: string | null
  obraId: string | null
  resolvida: boolean
  /** Quem resolveu (pacote 10, `bib_ref.resolved_by`): o processamento ('auto') ou uma ligação do usuário ('user'); null antes. */
  resolvidaPor: 'auto' | 'user' | null
  chicago: string | null
  chicagoHtml: string | null
  hipoteseId: string | null
  passagemId: string | null
}

export interface ItemDetalhe {
  numero: Numero
  /** Os itens-membros, na ordem das fontes. */
  itens: ItemDaFonte[]
  /** "TESTE I: 60": a origem do primeiro item. */
  origem: string
  /** Tipo curto (primeira frase do campo 5), para grades e listas. */
  tipo: string | null
  /** Campo 5 inteiro (português quando há). */
  descricao: string | null
  datacoes: Datacao[]
  sitio: SitioDoItem | null
  medidas: Medidas | null
  acervo: string | null
  imagens: Imagem[]
  leituras: Leitura[]
  catalogo: CampoDoCatalogo[]
  hipotesesPorNivel: HipotesesPorNivel
  /** Hipóteses sobre outros alvos sustentadas pelos textos deste objeto. */
  outrasHipoteses: Hipotese[]
  relacoes: Relacoes
  bibliografia: ReferenciaBibliografica[]
  /** Os grupos de cima do objeto (nunca uma subcoleção), na ordem dos itens. */
  grupos: { id: string; titulo: string }[]
  /** «No livro»: onde o objeto está em cada livro, com a subcoleção quando há (schema 9). */
  noLivro: NoLivro[]
}

/** Um lugar do objeto no livro: a obra, o volume, o período, o grupo de cima e a subcoleção (null fora dela ou num pacote 5–8). */
export interface NoLivro {
  publicacao: string
  volume: string
  periodo: string | null
  /** O grupo de cima: `numero` e `subcolecoes` para o número do livro antes do título (decisão 81, `tituloDoGrupo`). */
  grupo: { id: string; titulo: string; tituloDe: string; numero: string | null; subcolecoes: number }
  subcolecao: { id: string; numero: string; titulo: string; tituloDe: string } | null
  /** A linha é de um livro em parágrafos (o GGG): sem período, e a seção com o número e ponto («1. …», Tarefa 26). */
  emParagrafos: boolean
}

/** Um objeto numa grade ou lista (grupo, verbete, obra, sítio). */
export interface ObjetoResumo {
  numero: Numero
  itemId: string
  origem: string
  tipo: string | null
  /** O nome do sítio como o livro (ou a ficha SKC) o tem; as telas mostram o nome de agora (src/sitios/doUsuario.ts). */
  sitio: string | null
  /** O id do sítio (`<SIGLA>-<n>` do livro, ou `SI-…` numa ficha SKC); null sem sítio. */
  sitioId?: string | null
  miniatura: string | null
  display_mode: ModoDeExibicao | null
  /** Objeto da camada do usuário (SKC), vindo da busca: sem itemId do pacote, miniatura nem modo de exibição. */
  skc?: true
  /** Objeto SKC com número provisório (Tarefa 9: ainda não confirmado por uma sincronização). */
  provisorio?: true
  /** Objeto SKC sem número (rascunho): `numero` é o id do registro. */
  semNumero?: true
  /** O SKC, Nr. do objeto SKC (decisão 38), se já tem. */
  nrSkc?: number
  /**
   * O achado do objeto é «do texto» (decisão 90.1): a marca no cartão do sítio e no mapa, com o trecho e o § de onde veio
   * (null quando o achado foi tirado do crédito, sem trecho). Ausente no achado comum.
   */
  achadoDoTexto?: { sigla: string; trechoId: string | null; paragrafo: number | null }
  /**
   * A figura do livro em parágrafos sem tipo (sem campo 5; Tarefa 26, fix 1): o rótulo dela («GGG: 3a», decisão 39), que o cartão
   * mostra na linha do tipo. Fica fora de `tipo`, que é a faceta «Tipo» da Busca. Ausente nos outros objetos.
   */
  figura?: string
}

/**
 * Os §§ (`§N`) de um grupo do livro em parágrafos (Tarefa 26): os trechos dele (`author_group_passage` e a introdução) e, no
 * capítulo, os das seções. null num grupo de livro de catálogo (o IPIAO), que não tem §§.
 */
export interface IntervaloDeParagrafos {
  primeiro: number
  ultimo: number
  total: number
}

export interface Grupo {
  id: string
  publicacao: string
  volume: string
  ordinal: number
  /** Título em português, ou o alemão quando falta. */
  titulo: string
  tituloDe: string
  periodo: string | null
  caminho: string[]
  introducaoId: string | null
  objetos: number
  imagens: number
  hipoteses: number
  capa: { miniatura: string; display_mode: ModoDeExibicao | null } | null
  /** O grupo de cima de uma subcoleção (schema 9); null num grupo de cima. */
  paiId: string | null
  /**
   * Numa subcoleção, o número do sumário («1.1», «1.5–1.8»). No grupo de cima, o número do título do livro ('1') quando
   * ele tem subcoleções (decisão 81), e null nos outros e num pacote 5–8. Subcoleção ou grupo de cima: só por `paiId`.
   */
  numero: string | null
  /** Quantas subcoleções o grupo tem (0 numa subcoleção e num pacote 5–8). */
  subcolecoes: number
  /** Os §§ do grupo no livro em parágrafos (o capítulo conta os das seções); null fora dele. */
  paragrafos: IntervaloDeParagrafos | null
}

/** Uma subcoleção na lista do grupo e nas vizinhas («anterior», «próxima»). */
export interface SubcolecaoResumo {
  id: string
  numero: string
  /** Título em português, ou o alemão quando falta. */
  titulo: string
  tituloDe: string
  objetos: number
  /** Os §§ da seção (o livro em parágrafos); null fora dele. */
  paragrafos: IntervaloDeParagrafos | null
}

export interface TextoDaIntroducao {
  id: string
  texto: string | null
  original: string
  termos: Termo[]
}

export interface GrupoDetalhe extends Omit<Grupo, 'subcolecoes'> {
  /** Os trechos da introdução, em ordem; vazio = sem introdução. */
  introducao: TextoDaIntroducao[]
  itens: ObjetoResumo[]
  /** As subcoleções do grupo, em ordem (vazio numa subcoleção e num pacote 5–8). */
  subcolecoes: SubcolecaoResumo[]
  /** O grupo de cima, numa subcoleção (com `numero` e `subcolecoes` para `tituloDoGrupo`). */
  pai: { id: string; titulo: string; tituloDe: string; numero: string | null; subcolecoes: number } | null
  /** A posição da subcoleção entre as do pai (1 a total); null num grupo de cima. */
  posicao: { n: number; total: number } | null
  anterior: SubcolecaoResumo | null
  proxima: SubcolecaoResumo | null
  /** Os §§ do próprio grupo, com a primeira frase (o português, ou o original), em ordem: «§§ desta seção». Vazio fora do livro em parágrafos. */
  paragrafosDaSecao: { numero: number; frase: string | null }[]
}

export type ContextoDeNavegacao = { tipo: 'grupo'; id: string } | { tipo: 'lista'; ids: string[] }

export interface Vizinhos {
  anterior: Numero | null
  proximo: Numero | null
  /** 1 a total. */
  posicao: number
  total: number
}

export interface VerbeteResumo {
  id: string
  tipo: 'concept' | 'name' | 'technical'
  pt: string | null
  de: string | null
  status: 'proposed' | 'approved'
}

/** Um verbete na lista do Glossário: o resumo, o inglês (a busca da lista) e quantos objetos ele tem. */
export interface VerbeteDaLista extends VerbeteResumo {
  en: string | null
  /** O que o filtro da lista acha além do `pt`, `de` e `en`: árabe, hebraico, as outras línguas e as variantes (fix round 1 da Tarefa 12). */
  formas: string[]
  /** Objetos com hipótese no termo, mais os achados no sítio cujo nome é este verbete (o mesmo de `Verbete.objetos`). */
  objetos: number
}

export interface Verbete extends VerbeteResumo {
  ptTexto: string | null
  ptProposta: string | null
  genero: 'm' | 'f' | null
  numeroGramatical: 'sg' | 'pl' | null
  en: string | null
  ar: string | null
  he: string | null
  variantes: string[]
  /** As formas em outras línguas (pacote 10, `glossary_entry.other_forms`), na ordem; [] sem elas. */
  outras: { lingua: string; forma: string }[]
  definicao: string | null
  pai: { id: string; pt: string | null } | null
  iconclass: { notacao: string; pt: string | null; de: string | null; en: string | null }[]
  sssl: { codigo: string; rotulo: string | null }[]
  hipoteses: Hipotese[]
  objetos: ObjetoResumo[]
}

export interface ObraResumo {
  id: string
  /** Primeira citação curta ("Autor 1999"). */
  curta: string | null
  titulo: string | null
  /** `bib_entry.origin`: a publicação («TESTE I») ou 'SKC' (a obra do usuário publicada, pacote 10). */
  origem: string | null
  /** Objetos que citam a obra. */
  objetos: number
  /** Todas as citações curtas da obra, de todas as publicações, sem repetir (para as obras parecidas da Nova obra). */
  curtas: string[]
  /** O CSL JSON (`bib_entry.csl_json`), ou null. */
  csl: Record<string, unknown> | null
}

export interface Obra extends Omit<ObraResumo, 'objetos'> {
  chicago: string | null
  chicagoHtml: string | null
  /** Sigla → citações curtas como impressas nessa publicação. */
  citadaComo: Record<string, string[]>
  objetos: ObjetoResumo[]
}

export interface SitioResumo {
  id: string
  nome: string
  literal: string
  glId: string | null
  lat: number | null
  lon: number | null
  /** A região: o verbete-pai (`glossary_entry.parent_id`) do verbete que dá nome ao sítio; null quando não há (R18). */
  regiao: { id: string; nome: string } | null
  objetos: number
  /** Dos objetos, quantos têm o achado «do texto» (decisão 90.1; o cartão do mapa). Ausente num sítio do usuário. */
  doTexto?: number
}

export interface Sitio extends Omit<SitioResumo, 'objetos' | 'doTexto'> {
  gradeRef: string | null
  metodo: 'grid' | 'gazetteer' | null
  fonteDaCoordenada: string | null
  notaDaCoordenada: string | null
  nota: string | null
  objetos: ObjetoResumo[]
}

export interface Regiao {
  /** Número no pacote; `RG-…` numa região da camada do usuário (src/imagens-usuario/regioes.ts). */
  id: number | string
  elementoId: string
  /** Rótulo em português, ou o do texto quando falta. */
  elemento: string
  elementoDe: string
  /** Como no banco: `<polygon points="x,y …"/>`, coordenadas de 0 a 1 (R4). */
  selector: string
  pontos: [number, number][]
}

/** Um trecho do texto da fonte, como impresso (o alemão do livro; no livro digitalizado, o corrigido), e o id dele no pacote. */
export interface TrechoDaFonte {
  id: string
  texto: string
}

/**
 * Uma correção do texto digitalizado (`correcao_de_leitura`, pacote 11): o trecho [inicio, fim) do texto corrigido, como foi
 * lido (`lido`) e a regra (PL, AYIN, ACENTO…). Nas consultas, `inicio` e `fim` já vêm em posições UTF-16 de `texto` (o pacote
 * os grava em code points; `correcoesEmUtf16`), prontos para `slice`.
 */
export interface CorrecaoDeLeitura {
  inicio: number
  fim: number
  lido: string
  regra: string
}

/** Um trecho (texto corrido ou nota) de um § do livro em parágrafos, nas três línguas. */
export interface TrechoDoParagrafo extends TrechoDaFonte {
  /** `passage.ordinal`: a posição do trecho no §; numa nota, o número da nota. */
  ordinal: number
  pagina: number | null
  /** O português renderizado (sem marcadores; `unit_pt_render`); null sem tradução. */
  portugues: string | null
  /** Os verbetes no português, em CODE POINTS (como em `Leitura.termos`). */
  termos: Termo[]
  estado: EstadoDaTraducao | null
  desatualizada: boolean
  /** O inglês da tradução (o GGIG) alinhado a este trecho (`aligned_passage`, noutro banco); vários juntos por espaço; null sem. */
  ingles: string | null
  /** As correções de leitura do trecho, em UTF-16 de `texto`, na ordem do texto. */
  correcoes: CorrecaoDeLeitura[]
  /** As correções de leitura do inglês (no banco da tradução), em UTF-16 de `ingles` (o juntado), na ordem do texto. */
  correcoesDoIngles: CorrecaoDeLeitura[]
  /** A página do inglês alinhado (`passage.page` no banco da tradução; a primeira, quando vários se juntam); null sem. */
  paginaDoIngles: number | null
}

/** Um grupo da autora no caminho do § (o capítulo e a seção), com o título em português, para o link. */
export interface GrupoNoCaminho {
  id: string
  /** «I. Época de teste…» (o grupo de cima, `tituloDoGrupo`), «1. Selos de prova…» (a subcoleção, com o número). */
  rotulo: string
}

/** A seção em que o § está (o grupo mais interno: a subcoleção ou, fora dela, o capítulo) e os §§ dela, em ordem (decisão 91, a8). */
export interface SecaoDoParagrafo {
  id: string
  /** É uma subcoleção («da seção»), não o grupo de cima («do capítulo»). */
  subcolecao: boolean
  paragrafos: number[]
}

/** O § vizinho: o número e a primeira frase (do português, ou do original sem tradução). */
export interface VizinhoDoParagrafo {
  numero: number
  frase: string | null
}

/** Uma figura que o § cita (`passage_item 'mentions'`): o item, o objeto dele e o número e a letra no livro (os links do texto). */
export interface ReferenciaDoParagrafo {
  itemId: string
  objeto: Numero
  numero: number
  sufixo: string
}

/** Um § do livro em parágrafos (rota `/paragrafo/:sigla/:numero`). */
export interface ParagrafoDetalhe {
  sigla: string
  numero: number
  /** O ano da publicação (o «TESTEG 2021» do trilho do alemão); null sem. */
  ano: number | null
  /** A tradução inglesa aberta (`publication.translation_of`, o GGIG); null sem. */
  traducao: { sigla: string; ano: number | null } | null
  /**
   * O caminho do grupo (a subcoleção, quando há) em que o § está, do livro ao título mais interno, em PORTUGUÊS (Tarefa 25):
   * a obra e os `grupos`; [] fora de grupo.
   */
  caminho: string[]
  /** Os grupos do caminho, do de cima ao mais interno, para os links. */
  grupos: GrupoNoCaminho[]
  /** A seção do § e os §§ dela; null fora de grupo. */
  secao: SecaoDoParagrafo | null
  /** As figuras que o § cita, item por item (mais de um item pode ser o mesmo objeto). */
  referencias: ReferenciaDoParagrafo[]
  /** O texto corrido, em ordem. */
  trechos: TrechoDoParagrafo[]
  /** As notas do §, em ordem. */
  notas: TrechoDoParagrafo[]
  /** As figuras citadas no § (`passage_item 'mentions'`), uma por objeto, na ordem das fontes. */
  figuras: ObjetoResumo[]
  anterior: VizinhoDoParagrafo | null
  seguinte: VizinhoDoParagrafo | null
}

/** Um § que cita uma figura (`paragrafosQueCitam`): «Discutida em». */
export interface ParagrafoQueCita {
  sigla: string
  numero: number
  /** O primeiro trecho do § que cita a figura. */
  trechoId: string
  /** A frase do § que cita a figura (decisão 91, a3). */
  frase: string
  /** 'pt': a frase é do português; 'original': do texto do livro (o trecho não tem tradução, ou ela não deixou achar a frase). */
  lingua: 'pt' | 'original'
  /** O caminho do §, em português, como `ParagrafoDetalhe.caminho` (a obra primeiro). */
  caminho: string[]
}

/**
 * Um livro em parágrafos (o GGG) ou a tradução dele (o GGIG) como obra da Bibliografia (Tarefa 26): a obra igual da
 * Bibliografia comum (mesmo título e ano), ou uma entrada própria `LIVRO-<sigla>`, com os números do livro.
 */
export interface LivroNaBibliografia {
  sigla: string
  /** O id na Bibliografia (a rota `/obra/:id`): o `bib_entry` igual, ou `LIVRO-<sigla>`. */
  obraId: string
  /** «Autora – Autor 2010»: os sobrenomes e o ano do CSL da publicação. */
  curta: string
  titulo: string
  csl: Record<string, unknown> | null
  /** A sigla do original, numa tradução (`publication.translation_of`). */
  traducaoDe: string | null
  /** A sigla da tradução aberta do livro. */
  traducao: string | null
  /** Os capítulos (os grupos de cima), os §§ (`§N`) e as figuras do próprio livro. */
  capitulos: number
  paragrafos: number
  figuras: number
  /** O primeiro § (o «Ler o § 1»); null sem §§. */
  primeiro: number | null
}
