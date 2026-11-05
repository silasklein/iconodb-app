import { useEffect, useMemo, useState } from 'react'
import { aoReabrir } from '../banco/cliente'
import { elementosSemRegiaoNoPacote, linhasDaFila, lugaresDosCasos, traducoesNaoRevisadasNoPacote, verbetesAReverNoPacote, type ElementoSemRegiao, type LinhaDaFila, type LugarDoCaso, type TraducaoNaoRevisada } from '../banco/consultas'
import { useNumeracao } from '../objetos-skc/atual'
import { lerEstado } from '../pacote/local'
import { redirecionamentosOuNenhum, type Redirecionamentos } from '../pacote/redirecionamentos'
import type { Pendencias } from '../banco/tipos'
import type { Carga } from '../ui/useCarregar'
import { estadoAtual, useEstado } from '../usuario/estado'
import { montarFila, type Fila } from './fila'

interface DadosDoPacote {
  linhas: LinhaDaFila[]
  lugares: Map<string, LugarDoCaso> | null
  verbetesDoPacote: { id: string; original: string }[]
  elementos: ElementoSemRegiao[]
  /** Só a Revisão carrega (é uma lista de consulta; o Menu e a barra não a contam). */
  traducoes: TraducaoNaoRevisada[]
  /** Os redirecionamentos do pacote (Tarefa 16). */
  redirecionamentos: Redirecionamentos
}

interface Opcoes {
  /** Carregar também onde cada caso está (a Revisão precisa; o Menu e a barra só contam). */
  lugares?: boolean
  /** Sem o banco no aparelho: falhar (a Revisão avisa) em vez de ficar sem fila (o Menu e a barra). */
  exigirBanco?: boolean
}

/**
 * A fila de revisão de AGORA (`montarFila`) e o estado do carregamento. Lê o pacote (que refaz quando o banco é reaberto
 * por uma sincronização) e acompanha o estado do usuário: marcar um caso, ligar um sítio, dar um período, aprovar um
 * verbete ou receber eventos de outro aparelho refaz a conta no mesmo ciclo de renderização, em todas as telas que a usam.
 */
export function useFilaComCarga(opcoes: Opcoes = {}): { carga: Carga<DadosDoPacote | null>; fila: Fila | null } {
  const { lugares: comLugares = false, exigirBanco = false } = opcoes
  const [versao, setVersao] = useState(0)
  const [tentativa, setTentativa] = useState(0)
  const [carga, setCarga] = useState<Carga<DadosDoPacote | null>>({ fase: 'carregando' })
  useEffect(() => aoReabrir(() => setVersao((v) => v + 1)), [])
  useEffect(() => {
    let vivo = true
    const buscar = async (): Promise<DadosDoPacote | null> => {
      if (!exigirBanco && !(await lerEstado())) return null
      const [linhas, verbetesDoPacote, elementos, traducoes, redirecionamentos] = await Promise.all([
        linhasDaFila(),
        verbetesAReverNoPacote(),
        elementosSemRegiaoNoPacote(),
        comLugares ? traducoesNaoRevisadasNoPacote() : Promise.resolve([]),
        redirecionamentosOuNenhum(),
      ])
      // Onde cada caso está: os da fila, os itens dos elementos sem região e as traduções (trecho ou campo do catálogo).
      const pares = comLugares ? [...linhas, ...elementos.map((e) => ({ entidade: 'item', entidadeId: e.itemId })), ...traducoes] : []
      const lugares = comLugares ? await lugaresDosCasos(pares) : null
      return { linhas, lugares, verbetesDoPacote, elementos, traducoes, redirecionamentos }
    }
    buscar().then(
      (dados) => vivo && setCarga({ fase: 'ok', dados }),
      (erro: unknown) => {
        if (!vivo) return
        // O Menu e a barra não mostram erro: sem fila, sem contagem.
        setCarga(exigirBanco ? { fase: 'erro', erro, tentarDeNovo: () => setTentativa((t) => t + 1) } : { fase: 'ok', dados: null })
      },
    )
    return () => {
      vivo = false
    }
  }, [versao, tentativa, comLugares, exigirBanco])

  // O estado do usuário: os mapas dos tipos que mudam a conta (um novo mapa = a conta se refaz).
  const resolvidos = useEstado((e) => e.registros.get('revisao'))
  const trocas = useEstado((e) => e.registros.get('item-sitio'))
  const sitios = useEstado((e) => e.registros.get('sitio'))
  const objetos = useEstado((e) => e.registros.get('objeto'))
  const verbetes = useEstado((e) => e.registros.get('verbete'))
  const regioes = useEstado((e) => e.registros.get('regiao'))
  const numeracao = useNumeracao()
  const dados = carga.fase === 'ok' ? carga.dados : null
  const fila = useMemo(
    () => (dados ? montarFila({ ...dados, numeracao, estado: estadoAtual() }) : null),
    // os mapas são o que `estadoAtual()` tem de novo para esta conta
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados, numeracao, resolvidos, trocas, sitios, objetos, verbetes, regioes],
  )
  return { carga, fila }
}

/** Só a fila (null enquanto carrega, sem pacote ou se falhou): o que o Menu e a barra superior leem. */
export const useFila = (): Fila | null => useFilaComCarga().fila

/** A fila no formato dos contadores (`total` e `porTipo`), a que o Menu e o ponto da barra usam. */
export function pendenciasDaFila(f: Fila): Pendencias {
  return { total: f.total, porTipo: f.grupos.filter((g) => !g.soConsulta && g.quantidade > 0).map((g) => ({ tipo: g.id, rotulo: g.rotulo, quantidade: g.quantidade })) }
}
