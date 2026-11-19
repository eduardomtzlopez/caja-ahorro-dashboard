"""
L — CARGA
Escribe las colecciones transformadas en la base analítica `caja_ahorro_analitica`
(reemplazo completo en cada corrida) y crea los índices que usa la API.
"""
import logging
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from pymongo import ASCENDING, MongoClient

from config import DB_ANALITICA, MONGO_URI

log = logging.getLogger("etl.load")

INDICES = {
    "fact_movimientos_mensual": ["mes", "institucion_id", "tipo_afiliacion"],
    "fact_captacion_mensual": ["mes", "institucion_id", "tipo_afiliacion"],
    "fact_socios_mensual": ["mes", "institucion_id", "tipo_afiliacion"],
    "fact_cartera_mensual": ["mes", "institucion_id", "tipo_afiliacion"],
    "fact_solicitudes_mensual": ["mes", "institucion_id", "tipo_afiliacion"],
    "detalle_cartera": ["institucion_id", "tipo_afiliacion", "saldo_pendiente"],
}


def a_documentos(df):
    """DataFrame → lista de dicts compatibles con MongoDB (sin NaN ni tipos de numpy)."""
    df = df.copy()
    for c in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[c]):
            df[c] = df[c].astype(object).where(df[c].notna(), None)
    df = df.replace({np.nan: None})
    docs = df.to_dict("records")
    for d in docs:
        d.pop("_id", None)
        for k, v in d.items():
            if isinstance(v, (np.integer,)):
                d[k] = int(v)
            elif isinstance(v, (np.floating,)):
                d[k] = float(v)
            elif isinstance(v, np.bool_):
                d[k] = bool(v)
            elif isinstance(v, pd.Timestamp):
                d[k] = v.to_pydatetime()
    return docs


def cargar(colecciones, bitacora):
    db = MongoClient(MONGO_URI)[DB_ANALITICA]
    for nombre, df in colecciones.items():
        db[nombre].drop()
        if len(df):
            db[nombre].insert_many(a_documentos(df))
        for campo in INDICES.get(nombre, []):
            db[nombre].create_index([(campo, ASCENDING)])
        log.info("Cargado %-30s %7d documentos", nombre, len(df))
    bitacora["fecha_ejecucion"] = datetime.now(timezone.utc)
    db.etl_bitacora.insert_one(bitacora)
