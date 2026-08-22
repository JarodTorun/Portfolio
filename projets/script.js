// Décide UNE FOIS, au chargement, si on sert la structure mobile ou desktop -
// tout le reste de ce fichier (et la mise en page elle-même, voir index.html/
// style.css) se base sur ce seul indicateur plutôt que de re-tester la
// largeur ailleurs. Figé au chargement, PAS réévalué au resize : la
// structure va différer (pas juste des ajustements CSS, voir la demande de
// version mobile "vraiment différente") - un simple redimensionnement de
// fenêtre desktop ne doit pas la faire basculer en cours de session.
// document.documentElement.clientWidth, PAS window.innerWidth : ce dernier
// s'est révélé peu fiable en émulation mobile (Chrome DevTools) dans
// certaines configurations, retournant la largeur du viewport desktop par
// défaut (~980px) alors que clientWidth reflète correctement l'appareil
// émulé - identiques sur un vrai téléphone, donc sans risque pour de vrais
// visiteurs mobiles.
const IS_MOBILE = document.documentElement.clientWidth <= 900;
// Classe sur <html> plutôt qu'un @media : permet au CSS de cibler cette
// MÊME décision figée au chargement (voir IS_MOBILE ci-dessus), au lieu de
// réagir en direct à la largeur de la fenêtre.
document.documentElement.classList.toggle('is-mobile', IS_MOBILE);

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

// Présélections de cartes actives, réutilisées par plusieurs projets ci-
// dessous (voir PROJECT_CARDS) : juste lues (jamais modifiées), donc
// partager la même référence de tableau entre plusieurs clés est sans
// risque.
const CARDS_1_TO_3 = ['card-1', 'card-2', 'card-3'];
const CARDS_1_TO_2 = ['card-1', 'card-2'];

