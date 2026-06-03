// ── DATOS BASE ────────────────────────────────────────────
var CATS = {
  ingreso: ["Salario","Freelance","Inversiones","Alquiler","Regalo","Otro ingreso"],
  gasto:   ["Alimentacion","Transporte","Vivienda","Salud","Entretenimiento","Ropa","Educacion","Servicios","Otro gasto"]
};
var ICONS = {
  "Salario":"💼","Freelance":"💻","Inversiones":"📈","Alquiler":"🏠","Regalo":"🎁","Otro ingreso":"💰",
  "Alimentacion":"🍽️","Transporte":"🚗","Vivienda":"🏡","Salud":"❤️","Entretenimiento":"🎬",
  "Ropa":"👗","Educacion":"📚","Servicios":"💡","Otro gasto":"📦"
};
var CATCOLORS = ["#6366f1","#a78bfa","#38bdf8","#34d399","#fb923c","#f87171","#e879f9","#facc15","#4ade80","#60a5fa"];

// ── STORAGE ───────────────────────────────────────────────
function load(k, d) { try { var v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : d; } catch(e) { return d; } }
function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

var transactions = load("fin_tx", []);
var goals        = load("fin_goals", []);
var debts        = load("fin_debts", []);
var budgets      = load("fin_budgets", {});

var currentView  = "dashboard";
var analysisTab  = "gastos";
var searchQuery  = "";
var modalAction  = null;
var modalData    = {};
var reminderOn   = load("fin_reminder", false);
var form = { tipo: "gasto", descripcion: "", monto: "", categoria: "Alimentacion", fecha: "", nota: "" };

// ── UTILS ─────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0,10); }
function thisMonth() { return new Date().toISOString().slice(0,7); }
form.fecha = todayStr();

function fmt(n) {
  return new Intl.NumberFormat("es-MX", {style:"currency", currency:"MXN", minimumFractionDigits:0, maximumFractionDigits:0}).format(n);
}
function fmtShort(n) { return Math.abs(n) >= 1000 ? "$" + (n/1000).toFixed(1) + "k" : "$" + Math.round(n); }
function fmtDate(d) { return new Date(d + "T12:00:00").toLocaleDateString("es-MX", {day:"2-digit", month:"short", year:"numeric"}); }
function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function ic(cat) { return ICONS[cat] || "📦"; }
function el(id) { return document.getElementById(id); }

// ── INIT ──────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", function() {
  var mi = el("month-input");
  mi.value = thisMonth();
  mi.addEventListener("change", render);
  render();
  renderTicker();
});

// ── TOAST ─────────────────────────────────────────────────
var toastTimer;
function showToast(msg, type) {
  type = type || "ok";
  var t = el("toast");
  t.innerHTML = msg;
  t.className = "show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.className = ""; }, 2800);
}

// ── MODAL ─────────────────────────────────────────────────
function openModal(title, bodyHtml, confirmLabel, confirmClass, action, data) {
  modalAction = action;
  modalData = data || {};
  el("modal-title").textContent = title;
  el("modal-body").innerHTML = bodyHtml;
  var cb = el("modal-confirm-btn");
  cb.textContent = confirmLabel;
  cb.className = "modal-confirm " + (confirmClass || "primary");
  cb.style.display = "";
  el("modal-overlay").classList.add("show");
}
function closeModal() {
  modalAction = null;
  modalData = {};
  el("modal-overlay").classList.remove("show");
}
function modalConfirm() {
  if (modalAction === "deleteGoal") {
    goals = goals.filter(function(g) { return g.id !== modalData.id; });
    save("fin_goals", goals);
    showToast("Meta eliminada", "err"); closeModal(); render();

  } else if (modalAction === "deleteTx") {
    transactions = transactions.filter(function(t) { return t.id !== modalData.id; });
    save("fin_tx", transactions);
    showToast("Eliminada", "err"); closeModal(); render();

  } else if (modalAction === "deleteDebt") {
    debts = debts.filter(function(d) { return d.id !== modalData.id; });
    save("fin_debts", debts);
    showToast("Deuda eliminada", "err"); closeModal(); render(); renderTicker();

  } else if (modalAction === "addGoal") {
    var name = (el("mg-name") ? el("mg-name").value : "").trim();
    var target = parseFloat(el("mg-target") ? el("mg-target").value : "0");
    if (!name || isNaN(target) || target <= 0) { showToast("Completa todos los campos", "err"); return; }
    goals.push({ id: Date.now(), name: name, emoji: "💰", target: target, saved: 0, deposits: [] });
    save("fin_goals", goals); showToast("Meta creada ✓"); closeModal(); render();

  } else if (modalAction === "deposit") {
    var amount = parseFloat(el("mg-deposit") ? el("mg-deposit").value : "0");
    if (isNaN(amount) || amount <= 0) { showToast("Monto inválido", "err"); return; }
    var g = goals.find(function(g) { return g.id === modalData.id; });
    if (g) {
      g.saved = (g.saved || 0) + amount;
      g.deposits = g.deposits || [];
      g.deposits.push({ date: todayStr(), amount: amount });
      if (g.saved >= g.target) showToast("🎉 Meta alcanzada!");
      else showToast("Depósito registrado ✓");
    }
    save("fin_goals", goals); closeModal(); render();

  } else if (modalAction === "withdraw") {
    var amount = parseFloat(el("mg-deposit") ? el("mg-deposit").value : "0");
    var g = goals.find(function(g) { return g.id === modalData.id; });
    if (isNaN(amount) || amount <= 0 || amount > (g ? g.saved || 0 : 0)) { showToast("Monto inválido", "err"); return; }
    if (g) { g.saved -= amount; g.deposits.push({ date: todayStr(), amount: -amount }); }
    save("fin_goals", goals); showToast("Retiro registrado"); closeModal(); render();

  } else if (modalAction === "addDebt") {
    var name = (el("d-name") ? el("d-name").value : "").trim();
    var total = parseFloat(el("d-total") ? el("d-total").value : "0");
    var venc = el("d-venc") ? el("d-venc").value : "";
    var cat = el("d-cat") ? el("d-cat").value : "General";
    if (!name || isNaN(total) || total <= 0) { showToast("Completa nombre y monto", "err"); return; }
    debts.push({ id: Date.now(), name: name, total: total, paid: 0, vencimiento: venc, categoria: cat, pagos: [] });
    save("fin_debts", debts); showToast("Deuda agregada ✓"); closeModal(); render(); renderTicker();

  } else if (modalAction === "payDebt") {
    var amount = parseFloat(el("d-pay") ? el("d-pay").value : "0");
    var d = debts.find(function(d) { return d.id === modalData.id; });
    var remaining = d ? d.total - d.paid : 0;
    if (isNaN(amount) || amount <= 0 || amount > remaining + 0.01) { showToast("Monto inválido", "err"); return; }
    if (d) {
      d.paid = Math.min(d.paid + amount, d.total);
      d.pagos = d.pagos || [];
      d.pagos.push({ date: todayStr(), amount: amount });
      if (d.paid >= d.total) showToast("✅ ¡Deuda pagada!");
      else showToast("Pago de " + fmt(amount) + " registrado ✓");
    }
    save("fin_debts", debts); closeModal(); render(); renderTicker();

  } else if (modalAction === "setBudget") {
    var cat = modalData.cat;
    var val = parseFloat(el("budget-val") ? el("budget-val").value : "0");
    if (!isNaN(val) && val > 0) { budgets[cat] = val; save("fin_budgets", budgets); showToast("Presupuesto guardado ✓"); }
    else { delete budgets[cat]; save("fin_budgets", budgets); showToast("Presupuesto eliminado"); }
    closeModal(); render();

  } else if (modalAction === "_importData") {
    var d = modalData.importData;
    transactions = d.transactions || []; debts = d.debts || []; goals = d.goals || [];
    if (d.budgets) budgets = d.budgets;
    save("fin_tx", transactions); save("fin_debts", debts); save("fin_goals", goals); save("fin_budgets", budgets);
    closeModal(); render(); renderTicker();
    showToast("✅ " + transactions.length + " tx, " + debts.length + " deudas, " + goals.length + " metas importadas");

  } else if (modalAction === "_clearAll") {
    transactions = []; debts = []; goals = []; budgets = {};
    save("fin_tx", []); save("fin_debts", []); save("fin_goals", []); save("fin_budgets", {});
    closeModal(); render(); renderTicker(); showToast("Datos eliminados", "err");
  }
}

// ── NAVEGACIÓN ────────────────────────────────────────────
function setView(v) {
  currentView = v;
  document.querySelectorAll(".nav-btn").forEach(function(b) { b.classList.remove("active"); });
  var nb = el("nav-" + v);
  if (nb) nb.classList.add("active");
  el("content").scrollTop = 0;
  render();
}
function toggleSearch() {
  var bar = el("search-bar");
  var btn = el("btn-search");
  var isOpen = bar.classList.toggle("show");
  btn.classList.toggle("active", isOpen);
  if (isOpen) el("search-input").focus();
  else { searchQuery = ""; el("search-input").value = ""; render(); }
}
function onSearch(val) {
  searchQuery = val.toLowerCase();
  if (currentView !== "history") setView("history");
  else render();
}
function toggleDataPanel() {
  var panel = el("data-panel");
  var btn = el("btn-data");
  var isOpen = panel.classList.toggle("show");
  btn.classList.toggle("active", isOpen);
}

