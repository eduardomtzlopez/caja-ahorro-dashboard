// Formatos de números en español de México
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const pesos = (v) => (v == null ? '—' : v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }));

export const millones = (v) => {
  if (v == null) return '—';
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toLocaleString('es-MX', { maximumFractionDigits: 0 })} mil`;
  return pesos(v);
};

export const pct = (v, dec = 1) => (v == null ? '—' : `${(v * 100).toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec })}\u00a0%`);

export const entero = (v) => (v == null ? '—' : Math.round(v).toLocaleString('es-MX'));

export const mesCorto = (m) => {
  if (!m) return '';
  const [a, n] = m.split('-');
  return `${MESES[Number(n) - 1]} ${a.slice(2)}`;
};

export const mesLargo = (m) => {
  if (!m) return '';
  const [a, n] = m.split('-');
  const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${nombres[Number(n) - 1]} ${a}`;
};
