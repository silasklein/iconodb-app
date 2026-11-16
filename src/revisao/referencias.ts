/**
 * As referências do objeto com as ligações do usuário (Parte 2C, bloco 3, Tarefa 11): a citação que a pessoa ligou a uma obra
 * abre a obra (no texto e na seção «Bibliografia»), com a marca discreta «ligada por você»; a que ela desligou no objeto fica
 * não resolvida, com «Religar». O que vale é `obraDaCitacao` (a camada sobre o pacote), a mesma regra da fila.
 */
import { useMemo } from 'react'
import { chicagoDasObras } from '../banco/consultas'
import type { ReferenciaBibliografica } from '../banco/tipos'
import { eObraDoLivro, eObraSkc, lerObra } from '../bibliografia/modelo'
import { chicagoDaObra } from '../bibliografia/formulario'
import { useCarregar } from '../ui/useCarregar'
import { estadoAtual, useEstado } from '../usuario/estado'
import type { Estado } from '../usuario/fusao'
import { citacaoDoLivro } from './citacoes'
import { useDestinosCriados } from '../pacote/redirecionamentos'
import { idDaOcorrencia, ligacaoDe, obraDaCitacao, type ObrasCriadas } from './ligacoes'

export interface ReferenciaNoObjeto extends ReferenciaBibliografica {
  /** A obra veio de uma ligação sua (a camada, ou a ligação do usuário que o pacote 10 já traz, `resolved_by 'user'`). */
  ligadaPorVoce: boolean
  /** O id da exceção desta ocorrência («Desligar esta citação»); null quando a citação não tem trecho nem item. */
  ocorrencia: string | null
  /** A citação que você desligou no objeto (a exceção nula viva): o id dela; senão null. */
  desligadaPorVoce: string | null
  /**
   * Sem a exceção, a chave a liga (uma chave viva com uma obra que vale): «Religar» tira a exceção e ela volta a abrir a obra.
   * Na citação ligada pela própria ocorrência (a sem autor), não: o «Desfazer» do aviso devolve a obra de antes.
   */
  religavel: boolean
}

type Chicagos = ReadonlyMap<string, { chicago: string | null; chicagoHtml: string | null }>

/** As referências como o app as mostra agora. `chicagos`: a forma Chicago das obras dos livros que a pessoa ligou no app. */
export function referenciasComLigacoes(estado: Estado, refs: readonly ReferenciaBibliografica[], chicagos: Chicagos = new Map(), criadas?: ObrasCriadas): ReferenciaNoObjeto[] {
  return refs.map((r) => {
    const doLivro = citacaoDoLivro(r)
    const l = ligacaoDe(estado, doLivro, criadas)
    const obra = obraDaCitacao(estado, doLivro, { obraId: r.obraId, resolvidaPor: r.resolvidaPor }, criadas)
    const ligadaPorVoce = obra !== null && (l?.obra === obra || (l === null && r.resolvidaPor === 'user'))
    const viva = l && l.por === 'ocorrencia' && l.obra === null && !estado.registro('citacao', l.registro)?.excluido ? l.registro : null
    let chicago = r.chicago
    let chicagoHtml = r.chicagoHtml
    if (obra !== r.obraId) {
      if (obra && eObraSkc(obra)) {
        const reg = estado.registro('obra', obra)
        const o = reg ? lerObra(reg) : null
        const c = o ? chicagoDaObra(o.csl) : null
        chicago = c?.texto ?? null
        chicagoHtml = c?.html ?? null
      } else {
        const c = obra ? chicagos.get(obra) : undefined
        chicago = c?.chicago ?? null
        chicagoHtml = c?.chicagoHtml ?? null
      }
    }
    return {
      ...r,
      obraId: obra,
      resolvida: obra !== null,
      chicago,
      chicagoHtml,
      ligadaPorVoce,
      ocorrencia: doLivro.alvo === '' ? null : idDaOcorrencia(doLivro),
      desligadaPorVoce: viva,
      // só a chave (um alvo vazio não casa com exceção nenhuma)
      religavel: viva !== null && ligacaoDe(estado, { ...doLivro, alvo: '' }, criadas)?.obra != null,
    }
  })
}

/** As referências do objeto com as ligações de agora (acompanha as ligações e as obras do usuário). */
export function useReferenciasComLigacoes(refs: readonly ReferenciaBibliografica[]): ReferenciaNoObjeto[] {
  const ligacoes = useEstado((e) => e.registros.get('citacao'))
  const obras = useEstado((e) => e.registros.get('obra'))
  // Tarefa 14 (fix round 1): a ligação a uma obra publicada cujas origens estão todas excluídas não vale
  const criadas = useDestinosCriados()
  const semChicago = useMemo(
    () => referenciasComLigacoes(estadoAtual(), refs, undefined, criadas),
    [refs, ligacoes, obras, criadas], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const faltam = useMemo(() => [...new Set(semChicago.filter((r, i) => r.obraId !== refs[i]!.obraId && eObraDoLivro(r.obraId)).map((r) => r.obraId!))].sort(), [semChicago, refs])
  const carga = useCarregar(() => chicagoDasObras(faltam), faltam.join('|'), { manter: true })
  const chicagos = carga.fase === 'ok' ? carga.dados : null
  return useMemo(() => (chicagos && faltam.length > 0 ? referenciasComLigacoes(estadoAtual(), refs, chicagos, criadas) : semChicago), [semChicago, chicagos, faltam, refs, criadas])
}
