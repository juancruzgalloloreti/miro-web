/* ============================================================
   MIRÓ DISTRIBUIDORA MAYORISTA — Lógica Frontend
   Fuente de datos: Google Sheets (CSV público)
   ============================================================ */

// ── CONFIGURACIÓN ─────────────────────────────────────────────
const PUBLISHED_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT5fqjpLId7TXkavg3YwBQSlLFEsI_ZSg8IrbR-69sOUjZla8tbJdRaJbk6M9apjNNaDtPC02n5w1Np/pub?gid=1466818005&single=true&output=csv";
const WHATSAPP_NUMBER   = "5491162708262"; // ← número actualizado

// URLs para cargar el sheet (se prueban en orden hasta que una funcione)
const CSV_URLS = [
  // 1. URL publicada directamente (Archivo → Compartir → Publicar en la web → CSV)
  PUBLISHED_CSV_URL,
  // 2. Proxy CORS como fallback
  `https://corsproxy.io/?url=${encodeURIComponent(PUBLISHED_CSV_URL)}`,
];

// Mapeo de icono por rubro
const RUBRO_ICONS = {
  "Almacen":                        "🌾",
  "Almacén":                        "🌾",
  "Enlatados":                      "🥫",
  "Aderezos e individuales":        "🥄",
  "Aceitunas y encurtidos":         "🌿",
  "Especias":                       "🌶️",
  "Reposteria y dulces":            "🍮",
  "Repostería y dulces":            "🍮",
  "Frutos secos/semillas/legumbres":"🥜",
  "Caldos y saborizantes":          "🍲",
  "Infusiones":                     "☕",
  "Galletitas":                     "🍪",
  "Snacks":                         "🍟",
  "Bebidas":                        "🥤",
  "Lácteos":                        "🥛",
  "Limpieza":                       "🧼",
  "Golosinas":                      "🍬",
  "Otros":                          "📦",
};

const RUBRO_COLORS = {
  "Almacen":                         "#0d2b5e",
  "Almacén":                         "#0d2b5e",
  "Enlatados":                       "#8b4513",
  "Aderezos e individuales":         "#c9a84c",
  "Aceitunas y encurtidos":          "#5a7a3a",
  "Especias":                        "#c0392b",
  "Reposteria y dulces":             "#d4a0c0",
  "Repostería y dulces":             "#d4a0c0",
  "Frutos secos/semillas/legumbres": "#a0784a",
  "Caldos y saborizantes":           "#e67e22",
  "Infusiones":                      "#6b4c3b",
  "Galletitas":                      "#c9a84c",
  "Snacks":                          "#e2a020",
  "Bebidas":                         "#1a6ea8",
  "Lácteos":                         "#5aa0c8",
  "Limpieza":                        "#2ecc71",
  "Golosinas":                       "#e91e8c",
  "Otros":                           "#888888",
};

// ── ESTADO GLOBAL ──────────────────────────────────────────────
let todosLosProductos = [];
let cart              = [];
let currentCategory   = "all";
let searchQuery       = "";
let currentSort       = "category-asc";
let precioTipo        = "B"; // "A" o "B" → Factura A o Factura B

// ── INICIALIZACIÓN ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initMobileCatPanel();

  if (document.getElementById("productosGrid")) {
    initCatalogUI();
    loadProductsFromSheet();
  }

  initCart();
});

// ── NAVEGACIÓN RESPONSIVE ─────────────────────────────────────
function initNavigation() {
  const menuToggle = document.getElementById("menuToggle");
  const mobileMenu = document.getElementById("mobileMenu");

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener("click", () => {
      const isOpen = mobileMenu.classList.toggle("open");
      menuToggle.classList.toggle("active");
      const spans = menuToggle.querySelectorAll("span");
      if (isOpen) {
        spans[0].style.transform = "translateY(7px) rotate(45deg)";
        spans[1].style.opacity   = "0";
        spans[2].style.transform = "translateY(-7px) rotate(-45deg)";
      } else {
        spans[0].style.transform = "";
        spans[1].style.opacity   = "";
        spans[2].style.transform = "";
      }
    });
  }
}

