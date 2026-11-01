import { concluirLoginDetalhado } from './auth'

/**
 * - falhou: sem login pendente aqui, state diferente ou troca recusada;
 * - sem-conexao: a troca não pôde ser feita por falta de rede (o login pendente fica guardado);
 * - acesso-negado: o usuário não autorizou o app no Dropbox.
 */
export type ResultadoRetorno = 'sem-retorno' | 'concluido' | 'falhou' | 'sem-conexao' | 'acesso-negado'

/** Parâmetros que o Dropbox acrescenta à URL ao voltar (fica na query, não no hash do HashRouter). */
const PARAMETROS_DO_RETORNO = ['code', 'state', 'error', 'error_description']

/**
 * Chamado quando o app abre. Se a URL é um retorno do Dropbox (`?code=…&state=…`
 * ou `?error=…`), tira esses parâmetros da barra de endereço (o código é de uso
 * único e não deve ficar no histórico) e conclui o login.
 *
 * A URL é limpa antes de esperar a rede: uma segunda chamada (StrictMode) já não
 * encontra o `code` e não tenta trocá-lo de novo.
 */
export async function processarRetornoDoLogin(): Promise<ResultadoRetorno> {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('code') && !url.searchParams.has('error')) return 'sem-retorno'

  const urlDeRetorno = url.href
  for (const nome of PARAMETROS_DO_RETORNO) url.searchParams.delete(nome)
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)

  try {
    const r = await concluirLoginDetalhado(urlDeRetorno)
    if (r === 'ok') return 'concluido'
    if (r === 'sem-conexao' || r === 'acesso-negado') return r
    return 'falhou'
  } catch {
    return 'falhou'
  }
}
