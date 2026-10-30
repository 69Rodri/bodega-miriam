/* =========================================================================
   SISTEMA TRANSACCIONAL Y BASE DE DATOS EN TIEMPO REAL - BODEGA MIRIAM & MULTI-NEGOCIO
   Frontend Controller, Reactive State, WebSocket Client, Dynamic CRUD & Auth
   ========================================================================= */

// Estado Global Reactivo
// Estado Global Reactivo
// Estado Global Reactivo
const state = {
    currentUser: null,
    activeTab: 'pos',
    catalog: [],
    catalogColumns: [],
    catalogTableName: '',
    categories: [],
    paymentMethods: [],
    cart: [],
    selectedCategory: 'ALL',
    selectedPayment: 'MP01',
    financialData: null,
    salesHistory: [],
    schema: null,
    scripts: null,
    dynamicSchema: null,
    activeDynamicTable: null,
    dynamicTableData: null,
    ws: null,
    diagramState: {
        mode: 'der', // 'der', 'mer', 'cards'
        zoom: 1.0,
        pan: { x: 40, y: 40 },
        isDraggingCanvas: false,
        draggedItem: null,
        derPositions: {},
        merPositions: {},
        isFullscreen: false
    }
};

// =========================================================================
// INICIALIZACIÓN DE LA APLICACIÓN
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initWebSocket();
    initDiagramCanvasEvents();

    // Obligar SIEMPRE autenticación o registro al abrir la página
    state.currentUser = null;
    localStorage.removeItem('bodega_user');
    updateUserHeaderUI();
    openAuthModal(true);
});

// Helper de petición con cabecera de usuario
function apiFetch(url, options = {}) {
    const username = state.currentUser ? state.currentUser.username : 'miriam';
    const headers = {
        'Content-Type': 'application/json',
        'X-Auth-User': username,
        ...(options.headers || {})
    };
    return fetch(url, { ...options, headers });
}

// Reloj Digital en Vivo
function initClock() {
    function update() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const dateStr = now.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
        
        const clockEl = document.getElementById('digital-clock');
        const dateEl = document.getElementById('digital-date');
        if (clockEl) clockEl.textContent = timeStr;
        if (dateEl) dateEl.textContent = dateStr.toUpperCase();
    }
    update();
    setInterval(update, 1000);
}

// WebSocket en Tiempo Real
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
        state.ws = new WebSocket(wsUrl);

        state.ws.onopen = () => {
            setWsIndicator(true, "Conectado en Tiempo Real");
        };

        state.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                handleRealtimeEvent(msg);
            } catch (err) {
                console.error("Error al procesar evento WS:", err);
            }
        };

        state.ws.onclose = () => {
            setWsIndicator(false, "Desconectado (Reintentando...)");
            setTimeout(initWebSocket, 4000);
        };

        state.ws.onerror = () => {
            setWsIndicator(false, "Error de Conexión");
        };

    } catch (e) {
        setWsIndicator(false, "Modo Local");
    }
}

function setWsIndicator(online, text) {
    const ind = document.getElementById('ws-indicator');
    const txt = document.getElementById('ws-status-text');
    if (ind && txt) {
        if (online) {
            ind.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 pulse-online";
            txt.textContent = text;
        } else {
            ind.className = "w-2.5 h-2.5 rounded-full bg-rose-500";
            txt.textContent = text;
        }
    }
}

function handleRealtimeEvent(msg) {
    if (msg.event === 'NEW_SALE') {
        if (state.currentUser.is_miriam) {
            loadFinancialData();
            showToast(`Nueva venta registrada: ${msg.data.id_venta} por S/ ${msg.data.total_venta}`, 'success');
        }
    } else if (msg.event === 'DATABASE_CHANGED') {
        if (state.currentUser.is_miriam) {
            loadCatalogData(false);
            loadFinancialData();
        } else {
            loadDynamicSchema();
            if (state.activeDynamicTable) {
                selectDynamicTable(state.activeDynamicTable);
            }
        }
    } else if (msg.event === 'DATABASE_RESET') {
        if (state.currentUser.is_miriam) {
            loadCatalogData();
            loadFinancialData();
            loadSchemaData();
        } else {
            loadDynamicSchema();
        }
        showToast("La base de datos ha sido restaurada satisfactoriamente.", "info");
    }
}

// =========================================================================
// GESTIÓN DE SESIÓN Y MULTI-NEGOCIO
// =========================================================================

function updateUserHeaderUI() {
    const user = state.currentUser;
    const nameEl = document.getElementById('header-business-name');
    const subEl = document.getElementById('header-business-sub');
    const sessionNameEl = document.getElementById('session-user-name');
    const badgeTagEl = document.getElementById('header-badge-tag');

    const btnPos = document.getElementById('tab-btn-pos');
    const btnCash = document.getElementById('tab-btn-cash');
    const btnInventory = document.getElementById('tab-btn-inventory');
    const btnDynamic = document.getElementById('tab-btn-dynamic-data');
    const btnSetup = document.getElementById('tab-btn-setup-wizard');
    const btnSchema = document.getElementById('tab-btn-schema');
    const btnScripts = document.getElementById('tab-btn-scripts');

    if (!user) {
        if (nameEl) nameEl.textContent = "SISTEMA COMERCIAL SQL";
        if (subEl) subEl.innerHTML = `<span class="text-amber-400 font-medium"><i class="fa-solid fa-lock mr-1.5"></i> Identifícate para ingresar al sistema comercial</span>`;
        if (sessionNameEl) sessionNameEl.textContent = "Iniciar Sesión";
        if (badgeTagEl) badgeTagEl.textContent = "No Autenticado";

        [btnPos, btnCash, btnInventory, btnDynamic, btnSetup, btnSchema, btnScripts].forEach(b => {
            if (b) b.classList.add('hidden');
        });
        return;
    }

    if (nameEl) nameEl.textContent = user.business_name.toUpperCase();
    if (subEl) {
        if (user.is_miriam) {
            subEl.innerHTML = `<span><i class="fa-solid fa-location-dot text-rose-500"></i> Villa María del Triunfo, Lima</span>
                               <span class="text-slate-600">•</span>
                               <span class="text-slate-300 font-medium">Gestión de Base de Datos - UNTELS</span>`;
        } else {
            subEl.innerHTML = `<span><i class="fa-solid fa-user-tie text-indigo-400"></i> Responsable: ${user.owner_name}</span>
                               <span class="text-slate-600">•</span>
                               <span class="text-slate-300 font-medium">Gestión de Base de Datos - UNTELS</span>`;
        }
    }
    if (sessionNameEl) {
        sessionNameEl.textContent = `${user.owner_name} (@${user.username})`;
    }
    if (badgeTagEl) {
        badgeTagEl.textContent = user.is_miriam ? '3FN SQL Server' : 'Multi-Tenant SQL';
    }

    // Ajustar visibilidad de botones de navegación
    if (user.is_miriam) {
        if (btnPos) btnPos.classList.remove('hidden');
        if (btnCash) btnCash.classList.remove('hidden');
        if (btnSchema) btnSchema.classList.remove('hidden');
        if (btnScripts) btnScripts.classList.remove('hidden');
        if (btnInventory) btnInventory.classList.remove('hidden');
        if (btnDynamic) btnDynamic.classList.add('hidden');
        if (btnSetup) btnSetup.classList.add('hidden');
    } else {
        if (!user.is_configured) {
            // Usuario aún no configuró sus scripts: dirigir al Asistente
            if (btnPos) btnPos.classList.add('hidden');
            if (btnCash) btnCash.classList.add('hidden');
            if (btnSchema) btnSchema.classList.add('hidden');
            if (btnScripts) btnScripts.classList.add('hidden');
            if (btnInventory) btnInventory.classList.add('hidden');
            if (btnDynamic) btnDynamic.classList.add('hidden');
            if (btnSetup) btnSetup.classList.remove('hidden');
        } else {
            // Usuario con scripts comerciales configurados: Habilitar TODOS los apartados
            if (btnPos) btnPos.classList.remove('hidden');
            if (btnCash) btnCash.classList.remove('hidden');
            if (btnSchema) btnSchema.classList.remove('hidden');
            if (btnScripts) btnScripts.classList.remove('hidden');
            if (btnInventory) btnInventory.classList.remove('hidden');
            if (btnDynamic) btnDynamic.classList.remove('hidden');
            if (btnSetup) btnSetup.classList.remove('hidden');
        }
    }
}

function openAuthModal(forced = true) {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeAuthModal() {
    if (!state.currentUser) {
        showToast("Debes iniciar sesión o registrar tu negocio para acceder al sistema.", "warning");
        return;
    }
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function logoutUser() {
    if (confirm("¿Deseas cerrar tu sesión comercial actual?")) {
        localStorage.removeItem('bodega_user');
        state.currentUser = null;
        state.cart = [];
        state.catalog = [];
        state.schema = null;
        updateUserHeaderUI();
        openAuthModal(true);
        showToast("Sesión cerrada correctamente.", "info");
    }
}

function switchAuthTab(mode) {
    const btnLogin = document.getElementById('auth-tab-btn-login');
    const btnReg = document.getElementById('auth-tab-btn-register');
    const formLogin = document.getElementById('form-login');
    const formReg = document.getElementById('form-register');

    if (mode === 'login') {
        btnLogin.className = "w-1/2 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white transition-all";
        btnReg.className = "w-1/2 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-all";
        formLogin.classList.remove('hidden');
        formReg.classList.add('hidden');
    } else {
        btnReg.className = "w-1/2 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white transition-all";
        btnLogin.className = "w-1/2 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-all";
        formReg.classList.remove('hidden');
        formLogin.classList.add('hidden');
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value.trim();

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();
        if (data.success) {
            state.currentUser = data.user;
            localStorage.setItem('bodega_user', JSON.stringify(data.user));
            updateUserHeaderUI();
            closeAuthModal();

            if (data.user.is_miriam) {
                loadCatalogData();
                loadFinancialData();
                loadSchemaData();
                loadScriptsData();
                switchTab('pos');
                showToast(`Sesión iniciada como ${data.user.owner_name}`, "success");
            } else {
                if (!data.user.is_configured) {
                    switchTab('setup-wizard');
                    showToast(`Bienvenido a ${data.user.business_name}. Configura tus scripts SQL comerciales para comenzar.`, "info");
                } else {
                    loadCatalogData();
                    loadFinancialData();
                    loadSchemaData();
                    loadScriptsData();
                    loadDynamicSchema();
                    switchTab('pos');
                    showToast(`Sesión iniciada en ${data.user.business_name}`, "success");
                }
            }
        } else {
            showToast(data.error || "Credenciales incorrectas", "error");
        }
    } catch (e) {
        showToast("Error de comunicación con el servidor", "error");
    }
}

async function handleRegisterSubmit(event) {
    event.preventDefault();
    const business_name = document.getElementById('reg-business-name').value.trim();
    const owner_name = document.getElementById('reg-owner-name').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value.trim();

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ business_name, owner_name, username, password })
        });
        const data = await res.json();
        if (data.success) {
            state.currentUser = data.user;
            localStorage.setItem('bodega_user', JSON.stringify(data.user));
            updateUserHeaderUI();
            closeAuthModal();
            switchTab('setup-wizard');
            showToast(`¡Cuenta creada para ${business_name}! Pega tus scripts SQL para generar el sistema.`, "success");
        } else {
            showToast(data.error || "Error al registrar cuenta", "error");
        }
    } catch (e) {
        showToast("Error al conectar con el servidor", "error");
    }
}

// =========================================================================
// ASISTENTE DE INICIALIZACIÓN SQL SERVER (SETUP WIZARD)
// =========================================================================

async function submitSetupDatabase() {
    const ddl = document.getElementById('setup-ddl-input').value.trim();
    const dml = document.getElementById('setup-dml-input').value.trim();

    if (!ddl) {
        showToast("Debes ingresar el script DDL de creación de tablas.", "warning");
        return;
    }

    try {
        showToast("Procesando scripts y construyendo base de datos...", "info");
        const res = await apiFetch('/api/user/setup-db', {
            method: 'POST',
            body: JSON.stringify({ ddl_script: ddl, dml_script: dml })
        });
        const data = await res.json();
        if (data.success) {
            state.currentUser.is_configured = true;
            localStorage.setItem('bodega_user', JSON.stringify(state.currentUser));
            updateUserHeaderUI();
            await loadCatalogData();
            await loadFinancialData();
            await loadSchemaData();
            await loadScriptsData();
            await loadDynamicSchema();
            switchTab('pos');
            showToast(`¡Sistema de Control de Ventas generado con éxito! Se cargaron ${data.total_tables} tablas y los productos en el POS.`, "success");
        } else {
            showToast(data.error || "Error al procesar los scripts", "error");
        }
    } catch (e) {
        showToast("Error al procesar la solicitud: " + e.message, "error");
    }
}

