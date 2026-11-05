/**
 * As buscas recentes (decisão 32): as últimas 8, só neste aparelho. Ficam no localStorage, nunca vão ao Dropbox nem
 * entram na sincronização. Sem duplicatas (a mesma busca, sem distinguir acento, maiúscula nem espaços, sobe ao
 * topo com a última grafia). Toda leitura e escrita é protegida: o localStorage pode faltar ou lançar erro (modo
 * privado, dados do site bloqueados), e então as recentes valem só até a página recarregar.
 */
export const LIMITE_DE_RECENTES = 8
/** Uma busca guardada tem no máximo isto de caracteres (colar um texto enorme não pode encher o localStorage). */
export const TAMANHO_MAXIMO_DE_RECENTE = 200
const CHAVE = 'iconodb:buscas-recentes'

/** Só quando o localStorage não pode ser usado: a lista fica na memória da sessão. */
let naMemoria: string[] | null = null

/**
 * A chave de comparação: sem acentos nem maiúsculas, espaços únicos. É uma dobra simples, de propósito: só decide se
 * duas buscas são "a mesma" para a lista, e não precisa da tabela do pacote (que é assíncrona e pode não estar aberta).
 */
export function chaveDeRecente(texto: string): string {
  return texto
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[ʿʾ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function limpo(texto: string): string {
  // por caractere (code point), para não cortar um par substituto ao meio
  return [...texto.replace(/\s+/g, ' ').trim()].slice(0, TAMANHO_MAXIMO_DE_RECENTE).join('')
}

export function lerRecentes(): string[] {
  if (naMemoria) return [...naMemoria]
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (bruto === null) return []
    const dados: unknown = JSON.parse(bruto)
    if (!Array.isArray(dados)) return []
    return dados.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, LIMITE_DE_RECENTES)
  } catch {
    return []
  }
}

function gravar(lista: string[]): string[] {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista))
    naMemoria = null
  } catch {
    naMemoria = lista
  }
  return [...lista]
}

/** Põe a busca no topo (e tira a repetida). Devolve a lista nova. */
export function adicionarRecente(texto: string): string[] {
  const nova = limpo(texto)
  if (nova === '') return lerRecentes()
  const chave = chaveDeRecente(nova)
  const resto = lerRecentes().filter((r) => chaveDeRecente(r) !== chave)
  return gravar([nova, ...resto].slice(0, LIMITE_DE_RECENTES))
}

export function removerRecente(texto: string): string[] {
  const chave = chaveDeRecente(texto)
  return gravar(lerRecentes().filter((r) => chaveDeRecente(r) !== chave))
}

export function limparRecentes(): string[] {
  return gravar([])
}
