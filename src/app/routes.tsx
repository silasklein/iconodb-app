import type { ReactElement } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { Busca } from '../telas/Busca'
import { Bibliografia } from '../telas/Bibliografia'
import { Colecoes } from '../telas/Colecoes'
import { Comparar } from '../telas/Comparar'
import { Entrar } from '../telas/Entrar'
import { Exportar } from '../telas/Exportar'
import { Glossario } from '../telas/Glossario'
import { Grupo } from '../telas/Grupo'
import { Imagem } from '../telas/Imagem'
import { Item } from '../telas/Item'
import { Inicio } from '../telas/Inicio'
import { MinhasNotas } from '../telas/MinhasNotas'
import { NovoObjeto } from '../telas/NovoObjeto'
import { Preparando } from '../telas/Preparando'
import { Revisao } from '../telas/Revisao'
import { Sincronizacao } from '../telas/Sincronizacao'
import { NovoSitio } from '../sitios/NovoSitio'
import { Sitios } from '../telas/Sitios'
import { BarraSuperior } from '../ui/BarraSuperior'
import { useBreakpoint } from '../ui/useBreakpoint'
import { Atalhos } from '../telas/Atalhos'
import { RotaInicial } from './RotaInicial'
import { AtalhosGlobais } from './useAtalhosDeNavegacao'
import { useRestaurarRolagem } from './useRestaurarRolagem'

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
  // Criar um objeto SKC (Tarefa 9). O objeto aberto é /item/<número> ou /item/<OB-…> (o Item resolve os dois).
  { path: '/objeto/novo', elemento: <NovoObjeto /> },
  { path: '/imagem/:id', elemento: <Imagem /> },
  // O Glossário é também a tela de /verbete/:id (lista e verbete juntos no computador): o mesmo elemento nas duas rotas.
  { path: '/glossario', elemento: <Glossario /> },
  { path: '/verbete/:id', elemento: <Glossario /> },
  { path: '/bibliografia', elemento: <Bibliografia /> },
  { path: '/obra/:id', elemento: <Bibliografia /> },
  { path: '/sitios', elemento: <Sitios /> },
  // Criar um sítio do usuário (Tarefa 12). `?nome=` e `?para=<objeto>` vêm de "Novo sítio com mais dados…" na ficha de um objeto.
  { path: '/sitios/novo', elemento: <NovoSitio /> },
  { path: '/sitio/:id', elemento: <Sitios /> },
  { path: '/revisao', elemento: <Revisao /> },
  { path: '/atalhos', elemento: <Atalhos /> },
  { path: '/notas', elemento: <MinhasNotas /> },
  // A nota aberta é também a tela de /nota/:id ("nova" cria uma): no computador a lista e a nota juntas, no celular a nota sozinha.
  { path: '/nota/:id', elemento: <MinhasNotas /> },
  { path: '/sincronizacao', elemento: <Sincronizacao /> },
  // A bandeja de comparação (Tarefa 14): até 4 objetos lado a lado.
  { path: '/comparar', elemento: <Comparar /> },
  // As exportações (Tarefa 15): a cópia de segurança, as regiões (W3C Web Annotation) e as hipóteses para o MEDIATION.
  { path: '/exportar', elemento: <Exportar /> },
]

/**
 * Telas sem a barra superior: a entrada e o primeiro download (antes de haver o que consultar) e o
 * visualizador de imagem (tela cheia). Um item que termina em "/" vale para tudo sob esse caminho.
 */
export const SEM_BARRA_SUPERIOR = ['/entrar', '/preparando', '/imagem/']
const semBarraSuperior = (pathname: string) => SEM_BARRA_SUPERIOR.some((p) => (p.endsWith('/') ? pathname.startsWith(p) : pathname === p))

/**
 * A barra superior das telas de computador (a partir de 768 px) fica fora das rotas, para
 * não remontar a cada tela. No Início o campo de busca é o da própria tela.
 */
function BarraDasTelasLargas({ noInicio = false }: { noInicio?: boolean }) {
  const { pathname } = useLocation()
  const computador = useBreakpoint() === 'computador'
  if (!computador || semBarraSuperior(pathname)) return null
  // Em "/" a barra só vem com o Início, depois que a guarda decidiu (RotaInicial): antes disso, ou se
  // o destino for outro, não há o que consultar e a barra não deve nem consultar o banco.
  if (pathname === '/' && !noInicio) return null
  return <BarraSuperior busca={pathname !== '/'} />
}

export function AppRoutes() {
  useRestaurarRolagem()
  return (
    <>
      <AtalhosGlobais />
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
