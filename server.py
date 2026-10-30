# -*- coding: utf-8 -*-
"""
Servidor Asíncrono Backend (REST API + WebSockets en Tiempo Real) - BODEGA MIRIAM & MULTI-NEGOCIO
Desarrollado con aiohttp y SQLite para sincronización instantánea entre POS, 
caja registradora, visualizador relacional, consola SQL, y sistema de login/onboarding multi-negocio.
"""

import os
import json
import asyncio
from typing import Set, Optional
from aiohttp import web, WSMsgType
import database
import user_manager

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')
FIGURAS_DIR = os.path.join(BASE_DIR, 'recursos_figuras')

# Conjunto de clientes WebSocket conectados en tiempo real
connected_websockets: Set[web.WebSocketResponse] = set()

async def broadcast_ws(message: dict):
    """Envía un mensaje JSON a todos los clientes web conectados en tiempo real."""
    if not connected_websockets:
        return
    payload = json.dumps(message)
    dead_sockets = set()
    for ws in connected_websockets:
        try:
            if not ws.closed:
                await ws.send_str(payload)
            else:
                dead_sockets.add(ws)
        except Exception:
            dead_sockets.add(ws)
    for dead in dead_sockets:
        connected_websockets.discard(dead)

def get_request_user(request: web.Request) -> str:
    """Extrae el usuario autenticado desde el encabezado X-Auth-User."""
    return request.headers.get('X-Auth-User', 'miriam').strip().lower()

# =========================================================================
# ENDPOINTS DE AUTENTICACIÓN Y MULTI-USUARIO
# =========================================================================

async def api_login(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        username = data.get('username', '')
        password = data.get('password', '')
        user = user_manager.authenticate_user(username, password)
        if not user:
            return web.json_response({"success": False, "error": "Credenciales inválidas. Verifique su usuario o contraseña."}, status=401)
        return web.json_response({"success": True, "user": user})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)

async def api_register(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        username = data.get('username', '')
        password = data.get('password', '')
        business_name = data.get('business_name', '')
        owner_name = data.get('owner_name', '')
        res = user_manager.register_user(username, password, business_name, owner_name)
        return web.json_response(res)
    except ValueError as ve:
        return web.json_response({"success": False, "error": str(ve)}, status=400)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)

async def api_auth_me(request: web.Request) -> web.Response:
    username = get_request_user(request)
    profile = user_manager.get_user_profile(username)
    if not profile:
        return web.json_response({"success": False, "error": "Sesión no encontrada."}, status=404)
    return web.json_response({
        "success": True,
        "user": {
            "username": profile['username'],
            "business_name": profile['business_name'],
            "owner_name": profile['owner_name'],
            "is_configured": bool(profile['is_configured']),
            "role": profile['role'],
            "is_miriam": profile['username'].lower() == 'miriam'
        }
    })

# =========================================================================
# ONBOARDING DINÁMICO Y PROCESAMIENTO DE SCRIPTS SQL SERVER
# =========================================================================

async def api_template_scripts(request: web.Request) -> web.Response:
    """Provee una plantilla de ejemplo en SQL Server orientada al Control de Ventas lista para probar."""
    tmpl = user_manager.get_commercial_template_scripts()
    return web.json_response({
        "success": True,
        "ddl": tmpl["ddl"],
        "dml": tmpl["dml"]
    })

