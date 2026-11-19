"""
T — TRANSFORMACIÓN
Limpia, valida e integra los datos extraídos y construye las colecciones analíticas
que consume el dashboard (modelo de hechos agregados por mes, institución y segmento).
"""
import logging
from datetime import timedelta

import numpy as np
import pandas as pd

from config import DIAS_CARTERA_VENCIDA, DIAS_CASTIGO, FECHA_CORTE, MESES_ANALISIS

log = logging.getLogger("etl.transform")


# ----------------------------------------------------------------------------- utilidades
def periodo(fechas):
    """Convierte fechas a 'AAAA-MM'."""
    return pd.to_datetime(fechas).dt.to_period("M").astype(str)


def meses_analisis():
    fin = pd.Period(FECHA_CORTE, "M")
    return [str(fin - i) for i in range(MESES_ANALISIS - 1, -1, -1)]


def fin_de_mes(per):
    return pd.Period(per, "M").to_timestamp(how="end").normalize() + timedelta(hours=23, minutes=59)


# ----------------------------------------------------------------------------- limpieza
def limpiar_socios(df):
    df = df.drop_duplicates("_id").copy()
    df["genero"] = df["genero"].str.upper().str.strip().map({"M": "Mujer", "F": "Mujer", "H": "Hombre"})
    df["tipo_afiliacion"] = df["tipo_afiliacion"].str.strip()
    df["empresa"] = df["empresa"].fillna("Sin empresa (socio individual)")
    df["fecha_alta"] = pd.to_datetime(df["fecha_alta"])
    df["fecha_baja"] = pd.to_datetime(df["fecha_baja"])
    return df.rename(columns={"_id": "socio_id"})


def limpiar_movimientos(df):
    antes = len(df)
    df = df.drop_duplicates("_id")
    df = df[df["monto"].notna() & (df["monto"] > 0)].copy()
    df["tipo_movimiento"] = df["tipo_movimiento"].str.lower().str.strip()
    df = df[df["tipo_movimiento"].isin(["deposito", "retiro", "saldo_inicial"])]
    df["fecha_hora"] = pd.to_datetime(df["fecha_hora"])
    df = df[df["fecha_hora"] <= FECHA_CORTE]
    log.info("Movimientos válidos: %d de %d", len(df), antes)
    df["mes"] = periodo(df["fecha_hora"])
    return df


def limpiar_prestamos(df):
    df = df.drop_duplicates("_id").copy()
    for c in ["fecha_solicitud", "fecha_otorgamiento", "fecha_ultimo_pago", "fecha_liquidacion"]:
        df[c] = pd.to_datetime(df[c])
    # Regla de calidad: lo autorizado no puede superar lo solicitado
    invalidos = df["monto_autorizado"] > df["monto_solicitado"]
    df.loc[invalidos, "monto_autorizado"] = df.loc[invalidos, "monto_solicitado"]
    df["aprobado"] = df["estatus_solicitud"].eq("aprobada")
    return df.rename(columns={"_id": "prestamo_id"})


# ----------------------------------------------------------------------------- hechos
def hechos_movimientos(movs, socios):
    """Depósitos y retiros por mes, institución, afiliación y canal (24 meses)."""
    m = movs.merge(socios[["socio_id", "tipo_afiliacion"]], on="socio_id", how="left")
    agg = (m.groupby(["mes", "institucion_id", "tipo_afiliacion", "tipo_movimiento", "medio_operacion"])
             .agg(monto=("monto", "sum"), operaciones=("_id", "count")).reset_index())
    agg["monto"] = agg["monto"].round(2)
    return agg


