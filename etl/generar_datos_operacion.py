"""
Generador de datos de operación del Sistema de Gestión para Caja de Ahorro Popular.

Simula la base transaccional (OLTP) del sistema con las cinco colecciones definidas
en el entregable 4.2.2: instituciones_financieras, socios_ahorradores,
movimientos_financieros, prestamos y procesos_intervencion_reclamaciones.

Los datos son ficticios pero realistas y reproducibles (semilla fija). Representan
24 meses de operación (nov-2024 a oct-2026) para que el ETL calcule saldos
acumulados y la ventana de análisis de 12 meses que muestra el dashboard.

Uso:
    python generar_datos_operacion.py            # usa MONGO_URI o mongodb://localhost:27017
"""
import random
from datetime import datetime, timedelta

import numpy as np
from pymongo import MongoClient

from config import MONGO_URI, DB_OPERACION, FECHA_CORTE

SEMILLA = 2026
rng = np.random.default_rng(SEMILLA)
random.seed(SEMILLA)

INICIO_HISTORIA = datetime(2024, 11, 1)
CORTE = FECHA_CORTE  # 31-oct-2026

INSTITUCIONES = [
    {"_id": "CAJA-01", "nombre": "Caja Popular Monte Albán", "sucursal": "Oaxaca Centro",
     "tipo_entidad": "SOCAP Nivel II", "clave_cnbv": "29-245", "municipio": "Oaxaca de Juárez", "peso": 0.45},
    {"_id": "CAJA-02", "nombre": "Caja Solidaria Valle de Etla", "sucursal": "Villa de Etla",
     "tipo_entidad": "SOCAP Nivel I", "clave_cnbv": "29-318", "municipio": "Villa de Etla", "peso": 0.30},
    {"_id": "CAJA-03", "nombre": "Caja Popular Tlacolula", "sucursal": "Tlacolula de Matamoros",
     "tipo_entidad": "SOCAP Nivel I", "clave_cnbv": "29-402", "municipio": "Tlacolula de Matamoros", "peso": 0.25},
]

# Tipo de afiliación: proporción de socios y probabilidad base de incumplimiento
AFILIACIONES = {
    "Individual":              {"peso": 0.42, "p_mora": 0.085, "tasa": (0.26, 0.34)},
    "Caja laboral con nómina": {"peso": 0.26, "p_mora": 0.018, "tasa": (0.16, 0.22)},
    "Caja laboral sin nómina": {"peso": 0.20, "p_mora": 0.190, "tasa": (0.22, 0.30)},
    "Grupo solidario":         {"peso": 0.12, "p_mora": 0.060, "tasa": (0.30, 0.38)},
}
EMPRESAS = {
    "Caja laboral con nómina": [("Servicios de Salud del Valle", 1.0), ("Maquiladora Textil Zaachila", 1.2),
                                ("Distribuidora Oaxaqueña de Abarrotes", 0.8)],
    "Caja laboral sin nómina": [("Constructora Monte Verde", 1.45), ("Comercializadora Central de Abasto", 1.1),
                                ("Transportes Istmo-Valles", 0.95), ("Mezcalera Artesanal Matatlán", 0.6)],
}
GARANTIAS = {
    "Individual": ["Aval", "Prendaria", "Hipotecaria", "Sin garantía"],
    "Caja laboral con nómina": ["Descuento vía nómina"],
    "Caja laboral sin nómina": ["Aval", "Sin garantía"],
    "Grupo solidario": ["Garantía solidaria"],
}
NOMBRES_M = ["María", "Guadalupe", "Juana", "Rosa", "Josefina", "Ana", "Leticia", "Margarita", "Elena", "Carmen",
             "Isabel", "Lucía", "Verónica", "Patricia", "Adriana", "Fernanda", "Daniela", "Itzel", "Xóchitl", "Citlali"]
NOMBRES_H = ["José", "Juan", "Pedro", "Miguel", "Luis", "Jorge", "Francisco", "Antonio", "Carlos", "Manuel",
             "Rafael", "Javier", "Raúl", "Eduardo", "Fernando", "Alejandro", "Emiliano", "Mateo", "Diego", "Santiago"]