async def _old_api_template_scripts_unused(request: web.Request) -> web.Response:
    ddl_template = """-- =========================================================================
-- ESQUEMA RELACIONAL (3FN) - MINIMARKET EL PROGRESO
-- Creación de Tablas con PK, FK e Integridad Referencial
-- =========================================================================

CREATE TABLE CATEGORIA (
    Id_Categoria VARCHAR(5) NOT NULL,
    Nombre_Categoria VARCHAR(50) NOT NULL,
    CONSTRAINT PK_CATEGORIA PRIMARY KEY (Id_Categoria)
);

CREATE TABLE PROVEEDOR (
    Id_Proveedor INT IDENTITY(1,1) NOT NULL,
    Razon_Social VARCHAR(80) NOT NULL,
    RUC CHAR(11) NOT NULL,
    Telefono VARCHAR(15),
    CONSTRAINT PK_PROVEEDOR PRIMARY KEY (Id_Proveedor),
    CONSTRAINT UQ_PROVEEDOR_RUC UNIQUE (RUC)
);

CREATE TABLE PRODUCTO (
    Id_Producto VARCHAR(10) NOT NULL,
    Nombre_Producto VARCHAR(80) NOT NULL,
    Id_Categoria VARCHAR(5) NOT NULL,
    Id_Proveedor INT NOT NULL,
    Costo_Compra DECIMAL(10,2) NOT NULL,
    Precio_Venta DECIMAL(10,2) NOT NULL,
    CONSTRAINT PK_PRODUCTO PRIMARY KEY (Id_Producto),
    CONSTRAINT FK_PRODUCTO_CATEGORIA FOREIGN KEY (Id_Categoria) REFERENCES CATEGORIA(Id_Categoria),
    CONSTRAINT FK_PRODUCTO_PROVEEDOR FOREIGN KEY (Id_Proveedor) REFERENCES PROVEEDOR(Id_Proveedor)
);

CREATE TABLE CLIENTE (
    Id_Cliente INT IDENTITY(1,1) NOT NULL,
    Nombre_Completo VARCHAR(80) NOT NULL,
    DNI CHAR(8) NOT NULL,
    CONSTRAINT PK_CLIENTE PRIMARY KEY (Id_Cliente),
    CONSTRAINT UQ_CLIENTE_DNI UNIQUE (DNI)
);

CREATE TABLE VENTA (
    Id_Venta VARCHAR(10) NOT NULL,
    Fecha_Venta DATE NOT NULL,
    Id_Cliente INT NOT NULL,
    Total_Venta DECIMAL(10,2) NOT NULL,
    CONSTRAINT PK_VENTA PRIMARY KEY (Id_Venta),
    CONSTRAINT FK_VENTA_CLIENTE FOREIGN KEY (Id_Cliente) REFERENCES CLIENTE(Id_Cliente)
);
GO"""

    dml_template = """-- =========================================================================
-- POBLACIÓN DE REGISTROS (DML) - MINIMARKET EL PROGRESO
-- Inserción de Datos Iniciales en SQL Server
-- =========================================================================

INSERT INTO CATEGORIA (Id_Categoria, Nombre_Categoria) VALUES
('CAT01', 'Lácteos y Derivados'),
('CAT02', 'Snacks y Galletas'),
('CAT03', 'Limpieza y Hogar');

INSERT INTO PROVEEDOR (Razon_Social, RUC, Telefono) VALUES
('Gloria Alimentos S.A.', '20100190797', '01-470-7170'),
('Mondelez Perú S.A.', '20100062446', '01-215-6000'),
('Alicorp S.A.A.', '20100055237', '01-315-0800');

INSERT INTO PRODUCTO (Id_Producto, Nombre_Producto, Id_Categoria, Id_Proveedor, Costo_Compra, Precio_Venta) VALUES
('PROD-01', 'Leche Evaporada Gloria Azul 400g', 'CAT01', 1, 3.80, 4.50),
('PROD-02', 'Yogurt Gloria Fresa 1L', 'CAT01', 1, 5.50, 6.80),
('PROD-03', 'Galleta Oreo Clásica 6 und', 'CAT02', 2, 1.20, 1.80),
('PROD-04', 'Galleta Club Social Original', 'CAT02', 2, 0.90, 1.50),
('PROD-05', 'Detergente Bolívar Blanco 900g', 'CAT03', 3, 7.20, 9.00);

INSERT INTO CLIENTE (Nombre_Completo, DNI) VALUES
('Ana Mendoza Torres', '45892134'),
('Carlos Rivas Quispe', '71239845'),
('Lucía Fernández Vega', '09871234');

INSERT INTO VENTA (Id_Venta, Fecha_Venta, Id_Cliente, Total_Venta) VALUES
('V-001', '2026-10-28', 1, 11.30),
('V-002', '2026-10-29', 2, 9.00),
('V-003', '2026-10-29', 3, 6.30);
GO"""

    return web.json_response({
        "success": True,
        "ddl": ddl_template,
        "dml": dml_template
    })

async def api_setup_db(request: web.Request) -> web.Response:
    username = get_request_user(request)
    try:
        data = await request.json()
        ddl = data.get('ddl_script', '')
        dml = data.get('dml_script', '')
        if not ddl.strip():
            return web.json_response({"success": False, "error": "El script DDL de creación de tablas es requerido."}, status=400)
            
        res = user_manager.setup_user_database(username, ddl, dml)
        await broadcast_ws({"event": "DATABASE_CHANGED", "user": username})
        return web.json_response(res)
    except ValueError as ve:
        return web.json_response({"success": False, "error": str(ve)}, status=400)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)

