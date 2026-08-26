// Décide UNE FOIS, au chargement, si on sert la structure mobile ou desktop -
// même principe que /projets/ (script.js) : figé au chargement, pas
// réévalué au resize, puisque la structure elle-même va différer plutôt
// que de simples ajustements CSS. document.documentElement.clientWidth,
// PAS window.innerWidth : ce dernier s'est révélé peu fiable en émulation
// mobile (Chrome DevTools) dans certaines configurations, retournant la
// largeur du viewport desktop par défaut (~980px) alors que clientWidth
// reflète correctement l'appareil émulé - identiques sur un vrai téléphone,
// donc sans risque pour de vrais visiteurs mobiles.
// 900px seul ratait les tablettes (voir /projets/ script.js pour le détail
// complet) - combiné au type de pointeur ("coarse" = tactile, jamais vrai
// sur souris/trackpad) pour couvrir tous les iPad sans capturer une fenêtre
// desktop juste redimensionnée. Plafond de 1400px : un iPad tactile relié à
// un grand écran externe garde quand même la structure desktop au-delà.
const IS_MOBILE = document.documentElement.clientWidth <= 900
  || (window.matchMedia('(pointer: coarse)').matches && document.documentElement.clientWidth <= 1400);
// Classe sur <html> plutôt qu'un @media : permet au CSS de cibler cette
// MÊME décision figée au chargement (voir IS_MOBILE ci-dessus), au lieu de
// réagir en direct à la largeur de la fenêtre.
document.documentElement.classList.toggle('is-mobile', IS_MOBILE);

const IMAGE_BASE_PATH = 'input/HOME/';
const CSV_PATH = 'Data/nomenclature.csv';

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(';').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(';');
    const row = {};
    headers.forEach((header, i) => {
      row[header] = (values[i] || '').trim();
    });
    return row;
  });
}

function parsePercent(value) {
  return parseFloat((value || '').replace(',', '.'));
}

function imagePath(name) {
  return `${IMAGE_BASE_PATH}${name}.png`;
}

// Identifiant de projet partagé avec /projets/ : le nom officiel en
// minuscule (ex. "Break Shot" -> "break shot"), tel quel espaces compris,
// pour matcher exactement l'arborescence input/<slug>/ attendue là-bas.
function getSlug(row) {
  return row['Projet (Nom Officiel)'].trim().toLowerCase();
}

// URL propre par projet (demande explicite) : /projets/<dossier>/, chaque
// dossier une copie du template avec <base href="../"> (voir FOLDER_SLUG
// dans /projets/script.js pour le sens inverse) - AVEC le slash final, SANS
// nom de fichier : c'est ce qui fait que "index.html" ne s'affiche jamais
// dans la barre d'adresse (le serveur le sert en silence pour ce dossier).
// Table explicite (pas de dérivation automatique) à cause de "Hermès" :
// l'accent ne survivrait pas à un aller-retour URL sans encodage.
const PROJECT_URL_SLUG = {
  'break shot': 'break-shot',
  firefly: 'firefly',
  monolith: 'monolith',
  eden: 'eden',
  pulse: 'pulse',
  'the cube': 'the-cube',
  'hermès birkin sport': 'hermes-birkin-sport',
  osmose: 'osmose',
  insight: 'insight',
};

// Mémorise quels projets ont déjà été ouverts, pour qu'ils réapparaissent
// "montés" (sans animation) au retour sur l'accueil depuis /projets/. En
// sessionStorage (pas localStorage) : ça survit à une navigation dans le même
// onglet (Retour, bouton précédent), mais se réinitialise dès que la fenêtre/
// l'onglet est fermé - un simple F5 sur l'accueil repart lui aussi toujours
// de "démonté", voir le reset explicite plus bas.
const VISITED_PROJECTS_KEY = 'portfolio.visitedProjects';

