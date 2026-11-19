// Visualizaciones del dashboard (Recharts). Gráficas planas, sin cuadrícula ni 3D.
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, LineChart, ReferenceArea,
  ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { C } from '../colores.js';
import { entero, mesCorto, millones, pct, pesos } from '../formato.js';

const eje = { stroke: C.gris, fontSize: 12, tickLine: false };

function CajaTooltip({ active, payload, label, formato }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip">
      {label && <strong>{formato?.label ? formato.label(label) : label}</strong>}
      {payload.map((p) => (
        <div key={p.dataKey}><span style={{ color: p.color }}>●</span> {p.name}: {formato?.valor ? formato.valor(p.value, p.dataKey) : p.value}</div>
      ))}
    </div>
  );
}

// KPI: evolución mensual de la morosidad contra la meta (tramo sobre la meta en rojo)
export function GraficaMorosidad({ datos, meta }) {
  const serie = datos.map((d) => ({ ...d, sobreMeta: d.morosidad > meta ? d.morosidad : null }));
  // Para que el tramo rojo empiece desde el último punto bajo la meta
  serie.forEach((d, i) => { if (i > 0 && d.sobreMeta != null && serie[i - 1].sobreMeta == null) serie[i - 1].sobreMeta = serie[i - 1].morosidad; });
  const max = Math.max(meta * 1.6, ...datos.map((d) => d.morosidad)) * 1.1;
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={serie} margin={{ top: 18, right: 68, left: 0, bottom: 0 }}>
        <XAxis dataKey="mes" tickFormatter={mesCorto} {...eje} />
        <YAxis tickFormatter={(v) => pct(v, 0)} domain={[0, max]} {...eje} width={46} />
        <ReferenceArea y1={meta} y2={max} fill={C.rojo} fillOpacity={0.05} />
        <ReferenceLine y={meta} stroke={C.rojo} strokeDasharray="5 4"
          label={{ value: `Meta ${pct(meta, 0)}`, position: 'right', fill: C.rojo, fontSize: 12 }} />
        <Tooltip content={<CajaTooltip formato={{ label: mesCorto, valor: (v) => pct(v, 2) }} />} />
        <Line dataKey="morosidad" name="Índice de morosidad" stroke={C.marino} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
        <Line dataKey="sobreMeta" name="Sobre la meta" stroke={C.rojo} strokeWidth={3} connectNulls={false}
          isAnimationActive={false} legendType="none"
          dot={(p) => (p.payload.morosidad > meta ? <circle key={p.index} cx={p.cx} cy={p.cy} r={4} fill={C.rojo} stroke="none" /> : <g key={p.index} />)}>
          <LabelList dataKey="sobreMeta" position="top" formatter={(v) => (v && v > meta ? pct(v) : '')} fill={C.rojo} fontSize={11} />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  );
}

// KPI: depósitos vs retiros mensuales con línea de flujo neto
export function GraficaFlujo({ datos }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <ComposedChart data={datos} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <XAxis dataKey="mes" tickFormatter={mesCorto} {...eje} />
        <YAxis tickFormatter={millones} {...eje} width={70} />
        <ReferenceLine y={0} stroke={C.gris} />
        <Tooltip content={<CajaTooltip formato={{ label: mesCorto, valor: (v) => pesos(v) }} />} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: C.texto }}>{v}</span>} />
        <Bar dataKey="depositos" name="Depósitos" fill={C.marino} isAnimationActive={false} />
        <Bar dataKey="retiros" name="Retiros" fill={C.grisClaro} isAnimationActive={false} />
        <Line dataKey="neto" name="Flujo neto" stroke={C.texto} strokeWidth={2} isAnimationActive={false}
          dot={(p) => <circle key={p.index} cx={p.cx} cy={p.cy} r={p.payload.neto < 0 ? 5 : 3} fill={p.payload.neto < 0 ? C.rojo : C.texto} stroke="none" />} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// KPI: morosidad por segmento (barras horizontales ordenadas; rojo solo si supera la meta)
export function BarrasMorosidad({ datos, meta, alto = 170 }) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 56, left: 8, bottom: 0 }}>
        <XAxis type="number" hide domain={[0, 'dataMax']} />
        <YAxis type="category" dataKey="segmento" width={210} {...eje} tick={{ fontSize: 12, fill: C.texto }} axisLine={false} />
        <ReferenceLine x={meta} stroke={C.rojo} strokeDasharray="4 3" />
        <Tooltip content={<CajaTooltip formato={{ valor: (v) => pct(v, 2) }} />} />
        <Bar dataKey="morosidad" name="Morosidad" barSize={16} isAnimationActive={false}>
          {datos.map((d) => <Cell key={d.segmento} fill={d.morosidad > meta ? C.rojo : C.gris} />)}
          <LabelList dataKey="morosidad" position="right" formatter={(v) => pct(v)} fontSize={12} fill={C.texto} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// KPI: operaciones por canal