// ── ESTADÍSTICAS ──────────────────────────────────────────
function getMonthlyStats(n) {
  var now = new Date(), months = [];
  for (var i = n - 1; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var key = d.toISOString().slice(0,7);
    var label = d.toLocaleDateString("es-MX", {month:"short"}).toUpperCase();
    var mTx = transactions.filter(function(t) { return t.fecha.startsWith(key); });
    var inc = mTx.filter(function(t) { return t.tipo === "ingreso"; }).reduce(function(s,t) { return s + t.monto; }, 0);
    var exp = mTx.filter(function(t) { return t.tipo === "gasto"; }).reduce(function(s,t) { return s + t.monto; }, 0);
    months.push({ key: key, label: label, inc: inc, exp: exp, balance: inc - exp });
  }
  return months;
}
function getForecast() {
  var stats = getMonthlyStats(3);
  var real = stats.filter(function(m) { return m.inc > 0 || m.exp > 0; });
  if (!real.length) return null;
  var avgInc = real.reduce(function(s,m) { return s + m.inc; }, 0) / real.length;
  var avgExp = real.reduce(function(s,m) { return s + m.exp; }, 0) / real.length;
  var avgSave = avgInc - avgExp;
  var forecast = [];
  for (var i = 0; i < 6; i++) {
    var d = new Date(); d.setMonth(d.getMonth() + i + 1);
    forecast.push({ month: d.toLocaleDateString("es-MX", {month:"short"}).toUpperCase(), projected: avgSave * (i+1), monthly: avgSave });
  }
  return { forecast: forecast, avgInc: avgInc, avgExp: avgExp, avgSave: avgSave };
}

// ── RENDER PRINCIPAL ──────────────────────────────────────
function render() {
  var month = el("month-input").value;
  var filtered = transactions.filter(function(t) { return t.fecha.startsWith(month); });
  var totalIn  = filtered.filter(function(t) { return t.tipo === "ingreso"; }).reduce(function(s,t) { return s + t.monto; }, 0);
  var totalOut = filtered.filter(function(t) { return t.tipo === "gasto"; }).reduce(function(s,t) { return s + t.monto; }, 0);
  var balance  = totalIn - totalOut;
  var c = el("content");
  if      (currentView === "dashboard") renderDashboard(c, filtered, totalIn, totalOut, balance);
  else if (currentView === "add")       renderAdd(c);
  else if (currentView === "savings")   renderSavings(c);
  else if (currentView === "debts")     renderDebts(c);
  else if (currentView === "analysis")  renderAnalysis(c, filtered, totalIn, totalOut, balance);
  else                                  renderHistory(c, filtered);
}

// ── DONUT SVG ─────────────────────────────────────────────
function buildDonut(data, cx, cy, r, thick) {
  var total = data.reduce(function(s,d) { return s + d.value; }, 0);
  if (!total) return "";
  var angle = -Math.PI / 2, segs = [];
  for (var i = 0; i < data.length; i++) {
    var d = data[i];
    var sweep = (d.value / total) * 2 * Math.PI;
    var x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    angle += sweep;
    var x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle);
    var large = sweep > Math.PI ? 1 : 0;
    var ir = r - thick;
    var ix1 = cx + ir * Math.cos(angle - sweep), iy1 = cy + ir * Math.sin(angle - sweep);
    var ix2 = cx + ir * Math.cos(angle), iy2 = cy + ir * Math.sin(angle);
    segs.push('<path d="M' + x1.toFixed(2) + ',' + y1.toFixed(2) + ' A' + r + ',' + r + ' 0 ' + large + ',1 ' + x2.toFixed(2) + ',' + y2.toFixed(2) + ' L' + ix2.toFixed(2) + ',' + iy2.toFixed(2) + ' A' + ir + ',' + ir + ' 0 ' + large + ',0 ' + ix1.toFixed(2) + ',' + iy1.toFixed(2) + ' Z" fill="' + d.color + '" opacity="0.9"/>');
  }
  return segs.join("");
}

// ── DASHBOARD ─────────────────────────────────────────────
function renderDashboard(el_c, filtered, totalIn, totalOut, balance) {
  var positive = balance >= 0;
  var stats6 = getMonthlyStats(6);
  var maxBal = Math.max.apply(null, stats6.map(function(m) { return Math.abs(m.balance); }).concat([1]));
  var totalPending = debts.filter(function(d) { return d.paid < d.total; }).reduce(function(s,d) { return s + (d.total - d.paid); }, 0);
  var totalSaved = goals.reduce(function(s,g) { return s + (g.saved||0); }, 0);

  var byCat = CATS.gasto.map(function(cat, i) {
    return { cat: cat, total: filtered.filter(function(t) { return t.tipo === "gasto" && t.categoria === cat; }).reduce(function(s,t) { return s + t.monto; }, 0), color: CATCOLORS[i % CATCOLORS.length] };
  }).filter(function(x) { return x.total > 0; }).sort(function(a,b) { return b.total - a.total; });
  var maxCat = byCat.length ? byCat[0].total : 1;
  var recent = filtered.slice().sort(function(a,b) { return new Date(b.fecha) - new Date(a.fecha); }).slice(0, 5);

  var h = "";

  // Balance card
  var bgCard = positive ? "linear-gradient(135deg,#0a2a1a,#0d1f30)" : "linear-gradient(135deg,#2a0a0a,#1a0d0d)";
  var bdrCard = positive ? "#1a4030" : "#401a1a";
  h += '<div style="background:' + bgCard + ';border:1px solid ' + bdrCard + ';border-radius:18px;padding:20px;margin-bottom:12px">';
  h += '<div style="font-size:11px;color:#666;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">Balance del mes</div>';
  h += '<div style="font-size:32px;font-weight:700;color:' + (positive ? "#4ade80" : "#f87171") + ';margin-bottom:14px">' + fmt(balance) + '</div>';
  h += '<div style="display:flex;gap:12px">';
  h += '<div style="flex:1"><div style="font-size:10px;color:#4ade80;letter-spacing:.07em;margin-bottom:3px">INGRESOS</div><div style="font-size:13px">' + fmt(totalIn) + '</div></div>';
  h += '<div style="width:1px;background:#2a2a3a"></div>';
  h += '<div style="flex:1;padding-left:14px"><div style="font-size:10px;color:#f87171;letter-spacing:.07em;margin-bottom:3px">GASTOS</div><div style="font-size:13px">' + fmt(totalOut) + '</div></div>';
  if (totalPending > 0) {
    h += '<div style="width:1px;background:#2a2a3a"></div>';
    h += '<div style="flex:1;padding-left:14px"><div style="font-size:10px;color:#fb923c;letter-spacing:.07em;margin-bottom:3px">DEUDAS</div><div style="font-size:13px;color:#fb923c">-' + fmt(totalPending) + '</div></div>';
  }
  h += '</div></div>';

  // Barras 6 meses
  h += '<div class="card" style="padding:14px 16px;margin-bottom:12px">';
  h += '<div class="slabel">Evolución — últimos 6 meses</div>';
  h += '<div style="display:flex;align-items:flex-end;gap:4px">';
  for (var i = 0; i < stats6.length; i++) {
    var m = stats6[i];
    var isPos = m.balance >= 0;
    var hpx = Math.max(Math.round((Math.abs(m.balance) / maxBal) * 52), 3);
    var barBg = isPos ? "linear-gradient(180deg,#34d399,#4ade80)" : "linear-gradient(180deg,#f87171,#ef4444)";
    h += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">';
    h += '<div style="font-size:9px;color:' + (isPos ? "#4ade80" : "#f87171") + '">' + fmtShort(m.balance) + '</div>';
    h += '<div style="width:100%;height:' + hpx + 'px;border-radius:4px 4px 2px 2px;background:' + barBg + '"></div>';
    h += '<div style="font-size:9px;color:#444">' + m.label + '</div>';
    h += '</div>';
  }
  h += '</div></div>';

  // Distribución
  var total = totalIn + totalOut;
  if (total > 0) {
    var pIn = Math.round((totalIn / total) * 100);
    h += '<div class="card" style="padding:14px 16px;margin-bottom:12px">';
    h += '<div class="slabel">Distribución del mes</div>';
    h += '<div style="height:8px;border-radius:8px;background:#1e1e2e;overflow:hidden;display:flex;margin-bottom:8px">';
    if (totalIn > 0) h += '<div style="width:' + pIn + '%;background:linear-gradient(90deg,#34d399,#4ade80)"></div>';
    if (totalOut > 0) h += '<div style="flex:1;background:linear-gradient(90deg,#f87171,#ef4444)"></div>';
    h += '</div>';
    h += '<div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:#4ade80">↑ Ingresos ' + pIn + '%</span><span style="color:#f87171">↓ Gastos ' + (100 - pIn) + '%</span></div>';
    h += '</div>';
  }

  // Top categorías
  if (byCat.length) {
    h += '<div class="card" style="padding:14px 16px;margin-bottom:12px">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
    h += '<div class="slabel" style="margin-bottom:0">Top gastos</div>';
    h += '<button onclick="setView(\'analysis\')" style="font-size:12px;color:#a78bfa;background:none;border:none;cursor:pointer">Ver análisis →</button>';
    h += '</div>';
    for (var i = 0; i < Math.min(byCat.length, 5); i++) {
      var d = byCat[i];
      var w = Math.round((d.total / maxCat) * 100);
      var over = budgets[d.cat] && d.total > budgets[d.cat];
      h += '<div style="margin-bottom:10px">';
      h += '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;align-items:center">';
      h += '<span>' + ic(d.cat) + ' ' + d.cat + '</span>';
      h += '<div style="display:flex;align-items:center;gap:8px">';
      if (over) h += '<span style="font-size:10px;background:rgba(248,113,113,.15);color:#f87171;padding:1px 6px;border-radius:5px">⚠ Límite</span>';
      h += '<span style="font-size:13px">' + fmt(d.total) + '</span></div></div>';
      h += '<div style="height:5px;border-radius:5px;background:#1e1e2e"><div style="height:100%;border-radius:5px;width:' + w + '%;background:' + (over ? "#f87171" : d.color) + '"></div></div>';
      h += '</div>';
    }
    h += '</div>';
  }

  // Últimas tx
  h += '<div class="card" style="padding:14px 16px;margin-bottom:12px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
  h += '<div class="slabel" style="margin-bottom:0">Últimas transacciones</div>';
  if (filtered.length > 5) h += '<button onclick="setView(\'history\')" style="font-size:12px;color:#a78bfa;background:none;border:none;cursor:pointer">Ver todas →</button>';
  h += '</div>';
  if (!recent.length) {
    h += '<div style="text-align:center;padding:24px;color:#444">Sin transacciones este mes.<br>';
    h += '<button onclick="setView(\'add\')" style="margin-top:12px;background:#1e1e2e;border:1px solid #2a2a3a;color:#888;border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer">Agregar una</button></div>';
  } else {
    for (var i = 0; i < recent.length; i++) {
      var tx = recent[i];
      var col = tx.tipo === "ingreso" ? "#4ade80" : "#f87171";
      var bg  = tx.tipo === "ingreso" ? "rgba(74,222,128,.1)" : "rgba(248,113,113,.1)";
      h += '<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid #1a1a2a">';
      h += '<div style="width:40px;height:40px;border-radius:12px;background:' + bg + ';display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0">' + ic(tx.categoria) + '</div>';
      h += '<div style="flex:1;min-width:0">';
      h += '<div style="font-weight:500;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(tx.descripcion) + '</div>';
      h += '<div style="font-size:12px;color:#555;margin-top:2px">' + tx.categoria + ' · ' + fmtDate(tx.fecha) + '</div>';
      if (tx.nota) h += '<div style="font-size:11px;color:#667;font-style:italic;margin-top:2px">' + esc(tx.nota) + '</div>';
      h += '</div>';
      h += '<div style="font-size:15px;font-weight:600;color:' + col + ';flex-shrink:0">' + (tx.tipo === "ingreso" ? "+" : "-") + fmt(tx.monto) + '</div>';
      h += '<button onclick="askDeleteTx(' + tx.id + ')" style="background:none;color:#444;font-size:18px;padding:4px 4px 4px 8px;border:none;cursor:pointer">×</button>';
      h += '</div>';
    }
  }
  h += '</div>';

  el_c.innerHTML = h;
}

