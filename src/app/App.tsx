import { HashRouter } from 'react-router'
import { AppRoutes } from './routes'

// HashRouter: o GitHub Pages não reescreve caminhos, e o retorno do login
// do Dropbox precisa cair na raiz do app.
export function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  )
}
