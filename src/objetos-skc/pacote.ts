/**
 * Os números dos objetos do pacote (os dos livros), para a numeração SKC. A sincronização e as telas não consultam o
 * banco diretamente: o app liga a fonte (`definirFonteDosNumerosDoPacote`, em `NumerosDoPacote.tsx`) e os testes ligam
 * a sua. Sem fonte, ou se a consulta falha, não há números do pacote: nesse caso NENHUM número novo é confirmado (a
 * consolidação só repassa os já confirmados) e as telas mostram o número como "calculando".
 */
import { useSyncExternalStore } from 'react'
import type { NumerosDoPacote } from './numeracao'

type Fonte = () => Promise<Iterable<string>>

let fonte: Fonte | null = null
let atuais: NumerosDoPacote | null = null
/** A consulta já respondeu (com os números ou com erro), ou não há fonte: as telas não esperam mais. */
let respondeu = true
let pedido: Promise<NumerosDoPacote | null> | null = null
const assinantes = new Set<() => void>()

function publicar(novos: NumerosDoPacote | null, pronto = true): void {
  atuais = novos
  respondeu = pronto
  for (const f of [...assinantes]) f()
}

export function definirFonteDosNumerosDoPacote(f: Fonte | null): void {
  fonte = f
  pedido = null
  publicar(null, f === null)
}

/** Os números do pacote aberto (consulta uma vez; `recarregar` depois de trocar o pacote). null: indisponíveis. */
export function numerosDoPacote(): Promise<NumerosDoPacote | null> {
  if (atuais) return Promise.resolve(atuais)
  if (!fonte) return Promise.resolve(null)
  const f = fonte
  pedido ??= f()
    .then((lista) => {
      const conjunto: NumerosDoPacote = new Set(lista)
      if (fonte === f) publicar(conjunto)
      return conjunto
    })
    .catch(() => {
      if (fonte === f) publicar(null)
      return null
    })
    .finally(() => {
      pedido = null
    })
  return pedido
}

/** O pacote foi trocado: esquece e consulta de novo. */
export function recarregarNumerosDoPacote(): Promise<NumerosDoPacote | null> {
  pedido = null
  publicar(null, fonte === null)
  return numerosDoPacote()
}

export const numerosDoPacoteAtuais = (): NumerosDoPacote | null => atuais
/** Ainda esperando a primeira resposta da fonte? (Sem fonte, nunca.) */
export const esperandoNumerosDoPacote = (): boolean => !respondeu

function assinar(f: () => void): () => void {
  assinantes.add(f)
  return () => {
    assinantes.delete(f)
  }
}
export const assinarNumerosDoPacote = assinar

/** Os números do pacote para uma tela (null enquanto não chegaram; a primeira chamada dispara a consulta). */
export function useNumerosDoPacote(): NumerosDoPacote | null {
  const v = useSyncExternalStore(assinar, numerosDoPacoteAtuais, numerosDoPacoteAtuais)
  if (v === null && fonte && !respondeu && !pedido) void numerosDoPacote()
  return v
}

/** Para as telas que esperam pelos números (o Item resolvendo um número SKC provisório). */
export function useEsperandoNumerosDoPacote(): boolean {
  return useSyncExternalStore(assinar, esperandoNumerosDoPacote, esperandoNumerosDoPacote)
}