async def api_dynamic_schema(request: web.Request) -> web.Response:
    username = get_request_user(request)
    profile = user_manager.get_user_profile(username)
    if not profile:
        return web.json_response({"success": False, "error": "Usuario no encontrado."}, status=404)
        
    db_path = profile['db_file']
    schema = user_manager.introspect_database(db_path)
    return web.json_response({"success": True, "schema": schema, "is_configured": bool(profile['is_configured'])})

async def api_user_table_data(request: web.Request) -> web.Response:
    username = get_request_user(request)
    table_name = request.match_info.get('table_name', '')
    search = request.query.get('search', '')
    limit = int(request.query.get('limit', 100))

    profile = user_manager.get_user_profile(username)
    if not profile:
        return web.json_response({"success": False, "error": "Usuario no encontrado."}, status=404)

    try:
        data = user_manager.get_table_data(profile['db_file'], table_name, limit, search)
        return web.json_response({"success": True, "data": data})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)

async def api_user_insert_table(request: web.Request) -> web.Response:
    username = get_request_user(request)
    table_name = request.match_info.get('table_name', '')
    profile = user_manager.get_user_profile(username)
    if not profile:
        return web.json_response({"success": False, "error": "Usuario no encontrado."}, status=404)

    try:
        row_data = await request.json()
        res = user_manager.insert_table_row(profile['db_file'], table_name, row_data)
        await broadcast_ws({"event": "DATABASE_CHANGED", "user": username, "table": table_name})
        return web.json_response(res)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=400)

# =========================================================================
# ENDPOINTS DE BODEGA MIRIAM (Y COMPATIBILIDAD)
# =========================================================================

async def api_catalog(request: web.Request) -> web.Response:
    try:
        username = get_request_user(request)
        if username == 'miriam':
            items = database.get_catalog_items()
            for it in items:
                it['has_cost'] = True
                it['has_returnable'] = True
                it['has_brand'] = True
                it['has_provider'] = True
                it['has_stock'] = False
            categories = database.get_categories()
            payments = database.get_payment_methods()
            columns = ['Id_Producto', 'Nombre_Producto', 'Nombre_Categoria', 'Nombre_Marca', 'Proveedor', 'Es_Retornable', 'Costo_Compra', 'Precio_Venta']
            table_name = "PRODUCTO"
        else:
            cat_res = user_manager.get_user_catalog_items(username)
            items = cat_res['products']
            columns = cat_res['columns']
            table_name = cat_res['table_name']
            categories = user_manager.get_user_categories(username)
            payments = [
                {"Id_MetodoPago": "MP01", "Nombre_Metodo": "Efectivo", "Descripcion": "Dinero en gaveta de mostrador"},
                {"Id_MetodoPago": "MP02", "Nombre_Metodo": "Yape", "Descripcion": "Billetera digital móvil BCP"},
                {"Id_MetodoPago": "MP03", "Nombre_Metodo": "Plin", "Descripcion": "Billetera móvil Interbank/BBVA"}
            ]
        return web.json_response({
            "success": True,
            "products": items,
            "categories": categories,
            "payment_methods": payments,
            "columns": columns,
            "table_name": table_name
        })
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)

async def api_sales(request: web.Request) -> web.Response:
    try:
        username = get_request_user(request)
        limit = int(request.query.get('limit', 50))
        if username == 'miriam':
            sales = database.get_sales_history(limit)
        else:
            sales = user_manager.get_user_sales_history(username, limit)
        return web.json_response({"success": True, "sales": sales})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)

async def api_register_sale(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        items = data.get('items', [])
        id_metodo = data.get('id_metodo_pago')
        custom_date = data.get('fecha_venta')

        if not items:
            return web.json_response({"success": False, "error": "El carrito no contiene artículos."}, status=400)
        if not id_metodo:
            return web.json_response({"success": False, "error": "Debe seleccionar un canal de pago válido."}, status=400)

        username = get_request_user(request)
        if username == 'miriam':
            result = database.register_sale_transaction(items, id_metodo, custom_date)
        else:
            result = user_manager.register_user_sale_transaction(username, items, id_metodo, custom_date)
        
        # Notificar a todos los navegadores conectados en tiempo real
        await broadcast_ws({
            "event": "NEW_SALE",
            "user": username,
            "data": result
        })

        return web.json_response(result)
    except ValueError as ve:
        return web.json_response({"success": False, "error": str(ve)}, status=400)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)

