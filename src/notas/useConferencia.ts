import { useCallback, useEffect, useState } from 'react'
import { aoReabrir } from '../banco/cliente'
import { trechosDaFonte } from '../banco/consultas'
import { registrar } from '../usuario/estado'
import { avaliarAncoras, reconferir, type Conferencia } from './ancora'
import type { NotaVista } from './indiceDeNotas'

/**
 * O texto da fonte mudou desde que a nota foi escrita? (spec §7.6) Compara o sha guardado em cada âncora da nota com o
 * texto de agora do trecho, no pacote. Sem âncoras, ou enquanto o pacote não responde, não há conferência (nunca um
 * aviso falso; nem com o pacote sem publicações abertas, a "fonte indisponível"). `conferi()` grava as âncoras de agora: o aviso some até a fonte mudar de novo.
 */
export function useConferencia(nota: Pick<NotaVista, 'id' | 'ancoras'>): { conferencia: Conferencia | null; conferi: () => Promise<void> } {
  const [conferencia, setConferencia] = useState<Conferencia | null>(null)
  const [geracao, setGeracao] = useState(0)
  const assinatura = nota.ancoras.map((a) => `${a.p}:${a.sha}`).join('|')

  // O pacote foi reaberto (uma sincronização trouxe outra edição do livro): conferir de novo.
  useEffect(() => aoReabrir(() => setGeracao((g) => g + 1)), [])

  useEffect(() => {
    if (nota.ancoras.length === 0) {
      setConferencia(null)
      return
    }
    let vivo = true
    trechosDaFonte(nota.ancoras.map((a) => a.p)).then(
      // Fonte indisponível (null): nada a dizer, nem aviso falso de "o trecho saiu".
      (trechos) => (trechos === null ? vivo && setConferencia(null) : avaliarAncoras(nota.ancoras, trechos).then((c) => vivo && setConferencia(c.estado === 'ok' ? null : c))),
      () => vivo && setConferencia(null),
    )
    return () => {
      vivo = false
    }
    // `nota.ancoras` muda de identidade a cada leitura; a assinatura é o que conta.
  }, [assinatura, geracao]) // eslint-disable-line react-hooks/exhaustive-deps

  const conferi = useCallback(async () => {
    const trechos = await trechosDaFonte(nota.ancoras.map((a) => a.p))
    // Sem a fonte não há o que conferir: as âncoras ficam como estão (reconferir() tiraria todas como "sumiram").
    if (trechos === null) throw new Error('Fonte indisponível: abra o pacote para conferir.')
    await registrar('nota', nota.id, 'alterar', { ancoras: await reconferir(nota.ancoras, trechos) } as never)
  }, [nota.id, assinatura]) // eslint-disable-line react-hooks/exhaustive-deps

  return { conferencia, conferi }
}