function getVisitedProjects() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(VISITED_PROJECTS_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function markProjectVisited(slug) {
  const visited = getVisitedProjects();
  visited.add(slug);
  sessionStorage.setItem(VISITED_PROJECTS_KEY, JSON.stringify([...visited]));
}

function createImage(name, zIndex, className) {
  const img = document.createElement('img');
  img.loading = 'lazy'; // ne déclenche le téléchargement que si l'image devient visible
  img.src = imagePath(name);
  img.style.zIndex = parseInt(zIndex, 10); // respecte l'ordre d'empilement défini dans le CSV
  img.classList.add(className);
  img.onerror = () => {
    console.error(`Image manquante ou introuvable : "${name}" (${img.src})`);
  };
  return img;
}

// Décalage au-dessus du z-index max des images (Z-index Objet culmine à 200
// dans le CSV), pour que les zones restent toujours par-dessus tout en
// respectant entre elles le même ordre que les objets.
const HOVER_ZONE_Z_OFFSET = 1000;

function createHoverZone(row) {
  const div = document.createElement('div');
  div.classList.add('hover-zone');
  div.style.zIndex = HOVER_ZONE_Z_OFFSET + parseInt(row['Z-index Objet'], 10);
  return div;
}

// Colonnes CSV à utiliser selon l'état "démonté" / "monté" (attention à la
// casse irrégulière du CSV : "Ombre démonté" vs "Ombre Monté").
const STATE_COLUMNS = {
  demonte: {
    objet: 'Objet Démonté',
    ombre: 'Ombre démonté',
    x: 'Position X div (Démonté) %',
    y: 'Position Y div (Démonté) %',
    w: 'Largeur div (Démonté) %',
    h: 'Hauteur div (Démonté) %',
  },
  monte: {
    objet: 'Objet Monté',
    ombre: 'Ombre Monté',
    x: 'Position X div (Monté) %',
    y: 'Position Y div (Monté) %',
    w: 'Largeur div (Monté) %',
    h: 'Hauteur div (Monté) %',
  },
};

function applyState(row, { objectImg, shadowImg, hoverZone }, state) {
  const cols = STATE_COLUMNS[state];
  objectImg.src = imagePath(row[cols.objet]);
  shadowImg.src = imagePath(row[cols.ombre]);
  hoverZone.style.left = `${parsePercent(row[cols.x])}%`;
  hoverZone.style.top = `${parsePercent(row[cols.y])}%`;
  hoverZone.style.width = `${parsePercent(row[cols.w])}%`;
  hoverZone.style.height = `${parsePercent(row[cols.h])}%`;
}

// Rempli par buildScene, consommé par le pageshow ci-dessous (bfcache) :
// permet de remettre à jour l'état monté/démonté des éléments déjà créés
// sans reconstruire toute la scène.
const builtEntries = [];

function buildScene(rows) {
  const scene = document.getElementById('scene');
  const visited = getVisitedProjects();

  rows.forEach(row => {
    const zIndexOmbre = row['Z-index Ombre'];
    const zIndexObjet = row['Z-index Objet'];

    const shadowImg = createImage(row['Ombre démonté'], zIndexOmbre, 'shadow-img');
    const objectImg = createImage(row['Objet Démonté'], zIndexObjet, 'object-img');
    scene.appendChild(shadowImg);
    scene.appendChild(objectImg);

    const hoverZone = createHoverZone(row);
    scene.appendChild(hoverZone);

    const slug = getSlug(row);
    const els = { objectImg, shadowImg, hoverZone };
    builtEntries.push({ row, els, slug });
    // Déjà visité (voir plus haut) -> apparaît directement "monté", sans
    // rejouer l'animation de montage.
    applyState(row, els, visited.has(slug) ? 'monte' : 'demonte');

    // Le clic renvoie vers la page du projet ; on le marque comme visité au
    // passage pour qu'il apparaisse monté au retour sur l'accueil. Exception :
    // "ID" n'utilise pas le gabarit /projets/, il pointe vers /cv/ (gabarit à
    // part, voir consigne : "on s'en occupera plus tard").
    hoverZone.addEventListener('click', () => {
      markProjectVisited(slug);
      const destination = slug === 'id'
        ? 'cv/'
        : `projets/${PROJECT_URL_SLUG[slug] || slug}/`;
      window.location.href = destination;
    });

    hoverZone.addEventListener('mouseenter', () => {
      objectImg.style.willChange = 'transform, opacity';
      shadowImg.style.willChange = 'opacity, transform';
      objectImg.classList.add('is-hovered');
      shadowImg.classList.add('is-dimmed');
    });
    hoverZone.addEventListener('mouseleave', () => {
      objectImg.classList.remove('is-hovered');
      shadowImg.classList.remove('is-dimmed');
    });
    // Une fois l'animation retour terminée, on retire will-change : plus
    // aucun calque GPU dédié ne traîne pour cette image au repos.
    objectImg.addEventListener('transitionend', () => {
      if (!objectImg.classList.contains('is-hovered')) objectImg.style.willChange = 'auto';
    });
    shadowImg.addEventListener('transitionend', () => {
      if (!shadowImg.classList.contains('is-dimmed')) shadowImg.style.willChange = 'auto';
    });
  });

}

// Zoome sur la zone utile d'une image d'objet (transparente - l'objet
// n'occupe qu'une fraction du canevas, voir les colonnes "% (Démonté)" de
// la nomenclature) sans la déformer : UNE seule échelle (le plus petit des
// deux facteurs de zoom nécessaires pour remplir chaque axe), pas deux
// facteurs X/Y indépendants comme au premier essai (étirait l'image) -
// dézoome légèrement plutôt que d'étirer si la zone ne correspond pas
// exactement à la forme du conteneur (voir aussi .catalog-card-image dans
// style.css, rendue plus rectangulaire pour limiter cet écart).
// nudgeXPct/nudgeYPct (points de %, voir CATALOG_CARD_NUDGE plus bas) :
// ajustement manuel ponctuel une fois le centrage automatique posé - un
// posX plus PETIT décale le contenu visible vers la DROITE (montre moins
// du côté droit de l'image source), donc on soustrait le nudge ici.
function computeObjectCrop(xPct, yPct, wPct, hPct, nudgeXPct = 0, nudgeYPct = 0) {
  const scale = Math.min(100 / wPct, 100 / hPct);
  const size = scale * 100;
  const posX = (xPct * scale) / (scale - 1) - nudgeXPct;
  const posY = (yPct * scale) / (scale - 1) - nudgeYPct;
  return { size, posX, posY };
}

// Images dédiées au catalogue mobile (voir input/HOME/Mobile/) : déjà
// composées exactement au ratio de .catalog-card-image (3:2) avec l'objet
// cadré pour le débordement - contrairement aux images de la scène desktop
// (objet minuscule dans un immense canevas transparent), pas besoin de
// recadrage/zoom en JS pour elles (voir computeObjectCrop plus bas, gardée
// en repli au cas où un futur projet n'aurait pas encore son image dédiée).
const CATALOG_CARD_IMAGE = {
  'break shot': 'breakshot_dm.webp',
  firefly: 'firefly_dm.webp',
  monolith: 'monolith_dm.webp',
  eden: 'eden_dm.webp',
  pulse: 'pulse_dm.webp',
  'the cube': 'cube_dm.webp',
  'hermès birkin sport': 'birkin_dm.webp',
  osmose: 'osmose_dm.webp',
  insight: 'insight_dm.webp',
};

// Même mécanisme que sur desktop (voir applyState/getVisitedProjects) :
// une carte affiche l'objet monté si le projet a déjà été visité dans cette
// session, sinon démonté - donc utilisée seulement au retour sur le
// catalogue après avoir ouvert un projet, pas au moment du clic lui-même.
const CATALOG_CARD_IMAGE_MONTE = {
  'break shot': 'breakshot_m.webp',
  firefly: 'firefly_m.webp',
  monolith: 'monolith_m.webp',
  eden: 'eden_m.webp',
  pulse: 'pulse_m.webp',
  'the cube': 'cube_m.webp',
  'hermès birkin sport': 'birkin_m.webp',
  osmose: 'osmose_m.webp',
  insight: 'insight_m.webp',
};

// Ajustement manuel ponctuel du cadrage (voir computeObjectCrop) - pour les
// projets SANS image dédiée (voir CATALOG_CARD_IMAGE) seulement, le
// centrage automatique à partir des coordonnées de la nomenclature ne
// tombant pas toujours pile visuellement. Décalage en points de %.
const CATALOG_CARD_NUDGE = {};

// Couleurs du dégradé de .catalog-card-bg (voir style.css pour les valeurs
// par défaut, rouge sang en haut -> gris foncé en bas) - personnalisées au
// cas par cas, projet par projet. Une chaîne = remplace juste le haut (le
// bas garde le gris foncé par défaut) ; { top, bottom } = remplace les deux.
// holdPct/endPct (optionnels, voir buildCatalogCard) : par défaut le
// dégradé part de 0% (transition immédiate) et finit à 75% - holdPct
// retarde le début de la transition (la couleur du haut "tient" plus
// longtemps avant de commencer à se fondre dans celle du bas).
const CATALOG_CARD_COLOR = {
  firefly: '#8a6f4d', // marron beige
  monolith: '#6f4a2e', // marron bois
  eden: { top: '#ffffff', bottom: '#b39ddb', holdPct: 45, endPct: 90 }, // blanc (descend plus bas) -> violet clair
  pulse: { top: '#ffffff', bottom: '#2f9e5c' }, // blanc -> vert métal
  'the cube': { top: '#ffffff', bottom: '#c9c9c9' }, // blanc -> gris clair
  'hermès birkin sport': { top: '#ffffff', bottom: '#7f7f7f' }, // blanc -> gris moyen
  osmose: { top: '#ffffff', bottom: '#3d2716', endPct: 100 }, // blanc -> marron bois (plus foncé), fondu jusqu'en bas (pas de zone unie)
  insight: '#3a3a3a', // gris foncé
};

// Une carte par projet (voir buildCatalog plus bas) : cadre arrondi en
// dégradé, l'image de l'objet (démonté, recadrée sur sa zone utile - voir
// computeObjectCrop) débordant par-dessus le haut du cadre, titre en blanc
// en bas. .catalog-card-bg (le cadre à proprement parler) est un enfant
// SÉPARÉ de .catalog-card-image (pas un parent avec overflow: hidden) :
// c'est ce qui permet à l'image de déborder visuellement au-dessus sans se
// faire rogner par les coins arrondis du cadre.
function buildCatalogCard(row) {
  const slug = getSlug(row);
  const isVisited = getVisitedProjects().has(slug);
  const cols = STATE_COLUMNS[isVisited ? 'monte' : 'demonte'];
  const dedicatedImage = isVisited ? CATALOG_CARD_IMAGE_MONTE[slug] : CATALOG_CARD_IMAGE[slug];

  const card = document.createElement('a');
  card.className = 'catalog-card';
  card.href = slug === 'id' ? 'cv/' : `projets/${PROJECT_URL_SLUG[slug] || slug}/`;
  card.addEventListener('click', () => markProjectVisited(slug));

  const bg = document.createElement('div');
  bg.className = 'catalog-card-bg';
  const colorConfig = CATALOG_CARD_COLOR[slug];
  if (colorConfig) {
    const isObj = typeof colorConfig === 'object';
    const top = isObj ? colorConfig.top : colorConfig;
    const bottom = isObj ? colorConfig.bottom : '#101010';
    const holdPct = (isObj && colorConfig.holdPct) || 0;
    const endPct = (isObj && colorConfig.endPct) || 75;
    bg.style.background = holdPct
      ? `linear-gradient(to bottom, ${top} 0%, ${top} ${holdPct}%, ${bottom} ${endPct}%)`
      : `linear-gradient(to bottom, ${top} 0%, ${bottom} ${endPct}%)`;
  }
  card.appendChild(bg);

  const image = document.createElement('div');
  image.className = 'catalog-card-image';
  if (dedicatedImage) {
    // contain, PAS "100% 100%" (étirait l'image si le conteneur n'est pas
    // exactement 3:2, voir .catalog-card-image dans style.css) : garde
    // toujours son ratio d'origine, quitte à laisser une fine marge plutôt
    // que de déformer. "top center" : si marge il y a, qu'elle tombe en bas
    // (majoritairement recouvert par le dégradé) plutôt qu'en haut (casserait
    // l'effet de débordement, pensé pour toucher le haut du cadre).
    image.style.backgroundImage = `url(${IMAGE_BASE_PATH}Mobile/${dedicatedImage})`;
    image.style.backgroundSize = 'contain';
    image.style.backgroundPosition = 'top center';
  } else {
    // Repli (voir computeObjectCrop) : recadre l'image de la scène desktop
    // (l'objet n'occupe qu'une fraction du canevas) sur sa zone utile.
    const nudge = CATALOG_CARD_NUDGE[slug] || {};
    const { size, posX, posY } = computeObjectCrop(
      parsePercent(row[cols.x]),
      parsePercent(row[cols.y]),
      parsePercent(row[cols.w]),
      parsePercent(row[cols.h]),
      nudge.x || 0,
      nudge.y || 0,
    );
    image.style.backgroundImage = `url(${imagePath(row[cols.objet])})`;
    image.style.backgroundSize = `${size}% ${size}%`;
    image.style.backgroundPosition = `${posX}% ${posY}%`;
  }
  card.appendChild(image);

  const title = document.createElement('p');
  title.className = 'catalog-card-title';
  title.textContent = row['Projet (Nom Officiel)'];
  card.appendChild(title);

  return card;
}

// Ordre d'affichage voulu pour le catalogue mobile, différent de l'ordre du
// CSV - "id" volontairement absent (voir buildCatalog : pas un vrai projet).
const CATALOG_ORDER = [
  'break shot', 'firefly', 'monolith', 'eden', 'pulse',
  'the cube', 'hermès birkin sport', 'osmose', 'insight',
];

// Catalogue mobile (voir #catalog dans home/index.html) : une carte par projet,
// dans l'ordre de CATALOG_ORDER plutôt que celui du CSV.
function buildCatalog(rows) {
  const catalog = document.getElementById('catalog');
  const bySlug = new Map(rows.map(row => [getSlug(row), row]));
  CATALOG_ORDER
    .map(slug => bySlug.get(slug))
    .filter(Boolean)
    .forEach(row => catalog.appendChild(buildCatalogCard(row)));
}

// Bug connu (Chromium) : un onglet mis en arrière-plan peut corrompre les
// calques composités GPU des images ; elles restent visuellement "buggées"
// jusqu'à ce qu'un changement de transform/opacity force le navigateur à
// régénérer la texture (c'est ce que faisait un simple survol). On force ce
// même petit changement automatiquement dès que l'onglet redevient visible.
function nudge(el, prop, tempValue) {
  const previous = el.style[prop];
  el.style[prop] = tempValue;
  void el.offsetHeight; // force le recalcul de layout/compositing
  el.style[prop] = previous;
}

function repaintSceneImages() {
  document.querySelectorAll('.object-img').forEach(el => nudge(el, 'transform', 'translateZ(0.01px)'));
  document.querySelectorAll('.shadow-img').forEach(el => nudge(el, 'opacity', '0.999'));
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    repaintSceneImages();
  }
});

