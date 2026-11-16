/**
 * O rascunho da «Nova obra» e de «Editar a obra», antes de «Salvar» (fix round 1 da Tarefa 10, R1). Como o da nova
 * hipótese (src/hipoteses/rascunho.ts): a cada mudança o formulário inteiro vai ao `localStorage`, de forma SÍNCRONA (o
 * Chromium corta escritas no IndexedDB ao fechar a página; o localStorage, na mesma tarefa, não). Tudo em try/catch: sem
 * armazenamento (modo privado), o formulário funciona, só não guarda.
 *
 * - Um rascunho para a obra nova (`iconodb:nova-obra`, com a citação a ligar, `?citacao=`, e a volta) e um por obra
 *   editada (`iconodb:editar-obra:<id>`).
 * - Sair sem salvar (o Voltar, o gesto do iPhone, a barra, Esc, recarregar, o PWA tirado da memória) guarda o rascunho; a
 *   tela, aberta de novo, o traz de volta com «Rascunho recuperado» e «Descartar o rascunho».
 * - «Salvar», «Cancelar» e um «É esta» que deu certo apagam o rascunho.
 * - `originais`: os nomes como vieram (colados ou gravados), para não perder `suffix` e partículas.
 * - `reserva`: o id reservado pelo primeiro «Salvar»: um segundo «Salvar» depois de recarregar não cria outra obra.
 * - DUAS ABAS: a chave é a mesma; o formulário aberto ouve o evento `storage` e, se outra aba grava outro conteúdo, para de
 *   gravar e pergunta qual fica (como NovoSitio e a nova hipótese).
 */
import { eIdDeLigacao } from './chave'
import { formularioVazio, type FormularioDaObra, type TipoDoFormulario } from './formulario'
import { RE_OBRA_SKC } from './modelo'
import type { Json } from '../usuario/eventos'

export interface RascunhoDaObra {
  /** O id da obra editada; null na obra nova. */
  editando: string | null
  f: FormularioDaObra
  curtaManual: boolean
  originais: { author?: Json; editor?: Json }
  /** A citação a ligar ao salvar (`?citacao=`), como ela se mostra, e a volta. Só na obra nova. */
  citacao: string | null
  rotuloDaCitacao: string | null
  volta: string | null
  reserva: string | null
  salvoEm: number
}

export const CHAVE_DA_NOVA_OBRA = 'iconodb:nova-obra'
const PREFIXO_DA_EDICAO = 'iconodb:editar-obra:'
export const chaveDoRascunhoDaObra = (editando: string | null) => (editando ? `${PREFIXO_DA_EDICAO}${editando}` : CHAVE_DA_NOVA_OBRA)

const TIPOS: readonly (TipoDoFormulario | '')[] = ['', 'book', 'article-journal', 'chapter', 'volume', 'document']
const CAMPOS = Object.keys(formularioVazio()).filter((c) => c !== 'tipo') as (keyof FormularioDaObra)[]

/** O conteúdo do formulário, para comparar (o que a pessoa preencheu, sem `reserva` nem `salvoEm`). */
export const conteudoDoFormulario = (f: FormularioDaObra, curtaManual: boolean) => JSON.stringify([f, curtaManual ? f.curta : null])

/** Há algo preenchido? */
export const formularioTemConteudo = (f: FormularioDaObra) => f.tipo !== '' || CAMPOS.some((c) => f[c].trim() !== '')

const voltaValida = (v: unknown): string | null => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : null)

export function lerRascunhoDaObra(editando: string | null): RascunhoDaObra | null {
  let bruto: string | null = null
  try {
    bruto = localStorage.getItem(chaveDoRascunhoDaObra(editando))
  } catch {
    return null
  }
  if (!bruto) return null
  try {
    const x = JSON.parse(bruto) as Record<string, unknown>
    if ((x.editando ?? null) !== editando) return null
    const fb = (x.f ?? {}) as Record<string, unknown>
    const f = formularioVazio()
    f.tipo = TIPOS.includes(fb.tipo as TipoDoFormulario) ? (fb.tipo as TipoDoFormulario) : ''
    for (const c of CAMPOS) if (typeof fb[c] === 'string') (f as unknown as Record<string, string>)[c] = fb[c]
    const o = (x.originais ?? {}) as Record<string, unknown>
    const citacao = typeof x.citacao === 'string' && eIdDeLigacao(x.citacao) && editando === null ? x.citacao : null
    return {
      editando,
      f,
      curtaManual: x.curtaManual === true,
      originais: { ...(Array.isArray(o.author) ? { author: o.author as Json } : {}), ...(Array.isArray(o.editor) ? { editor: o.editor as Json } : {}) },
      citacao,
      rotuloDaCitacao: citacao && typeof x.rotuloDaCitacao === 'string' ? x.rotuloDaCitacao : citacao,
      volta: voltaValida(x.volta),
      reserva: typeof x.reserva === 'string' && RE_OBRA_SKC.test(x.reserva) && editando === null ? x.reserva : null,
      salvoEm: typeof x.salvoEm === 'number' ? x.salvoEm : 0,
    }
  } catch {
    return null
  }
}

export function guardarRascunhoDaObra(r: RascunhoDaObra): void {
  try {
    localStorage.setItem(chaveDoRascunhoDaObra(r.editando), JSON.stringify({ ...r, salvoEm: Date.now() }))
  } catch {
    // Sem armazenamento: o formulário segue, só não sobrevive a um recarregar.
  }
}

export function apagarRascunhoDaObra(editando: string | null): void {
  try {
    localStorage.removeItem(chaveDoRascunhoDaObra(editando))
  } catch {
    // nada a apagar
  }
}