def hechos_captacion(movs, socios):
    """Saldo de ahorro (captación) al cierre de cada mes: Σ depósitos − Σ retiros acumulado."""
    m = movs.merge(socios[["socio_id", "tipo_afiliacion"]], on="socio_id", how="left")
    m["neto"] = np.where(m["tipo_movimiento"] == "retiro", -m["monto"], m["monto"])
    neto = m.groupby(["institucion_id", "tipo_afiliacion", "mes"])["neto"].sum().reset_index()
    todos = sorted(neto["mes"].unique())
    filas = []
    for (inst, afil), g in neto.groupby(["institucion_id", "tipo_afiliacion"]):
        serie = g.set_index("mes")["neto"].reindex(todos, fill_value=0).cumsum()
        for mes, saldo in serie.items():
            filas.append({"mes": mes, "institucion_id": inst, "tipo_afiliacion": afil, "captacion": round(saldo, 2)})
    df = pd.DataFrame(filas)
    return df[df["mes"].isin(meses_analisis() + [str(pd.Period(meses_analisis()[0]) - 1)])]


def hechos_socios(socios):
    """Socios activos y altas por mes y segmento."""
    filas = []
    for mes in meses_analisis():
        fin = fin_de_mes(mes)
        ini = pd.Period(mes).to_timestamp()
        activos = socios[(socios["fecha_alta"] <= fin) & (socios["fecha_baja"].isna() | (socios["fecha_baja"] > fin))]
        for (inst, afil, gen), g in activos.groupby(["institucion_id", "tipo_afiliacion", "genero"]):
            filas.append({"mes": mes, "institucion_id": inst, "tipo_afiliacion": afil, "genero": gen,
                          "socios_activos": len(g), "altas": int((g["fecha_alta"] >= ini).sum())})
    return pd.DataFrame(filas)


def estado_cartera(prest, fecha):
    """Calcula saldo pendiente y días de atraso de cada crédito a una fecha de corte."""
    p = prest[prest["aprobado"] & (prest["fecha_otorgamiento"] <= fecha)].copy()
    p = p[p["fecha_liquidacion"].isna() | (p["fecha_liquidacion"] > fecha)]
    ultimo = p["fecha_ultimo_pago"].where(p["fecha_ultimo_pago"] < fecha, fecha)
    pagos = ((ultimo.dt.year - p["fecha_otorgamiento"].dt.year) * 12
             + (ultimo.dt.month - p["fecha_otorgamiento"].dt.month)).clip(lower=0)
    p["saldo_pendiente"] = (p["monto_autorizado"] * (1 - pagos / p["plazo_meses"]).clip(lower=0)).round(2)
    # Atraso: días desde la fecha en que debió hacerse el siguiente pago
    atraso = (fecha - (p["fecha_ultimo_pago"] + pd.Timedelta(days=30))).dt.days
    p["dias_atraso"] = np.where(p["fecha_ultimo_pago"] < fecha - pd.Timedelta(days=30), atraso, 0)
    p.loc[p["fecha_ultimo_pago"] >= fecha, "dias_atraso"] = 0
    p["vencido"] = p["dias_atraso"] > DIAS_CARTERA_VENCIDA
    # Créditos con más de un año de atraso se castigan (salen del balance)
    p = p[p["dias_atraso"] <= DIAS_CASTIGO]
    return p[p["saldo_pendiente"] > 0]


def hechos_cartera(prest, socios):
    """Cartera total y vencida al cierre de cada mes, por institución, afiliación y empresa."""
    p = prest.merge(socios[["socio_id", "tipo_afiliacion", "empresa", "genero"]], on="socio_id", how="left")
    filas = []
    for mes in meses_analisis():
        c = estado_cartera(p, fin_de_mes(mes))
        c["saldo_vencido"] = np.where(c["vencido"], c["saldo_pendiente"], 0)
        g = (c.groupby(["institucion_id", "tipo_afiliacion", "empresa"])
               .agg(saldo_total=("saldo_pendiente", "sum"), saldo_vencido=("saldo_vencido", "sum"),
                    creditos=("prestamo_id", "count"), creditos_vencidos=("vencido", "sum")).reset_index())
        g["mes"] = mes
        filas.append(g)
    df = pd.concat(filas, ignore_index=True)
    df[["saldo_total", "saldo_vencido"]] = df[["saldo_total", "saldo_vencido"]].round(2)
    return df


