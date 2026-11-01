/**
 * Os tipos que as consultas devolvem às telas. Objetos simples, sem SQL.
 *
 * Deslocamentos (`inicio`/`fim` de termos, âncoras e citações) ficam em CODE POINTS,
 * como o pipeline em Python os grava (R49); quem desenha o texto converte para UTF-16
 * (Tarefa 8, `codepointsParaUtf16`).
 */

/** O "número" de um objeto (CA00023); um item sem objeto atribuído usa o id do item. */
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
  nivel: Nivel
  modalidade: Modalidade
}

/** A leitura de uma fonte (uma por item-membro do objeto que tem descrição de catálogo). */
export interface Leitura {
  /** Rótulo da fonte, como "TESTE I, 2". */
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
  tipo: 'catalog' | 'intro_figure'
  /** "TESTE I, 2" ou "TESTE I, Abb. 1". */
  origem: string
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
  /** Forma em uso (verbete-nome em português) ou, sem verbete, como impresso. */
  nome: string
  literal: string
  glId: string | null
  lat: number | null
  lon: number | null
  certeza: Certeza
  /** O contexto do achado (assertion `context`), como impresso. */
  contexto: string | null
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
  itemId: string | null
  categoria: number | null
  bruto: string
  curta: string | null
  paginas: string | null
  obraId: string | null
  resolvida: boolean
  chicago: string | null
  chicagoHtml: string | null
  hipoteseId: string | null
  passagemId: string | null
}

export interface ItemDetalhe {
  numero: Numero
  /** Os itens-membros, na ordem das fontes. */
  itens: ItemDaFonte[]
  /** "TESTE I, 60": a origem do primeiro item. */
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
  grupos: { id: string; titulo: string }[]
}

/** Um objeto numa grade ou lista (grupo, verbete, obra, sítio). */
export interface ObjetoResumo {
  numero: Numero
  itemId: string
  origem: string
  tipo: string | null
  sitio: string | null
  miniatura: string | null
  display_mode: ModoDeExibicao | null
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
}

export interface TextoDaIntroducao {
  id: string
  texto: string | null
  original: string
  termos: Termo[]
}

export interface GrupoDetalhe extends Grupo {
  introducao: TextoDaIntroducao | null
  itens: ObjetoResumo[]
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
  /** Objetos que citam a obra. */
  objetos: number
}

export interface Obra extends Omit<ObraResumo, 'objetos'> {
  chicago: string | null
  chicagoHtml: string | null
  /** Sigla → citações curtas como impressas nessa publicação. */
  citadaComo: Record<string, string[]>
  origem: string | null
  csl: Record<string, unknown> | null
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
}

export interface Sitio extends Omit<SitioResumo, 'objetos'> {
  gradeRef: string | null
  metodo: 'grid' | 'gazetteer' | null
  fonteDaCoordenada: string | null
  notaDaCoordenada: string | null
  nota: string | null
  objetos: ObjetoResumo[]
}

export interface Regiao {
  id: number
  elementoId: string
  /** Rótulo em português, ou o do texto quando falta. */
  elemento: string
  elementoDe: string
  /** Como no banco: `<polygon points="x,y …"/>`, coordenadas de 0 a 1 (R4). */
  selector: string
  pontos: [number, number][]
}