APELLIDOS = ["Hernández", "García", "Martínez", "López", "Pérez", "Cruz", "Santiago", "Ramírez", "Ruiz", "Mendoza",
             "Jiménez", "Vásquez", "Díaz", "Gómez", "Reyes", "Morales", "Ortiz", "Aquino", "Bautista", "Luis"]
CAUSAS = [("Cobranza indebida o fuera de horario", 0.28), ("Cargo no reconocido", 0.20),
          ("Error en transferencia SPEI", 0.17), ("Retención o demora en retiro de ahorro", 0.15),
          ("Información incorrecta en buró de crédito", 0.12), ("Cobro de comisiones no pactadas", 0.08)]


def meses(desde, hasta):
    """Lista de primeros días de mes entre dos fechas (inclusive)."""
    out, d = [], datetime(desde.year, desde.month, 1)
    while d <= hasta:
        out.append(d)
        d = datetime(d.year + (d.month == 12), d.month % 12 + 1, 1)
    return out


def sumar_meses(fecha, n):
    m = fecha.month - 1 + n
    y = fecha.year + m // 12
    m = m % 12 + 1
    dia = min(fecha.day, 28)
    return datetime(y, m, dia, fecha.hour, fecha.minute)


def fecha_en_mes(mes):
    fin = sumar_meses(mes, 1) - timedelta(days=1)
    if fin > CORTE:
        fin = CORTE
    dias = (fin - mes).days
    return mes + timedelta(days=int(rng.integers(0, dias + 1)), hours=int(rng.integers(8, 19)),
                           minutes=int(rng.integers(0, 60)))


def elegir(dic_pesos):
    claves = list(dic_pesos)
    pesos = np.array([dic_pesos[k] for k in claves], dtype=float)
    return claves[rng.choice(len(claves), p=pesos / pesos.sum())]


def generar_socios(n=2600):
    socios = []
    pesos_inst = {i["_id"]: i["peso"] for i in INSTITUCIONES}
    pesos_af = {k: v["peso"] for k, v in AFILIACIONES.items()}
    for i in range(1, n + 1):
        genero = "M" if rng.random() < 0.56 else "H"
        nombre = random.choice(NOMBRES_M if genero == "M" else NOMBRES_H)
        afil = elegir(pesos_af)
        empresa = None
        if afil in EMPRESAS:
            empresa = random.choice([e for e, _ in EMPRESAS[afil]])
        # Altas con crecimiento: más socios recientes
        anios_atras = rng.exponential(2.6)
        alta = CORTE - timedelta(days=int(min(anios_atras, 10) * 365))
        baja = None
        if rng.random() < 0.07:
            baja = alta + timedelta(days=int(rng.integers(60, max(61, (CORTE - alta).days))))
            if baja > CORTE:
                baja = None
        socios.append({
            "_id": f"SOC-{i:05d}",
            "nombre": f"{nombre} {random.choice(APELLIDOS)} {random.choice(APELLIDOS)}",
            "genero": genero,
            "edad": int(np.clip(rng.normal(41, 12), 18, 80)),
            "institucion_id": elegir(pesos_inst),
            "tipo_afiliacion": afil,
            "empresa": empresa,
            "fecha_alta": alta,
            "fecha_baja": baja,
            "estatus": "inactivo" if baja else "activo",
        })
    return socios


# Estacionalidad (mes -> factor): diciembre aguinaldo, enero y agosto con más retiros
EST_DEP = {1: 0.80, 2: 0.95, 3: 1.0, 4: 1.0, 5: 1.05, 6: 1.0, 7: 1.0, 8: 0.90, 9: 0.88, 10: 1.0, 11: 1.05, 12: 1.45}
EST_RET = {1: 1.55, 2: 1.0, 3: 0.95, 4: 1.05, 5: 1.0, 6: 0.95, 7: 1.10, 8: 1.40, 9: 1.30, 10: 1.0, 11: 0.95, 12: 1.30}


def medio_operacion(mes, afil, tipo):
    t = (mes.year - 2024) * 12 + mes.month - 11  # 0..23
    app = 0.08 + 0.012 * t
    spei = 0.18
    transf = 0.10
    ventanilla = max(0.25, 1 - app - spei - transf)
    pesos = {"Ventanilla": ventanilla, "App móvil": app, "SPEI": spei, "Transferencia interna": transf}
    if afil == "Caja laboral con nómina" and tipo == "deposito" and rng.random() < 0.7:
        return "Descuento vía nómina"
    return elegir(pesos)


