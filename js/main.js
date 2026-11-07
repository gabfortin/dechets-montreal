"use strict";

/* ===========================================================================
   Matières résiduelles Montréal — lit data/bilan-massique.json (produit par
   genTables.py) et dessine un graphique par territoire.
   Utilitaires repris d'artm-data/js/main.js (style D, DESIGN-PAGES.md).
   =========================================================================== */

/* Nombres à la française : virgule décimale, espace insécable pour les
   milliers, vrai signe moins « − » (U+2212) plutôt que le trait d'union. */
function minus(str) {
  return String(str).replace(/(^|[\s(  →])-(?=\d)/g, "$1−");
}
function fr(n, d = 0) {
  return minus(Number(n).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d }));
}
const tonnes = (n) => `${fr(n)} t`;
if (window.Chart) Chart.defaults.locale = "fr-CA";

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(minus(c)) : c);
  }
  return node;
}

/* « 2012 à 2019 », « Agglomération de Montréal, Ville de Montréal et Écocentres » */
function frList(items) {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}
function fill(key, text) {
  document.querySelectorAll(`[data-fill="${key}"]`).forEach((n) => { n.textContent = text; });
}
function dateLongue(iso) {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(a, m - 1, j).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
}

/* ===========================================================================
   Thème, impression, menu
   =========================================================================== */

const redrawCallbacks = [];
function registerRedraw(fn) { redrawCallbacks.push(fn); }
function redrawAll() { for (const fn of redrawCallbacks) fn(); }

function initTheme() {
  // Le thème suit l'appareil, sans bouton : les graphiques lisent leurs
  // couleurs dans le CSS et sont redessinés si l'appareil change de thème.
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  if (darkQuery.addEventListener) darkQuery.addEventListener("change", redrawAll);
  else if (darkQuery.addListener) darkQuery.addListener(redrawAll);
  // Impression : toujours en clair (papier blanc), tableaux construits et dépliés.
  window.addEventListener("beforeprint", () => {
    document.documentElement.classList.add("print-light");
    document.querySelectorAll(".table-toggle").forEach((btn) => btn._buildTable && btn._buildTable());
    redrawAll();
  });
  window.addEventListener("afterprint", () => { document.documentElement.classList.remove("print-light"); redrawAll(); });
}

