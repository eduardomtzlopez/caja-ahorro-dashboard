"""
E — EXTRACCIÓN
Lee las fuentes de datos y las regresa como DataFrames de pandas, sin modificarlas:
  1. Base transaccional del sistema (MongoDB, base `caja_ahorro`).
  2. Datos abiertos de FONACOT publicados en datos.gob.mx (CSV).
  3. API de datos abiertos del SNIIV (SEDATU) – financiamientos de vivienda.
"""
import io
import logging

import pandas as pd
import requests
from pymongo import MongoClient

from config import (CARPETA_DATOS_ABIERTOS, DB_OPERACION, FONACOT_MONTOS_URL,
                    FONACOT_TRABAJADORES_URL, MONGO_URI, SNIIV_ANIOS, SNIIV_URL)

log = logging.getLogger("etl.extract")

COLECCIONES = ["instituciones_financieras", "socios_ahorradores", "movimientos_financieros",
               "prestamos", "procesos_intervencion_reclamaciones"]


def extraer_operacion():
    """Extrae las 5 colecciones del sistema de la caja de ahorro."""
    db = MongoClient(MONGO_URI)[DB_OPERACION]
    datos = {}
    for nombre in COLECCIONES:
        datos[nombre] = pd.DataFrame(list(db[nombre].find()))
        log.info("Extraído %-38s %8d registros", nombre, len(datos[nombre]))
    return datos


def _leer_csv(url, archivo_local):
    """Intenta descargar el CSV desde datos.gob.mx; si falla, usa la copia local."""
    if url:
        try:
            r = requests.get(url, timeout=20)
            r.raise_for_status()
            log.info("Descargado %s", url)
            return pd.read_csv(io.StringIO(r.content.decode("utf-8-sig"))), "descarga"
        except Exception as e:  # sin internet o URL cambiada
            log.warning("No se pudo descargar %s (%s). Se usa copia local.", url, e)
    return pd.read_csv(CARPETA_DATOS_ABIERTOS / archivo_local), "copia local"


def extraer_fonacot():
    """Trabajadores y montos de crédito FONACOT por entidad, mes y género (4T 2025)."""
    trab, origen_t = _leer_csv(FONACOT_TRABAJADORES_URL, "fonacot_trabajadores_genero_4T2025.csv")
    mont, origen_m = _leer_csv(FONACOT_MONTOS_URL, "fonacot_montos_genero_4T2025.csv")
    log.info("FONACOT trabajadores: %d filas (%s) | montos: %d filas (%s)", len(trab), origen_t, len(mont), origen_m)
    return trab, mont, origen_t


def extraer_sniiv():
    """Financiamientos de vivienda en Oaxaca por género desde la API del SNIIV.
    Es opcional: si la API no responde, el ETL continúa sin esta fuente."""
    url = SNIIV_URL.format(anio_ini=SNIIV_ANIOS[0], anio_fin=SNIIV_ANIOS[1])
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        datos = r.json()
        if isinstance(datos, dict):  # algunas respuestas vienen envueltas
            datos = next((v for v in datos.values() if isinstance(v, list)), [])
        df = pd.DataFrame(datos)
        log.info("SNIIV: %d registros desde %s", len(df), url)
        return df
    except Exception as e:
        log.warning("API SNIIV no disponible (%s). Se omite esta fuente.", e)
        return pd.DataFrame()