// Cartes activables/désactivables par projet (clé = slug, valeur = liste
// des data-card à garder, voir CARDS_1_TO_3/CARDS_1_TO_2 ci-dessus). Un
// projet absent de cet objet garde les 4 cartes. Retire aussi le panneau
// plein écran correspondant (data-card-panel), sinon setupCardStack
// tenterait de câbler une carte qui n'existe plus.
const PROJECT_CARDS = {
  firefly: CARDS_1_TO_3, // pas de 4e carte pour ce projet
  monolith: CARDS_1_TO_3, // pas de 4e carte pour ce projet
  eden: CARDS_1_TO_3, // pas de 4e carte pour ce projet
  insight: CARDS_1_TO_3, // pas de 4e carte pour ce projet
  'hermès birkin sport': CARDS_1_TO_2, // seulement 2 cartes pour ce projet
  osmose: CARDS_1_TO_2, // seulement 2 cartes pour ce projet
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
// card-N-title / card-N-body : N = 1..4, voir index.html.
const PROJECT_CONTENT = {
  osmose: {
    'intro-title': 'Dive into sound',
    'intro-subtitle': 'Osmose redefines how you interact with physical music albums by turning them into connected tactile interfaces, allowing you to instantly launch your music with a simple gesture while triggering synchronized lighting effects.',
    'card-1-title': 'Concept',
    'card-1-body':
      'Osmose answers the <strong>digitalization of media</strong> with frames embedding an <strong>NFC chip</strong> and <strong>LED panels</strong> that light up the chosen album. Paired with a projector, placing your <strong>phone on the frame</strong> brings up the <strong>playback controls</strong>, making music as much observed as heard.',
    'card-2-title': 'Visualizations / 3D Renders',
  },
  'the cube': {
    'intro-title': 'Infinite Shapes, Temporary Identities.',
    'intro-subtitle': 'Developed during a one-week workshop in partnership with ELBA/ORA Sounds of Crafters, this project features a modular one-cubic-meter system that transforms endlessly, offering every brand a blank, temporary canvas to express its unique artistic identity.',
    'card-1-title': 'Context & Problem',
    'card-1-body':
      'Part of a broader reflection on <strong>activation furniture</strong> for the Shiseido group, addressing <strong>sustainability</strong>, <strong>eco-design</strong>, and <strong>modularity</strong> while strengthening brand identity and customer experience.\n\nFinal problem statement: how can we offer a space that acts as a <strong>\'canvas\'</strong>, one that each brand could temporarily paint?',
    'card-2-title': 'The Concept',
    'card-2-body':
      '"The Cube" is a <strong>modular, neutral base</strong> that transforms to match different brands\' visual identity (Shiseido, Nars, Drunk Elephant...); a <strong>one-cubic-meter platform</strong> for infinite expression.\n\nReplacing disposable activation furniture with a <strong>reusable system</strong> cuts the cost of manufacturing new elements for every event.',
    'card-3-title': 'Modularity & System',
    'card-3-body':
      '<strong>Magnetized pieces</strong> extracted from a single cube rearrange into new structures (furniture, logos...), staying <strong>easy to use</strong> across a wide variety of configurations. Carried by Lavoisier\'s quote: "nothing is lost, nothing is created, everything is transformed."',
    'card-4-title': 'Renders',
    'card-4-body':
      'These <strong>3D renders</strong> show the concept across different brands, shifting from a "blank canvas" to strongly defined universes (Shiseido\'s red world, Nars\' aesthetic), validating the system for <strong>retail scenography</strong>.',
  },
  'break shot': {
    'intro-title': 'Upcycled playfield.',
    'intro-subtitle': 'A one-week collaborative workshop focused on redesigning vintage 1950s classroom furniture into an ergonomic, functional gaming table.',
    'card-1-title': 'Concept & Process',
    'card-1-body':
      'A group project exploring <strong>organization</strong>, <strong>task distribution</strong>, and <strong>time management</strong> within a <strong>one-week constraint</strong>. The billiard table became a medium to rethink <strong>ergonomics</strong> and <strong>user experience</strong>, leading to structural adjustments like the <strong>height</strong>.',
    'card-2-title': 'Digital Prototyping & 3D Printing',
    'card-2-body':
      "<strong>Digital modeling</strong> in <strong>SolidWorks</strong> gave <strong>precise measurements</strong> in real time, securing cutting and assembly. <strong>Custom 3D-printed parts</strong> then served as masters for <strong>silicone molds</strong>, achieving clean, precise geometry for the balls' rolling motion.",
    'card-3-title': 'Gravity Feed System',
    'card-3-body':
      'A <strong>guiding network based entirely on gravity</strong> automates ball retrieval: each pocket connects to a <strong>PVC pipe</strong> opening onto an <strong>inclined wooden plane</strong>, guiding any ball toward a <strong>single outlet</strong> and its dedicated spot in the furniture.',
    'card-4-title': 'Serviceable Illumination',
    'card-4-body':
      "<strong>Perforated acrylic plates with charred wood slats</strong> diffuse a <strong>grazing light halo</strong> along the table's edges, split into <strong>six independent modules</strong> for easy maintenance and quick replacement. A <strong>robust static solution</strong> was chosen over an <strong>Arduino</strong>-driven interactive version, given the time constraint.",
  },
  'hermès birkin sport': {
    'intro-title': 'Refine elegance.',
    'intro-subtitle': 'Reconciling luxury codes with sports utility through a balance of sketch and 3D',
    'card-1-title': 'Sketches and concept',
    'card-1-body':
      "This board reinterprets Hermès' iconic bag through <strong>activewear</strong>, integrating sportswear features while respecting the <strong>elegance of luxury leather goods</strong>.",
    'card-2-title': '3D modelisation',
    'card-2-body':
      "The bag was modeled in <strong>Rhino</strong>, proportions faithful to the original, then staged in <strong>Blender</strong> (textures, lighting) for renders highlighting <strong>luxury heritage</strong> meeting <strong>sportswear technicality</strong>.",
  },
  firefly: {
    'intro-title': 'Brutally warm.',
    'intro-subtitle': 'A hybrid lutherie that preserves the woody soul and warm sound of nylon strings, contrasted with a metallic edge and subverted design codes.',
    'card-1-title': 'Design reflection',
    'card-1-body':
      "The Last of Us guitar questions established lutherie codes through a functional, expressive object, working on three levels: a <strong>narrative and sensory exploration</strong> of the game's universe, a <strong>targeted acoustic research</strong> matching its tonalities, and a <strong>materials testing ground</strong> combining <strong>wood, metal, and resin</strong>.",
    'card-2-title': 'Sound design',
    'card-2-body':
      "Fabrication relied on <strong>woods selected for their acoustic properties</strong>, with <strong>tests and simulations</strong> ensuring durability.",
    'card-3-title': 'Sonic Identity and demo',
    'card-3-body':
      "The sound balances <strong>organic resonance and modern precision</strong>: <strong>red cedar soundboard, mahogany body, rosewood fretboard, and ebony bridge</strong> give an <strong>immediate response and deep warmth</strong>.\n\nAn <strong>under-saddle amplifier</strong> shapes the tone toward a <strong>more electric character</strong> or a warm <strong>\"campfire\" feel</strong>.\n\nA <strong>full harmony of sonic colors</strong>, from precise highs to deep lows, with an <strong>efficient sustain</strong>.",
  },
  monolith: {
    'intro-title': 'Anchored Sound',
    'intro-subtitle': 'A vertical acoustic totem marrying the warmth of raw wood and industrial precision, engineered to anchor deep bass in the floor and lift sound into the space.',
    'card-1-title': 'Design, 3D and Sound Design',
    'card-1-body':
      'Monolith is conceived as a <strong>high-end furniture piece</strong>, marrying <strong>turntable</strong> and <strong>enclosure</strong> into a single object that blends into any interior.\n\nA <strong>central metal tube</strong> dressed in <strong>aluminum petals</strong> connects the two: <strong>elevated tweeters</strong> and <strong>floor-level woofers</strong> envelop the space, turning every vinyl session into a moment of aesthetic contemplation.',
    'card-2-title': 'Electronics',
    'card-2-body':
      'After an initial prototype was discarded for its noise and weak bass, I switched to a <strong>Douk Audio NS-01G Pro</strong> amplifier for its compact size, power, and clarity. A <strong>master switch</strong> powers the whole system in one gesture.\n\nSince the turntable\'s Bluetooth was poor, a <strong>physical switch</strong> cuts the jack cable to force wireless mode. The original potentiometer, kept on the <strong>front panel</strong>, now drives <strong>volume, power, and source selection</strong>.',
    'card-3-title': 'Fabrication and crafting',
    'card-3-body':
      'Assembling the <strong>18mm MDF enclosures</strong> and the <strong>central steel mast</strong> brought the 3D models to life, with a rigid structure integrating all the wiring.',
  },
  eden: {
    'intro-title': 'Shaping harmony.',
    'intro-subtitle': 'A series of artistic and poetic experiments told through the renovation and customization of guitars.',
    'card-1-title': 'The lab',
    'card-1-body':
      "This lab gathers the first customization experiments, testing the guitar's visual limits through <strong>marble-effect finishes</strong>, <strong>bold graphics</strong>, and <strong>sportswear nods</strong>, laying the project's technical and stylistic foundations.",
    'card-2-title': 'Manifest',
    'card-2-body':
      "This project approaches guitars as a <strong>medium</strong>, like a painting on canvas, carrying an <strong>artistic statement</strong> backed by <strong>technical testing</strong>. Each guitar departs from standard lutherie aesthetics, pairing the instrument's soul with themes far removed from the ordinary.",
    'card-3-title': 'The culmination',
    'card-3-body':
      'Eden synthesizes renovated lutherie and artistic statement: <strong>peony petals inlaid into the fretboard</strong> and a <strong>reworked bracing</strong> for a more precise sound, adding pure organic matter to a medium already made of wood.',
  },
  insight: {
    'intro-title': 'Observe Usage, Make solution.',
    'intro-subtitle': 'A unified workspace designed through upcycling, a cohesive material system, and custom functional integrations.',
    'card-1-title': 'Screen recycling',
    'card-1-body':
      "A <strong>salvaged Mac display panel</strong> becomes a secondary monitor: after <strong>reverse engineering</strong> it, a <strong>custom 3D-printed housing</strong> integrates the <strong>eDP controller and wiring</strong>, blending into the setup's black and wood art direction.",
    'card-2-title': 'Design language',
    'card-2-body':
      'Daily interactions unify into <strong>one physical interface</strong>: a <strong>desk-embedded panel</strong> for power, audio, and speakers, plus <strong>custom MagSafe charging stations</strong> and a <strong>backlit headphone stand</strong>.',
    'card-3-title': 'Functional prints',
    'card-3-body':
      '<strong>3D-printed functional parts</strong> solve everyday constraints: <strong>USB and power ports relocated under the desk</strong>, a <strong>modified subwoofer enclosure</strong> to free up cables, and a <strong>custom wall mount</strong> to discreetly suspend the instrument.',
  },
  pulse: {
    'intro-title': 'Physically conscious.',
    'intro-subtitle': 'Designed in partnership with the Football Foundation, Pulse uses targeted physical stimuli to interrupt hyper-connected routines and foster mindful smartphone usage.',
    'card-1-title': 'Problematic',
    'card-1-body':
      'Targeting <strong>children and teenagers (U10-U14)</strong>, this project exposes <strong>digital addiction</strong>: the <strong>"effort / reward / dopamine" effect</strong> behind a <strong>hypnotic, passive usage pattern</strong>. Field tests raised the question: how to rebalance our relationship with the phone?',
    'card-2-title': 'Haptic feedback',
    'card-2-body':
      '<strong>Disruptive vibrations</strong> break the <strong>digital hypnosis</strong>, while <strong>soothing vibrations</strong> and <strong>cardiac coherence</strong> promote a return to calm.',
    'card-3-title': 'Ecosystem',
    'card-3-body':
      'The ecosystem combines a <strong>parental lock system</strong>, <strong>interchangeable magnetic plates</strong> for endless customization, and a <strong>mandatory external battery</strong> for continuous use. The companion app adds <strong>disconnection challenges</strong> (for example, least phone time earns a starting spot), turning moderation into a motivating game.',
    'card-4-title': '3D Showcase',
    'card-4-body':
      'A <strong>3D animation</strong> spot extends the project, offering a more visual read of its use and intentions.',
  },
};

function applyContent(slug) {
  const content = PROJECT_CONTENT[slug];
  if (!content) return; // pas de contenu renseigné pour ce projet -> placeholders partout
  Object.entries(content).forEach(([field, text]) => {
    document.querySelectorAll(`[data-field="${field}"]`).forEach(el => {
      // innerHTML (pas textContent) : certains textes (voir card-N-body)
      // utilisent <strong> pour faire ressortir les mots-clés - contenu
      // entièrement écrit à la main dans PROJECT_CONTENT, jamais de saisie
      // utilisateur, donc pas de risque d'injection à gérer ici.
      el.innerHTML = text;
    });
  });
}

// Cartes dont le texte reste étroit (voir .card-panel-text.is-narrow dans
// style.css) plutôt que de prendre toute la largeur de la colonne - clé =
// slug, valeur = liste des card-N concernées.
const CARD_TEXT_NARROW = {
  'break shot': ['card-2', 'card-4'],
};

// Cartes où le tableau technique (voir CARD_SPEC_TABLE) doit passer sous le
// texte, pleine largeur, plutôt qu'à côté (comportement par défaut, voir
// Break Shot card-2) - clé = slug, valeur = liste des card-N concernées.
const CARD_SPEC_TABLE_STACKED = {
  firefly: ['card-2'],
  insight: ['card-2', 'card-3'],
};

function applyCardTextWidth(slug) {
  (CARD_TEXT_NARROW[slug] || []).forEach(cardKey => {
    const el = document.querySelector(`[data-field="${cardKey}-body"]`);
    if (el) el.classList.add('is-narrow');
  });
}

// Mobile uniquement : un <p> séparé par paragraphe, au lieu d'un seul
// .card-panel-text avec des \n\n rendus via white-space: pre-line (voir
// style.css) - un vrai espacement flex entre paragraphes (voir .text-only
// dans style.css, demande explicite : autant d'espace entre l'image et le
// 1er paragraphe, entre les paragraphes, et entre le dernier et le bas de
// page) n'est possible qu'avec des ÉLÉMENTS distincts, pas du texte replié
// dans un seul bloc. Appelée après applyCardTextWidth : chaque nouveau <p>
// récupère la classe (donc is-narrow au besoin) de l'original.
function splitCardTextParagraphs() {
  document.querySelectorAll('.card-panel-text').forEach(el => {
    const parts = el.innerHTML.split('\n\n').map(p => p.trim()).filter(Boolean);
    if (parts.length <= 1) return;
    const dataField = el.dataset.field;
    const className = el.className;
    const paragraphs = parts.map(html => {
      const p = document.createElement('p');
      p.className = className;
      if (dataField) p.dataset.field = dataField;
      p.innerHTML = html;
      return p;
    });
    el.replaceWith(...paragraphs);
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
    // Espace insecable au lieu d'un espace normal : seul contenu d'un
    // inline-block, un espace normal se fait parfois collapser au rendu
    // (le titre d'Osmose s'affichait `diveintosound`, tout colle) - une
    // insecable garde toujours une largeur, jamais collapsee.
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
// bothSections : la plupart des projets veulent la MÊME couleur sur intro
// et block-2 (un gris/blanc différent des deux côtés trahirait la
// "couture" entre les deux sections) - raccourci pour ce cas courant.
const bothSections = (color) => ({ intro: color, 'block-2': color });

const PROJECT_BACKGROUNDS = {
  osmose: bothSections('#FFFFFF'),
  monolith: bothSections('#FFFFFF'),
  'hermès birkin sport': bothSections('#FFFFFF'),
  'the cube': bothSections('#F3F3F3'),
  eden: bothSections('#F3F3F3'),
  pulse: bothSections('#F3F3F3'),
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
// texte sombre pour rester lisible - SAUF si cardTitleColor est activé
// (voir Pulse/The Cube), auquel cas la petite carte bascule elle aussi en
// sombre. "shadow" adoucit l'ombre des cartes (0.9 d'opacité par défaut,
// pensée pour un fond sombre - trop dure sur un thème clair) ;
// SOFT_CARD_SHADOW ci-dessous est la même valeur pour tous les projets à
// thème clair, partagée plutôt que répétée.
const SOFT_CARD_SHADOW = '0 20px 40px -12px rgba(0, 0, 0, 0.25)';

const PROJECT_CARD_STYLE = {
  monolith: { background: '#F3F3F3', color: '#1A1A1A', shadow: SOFT_CARD_SHADOW },
  'hermès birkin sport': { background: '#F3F3F3', color: '#1A1A1A', shadow: SOFT_CARD_SHADOW },
  eden: { background: '#FFFFFF', color: '#1A1A1A', shadow: SOFT_CARD_SHADOW },
  'the cube': {
    background: '#FFFFFF',
    color: '#1A1A1A',
    shadow: SOFT_CARD_SHADOW,
    cardTitleColor: true, // titres en noir sur la petite carte aussi, pas seulement le panneau plein écran
  },
  osmose: { background: '#F3F3F3', color: '#1A1A1A', shadow: SOFT_CARD_SHADOW },
  pulse: {
    background: '#FFFFFF',
    color: '#1A1A1A',
    shadow: SOFT_CARD_SHADOW,
    // Contrairement à monolith/eden, le petit texte de carte reste sombre
    // pour Pulse même hors plein écran (demande explicite) - d'où ce flag,
    // qui bascule .card-title en plus de .card-panel-title.
    cardTitleColor: true,
  },
};

// Exception ponctuelle au cardTitleColor ci-dessus (voir applyCardStyle) :
// titre de la petite carte forcé dans une couleur donnée, carte par carte -
// The Cube passe tous ses titres en sombre (cardTitleColor), sauf la carte
// 4 qui doit rester blanche.
const CARD_TITLE_COLOR_OVERRIDE = {
  'the cube': {
    'card-4': '#fff',
  },
};

function applyCardStyle(slug) {
  const style = PROJECT_CARD_STYLE[slug];
  if (!style) return;
  document.querySelectorAll('.card > div').forEach(el => { el.style.backgroundColor = style.background; });
  document.querySelectorAll('.card-panel').forEach(el => { el.style.backgroundColor = style.background; });
  // Mobile : titre de carte TOUJOURS blanc (demande explicite), même pour
  // les projets dont cardTitleColor force le titre en sombre sur desktop
  // (Pulse/The Cube) - ce bloc entier (+ l'exception The Cube juste en
  // dessous) est donc sauté sur mobile, laissant le blanc par défaut de
  // .card-title (voir style.css) tel quel.
  if (style.cardTitleColor && !IS_MOBILE) {
    document.querySelectorAll('.card-title').forEach(el => { el.style.color = style.color; });
  }
  // Exception par carte au-dessus (voir CARD_TITLE_COLOR_OVERRIDE) : SEUL
  // le titre de la PETITE carte, pas celui du panneau plein écran (qui
  // suit son propre fondu blanc -> sombre à l'ouverture, voir
  // setupCardStack) - reste comme avant en plein écran.
  if (!IS_MOBILE) {
    Object.entries(CARD_TITLE_COLOR_OVERRIDE[slug] || {}).forEach(([cardKey, color]) => {
      const el = document.querySelector(`[data-field="${cardKey}-title"].card-title`);
      if (el) el.style.color = color;
    });
  }
  // La couleur du titre du panneau (blanc -> sombre) n'est PAS posée ici :
  // elle doit rester blanche (comme sur la carte) tant que le panneau est
  // encore de la taille de la carte, et ne virer au sombre qu'en fondu
  // pendant l'agrandissement plein écran (voir setupCardStack), sinon le
  // texte apparaît déjà sombre alors qu'il est encore au-dessus de l'image.
  // Mobile : pas d'ombre portée du tout (demande explicite) - remplacée
  // par le bandeau dégradé derrière le titre (voir style.css).
  if (style.shadow && !IS_MOBILE) {
    document.querySelectorAll('.card').forEach(el => { el.style.boxShadow = style.shadow; });
  }
  // Contrairement au titre du panneau, ce texte n'est jamais positionné
  // au-dessus de l'image (il vit dans l'espace libre à droite, voir
  // .card-panel-body) : pas besoin du fondu synchronisé à l'ouverture,
  // une couleur statique suffit.
  document.querySelectorAll('.card-panel-text').forEach(el => { el.style.color = style.color; });
  // Légendes des deux carrousels (coverflow et slide) : par défaut en
  // blanc translucide (voir style.css), invisible sur un fond de panneau
  // clair (voir The Cube) - suivent la même couleur que le texte ci-dessus.
  document.querySelectorAll('.card-gallery-caption, .card-slide-carousel-caption').forEach(el => { el.style.color = style.color; });
}

// Images des cartes (clé = data-card-image = card-1..4, voir index.html) :
// même nom de fichier partagé entre tous les projets, chacun va chercher
// le sien dans son propre dossier ../input/<Nom Du Projet>/ (Title Case,
// voir setupHero pour la même logique).
const CARD_IMAGES = {
  'card-1': 'Card 1.webp',
  'card-2': 'Card 2.webp',
  'card-3': 'Card 3.webp',
  'card-4': 'Card 4.webp',
};

function setupCardImages(slug) {
  // Dossier réel sur disque en Title Case ("input/The Cube/", pas "input/
  // the cube/") : marchait en local (Windows/NTFS insensible à la casse)
  // mais 404 sur GitHub Pages (Linux, sensible à la casse) avec le slug brut.
  const folder = toFileBaseName(slug);
  Object.entries(CARD_IMAGES).forEach(([cardKey, filename]) => {
    const img = document.querySelector(`[data-card-image="${cardKey}"]`);
    if (img) img.src = `../input/${folder}/${filename}`;
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
    'card-4': `${HERO_VIDEO_BASE_URL}Pulse 3D Showcase.mp4`,
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

// Image secondaire sous le texte d'une carte (voir .card-panel-
// secondary-image dans style.css), clé = slug -> data-card.
const CARD_SECONDARY_IMAGE = {
  'break shot': {
    'card-2': '../input/Break Shot/2-1.webp',
  },
  'the cube': {
    'card-1': '../input/The Cube/1-1.webp',
    'card-3': '../input/The Cube/3-1.webp',
  },
};

// Cartes où l'image secondaire doit garder un vrai 16/9 (voir
// setupCardSecondaryImages) tout en restant plafonnée à 21/9 max une fois
// la colonne élargie (même traitement que les carrousels, voir
// CARD_SLIDE_CAROUSEL_MAX_RATIO) : { maxHeightVh, maxRatio }.
const CARD_SECONDARY_IMAGE_RATIO = {
  'the cube': { 'card-1': { maxHeightVh: 45, maxRatio: 21 / 9 } },
};

// Dimensionne un cadre/conteneur à partir de sa largeur RÉELLE (mesurée en
// JS), jamais via aspect-ratio + max-height en CSS (essayé plusieurs fois -
// ne se plafonne pas comme attendu, la largeur reste à sa valeur contrainte
// pendant que la hauteur se fait couper sans que la largeur suive). Avec
// maxHeightVh : hauteur = largeur / frameRatio (ou directement le plafond si
// fillHeight, voir CARD_SLIDE_CAROUSEL_FILL_HEIGHT_VH), plafonnée à
// maxHeightVh. Sans maxHeightVh (undefined) : la hauteur existante (posée en
// CSS) est simplement lue, rien n'est calculé. Dans les deux cas, si
// maxRatio est fourni, plafonne ensuite le ratio FINAL (largeur/hauteur) en
// rognant la largeur sur les côtés plutôt qu'en changeant la hauteur ou la
// mise en page autour - centré via margin auto sauf si center: false (voir
// Insight card-1, déjà centré par son propre parent).
// Traitement partagé par l'image secondaire de The Cube card-1, le
// carrousel slide, et l'image large pilotée par le tableau technique
// d'Insight card-1.
function fitRatioCappedFrame(element, { maxHeightVh, frameRatio = 16 / 9, fillHeight = false, maxRatio = Infinity, center = true } = {}) {
  const update = () => {
    element.style.width = ''; // repart de la largeur naturelle avant de mesurer
    const width = element.offsetWidth;
    if (!width) return;
    let height;
    if (maxHeightVh != null) {
      const maxHeight = window.innerHeight * (maxHeightVh / 100);
      height = fillHeight ? maxHeight : Math.min(width / frameRatio, maxHeight);
      element.style.height = `${height}px`;
    } else {
      height = element.offsetHeight;
      if (!height) return;
    }
    const maxWidth = height * maxRatio;
    if (width > maxWidth) {
      element.style.width = `${maxWidth}px`;
      if (center) { element.style.marginLeft = 'auto'; element.style.marginRight = 'auto'; }
    } else if (center) {
      element.style.marginLeft = '';
      element.style.marginRight = '';
    }
  };
  update();
  if ('ResizeObserver' in window) {
    new ResizeObserver(update).observe(element);
  } else {
    window.addEventListener('resize', update);
  }
}

// Mobile UNIQUEMENT : décalage du cadrage (object-position) d'une image
// secondaire (voir CARD_SECONDARY_IMAGE ci-dessus), clé = slug -> data-card.
const MOBILE_SECONDARY_IMAGE_OBJECT_POSITION = {
  'the cube': { 'card-3': '25% center' },
};

function setupCardSecondaryImages(slug) {
  const images = CARD_SECONDARY_IMAGE[slug];
  if (!images) return;
  Object.entries(images).forEach(([cardKey, src]) => {
    const container = document.querySelector(`[data-card-secondary-image="${cardKey}"]`);
    if (!container) return;
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    const objectPosition = IS_MOBILE && (MOBILE_SECONDARY_IMAGE_OBJECT_POSITION[slug] || {})[cardKey];
    if (objectPosition) img.style.objectPosition = objectPosition;
    container.appendChild(img);

    const ratioConfig = (CARD_SECONDARY_IMAGE_RATIO[slug] || {})[cardKey];
    if (!ratioConfig) return;
    fitRatioCappedFrame(container, { maxHeightVh: ratioConfig.maxHeightVh, maxRatio: ratioConfig.maxRatio });
  });
}

// Paire d'images côte à côte, sous le texte (voir .card-panel-image-row
// dans style.css), clé = slug -> data-card -> [src1, src2].
const CARD_IMAGE_ROW = {
  'break shot': {
    'card-3': ['../input/Break Shot/3-1.webp', '../input/Break Shot/3-2.webp'],
  },
};

function setupCardImageRows(slug) {
  const rows = CARD_IMAGE_ROW[slug];
  if (!rows) return;
  Object.entries(rows).forEach(([cardKey, [src1, src2]]) => {
    const container = document.querySelector(`[data-card-image-row="${cardKey}"]`);
    if (!container) return;
    [src1, src2].forEach((src) => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      container.appendChild(img);
    });
  });
}

// Paire d'images empilées verticalement, dans l'autre colonne à côté du
// texte (voir .card-panel-image-column dans style.css - SIBLING de
// .card-panel-body-main, pas dedans, contrairement à CARD_IMAGE_ROW qui
// est une paire côte à côte SOUS le texte, dans la même colonne). Clé =
// slug -> data-card -> [src1, src2].
const CARD_IMAGE_COLUMN = {
  'break shot': {
    'card-4': ['../input/Break Shot/4-2.webp', '../input/Break Shot/4-3.webp'],
  },
};

function setupCardImageColumns(slug) {
  const columns = CARD_IMAGE_COLUMN[slug];
  if (!columns) return;
  Object.entries(columns).forEach(([cardKey, [src1, src2]]) => {
    const container = document.querySelector(`[data-card-image-column="${cardKey}"]`);
    if (!container) return;
    [src1, src2].forEach((src) => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      container.appendChild(img);
    });
  });
}

// Image pleine largeur SOUS le texte et les colonnes (voir .card-panel-
// wide-image dans style.css), clé = slug -> data-card -> URL.
const CARD_WIDE_IMAGE = {
  'break shot': {
    'card-4': '../input/Break Shot/4-1.webp',
  },
  // Insight card-1 : PAS d'entrée ici - son image est pilotée par le
  // tableau technique à côté (voir CARD_SPEC_TABLE_DRIVES_WIDE_IMAGE dans
  // setupCardSpecTables), pas par cette config statique.
};

function setupCardWideImages(slug) {
  const images = CARD_WIDE_IMAGE[slug];
  if (!images) return;
  Object.entries(images).forEach(([cardKey, src]) => {
    const container = document.querySelector(`[data-card-wide-image="${cardKey}"]`);
    if (!container) return;
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    container.appendChild(img);
  });
}

// Tableau technique interactif (voir .card-panel-spec-table dans style.css)
// à côté du texte, dans la colonne de droite d'une carte : des boutons en
// haut (un par ligne), value + justification technique + image en dessous,
// mis à jour au clic plutôt que d'afficher toutes les lignes à la fois -
// clé = slug -> data-card -> liste de { label, value, justification, image }.
const CARD_SPEC_TABLE = {
  'break shot': {
    'card-2': [
      {
        label: 'CAD Software',
        value: 'SolidWorks',
        justification: '<strong>Parametric modeling</strong> and <strong>dimension extraction</strong>.',
        image: '../input/Break Shot/2-2.webp',
      },
      {
        label: 'Printing Material',
        value: 'PLA',
        justification: '<strong>Neutral</strong>, easy to print, suitable as a <strong>master pattern</strong>.',
        image: '../input/Break Shot/2-3.webp',
      },
      {
        label: 'Infill',
        value: '10% - 12%',
        justification: 'Optimized <strong>trihexagonal structure</strong> (saves time and material, single use for molding).',
        image: '../input/Break Shot/2-4.webp',
      },
      {
        label: 'Screw Fittings',
        value: 'Undersized (tight fit)',
        justification: '<strong>Self-tapping into the resin</strong> for a solid hold without cracking the block.',
        image: '../input/Break Shot/2-5.webp',
      },
    ],
  },
  // Placeholder (labels/valeurs génériques, Card 1/2/3.webp existants en
  // boucle) en attendant le vrai contenu.
  firefly: {
    'card-2': [
      {
        label: 'Soundboard',
        value: 'Red cedar',
        justification: 'Unlike spruce, it responds <strong>instantly</strong> with <strong>no break-in period</strong>. <strong>Rich mids</strong> add tonal depth, and its sensitivity to light touch suits <strong>expressive fingerpicking</strong>.',
        image: '../input/Firefly/2-1.webp',
      },
      {
        label: 'Neck, sides, and back',
        value: 'Mahogany',
        justification: "Mahogany provides <strong>structural stability</strong> for the back and sides, with a <strong>warm, centered tone</strong>. It naturally <strong>softens sharp highs</strong>, balancing the cedar's brightness for a deep, well-rounded sound.",
        image: '../input/Firefly/2-2.webp',
      },
      {
        label: 'Bridge',
        value: 'Ebony',
        justification: "A purely mechanical choice: ebony's <strong>density and rigidity</strong> transfer string vibration efficiently to the soundboard without absorbing energy. Its hardness also keeps the fern-shaped bridge <strong>stable under string tension</strong>, ensuring <strong>lasting intonation</strong>.",
        image: '../input/Firefly/2-3.webp',
      },
      {
        label: 'Fretboard',
        value: 'Rosewood',
        justification: 'Rosewood was chosen for its <strong>harmonic richness</strong> and <strong>organic feel</strong> under the fingers. It softens the string attack, adding warmth that complements the cedar for <strong>comfortable, melodic playing</strong>.',
        image: '../input/Firefly/2-4.webp',
      },
    ],
  },
  // Placeholder (value/justification génériques, Card 1.webp existant) en
  // attendant le vrai contenu. L'image de chaque ligne ne s'affiche pas
  // dans le tableau ici (voir CARD_SPEC_TABLE_DRIVES_WIDE_IMAGE) : elle
  // change .card-panel-wide-image, sous le texte ET le tableau, à la place.
  insight: {
    'card-1': [
      {
        label: 'Shell Material',
        value: 'ABS',
        justification: '<strong>Good thermal and mechanical resistance</strong>, ideal for a panel that heats up and sits on an arm.',
        image: '../input/Insight/1-1.webp',
      },
      {
        label: 'Tolerance',
        value: '± 0.02mm',
        justification: "My 3D printer's tolerance, for a <strong>tight-fit assembly</strong>.",
        image: '../input/Insight/1-2.webp',
      },
      {
        label: 'Controller',
        value: 'Display controller',
        justification: 'A board that receives the <strong>HDMI signal</strong> and feeds it to the panel, paired with a <strong>power board</strong> for the display.',
        image: '../input/Insight/1-3.webp',
      },
    ],
    // Placeholder (labels/valeurs génériques) en attendant le vrai contenu -
    // pas de champ image sur ces lignes : pas d'image du tout ici (voir
    // setupCardSpecTables, hasAnyImage), contrairement à card-1 plus haut.
    'card-2': [
      {
        label: 'Magsafe Support for iPhone',
        value: 'Ergonomics and Hold',
        justification: 'A 3D-printed angled stand integrating a <strong>MagSafe module</strong> and a <strong>textured wood-effect veneer</strong>, ensuring stable positioning and instant wireless charging.',
      },
      {
        label: 'Embedded unified controls',
        value: 'Integration and Minimalism',
        justification: 'A control panel embedded in the desk, bringing together the <strong>power switch</strong>, an <strong>aluminum volume potentiometer</strong>, and the <strong>speaker switch</strong>.',
      },
      {
        label: 'Illuminated headphone + AirPods charging station',
        value: 'Combined station',
        justification: 'A <strong>headphone stand</strong> combined with a <strong>flat MagSafe slot</strong> for AirPods, accented by a <strong>perpendicular LED strip</strong>.',
      },
    ],
    // Même structure que card-2 (texte + tableau empilé, 3 boutons, pas
    // d'image).
    'card-3': [
      {
        label: 'Subwoofer IEC C8 power mod',
        value: 'Modularity and storage',
        justification: 'Structural modification of the subwoofer enclosure with a soldered <strong>standardized IEC C8 power connector</strong>, replacing the original fixed cable to simplify transport and cable routing.',
      },
      {
        label: 'Under-desk Power and USB Hub',
        value: 'Accessibility and ergonomics',
        justification: '<strong>USB ports</strong> and the <strong>main power switch</strong> relocated beneath the desk edge, allowing immediate blind access without cluttering the work surface.',
      },
      {
        label: 'Invisible Guitar wall mount',
        value: 'Safety and aesthetics',
        justification: 'Custom 3D-printed wall mount with <strong>reinforced structural anchoring</strong>, integrating the Fireflies symbology to keep the instrument suspended within the same visual identity.',
      },
    ],
  },
};

// Intitulé de la colonne "value" du tableau (voir CARD_SPEC_TABLE
// ci-dessus) - "Value" par défaut, personnalisable par carte quand un
// terme plus précis a du sens (ex. "Species" pour un choix d'essences de
// bois).
const CARD_SPEC_TABLE_VALUE_LABEL = {
  firefly: {
    'card-2': 'Species',
  },
  insight: {
    'card-2': 'Purpose',
    'card-3': 'Purpose',
  },
};

// Même principe que CARD_SPEC_TABLE_VALUE_LABEL, pour l'intitulé
// "Technical justification" par défaut.
const CARD_SPEC_TABLE_JUSTIFICATION_LABEL = {
  insight: {
    'card-2': 'Explanation',
    'card-3': 'Explanation',
  },
};

// Cartes où l'image d'une ligne (voir CARD_SPEC_TABLE) doit changer
// .card-panel-wide-image (sous le texte ET le tableau, pleine largeur) au
// lieu d'une image dédiée DANS le tableau (comportement par défaut, voir
// Break Shot/Firefly) - clé = slug, valeur = liste des card-N concernées.
const CARD_SPEC_TABLE_DRIVES_WIDE_IMAGE = {
  insight: ['card-1'],
};

// Plafond du ratio final (largeur/hauteur) de l'image "large" pilotée par
// le tableau technique (voir CARD_SPEC_TABLE_DRIVES_WIDE_IMAGE) - même
// principe que CARD_SLIDE_CAROUSEL_MAX_RATIO.
const CARD_WIDE_IMAGE_MAX_RATIO = {
  insight: { 'card-1': 21 / 9 },
};

function setupCardSpecTables(slug) {
  const tables = CARD_SPEC_TABLE[slug];
  if (!tables) return;
  Object.entries(tables).forEach(([cardKey, rows]) => {
    const container = document.querySelector(`[data-card-spec-table="${cardKey}"]`);
    if (!container || !rows.length) return;
    const drivesWideImage = (CARD_SPEC_TABLE_DRIVES_WIDE_IMAGE[slug] || []).includes(cardKey);

    const details = document.createElement('dl');
    details.className = 'card-panel-spec-details';
    const valueLabel = document.createElement('dt');
    valueLabel.textContent = (CARD_SPEC_TABLE_VALUE_LABEL[slug] || {})[cardKey] || 'Value';
    const valueEl = document.createElement('dd');
    valueEl.className = 'card-panel-spec-value';
    const justificationLabel = document.createElement('dt');
    justificationLabel.textContent = (CARD_SPEC_TABLE_JUSTIFICATION_LABEL[slug] || {})[cardKey] || 'Technical justification';
    const justificationEl = document.createElement('dd');
    justificationEl.className = 'card-panel-spec-justification';
    details.append(valueLabel, valueEl, justificationLabel, justificationEl);

    // Image dédiée DANS le tableau (par défaut) OU, si drivesWideImage,
    // l'<img> déjà présente dans .card-panel-wide-image (voir
    // setupCardWideImages, qui tourne avant celle-ci mais ne pose rien
    // pour cette carte - pas d'entrée dans CARD_WIDE_IMAGE, voir Insight)
    // à la place - jamais les deux. Aucune des deux si aucune ligne n'a
    // d'image (voir Insight card-2 : boutons + value/justification, pas
    // d'image du tout).
    const hasAnyImage = rows.some(row => row.image);
    let image = null;
    if (hasAnyImage && drivesWideImage) {
      const wideImageContainer = document.querySelector(`[data-card-wide-image="${cardKey}"]`);
      if (wideImageContainer) {
        image = document.createElement('img');
        wideImageContainer.appendChild(image);

        // Plafond de ratio (voir CARD_WIDE_IMAGE_MAX_RATIO et
        // fitRatioCappedFrame) : la largeur (75% de la section, voir
        // style.css) peut dépasser largement 21/9 une fois la colonne
        // élargie sur un écran large - rognée sur les côtés plutôt que de
        // laisser le cadre s'étirer, la hauteur (32vh, fixe en CSS) ne
        // change jamais (pas de maxHeightVh ici, elle est simplement lue).
        // center: false - déjà centré par son propre parent, pas besoin de
        // margin auto en plus.
        const maxRatio = (CARD_WIDE_IMAGE_MAX_RATIO[slug] || {})[cardKey];
        if (maxRatio) fitRatioCappedFrame(wideImageContainer, { maxRatio, center: false });
      }
    } else if (hasAnyImage) {
      image = document.createElement('img');
      image.className = 'card-panel-spec-image';
      image.alt = '';
    }

    const showRow = (row) => {
      valueEl.textContent = row.value;
      justificationEl.innerHTML = row.justification; // <strong> pour les mots-clés, voir applyContent
      if (row.image && image) image.src = row.image;
    };
    showRow(rows[0]);

    // Une seule ligne -> pas d'onglets à afficher (rien à choisir), juste
    // value + justification directement.
    if (rows.length === 1) {
      container.append(details, ...(image && !drivesWideImage ? [image] : []));
      return;
    }

    const tabs = document.createElement('div');
    tabs.className = 'card-panel-spec-tabs';
    rows.forEach((row, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card-panel-spec-tab';
      btn.textContent = row.label;
      if (i === 0) btn.classList.add('is-active');
      btn.addEventListener('click', () => {
        tabs.querySelectorAll('.card-panel-spec-tab').forEach(el => el.classList.remove('is-active'));
        btn.classList.add('is-active');
        showRow(row);
      });
      tabs.appendChild(btn);
    });
    container.append(tabs, details, ...(image && !drivesWideImage ? [image] : []));
  });
}

// Déplace .card-panel-spec-table hors de .card-panel-body-row (où il
// partage la ligne à côté du texte, voir style.css) pour le poser en
// SIBLING juste après, pleine largeur, sous le texte plutôt qu'à côté -
// voir CARD_SPEC_TABLE_STACKED. Doit s'exécuter APRÈS setupCardSpecTables
// (déplace l'élément une fois rempli, pas avant).
function applyCardSpecTableStacking(slug) {
  (CARD_SPEC_TABLE_STACKED[slug] || []).forEach(cardKey => {
    const panel = document.querySelector(`[data-card-panel="${cardKey}"]`);
    if (!panel) return;
    const specTable = panel.querySelector('.card-panel-spec-table');
    const body = panel.querySelector('.card-panel-body');
    const row = panel.querySelector('.card-panel-body-row');
    const text = panel.querySelector('.card-panel-text');
    if (!specTable || !body || !row) return;
    specTable.classList.add('is-stacked');
    body.insertBefore(specTable, row.nextSibling);
    // text-align-last (voir .card-panel-text dans style.css, séparée de
    // text-align, PAS remise à zéro par un simple text-align: left) reste
    // sinon active et centre la dernière ligne - ou la seule ligne, sur un
    // texte court comme ici, donnant l'impression que tout le paragraphe
    // est centré. Posé en inline (spécificité maximale) plutôt qu'en CSS,
    // pour ne plus dépendre d'un :has() qui n'a visiblement pas suffi.
    if (text) {
      text.style.textAlign = 'left';
      text.style.textAlignLast = 'left';
    }
  });
}

// Lecteur audio (voir .card-panel-audio-player dans style.css), dans
// l'autre colonne à côté du texte - clé = slug -> data-card -> { cover,
// tracks }. Porté depuis un composant React fourni par l'utilisateur
// (framer-motion + lucide-react + shadcn Button, aucun de ces trois
// n'existe sur ce site vanilla) vers du DOM/style inline. tracks : dans
// l'ordre d'affichage/lecture, une entrée par piste ({ src, title }) -
// précédent/suivant boucle d'une extrémité à l'autre de la liste (voir
// setupCardAudioPlayers), contrairement au composant d'origine (pensé pour
// une piste unique, boutons inertes).
const CARD_AUDIO_PLAYER = {
  firefly: {
    'card-3': {
      tracks: [
        { src: `${HERO_VIDEO_BASE_URL}The Last Of Us.m4a`, title: 'The Last of Us', cover: '../input/Firefly/3-1.webp' },
        { src: `${HERO_VIDEO_BASE_URL}10'.m4a`, title: "10'", cover: '../input/Firefly/3-2.webp' },
        { src: `${HERO_VIDEO_BASE_URL}The Choice.m4a`, title: 'The Choice', cover: '../input/Firefly/3-3.webp' },
      ],
    },
  },
};

function formatPlayerTime(seconds) {
  if (!isFinite(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

// Icônes minimales (traits lucide reproduits à la main, pas de dépendance) -
// currentColor pour suivre la couleur du bouton (hover/actif compris).
const PLAYER_ICONS = {
  play: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 4l14 8-14 8V4z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
  skipBack: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>',
  skipForward: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
};

function setupCardAudioPlayers(slug) {
  const players = CARD_AUDIO_PLAYER[slug];
  if (!players) return;
  Object.entries(players).forEach(([cardKey, { tracks }]) => {
    const container = document.querySelector(`[data-card-audio-player="${cardKey}"]`);
    if (!container || !tracks || !tracks.length) return; // pas de piste -> rien (même logique que le composant d'origine : if (!src) return null;)

    // Une pochette PAR piste (voir CARD_AUDIO_PLAYER), pas une seule fixe
    // pour tout le lecteur - mise à jour dans loadTrack, comme le titre.
    const coverEl = document.createElement('div');
    coverEl.className = 'card-audio-player-cover';
    const coverImg = document.createElement('img');
    coverImg.alt = '';
    coverEl.appendChild(coverImg);
    container.appendChild(coverEl);

    const titleEl = document.createElement('h3');
    titleEl.className = 'card-audio-player-title';
    container.appendChild(titleEl);

    const slider = document.createElement('div');
    slider.className = 'card-audio-player-slider';
    const sliderFill = document.createElement('div');
    sliderFill.className = 'card-audio-player-slider-fill';
    slider.appendChild(sliderFill);

    const timeRow = document.createElement('div');
    timeRow.className = 'card-audio-player-time';
    const currentTimeEl = document.createElement('span');
    currentTimeEl.textContent = '0:00';
    const durationEl = document.createElement('span');
    durationEl.textContent = '0:00';
    timeRow.append(currentTimeEl, durationEl);

    const audio = document.createElement('audio');
    audio.preload = 'metadata';

    const controls = document.createElement('div');
    controls.className = 'card-audio-player-controls';

    const makeButton = (icon, label) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card-audio-player-btn';
      btn.setAttribute('aria-label', label);
      btn.innerHTML = PLAYER_ICONS[icon];
      return btn;
    };

    const shuffleBtn = makeButton('shuffle', 'Shuffle');
    const prevBtn = makeButton('skipBack', 'Previous');
    const playBtn = makeButton('play', 'Play');
    const nextBtn = makeButton('skipForward', 'Next');
    const repeatBtn = makeButton('repeat', 'Repeat');

    shuffleBtn.addEventListener('click', () => shuffleBtn.classList.toggle('is-active'));
    repeatBtn.addEventListener('click', () => repeatBtn.classList.toggle('is-active'));

    // Plusieurs pistes (voir CARD_AUDIO_PLAYER) : précédent/suivant bouclent
    // d'une extrémité à l'autre de la liste plutôt que de s'arrêter aux
    // bords (comportement de lecteur/playlist habituel, contrairement au
    // carrousel d'images de la carte 1 qui, lui, ne boucle pas).
    let trackIndex = 0;
    const loadTrack = (i, autoplay) => {
      trackIndex = ((i % tracks.length) + tracks.length) % tracks.length;
      const track = tracks[trackIndex];
      titleEl.textContent = track.title || '';
      if (track.cover) coverImg.src = track.cover;
      audio.src = track.src;
      if (autoplay) audio.play();
    };
    loadTrack(0, false);

    // Convention habituelle des lecteurs (Spotify etc.) : "précédent" ne
    // change de piste que tout au début - passé quelques secondes, on est
    // plus susceptible de vouloir juste revenir au début de LA MÊME piste
    // que sauter à la précédente.
    prevBtn.addEventListener('click', () => {
      if (audio.currentTime > 3) {
        audio.currentTime = 0;
      } else {
        loadTrack(trackIndex - 1, !audio.paused);
      }
    });
    nextBtn.addEventListener('click', () => loadTrack(trackIndex + 1, !audio.paused));
    // Fin de piste : reprend la même si "repeat" est actif, sinon enchaîne
    // sur la suivante (boucle sur la liste entière une fois la dernière
    // piste terminée).
    audio.addEventListener('ended', () => {
      if (repeatBtn.classList.contains('is-active')) {
        audio.currentTime = 0;
        audio.play();
      } else {
        loadTrack(trackIndex + 1, true);
      }
    });

    playBtn.addEventListener('click', () => {
      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
    });
    audio.addEventListener('play', () => { playBtn.innerHTML = PLAYER_ICONS.pause; playBtn.setAttribute('aria-label', 'Pause'); });
    audio.addEventListener('pause', () => { playBtn.innerHTML = PLAYER_ICONS.play; playBtn.setAttribute('aria-label', 'Play'); });

    audio.addEventListener('timeupdate', () => {
      const progress = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
      sliderFill.style.width = `${isFinite(progress) ? progress : 0}%`;
      currentTimeEl.textContent = formatPlayerTime(audio.currentTime);
      durationEl.textContent = formatPlayerTime(audio.duration);
    });
    audio.addEventListener('loadedmetadata', () => {
      durationEl.textContent = formatPlayerTime(audio.duration);
    });

    slider.addEventListener('click', (e) => {
      if (!audio.duration) return;
      const rect = slider.getBoundingClientRect();
      const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
      audio.currentTime = ratio * audio.duration;
    });

    controls.append(shuffleBtn, prevBtn, playBtn, nextBtn, repeatBtn);
    container.append(slider, timeRow, controls, audio);
  });
}

// Images d'une carte affichées en carousel "coverflow" (clé = slug -> clé
// de carte -> liste d'URLs), voir setupCoverflowGallery. Vide pour
// l'instant : aucun projet n'a encore de galerie, l'infrastructure est
// prête (même principe que PANEL_IMAGE_OBJECT_POSITION).
const CARD_GALLERY_IMAGES = {
  'break shot': {
    // Même dossier que CARD_IMAGES/le hero (input/<Nom du projet>/), photos
    // nommées 1-1.webp à 1-10.webp.
    'card-1': Array.from({ length: 10 }, (_, i) => `../input/Break Shot/1-${i + 1}.webp`),
  },
  firefly: {
    // Même dossier que CARD_IMAGES/le hero (input/<Nom du projet>/), photos
    // nommées 1-1.webp à 1-7.webp.
    'card-1': Array.from({ length: 7 }, (_, i) => `../input/Firefly/1-${i + 1}.webp`),
  },
  monolith: {
    // Même dossier que CARD_IMAGES/le hero (input/<Nom du projet>/), photos
    // nommées 3-1.webp à 3-13.webp.
    'card-3': Array.from({ length: 13 }, (_, i) => `../input/Monolith/3-${i + 1}.webp`),
  },
};

// Légende sous le carrousel (voir .card-gallery-caption dans style.css),
// une entrée par image de CARD_GALLERY_IMAGES ci-dessus, même clé slug ->
// data-card. Optionnel : une carte sans entrée ici retombe sur un repère
// "n / total" (voir setupCoverflowGallery).
const CARD_GALLERY_CAPTIONS = {
  monolith: {
    'card-3': [
      'Testing and soldering the first amplifier (unused, poor quality).',
      'Cutting the MDF panels to shape the enclosure.',
      'Gluing and dry-fitting the wooden structure.',
      'Drilling and fitting the power connector.',
      'Fitting glass wool inside for damping.',
      "Fully closing and sanding the enclosure's edges.",
      'Sanding the face to round off the block.',
      'Ebony veneer and finishing with ebony powder mixed into glue.',
      'Finishing: pore filler and oil.',
      'Assembling the central steel mast with the enclosure.',
      "Reinforcing the plate that holds the turntable.",
      'Cutting the aluminum strips.',
      "Assembling the electronics inside the turntable's body.",
    ],
  },
  'break shot': {
    'card-1': [
      'Base sketches of the pool table and the gravity feed system.',
      'The original furniture piece, 70 years old.',
      "Renovation, sanding, and reinforcement of the furniture's structure.",
      "Renovation, sanding, and reinforcement of the furniture's structure.",
      "Building the frame that holds the pool table to the furniture piece; designed like a boat hull, for a durable, sturdy structure.",
      'Fitting the felt cloth onto a wooden board.',
      "Making the legs; originally meant to raise the table so people wouldn't lean on it too heavily, but ultimately removed since the added height made for a worse playing experience.",
      'Assembling the table onto the furniture piece.',
      "Adding pockets to collect the balls, with a dedicated storage space built into one of the furniture's compartments.",
      'Finishing touches: charred-wood rails and a matching charred-wood triangle rack, plus a plexiglass panel over the ball-collection space.',
    ],
  },
  firefly: {
    'card-1': [
      'Original sketch laying out the first thoughts on material assembly and aesthetic choices.',
      'Photoshop mockup of the guitar to get a clear visual and adjust design aspects in real time.',
      'Absence of a soundhole rosette; a choice that streamlines the soundboard, making room for the resin logo.',
      'Resin integration; white fluorescent resin cast into the soundboard, the fretboard inlays, and the headstock patterns.',
      "Aluminum sheet integration on the back, reproducing the fern pattern from the main character's tattoo.",
      'Standard shape dropped in favor of an ebony bridge cut into a fern shape, validated through structural simulation in SolidWorks.',
      'Active preamp with under-saddle pickup, faithfully capturing the woods\' natural dynamics and harmonics.',
    ],
  },
};

// Carousel 3D façon Cover Flow : la carte du centre fait face à l'écran,
// les voisines basculent et reculent en perspective de part et d'autre,
// avec un fondu vers les bords - porté depuis un composant React (qui
// pilotait tout via des refs + requestAnimationFrame, sans re-render à
// chaque frame) vers du DOM/style inline vanilla, ce site n'ayant pas de
// React. `pos` est la position fractionnaire de la carte au centre (LA
// source de vérité) ; paint() la traduit en transform/opacity/z-index pour
// chaque carte, sans jamais reconstruire le DOM - un simple survol/drag
// est bien trop fréquent pour se permettre de re-render quoi que ce soit.
// initialIndex : position de départ (voir setupGalleryLightbox - rouvre la
// galerie agrandie sur la même carte qu'affichait la petite, pas de saut
// visuel). onCenterClick : appelée au clic sur la carte du CENTRE
// spécifiquement (voir endDrag plus bas) - clic sur une carte voisine ou le
// cadre en dehors du centre continue de naviguer normalement. centerScaleGrowth
// : voir SCALE_GROWTH plus bas - 0.15 par défaut (petite galerie encastrée),
// relevé pour le lightbox agrandi (voir setupGalleryLightbox) pour que la
// carte du centre y ressorte vraiment, pas juste à l'échelle des voisines.
function setupCoverflowGallery(container, images, imageCaptions, noFade, maxCardVh, initialIndex = 0, onCenterClick, centerScaleGrowth = 0.15) {
  if (!images || !images.length) return;
  const count = images.length;

  // Valeurs adoucies par rapport au composant d'origine (44°/plafond 82°) :
  // avec VISIBLE_RANGE = 2.5 (voir plus bas), les cartes à distance 2 se
  // retrouvaient inclinées à ~65°, quasi de profil - techniquement
  // affichées (opacité non nulle) mais illisibles en pratique, ce qui
  // donnait l'impression qu'il n'y en avait que 3. Inclinaison réduite et
  // plafonnée plus tôt pour que les 5 cartes restent reconnaissables.
  const ROTATE = 30; // degrés d'inclinaison de la 1re voisine
  const DEPTH = 0.6; // recul de la 1re voisine, en fraction de la largeur de carte
  const PERSPECTIVE = 3; // distance de la "caméra", en multiple de la largeur de carte
  const FALLOFF = 0.56; // < 1 : l'inclinaison/le recul ralentissent en s'éloignant du centre
  const TILT_CAP = 55; // degrés max, jamais quasi de profil
  // noFade (voir CARD_GALLERY_NO_FADE) : sur fond clair, l'estompage
  // progressif des cartes voisines (pensé pour un fond sombre) les rendait
  // délavées/sales au lieu de discrètes - désactivé au cas par cas plutôt
  // que globalement, les autres galeries restant sur fond sombre.
  const FADE = noFade ? 0 : 0.06; // opacité perdue par carte d'écart avec le centre (plus douce qu'avant, 5 cartes à garder lisibles)
  const GAP = 0.05; // espace entre cartes, en fraction de la largeur de carte
  // Nombre de cartes visibles simultanément (centre + 2 de chaque côté) :
  // indépendant de `count`, contrairement à l'original qui masquait une
  // carte pile au moment où elle allait être téléportée de l'autre côté de
  // l'anneau (count / 2 - distance) - avec peu d'images, cette coupure
  // arrivait bien avant que 5 cartes n'aient eu la place de s'afficher.
  // Mobile : 3 cartes visibles (centre + 1 de chaque côté) au lieu de 5,
  // sinon bien trop petites sur un écran étroit - voir aussi CARDS_ACROSS
  // plus bas (cartes agrandies en conséquence, moins nombreuses à caser).
  const VISIBLE_RANGE = IS_MOBILE ? 1.5 : 2.5;
  const SCALE_GROWTH = centerScaleGrowth; // par carte de distance en moins (voir scale ci-dessous) : centre = +2*ça, voisine directe = +1*ça, distance >= 2 = +0 (taille actuelle)

  const frame = document.createElement('div');
  frame.className = 'card-gallery-frame';
  frame.tabIndex = 0;
  frame.setAttribute('role', 'region');
  frame.setAttribute('aria-roledescription', 'carousel');
  // Le padding vertical par défaut (voir style.css) est calibré pour
  // SCALE_GROWTH = 0.15 (0.15 * cf-card de chaque côté = exactement le
  // débordement de la carte du centre à ce facteur, voir le calcul du
  // scale plus bas). Avec centerScaleGrowth relevé (voir setupGalleryLightbox),
  // ce padding fixe ne suffit plus - la carte agrandie déborde du cadre,
  // et "auto" (voir commentaire CSS) laisse alors fuiter un vrai scroll
  // jusqu'à la page. Recalculé ici en JS pour rester toujours exact, quel
  // que soit centerScaleGrowth.
  frame.style.padding = `calc(${centerScaleGrowth} * var(--cf-card) + 3rem) 0`;

  const stage = document.createElement('div');
  stage.className = 'card-gallery-stage';
  frame.appendChild(stage);

  const cards = images.map((src) => {
    const card = document.createElement('div');
    card.className = 'card-gallery-card';
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.draggable = false;
    img.loading = 'lazy';
    card.appendChild(img);
    stage.appendChild(card);
    return card;
  });

  // Hitbox dédiée (voir onCenterClick), statique, posée par-dessus
  // l'emplacement de la carte du centre (au repos, jamais animée - voir
  // .card-gallery-center-hit dans style.css) : sert UNIQUEMENT à détecter
  // "le clic a démarré sur le centre" au pointerdown (voir plus bas), le
  // seul moment où e.target reste fiable - e.target.closest() au pointerup
  // et document.elementFromPoint() se sont tous les deux révélés cassés une
  // fois frame.setPointerCapture() posé (retargete tout sur `frame`).
  const centerHit = document.createElement('div');
  centerHit.className = 'card-gallery-center-hit';
  if (onCenterClick) stage.appendChild(centerHit);

  container.appendChild(frame);

  // Légende sous le carrousel (voir CARD_GALLERY_CAPTIONS) : suit la carte
  // actuellement au centre, pas celle sous le doigt/curseur pendant un
  // drag. Repli sur un repère "n / total" si aucune légende n'est fournie
  // pour cette carte.
  const caption = document.createElement('p');
  caption.className = 'card-gallery-caption';
  container.appendChild(caption);
  const captions = imageCaptions && imageCaptions.length === count
    ? imageCaptions
    : images.map((_, i) => `${i + 1} / ${count}`);
  let lastCaptionIndex = -1;

  let pos = initialIndex;
  let target = initialIndex;
  let width = 0;
  let rafId = null;

  const paint = () => {
    if (!width) return;
    const centerIndex = ((Math.round(pos) % count) + count) % count;
    if (centerIndex !== lastCaptionIndex) {
      lastCaptionIndex = centerIndex;
      caption.textContent = captions[centerIndex];
    }
    const pitch = width * (1 + GAP);
    cards.forEach((card, index) => {
      // Replie la distance par le chemin le plus court sur l'anneau (boucle
      // infinie) - c'est tout le mécanisme du bouclage, aucun DOM cloné ni
      // remanié.
      let offset = index - pos;
      offset = ((offset % count) + count) % count;
      if (offset > count / 2) offset -= count;

      const distance = Math.abs(offset);
      // L'inclinaison ET le recul ralentissent en s'éloignant du centre
      // (doubler la distance n'ajoute qu'environ moitié plus de chaque) -
      // une rampe linéaire aurait donné une 2e carte quasi de profil.
      const ramp = Math.pow(distance, FALLOFF);
      const tilt = Math.min(ROTATE * ramp, TILT_CAP) * Math.sign(offset); // plafonné bien avant le profil, les 5 cartes restent lisibles
      // Carte du centre plus grande, les voisines directes un peu moins,
      // celles à distance >= 2 gardent la taille actuelle (SCALE_GROWTH: 0,
      // rien ne change pour elles) - via transform (pas width/height), donc
      // purement visuel : aucune des cartes n'est en flux normal (toutes en
      // position: absolute), un scale() ne fait donc bouger ni la hauteur
      // du stage ni rien autour, contrairement à une vraie resize.
      // Mobile : distance ARRONDIE (pas continue) pour ce calcul - le scale
      // saute directement à sa valeur finale plutôt que de grandir petit à
      // petit à chaque frame pendant le drag/l'inertie. Un scale() qui varie
      // en continu forçait le GPU à re-texturer la carte à une résolution
      // différente à quasi chaque frame (voir will-change plus haut, retiré
      // sur mobile) - la texture réapparaissait floue le temps que le
      // dernier repaint "rattrape" le scale final, d'où l'effet flou ->
      // net observé. Une valeur de scale qui saute directement, puis reste
      // FIXE tant que la carte ne change pas de position relative au
      // centre, laisse au GPU une seule vraie résolution à texturer.
      const scaleDistance = IS_MOBILE ? Math.round(distance) : distance;
      const scale = 1 + Math.max(0, 2 - scaleDistance) * SCALE_GROWTH;

      card.style.transform =
        `translateX(calc(-50% + ${offset * pitch}px)) ` +
        `translateZ(${-DEPTH * width * ramp}px) rotateY(${-tilt}deg) scale(${scale})`;

      // Une carte est téléportée de l'autre côté de l'anneau à exactement
      // un demi-tour du centre : elle doit avoir disparu avant, sinon le
      // saut se voit - Math.min(count / 2, VISIBLE_RANGE) ne dépasse donc
      // jamais ce point, tout en visant VISIBLE_RANGE dès que count est
      // assez grand pour le permettre.
      const edge = Math.min(1, Math.max(0, Math.min(count / 2, VISIBLE_RANGE) - distance));
      // noFade : pleine opacité tant que la carte est dans la plage visible
      // (edge > 0), pas de palier intermédiaire - contrairement au calcul
      // par défaut, "edge" à lui seul dimmait déjà les cartes proches de la
      // limite (ex: 50% à distance 2 pour VISIBLE_RANGE 2.5), ce qui
      // donnait des cartes délavées sur les bords même avec FADE à 0.
      card.style.opacity = noFade ? (edge > 0 ? '1' : '0') : String(Math.max(0, 1 - FADE * distance) * edge);
      card.style.zIndex = String(100 - Math.round(distance));
    });
  };

  const settle = (t) => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    target = t;
    const step = () => {
      const remaining = target - pos;
      if (Math.abs(remaining) < 0.0004) {
        pos = target;
        paint();
        rafId = null;
        return;
      }
      pos += remaining * 0.16; // amorti exponentiel, pas un ressort
      paint();
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  };

  const nudge = (by) => settle(Math.round(target) + by);

  let dragId = null;
  let dragStartX = 0;
  let dragStartPos = 0;
  let dragVelocity = 0;
  let dragTime = 0;
  let dragStartedOnCenterHit = false; // capturé au pointerdown (voir plus bas), seul moment où e.target est encore fiable

  // Une seule zone (tout le cadre) pour le clic ET le glisser - pas deux
  // zones séparées (bords cliquables / centre glissable, essayé avant) :
  // on tranche à la fin du geste (endDrag) selon la distance parcourue.
  // En dessous de CLICK_MOVE_THRESHOLD, c'était un clic, pas un glissement.
  const CLICK_MOVE_THRESHOLD = 6; // px

  frame.addEventListener('pointerdown', (e) => {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    dragStartedOnCenterHit = e.target === centerHit;
    frame.setPointerCapture(e.pointerId);
    target = pos;
    dragId = e.pointerId;
    dragStartX = e.clientX;
    dragStartPos = pos;
    dragVelocity = 0;
    dragTime = performance.now();
  });

  frame.addEventListener('pointermove', (e) => {
    if (dragId !== e.pointerId) return;
    const pitch = width * (1 + GAP);
    if (!pitch) return;
    const now = performance.now();
    const previous = pos;
    pos = dragStartPos - (e.clientX - dragStartX) / pitch;
    dragVelocity = ((pos - previous) / Math.max(now - dragTime, 1)) * 1000; // cartes par seconde, pour le "lancer"
    dragTime = now;
    paint();
  });

  const endDrag = (e) => {
    if (dragId !== e.pointerId) return;
    dragId = null;
    if (Math.abs(e.clientX - dragStartX) < CLICK_MOVE_THRESHOLD) {
      // Clic (quasi pas de mouvement) démarré sur la hitbox du CENTRE (voir
      // dragStartedOnCenterHit, capturé au pointerdown - e.target y est
      // encore fiable, contrairement à ici au pointerup une fois
      // frame.setPointerCapture posé, qui retargete tout sur `frame`) :
      // agrandit toute la galerie dans le lightbox plutôt que de naviguer -
      // un clic démarré sur une carte voisine, ou le cadre en dehors du
      // centre, continue de naviguer normalement (voir plus bas).
      if (onCenterClick && dragStartedOnCenterHit) {
        onCenterClick();
        return;
      }
      // Sinon : avance/recule d'une carte selon le côté cliqué, plutôt que
      // de "régler" un glissement quasi nul (qui ramènerait juste à la
      // position de départ, ressenti comme "le clic ne fait rien"). target
      // (pas pos) : ignore le minuscule jitter posé par pointermove pendant
      // ce clic.
      const rect = frame.getBoundingClientRect();
      const clickedRight = (e.clientX - rect.left) > rect.width / 2;
      nudge(clickedRight ? 1 : -1);
      return;
    }
    const carried = Math.max(-2, Math.min(2, dragVelocity * 0.18)); // laisse porter un "lancer", jamais plus de 2 cartes
    settle(Math.round(pos + carried));
  };
  frame.addEventListener('pointerup', endDrag);
  frame.addEventListener('pointercancel', endDrag);

  frame.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(1); }
  });

  // Taille de carte calculée à partir de la largeur RÉELLE du cadre, pas
  // d'une valeur fixe (clamp() CSS) : c'était la vraie cause du "ça ne
  // prend pas toute la largeur" - le clamp() ne connaît pas l'espace
  // réellement disponible, les cartes restaient à leur taille par défaut,
  // regroupées au centre, quelle que soit la largeur du conteneur. Plus ce
  // chiffre est bas, plus chaque carte (carrée : largeur = hauteur, voir
  // .card-gallery-card) est grande - remonté à 4.7 (4.3 faisait déborder
  // .card-panel-body sur un écran 16/9 1080p classique, où le budget de
  // hauteur (82vh) est plus serré ; ce composant est partagé entre tous les
  // projets avec galerie, voir Break Shot card-1).
  const CARDS_ACROSS = IS_MOBILE ? 3 : 4.7;
  // Plafond de la taille de carte (px), PAS de la largeur du panneau : sur
  // un écran ultra-large (21/9...), .card-panel-body peut légitimement
  // s'élargir (ancré sur l'image, pas sur le bord de la fenêtre - voir
  // applyWideBodyWidth) sans que ça pose problème EN SOI ; c'est la carte
  // (carrée : largeur = hauteur, voir .card-gallery-card) qui grandit avec
  // elle et fait déborder .card-panel-body verticalement (82vh) si rien ne
  // la borne. Optionnel (voir CARD_GALLERY_MAX_CARD_VH) : pas de plafond
  // par défaut, pour ne pas rapetisser une galerie sans besoin de garde-fou.
  const maxCardSize = maxCardVh ? window.innerHeight * maxCardVh : Infinity;
  const measure = () => {
    const frameWidth = frame.offsetWidth;
    if (frameWidth) {
      const cardSize = Math.min(frameWidth / CARDS_ACROSS, maxCardSize);
      container.style.setProperty('--cf-card', `${cardSize}px`);
    }
    const card = cards[0];
    if (!card) return;
    width = card.offsetWidth;
    paint();
  };
  measure();
  if ('ResizeObserver' in window) {
    new ResizeObserver(measure).observe(frame);
  } else {
    window.addEventListener('resize', measure);
  }

  // Exposé pour setupCardGalleries (voir setupGalleryLightbox) : rouvrir la
  // version agrandie sur la même carte qu'affichait celle-ci au moment du
  // clic, via initialIndex ci-dessus.
  return { getIndex: () => ((Math.round(pos) % count) + count) % count };
}

// Cartes dont les voisines gardent une opacité pleine (voir noFade dans
// setupCoverflowGallery) - pensé pour un fond de carte clair, où
// l'estompage par défaut (pensé pour un fond sombre) rend les cartes
// voisines délavées plutôt que discrètes.
const CARD_GALLERY_NO_FADE = {
  monolith: ['card-3'],
};

// Plafond de la taille de carte (voir maxCardSize dans setupCoverflowGallery),
// en fraction de vh - opt-in au cas par cas, PAS une valeur par défaut
// globale : une galerie SANS ce plafond garde sa taille adaptative normale
// (largeur du panneau / CARDS_ACROSS), sans quoi un plafond global écrase
// les galeries dont la colonne est délibérément plus large (déjà vécu avec
// Firefly card-1, qui avait un widthFraction dédié avant de passer sur ce
// même mécanisme).
// Vide : Break Shot card-1 alignée sur Firefly/Monolith card-3 (même
// comportement par défaut, pas de plafond spécifique) - l'image de carte
// est passée en 1/1 (voir PANEL_IMAGE_OVERRIDES) pour laisser moins de
// largeur en trop à la galerie, au lieu d'un plafond artificiel dessus.
const CARD_GALLERY_MAX_CARD_VH = {};

// Lightbox partagé par toutes les galeries coverflow (voir
// setupCoverflowGallery/CARD_GALLERY_IMAGES) : un clic sur la carte du
// CENTRE (pas les voisines, voir onCenterClick dans setupCoverflowGallery)
// affiche TOUTE la galerie en grand PAR-DESSUS le reste de la page - même
// principe que setupSlideLightbox (marge ~10%, fond assombri visible
// autour, bouton "Return"), mais reconstruit une galerie coverflow
// complète et interactive à l'intérieur (voir open() plus bas) plutôt
// qu'une simple image statique : sa taille de carte suit déjà la largeur
// RÉELLE de son cadre (voir CARDS_ACROSS dans setupCoverflowGallery), donc
// lui donner un conteneur plus grand suffit à l'agrandir, sans plafond
// (maxCardVh) ici.
let galleryLightbox = null;
function setupGalleryLightbox() {
  if (galleryLightbox) return galleryLightbox;

  const overlay = document.createElement('div');
  overlay.className = 'slide-lightbox'; // même coquille (fixed/backdrop/fade) que le lightbox du carrousel slide
  overlay.hidden = true;

  const backdrop = document.createElement('div');
  backdrop.className = 'slide-lightbox-backdrop';
  overlay.appendChild(backdrop);

  const stage = document.createElement('div');
  stage.className = 'slide-lightbox-stage gallery-lightbox-stage';
  overlay.appendChild(stage);

  // Reconstruite à chaque ouverture (voir open() plus bas) : une galerie
  // coverflow complète (setupCoverflowGallery), pas juste une image.
  const galleryContainer = document.createElement('div');
  galleryContainer.className = 'gallery-lightbox-gallery';
  stage.appendChild(galleryContainer);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'group fixed top-6 left-6 z-[310] flex items-center overflow-hidden rounded-full ' +
    'bg-black/60 text-sm tracking-wide text-white backdrop-blur transition-colors hover:bg-black/80';
  closeBtn.innerHTML =
    '<span class="py-2 pl-11 pr-4 transition-opacity duration-500 group-hover:opacity-0">Return</span>' +
    '<i class="not-italic absolute inset-y-0 left-0 z-10 grid w-[25px] place-items-center bg-white/25 transition-all duration-500 group-hover:w-full">' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" class="opacity-80" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></i>';
  overlay.appendChild(closeBtn);

  document.body.appendChild(overlay);

  const CLOSE_MS = 300; // doit correspondre à la transition opacity ci-dessous (voir style.css)
  const close = () => {
    overlay.classList.remove('is-open');
    setTimeout(() => {
      overlay.hidden = true;
      galleryContainer.innerHTML = ''; // détruit l'instance agrandie, reconstruite à la prochaine ouverture
      galleryContainer.style.removeProperty('--cf-card');
    }, CLOSE_MS);
  };
  backdrop.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') close();
  });

  // Pas de verrouillage de scroll ici : même raison que setupSlideLightbox
  // (une galerie n'existe que dans .card-panel-body-main, déjà verrouillé
  // par setupCardStack avant que ce lightbox ne puisse s'ouvrir).
  const open = ({ images, captions, noFade, initialIndex }) => {
    // centerScaleGrowth relevé (0.4, contre 0.15 par défaut) : la carte du
    // centre doit vraiment ressortir dans le lightbox agrandi, pas juste
    // suivre l'échelle habituelle des voisines.
    setupCoverflowGallery(galleryContainer, images, captions, noFade, undefined, initialIndex, undefined, 0.4);
    overlay.hidden = false;
    // Double rAF (même raison qu'ailleurs sur ce site, voir setupCardStack) :
    // garantit que le navigateur a peint l'état initial (opacity: 0) avant
    // de déclencher la transition vers opacity: 1.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add('is-open'));
    });
  };

  galleryLightbox = { open };
  return galleryLightbox;
}

function setupCardGalleries(slug) {
  const galleries = CARD_GALLERY_IMAGES[slug];
  if (!galleries) return;
  Object.entries(galleries).forEach(([cardKey, images]) => {
    const container = document.querySelector(`[data-card-gallery="${cardKey}"]`);
    const noFade = (CARD_GALLERY_NO_FADE[slug] || []).includes(cardKey);
    const maxCardVh = (CARD_GALLERY_MAX_CARD_VH[slug] || {})[cardKey];
    const captions = (CARD_GALLERY_CAPTIONS[slug] || {})[cardKey];
    if (!container) return;
    // `controller` capturée par référence dans onCenterClick (appelée bien
    // après ce forEach, au clic - déjà assignée à ce moment-là) : besoin
    // de son getIndex() pour rouvrir le lightbox sur la même carte que la
    // petite galerie affichait.
    let controller = null;
    // Pas de lightbox plein écran sur mobile (voir consigne) : la galerie
    // occupe déjà toute la largeur de l'écran, l'agrandir davantage n'a pas
    // de sens - onCenterClick absent, pas de hitbox centrale posée du tout
    // (voir plus haut dans setupCoverflowGallery).
    // centerScaleGrowth relevé sur mobile (0.6 contre 0.15 par défaut) :
    // pas de lightbox pour l'agrandir davantage au clic (voir juste
    // au-dessus), la carte du centre doit donc déjà ressortir nettement
    // dans la petite galerie elle-même.
    controller = setupCoverflowGallery(container, images, captions, noFade, maxCardVh, 0, IS_MOBILE ? undefined : () => {
      setupGalleryLightbox().open({ images, captions, noFade, initialIndex: controller.getIndex() });
    }, IS_MOBILE ? 0.6 : undefined);
  });
}

// Carrousel "slide" (une image à la fois, flèches + points de progression,
// voir .card-panel-slide-carousel dans style.css) - porté depuis un
// composant React (motion/react pour l'animation à ressort, aucune
// dépendance de ce genre sur ce site vanilla) vers une transition CSS
// classique (var(--ease), comme le reste du site). Pas de boucle infinie :
// les flèches se désactivent en butée, comme le composant d'origine
// (disabled={index === 0} / index === items.length - 1). Clé = slug ->
// data-card -> liste de { url, title } (title sert d'alt, pas de légende
// affichée - le composant d'origine ne montre pas de titre non plus).
const CARD_SLIDE_CAROUSEL = {
  osmose: {
    'card-2': [
      { url: '../input/Osmose/2-1.webp', title: 'Exploded view of the NFC light frame.' },
      { url: '../input/Osmose/2-2.webp', title: 'Frames installed in situ.' },
      { url: '../input/Osmose/2-3.webp', title: 'Backlighting of the album being played, and interface.' },
    ],
  },
  eden: {
    'card-1': [
      { url: '../input/Eden/1-1.webp', title: '' },
      { url: '../input/Eden/1-2.webp', title: '' },
      { url: '../input/Eden/1-3.webp', title: '' },
    ],
    'card-3': [
      { url: '../input/Eden/3-1.webp', title: '' },
      { url: '../input/Eden/3-2.webp', title: '' },
      { url: '../input/Eden/3-3.webp', title: '' },
      { url: '../input/Eden/3-4.webp', title: '' },
      { url: '../input/Eden/3-5.webp', title: '' },
      { url: '../input/Eden/3-6.webp', title: '' },
    ],
  },
  'hermès birkin sport': {
    'card-2': [
      { url: '../input/Hermès Birkin Sport/2-1.webp', title: '' },
      { url: '../input/Hermès Birkin Sport/2-2.webp', title: '' },
      { url: '../input/Hermès Birkin Sport/2-3.webp', title: '', objectPosition: 'center 30%' },
    ],
  },
  'the cube': {
    'card-4': [
      { url: '../input/The Cube/4-1.webp', title: 'Brand variations: Drunk Elephant, NARS, and Shiseido.' },
      { url: '../input/The Cube/4-2.webp', title: 'Detailed immersion: NARS counter.' },
      { url: '../input/The Cube/4-3.webp', title: 'Detailed immersion: NARS counter.' },
    ],
  },
  pulse: {
    'card-1': [
      { url: '../input/Pulse/1-1.webp', title: "Dopamine reward schematic; the goal: understand how to cut the reward loop coming from digital use, and how to put it to good use.", objectPosition: 'center' },
      { url: '../input/Pulse/1-2.webp', title: 'P.O.C. 1: testing disruptive vibrations at a university.', objectPosition: 'center 65%' },
      { url: '../input/Pulse/1-3.webp', title: "P.O.C. 2: testing disruptive and soothing vibrations at a middle school, i.e. on the project's actual target audience.", objectPosition: 'center 65%' },
    ],
    'card-2': [
      { url: '../input/Pulse/2-1.webp', title: 'Disruptive vibrations.', objectPosition: 'center' },
      { url: '../input/Pulse/2-2.webp', title: 'P.O.C. 1 verbatims.', objectPosition: 'center' },
      { url: '../input/Pulse/2-3.webp', title: 'P.O.C. 2 verbatims.', objectPosition: 'center' },
      { url: '../input/Pulse/2-4.webp', title: 'Soothing vibrations and cardiac coherence.', objectPosition: 'center' },
    ],
    'card-3': [
      { url: '../input/Pulse/3-1.webp', title: 'Interchangeable plates.', objectPosition: 'center' },
      { url: '../input/Pulse/3-2.webp', title: 'First sketches of the locking mechanism and the app.', objectPosition: 'center' },
      { url: '../input/Pulse/3-3.webp', title: 'Tracking and rewards app.', objectPosition: 'center' },
    ],
  },
};

// Plafond de hauteur du cadre (voir fitRatioCappedFrame plus bas), en vh - 45
// par défaut (échelle commune aux autres visuels du panneau). Surcharge au
// cas par cas pour les cartes SANS texte à côté (rien d'autre à budgétiser
// dans .card-panel-body, voir Osmose card-2) : le carrousel peut alors
// prendre tout l'espace vertical dispo (82vh, même plafond que
// .card-panel-body lui-même) plutôt que rester bridé à 45vh comme s'il
// partageait la place avec du texte.
const CARD_SLIDE_CAROUSEL_FILL_HEIGHT_VH = {
  // 73, pas 82 (plafond exact de .card-panel-body) : laisse la place a la
  // marge du conteneur (margin-top: 1.5rem, voir .card-panel-slide-
  // carousel) ET a la legende sous le carrousel (voir .card-slide-
  // carousel-caption) sans declencher le scroll interne du panneau -
  // ramene de 78 a 73 apres l'ajout des legendes (nouvel element qui
  // n'existait pas quand 78 avait ete cale).
  osmose: { 'card-2': 60 },
  // Pulse card-3 : contrairement a Osmose card-2, il y a AUSSI du texte
  // au-dessus du carrousel dans cette colonne - valeur plus basse (55, pas
  // 73) pour laisser la place au texte, la legende ET les marges. Si le
  // texte est plus long qu'attendu, fitPanelBodyHeight (filet de securite
  // deja generique, voir plus bas) reduit sa taille de police plutot que
  // de laisser deborder.
  pulse: { 'card-3': 55 },
  // The Cube card-4 : même cas que Pulse card-3 (texte au-dessus du
  // carrousel, voir card-4-body), mais relevé à 62 (au lieu de 55) pour
  // agrandir le carrousel - fitPanelBodyHeight (filet de sécurité déjà
  // générique) compense en réduisant la taille du texte si jamais ça déborde.
  'the cube': { 'card-4': 62 },
};

// Ratio largeur/hauteur du cadre (16/9 par défaut) - surcharge ponctuelle
// pour Pulse card-1 : ses images (1-2/1-3, captures de slide) sont déjà
// EXACTEMENT en 16/9, le même ratio que le cadre par défaut - object-fit:
// cover n'a alors RIEN à recadrer (aucun débordement), rendant tout
// object-position sans le moindre effet visible. Un cadre plus large que
// 16/9 (2/1 ici) force un vrai débordement vertical à recadrer, pour que
// le biais vers le bas (voir objectPosition sur ces deux images) soit
// enfin visible - quel que soit la largeur réelle du cadre à l'écran.
const CARD_SLIDE_CAROUSEL_FRAME_RATIO = {
  pulse: { 'card-1': 1.85 },
  // Birkin card-2 : images déjà en 1920x1080 (16/9 exact, même ratio que le
  // cadre par défaut) - même piège que Pulse card-1, object-position n'a
  // rien à recadrer sans un cadre volontairement plus large.
  'hermès birkin sport': { 'card-2': 1.85 },
};

// Plafond du ratio FINAL du cadre (largeur/hauteur) - au-delà, le cadre est
// rogné sur les côtés (centré) plutôt que de laisser la hauteur ou la
// section changer. Eden card-3 : le cadre suivait la largeur de toute la
// colonne (pas de widthFraction/heightDrivenVh sur cette carte), ce qui le
// rendait bien plus panoramique que 21/9 sur un écran large.
const CARD_SLIDE_CAROUSEL_MAX_RATIO = {
  eden: { 'card-3': 21 / 9 },
  pulse: { 'card-1': 21 / 9, 'card-2': 21 / 9 },
  'hermès birkin sport': { 'card-2': 21 / 9 },
};

// Plafond de hauteur RELEVÉ (pas "hauteur cible", voir fillHeight plus bas -
// ici le calcul largeur/frameRatio reste actif, seul le plafond change) :
// sur Pulse card-1, le plafond par défaut (45vh) coupait systématiquement
// le calcul ratio-driven avant même qu'il ait sa chance de s'appliquer
// (largeur/frameRatio dépassait déjà 45vh quel que soit frameRatio, d'où
// "changer le ratio ne fait rien" - le plafond, pas le ratio, dictait la
// hauteur finale). Relevé à 55vh seulement (pas 70, ça a fait déborder
// .card-panel-body et sa barre de scroll interne - card-1 a AUSSI du texte
// au-dessus, contrairement à un pur calcul ratio-driven, il faut lui
// laisser sa place dans le budget de 82vh).
const CARD_SLIDE_CAROUSEL_MAX_HEIGHT_OVERRIDE_VH = {
  pulse: { 'card-1': 55 },
  // Birkin card-2 : même piège potentiel que Pulse card-1 (le plafond par
  // défaut de 45vh peut couper le calcul ratio-driven avant que le
  // frameRatio ait sa chance de s'appliquer) - relevé par précaution.
  'hermès birkin sport': { 'card-2': 55 },
};

// Paire d'index (0-based) entre lesquels la transition se fait en fondu
// enchaîné plutôt qu'en glissement horizontal (comportement par défaut du
// carrousel, voir render() plus bas) - cas ponctuel, demande explicite sur
// Osmose card-2 entre les images 2 et 3 (index 1 et 2).
const CARD_SLIDE_CAROUSEL_CROSSFADE = {
  osmose: { 'card-2': [1, 2] },
};

// Lightbox partagé par TOUS les carrousels slide (voir CARD_SLIDE_CAROUSEL) :
// un clic sur l'image (pas les flèches/points, voir track.addEventListener
// dans setupCardSlideCarousels) l'affiche en grand PAR-DESSUS le reste de la
// page - texte, image de carte, rien d'autre ne bouge en dessous - plutôt
// qu'un vrai plein écran : une marge (~10vh/10vw de chaque côté, voir
// .slide-lightbox-frame dans style.css) laisse voir la page assombrie
// derrière, façon lightbox classique. Une seule instance construite au
// premier clic (peu importe le carrousel) et réutilisée ensuite - un seul
// lightbox peut être ouvert à la fois de toute façon. Navigue via le `goTo`
// du carrousel D'ORIGINE (passé dans `active`, pas une copie de son état) :
// la vignette en dessous reste donc synchronisée une fois le lightbox
// refermé, exactement comme si on avait cliqué les flèches sur place.
let slideLightbox = null;
function setupSlideLightbox() {
  if (slideLightbox) return slideLightbox;

  const overlay = document.createElement('div');
  overlay.className = 'slide-lightbox';
  overlay.hidden = true;

  const backdrop = document.createElement('div');
  backdrop.className = 'slide-lightbox-backdrop';
  overlay.appendChild(backdrop);

  // stage (80vw x 80vh, voir style.css) ne recadre PAS lui-même : seul
  // .frame, à l'intérieur, a overflow: hidden (nécessaire pour cacher les
  // images voisines de la piste pendant qu'elles glissent, voir track plus
  // bas) - les flèches/légende restent DANS stage mais HORS de frame, sinon
  // elles se faisaient rogner par ce même overflow: hidden dès qu'elles
  // débordaient un peu de son cadre (positionnées volontairement à
  // l'extérieur, voir left/right négatifs dans style.css).
  const stage = document.createElement('div');
  stage.className = 'slide-lightbox-stage';
  overlay.appendChild(stage);

  const frame = document.createElement('div');
  frame.className = 'slide-lightbox-frame';
  stage.appendChild(frame);

  // Piste avec UNE image par item (comme .card-slide-carousel-track), pas
  // un unique <img> dont on changerait juste le src : navigue en glissant
  // horizontalement (transform: translateX, transition CSS) plutôt qu'en
  // sautant net d'une image à l'autre - voir buildTrack/render plus bas.
  const track = document.createElement('div');
  track.className = 'slide-lightbox-track';
  frame.appendChild(track);

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'slide-lightbox-nav is-prev';
  prevBtn.setAttribute('aria-label', 'Previous image');
  prevBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19l-7-7 7-7"/></svg>';
  stage.appendChild(prevBtn);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'slide-lightbox-nav is-next';
  nextBtn.setAttribute('aria-label', 'Next image');
  nextBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
  stage.appendChild(nextBtn);

  const caption = document.createElement('p');
  caption.className = 'slide-lightbox-caption';
  stage.appendChild(caption);

  // Même bouton que "Close" (voir data-card-close dans index.html), même
  // position (fixed top-6 left-6) - pas un bouton dédié posé sur le cadre
  // (essayé, voir historique : se faisait rogner par overflow: hidden comme
  // les flèches, et faisait doublon avec le vrai Close du panneau juste en
  // dessous). z-index au-dessus du lightbox (voir style.css) : reprend
  // exactement cette place pendant que le lightbox est ouvert, "Return"
  // plutôt que "Close" puisqu'il referme seulement le lightbox, pas le
  // panneau entier.
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'group fixed top-6 left-6 z-[310] flex items-center overflow-hidden rounded-full ' +
    'bg-black/60 text-sm tracking-wide text-white backdrop-blur transition-colors hover:bg-black/80';
  closeBtn.innerHTML =
    '<span class="py-2 pl-11 pr-4 transition-opacity duration-500 group-hover:opacity-0">Return</span>' +
    '<i class="not-italic absolute inset-y-0 left-0 z-10 grid w-[25px] place-items-center bg-white/25 transition-all duration-500 group-hover:w-full">' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" class="opacity-80" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></i>';
  overlay.appendChild(closeBtn);

  document.body.appendChild(overlay);

  let active = null; // { items, getIndex, goTo, crossfadePair } du carrousel actuellement affiché
  let images = []; // <img> du track, un par item d'`active` - dans le même ordre, pour cloner l'image sortante lors d'un fondu enchaîné

  // Reconstruit la piste à chaque ouverture : le lightbox est partagé par
  // TOUS les carrousels (voir setupSlideLightbox plus haut), la liste
  // d'images change donc d'un projet/carte à l'autre.
  const buildTrack = () => {
    track.innerHTML = '';
    images = active.items.map(({ url, title }) => {
      // slide = la "page" pleine largeur pour le glissement (voir style.css) ;
      // img à l'intérieur garde sa taille naturelle, centrée dedans - c'est
      // elle qu'on stocke dans `images`, pour le clone du fondu enchaîné
      // (voir crossfadeTo plus bas).
      const slide = document.createElement('div');
      slide.className = 'slide-lightbox-slide';
      const img = document.createElement('img');
      img.className = 'slide-lightbox-image';
      img.src = url;
      img.alt = title || '';
      slide.appendChild(img);
      track.appendChild(slide);
      return img;
    });
  };

  const slideTo = (i, animate) => {
    if (!animate) track.style.transition = 'none';
    track.style.transform = `translateX(-${i * 100}%)`;
    if (!animate) {
      void track.offsetHeight; // force reflow avant de réactiver la transition
      track.style.transition = '';
    }
  };

  // Même principe que crossfadeTo dans setupCardSlideCarousels (voir
  // CARD_SLIDE_CAROUSEL_CROSSFADE) : la piste saute instantanément à la
  // position cible pendant qu'un CLONE de l'image sortante, posé par-
  // dessus, s'efface en fondu - l'image entrante (déjà en place sous le
  // clone, via le saut instantané) apparaît donc progressivement dessous,
  // sans le moindre glissement visible. Le clone est enveloppé dans un
  // conteneur centré (comme .slide-lightbox-slide) plutôt qu'étiré à
  // 100%/100% : l'image garde sa taille NATURELLE (voir .slide-lightbox-
  // image dans style.css, sans object-fit) - l'étirer l'aurait déformée.
  const crossfadeTo = (i, fromIndex) => {
    const outgoingImg = images[fromIndex];
    if (outgoingImg) {
      const overlay = document.createElement('div');
      overlay.className = 'slide-lightbox-slide';
      overlay.style.position = 'absolute';
      overlay.style.inset = '0';
      overlay.style.zIndex = '1';
      overlay.style.opacity = '1';
      overlay.style.transition = 'opacity 0.6s ease-in-out';
      overlay.appendChild(outgoingImg.cloneNode(true));
      frame.appendChild(overlay);
      requestAnimationFrame(() => { overlay.style.opacity = '0'; });
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    }
    slideTo(i, false);
  };

  // animate=false pour le premier positionnement à l'ouverture (saute
  // directement sur l'index courant, rien à glisser depuis) - true pour
  // prev/next, où le glissement doit être visible. fromIndex : index de
  // départ AVANT ce changement, fourni seulement quand ce trajet précis
  // doit se faire en fondu enchaîné plutôt qu'en glissement (voir goToDelta
  // plus bas).
  const render = (animate, fromIndex) => {
    if (!active) return;
    const i = active.getIndex();
    if (fromIndex != null) {
      crossfadeTo(i, fromIndex);
    } else {
      slideTo(i, animate);
    }
    caption.textContent = active.items[i].title || '';
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === active.items.length - 1;
  };

  const CLOSE_MS = 300; // doit correspondre à la transition opacity ci-dessous (voir style.css)
  const close = () => {
    overlay.classList.remove('is-open');
    setTimeout(() => { overlay.hidden = true; active = null; }, CLOSE_MS);
  };

  // goTo (sur le carrousel D'ORIGINE, pas une copie) peut lui-même choisir
  // de faire un fondu enchaîné plutôt qu'un glissement (voir
  // CARD_SLIDE_CAROUSEL_CROSSFADE côté petit carrousel) - même décision
  // reprise ici, sur les mêmes indices, pour que le lightbox fasse
  // EXACTEMENT le même type de transition que la vignette en dessous.
  const goToDelta = (delta) => {
    if (!active) return;
    const from = active.getIndex();
    active.goTo(from + delta);
    const to = active.getIndex();
    if (to === from) return; // déjà en butée, goTo n'a rien fait
    const isCrossfade = active.crossfadePair
      && Math.abs(to - from) === 1
      && active.crossfadePair.includes(from)
      && active.crossfadePair.includes(to);
    render(true, isCrossfade ? from : null);
  };
  prevBtn.addEventListener('click', () => goToDelta(-1));
  nextBtn.addEventListener('click', () => goToDelta(1));
  backdrop.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') prevBtn.click();
    else if (e.key === 'ArrowRight') nextBtn.click();
  });

  // Pas de verrouillage de scroll ici (document/body overflow) : le
  // carrousel slide n'existe QUE dans .card-panel-body-main, donc jamais
  // visible/cliquable tant que setupCardStack (open()/openMobile()) n'a pas
  // déjà verrouillé le scroll pour le panneau - le refaire ici, PUIS le
  // défaire à la fermeture du lightbox, déverrouillerait le scroll par
  // erreur pendant que le panneau reste ouvert derrière.
  const open = (controller) => {
    active = controller;
    buildTrack();
    overlay.hidden = false;
    render(false);
    // Double rAF (même raison qu'ailleurs sur ce site, voir setupCardStack) :
    // garantit que le navigateur a peint l'état initial (opacity: 0) avant
    // de déclencher la transition vers opacity: 1.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add('is-open'));
    });
  };

  slideLightbox = { open };
  return slideLightbox;
}

