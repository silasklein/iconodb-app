/**
 * O registro `objeto` (objeto SKC) e como ele se lê. PURO.
 *
 * FORMATO (congelado; o porte para Python da Tarefa 16 lê exatamente isto). reg = `OB-<aparelho>-<n>`.
 * `criar` (pela tela NovoObjeto) e `alterar` (pela "Editar a ficha", um campo por evento) escrevem:
 *   periodo        código de PERIODOS (numeracao.ts) ou null ("Ainda não sei": rascunho sem número). É o PEDIDO de número:
 *                  a hora da escrita que vale (o hlc) ordena os pedidos. Depois de confirmado o número, a tela não o muda.
 *   pedido         o número que a tela mostrou ao salvar (ou ao escolher o período de um rascunho); só para o aviso
 *                  "o número mudou". Nunca decide número.
 *   numero         TESTEMUNHA da confirmação: escrita só pela sincronização depois que o número entrou num estado.json
 *                  (veja numeracao.ts). Nenhuma tela a escreve. Se um livro novo toma o número confirmado (decisão 48), a
 *                  consolidação escreve uma testemunha NOVA com o número que o objeto recebeu.
 *   numeroTomadoPeloLivro   o número confirmado que um objeto do livro tomou, no mesmo `alterar` da testemunha nova
 *                  (decisão 48); só para o aviso. Nunca decide número.
 *   pedidoNrSkc    o SKC, Nr. (decisão 38) que a tela mostrou ao salvar ou ao dar o período ("13"); só para o aviso.
 *   nrSkc          TESTEMUNHA do SKC, Nr. confirmado ("12"), no mesmo `alterar` que `numero`. Nenhuma tela a escreve.
 *   reserva        só nos registros que a Tarefa 16 escreve para reservar números de um livro (texto: a sigla do volume).
 *                  Um registro com reserva não é objeto SKC: não aparece em lista nenhuma; só ocupa o número.
 *   titulo         "Tipo e descrição curta" (vira o título: "Peça de teste. Cobre.").
 *   sitio          id do sítio: do pacote (o id de `sitios()`) ou de um sítio SKC (`SI-…`); "" sem sítio.
 *   sitioNome      o nome do sítio como a pessoa o escolheu ou escreveu (o que se mostra se o id não resolver).
 *   datacao        texto livre, como na fonte ("4500–4000 aEC").
 *   material, acervo, inventario   texto livre.
 *   altura, largura, espessura     texto livre em cm, vírgula decimal ("4,5"; "Ø 4,5" na altura para diâmetro).
 *   origemTipo     'publicacao' | 'achado'.
 *   obra           id `BIB-…` da Bibliografia, ou "" (referência livre).
 *   obraRotulo     o rótulo da obra como aparece ("Autor 2025", ou o texto livre).
 *   pagina, figura texto livre.
 *   achado         a nota do achado recente / comunicação pessoal (quem, quando, onde).
 *   leitura        a leitura SKC, texto com links `[[ref|rótulo]]` (Tarefa 6).
 * Valores ausentes, null ou que não são texto contam como "". Campos desconhecidos são ignorados.
 */
import type { Json } from '../usuario/eventos'
import type { Registro } from '../usuario/fusao'
import { periodoValido, reservaDe, type CodigoDePeriodo } from './numeracao'

export const CAMPOS_DE_TEXTO = [
  'titulo',
  'sitio',
  'sitioNome',
  'datacao',
  'material',
  'altura',
  'largura',
  'espessura',
  'acervo',
  'inventario',
  'obra',
  'obraRotulo',
  'pagina',
  'figura',
  'achado',
  'leitura',
] as const
export type CampoDeTexto = (typeof CAMPOS_DE_TEXTO)[number]

export type TipoDeOrigem = 'publicacao' | 'achado'

export interface FichaSkc extends Record<CampoDeTexto, string> {
  periodo: CodigoDePeriodo | null
  origemTipo: TipoDeOrigem
}

export interface ObjetoSkc extends FichaSkc {
  id: string
  reserva: string | null
  excluido: boolean
  criadoEm: string
}

const t = (v: Json | undefined): string => (typeof v === 'string' ? v : '')

export function lerFicha(campos: Readonly<Record<string, Json>>): FichaSkc {
  const ficha = {} as FichaSkc
  for (const c of CAMPOS_DE_TEXTO) ficha[c] = t(campos[c])
  ficha.periodo = periodoValido(campos.periodo) ? campos.periodo : null
  ficha.origemTipo = campos.origemTipo === 'achado' ? 'achado' : 'publicacao'
  return ficha
}

export function lerObjeto(r: Registro): ObjetoSkc {
  return { ...lerFicha(r.campos), id: r.id, reserva: reservaDe(r), excluido: r.excluido, criadoEm: r.criadoEm }
}

/** Um objeto SKC de verdade (não uma reserva de livro: nem campo `reserva`, nem id `OB-pipeline-…`; veja `reservaDe`). */
export const eObjetoSkc = (r: Registro): boolean => reservaDe(r) === null

/** A ficha vazia do formulário. */
export function fichaVazia(): FichaSkc {
  const ficha = {} as FichaSkc
  for (const c of CAMPOS_DE_TEXTO) ficha[c] = ''
  ficha.periodo = null
  ficha.origemTipo = 'publicacao'
  return ficha
}

const limpo = (s: string) => s.replace(/\s+/g, ' ').trim()

/** "[Artigo 2025], p. 12, fig. 3" ou "Achado recente: museu de Haifa, 2026". "" sem nada. */
export function textoDaOrigem(f: Pick<FichaSkc, 'origemTipo' | 'obraRotulo' | 'pagina' | 'figura' | 'achado'>): string {
  if (f.origemTipo === 'achado') {
    const nota = limpo(f.achado)
    return nota ? `Achado recente: ${nota}` : 'Achado recente'
  }
  const partes = [limpo(f.obraRotulo)]
  if (limpo(f.pagina)) partes.push(`p. ${limpo(f.pagina)}`)
  if (limpo(f.figura)) partes.push(`fig. ${limpo(f.figura)}`)
  return partes.filter(Boolean).join(', ')
}

/** "4,5 × 3 × 1 cm" (as que existem); "" sem nenhuma. */
export function textoDasMedidas(f: Pick<FichaSkc, 'altura' | 'largura' | 'espessura'>): string {
  const m = [f.altura, f.largura, f.espessura].map(limpo).filter(Boolean)
  return m.length ? `${m.join(' × ')} cm` : ''
}

/** O título: "Tipo e descrição curta", ou "Objeto sem título". */
export const tituloDe = (f: Pick<FichaSkc, 'titulo'>): string => limpo(f.titulo) || 'Objeto sem título'

/** Tipo curto (para cartões e o filtro Tipo): a primeira frase do título, sem o ponto final. */
export function tipoCurtoDe(f: Pick<FichaSkc, 'titulo'>): string | null {
  const titulo = limpo(f.titulo)
  if (!titulo) return null
  return (titulo.split(/(?<=\.)\s+/)[0] ?? titulo).replace(/\.$/, '').trim() || null
}

/** Os campos de um `criar` a partir do formulário (só texto; o que está vazio vai como ""). */
export function camposDoCriar(f: FichaSkc, pedido: string | null, pedidoNrSkc: string | null = null): Record<string, Json> {
  const campos: Record<string, Json> = { periodo: f.periodo, pedido, pedidoNrSkc, origemTipo: f.origemTipo }
  for (const c of CAMPOS_DE_TEXTO) campos[c] = c === 'leitura' ? f[c].replace(/\s+$/, '') : f[c].trim()
  return campos
}