// =========================================================================
// GESTOR DINÁMICO DE TABLAS Y DATOS (CRUD)
// =========================================================================

async function loadDynamicSchema() {
    try {
        const res = await apiFetch('/api/user/dynamic-schema');
        const data = await res.json();
        if (data.success) {
            state.dynamicSchema = data.schema;
            renderDynamicTablePills(data.schema.tables);
            renderSchemaCards(data.schema.tables);
            renderRelationshipsSummary(data.schema.relationships);

            if (data.schema.tables.length > 0) {
                const firstTable = data.schema.tables[0].name;
                selectDynamicTable(firstTable);
            }
        }
    } catch (e) {
        console.error("Error al cargar esquema dinámico:", e);
    }
}

function renderDynamicTablePills(tables) {
    const container = document.getElementById('dynamic-table-pills');
    if (!container) return;

    if (!tables || tables.length === 0) {
        container.innerHTML = `<span class="text-xs text-slate-500 py-1">No hay tablas configuradas aún.</span>`;
        return;
    }

    container.innerHTML = tables.map(t => `
        <button onclick="selectDynamicTable('${t.name}')" id="pill-table-${t.name}" class="dynamic-pill px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all flex items-center space-x-1.5">
            <i class="fa-solid fa-table text-indigo-400"></i>
            <span>${t.name}</span>
            <span class="px-1.5 py-0.2 rounded-full bg-slate-900 text-slate-400 text-[10px] font-mono">${t.row_count}</span>
        </button>
    `).join('');
}

async function selectDynamicTable(tableName) {
    state.activeDynamicTable = tableName;

    // Actualizar estilo de pills
    document.querySelectorAll('.dynamic-pill').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-500');
        btn.classList.add('bg-slate-800/80', 'text-slate-300', 'border-slate-700');
    });
    const activePill = document.getElementById(`pill-table-${tableName}`);
    if (activePill) {
        activePill.classList.remove('bg-slate-800/80', 'text-slate-300', 'border-slate-700');
        activePill.classList.add('bg-indigo-600', 'text-white', 'border-indigo-500');
    }

    const titleEl = document.getElementById('dynamic-active-table-title');
    if (titleEl) titleEl.textContent = tableName;

    loadDynamicTableRows(tableName);
}

async function loadDynamicTableRows(tableName, search = '') {
    try {
        const queryParams = search ? `?search=${encodeURIComponent(search)}` : '';
        const res = await apiFetch(`/api/user/table/${tableName}${queryParams}`);
        const result = await res.json();
        if (result.success) {
            state.dynamicTableData = result.data;
            renderDynamicTableView(result.data);
            const countEl = document.getElementById('dynamic-row-count-badge');
            if (countEl) countEl.textContent = `${result.data.total_rows} filas`;
        }
    } catch (e) {
        console.error("Error al cargar filas dinámicas:", e);
    }
}