function setupCardSlideCarousels(slug) {
  const carousels = CARD_SLIDE_CAROUSEL[slug];
  if (!carousels) return;
  Object.entries(carousels).forEach(([cardKey, items]) => {
    const container = document.querySelector(`[data-card-slide-carousel="${cardKey}"]`);
    if (!container || !items.length) return;

    const frame = document.createElement('div');
    frame.className = 'card-slide-carousel-frame';

    const track = document.createElement('div');
    track.className = 'card-slide-carousel-track';

    items.forEach(({ url, title, objectPosition }) => {
      const slide = document.createElement('div');
      slide.className = 'card-slide-carousel-slide';
      const img = document.createElement('img');
      img.src = url;
      img.alt = title || '';
      img.draggable = false;
      // objectPosition (voir CARD_SLIDE_CAROUSEL) : surcharge le "center
      // bottom" par défaut (voir style.css) au cas par cas, si le sujet de
      // la photo n'est pas près du bas.
      if (objectPosition) img.style.objectPosition = objectPosition;
      slide.appendChild(img);
      track.appendChild(slide);
    });
    frame.appendChild(track);

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'card-slide-carousel-nav is-prev';
    prevBtn.setAttribute('aria-label', 'Previous image');
    prevBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19l-7-7 7-7"/></svg>';

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'card-slide-carousel-nav is-next';
    nextBtn.setAttribute('aria-label', 'Next image');
    nextBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';

    const dotsRow = document.createElement('div');
    dotsRow.className = 'card-slide-carousel-dots';
    const dots = items.map((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'card-slide-carousel-dot';
      dot.setAttribute('aria-label', `Go to image ${i + 1}`);
      dot.addEventListener('click', () => goTo(i));
      dotsRow.appendChild(dot);
      return dot;
    });

    // Légende sous le carrousel, une par image (voir CARD_SLIDE_CAROUSEL) -
    // même "title" que l'alt de l'image, affiché cette fois plutôt que
    // seulement lu par les lecteurs d'écran.
    const caption = document.createElement('p');
    caption.className = 'card-slide-carousel-caption';

    const crossfadePair = (CARD_SLIDE_CAROUSEL_CROSSFADE[slug] || {})[cardKey];

    let index = 0;
    function updateChrome() {
      prevBtn.disabled = index === 0;
      nextBtn.disabled = index === items.length - 1;
      dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
      caption.textContent = items[index].title || '';
    }
    function render() {
      track.style.transform = `translateX(-${index * 100}%)`;
      updateChrome();
    }
    // Fondu enchaîné (voir CARD_SLIDE_CAROUSEL_CROSSFADE) : la piste "saute"
    // instantanément (transition: none) à la position cible pendant qu'un
    // CLONE de l'image sortante, posé par-dessus en position absolute,
    // s'efface en fondu - l'image entrante (déjà en place sous le clone,
    // via le saut instantané) apparaît donc progressivement dessous, sans
    // le moindre glissement visible.
    function crossfadeTo(newIndex) {
      const outgoingImg = track.children[index] && track.children[index].querySelector('img');
      if (outgoingImg) {
        const overlay = outgoingImg.cloneNode(true);
        overlay.style.position = 'absolute';
        overlay.style.inset = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.zIndex = '1';
        overlay.style.opacity = '1';
        overlay.style.transition = 'opacity 0.6s ease-in-out';
        frame.appendChild(overlay);
        requestAnimationFrame(() => { overlay.style.opacity = '0'; });
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
      }
      track.style.transition = 'none';
      index = newIndex;
      track.style.transform = `translateX(-${index * 100}%)`;
      void track.offsetHeight; // force reflow avant de réactiver la transition
      track.style.transition = '';
      updateChrome();
    }
    function goTo(i) {
      const target = Math.min(Math.max(i, 0), items.length - 1);
      if (target === index) return;
      const isCrossfade = crossfadePair
        && Math.abs(target - index) === 1
        && crossfadePair.includes(index)
        && crossfadePair.includes(target);
      if (isCrossfade) {
        crossfadeTo(target);
      } else {
        index = target;
        render();
      }
    }

    prevBtn.addEventListener('click', () => goTo(index - 1));
    nextBtn.addEventListener('click', () => goTo(index + 1));
    render();

    // Swipe horizontal (mobile uniquement) : glisser vers la gauche avance
    // à l'image suivante, vers la droite recule - même destination que les
    // flèches/points (goTo), juste un geste de drag en plus. pointerdown/
    // move/up (pas touchstart) : suit le doigt en direct pendant le drag
    // (transform posé à la main, transition coupée), puis retombe sur goTo
    // (ou un simple snap-back si le geste est trop court) au relâchement.
    // dragMoved (voir plus bas, clic sur l'image) : réutilise ce même état,
    // pas un second jeu d'écouteurs séparé.
    // Pas de lightbox plein écran sur mobile (demande explicite, pour tous
    // les carrousels slide) : le swipe (voir plus bas) fait déjà naviguer,
    // l'agrandir davantage au clic n'a plus grand intérêt.
    const noLightbox = IS_MOBILE;
    let dragMoved = false;
    if (IS_MOBILE) {
      let dragging = false;
      let dragStartX = 0;
      let dragDeltaX = 0;
      const SWIPE_THRESHOLD = 40; // px

      frame.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.card-slide-carousel-nav')) return; // flèches gèrent leur propre clic
        dragging = true;
        dragMoved = false;
        dragStartX = e.clientX;
        dragDeltaX = 0;
        track.style.transition = 'none';
        frame.setPointerCapture(e.pointerId);
      });
      frame.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        dragDeltaX = e.clientX - dragStartX;
        if (Math.abs(dragDeltaX) > 5) dragMoved = true;
        // Paire en fondu enchaîné (voir CARD_SLIDE_CAROUSEL_CROSSFADE) : pas
        // de suivi du doigt en direct pendant le drag - sinon on voit la
        // piste glisser AVANT le fondu déclenché au relâchement (voir
        // endDrag -> goTo -> crossfadeTo), ce qui casse l'effet "fondu pur"
        // voulu pour cette paire précise.
        const dragTarget = dragDeltaX < 0 ? index + 1 : index - 1;
        const isCrossfadeSwipe = crossfadePair
          && Math.abs(dragTarget - index) === 1
          && crossfadePair.includes(index)
          && crossfadePair.includes(dragTarget);
        if (isCrossfadeSwipe) return;
        const percent = (dragDeltaX / frame.offsetWidth) * 100;
        track.style.transform = `translateX(calc(-${index * 100}% + ${percent}%))`;
      });
      const endDrag = () => {
        if (!dragging) return;
        dragging = false;
        track.style.transition = '';
        if (Math.abs(dragDeltaX) > SWIPE_THRESHOLD) {
          goTo(dragDeltaX < 0 ? index + 1 : index - 1);
        }
        // Remet la piste bien alignée sur `index`, que goTo ait changé de
        // page ou non (limite déjà atteinte, ou geste trop court).
        render();
      };
      frame.addEventListener('pointerup', endDrag);
      frame.addEventListener('pointercancel', endDrag);
    }

    // Clic sur l'image (track ne contient QUE les slides, pas les flèches/
    // points - eux sont ajoutés à `frame`, un cran au-dessus, voir plus
    // bas) : ouvre la même image en grand dans le lightbox partagé (voir
    // setupSlideLightbox) - navigue via CE goTo, pas une copie de l'état,
    // pour que la vignette reste synchronisée une fois le lightbox refermé.
    // Mobile : ignoré si le clic suit un vrai swipe (voir dragMoved
    // ci-dessus), sinon relâcher après un glissement rouvrait le lightbox
    // par-dessus.
    if (!noLightbox) {
      track.addEventListener('click', () => {
        if (IS_MOBILE && dragMoved) return;
        setupSlideLightbox().open({ items, getIndex: () => index, goTo, crossfadePair });
      });
    }

    frame.append(prevBtn, nextBtn, dotsRow);
    container.append(frame, caption);

    // Hauteur 16/9 calculée à partir de la largeur RÉELLE du cadre, PAS
    // aspect-ratio + max-height en CSS (essayé, ne se plafonnait pas comme
    // attendu - voir le commentaire sur .card-slide-carousel-frame dans
    // style.css) - plafonnée à 45vh, même échelle que les autres visuels
    // du panneau.
    // fillHeight (voir CARD_SLIDE_CAROUSEL_FILL_HEIGHT_VH) : pour les cartes
    // sans rien d'autre à côté, le plafond devient la hauteur CIBLE
    // directement plutôt qu'un simple plafond sur un calcul 16/9 dérivé de
    // la largeur - sinon une colonne pas assez large gardait un cadre 16/9
    // modeste, bien en dessous du plafond relevé, sans jamais vraiment
    // remplir la hauteur dispo (object-fit: cover absorbe l'écart de ratio).
    const maxHeightVh = (CARD_SLIDE_CAROUSEL_FILL_HEIGHT_VH[slug] || {})[cardKey]
      ?? (CARD_SLIDE_CAROUSEL_MAX_HEIGHT_OVERRIDE_VH[slug] || {})[cardKey]
      ?? 45;
    // Mobile : fillHeight désactivé (voir CARD_SLIDE_CAROUSEL_FILL_HEIGHT_VH
    // - pensé pour occuper tout le budget vertical RESTANT d'une colonne
    // desktop, ignore alors le ratio 16/9 par défaut). Sans colonne à
    // partager sur mobile (flux vertical simple), le cadre revient au calcul
    // largeur/frameRatio normal - demande explicite pour Pulse card-3, qui
    // utilisait ce mode (55vh fixe, pas du tout 16/9 une fois affiché).
    const fillHeight = !IS_MOBILE && !!(CARD_SLIDE_CAROUSEL_FILL_HEIGHT_VH[slug] || {})[cardKey];
    const frameRatio = (CARD_SLIDE_CAROUSEL_FRAME_RATIO[slug] || {})[cardKey] ?? 16 / 9;
    // Plafond du ratio final du CADRE (voir CARD_SLIDE_CAROUSEL_MAX_RATIO) -
    // différent de frameRatio ci-dessus : frameRatio pilote la hauteur à
    // partir de la largeur, celui-ci plafonne la largeur une fois la
    // hauteur connue, en rognant les côtés (frame plus étroit que sa
    // colonne, centré) plutôt qu'en changeant la hauteur ou la largeur de
    // la SECTION (texte au-dessus inchangé, voir Eden card-3).
    const maxRatio = (CARD_SLIDE_CAROUSEL_MAX_RATIO[slug] || {})[cardKey] ?? Infinity;
    fitRatioCappedFrame(frame, { maxHeightVh, frameRatio, fillHeight, maxRatio });
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