// ── PANEL DE CATEGORÍAS MOBILE (colapsable) ──────────────────
function initMobileCatPanel() {
  const toggleBtn = document.getElementById("mobileCatToggle");
  const panel     = document.getElementById("mobileCatPanel");
  if (!toggleBtn || !panel) return;

  toggleBtn.addEventListener("click", () => {
    const isOpen = panel.classList.toggle("open");
    toggleBtn.setAttribute("aria-expanded", isOpen);
    toggleBtn.querySelector(".mobile-cat-toggle__arrow").style.transform = isOpen ? "rotate(180deg)" : "";
  });

  // Cerrar el panel al elegir una categoría
  panel.querySelectorAll(".cat-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      panel.classList.remove("open");
      toggleBtn.setAttribute("aria-expanded", "false");
      toggleBtn.querySelector(".mobile-cat-toggle__arrow").style.transform = "";
    });
  });
}

// ── NORMALIZACIÓN Y PARÁMETROS URL ─────────────────────────────
function normalizeCategory(cat) {
  if (!cat) return "";
  return cat.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function checkUrlParams() {
  const params   = new URLSearchParams(window.location.search);
  const catParam = params.get("cat");
  if (catParam) {
    const normParam = normalizeCategory(catParam);
    
    // Mapeo inteligente para categorías con nombres diferentes
    let targetNorm = normParam;
    if (normParam === "golosinas") {
      targetNorm = "reposteria y dulces";
    } else if (normParam === "frutos secos y legumbres") {
      targetNorm = "frutos secos/semillas/legumbres";
    }

    // Buscar si existe un rubro que coincida en la planilla
    const rubros = [...new Set(todosLosProductos.map(p => p.category))];
    const matched = rubros.find(r => normalizeCategory(r) === targetNorm);
    if (matched) {
      currentCategory = matched;
    } else {
      currentCategory = catParam;
    }
  }
}

// ── FETCH Y PARSEO DEL GOOGLE SHEET ───────────────────────────
async function loadProductsFromSheet() {
  const grid = document.getElementById("productosGrid");

  grid.innerHTML = `
    <div class="loading-state" style="grid-column:1/-1;">
      <div class="loading-spinner"></div>
      <span class="loading-text">Cargando lista de precios...</span>
    </div>`;

  let lastError = null;

  for (const url of CSV_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const csvText = await res.text();

      // Verificar que realmente es CSV y no una página de error HTML
      if (csvText.trim().startsWith("<!")) throw new Error("Respuesta HTML (probablemente error de acceso)");

      todosLosProductos = parseSheetCSV(csvText);

      if (todosLosProductos.length === 0) throw new Error("Sin productos válidos en el CSV");

      checkUrlParams();
      buildCategoryFilters();
      renderCatalog();
      return; // Éxito, salir del loop
    } catch (err) {
      console.warn(`Intento fallido (${url}):`, err.message);
      lastError = err;
    }
  }

  // Todos los intentos fallaron
  console.error("Error cargando el catálogo:", lastError);
  grid.innerHTML = `
    <div class="error-state" style="grid-column:1/-1;">
      <div class="error-state__icon">⚠️</div>
      <div class="error-state__title">No se pudo cargar el catálogo</div>
      <div class="error-state__desc">
        Verificá que la planilla de Google Sheets esté publicada en la web.<br>
        <small style="color:var(--gray-400);margin-top:6px;display:block;">
          En Google Sheets: Archivo → Compartir → Publicar en la web → Hoja 1 → CSV → Publicar
        </small>
      </div>
      <button class="error-state__btn" onclick="loadProductsFromSheet()">🔄 Reintentar</button>
    </div>`;
}

/*
  Estructura del sheet (encabezados buscados dinámicamente):
  Col A (idx 0)  → Producto
  Col S (idx 18) → Marca
  Col AA (idx 26)→ Presentación
  Col AI (idx 34)→ FACTURA B
  Col AM (idx 38)→ FACTURA A
  Col AQ (idx 42)→ RUBRO
*/
function parseSheetCSV(csvText) {
  const lines    = csvText.split("\n");
  const products = [];
  let headerRow  = -1;

  // Encontrar la fila de encabezados (contiene "Producto" y "Marca")
  for (let i = 0; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (
      cols[0]  && cols[0].trim().toLowerCase()  === "producto" &&
      cols[18] && cols[18].trim().toLowerCase() === "marca"
    ) {
      headerRow = i;
      break;
    }
  }

  if (headerRow === -1) {
    console.warn("No se encontró fila de encabezados con 'Producto' en col A y 'Marca' en col S");
    return [];
  }

  let idCounter = 1;
  for (let i = headerRow + 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);

    const nombre       = (cols[0]  || "").trim();
    const marca        = (cols[18] || "").trim();
    const presentacion = (cols[26] || "").trim();
    const precioB      = parsePrecio(cols[34]);
    const precioA      = parsePrecio(cols[38]);
    const rubro        = (cols[41] || "").trim();

    // Ignorar filas sin nombre o sin precio
    if (!nombre || (!precioB && !precioA)) continue;
    // Ignorar filas que son encabezados repetidos
    if (nombre.toLowerCase() === "producto") continue;

    products.push({
      id:       idCounter++,
      name:     nombre,
      brand:    marca,
      pack:     presentacion,
      priceB:   precioB,
      priceA:   precioA,
      category: rubro || "Otros",
    });
  }

  console.log(`[Catálogo] Header detectado en fila ${headerRow}. Productos parseados: ${products.length}`);
  if (products.length > 0) {
    console.log(`[Catálogo] Primeros 3 rubros (cols[41]):`, products.slice(0,3).map(p => p.category));
  }
  return products;
}

