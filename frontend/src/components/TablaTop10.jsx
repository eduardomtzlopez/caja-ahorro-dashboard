// Tabla Top 10 de préstamos vencidos con mayor saldo (detalle operativo para cobranza)
import { entero, pct, pesos } from '../formato.js';

export default function TablaTop10({ filas }) {
  if (!filas.length) return <p className="vacio">No hay préstamos vencidos con los filtros seleccionados.</p>;
  return (
    <div className="tabla-scroll">
      <table className="tabla">
        <thead>
          <tr>
            <th>#</th><th>Socio</th><th>Afiliación / empresa</th><th className="num">Autorizado</th>
            <th className="num">Saldo pendiente</th><th className="num">Tasa</th><th className="num">CAT</th>
            <th className="num">Días de atraso</th><th>Garantía</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={f.prestamo_id} title={`Crédito ${f.prestamo_id} · ${f.institucion_id}`}>
              <td>{i + 1}</td>
              <td><strong>{f.nombre}</strong><br /><span className="tenue">{f.prestamo_id}</span></td>
              <td>{f.tipo_afiliacion}{f.empresa && !f.empresa.startsWith('Sin empresa') && <><br /><span className="tenue">{f.empresa}</span></>}</td>
              <td className="num">{pesos(f.monto_autorizado)}</td>
              <td className="num fuerte">{pesos(f.saldo_pendiente)}</td>
              <td className="num">{pct(f.tasa_interes_anual)}</td>
              <td className="num">{pct(f.cat)}</td>
              <td className="num"><span className="pildora-roja">● {entero(f.dias_atraso)}</span></td>
              <td>{f.garantia}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
