const CSV_PATH = '../Data/nomenclature.csv';

// Même parseur que script.js à la racine (page d'accueil) - CSV ; séparé, en-têtes en 1re ligne.
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

// Sections activables/désactivables par projet (clé = slug, voir
// getSlugFromUrl). Un projet absent de cet objet garde toutes les sections
// de index.html : cette config n'a besoin d'être renseignée que pour les
// projets qui doivent en masquer certaines. Vide pour l'instant : la mise
// en page de chaque projet est à construire de zéro, projet par projet.
const PROJECT_SECTIONS = {};

// Le slug vient de l'URL (?projet=...), posé par la page d'accueil au clic sur un
// objet. Il correspond exactement à "Projet (Nom Officiel)" du CSV, en
// minuscule, espaces conservés (ex. "break shot", "the cube").
function getSlugFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return (params.get('projet') || '').trim().toLowerCase();
}

// "break shot" -> "Break Shot" : capitalise chaque mot pour reconstruire le
// nom de fichier attendu (Data/nomenclature.csv utilise déjà cette casse
// pour "Projet (Nom Officiel)", mais on repart du slug pour ne pas dépendre
// du CSV avant qu'il ait fini de charger).
function toFileBaseName(slug) {
  return slug
    .split(' ')
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function applyTheme(theme) {
  // "sombre" / "clair" (colonne Thème du CSV) -> classe "dark" Tailwind
  // (tailwind.config = { darkMode: 'class' }, voir index.html).
  document.documentElement.classList.toggle('dark', theme === 'sombre');
}

function applySections(slug) {
  const enabled = PROJECT_SECTIONS[slug];
  if (!enabled) return; // pas de config pour ce projet -> tout reste affiché
  document.querySelectorAll('[data-section]').forEach(section => {
    if (!enabled.includes(section.dataset.section)) section.remove();
  });
}

// Cartes activables/désactivables par projet (clé = slug, valeur = liste
// des data-card à garder). Un projet absent de cet objet garde les 4
// cartes. Retire aussi le panneau plein écran correspondant (data-card-
// panel), sinon setupCardStack tenterait de câbler une carte qui n'existe
// plus.
const PROJECT_CARDS = {
  firefly: ['concept', 'prototyping', 'gravity-feed'], // pas de 4e carte pour ce projet
  monolith: ['concept', 'prototyping', 'gravity-feed'], // pas de 4e carte pour ce projet
  eden: ['concept', 'prototyping', 'gravity-feed'], // pas de 4e carte pour ce projet
  insight: ['concept', 'prototyping', 'gravity-feed'], // pas de 4e carte pour ce projet
  'hermès birkin sport': ['concept', 'prototyping'], // seulement 2 cartes pour ce projet
  osmose: ['concept', 'prototyping'], // seulement 2 cartes pour ce projet
};

function applyCards(slug) {
  const enabled = PROJECT_CARDS[slug];
  if (!enabled) return; // pas de config pour ce projet -> les 4 cartes restent
  document.querySelectorAll('.card[data-card]').forEach(card => {
    if (!enabled.includes(card.dataset.card)) card.remove();
  });
  document.querySelectorAll('[data-card-panel]').forEach(panel => {
    if (!enabled.includes(panel.dataset.cardPanel)) panel.remove();
  });
}

// Sections qui doivent apparaître EN MÊME TEMPS plutôt que chacune
// indépendamment (clé = data-section réellement observé/"meneur", valeur =
// les AUTRES data-section à révéler avec lui). Utile pour intro/block-2 :
// même gris, donc un fondu décalé entre les deux trahirait qu'il s'agit de
// deux sections distinctes plutôt que d'un seul bloc visuel. Les cartes
// elles-mêmes ne sont pas concernées, leur pile continue de se comporter
// normalement (survol/carrousel), seul le fondu D'ENTRÉE de la section qui
// les contient est concerné.
const REVEAL_GROUPS = {
  intro: ['block-2'],
};

// Fondu à l'entrée dans le viewport (voir .reveal / .reveal.is-visible
// dans style.css). Générique à [data-section] : à appeler APRÈS
// applySections, pour ne jamais observer une section déjà retirée du DOM
// pour ce projet.
//
// Si on scroll vite et qu'une section ressort du viewport avant la fin de
// son fondu, on le met en pause (on fige l'opacité actuelle, transition
// coupée) plutôt que de le laisser tourner hors champ pour rien ; il
// reprend depuis cette valeur dès qu'elle revient à l'écran. Une fois
// arrivée à opacity: 1 pour de bon, on arrête de la surveiller
// (dataset.revealed) : plus rien à mettre en pause à ce stade.
function setupScrollReveal() {
  const sections = document.querySelectorAll('[data-section]');
  if (!sections.length) return;

  // data-section des éléments "suiveurs" (voir REVEAL_GROUPS) : révélés en
  // même temps que leur meneur, jamais observés individuellement - sinon
  // ils pourraient très bien démarrer leur propre fondu séparément si le
  // scroll les fait entrer dans le viewport à un autre moment que lui.
  const followers = new Set(Object.values(REVEAL_GROUPS).flat());

  if (!('IntersectionObserver' in window)) {
    sections.forEach(el => el.classList.add('is-visible')); // dégrade proprement : tout reste visible
    return;
  }

  const reveal = (el) => {
    if (el.dataset.revealed) return;
    el.style.transition = '';
    el.style.opacity = '';
    el.classList.add('is-visible');
  };

  const pause = (el) => {
    if (el.dataset.revealed || !el.classList.contains('is-visible')) return;
    const current = getComputedStyle(el).opacity;
    if (current !== '1') {
      el.style.transition = 'none';
      el.style.opacity = current;
    }
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const el = entry.target;
      if (entry.isIntersecting) {
        reveal(el);
        (REVEAL_GROUPS[el.dataset.section] || []).forEach(key => {
          const partner = document.querySelector(`[data-section="${key}"]`);
          if (partner) reveal(partner);
        });
      } else {
        pause(el);
      }
    });
  }, { threshold: 0.15 });

  sections.forEach(el => {
    el.classList.add('reveal');
    el.addEventListener('transitionend', (e) => {
      if (e.propertyName !== 'opacity' || getComputedStyle(el).opacity !== '1') return;
      el.dataset.revealed = 'true';
      observer.unobserve(el);
    });
    if (!followers.has(el.dataset.section)) observer.observe(el);
  });
}

