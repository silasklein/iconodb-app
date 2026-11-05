/**
 * As formas dos verbetes do PACOTE (`pt`, a de verbete, e `pt_text`, a de texto corrido), lidas uma vez por pacote aberto.
 * Servem a duas coisas (revisão 1 da Tarefa 11):
 * - dizer se um termo do texto está como o pacote o escreve, para a forma em uso poder substituí-lo (`exibirTermo`);
 * - o nome do verbete quando o usuário não tem forma em uso (volta à proposta), na ordem forma em uso → nome do pacote →
 *   rótulo guardado (`nomeVivo`).
 * Sem pacote (ou a consulta falhou), o mapa não vem: quem usa trata como "não sei" (o texto fica como está).
 */
import { useEffect, useState } from 'react'
import { aoReabrir, geracaoDoBanco } from '../banco/cliente'
import { formasDosVerbetes } from '../banco/consultas'

export interface FormaDoPacote {
  pt: string | null
  ptTexto: string | null
}
export type FormasDoPacote = ReadonlyMap<string, FormaDoPacote>

/**
 * O nome de um verbete do pacote para as hipóteses SKC: a forma de VERBETE (`pt`, a etiqueta, que pode levar glosa), a mesma
 * que o campo Termo oferece, que a lista mostra e que a forma em uso substitui (revisão 2, m3); só sem `pt`, a de texto corrido.
 */
export const nomeDoPacote = (f: FormaDoPacote | undefined): string | null => (f ? f.pt || f.ptTexto || null : null)

/** O nome de agora: a forma em uso, senão o nome do pacote, senão o rótulo guardado (revisão 1, I2). */
export const nomeVivo = (id: string, guardado: string, formas: ReadonlyMap<string, string>, pacote: FormasDoPacote | null): string =>
  formas.get(id) ?? nomeDoPacote(pacote?.get(id)) ?? guardado

// Um pacote novo (`reabrirBanco`) muda as formas: o que está guardado não vale mais.
aoReabrir(() => {
  guardado = null
})

let guardado: { motor: number; pedido: Promise<FormasDoPacote>; pronto: FormasDoPacote | null } | null = null

export function formasDoPacote(): Promise<FormasDoPacote> {
  const motor = geracaoDoBanco()
  if (guardado?.motor === motor) return guardado.pedido
  const entrada: NonNullable<typeof guardado> = {
    motor,
    pronto: null,
    pedido: formasDosVerbetes().then((l) => {
      const mapa = new Map(l.map((x) => [x.id, { pt: x.pt, ptTexto: x.ptTexto }] as const))
      entrada.pronto = mapa
      return mapa
    }),
  }
  guardado = entrada
  entrada.pedido.catch(() => {
    if (guardado === entrada) guardado = null
  })
  return entrada.pedido
}

/** O mapa quando já foi lido (sem esperar); null se não, ou se o pacote é outro. */
export const formasDoPacoteProntas = (): FormasDoPacote | null => (guardado?.motor === geracaoDoBanco() ? guardado.pronto : null)

/** As formas do pacote para uma tela: null até a leitura terminar (e para sempre, sem pacote). */
export function useFormasDoPacote(): FormasDoPacote | null {
  const [mapa, setMapa] = useState<FormasDoPacote | null>(formasDoPacoteProntas)
  useEffect(() => {
    let vivo = true
    const ler = () =>
      formasDoPacote().then(
        (m) => vivo && setMapa(m),
        () => undefined,
      )
    void ler()
    // Um pacote novo instalado com a tela aberta: lê de novo (revisão 2, m2).
    const parar = aoReabrir(() => void ler())
    return () => {
      vivo = false
      parar()
    }
  }, [])
  return mapa
}