// ── ANÁLISIS ──────────────────────────────────────────────
function renderAnalysis(el_c, filtered, totalIn, totalOut, balance) {
  var tabs = [
    { id:"gastos",      label:"🍩 Distribución" },
    { id:"tendencia",   label:"📈 Tendencia" },
    { id:"comparar",    label:"📊 Comparar" },
    { id:"presupuesto", label:"🎯 Presupuesto" }
  ];
  var h = '<div style="display:flex;background:#0a0a0f;border-radius:12px;padding:3px;border:1px solid #1e1e2e;margin-bottom:16px">';
  for (var i = 0; i < tabs.length; i++) {
    var t = tabs[i];
    var isActive = analysisTab === t.id;
    h += '<button onclick="setAnalysisTab(\'' + t.id + '\')" style="flex:1;padding:9px 4px;border-radius:9px;font-weight:700;font-size:11px;text-align:center;background:' + (isActive ? "#16161e" : "transparent") + ';color:' + (isActive ? "#a78bfa" : "#555") + ';border:none;cursor:pointer">' + t.label + '</button>';
  }
  h += '</div>';

  if      (analysisTab === "gastos")      h += renderDistTab(filtered, totalOut);
  else if (analysisTab === "tendencia")   h += renderTrendTab();
  else if (analysisTab === "comparar")    h += renderCompareTab();
  else                                    h += renderBudgetTab(filtered);

  el_c.innerHTML = h;
}
function setAnalysisTab(t) { analysisTab = t; render(); }

function renderDistTab(filtered, totalOut) {
  var byCat = CATS.gasto.map(function(cat, i) {
    return { cat: cat, total: filtered.filter(function(t) { return t.tipo === "gasto" && t.categoria === cat; }).reduce(function(s,t) { return s + t.monto; }, 0), color: CATCOLORS[i % CATCOLORS.length] };
  }).filter(function(x) { return x.total > 0; }).sort(function(a,b) { return b.total - a.total; });

  if (!byCat.length) return '<div class="card"><div style="text-align:center;padding:36px;color:#444">Sin datos de gastos este mes.</div></div>';

  var size = 220, cx = size/2, cy = size/2, r = 80, thick = 32;
  var donutData = byCat.map(function(d) { return { value: d.total, color: d.color }; });
  var donut = buildDonut(donutData, cx, cy, r, thick);

  var h = '<div class="card">';
  h += '<div class="slabel">Distribución de gastos</div>';
  h += '<div style="display:flex;align-items:center;gap:16px">';
  h += '<div style="flex-shrink:0">';
  h += '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + (size/1.5) + '" height="' + (size/1.5) + '">';
  h += donut;
  h += '<text x="' + cx + '" y="' + (cy - 8) + '" text-anchor="middle" font-size="11" fill="#555">TOTAL</text>';
  h += '<text x="' + cx + '" y="' + (cy + 12) + '" text-anchor="middle" font-size="16" font-weight="700" fill="#f87171">' + fmtShort(totalOut) + '</text>';
  h += '</svg></div>';
  h += '<div style="display:flex;flex-direction:column;gap:6px;flex:1;min-width:0">';
  for (var i = 0; i < byCat.length; i++) {
    var d = byCat[i];
    var pct = Math.round((d.total / totalOut) * 100);
    h += '<div style="display:flex;align-items:center;gap:8px;font-size:13px">';
    h += '<div style="width:10px;height:10px;border-radius:3px;flex-shrink:0;background:' + d.color + '"></div>';
    h += '<div style="flex:1;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + ic(d.cat) + ' ' + d.cat + '</div>';
    h += '<div style="font-size:13px">' + fmtShort(d.total) + '<span style="font-size:11px;color:#555;margin-left:4px">' + pct + '%</span></div>';
    h += '</div>';
  }
  h += '</div></div>';

  // Barra de detalle
  h += '<div style="margin-top:16px">';
  for (var i = 0; i < byCat.length; i++) {
    var d = byCat[i];
    var pct = Math.round((d.total / totalOut) * 100);
    h += '<div style="margin-bottom:10px">';
    h += '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">';
    h += '<span>' + ic(d.cat) + ' ' + d.cat + '</span>';
    h += '<span>' + fmt(d.total) + ' <span style="color:#555;font-size:11px">(' + pct + '%)</span></span>';
    h += '</div>';
    h += '<div style="height:5px;border-radius:5px;background:#1e1e2e"><div style="height:100%;border-radius:5px;width:' + pct + '%;background:' + d.color + '"></div></div>';
    h += '</div>';
  }
  h += '</div></div>';
  return h;
}