// Parseo robusto de una línea CSV (maneja comillas y comas dentro de campos)
function parseCSVLine(line) {
  const result = [];
  let current  = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parsePrecio(val) {
  if (!val) return 0;
  let clean = String(val).replace(/[^\d.,]/g, "");
  if (clean.includes(",") && clean.includes(".")) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else if (clean.includes(",")) {
    clean = clean.replace(",", ".");
  } else if (clean.includes(".")) {
    const parts = clean.split(".");
    if (parts.length === 2 && parts[1].length === 3) {
      // e.g. "18.900" en ARS es dieciocho mil novecientos, no 18.9 pesos.
      clean = clean.replace(".", "");
    }
  }
  return parseFloat(clean) || 0;
}

// ── FILTROS DE CATEGORÍAS (dinámicos desde el sheet) ──────────
function buildCategoryFilters() {
  const containers = document.querySelectorAll(".categories-filter-group");
  if (!containers.length) return;

  const rubros = [...new Set(todosLosProductos.map(p => p.category))].sort();

  let html = `<button class="cat-filter-btn ${currentCategory === 'all' ? 'active' : ''}" data-category="all">📦 Todos los Rubros</button>`;
  rubros.forEach(rubro => {
    const icon    = RUBRO_ICONS[rubro] || "📦";
    const isActive = currentCategory === rubro;
    html += `<button class="cat-filter-btn ${isActive ? 'active' : ''}" data-category="${rubro}">${icon} ${rubro}</button>`;
  });

  // Actualizar el label del botón mobile si hay categoría activa
  updateMobileCatLabel();

  containers.forEach(container => {
    container.innerHTML = html;
    container.querySelectorAll(".cat-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        // Sincronizar todos los grupos
        document.querySelectorAll(".cat-filter-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(`.cat-filter-btn[data-category="${btn.getAttribute("data-category")}"]`)
          .forEach(b => b.classList.add("active"));
        currentCategory = btn.getAttribute("data-category");
        updateMobileCatLabel();
        renderCatalog();
      });
    });
  });
}

function updateMobileCatLabel() {
  const label = document.getElementById("mobileCatLabel");
  if (!label) return;
  if (currentCategory === "all") {
    label.textContent = "Todos los Rubros";
  } else {
    const icon = RUBRO_ICONS[currentCategory] || "📦";
    label.textContent = `${icon} ${currentCategory}`;
  }
}

// ── INICIALIZACIÓN UI DEL CATÁLOGO ────────────────────────────
function initCatalogUI() {
  const searchInput = document.getElementById("searchInput");
  const sortSelect  = document.getElementById("sortSelect");

  if (searchInput) {
    searchInput.addEventListener("input", e => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderCatalog();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", e => {
      currentSort = e.target.value;
      renderCatalog();
    });
  }

  // Toggle Factura A / B
  const toggleA = document.getElementById("toggleA");
  const toggleB = document.getElementById("toggleB");
  if (toggleA && toggleB) {
    toggleA.addEventListener("change", () => { if (toggleA.checked) { precioTipo = "A"; renderCatalog(); } });
    toggleB.addEventListener("change", () => { if (toggleB.checked) { precioTipo = "B"; renderCatalog(); } });
  }
}

