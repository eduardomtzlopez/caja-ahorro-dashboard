// Tarjeta KPI (BAN): número grande, variación contra el mes anterior y alerta opcional
import { pct } from '../formato.js';

export function Variacion({ valor, invertida = false, puntos = false, etiqueta = 'vs mes anterior' }) {
  if (valor == null) return <span className="var neutra">Sin dato previo</span>;
  const sube = valor >= 0;
  const buena = invertida ? !sube : sube;
  return (
    <span className={`var ${buena ? 'buena' : 'mala'}`}>
      <span aria-hidden>{sube ? '▲' : '▼'}</span> {puntos ? `${(Math.abs(valor) * 100).toFixed(1)} pp` : pct(Math.abs(valor))} {etiqueta}
    </span>
  );
}

export default function KpiCard({ titulo, valor, detalle, variacion, invertida, puntos, estado, children }) {
  return (
    <article className={`kpi ${estado ? `kpi-${estado}` : ''}`}>
      <h3 className="kpi-titulo">{titulo}</h3>
      <p className="kpi-valor">{valor}</p>
      {variacion !== undefined && <Variacion valor={variacion} invertida={invertida} puntos={puntos} />}
      {detalle && <p className="kpi-detalle">{detalle}</p>}
      {children}
    </article>
  );
}