function renderTrendTab() {
  var stats = getMonthlyStats(6);
  if (!stats.some(function(m) { return m.inc > 0 || m.exp > 0; }))
    return '<div class="card"><div style="text-align:center;padding:36px;color:#444">Sin datos suficientes.</div></div>';

  var maxVal = Math.max.apply(null, stats.map(function(m) { return Math.max(m.inc, m.exp); }).concat([1]));
  var W = 300, H = 100, pad = 12;
  function toX(i) { return pad + (i / (stats.length - 1)) * (W - 2 * pad); }
  function toY(v) { return H - pad - ((v / maxVal) * (H - 2 * pad)); }

  var incPts = stats.map(function(m, i) { return toX(i).toFixed(1) + "," + toY(m.inc).toFixed(1); }).join(" ");
  var expPts = stats.map(function(m, i) { return toX(i).toFixed(1) + "," + toY(m.exp).toFixed(1); }).join(" ");
  var incArea = "M" + toX(0).toFixed(1) + "," + H + " " + stats.map(function(m,i) { return "L" + toX(i).toFixed(1) + "," + toY(m.inc).toFixed(1); }).join(" ") + " L" + toX(stats.length-1).toFixed(1) + "," + H + " Z";
  var expArea = "M" + toX(0).toFixed(1) + "," + H + " " + stats.map(function(m,i) { return "L" + toX(i).toFixed(1) + "," + toY(m.exp).toFixed(1); }).join(" ") + " L" + toX(stats.length-1).toFixed(1) + "," + H + " Z";

  var h = '<div class="card">';
  h += '<div class="slabel">Ingresos vs Gastos — 6 meses</div>';
  h += '<svg viewBox="0 0 ' + W + ' ' + (H+24) + '" width="100%">';
  h += '<path d="' + incArea + '" fill="#4ade80" opacity="0.1"/>';
  h += '<path d="' + expArea + '" fill="#f87171" opacity="0.1"/>';
  h += '<polyline points="' + incPts + '" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  h += '<polyline points="' + expPts + '" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  for (var i = 0; i < stats.length; i++) {
    h += '<circle cx="' + toX(i).toFixed(1) + '" cy="' + toY(stats[i].inc).toFixed(1) + '" r="3" fill="#4ade80"/>';
    h += '<circle cx="' + toX(i).toFixed(1) + '" cy="' + toY(stats[i].exp).toFixed(1) + '" r="3" fill="#f87171"/>';
    h += '<text x="' + toX(i).toFixed(1) + '" y="' + (H+16) + '" text-anchor="middle" font-size="8" fill="#444">' + stats[i].label + '</text>';
  }
  h += '</svg>';
  h += '<div style="display:flex;gap:16px;margin-top:8px">';
  h += '<div style="display:flex;align-items:center;gap:6px"><div style="width:10px;height:3px;background:#4ade80;border-radius:2px"></div><span style="font-size:12px;color:#888">Ingresos</span></div>';
  h += '<div style="display:flex;align-items:center;gap:6px"><div style="width:10px;height:3px;background:#f87171;border-radius:2px"></div><span style="font-size:12px;color:#888">Gastos</span></div>';
  h += '</div></div>';

  // Barras de balance
  var maxBal = Math.max.apply(null, stats.map(function(m) { return Math.abs(m.balance); }).concat([1]));
  h += '<div class="card" style="margin-top:0">';
  h += '<div class="slabel">Balance mensual</div>';
  h += '<div style="display:flex;align-items:flex-end;gap:5px;height:80px">';
  for (var i = 0; i < stats.length; i++) {
    var m = stats[i];
    var isPos = m.balance >= 0;
    var hp = Math.max(Math.round((Math.abs(m.balance) / maxBal) * 70), 3);
    var barBg = isPos ? "linear-gradient(180deg,#34d399,#4ade80)" : "linear-gradient(180deg,#f87171,#ef4444)";
    h += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">';
    h += '<div style="font-size:8px;color:' + (isPos ? "#4ade80" : "#f87171") + '">' + fmtShort(m.balance) + '</div>';
    h += '<div style="width:100%;height:' + hp + 'px;border-radius:4px 4px 2px 2px;background:' + barBg + '"></div>';
    h += '<div style="font-size:8px;color:#444">' + m.label + '</div>';
    h += '</div>';
  }
  h += '</div></div>';

  // Resumen estadístico
  var avg6Inc = stats.reduce(function(s,m) { return s + m.inc; }, 0) / 6;
  var avg6Exp = stats.reduce(function(s,m) { return s + m.exp; }, 0) / 6;
  var avg6Bal = avg6Inc - avg6Exp;
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">';
  h += '<div class="card" style="margin-bottom:0;padding:14px"><div class="slabel">Ingreso promedio</div><div style="font-size:18px;font-weight:700;color:#4ade80">' + fmt(avg6Inc) + '</div><div style="font-size:11px;color:#555">6 meses</div></div>';
  h += '<div class="card" style="margin-bottom:0;padding:14px"><div class="slabel">Gasto promedio</div><div style="font-size:18px;font-weight:700;color:#f87171">' + fmt(avg6Exp) + '</div><div style="font-size:11px;color:#555">6 meses</div></div>';
  h += '<div class="card" style="margin-bottom:0;padding:14px"><div class="slabel">Ahorro promedio</div><div style="font-size:18px;font-weight:700;color:' + (avg6Bal >= 0 ? "#38bdf8" : "#fb923c") + '">' + fmt(avg6Bal) + '</div><div style="font-size:11px;color:#555">por mes</div></div>';
  h += '<div class="card" style="margin-bottom:0;padding:14px"><div class="slabel">Tasa de ahorro</div><div style="font-size:18px;font-weight:700;color:#a78bfa">' + (avg6Inc > 0 ? Math.round((avg6Bal / avg6Inc) * 100) : 0) + '%</div><div style="font-size:11px;color:#555">de ingresos</div></div>';
  h += '</div>';
  return h;
}

function renderCompareTab() {
  var stats = getMonthlyStats(6);
  if (!stats.some(function(m) { return m.inc > 0 || m.exp > 0; }))
    return '<div class="card"><div style="text-align:center;padding:36px;color:#444">Sin datos para comparar.</div></div>';
  var maxVal = Math.max.apply(null, stats.map(function(m) { return Math.max(m.inc, m.exp); }).concat([1]));
  var h = '<div class="card"><div class="slabel">Comparativa mensual</div>';
  for (var i = 0; i < stats.length; i++) {
    var m = stats[i];
    var wInc = Math.round((m.inc / maxVal) * 100);
    var wExp = Math.round((m.exp / maxVal) * 100);
    var isPos = m.balance >= 0;
    h += '<div style="margin-bottom:14px">';
    h += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">';
    h += '<span style="font-weight:600">' + m.label + ' ' + m.key.slice(0,4) + '</span>';
    h += '<span style="color:' + (isPos ? "#4ade80" : "#f87171") + '">' + (isPos ? "+" : "") + fmt(m.balance) + '</span>';
    h += '</div>';
    h += '<div style="height:8px;border-radius:4px;background:#1e1e2e;margin-bottom:3px;overflow:hidden"><div style="height:100%;width:' + wInc + '%;background:linear-gradient(90deg,#34d399,#4ade80);min-width:' + (m.inc > 0 ? 4 : 0) + 'px"></div></div>';
    h += '<div style="height:8px;border-radius:4px;background:#1e1e2e;margin-bottom:3px;overflow:hidden"><div style="height:100%;width:' + wExp + '%;background:linear-gradient(90deg,#f87171,#ef4444);min-width:' + (m.exp > 0 ? 4 : 0) + 'px"></div></div>';
    h += '<div style="font-size:11px;color:#555;display:flex;gap:12px"><span style="color:#4ade80">↑ ' + fmt(m.inc) + '</span><span style="color:#f87171">↓ ' + fmt(m.exp) + '</span></div>';
    h += '</div>';
  }
  h += '</div>';
  var withData = stats.filter(function(m) { return m.inc > 0 || m.exp > 0; });
  if (withData.length >= 2) {
    var best  = withData.reduce(function(a,b) { return b.balance > a.balance ? b : a; });
    var worst = withData.reduce(function(a,b) { return b.balance < a.balance ? b : a; });
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">';
    h += '<div class="card" style="margin-bottom:0;padding:14px"><div class="slabel">🏆 Mejor mes</div><div style="font-size:18px;font-weight:700;color:#4ade80">' + best.label + '</div><div style="font-size:11px;color:#555">' + fmt(best.balance) + '</div></div>';
    h += '<div class="card" style="margin-bottom:0;padding:14px"><div class="slabel">📉 Peor mes</div><div style="font-size:18px;font-weight:700;color:#f87171">' + worst.label + '</div><div style="font-size:11px;color:#555">' + fmt(worst.balance) + '</div></div>';
    h += '</div>';
  }
  return h;
}

function renderBudgetTab(filtered) {
  var h = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><div class="slabel" style="margin-bottom:0">Presupuestos mensuales</div><div style="font-size:11px;color:#555">Toca para editar</div></div>';
  for (var i = 0; i < CATS.gasto.length; i++) {
    var cat = CATS.gasto[i];
    var spent = filtered.filter(function(t) { return t.tipo === "gasto" && t.categoria === cat; }).reduce(function(s,t) { return s + t.monto; }, 0);
    var budget = budgets[cat];
    var pct = budget ? Math.min(Math.round((spent / budget) * 100), 100) : 0;
    var over = budget && spent > budget;
    var barColor = over ? "#f87171" : (pct > 80 ? "#fb923c" : CATCOLORS[i % CATCOLORS.length]);
    h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #1a1a2a;cursor:pointer" onclick="openBudgetModal(\'' + cat + '\')">';
    h += '<div style="flex:1"><div style="font-size:14px;font-weight:500;margin-bottom:3px">' + ic(cat) + ' ' + cat + '</div>';
    if (budget) h += '<div style="height:4px;background:#1e1e2e;border-radius:4px;margin-top:5px;overflow:hidden"><div style="height:100%;border-radius:4px;width:' + pct + '%;background:' + barColor + '"></div></div>';
    else h += '<div style="font-size:11px;color:#444;margin-top:4px">Sin límite — toca para fijar</div>';
    h += '</div>';
    h += '<div style="text-align:right;flex-shrink:0;margin-left:14px">';
    h += '<div style="font-size:14px;font-weight:700;color:' + (over ? "#f87171" : (spent > 0 ? "#f0f0f5" : "#444")) + '">' + (spent > 0 ? fmt(spent) : "$0") + '</div>';
    if (budget) h += '<div style="font-size:11px;color:#555">' + (over ? "⚠ " : "") + "de " + fmt(budget) + '</div>';
    h += '</div></div>';
  }
  h += '</div>';
  return h;
}

