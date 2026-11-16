import { useEffect, useMemo, useState } from 'react'
import { aoReabrir } from '../banco/cliente'
import { citacoesNaoResolvidasNoPacote, elementosSemRegiaoNoPacote, linhasDaFila, lugaresDosCasos, traducoesNaoRevisadasNoPacote, verbetesAReverNoPacote, type CitacaoDoPacote, type ElementoSemRegiao, type LinhaDaFila, type LugarDoCaso, type TraducaoNaoRevisada } from '../banco/consultas'
import { useNumeracao } from '../objetos-skc/atual'
import { lerEstado } from '../pacote/local'
import { destinosCriadosOuNenhum, redirecionamentosOuNenhum, type Redirecionamentos } from '../pacote/redirecionamentos'
import type { Pendencias } from '../banco/tipos'
import type { Carga } from '../ui/useCarregar'
import { estadoAtual, useEstado } from '../usuario/estado'
import { resolverSitios, type PacoteDeSitios, type ParSugerido, type Resolucao } from '../sitios/resolucao'
import { pacoteDeSitiosOuVazio } from '../sitios/useResolucao'
import { montarFila, type Fila } from './fila'
import { ID_DOS_PARES, paresDaRevisao, ROTULO_DOS_PARES, type ParResolvido } from './pares'

/** Os pares de sítios que podem ser o mesmo (Tarefa 15), sobre a mesma resolução e o mesmo pacote da conta. */
export interface ParesDaFila {
  abertos: ParSugerido[]
  resolvidos: ParResolvido[]
  resolucao: Resolucao
  pacote: PacoteDeSitios
}

interface DadosDoPacote {
  linhas: LinhaDaFila[]
  lugares: Map<string, LugarDoCaso> | null
  verbetesDoPacote: { id: string; original: string }[]
  elementos: ElementoSemRegiao[]
  /** Só a Revisão carrega (é uma lista de consulta; o Menu e a barra não a contam). */
  traducoes: TraducaoNaoRevisada[]
  /** Os redirecionamentos do pacote (Tarefa 16). */
  redirecionamentos: Redirecionamentos
  /** O pacote dos sítios (Parte 2C, bloco 2): os sítios não resolvidos valem pelo destino. */
  pacoteDeSitios: PacoteDeSitios
  /** As citações que a Revisão pode ligar (Parte 2C, bloco 3): a citação ligada sai da fila, e a desfeita volta. */
  citacoes: CitacaoDoPacote[]
  /** As obras dos livros criadas de obras suas (Tarefa 14, fix round 1; `obraPublicadaSai`). */
  obrasCriadas: Redirecionamentos
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
export function useFilaComCarga(opcoes: Opcoes = {}): { carga: Carga<DadosDoPacote | null>; fila: Fila | null; pares: ParesDaFila | null } {
  const { lugares: comLugares = false, exigirBanco = false } = opcoes
  const [versao, setVersao] = useState(0)
  const [tentativa, setTentativa] = useState(0)
  const [carga, setCarga] = useState<Carga<DadosDoPacote | null>>({ fase: 'carregando' })
  useEffect(() => aoReabrir(() => setVersao((v) => v + 1)), [])
  useEffect(() => {
    let vivo = true
    const buscar = async (): Promise<DadosDoPacote | null> => {
      if (!exigirBanco && !(await lerEstado())) return null
      const [linhas, verbetesDoPacote, elementos, traducoes, redirecionamentos, pacoteDeSitios, citacoes, obrasCriadas] = await Promise.all([
        linhasDaFila(),
        verbetesAReverNoPacote(),
        elementosSemRegiaoNoPacote(),
        comLugares ? traducoesNaoRevisadasNoPacote() : Promise.resolve([]),
        redirecionamentosOuNenhum(),
        pacoteDeSitiosOuVazio(),
        citacoesNaoResolvidasNoPacote(),
        destinosCriadosOuNenhum(),
      ])
      // Onde cada caso está: os da fila, os itens dos elementos sem região e as traduções (trecho ou campo do catálogo).
      // As citações ligadas pelo usuário no pacote podem voltar à fila (a camada as desfaz): o lugar delas também.
      const doUsuario = citacoes
        .filter((c) => c.resolvidaPor === 'user')
        .map((c) => (c.passagemId ? { entidade: 'passage', entidadeId: c.passagemId } : c.hipoteseId ? { entidade: 'hypothesis', entidadeId: c.hipoteseId } : { entidade: 'item', entidadeId: c.itemId }))
      const pares = comLugares ? [...linhas, ...elementos.map((e) => ({ entidade: 'item', entidadeId: e.itemId })), ...traducoes, ...doUsuario] : []
      const lugares = comLugares ? await lugaresDosCasos(pares) : null
      return { linhas, lugares, verbetesDoPacote, elementos, traducoes, redirecionamentos, pacoteDeSitios, citacoes, obrasCriadas }
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
  const ligacoes = useEstado((e) => e.registros.get('citacao'))
  const obras = useEstado((e) => e.registros.get('obra'))
  const numeracao = useNumeracao()
  const dados = carga.fase === 'ok' ? carga.dados : null
  const conta = useMemo(
    () => {
      if (!dados) return null
      const estado = estadoAtual()
      // Tarefa 15: os pares abertos somam no total; a Revisão mostra estes mesmos (a página, o Menu e a barra concordam).
      const resolucao = resolverSitios(estado, dados.pacoteDeSitios)
      const pares: ParesDaFila = { ...paresDaRevisao(resolucao, dados.pacoteDeSitios), resolucao, pacote: dados.pacoteDeSitios }
      return { fila: montarFila({ ...dados, numeracao, estado, paresAbertos: pares.abertos.length }), pares }
    },
    // os mapas são o que `estadoAtual()` tem de novo para esta conta
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados, numeracao, resolvidos, trocas, sitios, objetos, verbetes, regioes, ligacoes, obras],
  )
  return { carga, fila: conta?.fila ?? null, pares: conta?.pares ?? null }
}

/** Só a fila (null enquanto carrega, sem pacote ou se falhou): o que o Menu e a barra superior leem. */
export const useFila = (): Fila | null => useFilaComCarga().fila

/** A fila no formato dos contadores (`total` e `porTipo`), a que o Menu e o ponto da barra usam. */
export function pendenciasDaFila(f: Fila): Pendencias {
  const porTipo = f.grupos.filter((g) => !g.soConsulta && g.quantidade > 0).map((g) => ({ tipo: g.id, rotulo: g.rotulo, quantidade: g.quantidade }))
  if (f.paresAbertos > 0) porTipo.push({ tipo: ID_DOS_PARES, rotulo: ROTULO_DOS_PARES, quantidade: f.paresAbertos })
  return { total: f.total, porTipo }
}
