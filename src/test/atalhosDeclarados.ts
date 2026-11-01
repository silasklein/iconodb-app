import { CATALOGO } from '../app/atalhos'

const normalizar = (t: string) => (t.length === 1 ? t.toLowerCase() : t)

/**
 * Os valores de `aria-keyshortcuts` de `raiz` que o catálogo de atalhos não declara. Cada valor é uma lista
 * de teclas separadas por espaço ("Z +", "g c"); cada tecla tem de ser uma das declaradas (letras sem distinguir caixa).
 */
export function teclasNaoDeclaradas(raiz: ParentNode): string[] {
  const declaradas = new Set(CATALOGO.flatMap((d) => d.teclas.flatMap((t) => t.split(' '))).map(normalizar))
  const achadas = [...raiz.querySelectorAll('[aria-keyshortcuts]')].flatMap((el) => el.getAttribute('aria-keyshortcuts')!.split(/\s+/).filter(Boolean))
  return [...new Set(achadas)].filter((t) => !declaradas.has(normalizar(t)))
}
