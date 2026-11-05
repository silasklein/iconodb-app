import { HashRouter } from 'react-router'
import { AvisoDeAtualizacao } from '../pwa/AvisoDeAtualizacao'
import { IndiceDoUsuario } from '../usuario/IndiceDoUsuario'
import { NumerosDoPacote } from '../objetos-skc/NumerosDoPacote'
import { SincronizacaoAutomatica } from '../usuario/useSincronizacao'
import { RetornoDoLogin } from './RetornoDoLogin'
import { AppRoutes } from './routes'

// HashRouter: o GitHub Pages não reescreve caminhos, e o retorno do login
// do Dropbox precisa cair na raiz do app. A sincronização da camada do usuário (gatilhos automáticos e
// Ctrl/⌘S) vale no app todo.
export function App() {
  return (
    <HashRouter>
      <SincronizacaoAutomatica />
      <NumerosDoPacote />
      <IndiceDoUsuario />
      <RetornoDoLogin />
      <AppRoutes />
      <AvisoDeAtualizacao />
    </HashRouter>
  )
}
