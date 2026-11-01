/** A obra (publicação + volume) como aparece nas abas das Coleções e na trilha do Grupo. */
export const chaveDaObra = (publicacao: string, volume: string) => (volume ? `${publicacao}-${volume}` : publicacao)
export const rotuloDaObra = (publicacao: string, volume: string) => `${publicacao} ${volume}`.trim()
