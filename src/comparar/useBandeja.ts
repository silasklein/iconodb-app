import { useMemo } from 'react'
import { useEstado } from '../usuario/estado'
import { contadorDaBandeja, lerBandeja, MAXIMO_DA_BANDEJA, REG_DA_BANDEJA, type BandejaVista } from './modelo'

export interface BandejaDeAgora extends BandejaVista {
  /** A bandeja tem os 4 lugares ocupados (ou mais, depois de uma fusão). */
  cheia: boolean
  /** "2/4": o contador do Menu, do botão do Item e da tela Comparar. */
  contador: string
  /** O hlc da última escrita no registro da bandeja (`null` enquanto ele não existe aqui). */
  alteradoEm: string | null
}

/** A bandeja de comparação de agora (sincronizada como o resto da camada do usuário); refaz só quando o registro dela muda. */
export function useBandeja(): BandejaDeAgora {
  const registro = useEstado((e) => e.registro('comparar', REG_DA_BANDEJA))
  return useMemo(() => {
    const b = lerBandeja(registro)
    return { ...b, cheia: b.todos.length >= MAXIMO_DA_BANDEJA, contador: contadorDaBandeja(b.todos.length), alteradoEm: registro?.alteradoEm ?? null }
  }, [registro])
}