// Lance la vidéo du projet, puis fait place à l'image fixe une fois
// terminée (ou immédiatement si l'asset vidéo est introuvable, ou si la
// connexion est détectée comme trop lente pour charger plusieurs dizaines
// de Mo de vidéo - dans ce cas on ne déclenche même pas le téléchargement,
// l'image fixe (quelques centaines de Ko) s'affiche directement).
function setupHero(slug) {
  const baseName = toFileBaseName(slug);
  // Dossier réel sur disque en Title Case ("input/The Cube/"), pas le slug
  // brut en minuscule - marchait en local (Windows insensible à la casse),
  // 404 sur GitHub Pages (Linux, sensible à la casse).
  const folder = `../input/${baseName}/`;
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

  // Sur mobile, image dédiée cadrée pour cet usage (voir consigne) - repli
  // sur la version desktop si elle n'existe pas encore pour ce projet
  // (bucket/dossier rempli au fur et à mesure, voir Hermès Birkin Sport),
  // plutôt que de rester cassée. once: true + suppression manuelle : évite
  // une boucle si la version desktop, elle aussi, venait à manquer.
  const desktopHeroSrc = `${folder}${baseName} Hero.webp`;
  const mobileHeroSrc = `${folder}${baseName} Hero Mobile.webp`;
  let triedDesktopFallback = false;
  heroImage.addEventListener('error', () => {
    if (IS_MOBILE && !triedDesktopFallback) {
      triedDesktopFallback = true;
      heroImage.src = desktopHeroSrc;
      return;
    }
    console.error(`Image hero introuvable : "${heroImage.src}"`);
  });
  heroImage.src = IS_MOBILE ? mobileHeroSrc : desktopHeroSrc;

  if (isSlowConnection()) {
    revealHeroImage(); // pas de video.src posé du tout : aucune requête vidéo déclenchée
    return;
  }

  // navigator.connection (voir isSlowConnection) filtre déjà les cas
  // évidents en amont (aucun octet de vidéo téléchargé du tout), mais s'est
  // révélé peu fiable pour un throttling réseau desktop (ex. "Fast 4G" des
  // DevTools, où la vidéo se met quand même à saccader). Deuxième filet :
  // avant de s'engager sur la vidéo, on attend "canplaythrough" (le
  // navigateur estime pouvoir la lire jusqu'au bout SANS re-tamponner, au
  // débit actuellement mesuré) dans une fenêtre courte. Si ça n'arrive pas à
  // temps, on abandonne la vidéo et bascule sur l'image - AVANT d'avoir
  // jamais appelé play(), donc sans jamais montrer le moindre frame qui
  // couperait aussitôt après (essayé : réagir aux à-coups PENDANT la
  // lecture, moins fiable - soit ça coupait après un seul frame, soit un
  // délai de grâce laissait passer un vrai saccadement récurrent).
  const READY_TIMEOUT_MS = 3000;
  let settled = false;

  const commitToVideo = () => {
    if (settled) return;
    settled = true;
    clearTimeout(readyTimeout);
    video.addEventListener('ended', revealHeroImage);
    video.addEventListener('error', revealHeroImage);
    // Coupe la vidéo dès que la section hero n'est plus du tout visible
    // (par ex. une fois qu'on a scrollé jusqu'aux sections suivantes), et la
    // relance si on remonte avant qu'elle soit terminée - pas de raison de
    // la laisser tourner (décodage vidéo) hors champ.
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
    video.play().catch(revealHeroImage); // lecture auto refusée par le navigateur (rare avec muted+playsinline) : révèle direct l'image fixe
  };

  const abandonVideo = () => {
    if (settled) return;
    settled = true;
    video.removeAttribute('src');
    video.load(); // stoppe le téléchargement en cours, n'a plus rien à finir de charger
    revealHeroImage();
  };

  const readyTimeout = setTimeout(abandonVideo, READY_TIMEOUT_MS);
  video.addEventListener('canplaythrough', commitToVideo, { once: true });
  // Sur mobile, si "<Nom> Mobile.mp4" n'existe pas encore pour ce projet
  // (bucket rempli au fur et à mesure), cette même erreur déclenche déjà
  // abandonVideo - repli sur l'image fixe, comme n'importe quelle autre
  // erreur de chargement vidéo.
  video.addEventListener('error', abandonVideo, { once: true });
  // Vidéo hero dédiée au format vertical sur mobile (voir consigne : cadrée
  // en 9/21+ pour ne jamais manquer de matière en portrait) - même bucket,
  // juste "<Nom du projet> Mobile.mp4" au lieu de "<Nom du projet>.mp4".
  const heroFileName = IS_MOBILE ? `${baseName} Mobile.mp4` : `${baseName}.mp4`;
  video.src = `${HERO_VIDEO_BASE_URL}${heroFileName}`;
}