async def api_financial_summary(request: web.Request) -> web.Response:
    try:
        username = get_request_user(request)
        target_date = request.query.get('fecha', None)
        if username == 'miriam':
            summary = database.get_financial_summary(target_date)
        else:
            summary = user_manager.get_user_financial_summary(username, target_date)
        return web.json_response({"success": True, "data": summary})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)

async def api_schema(request: web.Request) -> web.Response:
    """Retorna el esquema relacional comercial (oficial para Miriam o introspeccionado para tenants)."""
    username = get_request_user(request)
    if username != 'miriam':
        profile = user_manager.get_user_profile(username)
        if profile and os.path.exists(profile['db_file']):
            dyn_schema = user_manager.introspect_database(profile['db_file'])
            return web.json_response({"success": True, "schema": dyn_schema})

    schema = {
        "tables": [
            {
                "name": "PROVEEDOR",
                "pk": ["Id_Proveedor"],
                "color": "from-blue-600 to-cyan-600",
                "description": "Distribuidores mayoristas autorizados de bebidas",
                "columns": [
                    {"name": "Id_Proveedor", "type": "INT IDENTITY(1,1)", "pk": True, "fk": False, "notnull": True, "identity": True},
                    {"name": "Razon_Social", "type": "VARCHAR(60)", "pk": False, "fk": False, "notnull": True},
                    {"name": "RUC_Proveedor", "type": "CHAR(11)", "pk": False, "fk": False, "notnull": True, "unique": True, "check": "LEN=11 (11 dígitos)"}
                ]
            },
            {
                "name": "MARCA",
                "pk": ["Id_Marca"],
                "color": "from-indigo-600 to-purple-600",
                "description": "Marcas comerciales concesionadas",
                "columns": [
                    {"name": "Id_Marca", "type": "VARCHAR(5)", "pk": True, "fk": False, "notnull": True},
                    {"name": "Nombre_Marca", "type": "VARCHAR(40)", "pk": False, "fk": False, "notnull": True},
                    {"name": "Id_Proveedor", "type": "INT", "pk": False, "fk": True, "ref": "PROVEEDOR.Id_Proveedor", "notnull": True}
                ]
            },
            {
                "name": "CATEGORIA",
                "pk": ["Id_Categoria"],
                "color": "from-purple-600 to-pink-600",
                "description": "Clasificación jerárquica de bebidas",
                "columns": [
                    {"name": "Id_Categoria", "type": "VARCHAR(5)", "pk": True, "fk": False, "notnull": True},
                    {"name": "Nombre_Categoria", "type": "VARCHAR(40)", "pk": False, "fk": False, "notnull": True, "unique": True}
                ]
            },
            {
                "name": "PRODUCTO",
                "pk": ["Id_Producto"],
                "color": "from-emerald-600 to-teal-600",
                "description": "Catálogo comercial con costos y márgenes (sin stock físico)",
                "columns": [
                    {"name": "Id_Producto", "type": "VARCHAR(5)", "pk": True, "fk": False, "notnull": True},
                    {"name": "Nombre_Producto", "type": "VARCHAR(60)", "pk": False, "fk": False, "notnull": True},
                    {"name": "Id_Marca", "type": "VARCHAR(5)", "pk": False, "fk": True, "ref": "MARCA.Id_Marca", "notnull": True},
                    {"name": "Id_Categoria", "type": "VARCHAR(5)", "pk": False, "fk": True, "ref": "CATEGORIA.Id_Categoria", "notnull": True},
                    {"name": "Es_Retornable", "type": "BIT", "pk": False, "fk": False, "notnull": True, "default": "0", "check": "IN (0, 1)"},
                    {"name": "Costo_Compra", "type": "DECIMAL(10,2)", "pk": False, "fk": False, "notnull": True, "check": "Costo >= 0"},
                    {"name": "Precio_Venta", "type": "DECIMAL(10,2)", "pk": False, "fk": False, "notnull": True, "check": "Precio >= Costo"}
                ]
            },
            {
                "name": "METODO_PAGO",
                "pk": ["Id_MetodoPago"],
                "color": "from-amber-600 to-orange-600",
                "description": "Canales de cobro físico y digital",
                "columns": [
                    {"name": "Id_MetodoPago", "type": "VARCHAR(5)", "pk": True, "fk": False, "notnull": True},
                    {"name": "Nombre_Metodo", "type": "VARCHAR(30)", "pk": False, "fk": False, "notnull": True, "unique": True},
                    {"name": "Descripcion", "type": "VARCHAR(100)", "pk": False, "fk": False, "notnull": False}
                ]
            },
            {
                "name": "VENTA",
                "pk": ["Id_Venta"],
                "color": "from-rose-600 to-red-600",
                "description": "Cabecera transaccional con marcas temporales",
                "columns": [
                    {"name": "Id_Venta", "type": "VARCHAR(5)", "pk": True, "fk": False, "notnull": True},
                    {"name": "Fecha_Venta", "type": "DATE", "pk": False, "fk": False, "notnull": True, "default": "GETDATE()"},
                    {"name": "Hora_Venta", "type": "TIME", "pk": False, "fk": False, "notnull": True, "default": "GETDATE()"},
                    {"name": "Id_MetodoPago", "type": "VARCHAR(5)", "pk": False, "fk": True, "ref": "METODO_PAGO.Id_MetodoPago", "notnull": True},
                    {"name": "Total_Venta", "type": "DECIMAL(10,2)", "pk": False, "fk": False, "notnull": True, "check": "Total > 0"}
                ]
            },
            {
                "name": "DETALLE_VENTA",
                "pk": ["Id_Venta", "Id_Producto"],
                "color": "from-violet-600 to-indigo-600",
                "description": "Entidad asociativa N:M con precio congelado y subtotal",
                "columns": [
                    {"name": "Id_Venta", "type": "VARCHAR(5)", "pk": True, "fk": True, "ref": "VENTA.Id_Venta (CASCADE)", "notnull": True},
                    {"name": "Id_Producto", "type": "VARCHAR(5)", "pk": True, "fk": True, "ref": "PRODUCTO.Id_Producto", "notnull": True},
                    {"name": "Cantidad", "type": "INT", "pk": False, "fk": False, "notnull": True, "check": "Cantidad > 0"},
                    {"name": "Precio_Unitario", "type": "DECIMAL(10,2)", "pk": False, "fk": False, "notnull": True, "check": "Precio >= 0"},
                    {"name": "Subtotal", "type": "DECIMAL(10,2)", "pk": False, "fk": False, "notnull": True, "check": "Subtotal >= 0"}
                ]
            }
        ],
        "relationships": [
            {"from": "PROVEEDOR", "to": "MARCA", "cardinality": "1 : N", "type": "Abastece"},
            {"from": "MARCA", "to": "PRODUCTO", "cardinality": "1 : N", "type": "Concesiona"},
            {"from": "CATEGORIA", "to": "PRODUCTO", "cardinality": "1 : N", "type": "Clasifica"},
            {"from": "METODO_PAGO", "to": "VENTA", "cardinality": "1 : N", "type": "Liquida"},
            {"from": "VENTA", "to": "DETALLE_VENTA", "cardinality": "1 : N", "type": "Contiene (Cascade Delete)"},
            {"from": "PRODUCTO", "to": "DETALLE_VENTA", "cardinality": "1 : N", "type": "Especifica"}
        ]
    }

    # Asignar conteo real de registros si la base de datos local existe
    try:
        conn = database.get_connection()
        cur = conn.cursor()
        for t in schema["tables"]:
            try:
                cur.execute(f"SELECT COUNT(*) FROM {t['name']}")
                t["row_count"] = cur.fetchone()[0]
            except Exception:
                t["row_count"] = 0
        conn.close()
    except Exception:
        pass

    return web.json_response({"success": True, "schema": schema})

