type Ouvinte = (e: { matches: boolean }) => void

/** Instala um matchMedia falso controlado pela largura da janela (só entende `min-width: Npx`). Devolve quem muda a largura. */
export function instalarMatchMedia(larguraInicial: number): (nova: number) => void {
  let largura = larguraInicial
  const ouvintes = new Set<Ouvinte>()
  const avalia = (consulta: string) => {
    const m = /min-width:\s*(\d+)px/.exec(consulta)
    return m ? largura >= Number(m[1]) : false
  }
  window.matchMedia = ((consulta: string) => ({
    get matches() {
      return avalia(consulta)
    },
    media: consulta,
    addEventListener: (_: string, f: Ouvinte) => ouvintes.add(f),
    removeEventListener: (_: string, f: Ouvinte) => ouvintes.delete(f),
  })) as unknown as typeof window.matchMedia
  return (nova) => {
    largura = nova
    for (const f of ouvintes) f({ matches: nova >= 768 })
  }
}
