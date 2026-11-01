import type { ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { Entrar } from '../telas/Entrar'
import { Preparando } from '../telas/Preparando'

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
  { path: '/', elemento: <Provisoria titulo="Início" /> },
  { path: '/entrar', elemento: <Entrar /> },
  { path: '/preparando', elemento: <Preparando /> },
  { path: '/busca', elemento: <Provisoria titulo="Busca" /> },
  { path: '/colecoes', elemento: <Provisoria titulo="Coleções" /> },
  { path: '/grupo/:id', elemento: <Provisoria titulo="Grupo" /> },
  { path: '/item/:id', elemento: <Provisoria titulo="Item" /> },
  { path: '/imagem/:id', elemento: <Provisoria titulo="Imagem" /> },
  { path: '/glossario', elemento: <Provisoria titulo="Glossário" /> },
  { path: '/verbete/:id', elemento: <Provisoria titulo="Verbete" /> },
  { path: '/bibliografia', elemento: <Provisoria titulo="Bibliografia" /> },
  { path: '/obra/:id', elemento: <Provisoria titulo="Obra" /> },
  { path: '/sitios', elemento: <Provisoria titulo="Sítios" /> },
  { path: '/sitio/:id', elemento: <Provisoria titulo="Sítio" /> },
  { path: '/revisao', elemento: <Provisoria titulo="Revisão" /> },
  { path: '/atalhos', elemento: <Provisoria titulo="Atalhos" /> },
]

export function AppRoutes() {
  return (
    <Routes>
      {ROTAS.map((r) => (
        <Route key={r.path} path={r.path} element={r.elemento} />
      ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
