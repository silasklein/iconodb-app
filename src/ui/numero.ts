export const numeroPtBr = (n: number) => n.toLocaleString('pt-BR')

/** "4.248 pendências", "1 pendência". */
export const textoDePendencias = (n: number) => `${numeroPtBr(n)} ${n === 1 ? 'pendência' : 'pendências'}`