async def api_scripts(request: web.Request) -> web.Response:
    """Retorna los scripts SQL oficiales de creación física (DDL) e inserción (DML) sin Stock."""
    username = get_request_user(request)
    if username != 'miriam':
        profile = user_manager.get_user_profile(username)
        if profile and profile.get('ddl_script'):
            return web.json_response({
                "success": True,
                "ddl": profile.get('ddl_script', ''),
                "dml": profile.get('dml_script', '')
            })

    ddl_sql = """-- =========================================================================
-- ESQUEMA RELACIONAL (3FN) - BODEGA MIRIAM
-- Definición DDL con Atributos Temporales y Congelamiento Contable (Sin Stock)
-- Microsoft SQL Server Management Studio
-- =========================================================================
CREATE DATABASE BD_BodegaMiriam;
GO
USE BD_BodegaMiriam;
GO

-- 1. Tabla PROVEEDOR
CREATE TABLE PROVEEDOR (
    Id_Proveedor INT IDENTITY(1,1) NOT NULL,
    Razon_Social VARCHAR(60) NOT NULL,
    RUC_Proveedor CHAR(11) NOT NULL,
    CONSTRAINT PK_PROVEEDOR PRIMARY KEY (Id_Proveedor),
    CONSTRAINT UQ_PROVEEDOR_RUC UNIQUE (RUC_Proveedor),
    CONSTRAINT CHK_PROVEEDOR_RUC CHECK (LEN(RUC_Proveedor) = 11 AND RUC_Proveedor NOT LIKE '%[^0-9]%')
);

-- 2. Tabla MARCA
CREATE TABLE MARCA (
    Id_Marca VARCHAR(5) NOT NULL,
    Nombre_Marca VARCHAR(40) NOT NULL,
    Id_Proveedor INT NOT NULL,
    CONSTRAINT PK_MARCA PRIMARY KEY (Id_Marca),
    CONSTRAINT FK_MARCA_PROVEEDOR FOREIGN KEY (Id_Proveedor) REFERENCES PROVEEDOR(Id_Proveedor)
);

-- 3. Tabla CATEGORIA
CREATE TABLE CATEGORIA (
    Id_Categoria VARCHAR(5) NOT NULL,
    Nombre_Categoria VARCHAR(40) NOT NULL,
    CONSTRAINT PK_CATEGORIA PRIMARY KEY (Id_Categoria)
);

-- 4. Tabla PRODUCTO (Catálogo Oficial en 3FN, sin Stock)
CREATE TABLE PRODUCTO (
    Id_Producto VARCHAR(5) NOT NULL,
    Nombre_Producto VARCHAR(60) NOT NULL,
    Id_Marca VARCHAR(5) NOT NULL,
    Id_Categoria VARCHAR(5) NOT NULL,
    Es_Retornable BIT NOT NULL DEFAULT 0,
    Costo_Compra DECIMAL(10,2) NOT NULL,
    Precio_Venta DECIMAL(10,2) NOT NULL,
    CONSTRAINT PK_PRODUCTO PRIMARY KEY (Id_Producto),
    CONSTRAINT FK_PRODUCTO_MARCA FOREIGN KEY (Id_Marca) REFERENCES MARCA(Id_Marca),
    CONSTRAINT FK_PRODUCTO_CATEGORIA FOREIGN KEY (Id_Categoria) REFERENCES CATEGORIA(Id_Categoria),
    CONSTRAINT CHK_PRODUCTO_PRECIO CHECK (Precio_Venta >= Costo_Compra)
);

-- 5. Tabla METODO_PAGO
CREATE TABLE METODO_PAGO (
    Id_MetodoPago VARCHAR(5) NOT NULL,
    Nombre_Metodo VARCHAR(30) NOT NULL,
    Descripcion VARCHAR(100) NULL,
    CONSTRAINT PK_METODO_PAGO PRIMARY KEY (Id_MetodoPago)
);

-- 6. Tabla VENTA (Fecha_Venta para ganancias y Total_Venta para arqueo contable)
CREATE TABLE VENTA (
    Id_Venta VARCHAR(5) NOT NULL,
    Fecha_Venta DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    Hora_Venta TIME NOT NULL,
    Id_MetodoPago VARCHAR(5) NOT NULL,
    Total_Venta DECIMAL(10,2) NOT NULL,
    CONSTRAINT PK_VENTA PRIMARY KEY (Id_Venta),
    CONSTRAINT FK_VENTA_METODO FOREIGN KEY (Id_MetodoPago) REFERENCES METODO_PAGO(Id_MetodoPago),
    CONSTRAINT CHK_VENTA_TOTAL CHECK (Total_Venta > 0)
);

-- 7. Tabla DETALLE_VENTA (Clave Compuesta N:M y Subtotal persistido)
CREATE TABLE DETALLE_VENTA (
    Id_Venta VARCHAR(5) NOT NULL,
    Id_Producto VARCHAR(5) NOT NULL,
    Cantidad INT NOT NULL,
    Precio_Unitario DECIMAL(10,2) NOT NULL,
    Subtotal DECIMAL(10,2) NOT NULL,
    CONSTRAINT PK_DETALLE_VENTA PRIMARY KEY (Id_Venta, Id_Producto),
    CONSTRAINT FK_DETALLE_VENTA FOREIGN KEY (Id_Venta) REFERENCES VENTA(Id_Venta) ON DELETE CASCADE,
    CONSTRAINT FK_DETALLE_PRODUCTO FOREIGN KEY (Id_Producto) REFERENCES PRODUCTO(Id_Producto),
    CONSTRAINT CHK_DETALLE_CANTIDAD CHECK (Cantidad > 0)
);
GO"""

    dml_sql = """-- =========================================================================
-- POBLACIÓN Y CARGA DE REGISTROS (DML)
-- Inserción de Catálogo Oficial y Ventas Basales Piloto (V01 a V05)
-- =========================================================================

-- Distribuidores Oficiales
INSERT INTO PROVEEDOR (Razon_Social, RUC_Proveedor) VALUES
('Paci Distribuciones S.A.C.', '20601234567'),
('Salem Mayorista de Bebidas E.I.R.L.', '20509876543'),
('CBC Market Comercializadora S.A.', '20405678901');

-- Marcas Concesionadas
INSERT INTO MARCA (Id_Marca, Nombre_Marca, Id_Proveedor) VALUES
('M01', 'Coca-Cola', 3),
('M02', 'Inca Kola', 3),
('M03', 'Cielo', 1),
('M04', 'Sporade', 2),
('M05', 'Gatorade', 2);

-- Categorías
INSERT INTO CATEGORIA (Id_Categoria, Nombre_Categoria) VALUES
('C01', 'Gaseosa'),
('C02', 'Agua de Mesa'),
('C03', 'Bebida Rehidratante');

-- Catálogo de Artículos Oficial (Sin Stock, con Costo_Compra y Precio_Venta)
INSERT INTO PRODUCTO (Id_Producto, Nombre_Producto, Id_Marca, Id_Categoria, Es_Retornable, Costo_Compra, Precio_Venta) VALUES
('P01', 'Coca-Cola 3 L Descartable', 'M01', 'C01', 0, 11.00, 13.50),
('P02', 'Coca-Cola 2.5 L Retornable', 'M01', 'C01', 1, 6.00, 7.50),
('P03', 'Inca Kola 3 L Descartable', 'M02', 'C01', 0, 11.00, 13.50),
('P04', 'Agua Cielo 1 L Descartable', 'M03', 'C02', 0, 1.80, 2.50),
('P05', 'Agua Cielo 625 ml Descartable', 'M03', 'C02', 0, 0.70, 1.00),
('P06', 'Sporade Tropical 500 ml', 'M04', 'C03', 0, 1.80, 2.50),
('P07', 'Gatorade Tropical 500 ml', 'M05', 'C03', 0, 1.90, 2.50),
('P08', 'Gatorade Mandarina 500 ml', 'M05', 'C03', 0, 1.90, 2.50);

-- Canales de Recaudación
INSERT INTO METODO_PAGO (Id_MetodoPago, Nombre_Metodo, Descripcion) VALUES
('MP01', 'Efectivo', 'Dinero físico en gaveta de mostrador'),
('MP02', 'Yape', 'Billetera digital móvil BCP de Miriam (987-654-321)'),
('MP03', 'Plin', 'Billetera móvil Interbank/BBVA (987-654-321)');

-- Ventas Basales Piloto (Fecha_Venta: 2026-10-25)
INSERT INTO VENTA (Id_Venta, Fecha_Venta, Hora_Venta, Id_MetodoPago, Total_Venta) VALUES
('V01', '2026-10-25', '09:30:00', 'MP01', 4.50),
('V02', '2026-10-25', '12:15:00', 'MP02', 13.50),
('V03', '2026-10-25', '15:00:00', 'MP01', 21.00),
('V04', '2026-10-25', '17:20:00', 'MP03', 5.00),
('V05', '2026-10-25', '19:10:00', 'MP01', 7.50);

-- Detalle Transaccional N:M (Con Subtotal Persistido)
INSERT INTO DETALLE_VENTA (Id_Venta, Id_Producto, Cantidad, Precio_Unitario, Subtotal) VALUES
('V01', 'P05', 2, 1.00, 2.00),
('V01', 'P07', 1, 2.50, 2.50),
('V02', 'P01', 1, 13.50, 13.50),
('V03', 'P03', 1, 13.50, 13.50),
('V03', 'P06', 2, 2.50, 5.00),
('V03', 'P04', 1, 2.50, 2.50),
('V04', 'P08', 1, 2.50, 2.50),
('V04', 'P06', 1, 2.50, 2.50),
('V05', 'P02', 1, 7.50, 7.50);
GO"""

    return web.json_response({
        "success": True,
        "ddl": ddl_sql,
        "dml": dml_sql
    })

