"use strict";

/* ===========================================================================
   Matières résiduelles Montréal — lit data/bilan-massique.json (produit par
   genTables.py) et dessine un graphique par territoire.
   Utilitaires communs (minus, fr, fetchJSON, cssVar, el, initNavEnhancements)
   dans js/style-d.js (modèle outils/communs/style-d.js), chargé avant.
   =========================================================================== */

const tonnes = (n) => `${fr(n)} t`;
if (window.Chart) Chart.defaults.locale = "fr-CA";

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


/* ===========================================================================
   Données et graphiques
   =========================================================================== */

let DATA = null;
let mesure = "collectee";            // clé de DATA.mesures affichée (« generee » ou « collectee »)
let M = null;                       // DATA.mesures[mesure]
const visible = new Set();          // clés des catégories affichées
const cards = [];                   // { nom, chart, sub, wrap, toggle, titre, canvas, build }

/* « générées » / « collectées » : la mesure dans les phrases */
const MOT = { generee: "générées", collectee: "collectées" };
const mot = () => MOT[mesure] || M.libelle.toLowerCase();

function matiere(cle) { return M.matieres.find((m) => m.cle === cle); }
function territoire(nom) { return M.territoires.find((t) => t.nom === nom); }

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
  const last = latestVisible(territoire(card.nom));
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
  const datasets = M.matieres
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
          title: { display: true, text: `Tonnes ${mot()}`, color: muted, font: { size: 11 } },
        },
      },
    },
  };
}

