import { useEffect } from 'react'
import { useNavigate } from 'react-router'

/**
 * Atalhos globais de ir a uma seção (auditoria UX, seção 4): `g` e depois a letra. `?` abre a
 * lista de atalhos. Não sequestram teclas do navegador (nada com modificador) e não valem
 * em campos de texto nem com um diálogo modal aberto. É um hook solto: a Tarefa 11 o generaliza no registro de atalhos.
 */
export const ATALHOS_DE_IR: Record<string, string> = {
  i: '/',
  c: '/colecoes',
  l: '/glossario',
  s: '/sitios',
  b: '/bibliografia',
  r: '/revisao',
}

export const CAMINHO_DOS_ATALHOS = '/atalhos'
const ESPERA_DA_SEGUNDA_TECLA_MS = 1500

export function emCampoDeTexto(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

export function useAtalhosDeNavegacao(): void {
  const navegar = useNavigate()
  useEffect(() => {
    let esperando = false
    let relogio: ReturnType<typeof setTimeout> | undefined
    const parar = () => {
      esperando = false
      clearTimeout(relogio)
    }
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || emCampoDeTexto(e.target)) return
      // Com um diálogo modal aberto (o Menu, uma folha), as teclas são dele.
      if (document.querySelector('[aria-modal="true"]')) return
      if (esperando) {
        const caminho = ATALHOS_DE_IR[e.key.toLowerCase()]
        parar()
        if (caminho) {
          e.preventDefault()
          navegar(caminho)
        }
        return
      }
      if (e.key === 'g') {
        esperando = true
        relogio = setTimeout(parar, ESPERA_DA_SEGUNDA_TECLA_MS)
      } else if (e.key === '?') {
        e.preventDefault()
        navegar(CAMINHO_DOS_ATALHOS)
      }
    }
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      parar()
    }
  }, [navegar])
}