function renderDynamicTableView(tableData) {
    const container = document.getElementById('dynamic-table-container');
    if (!container) return;

    if (!tableData || !tableData.columns || tableData.columns.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-500 py-6 text-center">La tabla no tiene columnas definidas.</p>`;
        return;
    }

    if (tableData.rows.length === 0) {
        container.innerHTML = `
            <div class="py-12 text-center text-slate-500">
                <i class="fa-solid fa-inbox text-3xl mb-2 opacity-40"></i>
                <p class="text-xs">No hay registros en esta tabla.</p>
                <button onclick="openAddRowModal()" class="mt-3 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold">
                    <i class="fa-solid fa-plus mr-1"></i> Agregar primer registro
                </button>
            </div>
        `;
        return;
    }

    const cols = tableData.columns;
    const rows = tableData.rows;

    let html = `
        <table class="w-full text-left text-xs font-mono">
            <thead>
                <tr class="text-slate-400 border-b border-slate-800 font-bold bg-slate-900/50">
                    ${cols.map(c => `<th class="py-2.5 px-3 whitespace-nowrap">${c}</th>`).join('')}
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60">
    `;

    rows.forEach(r => {
        html += `<tr class="hover:bg-slate-900/40 transition-colors">`;
        cols.forEach(c => {
            const val = r[c] !== null && r[c] !== undefined ? r[c] : '<span class="text-slate-600">NULL</span>';
            html += `<td class="py-2.5 px-3 whitespace-nowrap text-slate-200">${val}</td>`;
        });
        html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function searchDynamicTable() {
    const input = document.getElementById('dynamic-search-input');
    if (!input || !state.activeDynamicTable) return;
    loadDynamicTableRows(state.activeDynamicTable, input.value.trim());
}

function openAddRowModal() {
    if (!state.activeDynamicTable || !state.dynamicSchema) {
        showToast("Selecciona una tabla primero.", "warning");
        return;
    }

    const tName = state.activeDynamicTable;
    const tMeta = state.dynamicSchema.tables.find(t => t.name === tName);
    if (!tMeta) return;

    const modal = document.getElementById('modal-add-row');
    const titleEl = document.getElementById('modal-add-table-name');
    const container = document.getElementById('modal-add-inputs-container');

    if (titleEl) titleEl.textContent = tName;

    // Renderizar inputs por cada columna
    container.innerHTML = tMeta.columns.map(col => {
        const isAuto = col.pk && col.type.toUpperCase().includes('INT') && col.default === null;
        const requiredAttr = col.notnull && !col.default && !isAuto ? 'required' : '';
        const placeholder = isAuto ? 'Autonumérico (Opcional)' : `Ingrese ${col.name}`;

        let inputType = 'text';
        if (col.type.toUpperCase().includes('INT')) inputType = 'number';
        else if (col.type.toUpperCase().includes('DECIMAL') || col.type.toUpperCase().includes('REAL')) inputType = 'number step="0.01"';
        else if (col.type.toUpperCase().includes('DATE')) inputType = 'date';
        else if (col.type.toUpperCase().includes('TIME')) inputType = 'time';

        return `
            <div>
                <label class="text-xs font-semibold text-slate-300 flex items-center justify-between mb-1">
                    <span>${col.name} ${col.pk ? '🔑 (PK)' : ''} ${col.fk ? '🔗 (FK)' : ''}:</span>
                    <span class="text-[10px] text-slate-500 font-mono">${col.type}</span>
                </label>
                <input type="${inputType}" name="${col.name}" ${requiredAttr} placeholder="${placeholder}" class="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono">
            </div>
        `;
    }).join('');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeAddRowModal() {
    const modal = document.getElementById('modal-add-row');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

async function submitAddRow(event) {
    event.preventDefault();
    if (!state.activeDynamicTable) return;

    const form = document.getElementById('form-add-dynamic-row');
    const formData = new FormData(form);
    const dataObj = {};

    formData.forEach((val, key) => {
        if (val.trim() !== '') {
            dataObj[key] = val.trim();
        }
    });

    try {
        const res = await apiFetch(`/api/user/table/${state.activeDynamicTable}`, {
            method: 'POST',
            body: JSON.stringify(dataObj)
        });
        const result = await res.json();
        if (result.success) {
            showToast("Registro guardado exitosamente.", "success");
            closeAddRowModal();
            loadDynamicTableRows(state.activeDynamicTable);
            loadDynamicSchema(); // Actualizar conteos
        } else {
            showToast(result.error || "Error al insertar registro", "error");
        }
    } catch (e) {
        showToast("Error al procesar la inserción: " + e.message, "error");
    }
}

// =========================================================================
// NAVEGACIÓN POR PESTAÑAS
// =========================================================================

function switchTab(tabId) {
    state.activeTab = tabId;

    // Ocultar todas las secciones
    document.querySelectorAll('.tab-view').forEach(view => {
        view.classList.add('hidden');
    });

    // Desactivar todos los botones de la barra de navegación
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
        btn.classList.remove('active', 'border-indigo-500', 'bg-indigo-600/15', 'text-white');
        btn.classList.add('text-slate-400');
    });

    // Activar vista seleccionada
    const targetView = document.getElementById(`view-${tabId}`);
    const targetBtn = document.getElementById(`tab-btn-${tabId}`);

    if (targetView) targetView.classList.remove('hidden');
    if (targetBtn) {
        targetBtn.classList.add('active', 'border-indigo-500', 'bg-indigo-600/15', 'text-white');
        targetBtn.classList.remove('text-slate-400');
    }

    if (tabId === 'inventory') {
        renderInventoryTable();
    } else if (tabId === 'schema') {
        // Renderizar diagrama en tiempo real con dimensiones visibles
        setTimeout(() => {
            renderInteractiveDiagram();
        }, 50);
    } else if (tabId === 'dynamic-data' && state.currentUser && !state.currentUser.is_miriam) {
        if (!state.dynamicSchema) loadDynamicSchema();
    }
}

// =========================================================================
// MÓDULO 1: PUNTO DE VENTA (POS EN TIEMPO REAL - SIN STOCK)
// =========================================================================

async function loadCatalogData(renderCategories = true) {
    try {
        const res = await apiFetch('/api/catalog');
        const data = await res.json();
        if (data.success) {
            state.catalog = data.products || [];
            state.catalogColumns = data.columns || [];
            state.catalogTableName = data.table_name || 'Productos';
            state.categories = data.categories || [];
            state.paymentMethods = data.payment_methods || [];

            if (renderCategories) renderCategoryPills();
            renderProductsGrid();
            renderInventoryTable();
        }
    } catch (err) {
        console.error("Error al cargar catálogo:", err);
    }
}

function renderCategoryPills() {
    const container = document.getElementById('category-pills-container');
    if (!container) return;

    let html = `
        <button onclick="selectCategory('ALL')" class="cat-pill ${state.selectedCategory === 'ALL' ? 'active bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'} px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all">
            Todas
        </button>
    `;

    state.categories.forEach(cat => {
        const isActive = state.selectedCategory === cat.Id_Categoria;
        html += `
            <button onclick="selectCategory('${cat.Id_Categoria}')" class="cat-pill ${isActive ? 'active bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'} px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all">
                ${cat.Nombre_Categoria}
            </button>
        `;
    });

    container.innerHTML = html;
}

function selectCategory(catId) {
    state.selectedCategory = catId;
    renderCategoryPills();
    renderProductsGrid();
}

function filterProducts() {
    renderProductsGrid();
}

function renderProductsGrid() {
    const grid = document.getElementById('pos-products-grid');
    if (!grid) return;

    const searchTerm = (document.getElementById('pos-search')?.value || '').toLowerCase().trim();

    const filtered = state.catalog.filter(p => {
        const matchesCategory = state.selectedCategory === 'ALL' || p.Id_Categoria === state.selectedCategory;
        const pName = (p.Nombre_Producto || '').toLowerCase();
        const pBrand = (p.Nombre_Marca || '').toLowerCase();
        const pId = String(p.Id_Producto || '').toLowerCase();
        const matchesSearch = pName.includes(searchTerm) || pBrand.includes(searchTerm) || pId.includes(searchTerm);
        return matchesCategory && matchesSearch;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-12 text-center text-slate-500">
                <i class="fa-solid fa-box-open text-4xl mb-3 opacity-30"></i>
                <p class="text-sm font-semibold">No se encontraron productos</p>
                <p class="text-xs text-slate-600 mt-1">Prueba con otro término de búsqueda o categoría.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(p => {
        // Badges superiores basados SOLO en columnas reales existentes
        let topBadges = `
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-indigo-300 font-mono">
                ${p.Id_Producto}
            </span>
        `;
        if (p.has_stock && p.Stock !== null && p.Stock !== undefined) {
            topBadges += `
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-cyan-950/70 text-cyan-300 border border-cyan-500/30">
                    Stock: ${p.Stock} und
                </span>
            `;
        }
        if (p.has_returnable && p.Es_Retornable !== null && p.Es_Retornable !== undefined) {
            const isRet = p.Es_Retornable === 1 || p.Es_Retornable === true || p.Es_Retornable === '1';
            topBadges += `
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-md ${isRet ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-400'}">
                    ${isRet ? 'Retornable' : 'Descartable'}
                </span>
            `;
        }

        // Subtítulo con marca/categoría/distribuidor SOLO si existen en la tabla
        let subDetails = [];
        if (p.has_brand && p.Nombre_Marca) subDetails.push(p.Nombre_Marca);
        if (p.has_category && p.Nombre_Categoria) subDetails.push(p.Nombre_Categoria);
        if (p.has_provider && p.Proveedor) subDetails.push(p.Proveedor);
        const subText = subDetails.join(' • ');

        // Sección de costos y márgenes (SOLO si costo existe en la tabla)
        let financialSection = '';
        if (p.has_cost && p.Costo_Compra !== null && p.Costo_Compra !== undefined) {
            const marginSol = (p.Precio_Venta - p.Costo_Compra).toFixed(2);
            const marginPct = p.Precio_Venta > 0 ? (((p.Precio_Venta - p.Costo_Compra) / p.Precio_Venta) * 100).toFixed(1) : '0.0';
            financialSection = `
                <div>
                    <span class="text-[10px] text-slate-500 block">Costo: S/ ${Number(p.Costo_Compra).toFixed(2)}</span>
                    <span class="text-[10px] text-emerald-400 font-mono font-bold">+S/ ${marginSol} (${marginPct}%)</span>
                </div>
            `;
        }

        return `
            <div class="product-card glass-card p-4 rounded-2xl flex flex-col justify-between border border-slate-800 hover:border-indigo-500/50 transition-all group">
                <div>
                    <div class="flex items-center justify-between gap-1 mb-2">
                        ${topBadges}
                    </div>

                    <h4 class="text-xs font-bold text-white group-hover:text-indigo-400 transition-colors line-clamp-2 leading-relaxed">
                        ${p.Nombre_Producto}
                    </h4>

                    ${subText ? `
                    <p class="text-[11px] text-slate-400 mt-1 flex items-center space-x-1">
                        <i class="fa-solid fa-tag text-[9px] text-slate-500"></i>
                        <span>${subText}</span>
                    </p>` : ''}
                </div>

                <div class="mt-4 pt-3 border-t border-slate-800/80 space-y-2">
                    <div class="flex items-baseline justify-between">
                        ${financialSection}
                        <div class="text-right ${!financialSection ? 'w-full flex justify-between items-center' : ''}">
                            ${!financialSection ? '<span class="text-[11px] text-slate-400 font-medium">Precio Venta:</span>' : ''}
                            <span class="text-base font-extrabold text-white font-mono">S/ ${Number(p.Precio_Venta).toFixed(2)}</span>
                        </div>
                    </div>

                    <button onclick="addToCart('${p.Id_Producto}')" class="w-full py-2 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group-hover:bg-indigo-600 cursor-pointer shadow-sm">
                        <i class="fa-solid fa-plus text-[10px]"></i>
                        <span>Agregar al Pedido</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// LÓGICA DEL CARRITO (SIN RESTRICCIÓN DE STOCK)
function addToCart(productId) {
    const prod = state.catalog.find(p => String(p.Id_Producto) === String(productId));
    if (!prod) return;

    const existing = state.cart.find(it => String(it.id_producto) === String(productId));
    if (existing) {
        existing.cantidad += 1;
    } else {
        state.cart.push({
            id_producto: prod.Id_Producto,
            nombre: prod.Nombre_Producto,
            precio_unitario: prod.Precio_Venta,
            costo_unitario: prod.Costo_Compra,
            cantidad: 1
        });
    }

    updateCartUI();
    showToast(`Agregado: ${prod.Nombre_Producto}`, "info");
}

function updateCartQty(productId, delta) {
    const item = state.cart.find(it => it.id_producto === productId);
    if (!item) return;

    const newQty = item.cantidad + delta;
    if (newQty <= 0) {
        state.cart = state.cart.filter(it => it.id_producto !== productId);
    } else {
        item.cantidad = newQty;
    }
    updateCartUI();
}

function clearCart() {
    state.cart = [];
    updateCartUI();
}

function updateCartUI() {
    const container = document.getElementById('cart-items-container');
    const totalDisplay = document.getElementById('cart-total-display');
    const btnSubmit = document.getElementById('btn-submit-sale');
    const navBadge = document.getElementById('cart-badge-nav');

    if (!container) return;

    if (state.cart.length === 0) {
        container.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <i class="fa-solid fa-basket-shopping text-3xl mb-2 opacity-40"></i>
                <p class="text-xs">El carrito está vacío</p>
                <span class="text-[11px] text-slate-600 mt-1">Selecciona productos para iniciar una venta</span>
            </div>
        `;
        if (totalDisplay) totalDisplay.textContent = "S/ 0.00";
        if (btnSubmit) btnSubmit.disabled = true;
        if (navBadge) navBadge.classList.add('hidden');
        calculateChange();
        return;
    }

    let total = 0;
    let totalItems = 0;

    container.innerHTML = state.cart.map(item => {
        const subtotal = item.precio_unitario * item.cantidad;
        total += subtotal;
        totalItems += item.cantidad;

        return `
            <div class="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between text-xs font-sans">
                <div class="flex-grow pr-2">
                    <h5 class="font-bold text-white text-[11px] leading-tight line-clamp-1">${item.nombre}</h5>
                    <span class="text-[10px] text-slate-400 font-mono">S/ ${item.precio_unitario.toFixed(2)} c/u</span>
                </div>
                <div class="flex items-center space-x-2">
                    <div class="flex items-center space-x-1.5 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 font-mono">
                        <button onclick="updateCartQty('${item.id_producto}', -1)" class="text-slate-400 hover:text-white px-1 font-bold">-</button>
                        <span class="text-xs font-bold text-white px-1">${item.cantidad}</span>
                        <button onclick="updateCartQty('${item.id_producto}', 1)" class="text-slate-400 hover:text-white px-1 font-bold">+</button>
                    </div>
                    <span class="font-bold font-mono text-white min-w-[50px] text-right">S/ ${subtotal.toFixed(2)}</span>
                </div>
            </div>
        `;
    }).join('');

    if (totalDisplay) totalDisplay.textContent = `S/ ${total.toFixed(2)}`;
    if (btnSubmit) btnSubmit.disabled = false;
    if (navBadge) {
        navBadge.textContent = totalItems;
        navBadge.classList.remove('hidden');
    }

    calculateChange();
}

function selectPayment(idMetodo) {
    state.selectedPayment = idMetodo;
    document.querySelectorAll('.pay-method-btn').forEach(btn => {
        btn.classList.remove('active', 'border-slate-700', 'bg-slate-900');
        btn.classList.add('border-slate-800', 'bg-slate-900/60');
    });

    const activeBtn = document.getElementById(`pay-btn-${idMetodo}`);
    if (activeBtn) {
        activeBtn.classList.add('active', 'border-slate-700', 'bg-slate-900');
        activeBtn.classList.remove('border-slate-800', 'bg-slate-900/60');
    }

    const calcEl = document.getElementById('cash-calculator');
    if (calcEl) {
        calcEl.style.display = (idMetodo === 'MP01') ? 'block' : 'none';
    }
}

function calculateChange() {
    const receivedInput = document.getElementById('cash-received-input');
    const changeDisplay = document.getElementById('cash-change-display');
    if (!receivedInput || !changeDisplay) return;

    const received = parseFloat(receivedInput.value) || 0;
    const total = state.cart.reduce((sum, it) => sum + (it.precio_unitario * it.cantidad), 0);
    const change = received - total;

    if (received === 0) {
        changeDisplay.textContent = "S/ 0.00";
        changeDisplay.className = "font-bold text-slate-400 text-sm";
    } else if (change >= 0) {
        changeDisplay.textContent = `S/ ${change.toFixed(2)}`;
        changeDisplay.className = "font-bold text-emerald-400 text-sm";
    } else {
        changeDisplay.textContent = `Faltan S/ ${Math.abs(change).toFixed(2)}`;
        changeDisplay.className = "font-bold text-rose-400 text-sm";
    }
}

async function submitSaleTransaction() {
    if (state.cart.length === 0) {
        showToast("El carrito está vacío", "warning");
        return;
    }

    const btnSubmit = document.getElementById('btn-submit-sale');
    if (btnSubmit) btnSubmit.disabled = true;

    const payload = {
        items: state.cart.map(it => ({
            id_producto: it.id_producto,
            cantidad: it.cantidad
        })),
        id_metodo_pago: state.selectedPayment
    };

    try {
        const res = await apiFetch('/api/sales', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            showToast(`¡Venta ${result.id_venta} confirmada exitosamente!`, "success");
            const snapshotCart = [...state.cart];
            clearCart();
            openTicketModal(result, snapshotCart);
            loadFinancialData();
        } else {
            showToast(result.error || "Error al procesar venta", "error");
            if (btnSubmit) btnSubmit.disabled = false;
        }
    } catch (e) {
        showToast("Error de conexión al procesar venta: " + e.message, "error");
        if (btnSubmit) btnSubmit.disabled = false;
    }
}

// =========================================================================
// MÓDULO 2: ARQUEO Y CONCILIACIÓN FINANCIERA
// =========================================================================

async function loadFinancialData() {
    const dateFilter = document.getElementById('cash-date-filter')?.value || '2026-10-25';
    try {
        const [resFin, resSales] = await Promise.all([
            apiFetch(`/api/financial-summary?fecha=${dateFilter}`),
            apiFetch('/api/sales?limit=50')
        ]);

        const dataFin = await resFin.json();
        const dataSales = await resSales.json();

        if (dataFin.success) {
            state.financialData = dataFin.data;
            renderFinancialKPIs(dataFin.data.resumen);
            renderShiftsTable(dataFin.data.turnos);
            renderChannelsProgress(dataFin.data.canales);
            renderDateFilterOptions(dataFin.data.fechas_disponibles);
        }

        if (dataSales.success) {
            state.salesHistory = dataSales.sales;
            renderSalesHistoryTable(dataSales.sales);
        }
    } catch (e) {
        console.error("Error al cargar datos financieros:", e);
    }
}

function renderFinancialKPIs(resumen) {
    if (!resumen) return;
    const revEl = document.getElementById('kpi-revenue');
    const costEl = document.getElementById('kpi-cost');
    const profitEl = document.getElementById('kpi-net-profit');
    const marginEl = document.getElementById('kpi-margin-pct');
    const txCountEl = document.getElementById('kpi-tx-count');
    const cashTotalEl = document.getElementById('kpi-cash-total');
    const digTotalEl = document.getElementById('kpi-digital-total');

    if (revEl) revEl.textContent = `S/ ${resumen.ingreso_total.toFixed(2)}`;
    if (costEl) costEl.textContent = `S/ ${resumen.costo_total.toFixed(2)}`;
    if (profitEl) profitEl.textContent = `S/ ${resumen.ganancia_neta.toFixed(2)}`;
    if (marginEl) marginEl.textContent = `${resumen.margen_porcentaje.toFixed(2)}%`;
    if (txCountEl) txCountEl.textContent = resumen.total_transacciones;
    if (cashTotalEl) cashTotalEl.textContent = `S/ ${resumen.efectivo_total.toFixed(2)}`;
    if (digTotalEl) digTotalEl.textContent = `S/ ${resumen.digital_total.toFixed(2)}`;
}

function renderShiftsTable(turnos) {
    const tbody = document.getElementById('shifts-table-tbody');
    if (!tbody || !turnos) return;

    tbody.innerHTML = turnos.map(t => `
        <tr class="hover:bg-slate-900/40 transition-colors">
            <td class="py-2.5 font-bold text-white font-sans">${t.nombre}</td>
            <td class="py-2.5 text-center text-slate-300 font-bold">${t.conteo}</td>
            <td class="py-2.5 text-right text-amber-400">S/ ${t.efectivo.toFixed(2)}</td>
            <td class="py-2.5 text-right text-purple-400">S/ ${t.digital.toFixed(2)}</td>
            <td class="py-2.5 text-right text-emerald-400 font-bold">S/ ${t.total.toFixed(2)}</td>
        </tr>
    `).join('');
}

function renderChannelsProgress(canales) {
    const container = document.getElementById('channels-progress-container');
    if (!container || !canales) return;

    container.innerHTML = canales.map(c => {
        let barColor = "bg-emerald-500";
        let icon = "fa-money-bill-wave";
        if (c.id === 'MP02') { barColor = "bg-purple-500"; icon = "fa-mobile-screen-button"; }
        if (c.id === 'MP03') { barColor = "bg-cyan-500"; icon = "fa-wallet"; }

        return `
            <div class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                    <span class="font-bold text-white flex items-center space-x-1.5">
                        <i class="fa-solid ${icon} text-[11px] text-slate-400"></i>
                        <span>${c.nombre} (${c.ventas} ventas)</span>
                    </span>
                    <span class="font-mono text-slate-300 font-bold">S/ ${c.importe.toFixed(2)} (${c.porcentaje}%)</span>
                </div>
                <div class="w-full h-2 rounded-full bg-slate-950 overflow-hidden">
                    <div class="h-full ${barColor} rounded-full transition-all duration-500" style="width: ${c.porcentaje}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderDateFilterOptions(fechas) {
    const select = document.getElementById('cash-date-filter');
    if (!select || !fechas) return;
    const currentVal = select.value;

    let html = `<option value="ALL" ${currentVal === 'ALL' ? 'selected' : ''}>Todas las Fechas (Histórico)</option>`;
    fechas.forEach(f => {
        const isSel = (currentVal === f) || (currentVal === '2026-10-25' && f === '2026-10-25');
        html += `<option value="${f}" ${isSel ? 'selected' : ''}>${f}</option>`;
    });
    select.innerHTML = html;
}

function renderSalesHistoryTable(sales) {
    const tbody = document.getElementById('sales-history-tbody');
    if (!tbody || !sales) return;

    if (sales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-500">No hay ventas registradas.</td></tr>`;
        return;
    }

    tbody.innerHTML = sales.map(s => {
        let badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
        if (s.Id_MetodoPago === 'MP02') badgeColor = "bg-purple-500/10 text-purple-400 border-purple-500/30";
        if (s.Id_MetodoPago === 'MP03') badgeColor = "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";

        return `
            <tr class="hover:bg-slate-900/40 transition-colors">
                <td class="py-2.5 font-bold text-indigo-400">${s.Id_Venta}</td>
                <td class="py-2.5 text-slate-400">${s.Fecha_Venta}</td>
                <td class="py-2.5 text-slate-300 font-bold">${s.Hora_Venta}</td>
                <td class="py-2.5">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeColor}">
                        ${s.Nombre_Metodo}
                    </span>
                </td>
                <td class="py-2.5 text-slate-300 max-w-xs truncate" title="${s.Resumen_Items}">${s.Resumen_Items}</td>
                <td class="py-2.5 text-right text-rose-400">S/ ${s.Costo_Total ? s.Costo_Total.toFixed(2) : '0.00'}</td>
                <td class="py-2.5 text-right text-emerald-400 font-bold">S/ ${s.Total_Venta.toFixed(2)}</td>
                <td class="py-2.5 text-right text-indigo-400 font-bold">+S/ ${s.Ganancia_Neta ? s.Ganancia_Neta.toFixed(2) : '0.00'}</td>
            </tr>
        `;
    }).join('');
}

// =========================================================================
// MÓDULO 3: ESQUEMA RELACIONAL (DER)
// =========================================================================

async function loadSchemaData() {
    try {
        const res = await apiFetch('/api/schema');
        const data = await res.json();
        if (data.success) {
            state.schema = data.schema;
            renderSchemaCards(data.schema.tables);
            renderRelationshipsSummary(data.schema.relationships);
            renderInteractiveDiagram();
        }
    } catch (e) {
        console.error("Error al cargar esquema relacional:", e);
    }
}

function renderSchemaCards(tables) {
    const container = document.getElementById('schema-cards-container');
    if (!container || !tables) return;

    container.innerHTML = tables.map(t => {
        let totalConstraints = 0;
        t.columns.forEach(c => {
            if (c.pk) totalConstraints++;
            if (c.fk) totalConstraints++;
            if (c.unique) totalConstraints++;
            if (c.check) totalConstraints++;
            if (c.default !== undefined && c.default !== null) totalConstraints++;
        });

        return `
        <div class="glass-card rounded-2xl border border-slate-800 overflow-hidden flex flex-col justify-between hover:border-slate-700 transition-colors shadow-xl">
            <div>
                <!-- Encabezado de la Tabla -->
                <div class="p-4 bg-gradient-to-r ${t.color || 'from-indigo-600 to-purple-600'} text-white">
                    <div class="flex items-center justify-between">
                        <span class="font-mono font-bold text-sm tracking-wider flex items-center space-x-2">
                            <i class="fa-solid fa-table text-white/90"></i>
                            <span>${t.name}</span>
                        </span>
                        <div class="flex items-center space-x-1.5">
                            <span class="text-[10px] font-mono bg-black/30 px-2 py-0.5 rounded-full text-white/90">
                                ${t.columns.length} atributos
                            </span>
                            <span class="text-[10px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                                ${totalConstraints} constraints
                            </span>
                        </div>
                    </div>
                    <p class="text-[11px] text-white/80 mt-1">${t.description || 'Entidad relacional en 3FN'}</p>
                </div>

                <!-- Lista de Columnas y Restricciones Detalladas -->
                <div class="p-3.5 divide-y divide-slate-800/80 font-mono text-xs">
                    ${t.columns.map(c => `
                        <div class="py-2.5 space-y-1.5">
                            <!-- Fila Principal: Badges, Nombre y Tipo -->
                            <div class="flex items-center justify-between gap-2">
                                <div class="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                    ${c.pk ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40" title="Llave Primaria (Primary Key)">🔑 PK</span>' : ''}
                                    ${c.fk ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40" title="Llave Foránea (Foreign Key)">🔗 FK</span>' : ''}
                                    ${c.unique ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40" title="Restricción UNIQUE (Unicidad)">✨ UQ</span>' : ''}
                                    ${c.check ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" title="Restricción CHECK: ${c.check}">✓ CHK</span>` : ''}
                                    ${c.notnull && !c.pk ? '<span class="px-1 py-0.5 rounded text-[8px] font-bold bg-slate-800 text-slate-300 border border-slate-700" title="Obligatorio (NOT NULL)">NN</span>' : ''}
                                    ${c.default !== undefined && c.default !== null ? `<span class="px-1 py-0.5 rounded text-[8px] font-mono bg-amber-500/10 text-amber-200 border border-amber-500/20" title="Default: ${c.default}">DEF</span>` : ''}
                                    ${c.identity ? '<span class="px-1 py-0.5 rounded text-[8px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30" title="Autonumérico">ID</span>' : ''}
                                    <span class="font-bold text-[12px] ${c.pk ? 'text-amber-300' : c.fk ? 'text-cyan-300' : c.unique ? 'text-purple-300' : 'text-slate-200'}">${c.name}</span>
                                </div>
                                <span class="text-[11px] text-slate-300 font-mono shrink-0 font-medium">${c.type}</span>
                            </div>

                            <!-- Especificación de Restricciones del Atributo -->
                            ${c.ref || c.check || c.unique || (c.default !== undefined && c.default !== null) || (c.notnull && !c.pk) ? `
                                <div class="pl-2 border-l-2 border-slate-700/60 space-y-0.5 text-[10px]">
                                    ${c.ref ? `<div class="text-indigo-400 font-mono flex items-center space-x-1"><i class="fa-solid fa-arrow-turn-down text-[9px]"></i><span>Referencia FK: <b>${c.ref}</b></span></div>` : ''}
                                    ${c.unique ? `<div class="text-purple-400 font-mono flex items-center space-x-1"><i class="fa-solid fa-fingerprint text-[9px]"></i><span>Restricción de Unicidad: <b>UNIQUE</b> (Valor irrepetible)</span></div>` : ''}
                                    ${c.check ? `<div class="text-emerald-400 font-mono flex items-center space-x-1"><i class="fa-solid fa-shield-check text-[9px]"></i><span>Validación de Dominio: <code class="bg-emerald-950/80 px-1 py-0.2 rounded border border-emerald-500/30 text-emerald-300">CHECK (${c.check})</code></span></div>` : ''}
                                    ${c.default !== undefined && c.default !== null ? `<div class="text-amber-300/90 font-mono flex items-center space-x-1"><i class="fa-regular fa-clock text-[9px]"></i><span>Valor Predeterminado: <code class="bg-amber-950/80 px-1 py-0.2 rounded border border-amber-500/30 text-amber-200">DEFAULT ${c.default}</code></span></div>` : ''}
                                    ${c.notnull && !c.pk ? `<div class="text-slate-400 font-mono flex items-center space-x-1"><i class="fa-solid fa-lock text-[8px] text-slate-500"></i><span>Integridad de Vacíos: <b>NOT NULL</b> (Campo Obligatorio)</span></div>` : ''}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Footer con Llave Primaria y Métricas de la Tabla -->
            <div class="p-3 bg-slate-950/80 border-t border-slate-800 text-[11px] text-slate-400 font-mono flex items-center justify-between">
                <span>PK: <b class="text-amber-300">{${Array.isArray(t.pk) ? t.pk.join(', ') : t.pk}}</b></span>
                <span class="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">3FN Estricta</span>
            </div>
        </div>
        `;
    }).join('');
}

function renderRelationshipsSummary(relationships) {
    const grid = document.getElementById('relationships-grid');
    if (!grid || !relationships) return;

    grid.innerHTML = relationships.map(r => `
        <div class="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <span class="font-bold text-white font-mono">${r.from}</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                ${r.cardinality}
            </span>
            <span class="font-bold text-white font-mono">${r.to}</span>
        </div>
    `).join('');
}

// =========================================================================
// ESTUDIO DE DIAGRAMAS EN TIEMPO REAL PROFESIONAL ESTILO DRAW.IO (DER Y MER)
// =========================================================================

function initDiagramCanvasEvents() {
    const viewport = document.getElementById('diagram-viewport');
    if (!viewport) return;

    // Zoom con rueda del ratón
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.08 : -0.08;
        zoomDiagram(delta);
    }, { passive: false });

    // Inicio de Pan (arrastrar lienzo cuando no se toca un nodo o diamante)
    viewport.addEventListener('mousedown', (e) => {
        if (e.target.closest('.diagram-interactive-node')) return;
        state.diagramState.isDraggingCanvas = true;
        state.diagramState.startMouse = { x: e.clientX, y: e.clientY };
        state.diagramState.startPan = { ...state.diagramState.pan };
    });

    // Movimiento global (Pan o Arrastre)
    document.addEventListener('mousemove', (e) => {
        // 1. Paneo de lienzo
        if (state.diagramState.isDraggingCanvas) {
            const dx = e.clientX - state.diagramState.startMouse.x;
            const dy = e.clientY - state.diagramState.startMouse.y;
            state.diagramState.pan = {
                x: state.diagramState.startPan.x + dx,
                y: state.diagramState.startPan.y + dy
            };
            applyCanvasTransform();
            return;
        }

        // 2. Arrastre de nodo o diamante
        if (state.diagramState.draggedItem) {
            const { mode, id, node, startX, startY, origX, origY } = state.diagramState.draggedItem;
            const dx = (e.clientX - startX) / state.diagramState.zoom;
            const dy = (e.clientY - startY) / state.diagramState.zoom;
            const newX = Math.round(origX + dx);
            const newY = Math.round(origY + dy);

            node.style.left = `${newX}px`;
            node.style.top = `${newY}px`;

            if (mode === 'der') {
                state.diagramState.derPositions[id] = { x: newX, y: newY };
                renderDERConnections();
            } else if (mode === 'mer') {
                state.diagramState.merPositions[id] = { x: newX, y: newY };
                renderMERConnections();
            }
        }
    });

    // Fin de interacción
    document.addEventListener('mouseup', () => {
        state.diagramState.isDraggingCanvas = false;
        state.diagramState.draggedItem = null;
    });
}

function applyCanvasTransform() {
    const stage = document.getElementById('diagram-stage');
    if (stage) {
        stage.style.transform = `translate(${state.diagramState.pan.x}px, ${state.diagramState.pan.y}px) scale(${state.diagramState.zoom})`;
    }
}

function zoomDiagram(delta) {
    state.diagramState.zoom = Math.max(0.4, Math.min(2.0, Math.round((state.diagramState.zoom + delta) * 100) / 100));
    applyCanvasTransform();
}

function resetDiagramView() {
    autoFitDiagram();
}

function toggleCanvasFullscreen() {
    const container = document.getElementById('diagram-canvas-container');
    const icon = document.getElementById('icon-canvas-fullscreen');
    if (!container) return;

    state.diagramState.isFullscreen = !state.diagramState.isFullscreen;
    if (state.diagramState.isFullscreen) {
        container.className = "fixed inset-0 z-50 bg-slate-950 p-4 flex flex-col shadow-2xl animate-scale-up";
        if (icon) icon.className = "fa-solid fa-compress text-xs";
        const vp = document.getElementById('diagram-viewport');
        if (vp) vp.style.height = "calc(100vh - 120px)";
    } else {
        container.className = "glass-card rounded-3xl border border-slate-800 overflow-hidden relative shadow-2xl flex flex-col";
        if (icon) icon.className = "fa-solid fa-expand text-xs";
        const vp = document.getElementById('diagram-viewport');
        if (vp) vp.style.height = "620px";
    }
    autoFitDiagram();
}

function switchDiagramMode(mode) {
    if (mode === 'mer') mode = 'der'; // Redirigir a DER físico relacional
    state.diagramState.mode = mode;
    const btnDer = document.getElementById('btn-diagram-der');
    const btnCards = document.getElementById('btn-diagram-cards');
    const canvasCont = document.getElementById('diagram-canvas-container');
    const cardsCont = document.getElementById('diagram-cards-container-wrapper');

    [btnDer, btnCards].forEach(b => {
        if (b) b.className = "px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all flex items-center space-x-1.5 cursor-pointer";
    });

    if (mode === 'cards') {
        if (btnCards) btnCards.className = "px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 text-white shadow-md transition-all flex items-center space-x-1.5 cursor-pointer";
        if (canvasCont) canvasCont.classList.add('hidden');
        if (cardsCont) cardsCont.classList.remove('hidden');
        if (state.schema) {
            renderSchemaCards(state.schema.tables);
            renderRelationshipsSummary(state.schema.relationships);
        }
    } else {
        if (canvasCont) canvasCont.classList.remove('hidden');
        if (cardsCont) cardsCont.classList.add('hidden');
        if (btnDer) btnDer.className = "px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-md transition-all flex items-center space-x-1.5 cursor-pointer";
        renderInteractiveDiagram();
    }
}

function autoLayoutDiagram() {
    if (state.diagramState.mode === 'der') {
        autoLayoutDER();
    } else {
        autoLayoutMER();
    }
}

function autoFitDiagram() {
    const viewport = document.getElementById('diagram-viewport');
    if (!viewport || !state.schema || !state.schema.tables || state.schema.tables.length === 0) return;

    const vpW = viewport.clientWidth || 1000;
    const vpH = viewport.clientHeight || 620;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    if (state.diagramState.mode === 'der') {
        state.schema.tables.forEach(t => {
            const pos = state.diagramState.derPositions[t.name];
            if (pos) {
                const h = 80 + t.columns.length * 28;
                minX = Math.min(minX, pos.x);
                minY = Math.min(minY, pos.y);
                maxX = Math.max(maxX, pos.x + 320);
                maxY = Math.max(maxY, pos.y + h);
            }
        });
    } else {
        state.schema.tables.forEach(t => {
            const pos = state.diagramState.merPositions[t.name];
            if (pos) {
                minX = Math.min(minX, pos.x);
                minY = Math.min(minY, pos.y);
                maxX = Math.max(maxX, pos.x + 210);
                maxY = Math.max(maxY, pos.y + 72);
            }
        });
        (state.schema.relationships || []).forEach((rel, rIdx) => {
            const pos = state.diagramState.merPositions[`rel_${rIdx}`];
            if (pos) {
                minX = Math.min(minX, pos.x);
                minY = Math.min(minY, pos.y);
                maxX = Math.max(maxX, pos.x + 140);
                maxY = Math.max(maxY, pos.y + 56);
            }
        });
    }

    if (!isFinite(minX)) {
        state.diagramState.zoom = 1.0;
        state.diagramState.pan = { x: 40, y: 40 };
        applyCanvasTransform();
        return;
    }

    const diagW = Math.max(200, maxX - minX + 100);
    const diagH = Math.max(200, maxY - minY + 100);

    const scaleX = (vpW - 60) / diagW;
    const scaleY = (vpH - 60) / diagH;
    let targetZoom = Math.min(scaleX, scaleY);
    targetZoom = Math.max(0.42, Math.min(1.0, targetZoom));

    // Centrado suave en el lienzo
    const panX = Math.round((vpW - (maxX + minX) * targetZoom) / 2);
    const panY = Math.round((vpH - (maxY + minY) * targetZoom) / 2);

    state.diagramState.zoom = Math.round(targetZoom * 100) / 100;
    state.diagramState.pan = { x: Math.max(15, panX), y: Math.max(15, panY) };
    applyCanvasTransform();
}

function renderInteractiveDiagram() {
    if (!state.schema || !state.schema.tables) return;

    const studioTitle = document.getElementById('diagram-studio-title');
    const studioSub = document.getElementById('diagram-studio-sub');
    const modeBadge = document.getElementById('canvas-status-mode');
    const user = state.currentUser;

    if (studioTitle) {
        studioTitle.textContent = user 
            ? `Estudio de Diagramas en Tiempo Real - ${user.business_name.toUpperCase()}`
            : 'Estudio de Diagramas en Tiempo Real';
    }
    if (studioSub) {
        studioSub.textContent = `Lienzo interactivo estilo draw.io de tablas, claves primarias 🔑, claves foráneas 🔗 y relaciones (${state.schema.tables.length} tablas activas).`;
    }

    if (modeBadge) {
        modeBadge.textContent = "Modo: DER Físico Relacional (Tablas y Llaves 🔑🔗)";
    }
    renderDERDiagram();
}

// -------------------------------------------------------------------------
// MOTOR DER FÍSICO RELACIONAL
// -------------------------------------------------------------------------

function autoLayoutDER() {
    if (!state.schema || !state.schema.tables) return;
    const tables = state.schema.tables;
    const rels = state.schema.relationships || [];
    state.diagramState.derPositions = {};

    // Comprobar si corresponde a la arquitectura de Bodega Miriam o comercio minorista estándar
    const tNamesUpper = tables.map(t => t.name.toUpperCase());
    const isMiriamCatalog = tNamesUpper.includes('PRODUCTO') && tNamesUpper.includes('VENTA') && tNamesUpper.includes('DETALLE_VENTA');

    if (isMiriamCatalog && tables.length <= 9) {
        // Arquitectura Espaciosa de Alta Legibilidad (4 Columnas Estructuradas con 200px de separación horizontal)
        const customDER = {
            'PROVEEDOR':    { x: 60,   y: 50 },
            'CATEGORIA':    { x: 60,   y: 290 },
            'METODO_PAGO':  { x: 60,   y: 510 },
            'MARCA':        { x: 540,  y: 50 },
            'VENTA':        { x: 540,  y: 510 },
            'PRODUCTO':     { x: 1020, y: 120 },
            'DETALLE_VENTA':{ x: 1500, y: 310 }
        };

        let appliedAll = true;
        tables.forEach(t => {
            const upper = t.name.toUpperCase();
            if (customDER[upper]) {
                state.diagramState.derPositions[t.name] = { ...customDER[upper] };
            } else {
                appliedAll = false;
            }
        });

        if (appliedAll) {
            renderDERDiagram();
            autoFitDiagram();
            return;
        }
    }

    // Algoritmo Topológico General Espacioso para esquemas dinámicos arbitrarios
    const parentsOf = {};
    tables.forEach(t => parentsOf[t.name] = []);
    rels.forEach(r => {
        if (parentsOf[r.to]) parentsOf[r.to].push(r.from);
    });

    const levels = {};
    tables.forEach(t => {
        if (parentsOf[t.name].length === 0) levels[t.name] = 0;
    });

    let changed = true;
    let iter = 0;
    while (changed && iter < 15) {
        changed = false;
        iter++;
        rels.forEach(r => {
            const srcLvl = levels[r.from] !== undefined ? levels[r.from] : 0;
            const dstLvl = levels[r.to] !== undefined ? levels[r.to] : 0;
            if (dstLvl <= srcLvl) {
                levels[r.to] = srcLvl + 1;
                changed = true;
            }
        });
    }

    tables.forEach(t => {
        if (levels[t.name] === undefined) levels[t.name] = 0;
    });

    const maxLvl = Math.max(0, ...Object.values(levels));
    const columns = [];
    for (let i = 0; i <= maxLvl; i++) columns.push([]);
    tables.forEach(t => {
        columns[levels[t.name]].push(t.name);
    });

    const colSpacing = 480;
    const cardGapY = 70;

    // Calcular altura total por columna para centrado vertical armónico
    const colHeights = columns.map(col => {
        let hTotal = 0;
        col.forEach(tName => {
            const tObj = tables.find(t => t.name === tName);
            const cardH = 80 + (tObj ? tObj.columns.length * 28 : 140);
            hTotal += cardH + cardGapY;
        });
        return Math.max(0, hTotal - cardGapY);
    });
    const maxColH = Math.max(400, ...colHeights);

    columns.forEach((col, cIdx) => {
        const thisColH = colHeights[cIdx];
        let currY = Math.max(50, Math.round(50 + (maxColH - thisColH) / 2));
        col.forEach(tName => {
            const tObj = tables.find(t => t.name === tName);
            const cardH = 80 + (tObj ? tObj.columns.length * 28 : 140);
            state.diagramState.derPositions[tName] = { x: 60 + cIdx * colSpacing, y: currY };
            currY += cardH + cardGapY;
        });
    });

    renderDERDiagram();
    autoFitDiagram();
}

function renderDERDiagram() {
    const nodesLayer = document.getElementById('diagram-nodes-layer');
    if (!nodesLayer || !state.schema) return;
    nodesLayer.innerHTML = '';

    const tables = state.schema.tables;

    // Si aún no hay posiciones, calcular autoLayout inicial
    const hasAll = tables.every(t => state.diagramState.derPositions[t.name]);
    if (!hasAll) {
        autoLayoutDER();
        return;
    }

    tables.forEach(t => {
        const pos = state.diagramState.derPositions[t.name] || { x: 50, y: 50 };
        const node = document.createElement('div');
        node.id = `der-table-${t.name}`;
        node.className = "diagram-interactive-node absolute w-[320px] rounded-2xl border border-slate-700/80 bg-slate-900/95 shadow-2xl overflow-hidden backdrop-blur-md select-none transition-shadow hover:border-indigo-500/80 hover:shadow-indigo-500/20";
        node.style.left = `${pos.x}px`;
        node.style.top = `${pos.y}px`;
        node.style.zIndex = "10";

        node.innerHTML = `
            <!-- Cabecera de la Tabla (Arrastrable) -->
            <div class="der-table-header p-3 bg-gradient-to-r ${t.color || 'from-indigo-600 to-purple-600'} text-white cursor-grab active:cursor-grabbing flex items-center justify-between border-b border-black/20">
                <span class="font-mono font-bold text-xs flex items-center space-x-1.5 tracking-wider">
                    <i class="fa-solid fa-table text-[11px] opacity-80"></i>
                    <span>${t.name}</span>
                </span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-black/30 text-white/90">
                    ${t.columns.length} col
                </span>
            </div>

            <!-- Lista de Atributos con Todas las Restricciones -->
            <div class="p-2.5 divide-y divide-slate-800/60 font-mono text-xs bg-slate-950/70 max-h-[380px] overflow-y-auto custom-scrollbar">
                ${t.columns.map(c => `
                    <div class="py-1.5 px-1 flex items-center justify-between hover:bg-slate-900/60 rounded transition-colors" id="der-col-${t.name}-${c.name}">
                        <div class="flex items-center space-x-1 truncate pr-1">
                            ${c.pk ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30" title="Llave Primaria (Primary Key)">🔑 PK</span>' : ''}
                            ${c.fk ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" title="Llave Foránea (Foreign Key) → ' + (c.ref || '') + '">🔗 FK</span>' : ''}
                            ${c.unique ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30" title="Restricción UNIQUE (Clave Única)">✨ UQ</span>' : ''}
                            ${c.check ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-help" title="Restricción CHECK: ${c.check}">✓ CHK</span>` : ''}
                            ${!c.pk && !c.fk && !c.unique && !c.check ? '<span class="w-1.5 h-1.5 rounded-full bg-slate-700/70 inline-block ml-0.5 mr-0.5"></span>' : ''}
                            
                            <span class="${c.pk ? 'text-amber-200 font-bold' : c.fk ? 'text-cyan-200 font-bold' : c.unique ? 'text-purple-200 font-semibold' : 'text-slate-200'} truncate text-[11px]">${c.name}</span>
                        </div>
                        <div class="flex items-center space-x-1 shrink-0 ml-1">
                            ${c.default !== undefined && c.default !== null ? `<span class="text-[8px] font-mono px-1 py-0.2 rounded bg-amber-500/10 text-amber-200 border border-amber-500/20" title="Valor por defecto: ${c.default}">DEF</span>` : ''}
                            <span class="text-[10px] text-slate-400 font-mono">${c.type}</span>
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Pie de Tabla -->
            <div class="px-3 py-1.5 bg-slate-950/90 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                <span class="flex items-center space-x-1">
                    <span class="text-slate-500">Registros:</span>
                    <span class="font-bold text-slate-300 font-mono">${t.row_count !== undefined ? t.row_count : 0}</span>
                </span>
                <span class="text-slate-500 text-[9px] font-mono">3FN Relacional</span>
            </div>
        `;

        const header = node.querySelector('.der-table-header');
        header.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            state.diagramState.draggedItem = {
                mode: 'der',
                id: t.name,
                node: node,
                startX: e.clientX,
                startY: e.clientY,
                origX: pos.x,
                origY: pos.y
            };
        });

        nodesLayer.appendChild(node);
    });

    renderDERConnections();
    applyCanvasTransform();
}

function renderDERConnections() {
    const svgGroup = document.getElementById('svg-connections-group');
    if (!svgGroup || !state.schema) return;
    svgGroup.innerHTML = '';

    const rels = state.schema.relationships || [];

    rels.forEach((rel) => {
        const fromNode = document.getElementById(`der-table-${rel.from}`);
        const toNode = document.getElementById(`der-table-${rel.to}`);
        if (!fromNode || !toNode) return;

        const x1_raw = parseFloat(fromNode.style.left);
        const y1_raw = parseFloat(fromNode.style.top);
        const w1 = fromNode.offsetWidth || 320;
        const h1 = fromNode.offsetHeight || 180;

        const x2_raw = parseFloat(toNode.style.left);
        const y2_raw = parseFloat(toNode.style.top);
        const w2 = toNode.offsetWidth || 320;
        const h2 = toNode.offsetHeight || 180;

        let x1, y1, x2, y2, badge1_x, badge1_y, badgeN_x, badgeN_y;

        if (x1_raw + w1 < x2_raw) {
            // Padre a la izquierda de Hijo
            x1 = x1_raw + w1;
            y1 = y1_raw + Math.min(80, h1 / 2);
            x2 = x2_raw;
            y2 = y2_raw + Math.min(80, h2 / 2);
            badge1_x = x1 + 6;
            badge1_y = y1 - 10;
            badgeN_x = x2 - 26;
            badgeN_y = y2 - 10;
        } else if (x2_raw + w2 < x1_raw) {
            // Padre a la derecha de Hijo
            x1 = x1_raw;
            y1 = y1_raw + Math.min(80, h1 / 2);
            x2 = x2_raw + w2;
            y2 = y2_raw + Math.min(80, h2 / 2);
            badge1_x = x1 - 26;
            badge1_y = y1 - 10;
            badgeN_x = x2 + 6;
            badgeN_y = y2 - 10;
        } else {
            // Alineación vertical
            x1 = x1_raw + w1 / 2;
            x2 = x2_raw + w2 / 2;
            if (y1_raw < y2_raw) {
                y1 = y1_raw + h1;
                y2 = y2_raw;
                badge1_y = y1 + 4;
                badgeN_y = y2 - 22;
            } else {
                y1 = y1_raw;
                y2 = y2_raw + h2;
                badge1_y = y1 - 22;
                badgeN_y = y2 + 4;
            }
            badge1_x = x1 + 6;
            badgeN_x = x2 + 6;
        }

        const dx = Math.max(35, Math.abs(x2 - x1) * 0.48);
        const pathData = `M ${x1} ${y1} C ${x1 + (x2 >= x1 ? dx : -dx)} ${y1}, ${x2 - (x2 >= x1 ? dx : -dx)} ${y2}, ${x2} ${y2}`;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#6366f1');
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('marker-end', 'url(#arrow-der)');
        path.setAttribute('class', 'hover:stroke-indigo-400 transition-colors');

        const g1 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g1.innerHTML = `
            <rect x="${badge1_x}" y="${badge1_y}" width="20" height="18" rx="5" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5" />
            <text x="${badge1_x + 10}" y="${badge1_y + 13}" fill="#f59e0b" font-size="11" font-weight="extrabold" font-family="monospace" text-anchor="middle">1</text>
        `;

        const gN = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        gN.innerHTML = `
            <rect x="${badgeN_x}" y="${badgeN_y}" width="20" height="18" rx="5" fill="#0f172a" stroke="#06b6d4" stroke-width="1.5" />
            <text x="${badgeN_x + 10}" y="${badgeN_y + 13}" fill="#06b6d4" font-size="11" font-weight="extrabold" font-family="monospace" text-anchor="middle">N</text>
        `;

        svgGroup.appendChild(path);
        svgGroup.appendChild(g1);
        svgGroup.appendChild(gN);
    });
}

// -------------------------------------------------------------------------
// MOTOR MER CONCEPTUAL (NOTACIÓN CHEN PROFESIONAL)
// -------------------------------------------------------------------------

function autoLayoutMER() {
    if (!state.schema || !state.schema.tables) return;
    const tables = state.schema.tables;
    const rels = state.schema.relationships || [];
    state.diagramState.merPositions = {};

    const tNamesUpper = tables.map(t => t.name.toUpperCase());
    const isMiriamCatalog = tNamesUpper.includes('PRODUCTO') && tNamesUpper.includes('VENTA') && tNamesUpper.includes('DETALLE_VENTA');

    if (isMiriamCatalog && tables.length <= 9) {
        // Arquitectura Conceptual Chen de 2 Niveles + Puente Vertical
        // Distribución espaciosa, nítida y con CERO cruces diagonales
        const customMEREntities = {
            'PROVEEDOR':    { x: 60,   y: 70 },
            'MARCA':        { x: 560,  y: 70 },
            'PRODUCTO':     { x: 1060, y: 70 },
            'CATEGORIA':    { x: 560,  y: 270 },
            'METODO_PAGO':  { x: 60,   y: 490 },
            'VENTA':        { x: 560,  y: 490 },
            'DETALLE_VENTA':{ x: 1060, y: 490 }
        };

        let appliedAll = true;
        tables.forEach(t => {
            const upper = t.name.toUpperCase();
            if (customMEREntities[upper]) {
                state.diagramState.merPositions[t.name] = { ...customMEREntities[upper] };
            } else {
                appliedAll = false;
            }
        });

        if (appliedAll) {
            // Posicionar rombos según los pares de entidades conectadas
            rels.forEach((rel, rIdx) => {
                const f = rel.from.toUpperCase();
                const t = rel.to.toUpperCase();
                let diamondPos = null;

                if (f === 'PRODUCTO' && t === 'DETALLE_VENTA') {
                    // Puente vertical directo entre PRODUCTO y DETALLE_VENTA
                    diamondPos = { x: 1095, y: 298 };
                } else if (f === 'VENTA' && t === 'DETALLE_VENTA') {
                    // Conexión horizontal inferior
                    diamondPos = { x: 845, y: 498 };
                } else if (f === 'PROVEEDOR' && t === 'MARCA') {
                    // Conexión horizontal superior
                    diamondPos = { x: 345, y: 78 };
                } else if (f === 'MARCA' && t === 'PRODUCTO') {
                    // Conexión horizontal superior
                    diamondPos = { x: 845, y: 78 };
                } else if (f === 'CATEGORIA' && t === 'PRODUCTO') {
                    // Conexión intermedia hacia PRODUCTO
                    diamondPos = { x: 845, y: 178 };
                } else if (f === 'METODO_PAGO' && t === 'VENTA') {
                    // Conexión horizontal inferior
                    diamondPos = { x: 345, y: 498 };
                } else {
                    const p1 = state.diagramState.merPositions[rel.from] || { x: 60, y: 70 };
                    const p2 = state.diagramState.merPositions[rel.to] || { x: 560, y: 70 };
                    diamondPos = {
                        x: Math.round((p1.x + 200 + p2.x) / 2 - 70),
                        y: Math.round((p1.y + 35 + p2.y + 35) / 2 - 28)
                    };
                }
                state.diagramState.merPositions[`rel_${rIdx}`] = diamondPos;
            });

            renderMERDiagram();
            autoFitDiagram();
            return;
        }
    }

    // Algoritmo MER General Espacioso para esquemas dinámicos arbitrarios
    const parentsOf = {};
    tables.forEach(t => parentsOf[t.name] = []);
    rels.forEach(r => {
        if (parentsOf[r.to]) parentsOf[r.to].push(r.from);
    });

    const levels = {};
    tables.forEach(t => {
        if (parentsOf[t.name].length === 0) levels[t.name] = 0;
    });

    let changed = true;
    let iter = 0;
    while (changed && iter < 15) {
        changed = false;
        iter++;
        rels.forEach(r => {
            const srcLvl = levels[r.from] !== undefined ? levels[r.from] : 0;
            const dstLvl = levels[r.to] !== undefined ? levels[r.to] : 0;
            if (dstLvl <= srcLvl) {
                levels[r.to] = srcLvl + 1;
                changed = true;
            }
        });
    }

    tables.forEach(t => {
        if (levels[t.name] === undefined) levels[t.name] = 0;
    });

    const maxLvl = Math.max(0, ...Object.values(levels));
    const columns = [];
    for (let i = 0; i <= maxLvl; i++) columns.push([]);
    tables.forEach(t => {
        columns[levels[t.name]].push(t.name);
    });

    const colSpacing = 460;
    const rowGap = 160;

    columns.forEach((col, cIdx) => {
        let currY = 70;
        col.forEach(tName => {
            state.diagramState.merPositions[tName] = { x: 60 + cIdx * colSpacing, y: currY };
            currY += rowGap;
        });
    });

    rels.forEach((rel, rIdx) => {
        const p1 = state.diagramState.merPositions[rel.from] || { x: 60, y: 70 };
        const p2 = state.diagramState.merPositions[rel.to] || { x: 520, y: 70 };
        const midX = Math.round((p1.x + 200 + p2.x) / 2 - 70);
        const midY = Math.round((p1.y + 35 + p2.y + 35) / 2 - 28);
        state.diagramState.merPositions[`rel_${rIdx}`] = { x: midX, y: midY };
    });

    renderMERDiagram();
    autoFitDiagram();
}

function renderMERDiagram() {
    const nodesLayer = document.getElementById('diagram-nodes-layer');
    if (!nodesLayer || !state.schema) return;
    nodesLayer.innerHTML = '';

    const tables = state.schema.tables;
    const rels = state.schema.relationships || [];

    // Verificar si todas las entidades tienen posición
    const hasAll = tables.every(t => state.diagramState.merPositions[t.name]);
    if (!hasAll) {
        autoLayoutMER();
        return;
    }

    // 1. Renderizar Entidades Chen (Cajas Rectangulares)
    tables.forEach(t => {
        const pos = state.diagramState.merPositions[t.name] || { x: 50, y: 50 };
        const node = document.createElement('div');
        node.id = `mer-entity-${t.name}`;
        node.className = "diagram-interactive-node absolute w-[200px] h-[70px] rounded-2xl border-2 border-indigo-500 bg-slate-900/95 shadow-xl shadow-indigo-500/20 p-3 select-none cursor-grab active:cursor-grabbing hover:border-pink-500 transition-all flex flex-col justify-center";
        node.style.left = `${pos.x}px`;
        node.style.top = `${pos.y}px`;
        node.style.zIndex = "12";

        node.innerHTML = `
            <div class="mer-header flex items-center justify-center space-x-2 text-xs font-extrabold text-white font-mono uppercase tracking-wider">
                <i class="fa-solid fa-cube text-indigo-400"></i>
                <span class="truncate">${t.name}</span>
            </div>
            <div class="text-[10px] text-slate-400 mt-1 font-sans text-center flex items-center justify-center space-x-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>Entidad (${t.columns.length} atributos)</span>
            </div>
        `;

        node.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            state.diagramState.draggedItem = {
                mode: 'mer',
                id: t.name,
                node: node,
                startX: e.clientX,
                startY: e.clientY,
                origX: pos.x,
                origY: pos.y
            };
        });

        nodesLayer.appendChild(node);
    });

    // 2. Renderizar Rombos de Relación Chen
    rels.forEach((rel, rIdx) => {
        const diamondKey = `rel_${rIdx}`;
        const pos = state.diagramState.merPositions[diamondKey] || { x: 260, y: 50 };
        const relLabel = rel.type ? rel.type.split(' ')[0].toUpperCase() : 'ASOCIA';

        const diamondNode = document.createElement('div');
        diamondNode.id = `mer-diamond-${rIdx}`;
        diamondNode.className = "diagram-interactive-node absolute w-[140px] h-[56px] select-none cursor-grab active:cursor-grabbing flex items-center justify-center";
        diamondNode.style.left = `${pos.x}px`;
        diamondNode.style.top = `${pos.y}px`;
        diamondNode.style.zIndex = "11";

        diamondNode.innerHTML = `
            <svg class="w-full h-full pointer-events-none drop-shadow-lg">
                <polygon points="0,28 70,0 140,28 70,56" fill="#1e1035" stroke="#ec4899" stroke-width="2.2" />
                <text x="70" y="32" fill="#f472b6" font-size="10.5" font-weight="900" font-family="monospace" text-anchor="middle" dominant-baseline="central">${relLabel}</text>
            </svg>
        `;

        diamondNode.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            state.diagramState.draggedItem = {
                mode: 'mer',
                id: diamondKey,
                node: diamondNode,
                startX: e.clientX,
                startY: e.clientY,
                origX: pos.x,
                origY: pos.y
            };
        });

        nodesLayer.appendChild(diamondNode);
    });

    renderMERConnections();
    applyCanvasTransform();
}

function renderMERConnections() {
    const svgGroup = document.getElementById('svg-connections-group');
    if (!svgGroup || !state.schema) return;
    svgGroup.innerHTML = '';

    const rels = state.schema.relationships || [];

    rels.forEach((rel, rIdx) => {
        const ent1Node = document.getElementById(`mer-entity-${rel.from}`);
        const ent2Node = document.getElementById(`mer-entity-${rel.to}`);
        const diamondNode = document.getElementById(`mer-diamond-${rIdx}`);

        if (!ent1Node || !ent2Node || !diamondNode) return;

        // Centros de elementos
        const p1_x = parseFloat(ent1Node.style.left) + 100;
        const p1_y = parseFloat(ent1Node.style.top) + 35;

        const d_x = parseFloat(diamondNode.style.left) + 70;
        const d_y = parseFloat(diamondNode.style.top) + 28;

        const p2_x = parseFloat(ent2Node.style.left) + 100;
        const p2_y = parseFloat(ent2Node.style.top) + 35;

        // Línea 1: Entidad Padre -> Rombo
        const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line1.setAttribute('x1', p1_x);
        line1.setAttribute('y1', p1_y);
        line1.setAttribute('x2', d_x);
        line1.setAttribute('y2', d_y);
        line1.setAttribute('stroke', '#ec4899');
        line1.setAttribute('stroke-width', '2');

        // Línea 2: Rombo -> Entidad Hija (con flecha)
        const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line2.setAttribute('x1', d_x);
        line2.setAttribute('y1', d_y);
        line2.setAttribute('x2', p2_x);
        line2.setAttribute('y2', p2_y);
        line2.setAttribute('stroke', '#ec4899');
        line2.setAttribute('stroke-width', '2');
        line2.setAttribute('marker-end', 'url(#arrow-chen)');

        // Punto medio 1 para cardinalidad (1,1)
        const mid1_x = Math.round((p1_x + d_x) / 2);
        const mid1_y = Math.round((p1_y + d_y) / 2);

        const gCard1 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        gCard1.innerHTML = `
            <rect x="${mid1_x - 17}" y="${mid1_y - 9}" width="34" height="18" rx="5" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5" />
            <text x="${mid1_x}" y="${mid1_y + 4}" fill="#f59e0b" font-size="10" font-weight="extrabold" font-family="monospace" text-anchor="middle">(1,1)</text>
        `;

        // Punto medio 2 para cardinalidad (1,N)
        const mid2_x = Math.round((d_x + p2_x) / 2);
        const mid2_y = Math.round((d_y + p2_y) / 2);

        const gCard2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        gCard2.innerHTML = `
            <rect x="${mid2_x - 17}" y="${mid2_y - 9}" width="34" height="18" rx="5" fill="#0f172a" stroke="#06b6d4" stroke-width="1.5" />
            <text x="${mid2_x}" y="${mid2_y + 4}" fill="#06b6d4" font-size="10" font-weight="extrabold" font-family="monospace" text-anchor="middle">(1,N)</text>
        `;

        svgGroup.appendChild(line1);
        svgGroup.appendChild(line2);
        svgGroup.appendChild(gCard1);
        svgGroup.appendChild(gCard2);
    });
}


// =========================================================================
// MÓDULO 4: SCRIPTS SQL Y CONSOLA INTERACTIVA
// =========================================================================

async function loadScriptsData() {
    try {
        const res = await apiFetch('/api/scripts');
        const data = await res.json();
        if (data.success) {
            state.scripts = data;
            const ddlEl = document.getElementById('ddl-code-block');
            const dmlEl = document.getElementById('dml-code-block');
            if (ddlEl) ddlEl.textContent = data.ddl;
            if (dmlEl) dmlEl.textContent = data.dml;
        }
    } catch (e) {
        console.error("Error al cargar scripts:", e);
    }
}

function switchSqlTab(subTab) {
    const vDdl = document.getElementById('sql-view-ddl');
    const vDml = document.getElementById('sql-view-dml');
    const vConsole = document.getElementById('sql-view-console');

    const bDdl = document.getElementById('subtab-btn-ddl');
    const bDml = document.getElementById('subtab-btn-dml');
    const bConsole = document.getElementById('subtab-btn-console');

    [vDdl, vDml, vConsole].forEach(el => el?.classList.add('hidden'));
    [bDdl, bDml, bConsole].forEach(btn => {
        btn?.classList.remove('bg-indigo-600', 'text-white');
        btn?.classList.add('text-slate-400');
    });

    if (subTab === 'ddl') {
        vDdl?.classList.remove('hidden');
        bDdl?.classList.add('bg-indigo-600', 'text-white');
    } else if (subTab === 'dml') {
        vDml?.classList.remove('hidden');
        bDml?.classList.add('bg-indigo-600', 'text-white');
    } else {
        vConsole?.classList.remove('hidden');
        bConsole?.classList.add('bg-indigo-600', 'text-white');
    }
}

function copySqlCode(type) {
    if (!state.scripts) return;
    const text = (type === 'ddl') ? state.scripts.ddl : state.scripts.dml;
    navigator.clipboard.writeText(text).then(() => {
        showToast(`Script ${type.toUpperCase()} copiado al portapapeles.`, "success");
    });
}

function loadPresetQuery(id) {
    const input = document.getElementById('sql-console-input');
    if (!input) return;

    const presets = {
        1: `-- 1. Ganancia Neta por Producto
SELECT 
    p.Id_Producto,
    p.Nombre_Producto,
    p.Costo_Compra AS [Costo],
    p.Precio_Venta AS [Precio],
    ROUND(p.Precio_Venta - p.Costo_Compra, 2) AS [Ganancia (S/)],
    ROUND(((p.Precio_Venta - p.Costo_Compra) / p.Precio_Venta) * 100, 2) AS [Margen (%)]
FROM PRODUCTO p
ORDER BY [Ganancia (S/)] DESC;`,

        2: `-- 2. Arqueo por Turnos
SELECT 
    CASE 
        WHEN CAST(SUBSTR(v.Hora_Venta, 1, 2) AS INT) < 13 THEN 'Mañana (08:00 - 12:59)'
        WHEN CAST(SUBSTR(v.Hora_Venta, 1, 2) AS INT) < 18 THEN 'Tarde (13:00 - 17:59)'
        ELSE 'Noche (18:00 - 23:59)'
    END AS Turno,
    COUNT(v.Id_Venta) AS [Ventas],
    ROUND(SUM(CASE WHEN v.Id_MetodoPago = 'MP01' THEN v.Total_Venta ELSE 0 END), 2) AS [Efectivo (S/)],
    ROUND(SUM(CASE WHEN v.Id_MetodoPago != 'MP01' THEN v.Total_Venta ELSE 0 END), 2) AS [Digital (S/)],
    ROUND(SUM(v.Total_Venta), 2) AS [Total Turno (S/)]
FROM VENTA v
GROUP BY Turno;`,

        3: `-- 3. Conciliación Multicanal
SELECT 
    mp.Nombre_Metodo AS [Canal],
    COUNT(v.Id_Venta) AS [Transacciones],
    ROUND(SUM(v.Total_Venta), 2) AS [Total Recaudado (S/)],
    ROUND((SUM(v.Total_Venta) / (SELECT SUM(Total_Venta) FROM VENTA)) * 100, 2) AS [Participación (%)]
FROM METODO_PAGO mp
LEFT JOIN VENTA v ON mp.Id_MetodoPago = v.Id_MetodoPago
GROUP BY mp.Id_MetodoPago;`,

        4: `-- 4. Detalle Completo de Ventas (JOIN 5 tablas)
SELECT 
    v.Id_Venta,
    v.Fecha_Venta,
    v.Hora_Venta,
    mp.Nombre_Metodo,
    p.Nombre_Producto,
    dv.Cantidad,
    dv.Precio_Unitario,
    dv.Subtotal
FROM VENTA v
INNER JOIN METODO_PAGO mp ON v.Id_MetodoPago = mp.Id_MetodoPago
INNER JOIN DETALLE_VENTA dv ON v.Id_Venta = dv.Id_Venta
INNER JOIN PRODUCTO p ON dv.Id_Producto = p.Id_Producto
ORDER BY v.Id_Venta;`,

        5: `-- 5. Rentabilidad Consolidada por Categoría
SELECT 
    c.Nombre_Categoria AS [Categoría],
    COUNT(DISTINCT p.Id_Producto) AS [Productos],
    ROUND(AVG(p.Costo_Compra), 2) AS [Costo Promedio (S/)],
    ROUND(AVG(p.Precio_Venta), 2) AS [Precio Promedio (S/)],
    ROUND(SUM(p.Precio_Venta - p.Costo_Compra), 2) AS [Margen Acumulado (S/)],
    ROUND(AVG((p.Precio_Venta - p.Costo_Compra) / p.Precio_Venta) * 100, 2) AS [Margen Promedio (%)]
FROM CATEGORIA c
INNER JOIN PRODUCTO p ON c.Id_Categoria = p.Id_Categoria
GROUP BY c.Nombre_Categoria;`,

        6: `-- 6. Ganancias Consolidadas por Fecha
SELECT 
    v.Fecha_Venta AS [Día],
    COUNT(DISTINCT v.Id_Venta) AS [Ventas],
    ROUND(SUM(dv.Subtotal), 2) AS [Ingreso (S/)],
    ROUND(SUM(dv.Cantidad * p.Costo_Compra), 2) AS [Costo (S/)],
    ROUND(SUM(dv.Subtotal - (dv.Cantidad * p.Costo_Compra)), 2) AS [Ganancia Neta (S/)],
    ROUND((SUM(dv.Subtotal - (dv.Cantidad * p.Costo_Compra)) / SUM(dv.Subtotal)) * 100, 2) AS [Margen (%)]
FROM VENTA v
INNER JOIN DETALLE_VENTA dv ON v.Id_Venta = dv.Id_Venta
INNER JOIN PRODUCTO p ON dv.Id_Producto = p.Id_Producto
GROUP BY v.Fecha_Venta;`
    };

    if (presets[id]) {
        input.value = presets[id];
        runUserSqlQuery();
    }
}

async function runUserSqlQuery() {
    const input = document.getElementById('sql-console-input');
    const container = document.getElementById('sql-results-table-container');
    const timeEl = document.getElementById('sql-execution-time');

    if (!input || !container) return;
    const query = input.value.trim();
    if (!query) {
        showToast("Escribe una consulta SQL para ejecutar", "warning");
        return;
    }

    timeEl.textContent = "Ejecutando...";
    try {
        const res = await apiFetch('/api/sql', {
            method: 'POST',
            body: JSON.stringify({ query })
        });
        const result = await res.json();

        if (!result.success) {
            timeEl.textContent = "Error";
            container.innerHTML = `
                <div class="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 font-mono text-xs">
                    <i class="fa-solid fa-triangle-exclamation mr-1.5"></i>
                    ${result.error}
                </div>
            `;
            return;
        }

        timeEl.textContent = `Completado en ${result.elapsed_ms} ms`;

        if (result.is_select) {
            if (result.rows.length === 0) {
                container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">La consulta se ejecutó con éxito pero retornó 0 filas.</p>`;
                return;
            }

            let html = `
                <table class="w-full text-left text-xs font-mono">
                    <thead>
                        <tr class="text-slate-400 border-b border-slate-800 font-bold bg-slate-900/50">
                            ${result.columns.map(c => `<th class="py-2 px-3 whitespace-nowrap">${c}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800/60">
            `;

            result.rows.forEach(r => {
                html += `<tr class="hover:bg-slate-900/40 transition-colors">`;
                r.forEach(val => {
                    const disp = val !== null ? val : '<span class="text-slate-600">NULL</span>';
                    html += `<td class="py-2 px-3 whitespace-nowrap text-slate-200">${disp}</td>`;
                });
                html += `</tr>`;
            });

            html += `</tbody></table>`;
            container.innerHTML = html;
        } else {
            container.innerHTML = `
                <div class="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs">
                    <i class="fa-solid fa-circle-check mr-1.5"></i>
                    ${result.message}
                </div>
            `;
        }
    } catch (e) {
        timeEl.textContent = "Error de conexión";
        container.innerHTML = `<p class="text-xs text-rose-400 py-4">${e.message}</p>`;
    }
}

// =========================================================================
// MÓDULO 5: CATÁLOGO DE ARTÍCULOS (SIN STOCK)
// =========================================================================

function renderInventoryTable() {
    const tbody = document.getElementById('inventory-table-tbody');
    const thead = document.getElementById('inventory-table-thead');
    if (!tbody || !state.catalog || state.catalog.length === 0) return;

    const user = state.currentUser;
    const isMiriam = user && user.is_miriam;

    // Actualizar encabezado del banner del catálogo
    const titleEl = document.getElementById('catalog-banner-title');
    const subEl = document.getElementById('catalog-banner-sub');
    const countEl = document.getElementById('catalog-banner-count');

    if (titleEl) {
        titleEl.textContent = isMiriam 
            ? "Catálogo Maestro Oficial - Bodega Miriam (3FN)"
            : `Catálogo de Productos - ${(user ? user.business_name : 'Comercio').toUpperCase()}`;
    }
    if (subEl) {
        subEl.textContent = isMiriam
            ? "Atributos formales oficiales: Costo de compra, precio de mostrador, envases retornables y margen neto."
            : `Columnas y datos reales definidos en la tabla '${state.catalogTableName || 'Productos'}'.`;
    }
    if (countEl) {
        countEl.textContent = `${state.catalog.length} Artículos Registrados`;
    }

    // Determinar las columnas a mostrar según la base de datos real
    let displayCols = [];
    if (isMiriam) {
        displayCols = [
            { key: 'Id_Producto', label: 'Código', align: 'left', format: 'code' },
            { key: 'Nombre_Producto', label: 'Nombre del Producto', align: 'left', format: 'text-bold' },
            { key: 'Nombre_Categoria', label: 'Categoría', align: 'left', format: 'text' },
            { key: 'Nombre_Marca', label: 'Marca', align: 'left', format: 'text' },
            { key: 'Proveedor', label: 'Distribuidor', align: 'left', format: 'text' },
            { key: 'Es_Retornable', label: 'Tipo Envase', align: 'center', format: 'retornable' },
            { key: 'Costo_Compra', label: 'Costo (S/)', align: 'right', format: 'money' },
            { key: 'Precio_Venta', label: 'Precio (S/)', align: 'right', format: 'price' },
            { key: 'Margen_Sol', label: 'Margen (S/)', align: 'right', format: 'margin-sol' },
            { key: 'Margen_Pct', label: 'Margen (%)', align: 'right', format: 'margin-pct' }
        ];
    } else {
        const first = state.catalog[0];
        const rawCols = (state.catalogColumns && state.catalogColumns.length > 0)
            ? state.catalogColumns
            : Object.keys(first).filter(k => !['has_cost', 'has_stock', 'has_returnable', 'has_brand', 'has_provider', 'has_category', 'raw_data'].includes(k));

        rawCols.forEach(col => {
            const colLower = col.toLowerCase();
            if (colLower.includes('id') || colLower.includes('cod')) {
                displayCols.push({ key: col, label: col, align: 'left', format: 'code' });
            } else if (colLower.includes('nombre') || colLower.includes('descrip') || colLower.includes('titulo')) {
                displayCols.push({ key: col, label: col, align: 'left', format: 'text-bold' });
            } else if (colLower.includes('categ')) {
                displayCols.push({ key: 'Nombre_Categoria', label: 'Categoría', align: 'left', format: 'category' });
            } else if (colLower.includes('precio') || colLower.includes('pvp') || colLower.includes('monto')) {
                displayCols.push({ key: col, label: `${col} (S/)`, align: 'right', format: 'price' });
            } else if (colLower.includes('costo')) {
                displayCols.push({ key: col, label: `${col} (S/)`, align: 'right', format: 'money' });
            } else if (colLower.includes('stock') || colLower.includes('existencia') || colLower.includes('cant')) {
                displayCols.push({ key: col, label: col, align: 'center', format: 'stock' });
            } else if (colLower.includes('retorn') || colLower.includes('envase')) {
                displayCols.push({ key: col, label: col, align: 'center', format: 'retornable' });
            } else if (colLower.includes('marca')) {
                displayCols.push({ key: col, label: col, align: 'left', format: 'text' });
            } else if (colLower.includes('proveed') || colLower.includes('distrib')) {
                displayCols.push({ key: col, label: col, align: 'left', format: 'text' });
            } else {
                displayCols.push({ key: col, label: col, align: 'left', format: 'text' });
            }
        });

        // Margen calculado ÚNICAMENTE si la tabla tiene costo Y precio
        if (first.has_cost && first.Precio_Venta && first.Costo_Compra) {
            displayCols.push({ key: 'Margen_Sol', label: 'Margen (S/)', align: 'right', format: 'margin-sol' });
            displayCols.push({ key: 'Margen_Pct', label: 'Margen (%)', align: 'right', format: 'margin-pct' });
        }
    }

    if (thead) {
        thead.innerHTML = `
            <tr class="text-slate-400 border-b border-slate-800 font-bold bg-slate-900/40">
                ${displayCols.map(c => `
                    <th class="py-3 px-3 text-${c.align}">${c.label}</th>
                `).join('')}
            </tr>
        `;
    }

    tbody.innerHTML = state.catalog.map(p => {
        return `
            <tr class="hover:bg-slate-900/40 transition-colors border-b border-slate-800/40 font-mono">
                ${displayCols.map(c => {
                    const val = p[c.key];
                    let formatted = val !== undefined && val !== null ? val : '-';

                    if (c.format === 'code') {
                        formatted = `<span class="font-bold text-indigo-400">${val}</span>`;
                    } else if (c.format === 'text-bold') {
                        formatted = `<span class="text-white font-sans font-bold">${val}</span>`;
                    } else if (c.format === 'category') {
                        formatted = `<span class="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[11px] font-sans font-medium">${val || p.Id_Categoria}</span>`;
                    } else if (c.format === 'text') {
                        formatted = `<span class="text-slate-300 font-sans">${val}</span>`;
                    } else if (c.format === 'price') {
                        formatted = `<span class="text-emerald-400 font-bold">S/ ${Number(val).toFixed(2)}</span>`;
                    } else if (c.format === 'money') {
                        formatted = `<span class="text-slate-300">S/ ${Number(val).toFixed(2)}</span>`;
                    } else if (c.format === 'stock') {
                        formatted = `<span class="px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 text-[11px] font-bold border border-cyan-500/30">${val} und</span>`;
                    } else if (c.format === 'retornable') {
                        const isRet = val === 1 || val === true || val === '1';
                        formatted = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isRet ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-400'}">${isRet ? 'Retornable' : 'Descartable'}</span>`;
                    } else if (c.format === 'margin-sol') {
                        const m = (Number(p.Precio_Venta || 0) - Number(p.Costo_Compra || 0)).toFixed(2);
                        formatted = `<span class="text-indigo-400 font-bold">+S/ ${m}</span>`;
                    } else if (c.format === 'margin-pct') {
                        const pv = Number(p.Precio_Venta || 0);
                        const cc = Number(p.Costo_Compra || 0);
                        const pct = pv > 0 ? (((pv - cc) / pv) * 100).toFixed(1) : '0.0';
                        formatted = `<span class="text-purple-400 font-bold">${pct}%</span>`;
                    }

                    return `<td class="py-3 px-3 text-${c.align}">${formatted}</td>`;
                }).join('')}
            </tr>
        `;
    }).join('');
}

// =========================================================================
// TICKET TÉRMICO IMPRIMIBLE
// =========================================================================

function openTicketModal(saleResult, cartItems) {
    const modal = document.getElementById('ticket-modal');
    if (!modal) return;

    const bizEl = document.getElementById('ticket-business-name');
    const ownerEl = document.getElementById('ticket-owner-name');
    if (ownerEl) {
        const ownerName = state.currentUser ? (state.currentUser.owner_name || state.currentUser.full_name || 'Lesly Miriam') : 'Lesly Miriam';
        ownerEl.textContent = `De: ${ownerName}`;
    }
    if (bizEl) bizEl.textContent = state.currentUser.business_name.toUpperCase();

    document.getElementById('ticket-id-display').textContent = `VENTA: ${saleResult.id_venta}`;
    const nowD = new Date();
    const localFallbackDate = `${nowD.getFullYear()}-${String(nowD.getMonth()+1).padStart(2,'0')}-${String(nowD.getDate()).padStart(2,'0')}`;
    const localFallbackTime = nowD.toTimeString().split(' ')[0].substring(0, 8);
    const fecha = saleResult.fecha_venta || saleResult.fecha || localFallbackDate;
    const hora = saleResult.hora_venta || saleResult.hora || localFallbackTime;
    document.getElementById('ticket-datetime-display').textContent = `${fecha}  ${hora}`;
    document.getElementById('ticket-total-display').textContent = `S/ ${saleResult.total_venta.toFixed(2)}`;

    let methodStr = "Efectivo";
    if (saleResult.id_metodo_pago === 'MP02') methodStr = "Yape";
    if (saleResult.id_metodo_pago === 'MP03') methodStr = "Plin";
    document.getElementById('ticket-method-display').textContent = methodStr;

    const tbody = document.getElementById('ticket-items-tbody');
    tbody.innerHTML = cartItems.map(it => `
        <div class="flex justify-between">
            <span class="max-w-[170px] truncate">${it.cantidad}x ${it.nombre}</span>
            <span>S/ ${(it.precio_unitario * it.cantidad).toFixed(2)}</span>
        </div>
    `).join('');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeTicketModal() {
    const modal = document.getElementById('ticket-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

// =========================================================================
// REINICIAR BASE DE DATOS Y TOASTS
// =========================================================================

async function resetDatabasePrompt() {
    const isMiriam = state.currentUser.is_miriam;
    const confirmMsg = isMiriam 
        ? "¿Estás seguro de reiniciar la Base de Datos de Bodega Miriam a sus 5 ventas piloto basales oficiales?"
        : "¿Estás seguro de reiniciar la Base de Datos a sus valores iniciales?";

    if (confirm(confirmMsg)) {
        try {
            const res = await apiFetch('/api/reset-db', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast(data.message, "success");
            }
        } catch (e) {
            showToast("Error al reiniciar base de datos", "error");
        }
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    let bg = "bg-slate-900 border-slate-700 text-white";
    let icon = "fa-circle-info text-blue-400";

    if (type === 'success') {
        bg = "bg-emerald-950/90 border-emerald-500/40 text-emerald-200";
        icon = "fa-circle-check text-emerald-400";
    } else if (type === 'error') {
        bg = "bg-rose-950/90 border-rose-500/40 text-rose-200";
        icon = "fa-circle-xmark text-rose-400";
    } else if (type === 'warning') {
        bg = "bg-amber-950/90 border-amber-500/40 text-amber-200";
        icon = "fa-triangle-exclamation text-amber-400";
    }

    toast.className = `p-3.5 rounded-2xl border shadow-2xl flex items-center space-x-2.5 text-xs font-semibold backdrop-blur-md animate-scale-up pointer-events-auto ${bg}`;
    toast.innerHTML = `<i class="fa-solid ${icon} text-sm"></i><span>${message}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}
