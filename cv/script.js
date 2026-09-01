// Page CV : contenu statique, écrit directement dans index.html (pas de
// data-driven comme /projects/ - une seule page, pas besoin d'un CSV/JS de
// rendu générique).

// Décide UNE FOIS, au chargement, si on sert la structure mobile ou desktop -
// même principe que / et /projects/ (script.js). document.documentElement.
// clientWidth, PAS window.innerWidth : ce dernier s'est révélé peu fiable en
// émulation mobile (Chrome DevTools) dans certaines configurations,
// retournant la largeur du viewport desktop par défaut (~980px) alors que
// clientWidth reflète correctement l'appareil émulé - identiques sur un vrai
// téléphone, donc sans risque pour de vrais visiteurs mobiles.
// 900px seul ratait les tablettes (voir /projects/ script.js pour le détail
// complet) - combiné au type de pointeur ("coarse" = tactile, jamais vrai
// sur souris/trackpad) pour couvrir tous les iPad sans capturer une fenêtre
// desktop juste redimensionnée. Plafond de 1400px : un iPad tactile relié à
// un grand écran externe garde quand même la structure desktop au-delà.
const IS_MOBILE = document.documentElement.clientWidth <= 900
  || (window.matchMedia('(pointer: coarse)').matches && document.documentElement.clientWidth <= 1400);
// Classe sur <html> plutôt qu'un @media : permet au CSS de cibler cette
// MÊME décision figée au chargement, au lieu de réagir en direct à la
// largeur de la fenêtre.
document.documentElement.classList.toggle('is-mobile', IS_MOBILE);

