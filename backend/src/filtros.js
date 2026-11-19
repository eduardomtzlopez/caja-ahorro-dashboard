// Convierte los filtros globales del dashboard (query string) en condiciones de MongoDB
// ?desde=2025-11&hasta=2026-10&institucion=CAJA-01&afiliacion=Individual

const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

export function leerFiltros(query) {
  const f = {};
  if (PERIODO.test(query.desde || '')) f.desde = query.desde;
  if (PERIODO.test(query.hasta || '')) f.hasta = query.hasta;
  if (query.institucion && query.institucion !== 'todas') f.institucion = String(query.institucion);
  if (query.afiliacion && query.afiliacion !== 'todas') f.afiliacion = String(query.afiliacion);
  return f;
}

// Condición $match para colecciones de hechos (campo mes 'AAAA-MM')
export function match(f, { conMes = true } = {}) {
  const m = {};
  if (conMes && (f.desde || f.hasta)) {
    m.mes = {};
    if (f.desde) m.mes.$gte = f.desde;
    if (f.hasta) m.mes.$lte = f.hasta;
  }
  if (f.institucion) m.institucion_id = f.institucion;
  if (f.afiliacion) m.tipo_afiliacion = f.afiliacion;
  return m;
}

// Mes anterior a 'AAAA-MM'
export function mesAnterior(mes) {
  let [a, m] = mes.split('-').map(Number);
  m -= 1;
  if (m === 0) { m = 12; a -= 1; }
  return `${a}-${String(m).padStart(2, '0')}`;
}
