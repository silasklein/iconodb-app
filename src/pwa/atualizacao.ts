/**
 * Atualização do app instalado. O service worker novo espera (registerType "prompt"): o app só
 * recarrega quando o usuário aceita o aviso, nunca por conta própria (e nunca durante o primeiro
 * download: ver AvisoDeAtualizacao).
 */
import { useSyncExternalStore } from 'react'

let pendente = false
let aplicar: (() => Promise<void>) | null = null
const ouvintes = new Set<() => void>()

function avisar(): void {
  for (const o of ouvintes) o()
}

/** Marca (ou desmarca) que há versão nova esperando. `aplicar` ativa o service worker novo e recarrega. */
export function definirAtualizacao(estado: { pendente: boolean; aplicar?: () => Promise<void> }): void {
  pendente = estado.pendente
  aplicar = estado.aplicar ?? aplicar
  avisar()
}

export function useAtualizacaoPendente(): { pendente: boolean; recarregar: () => void } {
  const p = useSyncExternalStore(
    (ouvir) => {
      ouvintes.add(ouvir)
      return () => ouvintes.delete(ouvir)
    },
    () => pendente,
  )
  return { pendente: p, recarregar: () => void aplicar?.() }
}

/**
 * O "Recarregar" do aviso. Com um service worker novo esperando, pede que ele assuma (`atualizar`);
 * o app recarrega quando ele assume. Sem registro ou sem worker esperando (outra aba já ativou a versão
 * nova, ou o registro ainda não chegou), recarregar basta. Uma falha ao pedir também acaba em recarregar.
 */
export async function aplicarAtualizacao(
  registro: Pick<ServiceWorkerRegistration, 'waiting'> | undefined,
  atualizar: (recarregar: boolean) => Promise<void>,
  recarregar: () => void = () => window.location.reload(),
): Promise<void> {
  if (!registro?.waiting) {
    recarregar()
    return
  }
  try {
    await atualizar(true)
  } catch (erro) {
    console.warn('IconoDB: a versão nova não assumiu; recarregando.', erro)
    recarregar()
  }
}

/** Registra o service worker (só no build publicado e em navegador que o tem). */
export async function registrarServiceWorker(): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const { registerSW } = await import('virtual:pwa-register')
  let registro: ServiceWorkerRegistration | undefined
  const atualizar = registerSW({
    onRegisteredSW(_url, r) {
      registro = r
    },
    onNeedRefresh() {
      definirAtualizacao({ pendente: true, aplicar: () => aplicarAtualizacao(registro, atualizar) })
    },
    onRegisterError(erro) {
      console.warn('Service worker não registrado:', erro)
    },
  })
}
