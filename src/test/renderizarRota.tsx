import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { ROTAS } from '../app/routes'
import { lerTabelaDeFold, usarTabelaDeFold } from '../busca/fold'

/** A tabela de dobra do pacote sintético, para as listas que filtram pelo texto dobrado. */
export function usarFoldDoPacoteSintetico(): void {
  usarTabelaDeFold(lerTabelaDeFold(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/fold.json'), 'utf8'))))
}

let navegarAgora: NavigateFunction | null = null
/** Navega como o histórico do navegador faria (por exemplo `irPara(-1)` é o Voltar). Dentro de `act`. */
export function irPara(...args: Parameters<NavigateFunction> | [caminho: string]): void {
  if (!navegarAgora) throw new Error('renderizarRota ainda não foi chamado')
  void (navegarAgora as (...a: unknown[]) => unknown)(...args)
}

/** Mostra o endereço atual (para os testes conferirem a navegação) e, em `data-estado`, o `state` da navegação (JSON). */
function Endereco() {
  navegarAgora = useNavigate()
  const { pathname, search, state } = useLocation()
  return (
    <div data-testid="endereco" data-estado={JSON.stringify(state ?? null)}>
      {`${pathname}${search}`}
    </div>
  )
}

/** Renderiza as rotas do app (sem a barra superior) a partir de `url`. */
export function renderizarRota(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        {ROTAS.map((r) => (
          <Route key={r.path} path={r.path} element={r.elemento} />
        ))}
      </Routes>
      <Endereco />
    </MemoryRouter>,
  )
}