async def api_execute_sql(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        query = data.get('query', '')
        if not query.strip():
            return web.json_response({"success": False, "error": "Consulta SQL vacía."}, status=400)
        
        username = get_request_user(request)
        if username == 'miriam':
            res = database.execute_user_query(query)
        else:
            profile = user_manager.get_user_profile(username)
            if not profile:
                return web.json_response({"success": False, "error": "Usuario no encontrado."}, status=404)
            res = user_manager.execute_user_query_on_db(profile['db_file'], query)

        if not res.get("is_select", True):
            await broadcast_ws({"event": "DATABASE_CHANGED", "user": username})
            
        return web.json_response(res)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)

async def api_reset_db(request: web.Request) -> web.Response:
    try:
        username = get_request_user(request)
        if username == 'miriam':
            database.init_database(force_reinit=True)
        else:
            profile = user_manager.get_user_profile(username)
            if profile and profile.get('ddl_script'):
                user_manager.setup_user_database(username, profile['ddl_script'], profile.get('dml_script', ''))
                
        await broadcast_ws({"event": "DATABASE_RESET", "user": username})
        return web.json_response({"success": True, "message": "Base de datos restaurada satisfactoriamente."})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)

# =========================================================================
# WEBSOCKET REAL-TIME HANDLER
# =========================================================================

