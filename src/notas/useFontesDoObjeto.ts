import { useMemo } from 'react'
import { fontesDosObjetos } from '../banco/consultas'
import { chaveDaFonte } from '../banco/referencias'
import { useNumeracao } from '../objetos-skc/atual'
import { idDeObjetoSkc } from '../objetos-skc/numeracao'
import { useCarregar } from '../ui/useCarregar'
import { OBRA_SKC } from './citacoes'

type Alvo = { tipo: string; ref: string }
const NENHUM: readonly Alvo[] = []

/**
 * Por onde as notas citam um objeto além do próprio número (decisão 40), para os links reversos (`ligadasAQualquer`):
 * a chave de cada referência dele nas fontes ("TESTE I:2", do pacote) e, num objeto SKC, o "SKC:n" e o número do
 * sistema (a tela do objeto SKC é pelo id OB-…, mas o texto o cita pelo número). Para outro tipo de alvo, nada.
 * Os números do grupo ligado não entram aqui: cada membro mostra as notas dele (Item, ObjetoSKC).
 */
export function useFontesDoObjeto(tipo: string, ref: string): readonly Alvo[] {
  const numeracao = useNumeracao()
  const objeto = tipo === 'objeto'
  const idSkc = objeto ? (idDeObjetoSkc(ref) ? ref : (numeracao.porNumero.get(ref) ?? null)) : null
  const info = idSkc ? numeracao.porId.get(idSkc) : undefined
  const doLivro = objeto && !idDeObjetoSkc(ref)
  const livro = useCarregar(() => (doLivro ? fontesDosObjetos([ref]) : Promise.resolve([])), doLivro ? ref : '')
  const refsDoLivro = livro.fase === 'ok' ? livro.dados : null
  return useMemo(() => {
    if (!objeto) return NENHUM
    const alvos: Alvo[] = []
    if (info?.numero && info.numero !== ref) alvos.push({ tipo: 'objeto', ref: info.numero })
    if (info?.nrSkc != null) alvos.push({ tipo: 'fonte', ref: chaveDaFonte(OBRA_SKC, info.nrSkc) })
    for (const r of refsDoLivro ?? []) alvos.push({ tipo: 'fonte', ref: chaveDaFonte(r.obra, r.numero, r.sufixo ?? '', !!r.abb) })
    return alvos.length === 0 ? NENHUM : alvos
  }, [objeto, ref, info?.numero, info?.nrSkc, refsDoLivro])
}
