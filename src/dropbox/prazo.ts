/**
 * Prazo nas chamadas ao Dropbox: sem ele, uma conexão que fica pendurada (rede ruim, Wi-Fi que
 * caiu sem o navegador perceber) congela a tela de progresso para sempre.
 *
 * O prazo é de INATIVIDADE: vale até a resposta chegar e, depois, entre um pedaço e outro do
 * corpo. Um arquivo grande numa rede lenta não é cortado enquanto os bytes continuam chegando.
 * Estourado, a chamada falha com um DOMException "TimeoutError", que src/dropbox/rede.ts trata
 * como falha de rede (tenta de novo; depois, "Sem conexão…").
 */

export const PRAZO_ARQUIVO_MS = 60_000
export const PRAZO_CURTO_MS = 20_000

const tempoEsgotado = () => new DOMException('O Dropbox não respondeu a tempo.', 'TimeoutError')

/** Um fetch que aborta (TimeoutError) depois de `ms` sem resposta ou sem bytes novos no corpo. */
export function fetchComPrazo(ms: number, base: typeof fetch = (...a) => globalThis.fetch(...a)): typeof fetch {
  return async (entrada, init) => {
    const controle = new AbortController()
    const externo = init?.signal
    if (externo) {
      if (externo.aborted) controle.abort(externo.reason)
      else externo.addEventListener('abort', () => controle.abort(externo.reason), { once: true })
    }
    let relogio: ReturnType<typeof setTimeout> | undefined
    const armar = () => {
      clearTimeout(relogio)
      relogio = setTimeout(() => controle.abort(tempoEsgotado()), ms)
    }
    const desarmar = () => clearTimeout(relogio)

    if (controle.signal.aborted) throw controle.signal.reason
    armar()
    let resposta: Response
    try {
      resposta = await base(entrada, { ...init, signal: controle.signal })
    } catch (erro) {
      desarmar()
      throw controle.signal.aborted ? controle.signal.reason : erro
    }
    if (!resposta.body) {
      desarmar()
      return resposta
    }

    // Abortar o sinal do fetch também derruba a leitura do corpo em andamento (é o que o fetch faz).
    armar()
    const leitor = resposta.body.getReader()
    const corpo = new ReadableStream<Uint8Array>({
      async pull(saida) {
        try {
          const { done, value } = await leitor.read()
          if (done) {
            desarmar()
            // Corpo que acabou por causa do aborto não é um corpo inteiro.
            if (controle.signal.aborted) saida.error(controle.signal.reason)
            else saida.close()
            return
          }
          armar()
          saida.enqueue(value)
        } catch (erro) {
          desarmar()
          saida.error(controle.signal.aborted ? controle.signal.reason : erro)
        }
      },
      cancel(motivo) {
        desarmar()
        return leitor.cancel(motivo)
      },
    })
    return new Response(corpo, { status: resposta.status, statusText: resposta.statusText, headers: resposta.headers })
  }
}