async def websocket_handler(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    connected_websockets.add(ws)

    # Enviar mensaje de bienvenida
    await ws.send_json({"event": "CONNECTED", "message": "Conectado al servidor transaccional multi-negocio en tiempo real."})

    try:
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    if data.get('action') == 'PING':
                        await ws.send_json({"event": "PONG"})
                except Exception:
                    pass
            elif msg.type == WSMsgType.ERROR:
                pass
    finally:
        connected_websockets.discard(ws)

    return ws

# =========================================================================
# STATIC FILES & APP INITIALIZATION
# =========================================================================

async def index_handler(request: web.Request) -> web.FileResponse:
    return web.FileResponse(os.path.join(FRONTEND_DIR, 'index.html'))

def create_app() -> web.Application:
    database.init_database(force_reinit=False)
    user_manager.init_user_system()
    app = web.Application()

    # Rutas Autenticación y Multi-Negocio
    app.router.add_post('/api/auth/login', api_login)
    app.router.add_post('/api/auth/register', api_register)
    app.router.add_get('/api/auth/me', api_auth_me)
    app.router.add_get('/api/user/template-scripts', api_template_scripts)
    app.router.add_post('/api/user/setup-db', api_setup_db)
    app.router.add_get('/api/user/dynamic-schema', api_dynamic_schema)
    app.router.add_get('/api/user/table/{table_name}', api_user_table_data)
    app.router.add_post('/api/user/table/{table_name}', api_user_insert_table)

    # Rutas Bodega Miriam y Compatibilidad
    app.router.add_get('/api/catalog', api_catalog)
    app.router.add_get('/api/sales', api_sales)
    app.router.add_post('/api/sales', api_register_sale)
    app.router.add_get('/api/financial-summary', api_financial_summary)
    app.router.add_get('/api/schema', api_schema)
    app.router.add_get('/api/scripts', api_scripts)
    app.router.add_post('/api/sql', api_execute_sql)
    app.router.add_post('/api/reset-db', api_reset_db)

    # WebSocket & Estáticos
    app.router.add_get('/ws', websocket_handler)
    app.router.add_get('/', index_handler)
    app.router.add_static('/frontend', FRONTEND_DIR)
    app.router.add_static('/recursos_figuras', FIGURAS_DIR)

    return app

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("=========================================================================")
    print("  SERVIDOR FULL-STACK BODEGA MIRIAM & PLATAFORMA MULTI-NEGOCIO")
    print(f"  Puerto: {port} | WebSocket: ws://0.0.0.0:{port}/ws")
    print("=========================================================================")
    app = create_app()
    web.run_app(app, host='0.0.0.0', port=port)
