import { useEstado } from '../usuario/estado'
import { indiceDeNotas, type IndiceDeNotas } from './indiceDeNotas'

/** O índice das notas do estado de agora (links reversos, Minhas notas). Refeito só quando o conjunto de notas muda. */
export const useIndiceDeNotas = (): IndiceDeNotas => useEstado(indiceDeNotas)
