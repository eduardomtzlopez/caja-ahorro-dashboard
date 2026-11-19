// Cliente de la API REST (Express)
const BASE = import.meta.env.VITE_API_URL || '/api';

export async function api(ruta, filtros = {}) {
  const params = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v && v !== 'todas'));
  const res = await fetch(`${BASE}/${ruta}${params.size ? `?${params}` : ''}`);
  if (!res.ok) throw new Error(`Error ${res.status} al consultar ${ruta}`);
  return res.json();
}