// Retour via le bouton "précédent" du navigateur (pas notre lien "Retour") :
// la page est restaurée depuis le bfcache, un instantané figé d'avant la
// navigation vers /projets/, sans que le moindre script ne rejoue. Elle
// affiche donc encore l'état du moment du clic (démonté). event.persisted
// permet de détecter précisément ce cas et de remettre à jour les éléments
// déjà construits (builtEntries) d'après localStorage, sans reconstruire ni
// recharger toute la page.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  const visited = getVisitedProjects();
  builtEntries.forEach(({ row, els, slug }) => {
    applyState(row, els, visited.has(slug) ? 'monte' : 'demonte');
  });
});

// Le CSV pèse quelques Ko : le re-télécharger/parser à chaque chargement de
// page est négligeable, donc pas de cache localStorage ici (ça masquait les
// modifications faites dans nomenclature.csv). Le vrai coût à éviter est
// celui des images, géré séparément par preloadAllImages().
function loadRows() {
  return fetch(CSV_PATH)
    .then(response => response.text())
    .then(csvText => parseCsv(csvText).filter(row => row['Objet Démonté']));
}

// Précharge démonté ET monté pour chaque produit : une fois le bouton
// débloqué, même l'assemblage au clic doit être instantané.
function preloadImage(name) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => {
      console.error(`Image manquante ou introuvable : "${name}" (${imagePath(name)})`);
      resolve();
    };
    img.src = imagePath(name);
  });
}

