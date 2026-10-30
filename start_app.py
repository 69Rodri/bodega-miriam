# -*- coding: utf-8 -*-
"""
Lanzador del Sistema Web Transaccional - BODEGA MIRIAM
Inicia el servidor backend aiohttp (REST API + WebSockets) y abre el navegador automáticamente.
"""

import os
import sys
import webbrowser
import threading
import time
from aiohttp import web
import database
import server

def open_browser(url):
    time.sleep(1.2)
    print(f"Abriendo navegador en: {url}")
    webbrowser.open(url)

if __name__ == '__main__':
    port = 5000
    url = f"http://localhost:{port}"

    # Iniciar base de datos
    database.init_database(force_reinit=False)
    
    # Hilo para abrir navegador
    threading.Thread(target=open_browser, args=(url,), daemon=True).start()

    print("=" * 70)
    print(" BODEGA MIRIAM - SISTEMA TRANSACCIONAL Y BASE DE DATOS EN TIEMPO REAL")
    print("=" * 70)
    print(f" Servidor activo en: {url}")
    print(" Conectado a la Base de Datos SQLite (BD_BodegaMiriam en 3FN)")
    print(" WebSockets activos para sincronización instantánea")
    print(" Presiona Ctrl + C para detener el servidor")
    print("=" * 70)

    app = server.create_app()
    web.run_app(app, host='127.0.0.1', port=port)