function openBudgetModal(cat) {
  openModal("Presupuesto — " + ic(cat) + " " + cat,
    '<div style="margin-bottom:13px"><label style="font-size:11px;color:#666;letter-spacing:.06em;text-transform:uppercase;display:block;margin-bottom:8px;font-weight:600">Límite mensual ($)</label>' +
    '<input id="budget-val" style="width:100%;background:#0a0a0f;border:1px solid #2a2a3a;border-radius:12px;padding:12px 14px;color:#f0f0f5;font-size:20px" type="number" min="0" step="1" placeholder="0 = sin límite" value="' + (budgets[cat] || "") + '" />' +
    '<div style="font-size:12px;color:#555;margin-top:6px">Deja en 0 o vacío para quitar el límite.</div></div>',
    "Guardar", "primary", "setBudget", { cat: cat });
  setTimeout(function() { var e = el("budget-val"); if (e) e.focus(); }, 100);
}

// ── DEUDAS ────────────────────────────────────────────────
function renderDebts(el_c) {
  var pending = debts.filter(function(d) { return d.paid < d.total; });
  var paid    = debts.filter(function(d) { return d.paid >= d.total; });
  var totalPending = pending.reduce(function(s,d) { return s + (d.total - d.paid); }, 0);
  var totalPaid    = paid.reduce(function(s,d) { return s + d.total; }, 0);
  var today = todayStr();
  var overdueCount = pending.filter(function(d) { return d.vencimiento && d.vencimiento < today; }).length;

  var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:13px">';
  h += '<div style="font-size:15px;font-weight:700">Mis deudas</div>';
  h += '<button onclick="openAddDebtModal()" style="background:linear-gradient(135deg,#f97316,#ef4444);color:#fff;border-radius:10px;padding:7px 13px;font-size:13px;font-weight:700;border:none;cursor:pointer">+ Nueva</button>';
  h += '</div>';

  h += '<div style="display:flex;gap:9px;margin-bottom:13px">';
  h += '<div class="card" style="flex:1;text-align:center;padding:13px;margin-bottom:0"><div class="slabel">Por pagar</div><div style="font-size:16px;font-weight:700;color:' + (totalPending > 0 ? "#fb923c" : "#4ade80") + '">' + fmt(totalPending) + '</div><div style="font-size:11px;color:#555;margin-top:3px">' + pending.length + ' deuda' + (pending.length !== 1 ? "s" : "") + '</div></div>';
  h += '<div class="card" style="flex:1;text-align:center;padding:13px;margin-bottom:0"><div class="slabel">Pagadas</div><div style="font-size:16px;font-weight:700;color:#4ade80">' + fmt(totalPaid) + '</div><div style="font-size:11px;color:#555;margin-top:3px">' + paid.length + ' deuda' + (paid.length !== 1 ? "s" : "") + '</div></div>';
  if (overdueCount > 0) h += '<div class="card" style="flex:1;text-align:center;padding:13px;margin-bottom:0;border-color:#4a1a1a;background:#1a0a0a"><div class="slabel" style="color:#f87171">Vencidas</div><div style="font-size:16px;font-weight:700;color:#f87171">' + overdueCount + '</div></div>';
  h += '</div>';

  if (!debts.length) {
    h += '<div class="card"><div style="text-align:center;padding:36px;color:#444"><div style="font-size:40px;margin-bottom:12px">💳</div>Sin deudas.<br>';
    h += '<button onclick="openAddDebtModal()" style="margin-top:13px;background:#2a1a0a;border:1px solid #4a3020;color:#fb923c;border-radius:9px;padding:9px 18px;font-size:13px;font-weight:600;cursor:pointer">Agregar primera</button></div></div>';
  } else {
    if (pending.length) {
      h += '<div class="slabel" style="margin-bottom:7px">POR PAGAR</div>';
      pending.sort(function(a, b) {
        var ao = a.vencimiento && a.vencimiento < today;
        var bo = b.vencimiento && b.vencimiento < today;
        if (ao && !bo) return -1; if (!ao && bo) return 1;
        return (a.vencimiento || "9") < (b.vencimiento || "9") ? -1 : 1;
      });
      for (var i = 0; i < pending.length; i++) {
        var d = pending[i];
        var remain = d.total - d.paid;
        var pct = Math.round((d.paid / d.total) * 100);
        var overdue = d.vencimiento && d.vencimiento < today;
        var soon = d.vencimiento && !overdue && d.vencimiento <= new Date(Date.now() + 7*864e5).toISOString().slice(0,10);
        var bgD = overdue ? "linear-gradient(135deg,#1a0808,#140a0a)" : "#16161e";
        var bdrD = overdue ? "#4a1a1a" : (soon ? "#4a3010" : "#2a2a3a");
        h += '<div style="border-radius:16px;padding:14px;margin-bottom:11px;display:flex;align-items:center;gap:12px;background:' + bgD + ';border:1px solid ' + bdrD + '">';
        h += '<div style="flex:1;min-width:0">';
        h += '<div style="display:flex;align-items:center;gap:7px;margin-bottom:5px">';
        h += '<div style="font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(d.name) + '</div>';
        if (overdue) h += '<span style="font-size:10px;background:rgba(248,113,113,.15);color:#f87171;padding:2px 6px;border-radius:5px;flex-shrink:0">VENCIDA</span>';
        else if (soon) h += '<span style="font-size:10px;background:rgba(251,146,60,.15);color:#fb923c;padding:2px 6px;border-radius:5px;flex-shrink:0">PRÓXIMA</span>';
        h += '</div>';
        h += '<div style="height:5px;border-radius:5px;background:#1e1e2e;margin-bottom:5px;overflow:hidden"><div style="height:100%;border-radius:5px;width:' + pct + '%;background:' + (overdue ? "linear-gradient(90deg,#f87171,#ef4444)" : "linear-gradient(90deg,#fb923c,#f97316)") + '"></div></div>';
        h += '<div style="display:flex;justify-content:space-between;font-size:11px;color:#555"><span>Pagado ' + fmt(d.paid) + ' (' + pct + '%)</span><span>' + (d.vencimiento ? fmtDate(d.vencimiento) : (d.categoria || "General")) + '</span></div>';
        h += '</div>';
        h += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:7px;flex-shrink:0;margin-left:12px">';
        h += '<div style="text-align:right"><div style="font-weight:700;font-size:16px;color:' + (overdue ? "#f87171" : "#fb923c") + '">-' + fmt(remain) + '</div><div style="font-size:11px;color:#555">de ' + fmt(d.total) + '</div></div>';
        h += '<div style="display:flex;gap:5px">';
        h += '<button onclick="openPayDebtModal(' + d.id + ')" style="background:linear-gradient(135deg,#f97316,#ef4444);color:#fff;border-radius:8px;padding:6px 11px;font-size:12px;font-weight:700;border:none;cursor:pointer">Pagar</button>';
        h += '<button onclick="askDeleteDebt(' + d.id + ')" style="background:#1e1e2e;color:#444;border:1px solid #2a2a3a;border-radius:8px;padding:6px 8px;font-size:13px;cursor:pointer">✕</button>';
        h += '</div></div></div>';
      }
    }
    if (paid.length) {
      h += '<div class="slabel" style="margin-top:14px;margin-bottom:7px">PAGADAS ✓</div>';
      for (var i = 0; i < paid.length; i++) {
        var d = paid[i];
        h += '<div style="border-radius:16px;padding:14px;margin-bottom:11px;display:flex;align-items:center;gap:12px;background:#0d160d;border:1px solid #1a3020;opacity:.7">';
        h += '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:15px;color:#4ade80;text-decoration:line-through">' + esc(d.name) + '</div><div style="font-size:12px;color:#3a6a3a;margin-top:3px">' + (d.categoria || "General") + '</div></div>';
        h += '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0"><div style="font-size:15px;color:#4ade80">' + fmt(d.total) + '</div><button onclick="askDeleteDebt(' + d.id + ')" style="background:none;color:#333;font-size:16px;border:none;cursor:pointer">✕</button></div>';
        h += '</div>';
      }
    }
  }
  el_c.innerHTML = h;
}

