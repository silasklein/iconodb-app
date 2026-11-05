/**
 * A nota de um item dentro de uma coleção. É uma nota COMUM da Tarefa 6 (mesmo editor, mesmo rascunho com a rede de
 * segurança, mesma leitura limpa): só o alvo muda. `alvoTipo` = 'colecao-item' e `alvo` = `<id da coleção>/<ref do
 * objeto>`. A nota é da coleção, não do objeto: tirar o objeto e pô-lo de volta traz a nota de volta, e a nota
 * continua achável em Minhas notas (e na busca, no escopo "coleção") mesmo que a coleção seja excluída.
 */
import { refDeObjeto } from './modelo'

const ID_DE_COLECAO = /^CO-[a-z0-9]{8}-\d+$/

export function refDoAlvoDoItem(colecao: string, objeto: string): string {
  return `${colecao}/${refDeObjeto(objeto) ?? objeto}`
}

export function partesDoAlvoDoItem(ref: string): { colecao: string; objeto: string } | null {
  const i = ref.indexOf('/')
  if (i < 0) return null
  const colecao = ref.slice(0, i)
  const objeto = refDeObjeto(ref.slice(i + 1))
  return ID_DE_COLECAO.test(colecao) && objeto ? { colecao, objeto } : null
}
