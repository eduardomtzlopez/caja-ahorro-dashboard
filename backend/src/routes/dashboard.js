// Rutas de la API del dashboard. Cada ruta corresponde a una zona del wireframe.
import { Router } from 'express';
import { col } from '../db.js';
import { leerFiltros, match, mesAnterior } from '../filtros.js';
import { METAS, semaforoMorosidad, variacion } from '../kpis.js';

const router = Router();

// Envuelve las rutas async para mandar los errores al middleware de errores
const ruta = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Último mes disponible dentro del rango filtrado
async function mesFinal(f) {
  const meses = await col('fact_cartera_mensual').distinct('mes', match(f));
  return meses.sort().at(-1);
}

// Suma de cartera total y vencida agrupada por un campo
async function cartera(cond, porCampo = 'mes') {
  return col('fact_cartera_mensual').aggregate([
    { $match: cond },
    { $group: { _id: `$${porCampo}`, total: { $sum: '$saldo_total' }, vencido: { $sum: '$saldo_vencido' },
                creditos: { $sum: '$creditos' }, vencidos: { $sum: '$creditos_vencidos' } } },
    { $addFields: { morosidad: { $cond: [{ $gt: ['$total', 0] }, { $divide: ['$vencido', '$total'] }, 0] } } },
    { $sort: { _id: 1 } },
  ]).toArray();
}

async function sumaMes(coleccion, campo, cond) {
  const [r] = await col(coleccion).aggregate([{ $match: cond }, { $group: { _id: null, v: { $sum: `$${campo}` } } }]).toArray();
  return r?.v ?? 0;
}

// ---------------------------------------------------------------- Catálogos para los filtros
router.get('/filtros', ruta(async (_req, res) => {
  const [instituciones, afiliaciones, meses, bitacora] = await Promise.all([
    col('dim_instituciones').find({}, { projection: { _id: 0, institucion_id: 1, nombre: 1, sucursal: 1 } }).toArray(),
    col('fact_cartera_mensual').distinct('tipo_afiliacion'),
    col('fact_cartera_mensual').distinct('mes'),
    col('etl_bitacora').find().sort({ fecha_ejecucion: -1 }).limit(1).toArray(),
  ]);
  res.json({ instituciones, afiliaciones: afiliaciones.sort(), meses: meses.sort(), ultimaCargaETL: bitacora[0]?.fecha_ejecucion ?? null });
}));

// ---------------------------------------------------------------- Zona superior: KPIs macro (BANs)
router.get('/resumen', ruta(async (req, res) => {
  const f = leerFiltros(req.query);
  const mes = await mesFinal(f);
  if (!mes) return res.json({ mes: null });
  const ant = mesAnterior(mes);
  const sinMes = match(f, { conMes: false });

  const [capAct, capAnt, socAct, socAnt, [carAct], [carAnt], solicitudes, recAbiertas] = await Promise.all([
    sumaMes('fact_captacion_mensual', 'captacion', { ...sinMes, mes }),
    sumaMes('fact_captacion_mensual', 'captacion', { ...sinMes, mes: ant }),
    sumaMes('fact_socios_mensual', 'socios_activos', { ...sinMes, mes }),
    sumaMes('fact_socios_mensual', 'socios_activos', { ...sinMes, mes: ant }),
    cartera({ ...sinMes, mes }, 'mes'),
    cartera({ ...sinMes, mes: ant }, 'mes'),
    col('fact_solicitudes_mensual').aggregate([{ $match: match(f) },
      { $group: { _id: null, solicitudes: { $sum: '$solicitudes' }, aprobadas: { $sum: '$aprobadas' } } }]).toArray(),
    col('fact_reclamaciones').countDocuments({ ...sinMes, abierta: true }),
  ]);

  const recVencidas = await col('fact_reclamaciones').countDocuments({ ...sinMes, abierta: true, dias_abierta: { $gt: METAS.reclamacionesDiasMax } });
  const tasaAprob = solicitudes[0] ? solicitudes[0].aprobadas / solicitudes[0].solicitudes : null;
  const morosidad = carAct?.morosidad ?? 0;

  res.json({
    mes,
    captacion: { valor: capAct, variacion: variacion(capAct, capAnt), alerta: variacion(capAct, capAnt) < METAS.captacionCaidaMax },
    socios: { valor: socAct, variacion: variacion(socAct, socAnt) },
    cartera: { valor: carAct?.total ?? 0, variacion: variacion(carAct?.total, carAnt?.total), creditos: carAct?.creditos ?? 0 },
    morosidad: { valor: morosidad, anterior: carAnt?.morosidad ?? null, meta: METAS.morosidad.meta, semaforo: semaforoMorosidad(morosidad),
                 saldoVencido: carAct?.vencido ?? 0 },
    aprobacion: { valor: tasaAprob, min: METAS.aprobacion.min, max: METAS.aprobacion.max,
                  solicitudes: solicitudes[0]?.solicitudes ?? 0, aprobadas: solicitudes[0]?.aprobadas ?? 0 },
    reclamaciones: { abiertas: recAbiertas, fueraDePlazo: recVencidas, plazoMax: METAS.reclamacionesDiasMax },
  });
}));

