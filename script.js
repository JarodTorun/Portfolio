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
    // "ID" n'utilise pas le gabarit /projets/, il pointe vers /CV/ (gabarit à
    // part, voir consigne : "on s'en occupera plus tard").
    hoverZone.addEventListener('click', () => {
      markProjectVisited(slug);
      const destination = slug === 'id'
        ? 'CV/index.html'
        : `projets/index.html?projet=${encodeURIComponent(slug)}`;
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

if (skipIntro) {
  overlay.remove();
} else {
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
  // Overlay déjà supprimée plus haut : #scene n'a plus qu'à être construite
  // dès que les données/images sont prêtes, sans bouton ni splash à câbler.
  loadRows()
    .then(rows => preloadAllImages(rows).then(() => rows))
    .then(rows => {
      sceneRows = rows;
      buildScene(rows);
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
    buildScene(sceneRows);
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

  loadRows()
    .then(rows => preloadAllImages(rows).then(() => rows))
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
