"""
Proceso ETL del Dashboard de Salud Financiera y Riesgo Crediticio.

    python etl.py

Extrae de la base transaccional de la caja y de los datos abiertos (FONACOT y SNIIV),
transforma la información en hechos mensuales y la carga en la base analítica que
consulta la API del dashboard.
"""
import logging
import time

import extract
import load
import transform

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)-14s %(levelname)-7s %(message)s",
                    datefmt="%H:%M:%S")
log = logging.getLogger("etl")


def main():
    inicio = time.time()
    log.info("=== EXTRACCIÓN ===")
    datos = extract.extraer_operacion()
    fon_trab, fon_mont, origen_fonacot = extract.extraer_fonacot()
    sniiv = extract.extraer_sniiv()

    log.info("=== TRANSFORMACIÓN ===")
    colecciones = transform.transformar(datos, fon_trab, fon_mont, sniiv)

    log.info("=== CARGA ===")
    bitacora = {
        "registros_origen": {k: len(v) for k, v in datos.items()},
        "registros_destino": {k: len(v) for k, v in colecciones.items()},
        "fuentes_abiertas": {"fonacot": origen_fonacot, "sniiv": "api" if len(sniiv) else "no disponible"},
        "duracion_seg": None,
    }
    bitacora["duracion_seg"] = round(time.time() - inicio, 2)
    load.cargar(colecciones, bitacora)
    log.info("ETL terminado en %.1f s", time.time() - inicio)


if __name__ == "__main__":
    main()
