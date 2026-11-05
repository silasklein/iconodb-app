/**
 * A numeração e os grupos de ligação do estado de agora, com cache por identidade (o mapa de objetos e de ligações do
 * estado, o mapa de confirmados e os números do pacote), e os hooks das telas.
 *
 * Sem os números do pacote (ainda chegando, ou o banco falhou), um número provisório não pode ser calculado: ele fica
 * null ("calculando") e não entra em `porNumero`. Os confirmados valem sempre.
 */
import { useMemo } from 'react'
import { estadoAtual, useEstado, type Estado, type Registro } from '../usuario/estado'
import { confirmadosAtuais, useConfirmados } from './confirmados'
import { agruparObjetos, type Grupos } from './ligacoes'
import { eObjetoSkc } from './modelo'
import { numerar, type Confirmados, type Numeracao, type NumerosDoPacote } from './numeracao'
import { numerosDoPacoteAtuais, useNumerosDoPacote } from './pacote'

const SEM_PACOTE: NumerosDoPacote = new Set()

/** `numerar` com o pacote, ou, sem ele, só com os confirmados (os provisórios sem número). */
export function numeracaoCom(estado: Estado, pacote: NumerosDoPacote | null, confirmados: Confirmados): Numeracao {
  const n = numerar(estado, pacote ?? SEM_PACOTE, confirmados)
  if (pacote) return n
  // O SKC, Nr. provisório de um objeto sem número calculado também espera (a linha "SKC, Nr." nunca aparece sem número).
  const porId = new Map(
    [...n.porId].map(([id, i]) => {
      if (i.situacao !== 'provisorio') return [id, i]
      const semNr = i.situacaoNrSkc === 'provisorio' ? { nrSkc: null, situacaoNrSkc: null, mudouNrSkc: false } : {}
      return [id, { ...i, numero: null, mudou: false, ...semNr }]
    }),
  )
  const porNumero = new Map([...n.porNumero].filter(([, id]) => porId.get(id)?.numero !== null))
  const reservas = new Map([...n.reservas].filter(([, id]) => porId.get(id)?.numero !== null))
  const porNrSkc = new Map([...n.porNrSkc].filter(([, id]) => porId.get(id)?.nrSkc !== null))
  return { ...n, porId, porNumero, reservas, porNrSkc }
}

let cache: { objetos: unknown; confirmados: Confirmados; pacote: NumerosDoPacote | null; n: Numeracao } | null = null

/** A numeração de `estado` com os confirmados e o pacote de agora (com cache). */
export function numeracaoDe(estado: Estado): Numeracao {
  const objetos = estado.registros.get('objeto')
  const confirmados = confirmadosAtuais()
  const pacote = numerosDoPacoteAtuais()
  if (cache && cache.objetos === objetos && cache.confirmados === confirmados && cache.pacote === pacote) return cache.n
  const n = numeracaoCom(estado, pacote, confirmados)
  cache = { objetos, confirmados, pacote, n }
  return n
}

/** A numeração para uma tela: só muda (e só re-renderiza) quando mudam os objetos, os confirmados ou o pacote. */
export function useNumeracao(): Numeracao {
  const objetos = useEstado((e) => e.registros.get('objeto'))
  const confirmados = useConfirmados()
  const pacote = useNumerosDoPacote()
  // O estado de agora tem exatamente estes objetos (o seletor acabou de lê-los).
  return useMemo(() => numeracaoCom(estadoAtual(), pacote, confirmados), [objetos, confirmados, pacote])
}

/** Os grupos de ligação do estado de agora (mudam com as ligações e a numeração). */
export function useGrupos(): Grupos {
  const ligacoes = useEstado((e) => e.registros.get('ligacao'))
  const numeracao = useNumeracao()
  return useMemo(() => agruparObjetos(estadoAtual(), numeracao), [ligacoes, numeracao])
}

export function gruposDe(estado: Estado): Grupos {
  return agruparObjetos(estado, numeracaoDe(estado))
}

/** Os objetos SKC (não as reservas), não excluídos, com número (confirmado ou provisório), por número. */
export function objetosComNumero(estado: Estado): Map<string, Registro> {
  const n = numeracaoDe(estado)
  const mapa = new Map<string, Registro>()
  for (const [numero, id] of n.porNumero) {
    const r = estado.registro('objeto', id)
    if (r && !r.excluido && eObjetoSkc(r)) mapa.set(numero, r)
  }
  return mapa
}

/** O número de um objeto SKC pelo id (null: rascunho, excluído sem número, calculando, ou não é objeto). */
export function numeroDoObjeto(estado: Estado, id: string): string | null {
  return numeracaoDe(estado).porId.get(id)?.numero ?? null
}