// ── RENDERIZADO DEL CATÁLOGO ───────────────────────────────────
function renderCatalog() {
  const grid       = document.getElementById("productosGrid");
  const countText  = document.getElementById("productCountText");
  const emptyState = document.getElementById("emptyState");

  if (!grid) return;

  // 1. Filtrar
  let items = todosLosProductos.filter(p => {
    const matchCat    = currentCategory === "all" || p.category === currentCategory;
    const matchSearch = !searchQuery || (() => {
      const searchWords = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
      return searchWords.every(word => 
        p.name.toLowerCase().includes(word) ||
        (p.brand || "").toLowerCase().includes(word) ||
        p.category.toLowerCase().includes(word)
      );
    })();
    return matchCat && matchSearch;
  });

  // 2. Ordenar
  if (currentSort === "default" || currentSort === "category-asc") {
    items.sort((a, b) => {
      const catComp = a.category.localeCompare(b.category, "es");
      if (catComp !== 0) return catComp;
      return a.name.localeCompare(b.name, "es");
    });
  } else if (currentSort === "alpha-asc") {
    items.sort((a, b) => a.name.localeCompare(b.name, "es"));
  } else if (currentSort === "price-asc") {
    items.sort((a, b) => getPrecio(a) - getPrecio(b));
  } else if (currentSort === "price-desc") {
    items.sort((a, b) => getPrecio(b) - getPrecio(a));
  }

  // 3. Contador
  if (countText) countText.innerText = `Mostrando ${items.length} producto${items.length !== 1 ? "s" : ""}`;

  if (items.length === 0) {
    grid.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    return;
  }
  if (emptyState) emptyState.style.display = "none";

  // 4. Renderizar cards
  grid.innerHTML = items.map(prod => buildCard(prod)).join("");
}

function getPrecio(prod) {
  return precioTipo === "A" ? (prod.priceA || prod.priceB) : (prod.priceB || prod.priceA);
}

function formatPrecio(num) {
  if (!num) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0
  }).format(num);
}

function buildCard(prod) {
  const precio     = getPrecio(prod);
  const color      = RUBRO_COLORS[prod.category] || "#888888";
  const badgeLabel = precioTipo === "A" ? "Fact. A" : "Fact. B";

  return `
    <div class="producto-card" style="border-left-color:${color}">
      <span class="producto-card__cat" style="background:${color}20;color:${color}">${prod.category}</span>
      <div class="producto-card__body">
        <div class="producto-card__info">
          <div class="producto-card__left">
            <h4 class="producto-card__name">${prod.name}</h4>
            <span class="producto-card__meta">${prod.brand || "—"}${prod.pack ? ` · ${prod.pack}` : ""}</span>
          </div>
          <div class="producto-card__right">
            <span class="producto-card__precio">
              ${formatPrecio(precio)}
              <span class="precio-tipo-badge">${badgeLabel}</span>
            </span>
            <div class="producto-card__actions">
              <input type="number" value="1" min="1" id="qty-${prod.id}" class="producto-card__qty" aria-label="Cantidad">
              <button class="add-to-cart-btn" onclick="handleAddToCart(${prod.id})" aria-label="Agregar ${prod.name} al carrito">+ Añadir</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── CARRITO ────────────────────────────────────────────────────
function initCart() {
  const floatingCartBtn = document.getElementById("floatingCartBtn");
  const cartTriggerNav  = document.getElementById("cartTriggerNav");
  const closeCartBtn    = document.getElementById("closeCartBtn");
  const cartOverlay     = document.getElementById("cartOverlay");
  const cartDrawer      = document.getElementById("cartDrawer");
  const checkoutBtn     = document.getElementById("whatsappCheckoutBtn");

  const openCart = () => {
    if (cartDrawer)  cartDrawer.classList.add("open");
    if (cartOverlay) cartOverlay.classList.add("open");
    document.body.style.overflow = "hidden"; // Bloquea scroll del fondo
    renderCartItems();
  };

  const closeCart = () => {
    if (cartDrawer)  cartDrawer.classList.remove("open");
    if (cartOverlay) cartOverlay.classList.remove("open");
    document.body.style.overflow = ""; // Restaura scroll
  };

  if (floatingCartBtn) floatingCartBtn.addEventListener("click", openCart);
  if (cartTriggerNav)  cartTriggerNav.addEventListener("click", openCart);
  if (closeCartBtn)    closeCartBtn.addEventListener("click", closeCart);
  if (cartOverlay)     cartOverlay.addEventListener("click", closeCart);
  if (checkoutBtn)     checkoutBtn.addEventListener("click", sendWhatsAppOrder);
}

window.handleAddToCart = function(id) {
  const qtyInput = document.getElementById(`qty-${id}`);
  const quantity = Math.max(1, parseInt(qtyInput?.value) || 1);

  const prod = todosLosProductos.find(p => p.id === id);
  if (!prod) return;

  const existing = cart.find(item => item.product.id === id);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ product: prod, quantity });
  }

  if (qtyInput) qtyInput.value = 1;
  updateCartCounters();
  showToast(`✓ ${quantity}× ${prod.name} agregado`);
};

window.removeFromCart = function(id) {
  cart = cart.filter(item => item.product.id !== id);
  updateCartCounters();
  renderCartItems();
};

window.changeQty = function(id, delta) {
  const item = cart.find(i => i.product.id === id);
  if (!item) return;
  item.quantity = Math.max(1, item.quantity + delta);
  updateCartCounters();
  renderCartItems();
};

function updateCartCounters() {
  const total = cart.reduce((acc, i) => acc + i.quantity, 0);
  const badgeFixed = document.getElementById("cartBadgeCount");
  if (badgeFixed) badgeFixed.innerText = total;
  document.querySelectorAll(".cart-count-badge").forEach(b => b.innerText = total);
}

function renderCartItems() {
  const container     = document.getElementById("cartItemsContainer");
  const totalAmountEl = document.getElementById("cartTotalAmount");
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty__icon">🛒</div>
        <div class="cart-empty__text">Tu carrito está vacío</div>
      </div>`;
    if (totalAmountEl) totalAmountEl.innerText = "$0";
    return;
  }

  let total = 0;
  container.innerHTML = cart.map(item => {
    const precio   = getPrecio(item.product);
    const subtotal = precio * item.quantity;
    total += subtotal;
    return `
      <div class="cart-item" style="display:flex;justify-content:space-between;align-items:center;
        padding:10px 16px;border-bottom:1px dashed var(--cream-dark);">
        <div style="flex:1;min-width:0;">
          <h5 style="font-size:0.875rem;font-weight:600;color:var(--navy-dark);
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.product.name}</h5>
          <span style="font-size:0.72rem;color:var(--gray-600);">
            ${formatPrecio(precio)} c/u · ${item.product.pack || ""}
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-left:12px;flex-shrink:0;">
          <button class="qty-btn" onclick="changeQty(${item.product.id},-1)">−</button>
          <span class="qty-val">${item.quantity}</span>
          <button class="qty-btn" onclick="changeQty(${item.product.id},1)">+</button>
          <span style="font-weight:700;font-size:0.875rem;color:var(--navy-dark);
            min-width:64px;text-align:right;">${formatPrecio(subtotal)}</span>
          <button onclick="removeFromCart(${item.product.id})"
            style="background:none;color:var(--red);font-size:1.1rem;font-weight:700;
              padding:0 4px;border:none;cursor:pointer;line-height:1;">×</button>
        </div>
      </div>
    `;
  }).join("");

  if (totalAmountEl) totalAmountEl.innerText = formatPrecio(total);
}