def generar_movimientos(socios):
    movs = []
    lista_meses = meses(INICIO_HISTORIA, CORTE)
    contador = 0
    for s in socios:
        base = rng.lognormal(7.6, 0.6)  # depósito típico ~2,000
        # Saldo inicial para socios existentes antes de la ventana de historia
        if s["fecha_alta"] < INICIO_HISTORIA:
            contador += 1
            movs.append({"_id": f"MOV-{contador:07d}", "socio_id": s["_id"], "institucion_id": s["institucion_id"],
                         "tipo_movimiento": "saldo_inicial", "monto": round(float(base * rng.uniform(6, 14)), 2),
                         "fecha_hora": INICIO_HISTORIA, "medio_operacion": "Migración de saldos",
                         "referencia": "Saldo al 01/11/2024"})
        for mes in lista_meses:
            fin_mes = sumar_meses(mes, 1)
            if s["fecha_alta"] >= fin_mes or (s["fecha_baja"] and s["fecha_baja"] < mes):
                continue
            mes_n = mes.month
            # Tendencia: el ahorro crece en el tiempo
            tendencia = 1 + 0.01 * ((mes.year - 2024) * 12 + mes.month - 11)
            n_dep = rng.poisson(1.6 * EST_DEP[mes_n])
            n_ret = rng.poisson(0.85 * EST_RET[mes_n])
            for _ in range(n_dep):
                contador += 1
                movs.append({"_id": f"MOV-{contador:07d}", "socio_id": s["_id"], "institucion_id": s["institucion_id"],
                             "tipo_movimiento": "deposito",
                             "monto": round(float(base * tendencia * rng.uniform(0.5, 1.5) * (1.25 if mes_n == 12 else 1)), 2),
                             "fecha_hora": fecha_en_mes(mes), "medio_operacion": medio_operacion(mes, s["tipo_afiliacion"], "deposito"),
                             "referencia": None})
            for _ in range(n_ret):
                contador += 1
                movs.append({"_id": f"MOV-{contador:07d}", "socio_id": s["_id"], "institucion_id": s["institucion_id"],
                             "tipo_movimiento": "retiro",
                             "monto": round(float(base * rng.uniform(1.1, 2.6)), 2),
                             "fecha_hora": fecha_en_mes(mes), "medio_operacion": medio_operacion(mes, s["tipo_afiliacion"], "retiro"),
                             "referencia": None})
    return movs


