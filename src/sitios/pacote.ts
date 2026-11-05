/**
 * Os sítios do PACOTE (id → nome, grafia impressa, coordenada, região), lidos uma vez por pacote aberto. Servem ao nome de
 * agora de um sítio (corrigido → do livro → guardado), à lista, às sugestões e às facetas da busca. Como as formas dos
 * verbetes (src/glossario/formasDoPacote.ts): sem pacote, ou com a consulta falhando, o mapa não vem e quem usa trata como
 * "não sei".
 */
import { useEffect, useState } from 'react'
import { aoReabrir, geracaoDoBanco } from '../banco/cliente'
import { sitios } from '../banco/consultas'
import type { SitioResumo } from '../banco/tipos'

export type SitiosDoPacote = ReadonlyMap<string, SitioResumo>

let guardado: { motor: number; pedido: Promise<SitiosDoPacote>; pronto: SitiosDoPacote | null } | null = null
aoReabrir(() => {
  guardado = null
})

export function sitiosDoPacote(): Promise<SitiosDoPacote> {
  const motor = geracaoDoBanco()
  if (guardado?.motor === motor) return guardado.pedido
  const entrada: NonNullable<typeof guardado> = {
    motor,
    pronto: null,
    pedido: sitios().then((l) => {
      const mapa = new Map(l.map((s) => [s.id, s] as const))
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
export const sitiosDoPacoteProntos = (): SitiosDoPacote | null => (guardado?.motor === geracaoDoBanco() ? guardado.pronto : null)

/**
 * Os sítios do pacote para uma tela: null até a leitura terminar (e para sempre, sem pacote). `ativo: false` não lê nada (o
 * cartão de um objeto já traz o nome do livro e não precisa da lista).
 */
export function useSitiosDoPacote(ativo = true): SitiosDoPacote | null {
  const [mapa, setMapa] = useState<SitiosDoPacote | null>(sitiosDoPacoteProntos)
  useEffect(() => {
    if (!ativo) return
    let vivo = true
    const ler = () =>
      sitiosDoPacote().then(
        (m) => vivo && setMapa(m),
        () => undefined,
      )
    void ler()
    const parar = aoReabrir(() => void ler())
    return () => {
      vivo = false
      parar()
    }
  }, [ativo])
  return ativo ? mapa : null
}
