import { HashRouter } from 'react-router'
import { RetornoDoLogin } from './RetornoDoLogin'
import { AppRoutes } from './routes'

// HashRouter: o GitHub Pages não reescreve caminhos, e o retorno do login
// do Dropbox precisa cair na raiz do app.
export function App() {
  return (
    <HashRouter>
      <RetornoDoLogin />
      <AppRoutes />
    </HashRouter>
  )
}