// Textes par projet (clé = slug). Chaque section porte un placeholder par
// défaut directement dans index.html (data-field="...") : un champ absent
// ici, ou un projet absent de cet objet, garde ce placeholder tel quel.
const PROJECT_CONTENT = {
  osmose: {
    'intro-title': 'Dive into sound',
    'intro-subtitle': 'Osmose redefines how you interact with physical music albums by turning them into connected tactile interfaces, allowing you to instantly launch your music with a simple gesture while triggering synchronized lighting effects.',
    'card-concept-title': 'Concept',
    'card-prototyping-title': '3D modelisation',
  },
  'the cube': {
    'intro-title': 'Infinite Shapes, Temporary Identities.',
    'intro-subtitle': 'Developed during a one-week workshop in partnership with ELBA/ORA Sounds of Crafters, this project features a modular one-cubic-meter system that transforms endlessly, offering every brand a blank, temporary canvas to express its unique artistic identity.',
    'card-concept-title': 'Context & Problem',
    'card-prototyping-title': 'The Concept',
    'card-gravity-feed-title': 'Modularity & System',
    'card-illumination-title': 'Renders',
  },
  'break shot': {
    'intro-title': 'Upcycled playfield.',
    'intro-subtitle': 'A one-week collaborative workshop focused on redesigning vintage 1950s classroom furniture into an ergonomic, functional gaming table.',
    'card-concept-title': 'Concept & Process',
    'card-prototyping-title': 'Digital Prototyping & 3D Printing',
    'card-gravity-feed-title': 'Gravity Feed System',
    'card-illumination-title': 'Serviceable Illumination',
  },
  'hermès birkin sport': {
    'intro-title': 'Refine elegance.',
    'intro-subtitle': 'Reconciling luxury codes with sports utility through a balance of sketch and 3D',
    'card-concept-title': 'Sketches and concept',
    'card-prototyping-title': '3D modelisation',
  },
  firefly: {
    'intro-title': 'Brutally warm.',
    'intro-subtitle': 'A hybrid lutherie that preserves the woody soul and warm sound of nylon strings, contrasted with a metallic edge and subverted design codes.',
    'card-concept-title': 'Design reflection',
    'card-prototyping-title': 'Process of fabrication',
    'card-gravity-feed-title': 'Sound design',
  },
  monolith: {
    'intro-title': 'Anchored Sound',
    'intro-subtitle': 'A vertical acoustic totem marrying the warmth of raw wood and industrial precision, engineered to anchor deep bass in the floor and lift sound into the space.',
    'card-concept-title': 'Design, 3D and Sound Design',
    'card-prototyping-title': 'Electronics',
    'card-gravity-feed-title': 'Fabrication and crafting',
  },
  eden: {
    'intro-title': 'Shaping harmony.',
    'intro-subtitle': 'A series of artistic and poetic experiments told through the renovation and customization of guitars.',
    'card-concept-title': 'The lab',
    'card-prototyping-title': 'Manifest',
    'card-gravity-feed-title': 'The culmination',
  },
  insight: {
    'intro-title': 'Observe Usage, Make solution.',
    'intro-subtitle': 'A unified workspace designed through upcycling, a cohesive material system, and custom functional integrations.',
    'card-concept-title': 'Screen recycling',
    'card-prototyping-title': 'Design language',
    'card-gravity-feed-title': 'Functional prints',
  },
  pulse: {
    'intro-title': 'Physically conscious.',
    'intro-subtitle': 'Designed in partnership with the Football Foundation, Pulse uses targeted physical stimuli to interrupt hyper-connected routines and foster mindful smartphone usage.',
    'card-concept-title': 'Problematic',
    'card-prototyping-title': 'Haptic feedback',
    'card-gravity-feed-title': 'Ecosystem',
    'card-illumination-title': '3D Showcase',
    'card-illumination-body':
      'The project is extended through a 3D animation presented as a spot, setting the case in motion and offering a more visual reading of its usage and intentions.',
  },
};

function applyContent(slug) {
  const content = PROJECT_CONTENT[slug];
  if (!content) return; // pas de contenu renseigné pour ce projet -> placeholders partout
  Object.entries(content).forEach(([field, text]) => {
    document.querySelectorAll(`[data-field="${field}"]`).forEach(el => {
      el.textContent = text;
    });
  });
}

// Texture de bruit (SVG feTurbulence en data URI, désaturée) : superposée
// au dégradé d'un titre via background-blend-mode pour un effet de grain
// (voir "grain" dans PROJECT_TITLE_STYLE, ex. Monolith).
const GRAIN_TEXTURE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E" +
  "%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E" +
  "%3CfeColorMatrix type='saturate' values='0'/%3E" +
  "%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='2' intercept='-0.5'/%3E" +
  "%3CfeFuncG type='linear' slope='2' intercept='-0.5'/%3E%3CfeFuncB type='linear' slope='2' intercept='-0.5'/%3E%3C/feComponentTransfer%3E" +
  "%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// Style du titre du projet (clé = slug) : un projet absent garde le style
// neutre défini dans index.html (text-neutral-900 / dark:text-white).
// backgroundImage -> dégradé façon bg-clip-text (voir Break Shot) ;
// color/textShadow -> couleur pleine + glow (voir Firefly).
const PROJECT_TITLE_STYLE = {
  'break shot': {
    backgroundImage: 'linear-gradient(to right, #650A0A, #D15C5C)',
  },
  osmose: {
    // Vague lettre par lettre en boucle (voir buildWavyTitle) - porté
    // depuis un composant React/Framer Motion, absents ici.
    wavy: true,
  },
  'the cube': {
    // Titre qui alterne entre deux phrases courtes (voir buildMorphTitle) :
    // chacune tient largement dans le viewport toute seule, donc plus
    // besoin de centerOverflow/fitTitleToViewport (pensés pour UN long
    // titre fixe qui déborde - plus le cas ici).
    morph: true,
    morphTexts: ['Infinite shapes,', 'Temporary Identities.'],
    backgroundImage: 'linear-gradient(to right, #4A4A4A, #B0B0B0)',
  },
  'hermès birkin sport': {
    color: '#3A3A3A', // gris foncé
    translateX: '0.1em', // léger décalage à droite (point final = illusion de centrage penché à gauche)
  },
  firefly: {
    color: '#FFFBF5', // presque blanc, à peine teinté d'orange
    textShadow: '0 0 30px rgba(255, 140, 0, 0.85), 0 0 70px rgba(255, 110, 0, 0.5)',
  },
  monolith: {
    backgroundImage: 'linear-gradient(to right, #000000, #808080)',
    grain: true, // texture de bruit superposée au dégradé (voir GRAIN_TEXTURE)
  },
  insight: {
    textShadow: '0 0 30px rgba(255, 255, 255, 0.6)',
    // Titre trop large pour tenir centré via text-align seul (déborde du
    // conteneur) : passage en inline-block + centrage par position, qui
    // recentre correctement même en débordement - posé en JS seulement sur
    // ce projet (pas dans style.css) pour ne pas affecter les autres titres.
    centerOverflow: true,
  },
  eden: {
    color: '#240442', // violet très sombre
    draw: true, // effet "se dessine au trait", voir buildDrawTitle() et .title-draw-text dans style.css
  },
  pulse: {
    // background-clip: text coupait systématiquement le bord droit de CE
    // titre précis, et le text-shadow seul ne donne qu'une ombre portée,
    // pas un vrai reflet métallique. On passe donc par la même approche
    // que pour Eden (SVG, voir buildMetalTitle) : un vrai dégradé posé en
    // fill SVG sur le texte, pas en background CSS clippé - technique déjà
    // éprouvée (Eden n'a jamais eu ce bug de découpe).
    metal: true,
  },
};

// Remplace le contenu texte de `title` par un <text> SVG dont le contour se
// trace au scroll (voir .title-draw-text dans style.css) - une vraie
// animation de tracé, contrairement à un simple cache qui glisse
// (clip-path). On ne peut pas réutiliser des tracés dessinés à la main
// (voir le composant Apple Hello d'origine, propre à "hello"/"xin chào") :
// on trace ici le contour des lettres du VRAI texte, tel que la police les
// dessine. viewBox calculé après coup via getBBox() (une fois le <text>
// dans le DOM) pour s'adapter à n'importe quelle longueur de titre.
function buildDrawTitle(title, color) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const text = title.textContent.trim();
  const computed = getComputedStyle(title);

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', computed.fontSize);
  svg.style.overflow = 'visible';
  svg.style.transform = 'translateX(0.08em)'; // léger décalage à droite : un point final en fin de titre fait paraître le centrage optique décalé à gauche

  const textEl = document.createElementNS(svgNS, 'text');
  textEl.classList.add('title-draw-text');
  textEl.setAttribute('x', '0');
  textEl.setAttribute('y', '0');
  textEl.setAttribute('dominant-baseline', 'text-before-edge');
  textEl.setAttribute('font-family', computed.fontFamily);
  textEl.setAttribute('font-weight', computed.fontWeight);
  textEl.setAttribute('font-size', computed.fontSize);
  textEl.setAttribute('stroke', color);
  textEl.setAttribute('stroke-width', '1.5');
  textEl.style.setProperty('--title-draw-color', color);
  textEl.textContent = text;

  svg.appendChild(textEl);
  title.textContent = '';
  title.appendChild(svg);

  const bbox = textEl.getBBox();
  svg.setAttribute('viewBox', `0 0 ${bbox.width} ${bbox.height}`);
  svg.setAttribute('height', `${bbox.height}px`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet'); // centre le tracé dans le SVG (100% de large), au lieu de le coller à gauche
}