function preloadAllImages(rows) {
  const names = new Set();
  // Le fond du body (bg.png) reste cachée derrière #overlay (opaque) depuis
  // le chargement de la page : sans préchargement explicite, le navigateur
  // retarde son téléchargement puisqu'elle n'a jamais été visible, d'où le
  // noir qui s'affiche avant qu'elle ne finisse de charger au moment
  // où le portail s'ouvre.
  names.add('bg');
  rows.forEach(row => {
    names.add(row['Objet Démonté']);
    names.add(row['Ombre démonté']);
    names.add(row['Objet Monté']);
    names.add(row['Ombre Monté']);
  });
  return Promise.all([...names].map(preloadImage));
}

const scene = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const overlayVideo = document.getElementById('overlay-video');
const powerSwitchGlow = document.getElementById('power-switch-glow');
const powerSwitch = document.getElementById('power-switch');

// Un rechargement manuel de l'accueil (F5 / bouton actualiser) doit tout
// remettre à zéro : retour à "démonté" partout et réaffichage du splash. On
// distingue ça d'une navigation normale (ex. clic sur "Retour" depuis
// /projets/) via la Navigation Timing API, seule façon fiable de savoir
// que CE chargement précis est un reload plutôt qu'une navigation entrante.
const [navigationEntry] = performance.getEntriesByType('navigation');
if (navigationEntry && navigationEntry.type === 'reload') {
  sessionStorage.removeItem(VISITED_PROJECTS_KEY);
  sessionStorage.removeItem('portfolio.introSeen'); // SKIP_INTRO_KEY, défini juste après
}