export function BarrasCanal({ datos }) {
  const total = datos.reduce((s, d) => s + d.operaciones, 0);
  const serie = datos.map((d) => ({ ...d, participacion: d.operaciones / total }));
  return (
    <ResponsiveContainer width="100%" height={175}>
      <BarChart data={serie} layout="vertical" margin={{ top: 0, right: 64, left: 8, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="canal" width={150} {...eje} tick={{ fontSize: 12, fill: C.texto }} axisLine={false} />
        <Tooltip content={<CajaTooltip formato={{ valor: (v) => `${entero(v)} operaciones` }} />} />
        <Bar dataKey="operaciones" name="Operaciones" barSize={14} isAnimationActive={false}>
          {serie.map((d) => <Cell key={d.canal} fill={d.canal === 'App móvil' ? C.marino : C.gris} />)}
          <LabelList dataKey="participacion" position="right" formatter={(v) => pct(v, 0)} fontSize={12} fill={C.texto} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// KPI: tasa de aprobación contra la banda objetivo (bullet chart)
export function BulletAprobacion({ valor, min, max }) {
  const pos = (v) => `${Math.min(100, Math.max(0, ((v - 0.4) / 0.6) * 100))}%`;
  const fuera = valor > max || valor < min;
  return (
    <div className="bullet" role="img" aria-label={`Tasa de aprobación ${pct(valor)}; banda objetivo ${pct(min, 0)} a ${pct(max, 0)}`}>
      <div className="bullet-pista">
        <div className="bullet-banda" style={{ left: pos(min), width: `calc(${pos(max)} - ${pos(min)})` }} />
        <div className="bullet-barra" style={{ width: pos(valor), background: fuera ? C.rojo : C.marino }} />
      </div>
      <div className="bullet-escala"><span>40 %</span><span>Meta {pct(min, 0)}–{pct(max, 0)}</span><span>100 %</span></div>
    </div>
  );
}

// KPI: relación tasa de interés vs saldo pendiente (vencidos resaltados)
export function DispersionTasa({ datos }) {
  const vencidos = datos.filter((d) => d.estatus === 'Vencido');
  const resto = datos.filter((d) => d.estatus !== 'Vencido');
  return (
    <ResponsiveContainer width="100%" height={290}>
      <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
        <CartesianGrid stroke="#EEF1F5" vertical={false} />
        <XAxis type="number" dataKey="tasa_interes_anual" name="Tasa anual" tickFormatter={(v) => pct(v, 0)} domain={[0.14, 0.4]} {...eje}
          label={{ value: 'Tasa de interés anual', position: 'insideBottom', offset: -6, fontSize: 12, fill: C.gris }} />
        <YAxis type="number" dataKey="saldo_pendiente" name="Saldo" tickFormatter={millones} {...eje} width={70} />
        <ZAxis range={[28, 28]} />
        <Tooltip cursor={false} content={({ active, payload }) => active && payload?.length ? (
          <div className="tooltip"><strong>{payload[0].payload.prestamo_id}</strong>
            <div>{payload[0].payload.tipo_afiliacion}</div>
            <div>Tasa: {pct(payload[0].payload.tasa_interes_anual)}</div>
            <div>Saldo: {pesos(payload[0].payload.saldo_pendiente)}</div>
            <div>Estatus: {payload[0].payload.estatus}</div></div>) : null} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} verticalAlign="top" align="right" formatter={(v) => <span style={{ color: C.texto }}>{v}</span>} />
        <Scatter name="Vigente / con atraso" data={resto} fill={C.grisClaro} isAnimationActive={false} />
        <Scatter name="Vencido (> 90 días)" data={vencidos} fill={C.rojo} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// Datos abiertos: participación de mujeres en el crédito (caja vs FONACOT)
export function BarrasGenero({ datos }) {
  const serie = datos.map((d) => ({ fuente: d.fuente, mujeres: d.pct_mujeres }));
  return (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={serie} layout="vertical" margin={{ top: 0, right: 56, left: 8, bottom: 0 }}>
        <XAxis type="number" hide domain={[0, 1]} />
        <YAxis type="category" dataKey="fuente" width={130} {...eje} tick={{ fontSize: 12, fill: C.texto }} axisLine={false} />
        <ReferenceLine x={0.5} stroke={C.gris} strokeDasharray="3 3" />
        <Bar dataKey="mujeres" name="% créditos a mujeres" barSize={16} isAnimationActive={false}>
          {serie.map((d) => <Cell key={d.fuente} fill={d.fuente === 'Caja de ahorro' ? C.marino : C.gris} />)}
          <LabelList dataKey="mujeres" position="right" formatter={(v) => pct(v)} fontSize={12} fill={C.texto} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