def hechos_solicitudes(prest, socios):
    """Solicitudes y aprobaciones de crédito por mes."""
    p = prest.merge(socios[["socio_id", "tipo_afiliacion"]], on="socio_id", how="left")
    p["mes"] = periodo(p["fecha_solicitud"])
    p = p[p["mes"].isin(meses_analisis())]
    return (p.groupby(["mes", "institucion_id", "tipo_afiliacion"])
              .agg(solicitudes=("prestamo_id", "count"), aprobadas=("aprobado", "sum"),
                   monto_solicitado=("monto_solicitado", "sum"),
                   monto_autorizado=("monto_autorizado", "sum")).reset_index())


def detalle_cartera(prest, socios):
    """Créditos vivos al corte (para la tabla Top 10 y la gráfica de dispersión)."""
    p = prest.merge(socios[["socio_id", "nombre", "tipo_afiliacion", "empresa", "genero"]], on="socio_id", how="left")
    c = estado_cartera(p, FECHA_CORTE)
    c["estatus"] = np.where(c["vencido"], "Vencido", np.where(c["dias_atraso"] > 0, "Con atraso", "Vigente"))
    cols = ["prestamo_id", "socio_id", "nombre", "genero", "institucion_id", "tipo_afiliacion", "empresa",
            "monto_autorizado", "saldo_pendiente", "tasa_interes_anual", "cat", "plazo_meses", "garantia",
            "dias_atraso", "estatus", "fecha_otorgamiento"]
    return c[cols]


def hechos_reclamaciones(rec, socios):
    r = rec.drop_duplicates("_id").merge(socios[["socio_id", "tipo_afiliacion"]], on="socio_id", how="left")
    r["fecha_apertura"] = pd.to_datetime(r["fecha_apertura"])
    r["fecha_cierre"] = pd.to_datetime(r["fecha_cierre"])
    r["mes"] = periodo(r["fecha_apertura"])
    r["dias_resolucion"] = (r["fecha_cierre"] - r["fecha_apertura"]).dt.days
    r["abierta"] = r["fecha_cierre"].isna()
    r["dias_abierta"] = np.where(r["abierta"], (FECHA_CORTE - r["fecha_apertura"]).dt.days, np.nan)
    return r.rename(columns={"_id": "reclamacion_id"})


# ----------------------------------------------------------------------------- datos abiertos
def transformar_fonacot(trab, mont):
    """Pasa las tablas anchas de FONACOT (Oct_mujeres, Oct_hombres, ...) a formato largo."""
    def a_largo(df, valor):
        df = df.rename(columns=lambda c: c.strip())
        largo = df.melt(id_vars="ENTIDAD_FEDERATIVA", var_name="columna", value_name=valor)
        largo[["mes", "genero"]] = largo["columna"].str.split("_", expand=True)
        largo[valor] = pd.to_numeric(largo[valor].astype(str).str.replace(",", "").str.strip(), errors="coerce")
        largo["genero"] = largo["genero"].map({"mujeres": "Mujer", "hombres": "Hombre"})
        return largo.drop(columns="columna")
    t = a_largo(trab, "trabajadores")
    m = a_largo(mont, "monto")
    df = t.merge(m, on=["ENTIDAD_FEDERATIVA", "mes", "genero"])
    df = df.rename(columns={"ENTIDAD_FEDERATIVA": "entidad"})
    df["entidad"] = df["entidad"].str.strip().str.title()
    df["mes"] = df["mes"].map({"Oct": "2025-10", "Nov": "2025-11", "Dic": "2025-12"})
    df["periodo"] = "4T 2025"
    df["fuente"] = "FONACOT – datos.gob.mx"
    return df.dropna(subset=["trabajadores"])


