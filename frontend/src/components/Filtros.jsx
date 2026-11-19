// Filtros globales: periodo, institución y tipo de afiliación
import { mesCorto } from '../formato.js';

export default function Filtros({ catalogos, filtros, onCambio }) {
  const cambiar = (campo) => (e) => onCambio({ ...filtros, [campo]: e.target.value });
  const { meses = [], instituciones = [], afiliaciones = [] } = catalogos || {};
  return (
    <form className="filtros" onSubmit={(e) => e.preventDefault()} aria-label="Filtros del dashboard">
      <label>Desde
        <select value={filtros.desde} onChange={cambiar('desde')}>
          {meses.filter((m) => m <= filtros.hasta).map((m) => <option key={m} value={m}>{mesCorto(m)}</option>)}
        </select>
      </label>
      <label>Hasta
        <select value={filtros.hasta} onChange={cambiar('hasta')}>
          {meses.filter((m) => m >= filtros.desde).map((m) => <option key={m} value={m}>{mesCorto(m)}</option>)}
        </select>
      </label>
      <label>Institución
        <select value={filtros.institucion} onChange={cambiar('institucion')}>
          <option value="todas">Todas las cajas</option>
          {instituciones.map((i) => <option key={i.institucion_id} value={i.institucion_id}>{i.nombre}</option>)}
        </select>
      </label>
      <label>Tipo de afiliación
        <select value={filtros.afiliacion} onChange={cambiar('afiliacion')}>
          <option value="todas">Todas</option>
          {afiliaciones.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </label>
      <button type="button" className="btn-limpiar"
        onClick={() => onCambio({ desde: meses[0], hasta: meses.at(-1), institucion: 'todas', afiliacion: 'todas' })}>
        Limpiar
      </button>
    </form>
  );
}