function buildTable(wrap, t) {
  const cles = M.matieres.filter((m) => t.valeurs[m.cle]).map((m) => m.cle);
  const table = el("table", { class: "data-table" });
  table.appendChild(el("caption", { class: "sr-only" }, `Tonnes ${mot()} par année et par catégorie, ${t.nom}`));
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

function titreCarte(nom, featured) {
  return featured ? `Tonnes ${mot()} par catégorie, ${DATA.meta.annees[0]}–${DATA.meta.annees.at(-1)}` : nom;
}

function makeCard(t, i, featured) {
  const canvasId = `chart-${i}`;
  const tableId = `table-${i}`;
  const canvas = el("canvas", { id: canvasId, role: "img" });
  const sub = el("p", { class: "card-sub" });
  const wrap = el("div", { class: "data-table-wrap", id: tableId });
  const titre = el("h3", {}, titreCarte(t.nom, featured));
  const toggle = el("button", { type: "button", class: "table-toggle", "aria-expanded": "false", "aria-controls": tableId }, "Voir les données en tableau");
  toggle._buildTable = () => { if (!wrap.firstChild) buildTable(wrap, territoire(t.nom)); };
  toggle.addEventListener("click", () => {
    toggle._buildTable();
    const open = wrap.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Masquer les données" : "Voir les données en tableau";
  });

  const node = el("article", { class: "card" }, [
    titre,
    sub,
    el("div", { class: `chart-box ${featured ? "h-320" : "h-220"}` }, canvas),
    toggle,
    wrap,
  ]);

  const card = { nom: t.nom, featured, sub, wrap, titre, canvas, chart: null };
  card.build = () => {
    if (card.chart) card.chart.destroy();
    canvas.setAttribute("aria-label", `Graphique à barres empilées des tonnes ${mot()} par année, ${t.nom}. Données détaillées dans le tableau.`);
    card.chart = new Chart(canvas, chartConfig(territoire(t.nom)));
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
  bar.querySelectorAll(".toggle-btn").forEach((b) => b.remove());
  for (const m of M.matieres) {
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

/* Sélecteur de mesure (générée / collectée) : jamais les deux dans un même graphique */
function renderMesures() {
  const box = document.getElementById("mesures");
  box.textContent = "";
  for (const [cle, m] of Object.entries(DATA.mesures)) {
    const btn = el("button", { type: "button", "aria-pressed": String(cle === mesure), title: `Colonne ${m.colonne}` },
      cle === "generee" ? "Générée" : cle === "collectee" ? "Collectée" : m.libelle);
    btn.addEventListener("click", () => { if (cle !== mesure) changerMesure(cle); });
    box.appendChild(btn);
  }
}

function renderKpis() {
  const t = territoire(DATA.meta.vedette);
  const annees = DATA.meta.annees;
  const grid = document.getElementById("kpi-grid");
  grid.textContent = "";
  let n = 0;
  for (const m of M.matieres) {
    if (n >= 4) break;   // les quatre premières catégories (CRD, puis par volume)
    const vals = t.valeurs[m.cle];
    if (!vals) continue;
    const i = vals.findLastIndex((v) => v != null);
    if (i < 0 || annees[i] !== annees.at(-1)) continue;   // seulement les catégories publiées la dernière année
    const prev = i > 0 && vals[i - 1] != null ? `${annees[i - 1]} : ${tonnes(vals[i - 1])}` : "";
    grid.appendChild(el("div", { class: "kpi-card" }, [
      el("div", { class: "kpi-value" }, tonnes(vals[i])),
      el("div", { class: "kpi-label" }, `${m.libelle}, ${annees[i]} (${mot().replace(/s$/, "")})`),
      el("div", { class: "kpi-note" }, `${t.nom}${prev ? ` · ${prev}` : ""}`),
    ]));
    n++;
  }
}

/* Textes qui dépendent de la mesure */
function renderTextesMesure() {
  fill("mesure-mot", mot());
  const sans = M.sans_donnees || [];
  document.getElementById("sans-donnees").textContent = sans.length
    ? `En quantité ${mot().replace(/es$/, "e")}, aucune valeur n'est publiée par territoire pour ${sans.length > 1 ? "ces catégories" : "cette catégorie"} : ` +
      `${frList(sans.map((m) => `« ${m.nom_source} »`))} ; ${sans.length > 1 ? "elles n'apparaissent" : "elle n'apparaît"} qu'en quantité collectée.`
    : "";
}

function renderMethodo() {
  const { meta } = DATA;
  fill("nb-territoires", String(M.territoires.length));
  fill("premiere-annee", meta.annees[0]);
  fill("derniere-annee", meta.annees.at(-1));
  fill("exclus", frList(meta.exclus));

  const gen = DATA.mesures.generee;
  if (gen && gen.matieres.some((m) => m.cle === "rdd")) {
    const ans = meta.annees.filter((_, i) => gen.territoires.some((t) => t.valeurs.rdd && t.valeurs.rdd[i] != null));
    fill("rdd-periode", `${ans[0]} à ${ans.at(-1)}`);
  }

  // Toutes les catégories de la source (union des deux mesures)
  const list = document.getElementById("categories-list");
  const vues = new Set();
  for (const mes of Object.values(DATA.mesures)) {
    for (const m of mes.matieres) {
      if (vues.has(m.cle)) continue;
      vues.add(m.cle);
      list.appendChild(el("div", { class: "src-item" }, [
        el("span", { class: "src-name" }, m.libelle),
        el("span", { class: "src-meta" }, m.nom_source),
      ]));
    }
  }

  const fresh = document.getElementById("hero-freshness");
  fresh.textContent = `Données de ${meta.annees[0]} à ${meta.annees.at(-1)} · mises à jour à la main quand la Ville publie un nouveau fichier`;
  fill("genere-le", dateLongue(meta.genere_le));
  fresh.hidden = false;
}

function choisirMesure(cle) {
  mesure = DATA.mesures[cle] ? cle : "collectee";
  M = DATA.mesures[mesure];
  // Garde les catégories affichées qui existent dans cette mesure ; sinon celles par défaut
  const gardees = [...visible].filter((c) => M.matieres.some((m) => m.cle === c));
  visible.clear();
  (gardees.length ? gardees : M.matieres.filter((m) => m.visible).map((m) => m.cle)).forEach((c) => visible.add(c));
}

function changerMesure(cle) {
  choisirMesure(cle);
  const url = new URL(location.href);
  if (mesure === "collectee") url.searchParams.delete("mesure"); else url.searchParams.set("mesure", mesure);
  history.replaceState(null, "", url);
  renderMesures();
  renderFilters();
  renderKpis();
  renderTextesMesure();
  for (const card of cards) {
    card.titre.textContent = titreCarte(card.nom, card.featured);
    card.wrap.textContent = "";                     // tableau refait à la demande
    if (card.wrap.classList.contains("open")) buildTable(card.wrap, territoire(card.nom));
    card.build();
    updateSub(card);
  }
}

/* Animation d'attente (base commune js/chargement.js, scène css/chargement-bac.css) :
   des déchets aux couleurs des catégories tombent dans le bac de tri. */
const SCENE_BAC = '<span class="b-objet b-o1"></span><span class="b-objet b-o2"></span><span class="b-objet b-o3"></span>' +
  '<span class="b-objet b-o4"></span><span class="b-bac"><i class="b-couche b-c4"></i><i class="b-couche b-c3"></i>' +
  '<i class="b-couche b-c2"></i><i class="b-couche b-c1"></i></span><span class="b-couvercle"></span>';

async function main() {
  initTheme();
  initNavEnhancements();
  const attente = window.Chargement && Chargement.creer({
    scene: SCENE_BAC, classe: "ch-bac",
    titre: "Chargement du bilan massique…", detail: "Arrondissements et villes liées de l'agglomération",
  });
  try {
    DATA = await fetchJSON("data/bilan-massique.json");
  } catch (err) {
    console.error(err);
    if (attente) attente.fermer();
    document.getElementById("kpi-grid").replaceChildren(el("p", { class: "callout gap" },
      "Impossible de charger les données. Réessayez dans quelques instants."));
    return;
  }
  choisirMesure(new URLSearchParams(location.search).get("mesure") || "collectee");

  renderMesures();
  renderKpis();
  renderFilters();
  renderMethodo();
  renderTextesMesure();

  const featured = document.getElementById("featured");
  const boroughs = document.getElementById("boroughs");
  M.territoires.forEach((t, i) => {
    if (t.nom === DATA.meta.vedette) featured.appendChild(makeCard(t, i, true));
    else boroughs.appendChild(makeCard(t, i, false));
  });
  for (const card of cards) { card.build(); updateSub(card); }
  registerRedraw(() => cards.forEach((c) => c.build()));
  if (attente) { attente.fermer(); Chargement.arrivee(document.getElementById("kpi-grid")); }
}

main();
