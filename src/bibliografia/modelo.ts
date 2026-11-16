/**
 * As obras do usuário (Parte 2C, bloco 3, spec §5.2). Puro: sem React, sem IndexedDB.
 *
 * FORMATO DOS CAMPOS (congelado: o `user-import` do processamento os lê, `iconodb/usuario_import.py`, `obras_do_usuario`).
 *
 * `obra`, reg = o id da obra.
 * - Obra NOVA do usuário: `BIB-<aparelho>-<n>` (`^BIB-[a-z0-9]{8}-[1-9][0-9]*$`), do gerador de ids de sempre
 *   (`proximoId('BIB')`). As obras dos livros são `BIB-` + 6 ou mais dígitos (`^BIB-[0-9]{6,}$`).
 * - `criar` (`camposDaObraNova`):
 *   - `csl` (objeto): o CSL JSON da obra, o mesmo formato de `bib_entry.csl_json`, só com os campos que o formulário tem.
 *     Precisa de `type` e `title` não vazios (senão o processamento não a formata e ela fica na camada). Sem `id`: o
 *     processamento dá o `BIB-<dígitos>` (`csl_json = {...csl, id}`).
 *   - `curta` (texto): a citação curta («Imaginária 2010»), normalizada como as formas (`normalizarForma`). Pode ser vazia.
 * - Editar: um `alterar` com o campo que mudou (`csl` inteiro, ou `curta`). Vale a última escrita de cada campo.
 *   Depois de publicada, a edição pode ir no `BIB-<aparelho>-<n>` ou num registro `obra` com o `BIB-<dígitos>`: o
 *   processamento lê as duas (Tarefa 3, ressalva 5).
 * - `excluir` / `restaurar`: a marca de sempre. As citações ligadas a uma obra excluída voltam a «não resolvidas»
 *   (`obraLigada`, src/revisao/ligacoes.ts) e voltam ligadas com «Restaurar» (foco 3).
 * - «É esta» ao editar (`trocarPorEsta`, src/bibliografia/operacoes.ts): na mesma gravação do `excluir`, um `alterar` com
 *   `trocadaPor` (o id da outra obra), `trocadaPorRotulo` (o nome dela) e `movidos` (`{ligacoes: [ids], objetos: [{id,
 *   obra, obraRotulo}]}`: as ligações e os objetos SKC que passaram para a outra, com o que os objetos tinham antes).
 *   `restaurarObra` os devolve e grava `trocadaPor: null`. O processamento só lê `csl` e `curta` (`dados_da_obra`): estes
 *   campos ficam na camada.
 * - Leitura (`lerObra`): um registro sem `csl` objeto não é uma obra que se mostre (null); `curta` que não é texto = ''.
 */
import { normalizarForma } from '../glossario/modelo'
import type { Campos, Json } from '../usuario/eventos'
import type { Registro } from '../usuario/fusao'

export const RE_OBRA_SKC = /^BIB-[a-z0-9]{8}-[1-9][0-9]*$/
export const RE_OBRA_DO_LIVRO = /^BIB-[0-9]{6,}$/

export const eObraSkc = (id: unknown): id is string => typeof id === 'string' && RE_OBRA_SKC.test(id)
export const eObraDoLivro = (id: unknown): id is string => typeof id === 'string' && RE_OBRA_DO_LIVRO.test(id)

/** O CSL JSON de uma obra (o de `bib_entry.csl_json`): `type` e `title`, e o resto dos campos do CSL. */
export type Csl = { type: string; title: string; [campo: string]: Json }

export interface ObraSkc {
  id: string
  csl: Csl
  /** A citação curta («Imaginária 2010»); '' sem ela. */
  curta: string
  /** hlc do primeiro evento. */
  criadoEm: string
  excluido: boolean
}

const objetoSimples = (x: unknown): x is { [campo: string]: Json } =>
  typeof x === 'object' && x !== null && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null)
const textoNaoVazio = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

/** O CSL que o processamento formata: um objeto com `type` e `title` não vazios (`_chicago` de `usuario_import.py`). */
export function eCslValido(x: unknown): x is Csl {
  return objetoSimples(x) && textoNaoVazio(x.type) && textoNaoVazio(x.title)
}

/**
 * A obra de um registro `obra`, ou null se ele não tem um CSL que se formate (um registro só com a `curta`, de uma edição de
 * uma obra publicada; um CSL quebrado).
 */
export function lerObra(r: Registro): ObraSkc | null {
  if (r.tipo !== 'obra') return null
  const csl = r.campos.csl
  if (!eCslValido(csl)) return null
  const curta = typeof r.campos.curta === 'string' ? normalizarForma(r.campos.curta) : ''
  return { id: r.id, csl, curta, criadoEm: r.criadoEm, excluido: r.excluido }
}

/** Os campos do `criar` de uma obra nova: o CSL sem o `id` e a citação curta normalizada. Lança se o CSL não serve. */
export function camposDaObraNova(csl: Csl, curta: string): Campos {
  if (!eCslValido(csl)) throw new Error('obra sem tipo ou sem título')
  const { id: _id, ...semId } = csl
  return { csl: JSON.parse(JSON.stringify(semId)) as Json, curta: normalizarForma(curta) }
}

/** O que «É esta» ao editar moveu da obra para outra (`trocarPorEsta`), para «Restaurar» devolver; null sem troca. */
export interface TrocaDaObra {
  para: string
  /** O nome da outra obra quando a troca foi feita. */
  rotulo: string
  ligacoes: string[]
  objetos: { id: string; obra: string; obraRotulo: string }[]
}

export function lerTroca(r: Registro): TrocaDaObra | null {
  const para = r.campos.trocadaPor
  if (r.tipo !== 'obra' || typeof para !== 'string' || para === '') return null
  const m = objetoSimples(r.campos.movidos) ? r.campos.movidos : {}
  const ligacoes = Array.isArray(m.ligacoes) ? m.ligacoes.filter((x): x is string => typeof x === 'string') : []
  const objetos = Array.isArray(m.objetos)
    ? m.objetos.flatMap((o) =>
        objetoSimples(o) && typeof o.id === 'string' ? [{ id: o.id, obra: typeof o.obra === 'string' ? o.obra : '', obraRotulo: typeof o.obraRotulo === 'string' ? o.obraRotulo : '' }] : [],
      )
    : []
  return { para, rotulo: typeof r.campos.trocadaPorRotulo === 'string' && r.campos.trocadaPorRotulo !== '' ? r.campos.trocadaPorRotulo : para, ligacoes, objetos }
}
