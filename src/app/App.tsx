import { HashRouter } from 'react-router'
import { AvisoDeAtualizacao } from '../pwa/AvisoDeAtualizacao'
import { RetornoDoLogin } from './RetornoDoLogin'
import { AppRoutes } from './routes'

// HashRouter: o GitHub Pages não reescreve caminhos, e o retorno do login
// do Dropbox precisa cair na raiz do app.
export function App() {
  return (
    <HashRouter>
      <RetornoDoLogin />
      <AppRoutes />
      <AvisoDeAtualizacao />
    </HashRouter>
  )
}
