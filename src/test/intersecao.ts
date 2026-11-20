/**
 * Um IntersectionObserver falso (o jsdom não tem): nada está à vista até o teste dizer (`mudar`), e então os observadores de
 * todos os alvos observados recebem a entrada. `remover` volta a janela ao que era.
 */
export function instalarIntersecao(): { mudar: (visivel: boolean) => void; remover: () => void } {
  const antes = window.IntersectionObserver
  const observadores = new Set<{ alvos: Set<Element>; aviso: IntersectionObserverCallback; eu: IntersectionObserver }>()
  class Falso {
    private readonly registro: { alvos: Set<Element>; aviso: IntersectionObserverCallback; eu: IntersectionObserver }
    constructor(aviso: IntersectionObserverCallback) {
      this.registro = { alvos: new Set(), aviso, eu: this as unknown as IntersectionObserver }
      observadores.add(this.registro)
    }
    observe(alvo: Element) {
      this.registro.alvos.add(alvo)
    }
    unobserve(alvo: Element) {
      this.registro.alvos.delete(alvo)
    }
    disconnect() {
      this.registro.alvos.clear()
      observadores.delete(this.registro)
    }
    takeRecords() {
      return []
    }
  }
  window.IntersectionObserver = Falso as unknown as typeof IntersectionObserver
  return {
    mudar(visivel) {
      for (const o of [...observadores]) {
        const entradas = [...o.alvos].map((target) => ({ target, isIntersecting: visivel, intersectionRatio: visivel ? 1 : 0 }) as unknown as IntersectionObserverEntry)
        if (entradas.length > 0) o.aviso(entradas, o.eu)
      }
    },
    remover() {
      window.IntersectionObserver = antes
    },
  }
}