function openAddDebtModal() {
  openModal("Nueva deuda",
    '<div style="margin-bottom:13px"><label class="form-label">Nombre</label><input id="d-name" class="form-input" placeholder="Ej: Tarjeta, Préstamo..." /></div>' +
    '<div style="margin-bottom:13px"><label class="form-label">Monto total ($)</label><input id="d-total" class="form-input" type="number" min="0.01" step="1" placeholder="0" style="font-size:18px" /></div>' +
    '<div style="margin-bottom:13px"><label class="form-label">Vencimiento (opcional)</label><input id="d-venc" class="form-input" type="date" style="color:#ccc" /></div>' +
    '<div style="margin-bottom:13px"><label class="form-label">Categoría</label><select id="d-cat" class="form-input"><option>Tarjeta de crédito</option><option>Préstamo personal</option><option>Hipoteca</option><option>Auto</option><option>Servicios</option><option>Familiar</option><option>General</option></select></div>',
    "Agregar", "primary", "addDebt", {});
}
function openPayDebtModal(id) {
  var d = debts.find(function(d) { return d.id === id; });
  var remain = d.total - d.paid;
  openModal("Pagar — " + esc(d.name),
    '<div style="margin-bottom:13px"><label class="form-label">Monto a pagar ($)</label><input id="d-pay" class="form-input" type="number" min="0.01" step="1" placeholder="0" style="font-size:20px" /><div style="font-size:12px;color:#666;margin-top:6px">Pendiente: <strong style="color:#fb923c">' + fmt(remain) + '</strong></div></div>',
    "Registrar pago", "primary", "payDebt", { id: id });
}
function askDeleteDebt(id) {
  var d = debts.find(function(d) { return d.id === id; });
  openModal("¿Eliminar deuda?", '<div style="color:#888;font-size:14px">Se eliminará <strong style="color:#f0f0f5">"' + esc(d.name) + '"</strong>.</div>', "Eliminar", "danger", "deleteDebt", { id: id });
}

// ── AHORRO ────────────────────────────────────────────────
function renderSavings(el_c) {
  var fc = getForecast();
  var totalSaved = goals.reduce(function(s,g) { return s + (g.saved||0); }, 0);
  var h = "";

  h += '<div class="card" style="background:linear-gradient(135deg,#0a1a2a,#0d0f2a);border-color:#1a2a4a">';
  h += '<div class="slabel" style="color:#4a6a8a">Previsión de ahorro — 6 meses</div>';
  if (!fc) {
    h += '<div style="text-align:center;padding:20px 0;color:#444;font-size:14px">Registra ingresos y gastos para ver tu previsión.</div>';
  } else {
    h += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">';
    h += '<div><div style="font-size:11px;color:#4a6a8a;margin-bottom:3px">AHORRO/MES EST.</div><div style="font-size:24px;font-weight:700;color:' + (fc.avgSave >= 0 ? "#38bdf8" : "#f87171") + '">' + fmt(fc.avgSave) + '</div></div>';
    h += '<div style="text-align:right"><div style="font-size:11px;color:#4a6a8a;margin-bottom:3px">EN 6 MESES</div><div style="font-size:18px;font-weight:700;color:' + (fc.avgSave * 6 >= 0 ? "#818cf8" : "#f87171") + '">' + fmt(fc.avgSave * 6) + '</div></div>';
    h += '</div>';
    var maxP = Math.max.apply(null, fc.forecast.map(function(f) { return Math.abs(f.projected); }).concat([1]));
    h += '<div style="display:flex;align-items:flex-end;gap:5px;height:80px;margin:12px 0 6px">';
    for (var i = 0; i < fc.forecast.length; i++) {
      var f = fc.forecast[i];
      var hp = Math.max(Math.round((Math.abs(f.projected) / maxP) * 70), 4);
      var color = f.projected >= 0 ? "#818cf8" : "#f87171";
      h += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">';
      h += '<div style="font-size:9px;color:#888">' + fmtShort(f.projected) + '</div>';
      h += '<div style="width:100%;height:' + hp + 'px;border-radius:6px 6px 2px 2px;background:' + color + '"></div>';
      h += '<div style="font-size:9px;color:#555">' + f.month + '</div>';
      h += '</div>';
    }
    h += '</div>';
    if (fc.avgSave > 0) {
      var savePct = fc.avgInc > 0 ? Math.round((fc.avgSave / fc.avgInc) * 100) : 0;
      h += '<div style="display:flex;align-items:flex-start;gap:10px;background:#0f1a2a;border:1px solid #1a3050;border-radius:12px;padding:12px 14px">';
      h += '<div style="font-size:19px;flex-shrink:0">💡</div>';
      h += '<div style="font-size:13px;color:#8ab4d4;line-height:1.5">Ahorras <strong>' + savePct + '% de tus ingresos</strong> cada mes. En 6 meses: <strong>' + fmt(fc.avgSave * 6) + '</strong>.</div>';
      h += '</div>';
    } else if (fc.avgSave < 0) {
      h += '<div style="display:flex;align-items:flex-start;gap:10px;background:#1a0a0a;border:1px solid #4a1a1a;border-radius:12px;padding:12px 14px">';
      h += '<div style="font-size:19px;flex-shrink:0">⚠️</div>';
      h += '<div style="font-size:13px;color:#c49a8a;line-height:1.5">Gastos superan ingresos en <strong style="color:#f87171">' + fmt(Math.abs(fc.avgSave)) + '/mes</strong>.</div>';
      h += '</div>';
    }
  }
  h += '</div>';

  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:11px;margin-top:2px">';
  h += '<div style="font-size:15px;font-weight:700">Metas de ahorro</div>';
  h += '<button onclick="openNewGoalModal()" style="background:linear-gradient(135deg,#6366f1,#a78bfa);color:#fff;border-radius:10px;padding:7px 13px;font-size:13px;font-weight:700;border:none;cursor:pointer">+ Nueva meta</button>';
  h += '</div>';

  if (!goals.length) {
    h += '<div class="card"><div style="text-align:center;padding:36px;color:#444"><div style="font-size:40px;margin-bottom:12px">🏦</div>Sin metas aún.<br>';
    h += '<button onclick="openNewGoalModal()" style="margin-top:13px;background:#1e1e3a;border:1px solid #2a2a4a;color:#a78bfa;border-radius:9px;padding:9px 18px;font-size:13px;font-weight:600;cursor:pointer">Crear primera meta</button></div></div>';
  } else {
    for (var i = 0; i < goals.length; i++) {
      var g = goals[i];
      var saved = g.saved || 0;
      var pct = Math.min(Math.round((saved / g.target) * 100), 100);
      var remain = Math.max(g.target - saved, 0);
      var done = saved >= g.target;
      var eta = "";
      if (fc && fc.avgSave > 0 && !done) {
        var months = Math.ceil(remain / fc.avgSave);
        eta = '<span style="color:#38bdf8;font-size:11px;margin-left:6px">~' + months + ' mes' + (months !== 1 ? "es" : "") + '</span>';
      } else if (done) {
        eta = '<span style="color:#4ade80;font-size:11px;margin-left:6px">✓ Completada</span>';
      }
      h += '<div class="card">';
      h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:11px">';
      h += '<div style="display:flex;align-items:center;gap:10px"><div style="font-size:26px">' + g.emoji + '</div>';
      h += '<div><div style="font-weight:700;font-size:15px">' + esc(g.name) + eta + '</div><div style="font-size:12px;color:#555;margin-top:2px">' + pct + '% completado</div></div></div>';
      h += '<button onclick="askDeleteGoal(' + g.id + ')" style="background:none;color:#444;border:1px solid #2a2a3a;border-radius:9px;padding:8px 11px;font-size:13px;cursor:pointer">✕</button>';
      h += '</div>';
      h += '<div style="height:8px;border-radius:8px;background:#1e1e2e;margin-bottom:7px;overflow:hidden"><div style="height:100%;border-radius:8px;width:' + pct + '%;background:' + (done ? "linear-gradient(90deg,#34d399,#4ade80)" : "linear-gradient(90deg,#38bdf8,#818cf8)") + '"></div></div>';
      h += '<div style="display:flex;justify-content:space-between;font-size:12px;color:#666;margin-bottom:9px">';
      h += '<div><div style="font-size:10px;color:#555;margin-bottom:2px">AHORRADO</div><div style="font-size:13px;color:#38bdf8">' + fmt(saved) + '</div></div>';
      h += '<div style="text-align:right"><div style="font-size:10px;color:#555;margin-bottom:2px">META</div><div style="font-size:13px">' + fmt(g.target) + '</div></div>';
      h += '</div>';
      h += '<div style="display:flex;gap:7px">';
      h += '<button onclick="openDepositModal(' + g.id + ', false)" style="flex:1;padding:8px;border-radius:9px;font-size:13px;font-weight:600;background:#1e1e2e;color:#a78bfa;border:1px solid #2a2a3a;cursor:pointer">＋ Depositar</button>';
      if (saved > 0) h += '<button onclick="openDepositModal(' + g.id + ', true)" style="flex:1;padding:8px;border-radius:9px;font-size:13px;font-weight:600;background:rgba(248,113,113,.07);color:#f87171;border:1px solid #3a1a1a;cursor:pointer">− Retirar</button>';
      h += '</div></div>';
    }
  }
  el_c.innerHTML = h;
}

