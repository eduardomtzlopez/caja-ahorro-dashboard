// Metas y umbrales de los KPIs (definidos en el entregable 4.2.2)
export const METAS = {
  morosidad: { meta: 0.05, verde: 0.03 },          // verde < 3 %, amarillo 3–5 %, rojo > 5 %
  aprobacion: { min: 0.60, max: 0.80 },             // banda objetivo de tasa de aprobación
  captacionCaidaMax: -0.03,                          // alerta si cae más de 3 % mensual
  reclamacionesDiasMax: 30,                          // resolver en máximo 30 días
};

export function semaforoMorosidad(valor) {
  if (valor > METAS.morosidad.meta) return 'rojo';
  if (valor >= METAS.morosidad.verde) return 'amarillo';
  return 'verde';
}

export const variacion = (actual, anterior) => (anterior ? (actual - anterior) / anterior : null);