def resumen_genero(fonacot, prest, socios):
    """Compara la participación de mujeres y el crédito promedio de la caja contra FONACOT
    (mismo periodo: oct–dic 2025) en Oaxaca y a nivel nacional."""
    filas = []
    for nombre, f in [("FONACOT Oaxaca", fonacot[fonacot["entidad"] == "Oaxaca"]),
                      ("FONACOT Nacional", fonacot[fonacot["entidad"] != "App Movil"])]:
        g = f.groupby("genero")[["trabajadores", "monto"]].sum()
        filas.append({"fuente": nombre, "periodo": "Oct–Dic 2025",
                      "pct_mujeres": round(g.loc["Mujer", "trabajadores"] / g["trabajadores"].sum(), 4),
                      "credito_prom_mujer": round(g.loc["Mujer", "monto"] / g.loc["Mujer", "trabajadores"], 2),
                      "credito_prom_hombre": round(g.loc["Hombre", "monto"] / g.loc["Hombre", "trabajadores"], 2),
                      "creditos": int(g["trabajadores"].sum())})
    p = prest[prest["aprobado"]].merge(socios[["socio_id", "genero"]], on="socio_id")
    p = p[(p["fecha_otorgamiento"] >= "2025-10-01") & (p["fecha_otorgamiento"] < "2026-01-01")]
    g = p.groupby("genero")["monto_autorizado"].agg(["count", "sum"])
    filas.append({"fuente": "Caja de ahorro", "periodo": "Oct–Dic 2025",
                  "pct_mujeres": round(g.loc["Mujer", "count"] / g["count"].sum(), 4),
                  "credito_prom_mujer": round(g.loc["Mujer", "sum"] / g.loc["Mujer", "count"], 2),
                  "credito_prom_hombre": round(g.loc["Hombre", "sum"] / g.loc["Hombre", "count"], 2),
                  "creditos": int(g["count"].sum())})
    return pd.DataFrame(filas)


def transformar_sniiv(df):
    """Normaliza la respuesta de la API del SNIIV (campos año/sexo/acciones/monto)."""
    if df.empty:
        return df
    df = df.rename(columns=lambda c: str(c).lower().replace("ñ", "n"))
    df = df.rename(columns={"anio": "anio", "año": "anio", "genero": "sexo"})
    columnas = [c for c in ["anio", "sexo", "acciones", "monto"] if c in df.columns]
    df = df[columnas].copy()
    for c in ["acciones", "monto"]:
        if c in df:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    df["entidad"] = "Oaxaca"
    df["fuente"] = "SNIIV – SEDATU"
    return df


# ----------------------------------------------------------------------------- orquestación
def transformar(datos, fonacot_trab, fonacot_mont, sniiv):
    socios = limpiar_socios(datos["socios_ahorradores"])
    movs = limpiar_movimientos(datos["movimientos_financieros"])
    prest = limpiar_prestamos(datos["prestamos"])
    fonacot = transformar_fonacot(fonacot_trab, fonacot_mont)

    instituciones = datos["instituciones_financieras"].rename(columns={"_id": "institucion_id"})
    resultado = {
        "dim_instituciones": instituciones,
        "fact_movimientos_mensual": hechos_movimientos(movs, socios),
        "fact_captacion_mensual": hechos_captacion(movs, socios),
        "fact_socios_mensual": hechos_socios(socios),
        "fact_cartera_mensual": hechos_cartera(prest, socios),
        "fact_solicitudes_mensual": hechos_solicitudes(prest, socios),
        "detalle_cartera": detalle_cartera(prest, socios),
        "fact_reclamaciones": hechos_reclamaciones(datos["procesos_intervencion_reclamaciones"], socios),
        "od_fonacot": fonacot,
        "od_comparativo_genero": resumen_genero(fonacot, prest, socios),
        "od_sniiv": transformar_sniiv(sniiv),
    }
    for k, v in resultado.items():
        log.info("Transformado %-28s %7d filas", k, len(v))
    return resultado
