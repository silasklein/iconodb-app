export const numeroPtBr = (n: number) => n.toLocaleString('pt-BR')

/** "3 objetos", "1 objeto". */
export const textoDeObjetos = (n: number) => `${numeroPtBr(n)} ${n === 1 ? 'objeto' : 'objetos'}`

/** "2 subcoleções", "1 subcoleção". */
export const textoDeSubcolecoes = (n: number) => `${numeroPtBr(n)} ${n === 1 ? 'subcoleção' : 'subcoleções'}`

/** "4.248 pendências", "1 pendência". */
export const textoDePendencias = (n: number) => `${numeroPtBr(n)} ${n === 1 ? 'pendência' : 'pendências'}`
