/**
 * Ler uma cópia para restaurar (2C, bloco 1, Tarefa 7; especificação §6.2), SEM mudar nada. Aceita a cópia de segurança
 * (`iconodb-copia-….json`) e a cópia completa (`iconodb-copia-completa-….zip`, com o `copia.json` dentro e as fotos em
 * `imagens/<id>/<nome>`). Quem decide é o conteúdo (um .zip começa por "PK"), não o nome do arquivo.
 *
 * Validação, a mesma do que vem do Dropbox: formato `iconodb-copia` v1; cada evento por `validarEvento`; `base` e `estado` por
 * `validarBase`, sem nenhum registro recusado; e a regra da cópia, `fundir(eventos, base)` igual a `estado` (pelo estado
 * canônico). Erros (`ErroDaCopia`):
 * - `nao-e-copia`: nem JSON nem .zip (o primeiro caractere que não é branco não é «{»), outro JSON, ou um .zip
 *   sem `copia.json`;
 * - `versao-nova`: `versao` maior que 1 (feita por um app mais novo);
 * - `danificada`: o .zip ou o `copia.json` estragados, ou a cópia não passa na validação;
 * - `ilegivel`: o navegador não conseguiu ler o arquivo, ou um .json com mais de 50 MB (não é lido inteiro).
 *
 * Memória: o `copia.json` é lido como texto (é JSON); as fotos continuam fatias do arquivo (`lerZip`), abertas sob demanda.
 */
import { validarConfirmados } from '../objetos-skc/numeracao'
import { validarEvento, type Evento } from '../usuario/eventos'
import { FORMATO_DA_COPIA, type CopiaDeSeguranca } from '../usuario/exportar'
import { estadoCanonico, fundir, validarBase, type EstadoConsolidado } from '../usuario/fusao'
import { ErroDeZip, lerZip } from './zip'

export type MotivoDoErroDaCopia = 'nao-e-copia' | 'versao-nova' | 'danificada' | 'ilegivel'

/** O que a tela diz de cada erro (especificação §6.2). Nada é alterado em nenhum deles. */
export const TEXTOS_DOS_ERROS: Record<MotivoDoErroDaCopia, string> = {
  'nao-e-copia': 'Este arquivo não é uma cópia do IconoDB.',
  'versao-nova': 'Esta cópia foi feita por uma versão mais nova do app; atualize o app.',
  danificada: 'A cópia está danificada; nada foi alterado.',
  ilegivel: 'Não foi possível ler o arquivo; nada foi alterado.',
}

export class ErroDaCopia extends Error {
  readonly motivo: MotivoDoErroDaCopia
  constructor(motivo: MotivoDoErroDaCopia, detalhe?: string) {
    super(detalhe ?? motivo)
    this.name = 'ErroDaCopia'
    this.motivo = motivo
  }
}

export interface CopiaLida {
  copia: CopiaDeSeguranca
  /** Só na cópia completa: as entradas `imagens/…` do .zip (a chave só serve para procurar, nunca vira caminho). */
  fotos: Map<string, () => Promise<Blob>> | null
}

const erro = (motivo: MotivoDoErroDaCopia, detalhe?: string) => new ErroDaCopia(motivo, detalhe)
const objeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const textos = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [])

/** Uma base (ou o estado) inteira: nenhum registro recusado. */
function baseInteira(x: unknown, qual: string): EstadoConsolidado {
  const v = validarBase(x)
  if (!v || v.ignorados > 0) throw erro('danificada', `${qual} ilegível`)
  return v.base
}