// Assignée par setupCardCarousel, appelée par setupCardStack (close()) -
// voir le commentaire sur resetCardCarouselHover plus bas pour le pourquoi
// (bug Safari : mouseleave pas toujours redéclenché après la fermeture du
// panneau plein écran).
let resetCardCarouselHover = () => {};

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

  const resetHover = () => {
    row.classList.remove('is-interacting');
    activeIndex = null;
    pendingTarget = null;
    locked = false;
    cards.forEach(c => c.classList.remove('is-focused'));
  };

  cards.forEach((card, i) => {
    card.addEventListener('mouseenter', () => {
      row.classList.add('is-interacting');
      stepToward(i);
    });
  });

  row.addEventListener('mouseleave', resetHover);

  // Exposée pour setupCardStack (voir close()) : Safari ne redéclenche pas
  // toujours mouseleave après les manipulations DOM de l'ouverture/
  // fermeture du panneau plein écran (image reparentée, transform/
  // will-change changés pendant que le curseur reste immobile) - la carte
  // qui vient de se refermer restait "survolée" indéfiniment jusqu'à
  // survoler une AUTRE carte (Chrome n'a pas ce problème). Réinitialisé
  // explicitement à la fermeture plutôt que de dépendre du navigateur.
  resetCardCarouselHover = resetHover;
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
// heightFraction (voir PANEL_IMAGE_HEIGHT_FRACTION) : 0.7 par défaut,
// réduit au cas par cas.
function computePanelImageTargetRect(aspectRatio = 1, maxWidth = Infinity, heightFraction = 0.7) {
  const vh = window.innerHeight;
  // Dimensionnée à partir du budget de HAUTEUR (0.7vh) par défaut - vh et
  // pas vw, même raison que partout ailleurs (taille relative cohérente
  // quel que soit le ratio d'écran, voir .card-row .card) - sauf si
  // maxWidth (l'espace laissé par le bloc texte/vidéo) est plus restrictif,
  // auquel cas la largeur cède la priorité et la hauteur est recalculée en
  // conséquence pour garder l'aspectRatio intact.
  const maxHeight = vh * heightFraction;
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
  const gallery = panelBody.querySelector('.card-gallery');
  const secondaryImage = panelBody.querySelector('.card-panel-secondary-image');
  const imageRow = panelBody.querySelector('.card-panel-image-row');
  const specTable = panelBody.querySelector('.card-panel-spec-table');
  const imageColumn = panelBody.querySelector('.card-panel-image-column');
  const wideImage = panelBody.querySelector('.card-panel-wide-image');
  const slideCarousel = panelBody.querySelector('.card-panel-slide-carousel');
  return !!(
    (text && text.textContent.trim()) ||
    (video && video.children.length > 0) ||
    (gallery && gallery.children.length > 0) ||
    (secondaryImage && secondaryImage.children.length > 0) ||
    (imageRow && imageRow.children.length > 0) ||
    (specTable && specTable.children.length > 0) ||
    (imageColumn && imageColumn.children.length > 0) ||
    (wideImage && wideImage.children.length > 0) ||
    (slideCarousel && slideCarousel.children.length > 0)
  );
}