// Effet "métal" (voir "metal" dans PROJECT_TITLE_STYLE, ex. Pulse) : dégradé
// posé en fill SVG plutôt qu'en background-clip:text CSS - cette dernière
// technique coupait le bord droit de "Physically conscious." dans le
// navigateur du client, alors que le SVG (même principe que buildDrawTitle
// pour Eden, jamais posé problème) ne dépend pas du clipping d'une boîte
// CSS. Même logique de centrage/adaptation à la longueur du texte.
function buildMetalTitle(title, stops) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const text = title.textContent.trim();
  const computed = getComputedStyle(title);
  const gradientId = 'metal-gradient-' + Math.random().toString(36).slice(2, 9);

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '100%');
  svg.style.overflow = 'visible';

  const defs = document.createElementNS(svgNS, 'defs');
  const gradient = document.createElementNS(svgNS, 'linearGradient');
  gradient.setAttribute('id', gradientId);
  gradient.setAttribute('x1', '0%');
  gradient.setAttribute('y1', '0%');
  gradient.setAttribute('x2', '100%');
  gradient.setAttribute('y2', '100%');
  stops.forEach(([offset, color]) => {
    const stop = document.createElementNS(svgNS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    gradient.appendChild(stop);
  });
  defs.appendChild(gradient);
  svg.appendChild(defs);

  const textEl = document.createElementNS(svgNS, 'text');
  textEl.setAttribute('x', '0');
  textEl.setAttribute('y', '0');
  textEl.setAttribute('dominant-baseline', 'text-before-edge');
  textEl.setAttribute('font-family', computed.fontFamily);
  textEl.setAttribute('font-weight', computed.fontWeight);
  textEl.setAttribute('font-size', computed.fontSize);
  textEl.setAttribute('fill', `url(#${gradientId})`);
  textEl.textContent = text;

  svg.appendChild(textEl);
  title.textContent = '';
  title.appendChild(svg);

  const bbox = textEl.getBBox();
  svg.setAttribute('viewBox', `0 0 ${bbox.width} ${bbox.height}`);
  svg.setAttribute('height', `${bbox.height}px`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
}

// Effet "morph" (voir "morph"/"morphTexts" dans PROJECT_TITLE_STYLE, ex.
// The Cube) : deux phrases se succèdent en boucle, la sortante se floute et
// disparaît pendant que l'entrante se défloute en apparaissant, avec un
// filtre SVG (feColorMatrix en seuil) qui donne cet aspect "liquide" aux
// bords pendant le flou - porté depuis un composant React (useRef/
// requestAnimationFrame) vers du DOM/rAF vanilla, ce site n'ayant pas de
// React. Les deux <span> partagent le même dégradé que le reste du titre
// (background-clip:text posé sur chacun, pas sur le conteneur - un texte
// différent par span, donc le clip doit être individuel).
function buildMorphTitle(title, texts, gradientCSS) {
  const svgNS = 'http://www.w3.org/2000/svg';
  title.textContent = '';
  title.classList.add('title-morph');

  const span1 = document.createElement('span');
  const span2 = document.createElement('span');
  [span1, span2].forEach(span => {
    span.className = 'title-morph-text';
    if (gradientCSS) {
      span.style.backgroundImage = gradientCSS;
      span.style.webkitBackgroundClip = 'text';
      span.style.backgroundClip = 'text';
      span.style.color = 'transparent';
    }
    title.appendChild(span);
  });

  // Filtre "goo" : une seule instance partagée pour toute la page (même id
  // référencé par style.css, .title-morph { filter: url(#title-morph-
  // threshold) ... }), pas besoin d'un exemplaire par titre.
  if (!document.getElementById('title-morph-threshold')) {
    const svg = document.createElementNS(svgNS, 'svg');
    svg.style.position = 'absolute';
    svg.style.width = '0';
    svg.style.height = '0';
    svg.innerHTML =
      '<defs><filter id="title-morph-threshold">' +
      '<feColorMatrix in="SourceGraphic" type="matrix" ' +
      'values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 255 -140"/>' +
      '</filter></defs>';
    document.body.appendChild(svg);
  }

  const MORPH_TIME = 1.5;
  const COOLDOWN_TIME = 1.5; // temps où chaque phrase reste affichée, immobile, avant le prochain morph
  let textIndex = 0;
  let morph = 0;
  let cooldown = 0;
  let lastTime = performance.now();

  const setStyles = (fraction) => {
    span2.style.filter = `blur(${Math.min(8 / fraction - 8, 100)}px)`;
    span2.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`;
    const inverted = 1 - fraction;
    span1.style.filter = `blur(${Math.min(8 / inverted - 8, 100)}px)`;
    span1.style.opacity = `${Math.pow(inverted, 0.4) * 100}%`;
    span1.textContent = texts[textIndex % texts.length];
    span2.textContent = texts[(textIndex + 1) % texts.length];
  };

  const doMorph = () => {
    title.classList.add('is-morphing'); // active le flou/filtre "liquide" du conteneur SEULEMENT pendant la transition
    morph -= cooldown;
    cooldown = 0;
    let fraction = morph / MORPH_TIME;
    if (fraction > 1) {
      cooldown = COOLDOWN_TIME;
      fraction = 1;
    }
    setStyles(fraction);
    if (fraction === 1) textIndex++;
  };

  const doCooldown = () => {
    title.classList.remove('is-morphing'); // texte net, sans flou/filtre, une fois la phrase posée
    morph = 0;
    span2.style.filter = 'none';
    span2.style.opacity = '100%';
    span1.style.filter = 'none';
    span1.style.opacity = '0%';
  };

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    cooldown -= dt;
    if (cooldown <= 0) doMorph();
    else doCooldown();
  }
  requestAnimationFrame(animate);
}

// Effet "wavy" (voir "wavy" dans PROJECT_TITLE_STYLE, ex. Osmose) : chaque
// lettre grossit et s'assombrit tour à tour, en boucle - porté depuis un
// composant React/Framer Motion (absents ici) vers une animation CSS pure
// (@keyframes + animation-delay par lettre, voir .title-wavy-letter dans
// style.css). Le "repeatDelay" de Framer Motion (pause entre deux
// répétitions) n'a pas d'équivalent direct en CSS : simulé en réservant une
// portion du timeline des keyframes à un simple "maintien" à l'état de
// repos, plutôt qu'en gardant le mouvement actif sur 100% de la durée.
function buildWavyTitle(title) {
  const text = title.textContent.trim();
  const activeDuration = 1.6; // durée du "bump" (taille/couleur) par lettre, voir @keyframes
  const cooldownTime = 3; // pause entre deux passages sur une même lettre
  const cycleDuration = activeDuration + cooldownTime;

  title.textContent = '';
  title.classList.add('title-wavy');
  text.split('').forEach((char, i) => {
    const span = document.createElement('span');
    span.className = 'title-wavy-letter';
    span.textContent = char === ' ' ? ' ' : char;
    span.style.animationDuration = `${cycleDuration}s`;
    span.style.animationDelay = `${i * 0.08}s`;
    title.appendChild(span);
  });
}

// Réduit la taille du titre SEULEMENT si son rendu réel déborde du
// viewport (ex. "Infinite Shapes, Temporary Identities" sur un écran
// ~1650px, coupé des deux côtés par overflow-x:hidden malgré un centrage
// par ailleurs correct) - le clamp() CSS partagé ne connaît pas la
// longueur du texte, seulement la largeur de la fenêtre, donc un titre
// plus long qu'un autre à la même taille peut déborder là où les autres
// tiennent. getBoundingClientRect() donne la largeur RÉELLE même quand le
// débordement est visuellement clippé par un ancêtre (mesure fiable). Ne
// touche à rien si le titre tient déjà - pas de réduction sur les écrans
// où ce n'est pas nécessaire.
// baseFontSize : taille "normale" à restaurer avant de re-mesurer (celle
// posée par style.fontSize si le projet en définit une, sinon '' pour
// laisser le clamp() CSS par défaut reprendre la main) - sans ça, un appel
// répété (resize) ne pourrait plus jamais re-grandir après un premier
// rétrécissement, et écraserait une taille personnalisée légitime.
function fitTitleToViewport(title, baseFontSize = '') {
  title.style.fontSize = baseFontSize;
  const available = window.innerWidth * 0.92; // petite marge de sécurité
  const width = title.getBoundingClientRect().width;
  if (width <= available) return;
  const currentSize = parseFloat(getComputedStyle(title).fontSize);
  title.style.fontSize = `${currentSize * (available / width)}px`;
}

function applyTitleStyle(slug) {
  const title = document.querySelector('[data-field="intro-title"]');
  const style = PROJECT_TITLE_STYLE[slug];
  if (!title || !style) return;
  if (style.morph) {
    // Chemin à part entière : le morph gère lui-même son dégradé (par
    // span, pas sur le h2) et sa mise en page - rien à voir avec le reste
    // (couleur pleine, centerOverflow, draw, metal...), donc pas de
    // fitTitleToViewport non plus (mesurerait l'ANCIEN texte complet,
    // encore présent à ce stade, et rétrécirait inutilement pour rien).
    buildMorphTitle(title, style.morphTexts, style.backgroundImage);
    return;
  }
  if (style.wavy) {
    // Chemin à part, comme morph : l'effet gère son propre découpage en
    // lettres, incompatible avec le reste (centerOverflow, draw, metal...).
    buildWavyTitle(title);
    return;
  }
  if (style.backgroundImage) {
    title.style.backgroundImage = style.backgroundImage;
    title.style.webkitBackgroundClip = 'text';
    title.style.backgroundClip = 'text';
    title.style.color = 'transparent';
    if (style.grain) {
      // background-blend-mode combiné à background-clip:text sur le MÊME
      // élément peut faire disparaître un glyphe isolé/petit (ex. un point
      // final) - bug de rendu déjà rencontré sur "Physically conscious.".
      // On pose donc le grain sur une couche séparée (::after, voir
      // style.css) qui se mélange avec mix-blend-mode PAR-DESSUS le texte
      // déjà rendu, plutôt que dans le même background-image.
      title.dataset.grainText = title.textContent.trim();
      title.style.setProperty('--grain-bg', GRAIN_TEXTURE);
      title.classList.add('title-grain-overlay');
    }
  } else if (style.color) {
    title.style.color = style.color;
  }
  if (style.textShadow) title.style.textShadow = style.textShadow;
  if (style.textStroke) {
    title.style.webkitTextStroke = style.textStroke;
  }
  if (style.fontSize) title.style.fontSize = style.fontSize;
  if (style.centerOverflow) {
    title.style.display = 'inline-block';
    title.style.position = 'relative';
    title.style.left = '50%';
    title.style.transform = 'translateX(-50%)';
  }
  if (style.translateX) title.style.transform = `translateX(${style.translateX})`;
  fitTitleToViewport(title, style.fontSize);
  window.addEventListener('resize', () => fitTitleToViewport(title, style.fontSize));
  if (style.draw) buildDrawTitle(title, style.color || '#000');
  if (style.metal) {
    buildMetalTitle(title, [
      ['0%', '#0A2E12'],
      ['22%', '#4CAF58'],
      ['45%', '#0A2E12'],
      ['68%', '#6FCF7C'],
      ['100%', '#0A2E12'],
    ]);
  }
}

// Fond par projet pour les sections qui doivent s'écarter du blanc/noir par
// défaut (clé = slug, valeur = { data-section: couleur }). Un projet absent
// garde le fond défini dans index.html (bg-white / dark:bg-black).
const PROJECT_BACKGROUNDS = {
  osmose: { intro: '#FFFFFF', 'block-2': '#FFFFFF' },
  monolith: { 'block-2': '#FFFFFF', intro: '#FFFFFF' },
  'hermès birkin sport': { intro: '#FFFFFF', 'block-2': '#FFFFFF' },
  'the cube': { intro: '#F3F3F3', 'block-2': '#F3F3F3' },
  eden: { intro: '#F3F3F3', 'block-2': '#F3F3F3' },
  pulse: { intro: '#F3F3F3', 'block-2': '#F3F3F3' },
};

function applyBackgrounds(slug) {
  const overrides = PROJECT_BACKGROUNDS[slug];
  if (!overrides) return;
  Object.entries(overrides).forEach(([section, color]) => {
    const el = document.querySelector(`[data-section="${section}"]`);
    if (el) el.style.backgroundColor = color;
  });
}

// Fond des cartes (et panneau plein écran associé) par projet - un projet
// absent garde le #141414 par défaut défini dans index.html/style.css.
// "color" ne s'applique qu'au titre du PANNEAU plein écran (.card-panel-
// title), pas à celui de la petite carte (.card-title) : la petite carte
// est maintenant couverte par une image (voir CARD_IMAGES), donc son titre
// doit rester blanc pour se voir dessus quel que soit le projet - seul le
// panneau, dont le fond reste uni (blanc pour ces projets), a besoin d'un
// texte sombre pour rester lisible. "shadow" adoucit l'ombre des cartes
// (0.9 d'opacité par défaut, pensée pour un fond sombre - trop dure sur un
// thème clair).
const PROJECT_CARD_STYLE = {
  monolith: { background: '#F3F3F3', color: '#1A1A1A', shadow: '0 20px 40px -12px rgba(0, 0, 0, 0.25)' },
  'hermès birkin sport': { background: '#F3F3F3', color: '#1A1A1A', shadow: '0 20px 40px -12px rgba(0, 0, 0, 0.25)' },
  eden: { background: '#FFFFFF', color: '#1A1A1A', shadow: '0 20px 40px -12px rgba(0, 0, 0, 0.25)' },
  'the cube': { background: '#FFFFFF', color: '#1A1A1A', shadow: '0 20px 40px -12px rgba(0, 0, 0, 0.25)' },
  osmose: { background: '#F3F3F3', color: '#1A1A1A', shadow: '0 20px 40px -12px rgba(0, 0, 0, 0.25)' },
  pulse: {
    background: '#FFFFFF',
    color: '#1A1A1A',
    shadow: '0 20px 40px -12px rgba(0, 0, 0, 0.25)',
    // Contrairement à monolith/eden, le petit texte de carte reste sombre
    // pour Pulse même hors plein écran (demande explicite) - d'où ce flag,
    // qui bascule .card-title en plus de .card-panel-title.
    cardTitleColor: true,
  },
};

function applyCardStyle(slug) {
  const style = PROJECT_CARD_STYLE[slug];
  if (!style) return;
  document.querySelectorAll('.card > div').forEach(el => { el.style.backgroundColor = style.background; });
  document.querySelectorAll('.card-panel').forEach(el => { el.style.backgroundColor = style.background; });
  if (style.cardTitleColor) {
    document.querySelectorAll('.card-title').forEach(el => { el.style.color = style.color; });
  }
  // La couleur du titre du panneau (blanc -> sombre) n'est PAS posée ici :
  // elle doit rester blanche (comme sur la carte) tant que le panneau est
  // encore de la taille de la carte, et ne virer au sombre qu'en fondu
  // pendant l'agrandissement plein écran (voir setupCardStack), sinon le
  // texte apparaît déjà sombre alors qu'il est encore au-dessus de l'image.
  if (style.shadow) {
    document.querySelectorAll('.card').forEach(el => { el.style.boxShadow = style.shadow; });
  }
  // Contrairement au titre du panneau, ce texte n'est jamais positionné
  // au-dessus de l'image (il vit dans l'espace libre à droite, voir
  // .card-panel-body) : pas besoin du fondu synchronisé à l'ouverture,
  // une couleur statique suffit.
  document.querySelectorAll('.card-panel-text').forEach(el => { el.style.color = style.color; });
}

// Images des cartes (clé = data-card-image) : même nom de fichier partagé
// entre tous les projets, chacun va chercher le sien dans son propre
// dossier ../input/<slug>/ (voir setupHero pour la même logique).
const CARD_IMAGES = {
  concept: 'Card 1.webp',
  prototyping: 'Card 2.webp',
  'gravity-feed': 'Card 3.webp',
  illumination: 'Card 4.webp',
};

function setupCardImages(slug) {
  Object.entries(CARD_IMAGES).forEach(([cardKey, filename]) => {
    const img = document.querySelector(`[data-card-image="${cardKey}"]`);
    if (img) img.src = `../input/${slug}/${filename}`;
  });
}

// Bucket Cloudflare R2 où vivent tous les fichiers vidéo du site (hero de
// /projets/ ET vidéos de carte ci-dessous) plutôt qu'en local - ~130 Mo de
// vidéos sur ~154 Mo au total avant migration.
const HERO_VIDEO_BASE_URL = 'https://pub-eac92b9122e546c4bcd5a334d7c6ee2c.r2.dev/';

// URL vidéo (clé = slug -> clé de carte) : soit un lien YouTube (injecté en
// <iframe>), soit un fichier vidéo direct (.mp4/.webm, ex. hébergé sur
// Cloudflare R2 comme les vidéos hero) - injecté en <video controls> pour
// avoir un vrai lecteur natif (play/pause, volume, barre de progression,
// plein écran), sans dépendre du chrome YouTube. Détecté automatiquement
// via l'URL, voir setupCardVideos.
const CARD_VIDEOS = {
  pulse: {
    illumination: `${HERO_VIDEO_BASE_URL}Pulse 3D Showcase.mp4`,
  },
};

function toYoutubeEmbedUrl(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([\w-]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

function isYoutubeUrl(url) {
  return /youtu\.be\/|youtube\.com\//.test(url);
}

function setupCardVideos(slug) {
  const videos = CARD_VIDEOS[slug];
  if (!videos) return;
  Object.entries(videos).forEach(([cardKey, url]) => {
    const container = document.querySelector(`[data-card-video="${cardKey}"]`);
    if (!container) return;
    if (isYoutubeUrl(url)) {
      const iframe = document.createElement('iframe');
      iframe.src = toYoutubeEmbedUrl(url);
      iframe.title = 'Vidéo du projet';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.allowFullscreen = true;
      container.appendChild(iframe);
    } else {
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      container.appendChild(video);
    }
  });
}

// Doit correspondre à la durée de transition de #hero-image dans style.css.
const HERO_FADE_MS = 800;

// Network Information API (Chromium seulement - absente sur Safari/Firefox,
// d'où le premier test) : effectiveType estime la vitesse réelle mesurée
// (pas juste le type de connexion), saveData reflète le mode "Économie de
// données" activé par le visiteur. Sans cette API, on part du principe que
// la connexion est correcte (comportement inchangé) plutôt que de priver
// inutilement les navigateurs qui ne l'exposent pas.
function isSlowConnection() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return false;
  return connection.saveData || ['slow-2g', '2g'].includes(connection.effectiveType);
}

// Lance la vidéo du projet, puis fait place à l'image fixe une fois
// terminée (ou immédiatement si l'asset vidéo est introuvable, ou si la
// connexion est détectée comme trop lente pour charger plusieurs dizaines
// de Mo de vidéo - dans ce cas on ne déclenche même pas le téléchargement,
// l'image fixe (quelques centaines de Ko) s'affiche directement).
function setupHero(slug) {
  const folder = `../input/${slug}/`;
  const baseName = toFileBaseName(slug);
  const video = document.getElementById('hero-video');
  const heroImage = document.getElementById('hero-image');
  const heroSection = document.getElementById('hero');
  let isActive = true; // false une fois remplacée par l'image fixe : plus rien à mettre en pause

  const revealHeroImage = () => {
    // L'image monte en opacité par-dessus la vidéo, qui reste affichée telle
    // quelle en-dessous (voir style.css) : un vrai fondu enchaîné. On ne
    // masque/coupe la vidéo qu'une fois ce fondu terminé, pour ne jamais
    // exposer le flash noir que certains navigateurs affichent à "ended".
    isActive = false;
    heroImage.classList.add('is-visible');
    setTimeout(() => video.classList.add('is-hidden'), HERO_FADE_MS);
  };

  heroImage.addEventListener('error', () => {
    console.error(`Image hero introuvable : "${baseName} Hero.webp" (${heroImage.src})`);
  });
  heroImage.src = `${folder}${baseName} Hero.webp`;

  if (isSlowConnection()) {
    revealHeroImage(); // pas de video.src posé du tout : aucune requête vidéo déclenchée
    return;
  }

  video.addEventListener('ended', revealHeroImage);
  video.addEventListener('error', revealHeroImage);

  // Coupe la vidéo dès que la section hero n'est plus du tout visible
  // (par ex. une fois qu'on a scrollé jusqu'aux sections suivantes), et la
  // relance si on remonte avant qu'elle soit terminée - pas de raison de la
  // laisser tourner (décodage vidéo) hors champ.
  if (heroSection && 'IntersectionObserver' in window) {
    const visibilityObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!isActive) return; // déjà remplacée par l'image fixe
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      });
    }, { threshold: 0 });
    visibilityObserver.observe(heroSection);
  }

  video.src = `${HERO_VIDEO_BASE_URL}${baseName}.mp4`;
  video.play().catch(() => {
    // Lecture auto refusée par le navigateur (rare avec muted+playsinline,
    // mais ne doit pas bloquer l'affichage) : on révèle direct l'image fixe.
    revealHeroImage();
  });
}

// Pile de cartes façon carrousel : quelle carte est "active" (agrandie)
// n'est plus déterminée par :hover directement sur chaque carte (voir
// style.css, .card-row.is-interacting) : elle avance d'une seule carte à la
// fois vers celle survolée, et attend que l'étape en cours ait FINI de
// s'agrandir avant de passer à la suivante. Un passage rapide de la souris
// vers une carte éloignée ne fait donc plus sauter/clignoter plusieurs
// cartes en même temps - la pile grandit une par une, dans l'ordre.
function setupCardCarousel() {
  const row = document.querySelector('.card-row');
  if (!row) return;
  const cards = Array.from(row.querySelectorAll('.card[data-card]'));
  const count = cards.length;
  if (!count) return;

  let activeIndex = null;
  let locked = false; // une étape (agrandissement) est en cours
  let pendingTarget = null; // carte visée une fois l'étape en cours terminée

  // Durée de la transition width/height des cartes (voir .card-row .card
  // dans style.css) : le verrou se lève un peu AVANT la fin réelle de cette
  // transition, pour que la carte suivante commence déjà à s'agrandir
  // pendant que la précédente termine la sienne - un léger chevauchement,
  // plus fluide qu'un enchaînement strictement l'une après l'autre.
  const STEP_MS = 600;
  const OVERLAP_MS = 180;

  // will-change posé/retiré en JS seulement sur la carte concernée (même
  // principe que object-img/shadow-img sur l'accueil) : le laisser en
  // permanence sur les 4 cartes forcerait le navigateur à garder 4 calques
  // GPU dédiés en continu pour rien, une seule carte à la fois transitionne
  // vraiment la plupart du temps.
  const settlePerf = (card) => {
    card.style.willChange = 'width, height';
    card.addEventListener('transitionend', function onEnd(e) {
      if (e.target !== card) return;
      card.removeEventListener('transitionend', onEnd);
      if (!card.classList.contains('is-focused')) card.style.willChange = 'auto';
    });
  };

  const goTo = (index) => {
    activeIndex = index;
    locked = true;
    cards.forEach((c, i) => {
      c.classList.toggle('is-focused', i === index);
      settlePerf(c);
    });
    setTimeout(() => {
      locked = false;
      if (pendingTarget !== null && pendingTarget !== activeIndex) stepToward(pendingTarget);
    }, STEP_MS - OVERLAP_MS);
  };

  // N'avance jamais que d'une carte à la fois vers la cible : si l'étape en
  // cours n'est pas terminée, mémorise juste la cible pour continuer une
  // fois le verrou levé (voir goTo -> transitionend).
  function stepToward(target) {
    if (target === activeIndex) { pendingTarget = null; return; }
    if (locked) { pendingTarget = target; return; }
    pendingTarget = target;
    if (activeIndex === null) { goTo(target); return; } // premier survol : rien à traverser
    const step = target > activeIndex ? 1 : -1;
    goTo(activeIndex + step);
  }

  cards.forEach((card, i) => {
    card.addEventListener('mouseenter', () => {
      row.classList.add('is-interacting');
      stepToward(i);
    });
  });

  row.addEventListener('mouseleave', () => {
    row.classList.remove('is-interacting');
    activeIndex = null;
    pendingTarget = null;
    locked = false;
    cards.forEach(c => c.classList.remove('is-focused'));
  });
}

// Position/taille cible de l'image dans le panneau plein écran : calculée
// en JS plutôt que lue sur un placeholder CSS, pour rester en coordonnées
// viewport (voir pourquoi dans setupCardStack : l'image passe en position:
// fixed pendant toute l'animation). Doit rester cohérent avec l'ancien
// habillage visuel (left-16, ~38vw plafonné à 70vh). aspectRatio = largeur/
// hauteur (1 = carré par défaut ; voir PANEL_IMAGE_OVERRIDES pour un ratio
// différent, ex. 16/9).
// maxWidth (px, optionnel) : espace RÉELLEMENT laissé par .card-panel-body,
// qui est prioritaire (voir style.css - sa taille ne dépend plus de
// l'image, c'est l'inverse). Sans texte/vidéo pour cette carte, maxWidth
// est absent et l'image profite de tout le budget de hauteur normalement.
function computePanelImageTargetRect(aspectRatio = 1, maxWidth = Infinity) {
  const vh = window.innerHeight;
  // Dimensionnée à partir du budget de HAUTEUR (0.7vh) par défaut - vh et
  // pas vw, même raison que partout ailleurs (taille relative cohérente
  // quel que soit le ratio d'écran, voir .card-row .card) - sauf si
  // maxWidth (l'espace laissé par le bloc texte/vidéo) est plus restrictif,
  // auquel cas la largeur cède la priorité et la hauteur est recalculée en
  // conséquence pour garder l'aspectRatio intact.
  const maxHeight = vh * 0.7;
  let height = maxHeight;
  let width = Math.min(height * aspectRatio, maxWidth);
  height = width / aspectRatio;
  const left = 64; // left-16 = 4rem
  const top = (vh - height) / 2; // centré verticalement
  return { top, left, width, height };
}

// Espace réellement laissé à l'image par .card-panel-body (prioritaire,
// voir style.css - sa taille ne dépend plus de l'image) : lu sur son rect
// RÉEL plutôt que recalculé en JS, pour ne jamais désynchroniser des
// règles CSS (min(130vh, calc(...)) notamment). Le gabarit (texte + vidéo)
// existe dans le HTML de TOUTES les cartes/projets, mais reste vide tant
// qu'aucun contenu n'est prévu (voir PROJECT_CONTENT/CARD_VIDEOS) - .card-
// panel-text/.card-panel-video sont alors display:none via :empty, mais le
// conteneur .card-panel-body, lui, garderait sa largeur (min(130vh, ...))
// même invisible : sans ce garde-fou, il continuerait à "manger" de la
// place et rétrécirait l'image pour rien sur toutes les cartes sans
// contenu. Pas de contenu -> Infinity, l'image garde tout le budget de
// hauteur comme avant l'ajout de ce gabarit.
function panelBodyHasContent(panelBody) {
  if (!panelBody) return false;
  const text = panelBody.querySelector('.card-panel-text');
  const video = panelBody.querySelector('.card-panel-video');
  return !!((text && text.textContent.trim()) || (video && video.children.length > 0));
}

function getImageMaxWidth(panelBody) {
  if (!panelBodyHasContent(panelBody)) return Infinity;
  const gap = 48; // 3rem
  const leftMargin = 64; // 4rem
  return panelBody.getBoundingClientRect().left - leftMargin - gap;
}

// Cas particuliers où l'image du panneau plein écran ne doit pas suivre le
// traitement par défaut (carré, image entière) - clé = slug, puis data-card.
// aspectRatio : voir computePanelImageTargetRect. cropScale : zoom appliqué
// à l'image (scale() uniforme, donc pas de déformation - voir le
// commentaire plus bas sur pourquoi PAS de scale non-uniforme) pour cadrer
// plus serré que ce qu'object-fit: cover ferait seul.
const PANEL_IMAGE_OVERRIDES = {
  eden: {
    concept: { aspectRatio: 16 / 9, cropScale: 1.45 }, // ~15% de recadrage
  },
  monolith: {
    concept: { aspectRatio: 16 / 9, cropScale: 1 }, // pas de recadrage, juste le format 16/9
    prototyping: { aspectRatio: 16 / 9, cropScale: 1.24 }, // ~8% de recadrage
    'gravity-feed': { aspectRatio: 9 / 16, cropScale: 1 }, // format portrait, pas de recadrage
  },
  insight: {
    prototyping: { aspectRatio: 16 / 9, cropScale: 1 }, // pas de recadrage, juste le format 16/9
    'gravity-feed': { aspectRatio: 16 / 9, cropScale: 1 }, // pas de recadrage, juste le format 16/9
  },
  pulse: {
    concept: { aspectRatio: 9 / 16, cropScale: 1 }, // format portrait, pas de recadrage
    'gravity-feed': { aspectRatio: 16 / 9, cropScale: 1.6 }, // ~20% de recadrage
    illumination: { aspectRatio: 4 / 3, cropScale: 1 },
  },
  'hermès birkin sport': {
    concept: { aspectRatio: 16 / 9, cropScale: 1 }, // pas de recadrage, juste le format 16/9
  },
  'the cube': {
    concept: { aspectRatio: 9 / 16, cropScale: 1 }, // format portrait, pas de recadrage
    illumination: { aspectRatio: 16 / 9, cropScale: 1 }, // pas de recadrage, juste le format 16/9
  },
  osmose: {
    concept: { aspectRatio: 9 / 16, cropScale: 1 }, // format portrait, pas de recadrage
    prototyping: { aspectRatio: 16 / 9, cropScale: 1 }, // pas de recadrage, juste le format 16/9
  },
  'break shot': {
    concept: { aspectRatio: 9 / 16, cropScale: 1 }, // format portrait, pas de recadrage
  },
};

const IMAGE_TRANSITION =
  'top 0.6s cubic-bezier(0.65, 0, 0.35, 1), left 0.6s cubic-bezier(0.65, 0, 0.35, 1), ' +
  'width 0.6s cubic-bezier(0.65, 0, 0.35, 1), height 0.6s cubic-bezier(0.65, 0, 0.35, 1), ' +
  'transform 0.6s cubic-bezier(0.65, 0, 0.35, 1), border-radius 0.6s cubic-bezier(0.65, 0, 0.35, 1)';

// Arrondi de l'image une fois le panneau plein écran ouvert (plus prononcé
// que le rounded-lg/0.5rem habituel de la carte).
const PANEL_IMAGE_RADIUS = '1.5rem';

// Décalage du recadrage (object-position) d'une image de carte une fois en
// plein écran, pour les cartes SANS PANEL_IMAGE_OVERRIDES (conteneur carré
// inchangé) : par défaut object-fit: cover centre l'image (50% 50%), ici on
// décale ce centre pour montrer davantage un côté au détriment de l'autre
// (ex. "100% 50%" = ancre à droite -> recadre à gauche, le contenu visible
// semble glisser vers la gauche).
const PANEL_IMAGE_OBJECT_POSITION = {};

function setImageRect(img, rect) {
  img.style.top = `${rect.top}px`;
  img.style.left = `${rect.left}px`;
  img.style.width = `${rect.width}px`;
  img.style.height = `${rect.height}px`;
}

// Pile de cartes (voir index.html, section [data-section="cards"]) : au
// clic sur une carte, son panneau [data-card-panel] s'anime depuis le rect
// réel de la carte jusqu'au plein écran (technique FLIP), avec la bordure
// arrondie qui se résorbe en même temps (voir .card-panel dans style.css).
// L'image de la carte (une seule instance, pas de doublon) passe en
// position: fixed le temps de l'animation, et on transitionne ses vraies
// propriétés top/left/width/height (pas de transform: scale()) : un
// scale() non uniforme (X ≠ Y, nécessaire vu que la carte est portrait et
// la cible du panneau carrée) étire visuellement les pixels de l'image
// pendant toute la transition, object-fit: cover n'a aucune prise sur un
// calque déjà déformé par transform. En animant top/left/width/height pour
// de vrai, object-fit: cover recalcule le recadrage correctement à chaque
// frame - aucun étirement possible, et aucun delta à calculer (donc aucun
// risque que l'animation "aille trop loin").
// Pas de gate par slug ici : le mécanisme est le même pour tous les projets.
function setupCardStack() {
  // Panneau actuellement ouvert (au plus un à la fois) : permet au listener
  // resize ci-dessous de recalculer/réappliquer le rect cible de SON image
  // en direct, sans quoi computePanelImageTargetRect n'est évalué qu'une
  // fois à l'ouverture et le rendu reste figé sur la taille de fenêtre
  // d'origine tant qu'on ne ferme/rouvre pas la carte.
  let currentOpen = null;

  document.querySelectorAll('.card[data-card]').forEach(card => {
    const panel = document.querySelector(`[data-card-panel="${card.dataset.card}"]`);
    if (!panel) return;

    const closeBtn = panel.querySelector('[data-card-close]');
    const cardImg = card.querySelector('[data-card-image]');
    const cardImgHome = cardImg ? cardImg.parentElement : null; // pour la remettre à sa place à la fermeture
    const imageOverride = (PANEL_IMAGE_OVERRIDES[slug] || {})[card.dataset.card];
    const objectPosition = (PANEL_IMAGE_OBJECT_POSITION[slug] || {})[card.dataset.card];
    const panelImgContainer = panel.querySelector('.image-container-target');
    const panelTitle = panel.querySelector('.card-panel-title');
    const panelBody = panel.querySelector('.card-panel-body');
    const cardStyle = PROJECT_CARD_STYLE[slug]; // couleur cible du titre une fois le panneau plein écran
    let bodyRevealTimeout = null;

    const placePanelOnCard = () => {
      const rect = card.getBoundingClientRect();
      panel.style.top = `${rect.top}px`;
      panel.style.left = `${rect.left}px`;
      panel.style.width = `${rect.width}px`;
      panel.style.height = `${rect.height}px`;
    };

    let savedScrollY = 0;

    const open = () => {
      placePanelOnCard();
      panel.hidden = false;
      if (panelTitle) panelTitle.style.opacity = '1'; // au cas où une fermeture précédente l'a laissé à 0
      // overflow: hidden sur body SEUL ne bloque pas le scroll de façon
      // fiable dans tous les navigateurs : selon le mode de rendu, c'est
      // <html> (documentElement), pas <body>, qui fait défiler la page -
      // on bloque donc les deux. On mémorise aussi la position de scroll
      // pour la restaurer explicitement à la fermeture (voir close), au
      // cas où un navigateur laisserait quand même passer un peu de scroll
      // pendant que le panneau est ouvert.
      savedScrollY = window.scrollY;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';

      if (cardImg && panelImgContainer) {
        const startRect = cardImg.getBoundingClientRect();
        panelImgContainer.appendChild(cardImg); // pour passer au-dessus (z-index du panneau, 200)

        if (imageOverride) {
          // Le CONTENEUR devient la fenêtre fixe qui recadre (overflow:
          // hidden) ; l'image à l'intérieur est simplement plus grande que
          // lui et centrée (object-fit: cover, déjà sur la classe de
          // l'image). Un vrai recadrage DANS une fenêtre de taille fixe -
          // contrairement à un transform: scale() posé sur l'image elle-
          // même, qui grossit tout l'ensemble déjà découpé (coins arrondis
          // compris) au lieu de resserrer le cadrage.
          panelImgContainer.style.transition = 'none';
          panelImgContainer.style.position = 'fixed';
          panelImgContainer.style.overflow = 'hidden';
          panelImgContainer.style.borderRadius = '0.5rem';
          panelImgContainer.style.zIndex = '0'; // reste sous .card-panel-title (z-index: 1)
          setImageRect(panelImgContainer, startRect);

          cardImg.style.transition = 'none';
          cardImg.style.position = 'absolute';
          cardImg.style.top = '50%';
          cardImg.style.left = `${imageOverride.focusX ?? 50}%`;
          cardImg.style.width = '100%';
          cardImg.style.height = '100%';
          cardImg.style.margin = '0';
          cardImg.style.transform = 'translate(-50%, -50%)';
        } else {
          cardImg.style.transition = 'none';
          cardImg.style.position = 'fixed';
          cardImg.style.margin = '0';
          cardImg.style.zIndex = '0'; // reste sous .card-panel-title (z-index: 1)
          if (objectPosition) cardImg.style.objectPosition = objectPosition;
          setImageRect(cardImg, startRect); // même position/taille qu'avant : aucun saut visuel
        }
      }

      // Un seul rAF ne suffit pas toujours à garantir que le navigateur a
      // peint l'état initial (rect de la carte) avant qu'on ne déclenche la
      // transition vers le plein écran : deux rAF imbriqués le garantissent.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          panel.classList.add('is-open');
          panel.style.top = '0px';
          panel.style.left = '0px';
          panel.style.width = '100vw';
          panel.style.height = '100vh';
          // Même déclencheur que l'agrandissement du panneau : le titre
          // passe du blanc (couleur carte) au sombre en fondu PENDANT que
          // le panneau grandit, pas avant - il ne finit sombre qu'une fois
          // le fond uni du panneau bien établi, plus au-dessus de l'image.
          if (panelTitle && cardStyle) panelTitle.style.color = cardStyle.color;
          if (cardImg && panelImgContainer) {
            const targetRect = computePanelImageTargetRect(imageOverride?.aspectRatio, getImageMaxWidth(panelBody));
            if (imageOverride) {
              panelImgContainer.style.transition = IMAGE_TRANSITION;
              setImageRect(panelImgContainer, targetRect);
              panelImgContainer.style.borderRadius = PANEL_IMAGE_RADIUS;
              cardImg.style.transition = IMAGE_TRANSITION;
              cardImg.style.width = `${imageOverride.cropScale * 100}%`;
              cardImg.style.height = `${imageOverride.cropScale * 100}%`;
            } else {
              cardImg.style.transition = IMAGE_TRANSITION;
              setImageRect(cardImg, targetRect);
              cardImg.style.borderRadius = PANEL_IMAGE_RADIUS;
            }
          }
          currentOpen = { cardImg, panelImgContainer, imageOverride, panel, panelBody };
          // Le texte/vidéo n'apparaissent qu'une fois le panneau vraiment
          // en plein écran (durée de sa transition top/left/width/height,
          // voir .card-panel dans style.css), jamais en même temps que
          // l'agrandissement.
          if (panelBodyHasContent(panelBody)) {
            clearTimeout(bodyRevealTimeout);
            bodyRevealTimeout = setTimeout(() => panelBody.classList.add('is-visible'), 600);
          }
        });
      });
    };

    // Durée du fondu de sortie de .card-panel-body (voir style.css) : le
    // rétrécissement du panneau attend que ce fondu soit terminé avant de
    // démarrer, pour ne pas rapetisser la carte pendant que texte/vidéo
    // sont encore visibles dessus.
    const BODY_FADE_MS = 500;

    const close = () => {
      currentOpen = null;
      clearTimeout(bodyRevealTimeout);
      const wasBodyVisible = !!(panelBody && panelBody.classList.contains('is-visible'));
      if (panelBody) panelBody.classList.remove('is-visible');

      const startShrink = () => {
        // L'élément qui reste position: fixed (donc au-dessus, z-index du
        // panneau) pendant tout le rétrécissement dépend du mode - la
        // remettre dans la carte trop tôt la ferait passer derrière le
        // panneau encore plein écran. On calcule juste où elle doit finir
        // (le rect actuel de son emplacement dans la carte, qui n'a jamais
        // bougé) et on anime vers ce rect ; le vrai rattachement au DOM de
        // la carte n'a lieu qu'à la toute fin (transitionend), une fois le
        // panneau caché.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            panel.classList.remove('is-open');
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            window.scrollTo(0, savedScrollY); // remet la page où elle était AVANT de mesurer la carte ci-dessous
            placePanelOnCard(); // rétrécit vers la carte d'origine plutôt que de disparaître d'un coup
            if (panelTitle && cardStyle) panelTitle.style.color = ''; // repasse en blanc, en fondu, pendant le rétrécissement
            // Le titre est bien trop grand pour la carte une fois rétrécie : au
            // lieu de le laisser se faire couper puis disparaître d'un coup
            // (panel.hidden au transitionend), on le fait disparaître en fondu
            // sur la même durée que le rétrécissement du panneau.
            if (panelTitle) panelTitle.style.opacity = '0';
            if (cardImg && cardImgHome) {
              const homeRect = cardImgHome.getBoundingClientRect();
              if (imageOverride) {
                panelImgContainer.style.transition = IMAGE_TRANSITION;
                setImageRect(panelImgContainer, homeRect);
                panelImgContainer.style.borderRadius = '0.5rem';
                cardImg.style.transition = IMAGE_TRANSITION;
                cardImg.style.width = '100%';
                cardImg.style.height = '100%';
              } else {
                cardImg.style.transition = IMAGE_TRANSITION;
                setImageRect(cardImg, homeRect);
                cardImg.style.borderRadius = '0.5rem';
              }
            }
          });
        });

        panel.addEventListener('transitionend', function onEnd(e) {
          if (e.target !== panel) return;
          panel.hidden = true;
          panel.removeEventListener('transitionend', onEnd);
          if (panelTitle) {
            panelTitle.style.opacity = '';
            panelTitle.style.color = '';
          }
          if (cardImg && cardImgHome) {
            cardImg.style.transition = 'none';
            cardImg.style.transform = '';
            cardImg.style.position = '';
            cardImg.style.margin = '';
            cardImg.style.zIndex = '';
            cardImg.style.top = '';
            cardImg.style.left = '';
            cardImg.style.width = '';
            cardImg.style.height = '';
            cardImg.style.borderRadius = '';
            cardImg.style.objectPosition = '';
            cardImgHome.appendChild(cardImg);

            if (imageOverride) {
              panelImgContainer.style.transition = '';
              panelImgContainer.style.position = '';
              panelImgContainer.style.overflow = '';
              panelImgContainer.style.borderRadius = '';
              panelImgContainer.style.zIndex = '';
              panelImgContainer.style.top = '';
              panelImgContainer.style.left = '';
              panelImgContainer.style.width = '';
              panelImgContainer.style.height = '';
            }
          }
        });
      };

      if (wasBodyVisible) {
        setTimeout(startShrink, BODY_FADE_MS);
      } else {
        startShrink();
      }
    };

    card.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) close();
    });
  });

  window.addEventListener('resize', () => {
    if (!currentOpen) return;
    const { cardImg, panelImgContainer, imageOverride, panelBody } = currentOpen;
    const targetRect = computePanelImageTargetRect(imageOverride?.aspectRatio, getImageMaxWidth(panelBody));
    if (imageOverride) {
      setImageRect(panelImgContainer, targetRect);
    } else {
      setImageRect(cardImg, targetRect);
    }
  });
}

const slug = getSlugFromUrl();

if (!slug) {
  document.body.innerHTML = '<p class="p-8 text-neutral-500">Aucun projet spécifié dans l\'URL (?projet=...).</p>';
} else {
  setupHero(slug);
  applySections(slug);
  applyCards(slug);
  setupScrollReveal();
  applyContent(slug);
  applyTitleStyle(slug);
  applyBackgrounds(slug);
  applyCardStyle(slug);
  setupCardImages(slug);
  setupCardVideos(slug);
  setupCardStack();
  setupCardCarousel();

  fetch(CSV_PATH)
    .then(response => response.text())
    .then(parseCsv)
    .then(rows => rows.find(row => row['Projet (Nom Officiel)'].trim().toLowerCase() === slug))
    .then(row => {
      if (!row) {
        console.error(`Aucune ligne CSV ne correspond au projet "${slug}"`);
        return;
      }
      applyTheme(row['Thème']);
      document.title = row['Projet (Nom Officiel)']; // onglet du navigateur uniquement, pas de titre affiché sur la page
    });
}