/** Confere o JSON de uma cópia e devolve a cópia (só com o que o formato prevê). */
export function validarCopia(x: unknown): CopiaDeSeguranca {
  if (!objeto(x) || x.formato !== FORMATO_DA_COPIA) throw erro('nao-e-copia')
  if (typeof x.versao === 'number' && x.versao > 1) throw erro('versao-nova')
  if (x.versao !== 1) throw erro('danificada', 'versão')
  if (typeof x.geradoEm !== 'string' || Number.isNaN(Date.parse(x.geradoEm))) throw erro('danificada', 'geradoEm')
  const ap = x.aparelho
  if (!objeto(ap) || typeof ap.id !== 'string' || typeof ap.nome !== 'string') throw erro('danificada', 'aparelho')
  if (!Array.isArray(x.eventos)) throw erro('danificada', 'eventos')
  const eventos: Evento[] = []
  for (const e of x.eventos) {
    const v = validarEvento(e)
    if (!v.ok) throw erro('danificada', `evento inválido (${v.motivo})`)
    eventos.push(v.evento)
  }
  const base = x.base === null || x.base === undefined ? null : baseInteira(x.base, 'base')
  const estado = baseInteira(x.estado, 'estado')
  if (estadoCanonico(fundir(eventos, base ?? undefined)) !== estadoCanonico(fundir([], estado))) throw erro('danificada', 'o estado não confere com os eventos')
  const aparelhos: Record<string, string> = {}
  if (objeto(x.aparelhos)) for (const [id, nome] of Object.entries(x.aparelhos)) if (typeof nome === 'string') aparelhos[id] = nome
  return {
    formato: FORMATO_DA_COPIA,
    versao: 1,
    geradoEm: x.geradoEm,
    aparelho: { id: ap.id, nome: ap.nome },
    aparelhos,
    eventos,
    naoEnviados: textos(x.naoEnviados),
    base,
    estado,
    marcas: objeto(x.marcas) ? (x.marcas as CopiaDeSeguranca['marcas']) : {},
    numerosConfirmados: validarConfirmados(x.numerosConfirmados),
    imagens: Array.isArray(x.imagens) ? (x.imagens as CopiaDeSeguranca['imagens']) : [],
    observacoes: textos(x.observacoes),
  }
}

const eZip = (cabeca: Uint8Array) => cabeca.length >= 2 && cabeca[0] === 0x50 && cabeca[1] === 0x4b

function doZip(e: unknown): ErroDaCopia {
  if (e instanceof ErroDeZip) return erro(e.motivo === 'nao-e-zip' ? 'nao-e-copia' : 'danificada', e.message)
  return erro('ilegivel', e instanceof Error ? e.message : String(e))
}

/** Lê e valida a cópia escolhida (veja o cabeçalho). Lança ErroDaCopia; nunca muda nada. */
export async function lerCopia(arquivo: File): Promise<CopiaLida> {
  let cabeca: Uint8Array
  try {
    cabeca = new Uint8Array(await arquivo.slice(0, 4).arrayBuffer())
  } catch (e) {
    throw erro('ilegivel', e instanceof Error ? e.message : String(e))
  }
  if (eZip(cabeca)) {
    let mapa: Map<string, () => Promise<Blob>>
    try {
      mapa = await lerZip(arquivo)
    } catch (e) {
      throw doZip(e)
    }
    const abrir = mapa.get('copia.json')
    if (!abrir) throw erro('nao-e-copia', 'o .zip não tem copia.json')
    let texto: string
    try {
      texto = await (await abrir()).text()
    } catch (e) {
      throw doZip(e)
    }
    let x: unknown
    try {
      x = JSON.parse(texto)
    } catch {
      throw erro('danificada', 'copia.json ilegível')
    }
    const fotos = new Map<string, () => Promise<Blob>>()
    for (const [nome, ler] of mapa) if (nome.startsWith('imagens/')) fotos.set(nome, ler)
    return { copia: validarCopia(x), fotos }
  }
  // Não é .zip: antes de ler o arquivo inteiro como texto, confere que ele começa como um objeto JSON e que
  // cabe na memória (no iPhone, um arquivo grande lido de uma vez derruba a aba).
  let inicio: Uint8Array
  try {
    inicio = new Uint8Array(await arquivo.slice(0, CABECA_DO_JSON).arrayBuffer())
  } catch (e) {
    throw erro('ilegivel', e instanceof Error ? e.message : String(e))
  }
  if (primeiroNaoBranco(inicio) !== 0x7b) throw erro('nao-e-copia')
  if (arquivo.size > MAX_JSON) throw erro('ilegivel', `arquivo de ${arquivo.size} bytes, acima do limite de ${MAX_JSON}`)
  let texto: string
  try {
    texto = await arquivo.text()
  } catch (e) {
    throw erro('ilegivel', e instanceof Error ? e.message : String(e))
  }
  let x: unknown
  try {
    x = JSON.parse(texto)
  } catch {
    throw erro('nao-e-copia')
  }
  return { copia: validarCopia(x), fotos: null }
}

const CABECA_DO_JSON = 1024
const MAX_JSON = 50 * 1024 * 1024

/**
 * O primeiro byte que não é espaço, tabulação ou quebra de linha (os brancos do JSON); -1 se não há. Uma marca UTF-8 (BOM,
 * EF BB BF) no começo é pulada, como faz `Blob.text()`: um editor pode tê-la posto ao regravar a cópia (NB-4).
 */
function primeiroNaoBranco(u: Uint8Array): number {
  const inicio = u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf ? 3 : 0
  for (let i = inicio; i < u.length; i++) {
    const b = u[i]!
    if (b !== 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return b
  }
  return -1
}
