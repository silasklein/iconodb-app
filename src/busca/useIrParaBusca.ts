import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { caminhoDaBusca } from './url'

/** Para o campo de busca do Início e da barra superior: vai a `#/busca?q=…`. */
export function useIrParaBusca(): (texto: string) => void {
  const navegar = useNavigate()
  return useCallback((texto: string) => navegar(caminhoDaBusca(texto)), [navegar])
}