def generar_prestamos(socios):
    prestamos = []
    activos = [s for s in socios]
    lista_meses = meses(datetime(2022, 11, 1), CORTE)
    contador = 0
    for mes in lista_meses:
        t = (mes.year - 2022) * 12 + mes.month - 11  # 0..47
        n_sol = int(rng.poisson(70 + 0.45 * t))
        # Política de crédito que se relajó en 2026: más aprobación y más riesgo
        relajacion = 0 if mes < datetime(2025, 8, 1) else min(1.0, ((mes.year - 2025) * 12 + mes.month - 8) / 7)
        p_aprob = 0.70 + 0.15 * relajacion
        for _ in range(n_sol):
            s = activos[int(rng.integers(0, len(activos)))]
            if s["fecha_alta"] > mes:
                continue
            afil = s["tipo_afiliacion"]
            conf = AFILIACIONES[afil]
            contador += 1
            solicitado = float(np.clip(rng.lognormal(10.1, 0.55), 3000, 180000))
            solicitado = round(solicitado / 500) * 500
            fecha_sol = fecha_en_mes(mes)
            aprobado = rng.random() < p_aprob
            plazo = int(rng.choice([6, 12, 18, 24, 36], p=[0.15, 0.35, 0.2, 0.2, 0.1]))
            tasa = round(float(rng.uniform(*conf["tasa"])), 4)
            p = {
                "_id": f"PRE-{contador:06d}", "socio_id": s["_id"], "institucion_id": s["institucion_id"],
                "fecha_solicitud": fecha_sol, "monto_solicitado": solicitado,
                "plazo_meses": plazo, "tasa_interes_anual": tasa,
                "cat": round(tasa * 1.32 + 0.04, 4), "garantia": random.choice(GARANTIAS[afil]),
                "estatus_solicitud": "aprobada" if aprobado else "rechazada",
                "monto_autorizado": None, "fecha_otorgamiento": None, "fecha_ultimo_pago": None,
                "fecha_liquidacion": None, "dias_atraso": 0, "estatus": "rechazado",
            }
            if aprobado:
                autorizado = round(solicitado * float(rng.uniform(0.72, 1.0)) / 500) * 500
                otorg = fecha_sol + timedelta(days=int(rng.integers(2, 12)))
                if otorg > CORTE:
                    otorg = CORTE
                p.update({"monto_autorizado": autorizado, "fecha_otorgamiento": otorg})
                empresa_factor = 1.0
                if s["empresa"]:
                    empresa_factor = dict(EMPRESAS[afil])[s["empresa"]]
                p_mora = conf["p_mora"] * empresa_factor * (1 + 3.6 * relajacion) * 1.45 * (1.15 if solicitado > 60000 else 1) * (0.55 + 3.2 * max(0.0, tasa - 0.20))
                vencimiento = sumar_meses(otorg, plazo)
                if rng.random() < p_mora:
                    k = int(rng.integers(1, max(2, plazo - 1)))
                    ultimo = sumar_meses(otorg, k)
                    p["fecha_ultimo_pago"] = min(ultimo, CORTE)
                    if ultimo + timedelta(days=30) < CORTE:
                        p["dias_atraso"] = (CORTE - (ultimo + timedelta(days=30))).days
                    p["estatus"] = "vencido" if p["dias_atraso"] > 90 else "vigente"
                elif vencimiento <= CORTE:
                    p["fecha_ultimo_pago"] = vencimiento
                    p["fecha_liquidacion"] = vencimiento
                    p["estatus"] = "liquidado"
                else:
                    p["fecha_ultimo_pago"] = sumar_meses(otorg, max(0, (CORTE.year - otorg.year) * 12 + CORTE.month - otorg.month - 1))
                    p["dias_atraso"] = int(rng.choice([0, 0, 0, 0, 0, 0, 5, 12, 25]))
                    p["estatus"] = "vigente"
            prestamos.append(p)
    return prestamos


def generar_reclamaciones(socios):
    recls, contador = [], 0
    for mes in meses(datetime(2025, 1, 1), CORTE):
        t = (mes.year - 2025) * 12 + mes.month - 1
        for _ in range(int(rng.poisson(7 + 0.35 * t))):
            s = socios[int(rng.integers(0, len(socios)))]
            contador += 1
            apertura = fecha_en_mes(mes)
            dias = int(rng.exponential(22)) + 2
            cierre = apertura + timedelta(days=dias)
            abierta = cierre > CORTE
            recls.append({
                "_id": f"REC-{contador:05d}", "socio_id": s["_id"], "institucion_id": s["institucion_id"],
                "folio_condusef": f"CDF-{apertura.year}-{contador:05d}",
                "causa_intervencion": elegir(dict(CAUSAS)), "canal": random.choice(["SIGE CONDUSEF", "Unidad Especializada (UNE)"]),
                "fecha_apertura": apertura, "fecha_cierre": None if abierta else cierre,
                "estatus": "abierta" if abierta else random.choice(["resuelta a favor del socio", "resuelta a favor de la caja"]),
            })
    return recls


def main():
    cliente = MongoClient(MONGO_URI)
    db = cliente[DB_OPERACION]
    print(f"Generando datos de operación en {DB_OPERACION}...")
    socios = generar_socios()
    movs = generar_movimientos(socios)
    prestamos = generar_prestamos(socios)
    recls = generar_reclamaciones(socios)
    insts = [{k: v for k, v in i.items() if k != "peso"} for i in INSTITUCIONES]

    for nombre, docs in [("instituciones_financieras", insts), ("socios_ahorradores", socios),
                         ("movimientos_financieros", movs), ("prestamos", prestamos),
                         ("procesos_intervencion_reclamaciones", recls)]:
        db[nombre].drop()
        db[nombre].insert_many(docs)
        print(f"  {nombre:40s} {len(docs):>8,} documentos")
    db.movimientos_financieros.create_index([("fecha_hora", 1)])
    db.prestamos.create_index([("socio_id", 1)])
    print("Listo.")


if __name__ == "__main__":
    main()
