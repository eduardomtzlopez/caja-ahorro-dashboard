import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { entero, mesCorto, mesLargo, millones, pct, pesos } from './formato.js';
import Filtros from './components/Filtros.jsx';
import KpiCard from './components/KpiCard.jsx';
import Panel from './components/Panel.jsx';
import TablaTop10 from './components/TablaTop10.jsx';
import {
  BarrasCanal, BarrasGenero, BarrasMorosidad, BulletAprobacion, DispersionTasa, GraficaFlujo, GraficaMorosidad,
} from './components/Graficas.jsx';

// Meses seguidos (contando desde el final) que cumplen una condición
const rachaFinal = (lista, cond) => {
  let n = 0;
  for (let i = lista.length - 1; i >= 0 && cond(lista[i]); i--) n++;
  return n;
};

export default function App() {
  const [catalogos, setCatalogos] = useState(null);
  const [filtros, setFiltros] = useState(null);
  const [d, setD] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api('filtros').then((c) => {
      setCatalogos(c);
      setFiltros({ desde: c.meses[0], hasta: c.meses.at(-1), institucion: 'todas', afiliacion: 'todas' });
    }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!filtros) return;
    setCargando(true);
    Promise.all(['resumen', 'tendencias', 'causa-raiz', 'detalle', 'datos-abiertos'].map((r) => api(r, filtros)))
      .then(([resumen, tendencias, causa, detalle, abiertos]) => { setD({ resumen, tendencias, causa, detalle, abiertos }); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [filtros]);

  // Títulos que expresan el hallazgo (se recalculan con los filtros)
  const h = useMemo(() => {
    if (!d?.resumen?.mes) return null;
    const { resumen, tendencias, causa, detalle, abiertos } = d;
    const meta = tendencias.meta;
    const mesesSobre = rachaFinal(tendencias.morosidad, (m) => m.morosidad > meta);
    const negativos = tendencias.flujo.filter((f) => f.neto < 0);
    const rachaNeg = rachaFinal(tendencias.flujo, (f) => f.neto < 0);
    const peorSeg = causa.porAfiliacion[0];
    const peorEmp = causa.porEmpresa[0];
    const app = causa.canales.find((c) => c.canal === 'App móvil');
    const totalOps = causa.canales.reduce((s, c) => s + c.operaciones, 0);
    const venc = detalle.dispersion.filter((x) => x.estatus === 'Vencido');
        const caja = abiertos.comparativo.find((c) => c.fuente === 'Caja de ahorro');
    const oax = abiertos.comparativo.find((c) => c.fuente === 'FONACOT Oaxaca');
    const top10 = detalle.top10.reduce((s, x) => s + x.saldo_pendiente, 0);
    return {
      morosidad: mesesSobre > 0
        ? `La morosidad supera la meta del ${pct(meta, 0)} desde hace ${mesesSobre} ${mesesSobre === 1 ? 'mes' : 'meses'}`
        : `La morosidad se mantiene por debajo de la meta del ${pct(meta, 0)}`,
      morosidadAlerta: mesesSobre > 0,
      flujo: negativos.length
        ? `Los retiros superaron a los depósitos en ${negativos.length} ${negativos.length === 1 ? 'mes' : 'meses'} (${negativos.map((n) => mesCorto(n.mes)).join(', ')})`
        : 'Los depósitos superaron a los retiros todos los meses',
      flujoAlerta: rachaNeg >= 2 || negativos.length >= 2,
      segmento: peorSeg && peorSeg.morosidad > meta
        ? `${peorSeg.segmento}: ${pct(peorSeg.morosidad)} de morosidad, ${(peorSeg.morosidad / meta).toFixed(1)} veces la meta`
        : 'Ningún tipo de afiliación supera la meta',
      empresa: !peorEmp ? 'Sin cajas laborales en el filtro'
        : peorEmp.morosidad > meta ? `${peorEmp.segmento} concentra el mayor riesgo entre las cajas laborales (${pct(peorEmp.morosidad)})`
        : `Ninguna empresa supera la meta; la más alta es ${peorEmp.segmento} (${pct(peorEmp.morosidad)})`,
      conflicto: peorSeg && peorSeg.morosidad > meta ? `el riesgo se concentra en ${peorSeg.segmento.toLowerCase()}` : 'ningún tipo de afiliación rebasa la meta',
      aprobacion: resumen.aprobacion.valor > resumen.aprobacion.max
        ? `Se aprueba el ${pct(resumen.aprobacion.valor)} de las solicitudes: por arriba de la banda objetivo`
        : `Se aprueba el ${pct(resumen.aprobacion.valor)} de las solicitudes`,
      aprobacionAlerta: resumen.aprobacion.valor > resumen.aprobacion.max,
      canal: app ? `La app móvil ya mueve el ${pct(app.operaciones / totalOps, 0)} de las operaciones` : 'Operaciones por canal',
      dispersion: venc.length >= 3
        ? `Hay vencidos con tasas de ${pct(Math.min(...venc.map((x) => x.tasa_interes_anual)), 0)} a ${pct(Math.max(...venc.map((x) => x.tasa_interes_anual)), 0)}: la tasa sola no compensa el riesgo`
        : venc.length ? `${venc.length} ${venc.length === 1 ? 'crédito vencido' : 'créditos vencidos'} con los filtros seleccionados` : 'No hay préstamos vencidos con los filtros seleccionados',
      nomina: venc.length
        ? `Solo el ${pct(venc.filter((x) => x.garantia === 'Descuento vía nómina').length / venc.length, 0)} de los vencidos tiene descuento vía nómina, aunque esa garantía cubre el ${pct(detalle.dispersion.filter((x) => x.garantia === 'Descuento vía nómina').length / detalle.dispersion.length, 0)} de los créditos.`
        : '',
      top10: detalle.top10.length ? `Recuperar estos 10 créditos reduce ${millones(top10)} de cartera vencida` : 'Sin préstamos vencidos',
      genero: caja && oax ? `La caja presta más a mujeres (${pct(caja.pct_mujeres, 0)}) que FONACOT en Oaxaca (${pct(oax.pct_mujeres, 0)})` : 'Comparativo con datos abiertos',
    };
  }, [d]);

  if (error) return <div className="estado-error">No se pudo cargar el dashboard: {error}. ¿Está corriendo la API (npm start en backend)?</div>;
  if (!d || !h) return <div className="estado-carga">Cargando dashboard…</div>;

  const { resumen: r, tendencias, causa, detalle, abiertos } = d;

  return (
    <div className={`app ${cargando ? 'actualizando' : ''}`}>
      <header className="encabezado">
        <div>
          <p className="sobretitulo">Sistema de Gestión para Caja de Ahorro Popular</p>
          <h1>Salud Financiera y Riesgo Crediticio</h1>
          <p className="corte">Cifras al cierre de {mesLargo(r.mes)} · Última carga del ETL: {new Date(catalogos.ultimaCargaETL).toLocaleString('es-MX')}</p>
        </div>
        <Filtros catalogos={catalogos} filtros={filtros} onCambio={setFiltros} />
      </header>

      {/* Zona superior — Nivel 1: resumen ejecutivo */}
      <section className="fila-kpis" aria-label="Indicadores principales">
        <KpiCard titulo="Captación total" valor={millones(r.captacion.valor)} variacion={r.captacion.variacion}
          detalle="Saldo de ahorro: Σ depósitos − Σ retiros" estado={r.captacion.alerta ? 'rojo' : null} />
        <KpiCard titulo="Socios activos" valor={entero(r.socios.valor)} variacion={r.socios.variacion} detalle="Socios con cuenta activa al cierre" />
        <KpiCard titulo="Cartera de crédito" valor={millones(r.cartera.valor)} variacion={r.cartera.variacion}
          detalle={`${entero(r.cartera.creditos)} créditos vigentes y vencidos`} />
        <KpiCard titulo="Índice de morosidad" valor={pct(r.morosidad.valor)} estado={r.morosidad.semaforo}
          variacion={r.morosidad.anterior != null ? r.morosidad.valor - r.morosidad.anterior : null} invertida puntos
          detalle={<><span className={`semaforo s-${r.morosidad.semaforo}`}>●</span> Meta &lt; {pct(r.morosidad.meta, 0)} · Vencido: {millones(r.morosidad.saldoVencido)}</>} />
        <KpiCard titulo="Reclamaciones CONDUSEF abiertas" valor={entero(r.reclamaciones.abiertas)}
          estado={r.reclamaciones.fueraDePlazo > 0 ? 'ambar' : null}
          detalle={r.reclamaciones.fueraDePlazo > 0 ? `▲ ${r.reclamaciones.fueraDePlazo} con más de ${r.reclamaciones.plazoMax} días sin resolver` : `Todas dentro del plazo de ${r.reclamaciones.plazoMax} días`} />
      </section>

      {/* Guion del storytelling: gancho → conflicto → solución */}
      <section className="narrativa" aria-label="Resumen de la historia">
        <div><span className="paso">1 · Contexto</span>La caja crece: la cartera {r.cartera.variacion >= 0 ? 'subió' : 'bajó'} {pct(Math.abs(r.cartera.variacion ?? 0))} y la captación {r.captacion.variacion >= 0 ? 'subió' : 'bajó'} {pct(Math.abs(r.captacion.variacion ?? 0))} en el último mes.</div>
        <div className={h.morosidadAlerta ? 'conflicto' : ''}><span className="paso">2 · Conflicto</span>{h.morosidad}; {h.conflicto}.</div>
        <div><span className="paso">3 · Acción</span>Cobranza preventiva al Top 10, convenios de descuento vía nómina y revisar criterios donde la morosidad rebasa la meta.</div>
      </section>

      {/* Zona central — Nivel 2: tendencias */}
      <div className="rejilla dos">
        <Panel nivel="Tendencia" titulo={h.morosidad} alerta={h.morosidadAlerta} subtitulo="Índice de morosidad mensual: saldo vencido (> 90 días) ÷ cartera total">
          <GraficaMorosidad datos={tendencias.morosidad} meta={tendencias.meta} />
        </Panel>
        <Panel nivel="Tendencia" titulo={h.flujo} alerta={h.flujoAlerta} subtitulo="Depósitos vs retiros mensuales ($) y flujo neto (punto rojo = mes negativo)">
          <GraficaFlujo datos={tendencias.flujo} />
        </Panel>
      </div>

      {/* Zona inferior — Nivel 3: causa raíz */}
      <div className="rejilla tres">
        <Panel nivel="Causa raíz" titulo={h.segmento} alerta={causa.porAfiliacion[0]?.morosidad > causa.meta}
          subtitulo={`Morosidad por tipo de afiliación y por empresa · cierre de ${mesCorto(causa.mes)} (línea = meta)`}>
          <BarrasMorosidad datos={causa.porAfiliacion} meta={causa.meta} alto={150} />
          <p className="subtitulo-interno">{h.empresa}</p>
          <BarrasMorosidad datos={causa.porEmpresa} meta={causa.meta} alto={Math.max(90, causa.porEmpresa.length * 30)} />
        </Panel>
        <Panel nivel="Causa raíz" titulo={h.aprobacion} alerta={h.aprobacionAlerta} subtitulo="Tasa de aprobación de crédito (aprobadas ÷ solicitudes del periodo)">
          <div className="aprob-cifra">
            <strong>{pct(r.aprobacion.valor)}</strong>
            <span>{entero(r.aprobacion.aprobadas)} de {entero(r.aprobacion.solicitudes)} solicitudes</span>
          </div>
          <BulletAprobacion valor={r.aprobacion.valor} min={r.aprobacion.min} max={r.aprobacion.max} />
          <p className="subtitulo-interno">{h.canal}</p>
          <BarrasCanal datos={causa.canales} />
        </Panel>
        <Panel nivel="Causa raíz" titulo={h.dispersion} subtitulo="Tasa de interés anual vs saldo pendiente por crédito (al corte)">
          <DispersionTasa datos={detalle.dispersion} />
          {h.nomina && <p className="nota-panel">▲ {h.nomina}</p>}
        </Panel>
      </div>

      {/* Nivel 4: detalle operativo + datos abiertos */}
      <div className="rejilla detalle">
        <Panel nivel="Acción" titulo={h.top10} subtitulo="Top 10 de préstamos vencidos con mayor saldo pendiente: prioridad de cobranza preventiva">
          <TablaTop10 filas={detalle.top10} />
        </Panel>
        <Panel nivel="Datos abiertos" titulo={h.genero} subtitulo="% de créditos otorgados a mujeres, oct–dic 2025">
          <BarrasGenero datos={abiertos.comparativo} />
          <table className="tabla compacta">
            <thead><tr><th>Fuente</th><th className="num">Créditos</th><th className="num">Prom. mujer</th><th className="num">Prom. hombre</th></tr></thead>
            <tbody>
              {abiertos.comparativo.map((c) => (
                <tr key={c.fuente}><td>{c.fuente}</td><td className="num">{entero(c.creditos)}</td>
                  <td className="num">{pesos(c.credito_prom_mujer)}</td><td className="num">{pesos(c.credito_prom_hombre)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="fuente">Oaxaca ocupa el lugar {abiertos.ranking.findIndex((x) => x.entidad === 'Oaxaca') + 1} de {abiertos.ranking.length} entidades en participación de mujeres en FONACOT.
            {abiertos.sniiv.length > 0 && ` SNIIV: ${entero(abiertos.sniiv.reduce((s, x) => s + (x.acciones || 0), 0))} financiamientos de vivienda en Oaxaca.`}
            {' '}Fuente: {abiertos.fuente}.</p>
        </Panel>
      </div>

      <footer className="pie">Dashboard de Salud Financiera y Riesgo Crediticio · Software para Toma de Decisiones · Instituto Tecnológico de Oaxaca · 2026</footer>
    </div>
  );
}