// .card-panel-body-main est TOUJOURS présent dans le HTML (voir
// index.html), même quand aucun texte n'est encore renseigné pour cette
// carte (cas de Firefly card-2 : tableau technique sans texte pour
// l'instant) - il resterait quand même une colonne de grid vide dans
// .card-panel-body-row (voir style.css), le tableau/la colonne d'images à
// côté ne prenant alors que la moitié de la section au lieu de tout
// l'espace. Contrairement à panelBodyHasContent (tout .card-panel-body,
// y compris .card-panel-spec-table/-image-column qui sont maintenant des
// SIBLINGS de body-main, pas dedans), ne regarde que ce qui est
// RÉELLEMENT dans body-main.
function bodyMainHasContent(main) {
  if (!main) return false;
  const text = main.querySelector('.card-panel-text');
  const video = main.querySelector('.card-panel-video');
  const gallery = main.querySelector('.card-gallery');
  const secondaryImage = main.querySelector('.card-panel-secondary-image');
  const imageRow = main.querySelector('.card-panel-image-row');
  const slideCarousel = main.querySelector('.card-panel-slide-carousel');
  return !!(
    (text && text.textContent.trim()) ||
    (video && video.children.length > 0) ||
    (gallery && gallery.children.length > 0) ||
    (secondaryImage && secondaryImage.children.length > 0) ||
    (imageRow && imageRow.children.length > 0) ||
    (slideCarousel && slideCarousel.children.length > 0)
  );
}

function getImageMaxWidth(panelBody) {
  if (!panelBodyHasContent(panelBody)) return Infinity;
  const gap = 48; // 3rem
  const leftMargin = 64; // 4rem
  return panelBody.getBoundingClientRect().left - leftMargin - gap;
}

// Cartes avec galerie et/ou tableau technique (voir index.html) mais sans
// vidéo : d'habitude .card-panel-body a une largeur FIXE posée en CSS
// (formule pensée pour un ratio vidéo 16/9) et l'image s'adapte ensuite à
// ce qui reste (voir getImageMaxWidth ci-dessus) - une largeur "raisonnable"
// en CSS pur n'existe pas pour ce genre de contenu large : trop étroite sur
// un écran large (21/9), elle écrase l'image à presque rien sur un écran
// plus classique (essayé, cassé les deux fois). Ici c'est l'inverse qu'il
// faut : l'image garde sa taille NATURELLE (0.7vh * aspectRatio,
// indépendante de la largeur du panneau - même formule que
// computePanelImageTargetRect avec maxWidth: Infinity), et .card-panel-body
// prend tout le reste de la largeur disponible autour d'elle. Sous 901px
// (voir @media dans style.css, repli en flux normal), on laisse le CSS
// reprendre la main (width: '').
// Cartes listées ici : .card-panel-body prend un 50/50 fixe avec l'image
// (fraction * 100vw - marge droite) plutôt que la largeur "naturelle" de
// l'image (formule normale d'applyWideBodyWidth) - utile quand cette
// dernière donne une colonne de largeur imprévisible d'un écran à l'autre
// (voir Eden card-1 : le carrousel "slide" a besoin d'une largeur stable
// pour calculer sa hauteur 16/9 en JS, voir setupCardSlideCarousels), ou
// pour laisser sciemment plus de place à l'image (voir Birkin card-1,
// fraction < 0.5). Valeur = fraction de la largeur de la fenêtre.
const CARD_BODY_WIDTH_FRACTION = {
  eden: { 'card-1': 0.5 },
  'hermès birkin sport': { 'card-1': 0.35 },
  // Firefly card-2 : tableau technique, largeur fixe pour lui laisser assez
  // de place. card-1 : voir CARD_GALLERY_MAX_CARD_VH à la place (même
  // traitement que Break Shot card-1). card-3 : voir PANEL_IMAGE_HEIGHT_FRACTION
  // à la place - l'image de carte elle-même est réduite, pas la largeur de
  // .card-panel-body (une fraction fixe ici créait un vide entre l'image et
  // le texte dès que le "reste naturel" était DÉJÀ plus large qu'elle).
  firefly: { 'card-2': 0.6 },
  // card-4 : vidéo (16/9) + texte au-dessus dans la même colonne - une
  // fraction trop généreuse donne une vidéo (largeur * 9/16) plus haute
  // que ce qu'il reste une fois le texte retiré du budget de 82vh,
  // déclenchant le scroll interne. 0.4 reste raisonnable même sur un
  // écran large.
  pulse: { 'card-2': 0.6, 'card-4': 0.4 },
  // The Cube card-3 : texte seul (pas de gallery/spec-table/etc.), même
  // piège que Pulse card-4 - largeur par défaut trop généreuse, écrasant
  // l'image de carte.
  'the cube': { 'card-3': 0.55 },
  // Insight card-2 : tableau technique (voir CARD_SPEC_TABLE_STACKED)
  // déclenche déjà needsWideBody, mais retombait sur la formule "image à sa
  // taille naturelle" (aspectRatio 16/9, voir PANEL_IMAGE_OVERRIDES) -
  // beaucoup trop grande. Fraction pour donner la priorité à la colonne de
  // droite à la place.
  insight: { 'card-2': 0.3, 'card-3': 0.3 },
};