function openNewGoalModal() {
  openModal("Nueva meta de ahorro",
    '<div style="margin-bottom:13px"><label class="form-label">Nombre</label><input id="mg-name" class="form-input" placeholder="Ej: Viaje, Auto, Casa..." /></div>' +
    '<div style="margin-bottom:13px"><label class="form-label">Monto objetivo ($)</label><input id="mg-target" class="form-input" type="number" min="1" placeholder="0" style="font-size:18px" /></div>',
    "Crear meta", "primary", "addGoal", {});
}
function openDepositModal(id, isW) {
  var g = goals.find(function(g) { return g.id === id; });
  openModal((isW ? 'Retirar de "' : 'Depositar en "') + esc(g.name) + '"',
    '<div style="margin-bottom:13px"><label class="form-label">' + (isW ? "Monto a retirar" : "Monto a depositar") + ' ($)</label><input id="mg-deposit" class="form-input" type="number" min="0.01" step="1" placeholder="0" style="font-size:20px" />' + (isW ? '<div style="font-size:12px;color:#666;margin-top:6px">Disponible: ' + fmt(g.saved || 0) + '</div>' : '') + '</div>',
    isW ? "Retirar" : "Depositar", isW ? "danger" : "primary", isW ? "withdraw" : "deposit", { id: id });
}
function askDeleteGoal(id) {
  var g = goals.find(function(g) { return g.id === id; });
  openModal("¿Eliminar meta?", '<div style="color:#888;font-size:14px">Se eliminará <strong style="color:#f0f0f5">"' + esc(g.name) + '"</strong>.</div>', "Eliminar", "danger", "deleteGoal", { id: id });
}
function askDeleteTx(id) {
  openModal("¿Eliminar transacción?", '<div style="color:#888;font-size:14px">Esta acción no se puede deshacer.</div>', "Eliminar", "danger", "deleteTx", { id: id });
}

// ── FORMULARIO ────────────────────────────────────────────
function renderAdd(el_c) {
  var isIn = form.tipo === "ingreso";
  var cats = CATS[form.tipo];
  var grad = isIn ? "linear-gradient(135deg,#34d399,#059669)" : "linear-gradient(135deg,#f87171,#dc2626)";
  var h = '<div class="card">';
  h += '<div style="display:flex;background:#0a0a0f;border-radius:12px;padding:4px;border:1px solid #1e1e2e;margin-bottom:18px">';
  h += '<button onclick="setFormTipo(\'gasto\')" style="flex:1;padding:10px;border-radius:9px;font-weight:700;font-size:15px;border:none;cursor:pointer;background:' + (!isIn ? "rgba(248,113,113,.15)" : "transparent") + ';color:' + (!isIn ? "#f87171" : "#555") + '">↓ Gasto</button>';
  h += '<button onclick="setFormTipo(\'ingreso\')" style="flex:1;padding:10px;border-radius:9px;font-weight:700;font-size:15px;border:none;cursor:pointer;background:' + (isIn ? "rgba(74,222,128,.15)" : "transparent") + ';color:' + (isIn ? "#4ade80" : "#555") + '">↑ Ingreso</button>';
  h += '</div>';
  h += '<div style="margin-bottom:16px"><label class="form-label">Descripción</label><input class="form-input" id="f-desc" type="text" placeholder="Ej: Renta, Cena, Salario..." value="' + esc(form.descripcion) + '" oninput="form.descripcion=this.value" /></div>';
  h += '<div style="margin-bottom:16px"><label class="form-label">Monto ($)</label><input class="form-input" id="f-monto" type="number" min="0" step="1" placeholder="0" style="font-size:20px" value="' + form.monto + '" oninput="form.monto=this.value" /></div>';
  h += '<div style="margin-bottom:16px"><label class="form-label">Categoría</label><div style="display:flex;flex-wrap:wrap;gap:7px">';
  for (var i = 0; i < cats.length; i++) {
    var cat = cats[i];
    var isSel = form.categoria === cat;
    h += '<button onclick="setFormCat(\'' + cat + '\')" style="padding:7px 12px;border-radius:9px;font-size:13px;font-weight:500;cursor:pointer;background:' + (isSel ? "#1e1e3a" : "#0a0a0f") + ';color:' + (isSel ? "#a78bfa" : "#555") + ';border:1px solid ' + (isSel ? "#4c3d9a" : "#1a1a2a") + '">' + ic(cat) + ' ' + cat + '</button>';
  }
  h += '</div></div>';
  h += '<div style="margin-bottom:16px"><label class="form-label">Fecha</label><input class="form-input" id="f-fecha" type="date" value="' + form.fecha + '" style="color:#ccc" oninput="form.fecha=this.value" /></div>';
  h += '<div style="margin-bottom:20px"><label class="form-label">Nota (opcional)</label><input class="form-input" id="f-nota" type="text" placeholder="Comentario..." value="' + esc(form.nota || "") + '" oninput="form.nota=this.value" /></div>';
  h += '<button onclick="submitForm()" style="width:100%;padding:15px;border-radius:14px;font-weight:700;font-size:17px;color:#fff;border:none;cursor:pointer;background:' + grad + '">Registrar ' + (isIn ? "ingreso" : "gasto") + '</button>';
  h += '</div>';
  el_c.innerHTML = h;
}

function setFormTipo(t) { form.tipo = t; form.categoria = CATS[t][0]; renderAdd(el("content")); }
function setFormCat(c)  { form.categoria = c; renderAdd(el("content")); }
function submitForm() {
  var desc  = (el("f-desc")  ? el("f-desc").value  : form.descripcion).trim();
  var monto = parseFloat(el("f-monto") ? el("f-monto").value : form.monto);
  var fecha = el("f-fecha")  ? el("f-fecha").value  : form.fecha;
  var nota  = (el("f-nota")  ? el("f-nota").value   : "").trim();
  if (!desc || isNaN(monto) || monto <= 0) { showToast("Completa todos los campos", "err"); return; }
  if (form.tipo === "gasto" && budgets[form.categoria]) {
    var currentSpend = transactions.filter(function(t) { return t.tipo === "gasto" && t.categoria === form.categoria && t.fecha.startsWith(fecha.slice(0,7)); }).reduce(function(s,t) { return s + t.monto; }, 0);
    if (currentSpend + monto > budgets[form.categoria]) showToast("⚠ Superando presupuesto de " + form.categoria, "info");
  }
  transactions.unshift({ tipo: form.tipo, descripcion: desc, monto: monto, categoria: form.categoria, fecha: fecha, id: Date.now(), nota: nota });
  save("fin_tx", transactions);
  form.descripcion = ""; form.monto = ""; form.fecha = todayStr(); form.nota = "";
  showToast("¡Registrado! ✓");
  setView("dashboard");
}

// ── HISTORIAL ─────────────────────────────────────────────
function renderHistory(el_c, filtered) {
  var source = searchQuery ? transactions.filter(function(t) {
    return (t.descripcion || "").toLowerCase().includes(searchQuery) ||
           (t.categoria || "").toLowerCase().includes(searchQuery) ||
           (t.nota || "").toLowerCase().includes(searchQuery);
  }) : filtered;
  var sorted = source.slice().sort(function(a,b) { return new Date(b.fecha) - new Date(a.fecha); });
  var histFilter = load("fin_hist_filter", "todos");
  var final = histFilter === "todos" ? sorted : sorted.filter(function(t) { return t.tipo === histFilter; });

  var h = '<div style="display:flex;gap:6px;margin-bottom:14px;overflow-x:auto">';
  var ftypes = ["todos","ingreso","gasto"];
  var flabels = ["Todos","↑ Ingresos","↓ Gastos"];
  for (var i = 0; i < ftypes.length; i++) {
    var isA = histFilter === ftypes[i];
    h += '<button onclick="setHistFilter(\'' + ftypes[i] + '\')" style="padding:7px 14px;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap;cursor:pointer;background:' + (isA ? "#1e1e3a" : "#16161e") + ';color:' + (isA ? "#a78bfa" : "#555") + ';border:1px solid ' + (isA ? "#4c3d9a" : "#2a2a3a") + '">' + flabels[i] + '</button>';
  }
  h += '<div style="flex:1"></div><span style="font-size:12px;color:#555;padding:7px 0">' + final.length + ' resultados</span></div>';

  if (!final.length) {
    h += '<div style="text-align:center;padding:36px;color:#444"><div style="font-size:40px;margin-bottom:12px">📂</div>' + (searchQuery ? "Sin resultados." : "Sin transacciones.") + '</div>';
  } else {
    var byDate = {};
    for (var i = 0; i < final.length; i++) {
      var tx = final[i];
      if (!byDate[tx.fecha]) byDate[tx.fecha] = [];
      byDate[tx.fecha].push(tx);
    }
    var dates = Object.keys(byDate).sort(function(a,b) { return b.localeCompare(a); });
    for (var di = 0; di < dates.length; di++) {
      var date = dates[di];
      var dayTxs = byDate[date];
      var dayTotal = dayTxs.reduce(function(s,t) { return s + (t.tipo === "ingreso" ? t.monto : -t.monto); }, 0);
      h += '<div style="display:flex;justify-content:space-between;align-items:center;margin:12px 2px 6px">';
      h += '<div style="font-size:12px;color:#555;font-weight:600">' + fmtDate(date) + '</div>';
      h += '<div style="font-size:12px;color:' + (dayTotal >= 0 ? "#4ade80" : "#f87171") + '">' + (dayTotal >= 0 ? "+" : "") + fmt(dayTotal) + '</div>';
      h += '</div>';
      for (var ti = 0; ti < dayTxs.length; ti++) {
        var tx = dayTxs[ti];
        var col = tx.tipo === "ingreso" ? "#4ade80" : "#f87171";
        var bg  = tx.tipo === "ingreso" ? "rgba(74,222,128,.1)" : "rgba(248,113,113,.1)";
        h += '<div style="background:#16161e;border:1px solid #2a2a3a;border-radius:14px;padding:13px 15px;margin-bottom:9px;display:flex;align-items:center;gap:12px">';
        h += '<div style="width:40px;height:40px;border-radius:12px;background:' + bg + ';display:flex;align-items:center;justify-content:center;font-size:21px;flex-shrink:0">' + ic(tx.categoria) + '</div>';
        h += '<div style="flex:1;min-width:0">';
        h += '<div style="font-weight:500;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(tx.descripcion) + '</div>';
        h += '<div style="font-size:12px;color:#555;margin-top:3px"><span style="background:' + bg + ';color:' + col + ';padding:1px 6px;border-radius:5px;font-size:11px">' + tx.categoria + '</span></div>';
        if (tx.nota) h += '<div style="font-size:11px;color:#667;font-style:italic;margin-top:3px">' + esc(tx.nota) + '</div>';
        h += '</div>';
        h += '<div style="text-align:right;flex-shrink:0">';
        h += '<div style="font-size:15px;font-weight:600;color:' + col + '">' + (tx.tipo === "ingreso" ? "+" : "-") + fmt(tx.monto) + '</div>';
        h += '<button onclick="askDeleteTx(' + tx.id + ')" style="background:none;color:#444;font-size:11px;margin-top:4px;border:none;cursor:pointer">Eliminar</button>';
        h += '</div></div>';
      }
    }
  }
  el_c.innerHTML = h;
}
function setHistFilter(f) { save("fin_hist_filter", f); render(); }

