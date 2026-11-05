/**
 * O processamento de uma imagem fora da thread principal (processar.ts): recebe o arquivo, devolve a tela, a
 * miniatura e o modo. Sem OffscreenCanvas (ou sem convertToBlob) responde "sem suporte" e a página faz o trabalho.
 * O original não volta (a página já o tem).
 */
import { ambienteDoWorker } from './ambiente'
import { processarCom, type RespostaDoWorker } from './processar'

self.onmessage = async (e: MessageEvent<{ arquivo: File | Blob }>) => {
  let resposta: RespostaDoWorker
  try {
    const r = await processarCom(ambienteDoWorker(), e.data.arquivo)
    resposta = { ok: { ...r, original: new Blob() } }
  } catch (erro) {
    resposta = { erro: { nome: erro instanceof Error ? erro.name : 'Error', mensagem: erro instanceof Error ? erro.message : String(erro) } }
  }
  ;(self as unknown as Worker).postMessage(resposta)
}
