"""Configuración compartida del ETL (se puede sobrescribir con variables de entorno)."""
import os
from datetime import datetime
from pathlib import Path

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_OPERACION = os.getenv("DB_OPERACION", "caja_ahorro")            # base transaccional (origen)
DB_ANALITICA = os.getenv("DB_ANALITICA", "caja_ahorro_analitica")  # base analítica (destino)

FECHA_CORTE = datetime(2026, 10, 31, 23, 59)
MESES_ANALISIS = 12               # ventana que muestra el dashboard
DIAS_CARTERA_VENCIDA = 90         # criterio CNBV para considerar un crédito vencido
DIAS_CASTIGO = 365               # más de un año de atraso: crédito castigado
META_MOROSIDAD = 0.05

CARPETA_DATOS_ABIERTOS = Path(__file__).parent / "datos_abiertos"

# Datos abiertos (FONACOT en datos.gob.mx). Si la descarga falla se usa la copia local.
FONACOT_TRABAJADORES_URL = os.getenv("FONACOT_TRABAJADORES_URL", "")
FONACOT_MONTOS_URL = os.getenv("FONACOT_MONTOS_URL", "")

# API del SNIIV (SEDATU): financiamientos de vivienda por género en Oaxaca (clave 20)
SNIIV_URL = ("https://sniiv.sedatu.gob.mx/api/CuboAPI/GetFinanciamiento/"
             "{anio_ini},{anio_fin}/20/000/genero")
SNIIV_ANIOS = (2025, 2025)