// Posée par ignite() dès le premier clic sur Discover : le splash n'a plus
// besoin d'être revu dans la même session (typiquement au retour d'un clic
// "Retour" depuis /projets/) -> on saute direct à la scène, sans rejouer
// l'intro ni la vidéo de fond.
const SKIP_INTRO_KEY = 'portfolio.introSeen';
const skipIntro = sessionStorage.getItem(SKIP_INTRO_KEY) === '1';

// Network Information API (Chromium seulement - absente sur Safari/Firefox,
// d'où le premier test) : effectiveType estime la vitesse réelle mesurée
// (pas juste le type de connexion), saveData reflète le mode "Économie de
// données" activé par le visiteur. Sans cette API, on part du principe que
// la connexion est correcte (comportement inchangé) plutôt que de priver
// inutilement les navigateurs qui ne l'exposent pas. Même logique que
// /projets/ (setupHero), dupliquée ici faute de module partagé entre les
// deux script.js sur ce site sans étape de build.
// effectiveType seul ne suffit pas : "3g" en fait déjà partie, mais "4g"
// est une fourchette bien trop large (couvre tout, du tout juste correct
// au vrai haut débit) - le profil "Fast 4G" du throttling Chrome (~4 Mbps)
// est classé "4g" et pourtant fait toujours buguer la vidéo. downlink (Mbps
// estimé) affine avec un seuil plus strict que la simple étiquette.
function isSlowConnection() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return false;
  if (connection.saveData) return true;
  if (['slow-2g', '2g', '3g'].includes(connection.effectiveType)) return true;
  if (typeof connection.downlink === 'number' && connection.downlink < 5) return true;
  return false;
}