// Cartes texte-seul (pas de vidéo/galerie/tableau) où l'image de carte doit
// quand même piloter la mise en page façon "wide body" : forcent
// needsWideBody SANS poser de widthFraction, pour tomber dans la branche
// par défaut d'applyWideBodyWidth (image à sa taille NATURELLE, le texte se
// contente du reste) plutôt que la largeur par défaut de .card-panel-body
// (pensée pour une vidéo 16/9, ~1300px - écrasait l'image de carte de Eden
// card-2 à presque rien, ET donnait un texte flottant loin de l'image une
// fois la vraie taille de l'image restaurée). Voir CARD_BODY_WIDTH_FRACTION
// juste au-dessus pour le cas où une fraction FIXE est voulue à la place.
const CARD_BODY_NATURAL_WIDE = {
  eden: ['card-2'],
  'the cube': ['card-1', 'card-2'],
  osmose: ['card-1'],
  monolith: ['card-1', 'card-2'],
};

// Fraction de vh (0.7 par défaut, voir computePanelImageTargetRect) utilisée
// pour la hauteur/largeur cible de l'image du panneau plein écran - réduite
// au cas par cas quand cette image (taille FIXE en vh, indépendante de la
// largeur de fenêtre) laisse trop peu de place à ce qu'il y a à côté (Firefly
// card-3 : texte + lecteur audio, écrasés à presque rien dès que la fenêtre
// est plus étroite que haute - 16/10, plein écran qui augmente vh sans
// changer la largeur...). DOIT être utilisée à la fois ici (taille réelle de
// l'image) ET dans applyWideBodyWidth (naturalImageWidth, qui positionne
// .card-panel-body en conséquence) - sinon les deux calculs divergent et
// laissent un vide entre l'image et le texte (même piège que la centrage
// avant le fix d'Eden card-1). card-1 : même besoin, mais pour laisser plus
// de place à la galerie coverflow (voir CARDS_ACROSS dans
// setupCoverflowGallery, dont la taille de carte suit la largeur de
// .card-panel-body) plutôt qu'au texte/lecteur - même raison pour Break Shot
// card-1 et Monolith card-3 ci-dessous (galeries elles aussi).
const PANEL_IMAGE_HEIGHT_FRACTION = {
  firefly: { 'card-1': 0.35, 'card-3': 0.5 },
  'break shot': { 'card-1': 0.5 },
  monolith: { 'card-3': 0.5 },
};

// Règle UNIQUE, appliquée quelle que soit la façon dont `width` est
// calculée ci-dessous (fraction fixe, hauteur cible, ou formule par
// défaut) : .card-panel-body est TOUJOURS ancré juste après le bord droit
// de l'image (+ gap), jamais sur le bord de la fenêtre (right: 4rem,
// l'ancrage CSS par défaut). Avant, seule la branche par défaut faisait
// ça - les autres retombaient sur right: 4rem, ce qui créait un vide
// grandissant entre l'image et le texte/carrousel dès que `width` ne
// remplissait plus tout l'espace jusqu'au bord (voir Break Shot, Monolith,
// Eden card-3, Firefly card-3 : plusieurs bugs différents, une seule
// vraie cause). Un seul calcul de position, réutilisé par toutes les
// branches, plutôt qu'un ancrage à réinventer à chaque nouveau cas.
function applyWideBodyWidth(panelBody, needsWideBody, aspectRatio, widthFraction, heightDrivenVh, imageHeightFraction = 0.7) {
  if (!panelBody) return;
  if (!needsWideBody || window.innerWidth <= 900) {
    panelBody.style.width = '';
    panelBody.style.left = '';
    return;
  }
  const rightMargin = 64; // 4rem, voir right: 4rem sur .card-panel-body
  const leftMargin = 64; // 4rem, voir computePanelImageTargetRect
  const gap = 48; // 3rem, même espacement que getImageMaxWidth
  const vh = window.innerHeight;
  // imageHeightFraction (voir PANEL_IMAGE_HEIGHT_FRACTION) : DOIT rester
  // cohérent avec la taille RÉELLE de l'image (computePanelImageTargetRect,
  // même fraction) - sinon .card-panel-body se positionne pour une image
  // plus grande que celle réellement affichée, laissant un vide entre les
  // deux.
  const naturalImageWidth = vh * imageHeightFraction * aspectRatio;

  let width;
  if (heightDrivenVh) {
    // La largeur suit la hauteur, pas l'inverse - pour un carrousel qui
    // doit remplir toute la hauteur dispo EN GARDANT son 16/9 (voir Osmose
    // card-2), il faut que .card-panel-body fasse EXACTEMENT la largeur
    // 16/9 correspondante, sinon getImageMaxWidth (mesuré sur le rect réel
    // de ce conteneur) ne laisserait pas la bonne place à l'image à côté.
    const heightBudget = vh * (heightDrivenVh / 100);
    width = heightBudget * 16 / 9;
  } else if (widthFraction) {
    width = window.innerWidth * widthFraction - rightMargin;
  } else {
    const minWidth = 320;
    // Pas de plafond ici (essayé, voir historique : ça laissait un vide
    // à droite sur écran ultra-large une fois .card-panel-body ancré sur
    // l'image plutôt que sur le bord de la fenêtre - le plafond empêchait
    // alors le panneau d'utiliser l'espace dispo). Le vrai risque de
    // débordement vertical (galerie coverflow, voir CARDS_ACROSS dans
    // setupCoverflowGallery) est maintenant plafonné à SA source (taille
    // de carte), pas ici.
    width = Math.max(minWidth, window.innerWidth - leftMargin - naturalImageWidth - gap - rightMargin);
  }

  panelBody.style.width = `${width}px`;
  // Centré dans l'espace dispo (entre l'image et le bord de la fenêtre),
  // pas collé à l'image : quand `width` laisse de la marge (heightDrivenVh
  // ou widthFraction sur un écran large, voir Pulse card-4), coller à
  // gauche groupait tout le contenu avec un grand vide inutilisé à droite.
  // Inoffensif pour la branche par défaut (sa largeur EST déjà tout
  // l'espace dispo, rien à centrer).
  // Largeur RÉELLE de l'image (pas sa taille "naturelle" non contrainte) :
  // avec une image large (16/9, voir Eden card-1) et une colonne étroite
  // (widthFraction bas), la taille naturelle dépasse largement ce que
  // l'image peut vraiment occuper (voir getImageMaxWidth) - centrer sur
  // cette base irréaliste poussait .card-panel-body hors de l'écran (texte
  // coupé à droite). On calcule donc d'abord ce maxWidth réel (dans le cas
  // où .card-panel-body resterait ancré à droite), PUIS la largeur
  // réellement rendue (min des deux), avant de chercher à centrer quoi que
  // ce soit.
  const bodyLeftIfRightAnchored = window.innerWidth - rightMargin - width;
  const imageMaxWidthIfRightAnchored = Math.max(0, bodyLeftIfRightAnchored - leftMargin - gap);
  const actualImageWidth = Math.min(naturalImageWidth, imageMaxWidthIfRightAnchored);
  const zoneStart = leftMargin + actualImageWidth + gap;
  const zoneEnd = window.innerWidth - rightMargin;
  panelBody.style.left = `${zoneStart + Math.max(0, (zoneEnd - zoneStart - width) / 2)}px`;
}

// .card-panel-image-column (voir style.css) doit faire la même hauteur que
// le texte à côté, PAS l'inverse : en CSS pur (align-items: stretch sur
// .card-panel-body-row), les vraies photos - avec leur propre hauteur
// intrinsèque, souvent bien plus grande que quelques lignes de texte à la
// largeur de leur colonne - finissaient par dicter la hauteur de la ligne
// entière au lieu de s'y adapter (height: 100% ne s'est pas résolu de
// façon fiable contre une hauteur seulement "étirée", pas explicite).
// Mesurée en JS plutôt que devinée en CSS : hauteur RÉELLE du texte,
// posée explicitement sur la colonne d'images pour qu'elles se recadrent
// (object-fit: cover) sur cette hauteur au lieu de l'imposer.
// IMPORTANT : mesurée sur .card-panel-text lui-même, pas sur
// .card-panel-body-main - ce dernier est LUI AUSSI étiré par
// .card-panel-body-row (même align-items: stretch), donc sa propre boîte
// fait déjà la hauteur de la colonne d'images (grande) - le lire aurait
// juste renvoyé cette même grande valeur (circulaire). Le texte, à
// l'intérieur, garde sa hauteur de contenu réelle malgré la boîte étirée
// autour de lui.
// Certaines cartes (voir l'override 16/9 de The Cube card-1 dans style.css)
// peuvent, une fois texte + image empilés dans .card-panel-body-main,
// dépasser la hauteur disponible de .card-panel-body (max-height: 82vh,
// overflow-y: auto) et faire apparaître son scroll interne. Plutôt que de
// rogner l'image (change son cadrage) ou laisser scroller, on réduit la
// taille du texte - l'élément le plus "élastique" du bloc - par paliers
// jusqu'à ce que tout rentre. scrollHeight > clientHeight (avec la marge de
// garde) est le signal que max-height a effectivement plafonné le contenu,
// pas besoin de recalculer 82vh à la main.
function fitPanelBodyHeight(panelBody) {
  if (!panelBody) return;
  const text = panelBody.querySelector('.card-panel-text');
  if (!text) return;
  text.style.fontSize = ''; // repart de la taille de base avant de mesurer
  let guard = 0;
  while (panelBody.scrollHeight - panelBody.clientHeight > 1 && guard < 30) {
    const fontSize = parseFloat(getComputedStyle(text).fontSize);
    if (fontSize <= 10) break;
    text.style.fontSize = `${fontSize - 1}px`;
    guard++;
  }
}

function syncImageColumnHeight(panelBody) {
  if (!panelBody) return;
  const text = panelBody.querySelector('.card-panel-text');
  const imageColumn = panelBody.querySelector('.card-panel-image-column');
  if (!text || !imageColumn) return;
  if (imageColumn.children.length === 0) {
    imageColumn.style.height = '';
    return;
  }
  imageColumn.style.height = `${text.getBoundingClientRect().height}px`;
}

// Cas particuliers où l'image du panneau plein écran ne doit pas suivre le
// traitement par défaut (carré, image entière) - clé = slug, puis data-card
// (card-1..4, voir index.html). aspectRatio : voir
// computePanelImageTargetRect. cropScale : zoom appliqué à l'image (scale()
// uniforme, donc pas de déformation - voir le commentaire plus bas sur
// pourquoi PAS de scale non-uniforme) pour cadrer plus serré que ce
// qu'object-fit: cover ferait seul.
const PANEL_IMAGE_OVERRIDES = {
  eden: {
    'card-1': { aspectRatio: 16 / 9, cropScale: 1.45 }, // ~15% de recadrage
  },
  monolith: {
    'card-1': { aspectRatio: 16 / 9, cropScale: 1 }, // pas de recadrage, juste le format 16/9
    'card-2': { aspectRatio: 16 / 9, cropScale: 1.24 }, // ~8% de recadrage
    'card-3': { aspectRatio: 9 / 16, cropScale: 1 }, // format portrait, pas de recadrage
  },
  insight: {
    'card-2': { aspectRatio: 16 / 9, cropScale: 1 }, // pas de recadrage, juste le format 16/9
    'card-3': { aspectRatio: 16 / 9, cropScale: 1 }, // pas de recadrage, juste le format 16/9
  },
  pulse: {
    'card-1': { aspectRatio: 9 / 16, cropScale: 1 }, // format portrait, pas de recadrage
    'card-3': { aspectRatio: 16 / 9, cropScale: 1.6 }, // ~20% de recadrage
    'card-4': { aspectRatio: 4 / 3, cropScale: 1 },
  },
  'hermès birkin sport': {
    'card-1': { aspectRatio: 16 / 9, cropScale: 1 }, // pas de recadrage, juste le format 16/9
  },
  'the cube': {
    'card-1': { aspectRatio: 9 / 16, cropScale: 1 }, // format portrait, pas de recadrage
    'card-4': { aspectRatio: 16 / 9, cropScale: 1 }, // pas de recadrage, juste le format 16/9
  },
  osmose: {
    'card-1': { aspectRatio: 1, cropScale: 1 }, // carré, pas de recadrage
    'card-2': { aspectRatio: 1, cropScale: 1.15 }, // carré, ~5% de recadrage
  },
  'break shot': {
    'card-1': { aspectRatio: 1, cropScale: 1 }, // carré, pas de recadrage
  },
};

// Mobile UNIQUEMENT (voir openMobile) : ratio dédié différent de
// PANEL_IMAGE_OVERRIDES ci-dessus (desktop) pour une carte donnée - clé =
// slug -> data-card -> aspectRatio (largeur/hauteur). PANEL_IMAGE_OVERRIDES
// reste inchangé pour le desktop, cropScale n'est pas utilisé ici (pas de
// recadrage FLIP sur mobile, voir openMobile - juste object-fit: cover).
const MOBILE_PANEL_IMAGE_ASPECT_RATIO = {
  eden: { 'card-1': 4 / 3 },
};

// Mobile UNIQUEMENT (voir openMobile) : décalage du cadrage (object-position)
// différent de PANEL_IMAGE_OBJECT_POSITION ci-dessous (partagé avec le
// desktop) pour une carte donnée - clé = slug -> data-card -> valeur CSS.
const MOBILE_PANEL_IMAGE_OBJECT_POSITION = {};

const IMAGE_TRANSITION =
  'top 0.6s cubic-bezier(0.65, 0, 0.35, 1), left 0.6s cubic-bezier(0.65, 0, 0.35, 1), ' +
  'width 0.6s cubic-bezier(0.65, 0, 0.35, 1), height 0.6s cubic-bezier(0.65, 0, 0.35, 1), ' +
  'transform 0.6s cubic-bezier(0.65, 0, 0.35, 1), border-radius 0.6s cubic-bezier(0.65, 0, 0.35, 1)';

// Arrondi de l'image une fois le panneau plein écran ouvert (plus prononcé
// que le rounded-lg/0.5rem habituel de la carte).
const PANEL_IMAGE_RADIUS = '1.5rem';
const CARD_IMAGE_RADIUS = '0.5rem'; // arrondi "au repos", dans la carte

// Décalage du recadrage (object-position) d'une image de carte une fois en
// plein écran, pour les cartes SANS PANEL_IMAGE_OVERRIDES (conteneur carré
// inchangé) : par défaut object-fit: cover centre l'image (50% 50%), ici on
// décale ce centre pour montrer davantage un côté au détriment de l'autre
// (ex. "100% 50%" = ancre à droite -> recadre à gauche, le contenu visible
// semble glisser vers la gauche). Vide pour l'instant : aucun projet n'en a
// besoin actuellement, mais l'infrastructure reste prête (voir setupCardStack).
const PANEL_IMAGE_OBJECT_POSITION = {};

function setImageRect(img, rect) {
  img.style.top = `${rect.top}px`;
  img.style.left = `${rect.left}px`;
  img.style.width = `${rect.width}px`;
  img.style.height = `${rect.height}px`;
}

// Anime l'image de carte (ou son conteneur-fenêtre, voir imageOverride) vers
// `rect`/`radius` - factorise ce qui était dupliqué à l'identique entre
// l'ouverture (grandit vers le panneau) et la fermeture (rétrécit vers la
// carte) de setupCardStack, seuls le rect/radius/cropPercent cibles changent.
function growImageInto(cardImg, panelImgContainer, imageOverride, rect, radius, cropPercent) {
  cardImg.style.transition = IMAGE_TRANSITION;
  if (imageOverride) {
    panelImgContainer.style.transition = IMAGE_TRANSITION;
    setImageRect(panelImgContainer, rect);
    panelImgContainer.style.borderRadius = radius;
    cardImg.style.width = `${cropPercent}%`;
    cardImg.style.height = `${cropPercent}%`;
  } else {
    setImageRect(cardImg, rect);
    cardImg.style.borderRadius = radius;
  }
}