// ── TOAST ──────────────────────────────────────────────────────
function showToast(msg) {
  let toast = document.getElementById("globalToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id        = "globalToast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.innerText = msg;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

// ── ENVÍO POR WHATSAPP ─────────────────────────────────────────
function sendWhatsAppOrder() {
  if (cart.length === 0) {
    showToast("⚠️ Tu carrito está vacío");
    return;
  }

  // Cerrar el drawer y restaurar scroll antes de abrir WhatsApp
  document.getElementById("cartDrawer")?.classList.remove("open");
  document.getElementById("cartOverlay")?.classList.remove("open");
  document.body.style.overflow = "";
  const note     = (document.getElementById("cartNote")?.value || "").trim();
  const tipoFact = precioTipo === "A" ? "Factura A" : "Factura B";

  let mensaje = `*MIRÓ DISTRIBUIDORA MAYORISTA*\n`;
  mensaje    += `_Solicitud de Pedido Web — ${tipoFact}_\n`;
  mensaje    += `—————————————————————————\n\n`;

  let totalPedido = 0;
  cart.forEach((item, i) => {
    const precio   = getPrecio(item.product);
    const subtotal = precio * item.quantity;
    totalPedido   += subtotal;
    mensaje += `${i+1}. *${item.product.name}*`;
    if (item.product.brand) mensaje += ` (${item.product.brand})`;
    mensaje += `\n`;
    mensaje += `   Cant: ${item.quantity} × ${formatPrecio(precio)} = ${formatPrecio(subtotal)}\n`;
    if (item.product.pack) mensaje += `   Presentación: ${item.product.pack}\n`;
  });

  mensaje += `\n—————————————————————————\n`;
  mensaje += `*Total Estimado (${tipoFact}):* ${formatPrecio(totalPedido)}\n`;
  if (note) mensaje += `\n*Notas:* ${note}\n`;
  mensaje += `\n_Por favor, confirmar disponibilidad y logística de entrega._`;

  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(mensaje)}`, "_blank");
}