if (skipIntro) {
  overlay.remove();
} else {
  // Vidéo de fond floutée du splash (voir #overlay-video dans home/index.html,
  // sans src posé en dur - seulement ici) : sur connexion lente, aucun
  // téléchargement n'est déclenché du tout - #overlay garde son fond noir
  // uni (voir style.css), déjà cohérent visuellement sans la texture.
  if (!isSlowConnection()) {
    // Diagnostiqué sur un vrai iPhone (voir /projets/ script.js, setupHero,
    // pour le détail complet) : Safari iOS suspend le téléchargement juste
    // après les métadonnées (networkState passe à NETWORK_IDLE) et n'en
    // bouge plus tant que play() n'a pas été VRAIMENT appelé - attendre un
    // événement de chargement (loadeddata/canplay/canplaythrough) AVANT
    // d'appeler play() crée donc un blocage mutuel, et la vidéo tombe
    // systématiquement sur le timeout ci-dessous sans jamais se lancer. Fix :
    // appeler play() tout de suite après avoir posé le src, sans rien
    // attendre au préalable - c'est cet appel qui débloque le téléchargement.
    // Plus généreux sur mobile : le pipeline vidéo de Safari iOS met plus de
    // temps à s'initialiser.
    const OVERLAY_READY_TIMEOUT_MS = IS_MOBILE ? 6000 : 3000;
    let overlaySettled = false;
    const overlayReadyTimeout = setTimeout(() => {
      if (overlaySettled) return;
      overlaySettled = true;
      overlayVideo.removeAttribute('src');
      overlayVideo.load();
    }, OVERLAY_READY_TIMEOUT_MS);
    // "playing" (la lecture a VRAIMENT commencé), pas loadeddata/canplay -
    // voir le commentaire ci-dessus.
    overlayVideo.addEventListener('playing', () => {
      if (overlaySettled) return;
      overlaySettled = true;
      clearTimeout(overlayReadyTimeout);
    }, { once: true });
    overlayVideo.addEventListener('error', () => {
      if (overlaySettled) return;
      overlaySettled = true;
      clearTimeout(overlayReadyTimeout);
    }, { once: true });
    overlayVideo.src = 'https://pub-eac92b9122e546c4bcd5a334d7c6ee2c.r2.dev/bgtexture.webm';
    overlayVideo.play().catch(() => {}); // lecture auto parfois refusée malgré muted+playsinline, ne doit pas bloquer l'affichage
  }

  // Déclenche le fondu d'entrée du titre/bouton (voir style.css, transitions
  // sur #overlay.is-ready ...). Double rAF pour garantir un premier rendu à
  // opacity: 0 avant de basculer vers 1, sinon la transition n'a rien à
  // interpoler (la classe risquerait d'être posée avant le tout premier
  // paint).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.add('is-ready');
    });
  });
}

