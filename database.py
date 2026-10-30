# -*- coding: utf-8 -*-
"""
Módulo de Base de Datos Relacional (3FN) - BODEGA MIRIAM
Implementación física en SQLite con integridad referencial, transacciones atómicas
y cálculo en tiempo real de márgenes de ganancia, arqueo por turnos y conciliación multicanal.
"""

import sqlite3
import os
import datetime
from typing import List, Dict, Any, Tuple, Optional

# Zona horaria de Perú (UTC-5) para sincronización exacta en la nube
TZ_PERU = datetime.timezone(datetime.timedelta(hours=-5))

def get_peru_now() -> datetime.datetime:
    return datetime.datetime.now(TZ_PERU)

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bodega_miriam.db')

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_database(force_reinit: bool = False):
    """Crea las 7 tablas en 3FN y si no hay registros o se fuerza, puebla el catálogo y ventas piloto."""
    conn = get_connection()
    cur = conn.cursor()
    
    if force_reinit:
        cur.executescript("""
            DROP TABLE IF EXISTS DETALLE_VENTA;
            DROP TABLE IF EXISTS VENTA;
            DROP TABLE IF EXISTS PRODUCTO;
            DROP TABLE IF EXISTS CATEGORIA;
            DROP TABLE IF EXISTS MARCA;
            DROP TABLE IF EXISTS PROVEEDOR;
            DROP TABLE IF EXISTS METODO_PAGO;
        """)

    # 1. PROVEEDOR
    cur.execute("""
        CREATE TABLE IF NOT EXISTS PROVEEDOR (
            Id_Proveedor INTEGER PRIMARY KEY AUTOINCREMENT,
            Razon_Social TEXT NOT NULL,
            RUC_Proveedor TEXT NOT NULL UNIQUE CHECK(length(RUC_Proveedor) = 11)
        );
    """)

    # 2. MARCA
    cur.execute("""
        CREATE TABLE IF NOT EXISTS MARCA (
            Id_Marca TEXT PRIMARY KEY,
            Nombre_Marca TEXT NOT NULL,
            Id_Proveedor INTEGER NOT NULL,
            FOREIGN KEY (Id_Proveedor) REFERENCES PROVEEDOR(Id_Proveedor)
        );
    """)

    # 3. CATEGORIA
    cur.execute("""
        CREATE TABLE IF NOT EXISTS CATEGORIA (
            Id_Categoria TEXT PRIMARY KEY,
            Nombre_Categoria TEXT NOT NULL
        );
    """)

    # 4. PRODUCTO
    cur.execute("""
        CREATE TABLE IF NOT EXISTS PRODUCTO (
            Id_Producto TEXT PRIMARY KEY,
            Nombre_Producto TEXT NOT NULL,
            Id_Marca TEXT NOT NULL,
            Id_Categoria TEXT NOT NULL,
            Es_Retornable INTEGER NOT NULL DEFAULT 0 CHECK(Es_Retornable IN (0,1)),
            Costo_Compra REAL NOT NULL CHECK(Costo_Compra >= 0),
            Precio_Venta REAL NOT NULL CHECK(Precio_Venta >= Costo_Compra),
            FOREIGN KEY (Id_Marca) REFERENCES MARCA(Id_Marca),
            FOREIGN KEY (Id_Categoria) REFERENCES CATEGORIA(Id_Categoria)
        );
    """)

    # 5. METODO_PAGO
    cur.execute("""
        CREATE TABLE IF NOT EXISTS METODO_PAGO (
            Id_MetodoPago TEXT PRIMARY KEY,
            Nombre_Metodo TEXT NOT NULL,
            Descripcion TEXT
        );
    """)

    # 6. VENTA
    cur.execute("""
        CREATE TABLE IF NOT EXISTS VENTA (
            Id_Venta TEXT PRIMARY KEY,
            Fecha_Venta TEXT NOT NULL,
            Hora_Venta TEXT NOT NULL,
            Id_MetodoPago TEXT NOT NULL,
            Total_Venta REAL NOT NULL CHECK(Total_Venta > 0),
            FOREIGN KEY (Id_MetodoPago) REFERENCES METODO_PAGO(Id_MetodoPago)
        );
    """)

    # 7. DETALLE_VENTA
    cur.execute("""
        CREATE TABLE IF NOT EXISTS DETALLE_VENTA (
            Id_Venta TEXT NOT NULL,
            Id_Producto TEXT NOT NULL,
            Cantidad INTEGER NOT NULL CHECK(Cantidad > 0),
            Precio_Unitario REAL NOT NULL CHECK(Precio_Unitario >= 0),
            Subtotal REAL NOT NULL CHECK(Subtotal >= 0),
            PRIMARY KEY (Id_Venta, Id_Producto),
            FOREIGN KEY (Id_Venta) REFERENCES VENTA(Id_Venta) ON DELETE CASCADE,
            FOREIGN KEY (Id_Producto) REFERENCES PRODUCTO(Id_Producto)
        );
    """)

    # Verificar si ya tiene datos
    cur.execute("SELECT COUNT(*) FROM PRODUCTO")
    prod_count = cur.fetchone()[0]

    if prod_count == 0 or force_reinit:
        # Población inicial DML
        cur.executescript("""
            -- Distribuidores Oficiales
            INSERT OR REPLACE INTO PROVEEDOR (Id_Proveedor, Razon_Social, RUC_Proveedor) VALUES
            (1, 'Paci Distribuciones S.A.C.', '20601234567'),
            (2, 'Salem Mayorista de Bebidas E.I.R.L.', '20509876543'),
            (3, 'CBC Market Comercializadora S.A.', '20405678901');

            -- Marcas Concesionadas
            INSERT OR REPLACE INTO MARCA (Id_Marca, Nombre_Marca, Id_Proveedor) VALUES
            ('M01', 'Coca-Cola', 3),
            ('M02', 'Inca Kola', 3),
            ('M03', 'Cielo', 1),
            ('M04', 'Sporade', 2),
            ('M05', 'Gatorade', 2);

            -- Categorías
            INSERT OR REPLACE INTO CATEGORIA (Id_Categoria, Nombre_Categoria) VALUES
            ('C01', 'Gaseosa'),
            ('C02', 'Agua de Mesa'),
            ('C03', 'Bebida Rehidratante');

            -- Catálogo Oficial con Costo Mayorista y Precio de Mostrador (3FN)
            INSERT OR REPLACE INTO PRODUCTO (Id_Producto, Nombre_Producto, Id_Marca, Id_Categoria, Es_Retornable, Costo_Compra, Precio_Venta) VALUES
            ('P01', 'Coca-Cola 3 L Descartable', 'M01', 'C01', 0, 11.00, 13.50),
            ('P02', 'Coca-Cola 2.5 L Retornable', 'M01', 'C01', 1, 6.00, 7.50),
            ('P03', 'Inca Kola 3 L Descartable', 'M02', 'C01', 0, 11.00, 13.50),
            ('P04', 'Agua Cielo 1 L Descartable', 'M03', 'C02', 0, 1.80, 2.50),
            ('P05', 'Agua Cielo 625 ml Descartable', 'M03', 'C02', 0, 0.70, 1.00),
            ('P06', 'Sporade Tropical 500 ml', 'M04', 'C03', 0, 1.80, 2.50),
            ('P07', 'Gatorade Tropical 500 ml', 'M05', 'C03', 0, 1.90, 2.50),
            ('P08', 'Gatorade Mandarina 500 ml', 'M05', 'C03', 0, 1.90, 2.50);

            -- Canales de Cobro
            INSERT OR REPLACE INTO METODO_PAGO (Id_MetodoPago, Nombre_Metodo, Descripcion) VALUES
            ('MP01', 'Efectivo', 'Dinero físico en gaveta de mostrador'),
            ('MP02', 'Yape', 'Billetera digital móvil BCP de Miriam (987-654-321)'),
            ('MP03', 'Plin', 'Billetera digital Interbank/BBVA (987-654-321)');

            -- Ventas Piloto Basales (Fecha_Venta: 2026-10-25)
            INSERT OR REPLACE INTO VENTA (Id_Venta, Fecha_Venta, Hora_Venta, Id_MetodoPago, Total_Venta) VALUES
            ('V01', '2026-10-25', '09:30:00', 'MP01', 4.50),
            ('V02', '2026-10-25', '12:15:00', 'MP02', 13.50),
            ('V03', '2026-10-25', '15:00:00', 'MP01', 21.00),
            ('V04', '2026-10-25', '17:20:00', 'MP03', 5.00),
            ('V05', '2026-10-25', '19:10:00', 'MP01', 7.50);

            -- Detalle Transaccional N:M
            INSERT OR REPLACE INTO DETALLE_VENTA (Id_Venta, Id_Producto, Cantidad, Precio_Unitario, Subtotal) VALUES
            ('V01', 'P05', 2, 1.00, 2.00),
            ('V01', 'P07', 1, 2.50, 2.50),
            ('V02', 'P01', 1, 13.50, 13.50),
            ('V03', 'P03', 1, 13.50, 13.50),
            ('V03', 'P06', 2, 2.50, 5.00),
            ('V03', 'P04', 1, 2.50, 2.50),
            ('V04', 'P08', 1, 2.50, 2.50),
            ('V04', 'P06', 1, 2.50, 2.50),
            ('V05', 'P02', 1, 7.50, 7.50);
        """)

    conn.commit()
    conn.close()

