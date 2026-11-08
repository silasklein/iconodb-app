/**
 * Os sítios do PACOTE (id → nome, grafia impressa, coordenada, região), lidos uma vez por pacote aberto. Servem ao nome de
 * agora de um sítio (corrigido → do livro → guardado), à lista, às sugestões e às facetas da busca. Como as formas dos
 * verbetes (src/glossario/formasDoPacote.ts): sem pacote, ou com a consulta falhando, o mapa não vem e quem usa trata como
 * "não sei".
 */
import { useEffect, useState } from 'react'
import { aoReabrir, geracaoDoBanco } from '../banco/cliente'
import { grafiasDoPacote, paresSugeridos, partesDoPacote, sitios } from '../banco/consultas'
import type { SitioResumo } from '../banco/tipos'
import { criadosDoPacote, mesclasDoPacote, redirecionamentosDoPacote } from '../pacote/redirecionamentos'
import { eSitioSkc } from './modelo'
import type { PacoteDeSitios } from './resolucao'

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

const depois = <T>(ler: () => Promise<T>): Promise<T> => Promise.resolve().then(ler)

let guardadoDaResolucao: { motor: number; pedido: Promise<PacoteDeSitios>; pronto: PacoteDeSitios | null } | null = null
aoReabrir(() => {
  guardadoDaResolucao = null
})

/**
 * O que a resolução dos sítios (src/sitios/resolucao.ts) lê do pacote, lido uma vez por pacote aberto (como `sitiosDoPacote`):
 * os sítios, os `SI-…` publicados (os redirecionamentos de sítio das publicações) e os destinos criados deles (`criado`), as
 * mesclas livro → livro, as partes, as grafias e os pares sugeridos. Num pacote 5–7 só os sítios e os publicados (as tabelas
 * do schema 8 faltam: só a camada). Rejeita sem pacote (quem usa trata como `PACOTE_VAZIO`).
 */
export function pacoteDeSitios(): Promise<PacoteDeSitios> {
  const motor = geracaoDoBanco()
  if (guardadoDaResolucao?.motor === motor) return guardadoDaResolucao.pedido
  const entrada: NonNullable<typeof guardadoDaResolucao> = {
    motor,
    pronto: null,
    // Cada leitura começa dentro de um `then`: uma que falha (até de forma síncrona) vira uma rejeição que o `Promise.all`
    // trata, e nenhuma das outras fica com a rejeição solta.
    pedido: Promise.all([
      depois(() => sitiosDoPacote()),
      depois(() => redirecionamentosDoPacote()),
      depois(() => criadosDoPacote()),
      depois(() => mesclasDoPacote()),
      depois(() => partesDoPacote()),
      depois(() => grafiasDoPacote()),
      depois(() => paresSugeridos()),
    ]).then(([lista, redirecionamentos, criados, mesclas, partes, grafias, pares]) => {
      const publicados = new Map([...redirecionamentos].filter(([de]) => eSitioSkc(de)))
      const pacote: PacoteDeSitios = {
        sitios: new Set(lista.keys()),
        publicados,
        criados: new Set([...publicados].filter(([de]) => criados.has(de)).map(([, para]) => para)),
        mesclas,
        partes: new Map(partes.map((p) => [p.parte, p.todo] as const)),
        grafias,
        pares,
      }
      entrada.pronto = pacote
      return pacote
    }),
  }
  guardadoDaResolucao = entrada
  entrada.pedido.catch(() => {
    if (guardadoDaResolucao === entrada) guardadoDaResolucao = null
  })
  return entrada.pedido
}

/** O pacote dos sítios quando já foi lido (sem esperar); null se não, ou se o pacote é outro. */
export const pacoteDeSitiosPronto = (): PacoteDeSitios | null => (guardadoDaResolucao?.motor === geracaoDoBanco() ? guardadoDaResolucao.pronto : null)