// Pile de cartes (voir index.html, section data-section="block-2") : au
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

  // Bouton Close unique, page-level (voir #mobile-panel-close dans
  // index.html) : un seul écouteur, ferme quelle que soit la carte
  // actuellement ouverte (activeMobileClose, réassignée à chaque open()
  // mobile) - au plus une carte ouverte à la fois, rien à empiler.
  const mobilePanelClose = document.getElementById('mobile-panel-close');
  let activeMobileClose = null;
  if (mobilePanelClose) {
    mobilePanelClose.addEventListener('click', () => {
      if (activeMobileClose) activeMobileClose();
    });
  }

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
    // Mobile uniquement (voir openMobile/closeMobile) : le titre est déplacé
    // DANS panelImgContainer le temps du panneau ouvert, pour rester ancré
    // sur l'image (voir .is-mobile .card-panel-title dans style.css) plutôt
    // que de sauter à un autre endroit du panneau - remis ici à sa place
    // d'origine à la fermeture.
    const panelTitleHome = panelTitle ? panelTitle.parentElement : null;
    const panelBody = panel.querySelector('.card-panel-body');
    const panelGallery = panel.querySelector('.card-gallery');
    const panelSpecTable = panel.querySelector('.card-panel-spec-table');
    const panelImageColumn = panel.querySelector('.card-panel-image-column');
    const panelImageRow = panel.querySelector('.card-panel-image-row');
    const panelAudioPlayer = panel.querySelector('.card-panel-audio-player');
    const panelSlideCarousel = panel.querySelector('.card-panel-slide-carousel');
    // Galerie, tableau technique (CARD_SPEC_TABLE), colonne d'images
    // (CARD_IMAGE_COLUMN), paire côte à côte (CARD_IMAGE_ROW), lecteur
    // audio (CARD_AUDIO_PLAYER) ET carrousel slide (CARD_SLIDE_CAROUSEL) ont
    // tous besoin d'une colonne large (voir applyWideBodyWidth) pour
    // vraiment utiliser la largeur disponible sur un écran large (21/9...) -
    // sans ça, .card-panel-body restait à sa largeur par défaut (pensée pour
    // une vidéo 16/9, voire réduite à presque rien sans texte à côté, voir
    // Osmose card-2) et le carrousel se retrouvait minuscule au lieu de
    // prendre toute la section. La vidéo/le texte seuls, eux, n'en ont pas
    // besoin.
    // Voir CARD_BODY_WIDTH_FRACTION plus bas : force aussi needsWideBody
    // (sinon applyWideBodyWidth retombe sur la largeur par défaut, pas la
    // fraction demandée).
    const widthFraction = (CARD_BODY_WIDTH_FRACTION[slug] || {})[card.dataset.card];
    // Voir PANEL_IMAGE_HEIGHT_FRACTION : lue ici pour rester cohérente entre
    // la taille RÉELLE de l'image (computePanelImageTargetRect) et la
    // position de .card-panel-body (applyWideBodyWidth), qui en ont chacun
    // besoin séparément plus bas.
    const imageHeightFraction = (PANEL_IMAGE_HEIGHT_FRACTION[slug] || {})[card.dataset.card] ?? 0.7;
    // Voir CARD_SLIDE_CAROUSEL_FILL_HEIGHT_VH (même config que
    // setupCardSlideCarousels, une seule source de vérité pour garder le
    // carrousel ET la largeur de .card-panel-body synchronisés) : force
    // aussi needsWideBody, comme widthFraction ci-dessus.
    const heightDrivenVh = (CARD_SLIDE_CAROUSEL_FILL_HEIGHT_VH[slug] || {})[card.dataset.card];
    const needsWideBody = !!(
      (panelGallery && panelGallery.children.length > 0) ||
      (panelSpecTable && panelSpecTable.children.length > 0) ||
      (panelImageColumn && panelImageColumn.children.length > 0) ||
      (panelImageRow && panelImageRow.children.length > 0) ||
      (panelAudioPlayer && panelAudioPlayer.children.length > 0) ||
      (panelSlideCarousel && panelSlideCarousel.children.length > 0) ||
      widthFraction ||
      (CARD_BODY_NATURAL_WIDE[slug] || []).includes(card.dataset.card)
    );
    // Voir bodyMainHasContent : sans texte/image renseignés dans cette
    // colonne (ex. Firefly card-2, tableau technique sans texte pour
    // l'instant), la retirer complètement du flux plutôt que de laisser une
    // colonne de grid vide à côté du tableau/de la colonne d'images, qui ne
    // prendrait alors que la moitié de la section.
    const panelBodyMain = panel.querySelector('.card-panel-body-main');
    if (panelBodyMain) {
      panelBodyMain.style.display = bodyMainHasContent(panelBodyMain) ? '' : 'none';
    }
    // Mobile : cartes SANS aucun autre média (galerie, tableau, vidéo,
    // colonne/paire d'images, lecteur audio, image large) - voir
    // .is-mobile .card-panel-body.text-only dans style.css, qui centre/
    // distribue le texte dans l'espace sous l'image au lieu de le laisser
    // collé en haut. Posé en JS (classe), pas en CSS :has() (essayé,
    // voir historique - n'a pas fonctionné, potentiellement un souci de
    // support/priorité) : plus fiable, une seule vraie source de vérité
    // (contenu RÉEL du DOM, pas un survol de sélecteur CSS).
    if (IS_MOBILE && panelBody) {
      const hasOtherMedia = !!(
        (panelGallery && panelGallery.children.length > 0) ||
        (panelSpecTable && panelSpecTable.children.length > 0) ||
        (panelImageColumn && panelImageColumn.children.length > 0) ||
        (panelImageRow && panelImageRow.children.length > 0) ||
        (panelAudioPlayer && panelAudioPlayer.children.length > 0) ||
        (panelSlideCarousel && panelSlideCarousel.children.length > 0) ||
        (panel.querySelector('.card-panel-video')?.children.length > 0) ||
        (panel.querySelector('.card-panel-secondary-image')?.children.length > 0) ||
        (panel.querySelector('.card-panel-wide-image')?.children.length > 0)
      );
      panelBody.classList.toggle('text-only', !hasOtherMedia);
    }
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

    // Mobile : MÊME technique FLIP que desktop pour le panneau lui-même
    // (grandit depuis le rect réel de la carte jusqu'au plein écran, via
    // placePanelOnCard + transition CSS déjà posée sur .card-panel de base)
    // - seule l'intérieur (image/texte) reste en flux simple une fois plein
    // écran (voir .is-mobile .card-panel* dans style.css), pas de FLIP
    // séparé pixel-perfect sur l'image elle-même comme sur desktop (pas
    // nécessaire : elle est déjà collée aux bords du panneau dès le départ,
    // donc grandit AVEC lui sans calcul à part).
    const openMobile = () => {
      placePanelOnCard();
      panel.hidden = false;
      savedScrollY = window.scrollY;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      // Back caché, Close (page-level, voir mobilePanelClose plus bas)
      // affiché à sa place exacte (même coin haut-gauche) - un bouton Close
      // NICHÉ dans le panneau (voir data-card-close, desktop) reste
      // plafonné visuellement par son parent sur certains moteurs de rendu
      // mobiles (position: fixed imbriqué), quel que soit son propre
      // z-index - passait sous le bandeau (.mobile-topbar-scrim) malgré
      // tout. Un bouton page-level, comme Back/CV (qui eux marchent), n'a
      // pas ce problème.
      const backLink = document.getElementById('mobile-back-link');
      if (backLink) backLink.style.display = 'none';
      if (mobilePanelClose) mobilePanelClose.style.display = 'flex';
      if (cardImg && panelImgContainer) {
        panelImgContainer.appendChild(cardImg);
        // imageOverride.aspectRatio PAS posé ici : la carte est carrée
        // (1/1, voir .is-mobile .card-row .card dans style.css) - le poser
        // tout de suite ferait sauter le conteneur à son ratio final avant
        // même que l'agrandissement ne commence. Posé plus bas, dans le
        // double rAF, EN MÊME TEMPS que le passage au plein écran - avec la
        // transition sur aspect-ratio (voir .is-mobile .image-container-
        // target dans style.css), le changement de forme s'anime alors avec
        // le reste au lieu de sauter.
        // Ratio mobile dédié (voir MOBILE_PANEL_IMAGE_OBJECT_POSITION) en
        // priorité sur celui partagé avec le desktop (objectPosition, voir
        // PANEL_IMAGE_OBJECT_POSITION) s'il existe pour cette carte.
        const mobileObjectPosition = (MOBILE_PANEL_IMAGE_OBJECT_POSITION[slug] || {})[card.dataset.card];
        const panelObjectPosition = mobileObjectPosition ?? objectPosition;
        if (panelObjectPosition) cardImg.style.objectPosition = panelObjectPosition;
      }
      if (panelTitle) {
        // Déplacé DANS panelImgContainer (voir panelTitleHome plus haut) :
        // reste ancré en bas de l'IMAGE (voir .is-mobile .card-panel-title
        // dans style.css, position: absolute relative à ce conteneur),
        // donc "monte" avec elle pendant toute l'animation au lieu de
        // sauter à un autre endroit du panneau une fois plein écran.
        if (panelImgContainer) panelImgContainer.appendChild(panelTitle);
        panelTitle.style.opacity = '1';
        // Titre TOUJOURS blanc sur mobile (demande explicite) : pas de
        // couleur cardStyle appliquée ici, contrairement à desktop.
      }
      // Double rAF (voir plus bas, branche desktop) : garantit que le
      // navigateur a bien peint le rect de départ (celui de la carte) avant
      // de déclencher la transition vers le plein écran.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          panel.classList.add('is-open');
          panel.style.top = '0px';
          panel.style.left = '0px';
          panel.style.width = '100vw';
          panel.style.height = '100vh';
          // Ratio mobile dédié (voir MOBILE_PANEL_IMAGE_ASPECT_RATIO) en
          // priorité sur celui d'imageOverride (desktop, voir
          // PANEL_IMAGE_OVERRIDES) s'il existe pour cette carte.
          const mobileAspectRatio = (MOBILE_PANEL_IMAGE_ASPECT_RATIO[slug] || {})[card.dataset.card];
          const panelAspectRatio = mobileAspectRatio ?? imageOverride?.aspectRatio;
          if (panelAspectRatio && panelImgContainer) panelImgContainer.style.aspectRatio = String(panelAspectRatio);
          // Révélé seulement une fois le panneau vraiment plein écran (même
          // délai que desktop, voir .card-panel dans style.css - transition
          // top/left/width/height de 0.6s) : sinon le texte apparaît alors
          // que le panneau est encore petit, comprimé par son padding.
          if (panelBodyHasContent(panelBody)) {
            clearTimeout(bodyRevealTimeout);
            bodyRevealTimeout = setTimeout(() => {
              // Réactive le fondu (voir closeMobile, qui le désactive pour
              // une disparition instantanée à la fermeture) juste avant de
              // déclencher l'apparition - jamais laissé actif entre les
              // deux, pour ne jamais risquer un fondu résiduel non voulu au
              // close.
              panelBody.style.transition = '';
              panelBody.classList.add('is-visible');
            }, 600);
          }
        });
      });
    };

    const closeMobile = () => {
      clearTimeout(bodyRevealTimeout);
      // Réaffiché dès la fermeture (voir openMobile) - pas besoin d'attendre
      // la fin du rétrécissement, Close aura disparu bien avant que Back ne
      // redevienne visible à cet endroit de l'écran.
      const backLink = document.getElementById('mobile-back-link');
      if (backLink) backLink.style.display = '';
      if (mobilePanelClose) mobilePanelClose.style.display = 'none';
      activeMobileClose = null;
      // Pas de fondu de sortie du texte (contrairement à desktop, voir
      // BODY_FADE_MS plus bas) : au clic sur Close, disparaît d'un coup en
      // même temps que le rétrécissement démarre, pas de délai avant.
      if (panelBody) {
        panelBody.style.transition = 'none';
        panelBody.classList.remove('is-visible');
      }
      panel.querySelectorAll('audio').forEach(audio => audio.pause());
      // Vidéo (voir CARD_VIDEOS) : ne continue pas à jouer en arrière-plan
      // une fois la carte refermée, même raison que le lecteur audio.
      panel.querySelectorAll('video').forEach(video => video.pause());

      const startShrink = () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            panel.classList.remove('is-open');
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            window.scrollTo(0, savedScrollY);
            // Le titre reste visible tout du long (pas d'opacity manipulée
            // ici, contrairement à un essai précédent) : il vit DANS
            // panelImgContainer (voir openMobile), donc suit déjà l'image
            // pendant tout le rétrécissement sans rien à faire de plus -
            // le cacher puis le refaire réapparaître juste après causait un
            // flash visible (disparaît, l'image se replace, il réapparaît).
            if (panelTitle && !cardStyle?.cardTitleColor) panelTitle.style.color = '';
            // Revient au ratio par défaut (1/1, celui de la carte) EN MÊME
            // TEMPS que le rétrécissement démarre, pas seulement une fois
            // fini (voir transitionend plus bas) - même raison qu'à
            // l'ouverture (voir openMobile) : sinon le conteneur saute à sa
            // forme carrée d'un coup, juste avant de disparaître.
            if (imageOverride && panelImgContainer) panelImgContainer.style.aspectRatio = '';
            placePanelOnCard(); // rétrécit vers la carte d'origine plutôt que de disparaître d'un coup
          });
        });

        panel.addEventListener('transitionend', function onEnd(e) {
          if (e.target !== panel) return;
          panel.removeEventListener('transitionend', onEnd);
          panel.hidden = true;
          if (cardImg && cardImgHome) {
            cardImg.style.objectPosition = '';
            cardImgHome.appendChild(cardImg);
          }
          // Remis à sa place d'origine (voir panelTitleHome plus haut et
          // openMobile) : sinon il resterait dans panelImgContainer, qui va
          // recevoir cardImg à la prochaine ouverture.
          if (panelTitle && panelTitleHome) panelTitleHome.insertBefore(panelTitle, panelImgContainer);
        });
      };

      startShrink();
    };

    const open = () => {
      if (IS_MOBILE) {
        // Bouton Close unique au niveau de la page (voir mobilePanelClose
        // plus bas dans setupCardStack) : mémorise QUELLE carte fermer -
        // au plus une ouverte à la fois, donc rien à empiler.
        activeMobileClose = close;
        openMobile();
        return;
      }
      placePanelOnCard();
      panel.hidden = false;
      if (panelTitle) panelTitle.style.opacity = '1'; // au cas où une fermeture précédente l'a laissé à 0
      // Projets dont le titre de la PETITE carte est déjà sombre (voir
      // cardTitleColor) : pas de fondu blanc -> sombre à l'ouverture, ça
      // ferait passer par du blanc un instant alors que le titre vient
      // justement de disparaître sombre sous la carte - juste sombre dès le
      // départ, cohérent avec ce qu'on voyait déjà. Voir plus bas (rAF) pour
      // le fondu classique des autres projets (titre de carte blanc).
      if (panelTitle && cardStyle?.cardTitleColor) panelTitle.style.color = cardStyle.color;
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
          panelImgContainer.style.borderRadius = CARD_IMAGE_RADIUS;
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
          // (cardTitleColor : déjà posé sombre dès l'ouverture, voir plus haut - rien à refaire ici)
          if (panelTitle && cardStyle && !cardStyle.cardTitleColor) panelTitle.style.color = cardStyle.color;
          applyWideBodyWidth(panelBody, needsWideBody, imageOverride?.aspectRatio ?? 1, widthFraction, heightDrivenVh, imageHeightFraction);
          syncImageColumnHeight(panelBody);
          fitPanelBodyHeight(panelBody);
          if (cardImg && panelImgContainer) {
            const targetRect = computePanelImageTargetRect(imageOverride?.aspectRatio, getImageMaxWidth(panelBody), imageHeightFraction);
            growImageInto(cardImg, panelImgContainer, imageOverride, targetRect, PANEL_IMAGE_RADIUS, (imageOverride?.cropScale ?? 1) * 100);
          }
          currentOpen = { cardImg, panelImgContainer, imageOverride, panel, panelBody, needsWideBody, widthFraction, heightDrivenVh, imageHeightFraction };
          // Le texte/vidéo/galerie n'apparaissent qu'une fois le panneau
          // vraiment en plein écran (durée de sa transition
          // top/left/width/height, voir .card-panel dans style.css), jamais
          // en même temps que l'agrandissement.
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
      if (IS_MOBILE) { closeMobile(); return; }
      currentOpen = null;
      clearTimeout(bodyRevealTimeout);
      // Safari : mouseleave ne se redéclenche pas toujours après la
      // fermeture (curseur immobile pendant que l'image est reparentée,
      // les transitions tournent...), la carte restait "survolée"
      // indéfiniment - voir resetCardCarouselHover. Chrome n'a pas ce
      // problème mais l'appel reste inoffensif dans son cas.
      resetCardCarouselHover();
      // Lecteur audio (voir CARD_AUDIO_PLAYER) : ne continue pas à jouer en
      // arrière-plan une fois la carte refermée.
      panel.querySelectorAll('audio').forEach(audio => audio.pause());
      // Vidéo (voir CARD_VIDEOS) : ne continue pas à jouer en arrière-plan
      // une fois la carte refermée, même raison que le lecteur audio.
      panel.querySelectorAll('video').forEach(video => video.pause());
      const wasBodyVisible = !!(panelBody && panelBody.classList.contains('is-visible'));
      if (panelBody) panelBody.classList.remove('is-visible');

      // Les cartes DEVANT celle-ci dans la pile (voir .card-row .card:
      // nth-child dans style.css - la 1re carte a le z-index le plus haut,
      // etc.) empiètent normalement sur son bord gauche (margin-left:
      // -2.5rem) - écartées dès le clic sur Close (pas seulement juste
      // avant la révélation) pour qu'elles soient déjà hors du passage
      // pendant tout le rétrécissement, invisible de toute façon à cet
      // instant (le panneau encore plein écran, page verrouillée, cache
      // tout). Reviennent glisser à leur place normale une fois la vraie
      // carte révélée (voir onEnd plus bas).
      const allCards = Array.from(document.querySelectorAll('.card-row .card[data-card]'));
      const cardIndex = allCards.indexOf(card);
      const overlappingCards = cardIndex > 0 ? allCards.slice(0, cardIndex) : [];
      const SIDESTEP = 90; // px, > 2x le chevauchement (2.5rem = 40px) pour vraiment dégager visuellement
      overlappingCards.forEach(c => {
        c.style.transition = 'none';
        c.style.transform = `translateX(-${SIDESTEP}px) translateZ(0)`;
      });
      if (overlappingCards.length) void overlappingCards[0].offsetHeight; // force le reflow avant de réactiver la transition (voir plus bas)
      overlappingCards.forEach(c => { c.style.transition = ''; });

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
            // cardTitleColor : le titre de la petite carte est TOUJOURS sombre, donc pas de retour au blanc ici non plus.
            if (panelTitle && cardStyle && !cardStyle.cardTitleColor) panelTitle.style.color = ''; // repasse en blanc, en fondu, pendant le rétrécissement
            // Le titre est bien trop grand pour la carte une fois rétrécie : au
            // lieu de le laisser se faire couper puis disparaître d'un coup
            // (panel.hidden au transitionend), on le fait disparaître en fondu
            // sur la même durée que le rétrécissement du panneau.
            if (panelTitle) panelTitle.style.opacity = '0';
            if (cardImg && cardImgHome) {
              const homeRect = cardImgHome.getBoundingClientRect();
              growImageInto(cardImg, panelImgContainer, imageOverride, homeRect, CARD_IMAGE_RADIUS, 100);
            }
          });
        });

        panel.addEventListener('transitionend', function onEnd(e) {
          if (e.target !== panel) return;
          panel.removeEventListener('transitionend', onEnd);
          panel.hidden = true;

          // Écartées dès le clic sur Close (voir plus haut) - reviennent
          // glisser à leur place normale maintenant que la vraie carte est
          // révélée (panel.hidden juste au-dessus).
          overlappingCards.forEach(c => { c.style.transform = 'translateZ(0)'; });

          if (panelTitle) {
            panelTitle.style.opacity = '';
            if (!cardStyle?.cardTitleColor) panelTitle.style.color = '';
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
    const { cardImg, panelImgContainer, imageOverride, panelBody, needsWideBody, widthFraction, heightDrivenVh, imageHeightFraction } = currentOpen;
    applyWideBodyWidth(panelBody, needsWideBody, imageOverride?.aspectRatio ?? 1, widthFraction, heightDrivenVh, imageHeightFraction);
    syncImageColumnHeight(panelBody);
    fitPanelBodyHeight(panelBody);
    const targetRect = computePanelImageTargetRect(imageOverride?.aspectRatio, getImageMaxWidth(panelBody), imageHeightFraction);
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
  // Fondu à l'entrée dans le viewport (desktop uniquement) : sur mobile,
  // si la page recharge alors qu'elle est déjà scrollée, l'observer peut
  // rater son évaluation initiale (course avec la restauration automatique
  // du scroll par le navigateur) et laisser une section coincée à
  // opacity: 0 tant qu'on ne re-scrolle pas - plus simple et plus robuste
  // de ne pas avoir ce système du tout sur mobile (les sections sont déjà
  // là, pas besoin d'un fondu au scroll sur un flux vertical simple).
  if (!IS_MOBILE) setupScrollReveal();
  applyContent(slug);
  applyCardTextWidth(slug);
  if (IS_MOBILE) splitCardTextParagraphs();
  applyTitleStyle(slug);
  applyBackgrounds(slug);
  applyCardStyle(slug);
  setupCardImages(slug);
  setupCardVideos(slug);
  setupCardSecondaryImages(slug);
  setupCardImageRows(slug);
  setupCardImageColumns(slug);
  setupCardWideImages(slug);
  setupCardSpecTables(slug);
  applyCardSpecTableStacking(slug);
  setupCardAudioPlayers(slug);
  setupCardGalleries(slug);
  setupCardSlideCarousels(slug);
  // Re-appliqué : les légendes de carrousel (voir applyCardStyle plus haut)
  // n'existaient pas encore lors du premier appel, juste au-dessus -
  // setupCardGalleries/setupCardSlideCarousels les crée seulement ici.
  applyCardStyle(slug);
  setupCardStack();
  // Pile-carrousel au survol : n'a de sens qu'à la souris (voir
  // setupCardCarousel) - sur mobile, les cartes sont déjà toutes affichées
  // les unes après les autres (voir .is-mobile .card-row dans style.css),
  // rien à activer.
  if (!IS_MOBILE) setupCardCarousel();

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