# =========================================================================
# QUERIES Y OPERACIONES TRANSACCIONALES
# =========================================================================

def get_catalog_items() -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT 
            p.Id_Producto,
            p.Nombre_Producto,
            p.Es_Retornable,
            p.Costo_Compra,
            p.Precio_Venta,
            m.Id_Marca,
            m.Nombre_Marca,
            c.Id_Categoria,
            c.Nombre_Categoria,
            pr.Razon_Social as Proveedor
        FROM PRODUCTO p
        INNER JOIN MARCA m ON p.Id_Marca = m.Id_Marca
        INNER JOIN CATEGORIA c ON p.Id_Categoria = c.Id_Categoria
        INNER JOIN PROVEEDOR pr ON m.Id_Proveedor = pr.Id_Proveedor
        ORDER BY c.Nombre_Categoria, p.Nombre_Producto
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def get_payment_methods() -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM METODO_PAGO ORDER BY Id_MetodoPago")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def get_categories() -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM CATEGORIA ORDER BY Nombre_Categoria")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def get_sales_history(limit: int = 50) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT 
            v.Id_Venta,
            v.Fecha_Venta,
            v.Hora_Venta,
            v.Total_Venta,
            mp.Nombre_Metodo,
            mp.Id_MetodoPago,
            ROUND(SUM(dv.Cantidad * p.Costo_Compra), 2) as Costo_Total,
            ROUND(v.Total_Venta - SUM(dv.Cantidad * p.Costo_Compra), 2) as Ganancia_Neta,
            GROUP_CONCAT(dv.Cantidad || 'x ' || p.Nombre_Producto, ', ') as Resumen_Items
        FROM VENTA v
        INNER JOIN METODO_PAGO mp ON v.Id_MetodoPago = mp.Id_MetodoPago
        INNER JOIN DETALLE_VENTA dv ON v.Id_Venta = dv.Id_Venta
        INNER JOIN PRODUCTO p ON dv.Id_Producto = p.Id_Producto
        GROUP BY v.Id_Venta
        ORDER BY v.Fecha_Venta DESC, v.Hora_Venta DESC
        LIMIT ?
    """, (limit,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def register_sale_transaction(items: List[Dict[str, Any]], id_metodo_pago: str, custom_date: Optional[str] = None) -> Dict[str, Any]:
    """
    Ejecuta una transacción ACID real:
    1. Genera Id_Venta consecutivo (ej. V06, V07...)
    2. Consulta catálogo oficial y congela precios históricos
    3. Inserta cabecera en VENTA
    4. Inserta registros en DETALLE_VENTA
    """
    if not items:
        raise ValueError("El carrito de compras no contiene productos.")

    now = get_peru_now()
    fecha_venta = custom_date or now.strftime('%Y-%m-%d')
    hora_venta = now.strftime('%H:%M:%S')

    conn = get_connection()
    cur = conn.cursor()

    try:
        cur.execute("BEGIN TRANSACTION;")

        # Generar Id_Venta
        cur.execute("SELECT Id_Venta FROM VENTA ORDER BY ROWID DESC LIMIT 1;")
        last_row = cur.fetchone()
        if last_row and last_row['Id_Venta'].startswith('V'):
            try:
                num = int(last_row['Id_Venta'][1:]) + 1
                new_id_venta = f"V{num:02d}"
            except ValueError:
                new_id_venta = f"V{int(now.timestamp()) % 10000:04d}"
        else:
            new_id_venta = "V01"

        total_venta = 0.0
        total_costo = 0.0
        detalle_records = []

        for it in items:
            prod_id = it['id_producto']
            cant = int(it['cantidad'])
            if cant <= 0:
                raise ValueError(f"Cantidad inválida para producto {prod_id}")

            # Consultar datos actuales del producto
            cur.execute("SELECT Nombre_Producto, Costo_Compra, Precio_Venta FROM PRODUCTO WHERE Id_Producto = ?", (prod_id,))
            prod = cur.fetchone()
            if not prod:
                raise ValueError(f"Producto {prod_id} no existe.")

            p_unit = float(prod['Precio_Venta'])
            c_unit = float(prod['Costo_Compra'])
            subt = round(p_unit * cant, 2)
            total_venta += subt
            total_costo += round(c_unit * cant, 2)

            detalle_records.append((new_id_venta, prod_id, cant, p_unit, subt))

        total_venta = round(total_venta, 2)
        total_costo = round(total_costo, 2)
        ganancia_neta = round(total_venta - total_costo, 2)

        # Insertar cabecera
        cur.execute("""
            INSERT INTO VENTA (Id_Venta, Fecha_Venta, Hora_Venta, Id_MetodoPago, Total_Venta)
            VALUES (?, ?, ?, ?, ?)
        """, (new_id_venta, fecha_venta, hora_venta, id_metodo_pago, total_venta))

        # Insertar detalle
        cur.executemany("""
            INSERT INTO DETALLE_VENTA (Id_Venta, Id_Producto, Cantidad, Precio_Unitario, Subtotal)
            VALUES (?, ?, ?, ?, ?)
        """, detalle_records)

        conn.commit()

        # Obtener nombre del método de pago
        cur.execute("SELECT Nombre_Metodo FROM METODO_PAGO WHERE Id_MetodoPago = ?", (id_metodo_pago,))
        mp_row = cur.fetchone()
        nombre_metodo = mp_row['Nombre_Metodo'] if mp_row else id_metodo_pago

        return {
            "success": True,
            "id_venta": new_id_venta,
            "fecha": fecha_venta,
            "hora": hora_venta,
            "fecha_venta": fecha_venta,
            "hora_venta": hora_venta,
            "metodo_pago": nombre_metodo,
            "total_venta": total_venta,
            "total_costo": total_costo,
            "ganancia_neta": ganancia_neta,
            "items_count": len(detalle_records)
        }
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def get_financial_summary(target_date: Optional[str] = None) -> Dict[str, Any]:
    """Calcula ingresos, costos, ganancias, arqueo por turnos y conciliación multicanal."""
    conn = get_connection()
    cur = conn.cursor()

    date_filter = ""
    params = []
    if target_date and target_date != 'ALL':
        date_filter = "WHERE v.Fecha_Venta = ?"
        params.append(target_date)

    # 1. Totales generales
    cur.execute(f"""
        SELECT 
            COALESCE(SUM(v.Total_Venta), 0) as Ingreso_Total,
            COUNT(v.Id_Venta) as Total_Transacciones
        FROM VENTA v
        {date_filter}
    """, params)
    gen_v = cur.fetchone()
    ingreso = round(gen_v['Ingreso_Total'], 2)
    transacciones = gen_v['Total_Transacciones']

    # Costo total calculado a partir de los detalles
    date_filter_dv = ""
    if target_date and target_date != 'ALL':
        date_filter_dv = "WHERE v.Fecha_Venta = ?"

    cur.execute(f"""
        SELECT 
            COALESCE(SUM(dv.Cantidad * p.Costo_Compra), 0) as Costo_Total
        FROM DETALLE_VENTA dv
        INNER JOIN VENTA v ON dv.Id_Venta = v.Id_Venta
        INNER JOIN PRODUCTO p ON dv.Id_Producto = p.Id_Producto
        {date_filter_dv}
    """, params)
    costo_row = cur.fetchone()
    costo = round(costo_row['Costo_Total'], 2)
    ganancia = round(ingreso - costo, 2)
    margen = round((ganancia / ingreso * 100), 2) if ingreso > 0 else 0.0

    # 2. Desglose por método de pago (Conciliación Multicanal)
    cur.execute(f"""
        SELECT 
            mp.Id_MetodoPago,
            mp.Nombre_Metodo,
            COALESCE(SUM(v.Total_Venta), 0) as Importe,
            COUNT(v.Id_Venta) as Cantidad_Ventas
        FROM METODO_PAGO mp
        LEFT JOIN VENTA v ON mp.Id_MetodoPago = v.Id_MetodoPago {'AND v.Fecha_Venta = ?' if target_date and target_date != 'ALL' else ''}
        GROUP BY mp.Id_MetodoPago
        ORDER BY mp.Id_MetodoPago
    """, params if target_date and target_date != 'ALL' else [])
    
    canales = []
    efectivo_total = 0.0
    digital_total = 0.0
    for r in cur.fetchall():
        imp = round(r['Importe'], 2)
        pct = round((imp / ingreso * 100), 2) if ingreso > 0 else 0.0
        if r['Id_MetodoPago'] == 'MP01':
            efectivo_total += imp
        else:
            digital_total += imp
        canales.append({
            "id": r['Id_MetodoPago'],
            "nombre": r['Nombre_Metodo'],
            "importe": imp,
            "ventas": r['Cantidad_Ventas'],
            "porcentaje": pct
        })

    # 3. Arqueo por turnos
    # Mañana: 08:00 - 12:59, Tarde: 13:00 - 17:59, Noche: 18:00 - 23:59
    cur.execute(f"""
        SELECT 
            v.Id_Venta,
            v.Hora_Venta,
            v.Total_Venta,
            v.Id_MetodoPago
        FROM VENTA v
        {date_filter}
        ORDER BY v.Hora_Venta
    """, params)
    
    turnos = {
        "Manana": {"nombre": "Mañana (08:00 - 12:59)", "total": 0.0, "efectivo": 0.0, "digital": 0.0, "conteo": 0},
        "Tarde": {"nombre": "Tarde (13:00 - 17:59)", "total": 0.0, "efectivo": 0.0, "digital": 0.0, "conteo": 0},
        "Noche": {"nombre": "Noche (18:00 - 23:59)", "total": 0.0, "efectivo": 0.0, "digital": 0.0, "conteo": 0}
    }

    for row in cur.fetchall():
        h = row['Hora_Venta'][:2]
        h_int = int(h) if h.isdigit() else 12
        tot = float(row['Total_Venta'])
        is_cash = row['Id_MetodoPago'] == 'MP01'

        if h_int < 13:
            t_key = "Manana"
        elif h_int < 18:
            t_key = "Tarde"
        else:
            t_key = "Noche"

        turnos[t_key]["total"] = round(turnos[t_key]["total"] + tot, 2)
        turnos[t_key]["conteo"] += 1
        if is_cash:
            turnos[t_key]["efectivo"] = round(turnos[t_key]["efectivo"] + tot, 2)
        else:
            turnos[t_key]["digital"] = round(turnos[t_key]["digital"] + tot, 2)

    # 4. Fechas únicas disponibles para el filtro
    cur.execute("SELECT DISTINCT Fecha_Venta FROM VENTA ORDER BY Fecha_Venta DESC")
    fechas = [r['Fecha_Venta'] for r in cur.fetchall()]

    conn.close()

    return {
        "resumen": {
            "ingreso_total": ingreso,
            "costo_total": costo,
            "ganancia_neta": ganancia,
            "margen_porcentaje": margen,
            "efectivo_total": efectivo_total,
            "digital_total": digital_total,
            "total_transacciones": transacciones
        },
        "canales": canales,
        "turnos": list(turnos.values()),
        "fechas_disponibles": fechas
    }

def execute_user_query(sql_query: str) -> Dict[str, Any]:
    """Ejecuta una consulta SQL libre (SELECT, DDL, DML) y retorna estructura tabular de resultados."""
    conn = get_connection()
    cur = conn.cursor()
    sql_clean = sql_query.strip()

    try:
        start_t = datetime.datetime.now()
        cur.execute(sql_clean)
        
        if cur.description:
            # Query SELECT
            columns = [col[0] for col in cur.description]
            raw_rows = cur.fetchall()
            rows = [list(r) for r in raw_rows]
            conn.close()
            elapsed_ms = round((datetime.datetime.now() - start_t).total_seconds() * 1000, 2)
            return {
                "success": True,
                "is_select": True,
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
                "elapsed_ms": elapsed_ms
            }
        else:
            # INSERT, UPDATE, DELETE, DDL
            conn.commit()
            affected = cur.rowcount
            conn.close()
            elapsed_ms = round((datetime.datetime.now() - start_t).total_seconds() * 1000, 2)
            return {
                "success": True,
                "is_select": False,
                "affected_rows": affected,
                "message": f"Instrucción SQL ejecutada satisfactoriamente ({affected} filas afectadas).",
                "elapsed_ms": elapsed_ms
            }
    except Exception as e:
        conn.close()
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == '__main__':
    print("Inicializando BD_BodegaMiriam (SQLite 3FN)...")
    init_database(force_reinit=True)
    summary = get_financial_summary()
    print("Base de datos inicializada exitosamente.")
    print("Resumen Financiero Basal:", summary["resumen"])
