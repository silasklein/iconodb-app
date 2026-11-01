import type { ReactElement } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { Busca } from '../telas/Busca'
import { Colecoes } from '../telas/Colecoes'
import { Entrar } from '../telas/Entrar'
import { Grupo } from '../telas/Grupo'
import { Item } from '../telas/Item'
import { Inicio } from '../telas/Inicio'
import { MinhasNotas } from '../telas/MinhasNotas'
import { Preparando } from '../telas/Preparando'
import { Revisao } from '../telas/Revisao'
import { BarraSuperior } from '../ui/BarraSuperior'
import { useBreakpoint } from '../ui/useBreakpoint'
import { RotaInicial } from './RotaInicial'

/** Tela provisória: cada tarefa seguinte troca a sua pela tela real. */
function Provisoria({ titulo }: { titulo: string }) {
  return (
    <main style={{ padding: '24px' }}>
      <h1 style={{ margin: 0, fontSize: 24 }}>{titulo}</h1>
      <p style={{ color: 'var(--secundario)' }}>Tela em construção.</p>
    </main>
  )
}

export interface Rota {
  path: string
  elemento: ReactElement
}

export const ROTAS: Rota[] = [
  {
    path: '/',
    elemento: (
      <RotaInicial>
        <BarraDasTelasLargas noInicio />
        <Inicio />
      </RotaInicial>
    ),
  },
  { path: '/entrar', elemento: <Entrar /> },
  { path: '/preparando', elemento: <Preparando /> },
  { path: '/busca', elemento: <Busca /> },
  { path: '/colecoes', elemento: <Colecoes /> },
  { path: '/grupo/:id', elemento: <Grupo /> },
  { path: '/item/:numero', elemento: <Item /> },
  { path: '/imagem/:id', elemento: <Provisoria titulo="Imagem" /> },
  { path: '/glossario', elemento: <Provisoria titulo="Glossário" /> },
  { path: '/verbete/:id', elemento: <Provisoria titulo="Verbete" /> },
  { path: '/bibliografia', elemento: <Provisoria titulo="Bibliografia" /> },
  { path: '/obra/:id', elemento: <Provisoria titulo="Obra" /> },
  { path: '/sitios', elemento: <Provisoria titulo="Sítios" /> },
  { path: '/sitio/:id', elemento: <Provisoria titulo="Sítio" /> },
  { path: '/revisao', elemento: <Revisao /> },
  { path: '/atalhos', elemento: <Provisoria titulo="Atalhos" /> },
  { path: '/notas', elemento: <MinhasNotas /> },
]

/** Telas sem a barra superior: a entrada e o primeiro download (antes de haver o que consultar). */
export const SEM_BARRA_SUPERIOR = ['/entrar', '/preparando']

/**
 * A barra superior das telas de computador (a partir de 768 px) fica fora das rotas, para
 * não remontar a cada tela. No Início o campo de busca é o da própria tela.
 */
function BarraDasTelasLargas({ noInicio = false }: { noInicio?: boolean }) {
  const { pathname } = useLocation()
  const computador = useBreakpoint() === 'computador'
  if (!computador || SEM_BARRA_SUPERIOR.includes(pathname)) return null
  // Em "/" a barra só vem com o Início, depois que a guarda decidiu (RotaInicial): antes disso, ou se
  // o destino for outro, não há o que consultar e a barra não deve nem consultar o banco.
  if (pathname === '/' && !noInicio) return null
  return <BarraSuperior busca={pathname !== '/'} />
}

export function AppRoutes() {
  return (
    <>
      <BarraDasTelasLargas />
      <Routes>
        {ROTAS.map((r) => (
          <Route key={r.path} path={r.path} element={r.elemento} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
