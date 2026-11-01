/** Sai do app para uma URL (isolado para os testes poderem interceptar). */
export function irPara(url: string): void {
  window.location.assign(url)
}