let sceneRows = null;

if (skipIntro) {
  // Overlay déjà supprimée plus haut : #scene/#catalog n'ont plus qu'à être
  // construits dès que les données sont prêtes, sans bouton ni splash à
  // câbler. Sur mobile : catalogue de cartes (voir buildCatalog), pas de
  // préchargement en masse ni de scène flottante (pas d'équivalent mobile).
  loadRows().then(rows => {
    if (IS_MOBILE) {
      buildCatalog(rows);
    } else {
      return preloadAllImages(rows).then(() => {
        sceneRows = rows;
        buildScene(rows);
      });
    }
  });
} else {
  // pointermove/mousemove peuvent se déclencher bien plus vite que l'écran ne
  // rafraîchit : appliquer un handler à chaque événement (glow ET tilt
  // ci-dessous, même besoin) saturait le thread principal et faisait
  // décrocher la vidéo de fond. On ne garde que le DERNIER événement reçu et
  // on applique au plus une fois par frame via requestAnimationFrame.
  function throttleToFrame(apply) {
    let latestEvent = null;
    let framePending = false;
    return (e) => {
      latestEvent = e;
      if (framePending) return;
      framePending = true;
      requestAnimationFrame(() => {
        framePending = false;
        apply(latestEvent);
      });
    };
  }

  // Glow qui suit le curseur sur #power-switch-glow (voir style.css) : la
  // position globale du pointeur alimente --x/--y/--xp, consommés par un
  // background en "background-attachment: fixed" qui aligne le dégradé sur
  // l'écran entier. Posé sur le wrapper, pas sur le bouton lui-même : c'est
  // le wrapper qui lit ces variables, et elles n'héritent pas d'un enfant
  // vers son parent.
  const syncButtonGlow = throttleToFrame((e) => {
    powerSwitchGlow.style.setProperty('--x', e.clientX.toFixed(2));
    powerSwitchGlow.style.setProperty('--y', e.clientY.toFixed(2));
    powerSwitchGlow.style.setProperty('--xp', (e.clientX / window.innerWidth).toFixed(2));
  });
  document.addEventListener('pointermove', syncButtonGlow);

  // Tilt 3D : le coin du bouton le plus proche du curseur (donc du point le
  // plus lumineux du glow) s'avance légèrement vers l'écran.
  const BUTTON_TILT_DEG = 22;
  const BUTTON_TILT_LIFT = 16; // px

  // On ne mesure getBoundingClientRect() (qui force un reflow synchrone)
  // qu'une fois à l'entrée du survol, pas à chaque mousemove : la taille/
  // position du bouton ne change pas pendant qu'on le survole.
  let tiltRect = null;

  const tiltButton = throttleToFrame((e) => {
    if (!tiltRect) return;
    const relX = (e.clientX - tiltRect.left) / tiltRect.width - 0.5; // -0.5 .. 0.5
    const relY = (e.clientY - tiltRect.top) / tiltRect.height - 0.5;

    const rotateY = relX * BUTTON_TILT_DEG;
    const rotateX = -relY * BUTTON_TILT_DEG;

    powerSwitch.style.transform =
      `perspective(500px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(${BUTTON_TILT_LIFT}px)`;
  });

  const resetButtonTilt = () => {
    tiltRect = null;
    powerSwitch.style.transform = 'perspective(500px) rotateX(0deg) rotateY(0deg) translateZ(0)';
  };

  powerSwitch.addEventListener('mouseenter', () => {
    tiltRect = powerSwitch.getBoundingClientRect();
  });
  powerSwitch.addEventListener('mousemove', tiltButton);
  powerSwitch.addEventListener('mouseleave', resetButtonTilt);

  // Séquence au clic (voir style.css) : le texte s'efface (0.4s), la vidéo
  // zoome en avant puis s'assombrit au noir (0.4s + 0.6s), puis l'overlay
  // entier s'efface (0.6s, avec un délai de 1.2s) -> révèle #scene. Durée
  // totale 1.8s, doit rester synchro avec les délais/durées CSS.
  const CLICK_TRANSITION_MS = 1800;

  const ignite = () => {
    // Le splash a été vu : plus la peine de le rejouer dans cette session
    // (retour depuis /projets/ notamment, voir plus haut).
    sessionStorage.setItem(SKIP_INTRO_KEY, '1');

    document.removeEventListener('pointermove', syncButtonGlow);
    powerSwitch.removeEventListener('mousemove', tiltButton);
    powerSwitch.removeEventListener('mouseleave', resetButtonTilt);

    // Construite tout de suite (images déjà en cache, quasi instantané) mais
    // cachée derrière l'overlay opaque jusqu'à la toute fin de la séquence.
    // Sur mobile : catalogue de cartes (voir plus haut, même raison).
    if (IS_MOBILE) buildCatalog(sceneRows); else buildScene(sceneRows);
    overlay.classList.add('is-off');

    setTimeout(() => {
      overlayVideo.pause(); // libère le décodeur vidéo, plus rien à afficher derrière
      overlay.remove();
    }, CLICK_TRANSITION_MS);
  };

  // Chargement en tâche de fond dès l'arrivée sur la page : rien n'est ajouté
  // à #scene tant que le bouton n'est pas cliqué, mais tout est déjà en cache
  // navigateur une fois le bouton débloqué.
  powerSwitch.disabled = true;
  powerSwitchGlow.classList.add('is-disabled');

  // Sur mobile, pas de préchargement des images de la scène (voir ignite,
  // page vierge pour l'instant) - juste les lignes du CSV, déjà nécessaires
  // pour le catalogue à venir.
  loadRows()
    .then(rows => IS_MOBILE ? rows : preloadAllImages(rows).then(() => rows))
    .then(rows => {
      sceneRows = rows;
      powerSwitch.disabled = false;
      powerSwitchGlow.classList.remove('is-disabled');
    });

  // Bloqué par l'attribut "disabled" tant que le chargement n'est pas fini
  // (un bouton disabled ne déclenche pas d'événement "click").
  powerSwitch.addEventListener('click', () => {
    ignite();
  }, { once: true });
}
