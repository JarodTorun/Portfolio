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

// Bouton "Back" agrandi sur mobile SEULEMENT - en style inline plutôt qu'en
// CSS (essayé d'abord via .is-mobile #cv-back dans style.css : la classe
// .is-mobile était bien posée, mais le style ne s'appliquait quand même
// pas, probablement un conflit avec le CSS régénéré dynamiquement par
// Tailwind CDN sur cette page). Du inline, posé directement sur les
// éléments, l'emporte toujours sur n'importe quelle feuille de style.
if (IS_MOBILE) {
  const backLink = document.getElementById('cv-back');
  if (backLink) {
    backLink.style.fontSize = '1rem';
    const label = backLink.querySelector('span');
    if (label) label.style.padding = '0.75rem 1.25rem 0.75rem 3.5rem';
    const icon = backLink.querySelector('i');
    if (icon) icon.style.width = '32px';
    const svg = backLink.querySelector('svg');
    if (svg) {
      svg.style.width = '20px';
      svg.style.height = '20px';
    }
  }
}
