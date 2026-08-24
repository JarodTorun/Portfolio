// Page CV : contenu statique, écrit directement dans index.html (pas de
// data-driven comme /projets/ - une seule page, pas besoin d'un CSV/JS de
// rendu générique).

// Décide UNE FOIS, au chargement, si on sert la structure mobile ou desktop -
// même principe que / et /projets/ (script.js). document.documentElement.
// clientWidth, PAS window.innerWidth : ce dernier s'est révélé peu fiable en
// émulation mobile (Chrome DevTools) dans certaines configurations,
// retournant la largeur du viewport desktop par défaut (~980px) alors que
// clientWidth reflète correctement l'appareil émulé - identiques sur un vrai
// téléphone, donc sans risque pour de vrais visiteurs mobiles.
const IS_MOBILE = document.documentElement.clientWidth <= 900;
// Classe sur <html> plutôt qu'un @media : permet au CSS de cibler cette
// MÊME décision figée au chargement, au lieu de réagir en direct à la
// largeur de la fenêtre.
document.documentElement.classList.toggle('is-mobile', IS_MOBILE);