// ── TICKER ────────────────────────────────────────────────
function renderTicker() {
  var wrap  = el("ticker-wrap");
  var track = el("ticker-track");
  var bell  = el("ticker-bell");
  bell.className = reminderOn ? "on" : "off";
  var pending = debts.filter(function(d) { return d.paid < d.total; });
  if (!pending.length) { wrap.classList.remove("visible","urgent"); return; }
  var today = todayStr();
  var overdue = pending.filter(function(d) { return d.vencimiento && d.vencimiento < today; });
  var totalPending = pending.reduce(function(s,d) { return s + (d.total - d.paid); }, 0);
  var items = [];
  if (overdue.length) items.push({ text: "⚠ " + overdue.length + " deuda" + (overdue.length > 1 ? "s" : "") + " VENCIDA" + (overdue.length > 1 ? "S" : ""), color: "#f87171" });
  for (var i = 0; i < pending.length; i++) {
    items.push({ text: "💳 " + pending[i].name + ": -" + fmt(pending[i].total - pending[i].paid), color: "#fb923c" });
  }
  items.push({ text: "📊 Total pendiente: " + fmt(totalPending), color: "#a78bfa" });
  wrap.classList.toggle("urgent", overdue.length > 0);
  wrap.classList.add("visible");
  function makeItems() {
    return items.map(function(item) {
      return '<span style="display:inline-flex;align-items:center;gap:6px;padding:0 24px;font-size:11px;font-weight:600;color:' + item.color + '">' + item.text + '</span>';
    }).join("");
  }
  track.innerHTML = makeItems() + makeItems();
}
function toggleReminder() {
  reminderOn = !reminderOn;
  save("fin_reminder", reminderOn);
  showToast(reminderOn ? "🔔 Recordatorio activado" : "Recordatorio desactivado", reminderOn ? "ok" : "err");
  renderTicker();
}

// ── EXPORTAR / IMPORTAR ───────────────────────────────────
function exportExcel() {
  if (typeof XLSX === "undefined") { showToast("Librería XLSX no cargada", "err"); return; }
  var wb = XLSX.utils.book_new();
  var txData = [["ID","Tipo","Descripcion","Monto","Categoria","Fecha","Nota"]];
  for (var i = 0; i < transactions.length; i++) {
    var t = transactions[i];
    txData.push([t.id, t.tipo, t.descripcion, t.monto, t.categoria, t.fecha, t.nota||""]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(txData), "Transacciones");
  var debtData = [["ID","Nombre","Total","Pagado","Pendiente","Vencimiento","Categoria"]];
  for (var i = 0; i < debts.length; i++) {
    var d = debts[i];
    debtData.push([d.id, d.name, d.total, d.paid, d.total - d.paid, d.vencimiento||"", d.categoria||"General"]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(debtData), "Deudas");
  var goalsData = [["ID","Nombre","Meta","Ahorrado"]];
  for (var i = 0; i < goals.length; i++) {
    var g = goals[i];
    goalsData.push([g.id, g.name, g.target, g.saved||0]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(goalsData), "Metas");
  var budgetData = [["Categoria","Limite Mensual"]];
  var bkeys = Object.keys(budgets);
  for (var i = 0; i < bkeys.length; i++) budgetData.push([bkeys[i], budgets[bkeys[i]]]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(budgetData), "Presupuestos");
  XLSX.writeFile(wb, "finanzas_" + new Date().toISOString().slice(0,10) + ".xlsx");
  showToast("✅ Excel exportado");
}

function exportJSON() {
  var backup = { version: 2, exportDate: new Date().toISOString(), transactions: transactions, debts: debts, goals: goals, budgets: budgets };
  var blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "finanzas_backup_" + new Date().toISOString().slice(0,10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("✅ Backup guardado");
}

function handleImportFile(e) {
  var file = e.target.files[0]; if (!file) return; e.target.value = "";
  var ext = file.name.split(".").pop().toLowerCase();
  if (ext === "json") {
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var data = JSON.parse(ev.target.result);
        if (!data.transactions && !data.debts && !data.goals) { showToast("JSON inválido", "err"); return; }
        openModal("Importar backup",
          '<div style="color:#888;font-size:14px">Se encontraron: <strong style="color:#f0f0f5">' + (data.transactions||[]).length + '</strong> transacciones, <strong style="color:#f0f0f5">' + (data.debts||[]).length + '</strong> deudas, <strong style="color:#f0f0f5">' + (data.goals||[]).length + '</strong> metas.<br><br><strong style="color:#f87171">⚠ Reemplazará todos tus datos.</strong></div>',
          "Importar", "danger", "_importData", { importData: data });
      } catch(err) { showToast("Error leyendo JSON", "err"); }
    };
    reader.readAsText(file);
  } else if (ext === "xlsx" || ext === "xls") {
    if (typeof XLSX === "undefined") { showToast("Librería XLSX no cargada", "err"); return; }
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var wb = XLSX.read(ev.target.result, { type: "array" });
        var data = { transactions: [], debts: [], goals: [], budgets: {} };
        if (wb.SheetNames.indexOf("Transacciones") > -1) {
          data.transactions = XLSX.utils.sheet_to_json(wb.Sheets["Transacciones"]).map(function(r) {
            return { id: r.ID || Date.now() + Math.random(), tipo: r.Tipo || "gasto", descripcion: r.Descripcion || "", monto: parseFloat(r.Monto) || 0, categoria: r.Categoria || "Otro gasto", fecha: String(r.Fecha || "").slice(0,10) || todayStr(), nota: r.Nota || "" };
          }).filter(function(t) { return t.descripcion && t.monto > 0; });
        }
        if (wb.SheetNames.indexOf("Deudas") > -1) {
          data.debts = XLSX.utils.sheet_to_json(wb.Sheets["Deudas"]).map(function(r) {
            return { id: r.ID || Date.now() + Math.random(), name: r.Nombre || "", total: parseFloat(r.Total) || 0, paid: parseFloat(r.Pagado) || 0, vencimiento: String(r.Vencimiento || "").slice(0,10), categoria: r.Categoria || "General", pagos: [] };
          }).filter(function(d) { return d.name && d.total > 0; });
        }
        if (wb.SheetNames.indexOf("Metas") > -1) {
          data.goals = XLSX.utils.sheet_to_json(wb.Sheets["Metas"]).map(function(r) {
            return { id: r.ID || Date.now() + Math.random(), name: r.Nombre || "", emoji: "💰", target: parseFloat(r.Meta) || 0, saved: parseFloat(r.Ahorrado) || 0, deposits: [] };
          }).filter(function(g) { return g.name && g.target > 0; });
        }
        openModal("Importar desde Excel",
          '<div style="color:#888;font-size:14px">Se encontraron: <strong style="color:#f0f0f5">' + data.transactions.length + '</strong> tx, <strong style="color:#f0f0f5">' + data.debts.length + '</strong> deudas, <strong style="color:#f0f0f5">' + data.goals.length + '</strong> metas.<br><br><strong style="color:#f87171">⚠ Reemplazará todos tus datos.</strong></div>',
          "Importar", "danger", "_importData", { importData: data });
      } catch(err) { console.error(err); showToast("Error leyendo Excel", "err"); }
    };
    reader.readAsArrayBuffer(file);
  }
}

function confirmClearData() {
  openModal("¿Borrar todos los datos?",
    '<div style="color:#888;font-size:14px">Esta acción eliminará <strong style="color:#f87171">TODOS</strong> tus datos y no se puede deshacer.</div>',
    "Sí, borrar todo", "danger", "_clearAll", {});
}