/* Menu qui suit la lecture + lien direct vers chaque section */
function initNavEnhancements() {
  const links = new Map();
  document.querySelectorAll('nav.main-nav a[href^="#"]').forEach((a) => links.set(a.getAttribute("href").slice(1), a));
  const sections = [...document.querySelectorAll("section.panel[id]")].filter((sec) => links.has(sec.id));
  if ("IntersectionObserver" in window && sections.length) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach((a) => a.removeAttribute("aria-current"));
        links.get(e.target.id).setAttribute("aria-current", "location");
      }
    }, { rootMargin: "-40% 0px -55% 0px" });
    sections.forEach((sec) => io.observe(sec));
  }

  const live = el("p", { class: "sr-only", "aria-live": "polite" });
  document.body.appendChild(live);
  document.querySelectorAll("section.panel[id] .section-head h2").forEach((h2) => {
    const id = h2.closest("section.panel").id;
    const btn = el("button", { type: "button", class: "anchor-link", title: "Copier le lien vers cette section", "aria-label": `Copier le lien vers la section « ${h2.textContent.trim()} »` }, "#");
    btn.addEventListener("click", () => {
      const url = `${location.origin}${location.pathname}#${id}`;
      history.replaceState(null, "", `#${id}`);
      const done = () => {
        btn.textContent = "Lien copié";
        btn.classList.add("copied");
        live.textContent = "Lien copié";
        setTimeout(() => { btn.textContent = "#"; btn.classList.remove("copied"); live.textContent = ""; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
      else done();
    });
    h2.appendChild(btn);
  });
}

/* ===========================================================================
   Données et graphiques
   =========================================================================== */

let DATA = null;
const visible = new Set();          // clés des catégories affichées
const cards = [];                   // { territoire, chart, sub, build }

function matiere(cle) { return DATA.matieres.find((m) => m.cle === cle); }

/* Dernière année où au moins une catégorie affichée a une valeur */
function latestVisible(t) {
  const annees = DATA.meta.annees;
  for (let i = annees.length - 1; i >= 0; i--) {
    let total = 0, any = false;
    for (const [cle, vals] of Object.entries(t.valeurs)) {
      if (!visible.has(cle) || vals[i] == null) continue;
      total += vals[i]; any = true;
    }
    if (any) return { annee: annees[i], total };
  }
  return null;
}

function updateSub(card) {
  const last = latestVisible(card.territoire);
  card.sub.textContent = "";
  if (!last) {
    card.sub.append("Aucune donnée pour les catégories affichées.");
    return;
  }
  card.sub.append("Catégories affichées, ", last.annee, " : ", el("strong", {}, tonnes(last.total)));
}

function chartConfig(t) {
  const text = cssVar("--text-primary");
  const muted = cssVar("--text-muted");
  const grid = cssVar("--gridline");
  const datasets = DATA.matieres
    .filter((m) => t.valeurs[m.cle])
    .map((m) => {
      const color = cssVar(m.couleur) || cssVar("--mat-autre");
      return {
        label: m.libelle,
        cle: m.cle,
        data: t.valeurs[m.cle],
        backgroundColor: color,
        borderWidth: 0,
        borderRadius: 3,
        hidden: !visible.has(m.cle),
      };
    });
  return {
    type: "bar",
    data: { labels: DATA.meta.annees, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? false : undefined,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cssVar("--surface-1"),
          titleColor: text,
          bodyColor: text,
          footerColor: muted,
          borderColor: cssVar("--border-strong"),
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          usePointStyle: true,
          filter: (item) => item.raw != null,
          callbacks: {
            title: (items) => items.length ? `${t.nom}, ${items[0].label}` : "",
            label: (item) => ` ${item.dataset.label} : ${tonnes(item.raw)}`,
            footer: (items) => {
              const vals = items.filter((i) => i.raw != null);
              if (vals.length < 2) return "";
              return `Total affiché : ${tonnes(vals.reduce((s, i) => s + i.raw, 0))}`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          border: { color: cssVar("--baseline") },
          ticks: { color: muted, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 6 },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: grid },
          border: { display: false },
          ticks: { color: muted, font: { size: 11 }, callback: (v) => fr(v) },
          title: { display: true, text: "Tonnes", color: muted, font: { size: 11 } },
        },
      },
    },
  };
}

function buildTable(wrap, t) {
  const cles = DATA.matieres.filter((m) => t.valeurs[m.cle]).map((m) => m.cle);
  const table = el("table", { class: "data-table" });
  table.appendChild(el("caption", { class: "sr-only" }, `Tonnes générées par année et par catégorie, ${t.nom}`));
  table.appendChild(el("thead", {}, el("tr", {}, [
    el("th", { scope: "col" }, "Année"),
    ...cles.map((c) => el("th", { scope: "col", title: matiere(c).nom_source }, matiere(c).libelle)),
  ])));
  table.appendChild(el("tbody", {}, DATA.meta.annees.map((a, i) => el("tr", {}, [
    el("th", { scope: "row" }, a),
    ...cles.map((c) => {
      const v = t.valeurs[c][i];
      return v == null ? el("td", { class: "na", title: "Aucune valeur publiée" }, "—") : el("td", {}, fr(v));
    }),
  ]))));
  wrap.appendChild(table);
}

function makeCard(t, i, featured) {
  const canvasId = `chart-${i}`;
  const tableId = `table-${i}`;
  const canvas = el("canvas", { id: canvasId, role: "img", "aria-label": `Graphique à barres empilées des tonnes générées par année, ${t.nom}. Données détaillées dans le tableau.` });
  const sub = el("p", { class: "card-sub" });
  const wrap = el("div", { class: "data-table-wrap", id: tableId });
  const toggle = el("button", { type: "button", class: "table-toggle", "aria-expanded": "false", "aria-controls": tableId }, "Voir les données en tableau");
  toggle._buildTable = () => { if (!wrap.firstChild) buildTable(wrap, t); };
  toggle.addEventListener("click", () => {
    toggle._buildTable();
    const open = wrap.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Masquer les données" : "Voir les données en tableau";
  });

  const node = el("article", { class: "card" }, [
    featured ? el("h3", {}, `Tonnes générées par catégorie, ${DATA.meta.annees[0]}–${DATA.meta.annees.at(-1)}`)
             : el("h3", {}, t.nom),
    sub,
    el("div", { class: `chart-box ${featured ? "h-320" : "h-220"}` }, canvas),
    toggle,
    wrap,
  ]);

  const card = { territoire: t, sub, chart: null };
  card.build = () => {
    if (card.chart) card.chart.destroy();
    card.chart = new Chart(canvas, chartConfig(t));
  };
  cards.push(card);
  return node;
}

function applyVisibility() {
  for (const card of cards) {
    if (card.chart) {
      card.chart.data.datasets.forEach((ds, i) => card.chart.setDatasetVisibility(i, visible.has(ds.cle)));
      card.chart.update("none");
    }
    updateSub(card);
  }
}

function renderFilters() {
  const bar = document.getElementById("filters");
  for (const m of DATA.matieres) {
    const btn = el("button", {
      type: "button",
      class: "toggle-btn",
      "aria-pressed": String(visible.has(m.cle)),
      title: m.nom_source,
      style: `--cat-color: var(${m.couleur}, var(--mat-autre))`,
    }, m.libelle);
    btn.addEventListener("click", () => {
      if (visible.has(m.cle)) visible.delete(m.cle); else visible.add(m.cle);
      btn.setAttribute("aria-pressed", String(visible.has(m.cle)));
      applyVisibility();
    });
    bar.appendChild(btn);
  }
}

function renderKpis() {
  const t = DATA.territoires.find((x) => x.nom === DATA.meta.vedette);
  const annees = DATA.meta.annees;
  const grid = document.getElementById("kpi-grid");
  grid.textContent = "";
  for (const m of DATA.matieres) {
    const vals = t.valeurs[m.cle];
    if (!vals) continue;
    const i = vals.findLastIndex((v) => v != null);
    if (i < 0 || annees[i] !== annees.at(-1)) continue;   // seulement les catégories publiées la dernière année
    const prev = i > 0 && vals[i - 1] != null ? `${annees[i - 1]} : ${tonnes(vals[i - 1])}` : "";
    grid.appendChild(el("div", { class: "kpi-card" }, [
      el("div", { class: "kpi-value" }, tonnes(vals[i])),
      el("div", { class: "kpi-label" }, `${m.libelle}, ${annees[i]}`),
      el("div", { class: "kpi-note" }, `${t.nom}${prev ? ` · ${prev}` : ""}`),
    ]));
  }
}

function renderMethodo() {
  const { meta, matieres } = DATA;
  fill("nb-territoires", String(DATA.territoires.length));
  fill("premiere-annee", meta.annees[0]);
  fill("derniere-annee", meta.annees.at(-1));
  fill("exclus", frList(meta.exclus));

  const rdd = matieres.find((m) => m.cle === "rdd");
  if (rdd) {
    const ans = meta.annees.filter((_, i) => DATA.territoires.some((t) => t.valeurs.rdd && t.valeurs.rdd[i] != null));
    fill("rdd-periode", `${ans[0]} à ${ans.at(-1)}`);
  }

  const sans = meta.sans_donnees || [];
  if (sans.length) {
    document.getElementById("sans-donnees").textContent =
      `Aucune quantité générée n'est publiée par territoire pour ${sans.length > 1 ? "ces catégories" : "cette catégorie"} : ` +
      `${frList(sans.map((m) => `« ${m.nom_source} »`))}. Elles n'apparaissent donc pas.`;
  }

  const list = document.getElementById("categories-list");
  for (const m of matieres) {
    list.appendChild(el("div", { class: "src-item" }, [
      el("span", { class: "src-name" }, m.libelle),
      el("span", { class: "src-meta" }, m.nom_source),
    ]));
  }

  const fresh = document.getElementById("hero-freshness");
  fresh.textContent = `Données de ${meta.annees[0]} à ${meta.annees.at(-1)} · mises à jour à la main quand la Ville publie un nouveau fichier · page générée le ${dateLongue(meta.genere_le)}`;
  fresh.hidden = false;
}

async function main() {
  initTheme();
  initNavEnhancements();
  try {
    DATA = await fetchJSON("data/bilan-massique.json");
  } catch (err) {
    console.error(err);
    document.getElementById("kpi-grid").replaceChildren(el("p", { class: "callout gap" },
      "Impossible de charger les données. Réessayez dans quelques instants."));
    return;
  }
  DATA.matieres.filter((m) => m.visible).forEach((m) => visible.add(m.cle));

  renderKpis();
  renderFilters();
  renderMethodo();

  const featured = document.getElementById("featured");
  const boroughs = document.getElementById("boroughs");
  DATA.territoires.forEach((t, i) => {
    if (t.nom === DATA.meta.vedette) featured.appendChild(makeCard(t, i, true));
    else boroughs.appendChild(makeCard(t, i, false));
  });
  for (const card of cards) { card.build(); updateSub(card); }
  registerRedraw(() => cards.forEach((c) => c.build()));
}

main();
