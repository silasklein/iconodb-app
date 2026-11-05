/**
 * Os nomes da linha dos "sítios não resolvidos" da fila de revisão. A contagem de AGORA é a de `sitiosNaoResolvidos`
 * (src/sitios/doUsuario.ts), somada à fila do pacote em src/revisao/fila.ts, que o Menu, o ponto da barra e a Revisão usam.
 *
 * O pipeline grava DOIS motivos de sítio (`db/build.py`, `_problem_reason`): `sitio_nao_resolvido` (o nome do campo 3 não achou
 * sítio; o pacote real só tem este, com o candidato no detalhe) e `sitio_nao_normalizado` (a quadrícula veio em formato que o
 * processamento não reconhece). Os dois são o mesmo trabalho para a pessoa: ligar o objeto a um sítio.
 */
export const MOTIVOS_DOS_SITIOS: ReadonlySet<string> = new Set(['sitio_nao_resolvido', 'sitio_nao_normalizado'])
export const ehMotivoDeSitio = (motivo: string): boolean => MOTIVOS_DOS_SITIOS.has(motivo)
export const ROTULO_DOS_SITIOS = 'Sítios não resolvidos'
