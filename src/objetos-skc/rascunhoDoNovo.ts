/**
 * O rascunho do formulário NovoObjeto, antes do primeiro "Salvar" (antes disso o registro não existe, e `useCampoSalvo`
 * não serve: veja a Tarefa 7). Mesma ideia da rede de segurança da Tarefa 6 (src/usuario/emergencia.ts): a cada mudança
 * o formulário inteiro vai ao `localStorage` de forma SÍNCRONA (o Chromium corta escritas no IndexedDB ao fechar a
 * página; o localStorage, na mesma tarefa, não). Os arquivos das imagens (grandes demais para o localStorage) vão ao
 * IndexedDB (loja `config`, chave `rascunho:novo-objeto:<chave>`) assim que escolhidos. Ao abrir a tela, o rascunho
 * volta; "Salvar" e "Descartar o rascunho" o apagam. Um só rascunho por aparelho (é uma tela por vez).
 *
 * Tudo em try/catch: num modo privado sem armazenamento a tela funciona, só não guarda.
 */
import type { Modo } from '../imagens-usuario/modo'
import { gravarConfig, lerConfig } from '../usuario/diarioLocal'
import { CAMPOS_DE_TEXTO, fichaVazia, type FichaSkc } from './modelo'
import { periodoValido } from './numeracao'

export const CHAVE_DO_RASCUNHO = 'iconodb:novo-objeto'
const PREFIXO_DOS_ARQUIVOS = 'rascunho:novo-objeto:'

export interface ImagemDoRascunho {
  chave: string
  nome: string
  tipo: Modo | null
  legenda: string
  credito: string
  principal: boolean
}

export interface RascunhoDoNovo {
  ficha: FichaSkc
  /** A pessoa escolheu "Ainda não sei" (sem período de propósito). */
  naoSei: boolean
  imagens: ImagemDoRascunho[]
  /**
   * O id do objeto já gravado (o `criar` passou) quando o salvar foi interrompido (a página fechou enquanto as imagens
   * eram guardadas). Com ele, o rascunho NUNCA cria outro objeto: só guarda nele as imagens que faltam.
   */
  criado: string | null
  /** "Novo sítio «…»" escolhido no campo Sítio (Tarefa 12): salvar cria o sítio com o nome da ficha, na mesma gravação do objeto. */
  sitioNovo: boolean
  salvoEm: number
}

const texto = (x: unknown) => (typeof x === 'string' ? x : '')

export function lerRascunhoDoNovo(): RascunhoDoNovo | null {
  let bruto: string | null = null
  try {
    bruto = localStorage.getItem(CHAVE_DO_RASCUNHO)
  } catch {
    return null
  }
  if (!bruto) return null
  try {
    const x = JSON.parse(bruto) as Partial<RascunhoDoNovo> & { ficha?: Record<string, unknown> }
    const f = fichaVazia()
    const origem: Record<string, unknown> = x.ficha ?? {}
    for (const c of CAMPOS_DE_TEXTO) f[c] = texto(origem[c])
    f.periodo = periodoValido(origem.periodo) ? origem.periodo : null
    f.origemTipo = origem.origemTipo === 'achado' ? 'achado' : 'publicacao'
    const imagens = Array.isArray(x.imagens)
      ? x.imagens
          .filter((i): i is ImagemDoRascunho => !!i && typeof i === 'object' && typeof (i as ImagemDoRascunho).chave === 'string')
          .map((i) => ({
            chave: i.chave,
            nome: texto(i.nome),
            tipo: i.tipo === 'traco' || i.tipo === 'tons' ? i.tipo : null,
            legenda: texto(i.legenda),
            credito: texto(i.credito),
            principal: i.principal === true,
          }))
      : []
    const criado = typeof x.criado === 'string' && /^OB-[a-z0-9]{8}-[1-9][0-9]*$/.test(x.criado) ? x.criado : null
    return { ficha: f, naoSei: x.naoSei === true, imagens, criado, sitioNovo: x.sitioNovo === true && f.sitio === '' && f.sitioNome.trim() !== '', salvoEm: typeof x.salvoEm === 'number' ? x.salvoEm : 0 }
  } catch {
    return null
  }
}

/** Há algo de verdade no rascunho (um texto, um período, uma imagem)? */
export function rascunhoTemConteudo(r: Pick<RascunhoDoNovo, 'ficha' | 'naoSei' | 'imagens'> & { criado?: string | null }): boolean {
  return !!r.criado || r.naoSei || r.ficha.periodo !== null || r.imagens.length > 0 || CAMPOS_DE_TEXTO.some((c) => r.ficha[c].trim() !== '') || r.ficha.origemTipo === 'achado'
}

export function guardarRascunhoDoNovo(r: Omit<RascunhoDoNovo, 'salvoEm'>): void {
  try {
    if (!rascunhoTemConteudo(r)) localStorage.removeItem(CHAVE_DO_RASCUNHO)
    else localStorage.setItem(CHAVE_DO_RASCUNHO, JSON.stringify({ ...r, salvoEm: Date.now() }))
  } catch {
    // Sem armazenamento (modo privado, cota): a tela segue; só não guarda.
  }
}

export async function apagarRascunhoDoNovo(): Promise<void> {
  const r = lerRascunhoDoNovo()
  try {
    localStorage.removeItem(CHAVE_DO_RASCUNHO)
  } catch {
    // nada
  }
  for (const i of r?.imagens ?? []) await apagarArquivoDoRascunho(i.chave)
}

/** Guarda o arquivo escolhido (os bytes; um File não vai inteiro ao IndexedDB em todo navegador). */
export async function guardarArquivoDoRascunho(chave: string, arquivo: File): Promise<void> {
  try {
    const bytes = await arquivo.arrayBuffer()
    await gravarConfig(PREFIXO_DOS_ARQUIVOS + chave, { nome: arquivo.name, tipo: arquivo.type, bytes })
  } catch {
    // Sem espaço: a imagem fica só na tela (e na memória) até salvar.
  }
}

export async function lerArquivoDoRascunho(chave: string): Promise<File | null> {
  try {
    const x = await lerConfig<{ nome?: unknown; tipo?: unknown; bytes?: unknown }>(PREFIXO_DOS_ARQUIVOS + chave)
    // Pela marca do tipo, e não `instanceof`: o valor lido do IndexedDB pode vir de outro realm (jsdom, iframes).
    if (!x || Object.prototype.toString.call(x.bytes) !== '[object ArrayBuffer]') return null
    return new File([x.bytes as ArrayBuffer], texto(x.nome) || 'imagem', { type: texto(x.tipo) })
  } catch {
    return null
  }
}

export async function apagarArquivoDoRascunho(chave: string): Promise<void> {
  try {
    await gravarConfig(PREFIXO_DOS_ARQUIVOS + chave, undefined)
  } catch {
    // nada
  }
}
