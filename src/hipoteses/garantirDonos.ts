import { numerosDosTrechos } from '../banco/consultas'
import { useEffect, useSyncExternalStore } from 'react'
import { estadoAtual, useEstado, type Estado } from '../usuario/estado'
import { assinarOsDonos, guardarOsDonos, jaPerguntado, versaoDosDonos } from './donos'
import { lerAncora } from './modelo'

/**
 * Pergunta ao pacote de que objeto é cada trecho do livro em que uma hipótese está ancorada (e que ainda não se perguntou).
 * Nunca lança: sem pacote ou com o banco ocupado, as hipóteses seguem no objeto em que foram registradas.
 */
export async function garantirOsDonosDosTrechos(estado: Estado): Promise<void> {
  const faltam = new Set<string>()
  for (const r of estado.registros.get('hipotese')?.values() ?? []) {
    if (r.excluido) continue
    const a = lerAncora(r.campos.ancora)
    if (a && a.lingua !== 'skc' && !jaPerguntado(a.fonte)) faltam.add(a.fonte)
  }
  if (faltam.size === 0) return
  const lista = [...faltam]
  try {
    guardarOsDonos(lista, await numerosDosTrechos(lista))
  } catch {
    // sem resposta agora: tenta de novo na próxima vez
  }
}

/** Para as telas: lê os donos dos trechos e devolve a versão do que se sabe (muda quando chega uma resposta). */
export function useDonosDosTrechos(): number {
  const hipoteses = useEstado((e) => e.registros.get('hipotese'))
  const versao = useSyncExternalStore(assinarOsDonos, versaoDosDonos)
  // Depende também da versão: trocado o pacote (o cache se esvazia), pergunta de novo na tela aberta (revisão 1, m5).
  useEffect(() => {
    void garantirOsDonosDosTrechos(estadoAtual())
  }, [hipoteses, versao])
  return versao
}
