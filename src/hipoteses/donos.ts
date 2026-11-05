/**
 * De que objeto do livro é cada trecho do livro (`PA-…`), para saber onde mora uma hipótese ancorada nele (T17-B-4). Uma
 * hipótese registrada no principal de um grupo de ligação, com o trecho na leitura de um membro do livro, guarda `objeto` =
 * o principal; desfeita a ligação, ela tem de seguir o trecho (o membro), como a ancorada numa leitura SKC (M13). O trecho não
 * sabe de que objeto é: isso vem do pacote (`numerosDosTrechos`, assíncrono), então este módulo guarda o que já se perguntou
 * (por pacote aberto) e `objetoDaHipotese` o lê de forma síncrona. Sem resposta, vale o `objeto` gravado. Sem dependências
 * do modelo (o modelo é quem importa este módulo).
 */
import { aoReabrir } from '../banco/cliente'

const numeros = new Map<string, readonly string[]>()
const perguntados = new Set<string>()
const ouvintes = new Set<() => void>()
let versao = 0

aoReabrir(() => {
  numeros.clear()
  perguntados.clear()
  versao++
  ouvintes.forEach((f) => f())
})

/** Quantas vezes o que se sabe mudou (para as telas refazerem a leitura). */
export const versaoDosDonos = (): number => versao
export const assinarOsDonos = (f: () => void): (() => void) => {
  ouvintes.add(f)
  return () => ouvintes.delete(f)
}
export const jaPerguntado = (trecho: string): boolean => perguntados.has(trecho)

/** Guarda a resposta do pacote para estes trechos (os que não vieram não são de objeto nenhum). */
export function guardarOsDonos(trechos: readonly string[], respostas: ReadonlyMap<string, readonly string[]>): void {
  for (const t of trechos) {
    perguntados.add(t)
    const r = respostas.get(t)
    if (r && r.length > 0) numeros.set(t, r)
  }
  if (trechos.length > 0) {
    versao++
    ouvintes.forEach((f) => f())
  }
}

/** Esquece tudo (testes). */
export function esquecerOsDonos(): void {
  numeros.clear()
  perguntados.clear()
  versao++
}

/**
 * O objeto do livro de um trecho, dado o objeto em que a hipótese foi registrada: ele mesmo se é um dos que o trecho descreve;
 * senão o primeiro que o descreve; null se o pacote não disse (ou não perguntou ainda).
 */
export function objetoDoTrecho(trecho: string, gravado: string | null): string | null {
  const lista = numeros.get(trecho)
  if (!lista) return null
  return gravado !== null && lista.includes(gravado) ? gravado : lista[0]!
}