// ---------------------------------------------------------------- Zona central: tendencias
router.get('/tendencias', ruta(async (req, res) => {
  const f = leerFiltros(req.query);
  const cond = match(f);
  const [mor, flujo, aprob] = await Promise.all([
    cartera(cond, 'mes'),
    col('fact_movimientos_mensual').aggregate([
      { $match: { ...cond, tipo_movimiento: { $in: ['deposito', 'retiro'] } } },
      { $group: { _id: { mes: '$mes', tipo: '$tipo_movimiento' }, monto: { $sum: '$monto' } } },
      { $group: { _id: '$_id.mes', valores: { $push: { k: '$_id.tipo', v: '$monto' } } } },
      { $project: { _id: 0, mes: '$_id', montos: { $arrayToObject: '$valores' } } },
      { $sort: { mes: 1 } },
    ]).toArray(),
    col('fact_solicitudes_mensual').aggregate([
      { $match: cond },
      { $group: { _id: '$mes', solicitudes: { $sum: '$solicitudes' }, aprobadas: { $sum: '$aprobadas' } } },
      { $sort: { _id: 1 } },
    ]).toArray(),
  ]);
  res.json({
    meta: METAS.morosidad.meta,
    morosidad: mor.map((m) => ({ mes: m._id, morosidad: m.morosidad, cartera: m.total, vencido: m.vencido })),
    flujo: flujo.map((r) => {
      const dep = r.montos.deposito ?? 0, ret = r.montos.retiro ?? 0;
      return { mes: r.mes, depositos: dep, retiros: ret, neto: dep - ret };
    }),
    aprobacion: aprob.map((a) => ({ mes: a._id, tasa: a.aprobadas / a.solicitudes, solicitudes: a.solicitudes })),
  });
}));

// ---------------------------------------------------------------- Zona inferior izquierda: causa raíz
router.get('/causa-raiz', ruta(async (req, res) => {
  const f = leerFiltros(req.query);
  const mes = await mesFinal(f);
  const corte = { ...match(f, { conMes: false }), mes };
  const [porAfiliacion, porEmpresa, canales] = await Promise.all([
    cartera(corte, 'tipo_afiliacion'),
    cartera({ ...corte, empresa: { $ne: 'Sin empresa (socio individual)' } }, 'empresa'),
    col('fact_movimientos_mensual').aggregate([
      { $match: { ...match(f), tipo_movimiento: { $in: ['deposito', 'retiro'] } } },
      { $group: { _id: '$medio_operacion', operaciones: { $sum: '$operaciones' }, monto: { $sum: '$monto' } } },
      { $sort: { operaciones: -1 } },
    ]).toArray(),
  ]);
  const ordenar = (lista) => lista.map((x) => ({ segmento: x._id, morosidad: x.morosidad, vencido: x.vencido, cartera: x.total }))
    .sort((a, b) => b.morosidad - a.morosidad);
  res.json({ mes, meta: METAS.morosidad.meta, porAfiliacion: ordenar(porAfiliacion), porEmpresa: ordenar(porEmpresa),
             canales: canales.map((c) => ({ canal: c._id, operaciones: c.operaciones, monto: c.monto })) });
}));

// ---------------------------------------------------------------- Zona inferior derecha: detalle operativo
router.get('/detalle', ruta(async (req, res) => {
  const f = leerFiltros(req.query);
  const cond = match(f, { conMes: false });
  const proyeccion = { _id: 0, fecha_otorgamiento: 0 };
  const [top, puntos] = await Promise.all([
    col('detalle_cartera').find({ ...cond, estatus: 'Vencido' }, { projection: proyeccion }).sort({ saldo_pendiente: -1 }).limit(10).toArray(),
    col('detalle_cartera').find(cond, { projection: { _id: 0, prestamo_id: 1, tasa_interes_anual: 1, saldo_pendiente: 1, estatus: 1, tipo_afiliacion: 1, garantia: 1 } }).toArray(),
  ]);
  res.json({ top10: top, dispersion: puntos });
}));

// ---------------------------------------------------------------- Datos abiertos (FONACOT / SNIIV)
router.get('/datos-abiertos', ruta(async (_req, res) => {
  const [comparativo, ranking, sniiv] = await Promise.all([
    col('od_comparativo_genero').find({}, { projection: { _id: 0 } }).toArray(),
    col('od_fonacot').aggregate([
      { $match: { entidad: { $ne: 'App Movil' } } },
      { $group: { _id: { entidad: '$entidad', genero: '$genero' }, t: { $sum: '$trabajadores' } } },
      { $group: { _id: '$_id.entidad', valores: { $push: { k: '$_id.genero', v: '$t' } } } },
      { $project: { _id: 0, entidad: '$_id', g: { $arrayToObject: '$valores' } } },
      { $project: { entidad: 1, pctMujeres: { $divide: ['$g.Mujer', { $add: ['$g.Mujer', '$g.Hombre'] }] } } },
      { $sort: { pctMujeres: -1 } },
    ]).toArray(),
    col('od_sniiv').find({}, { projection: { _id: 0 } }).toArray(),
  ]);
  res.json({ comparativo, ranking, sniiv, fuente: 'FONACOT, datos.gob.mx (4T 2025); SNIIV-SEDATU' });
}));

export default router;
