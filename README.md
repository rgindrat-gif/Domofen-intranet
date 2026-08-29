# Domofen Intranet — Frontend JS

Code JavaScript pour le portail partenaires B2B Domofen (domofen.ch/espace-partenaire).

## CDN

```
https://cdn.jsdelivr.net/gh/rgindrat-gif/Domofen-intranet@main/domofen-forms.min.js
```

## Pages Webflow

| Page | URL | Flow |
|------|-----|------|
| Nouvelle demande | `/espace-partenaire/nouvelle-demande` | `demande` |
| Modifier offre | `/espace-partenaire/modifier-offre` | `modification` |
| Passer commande | `/espace-partenaire/passer-une-commande` | `commande` |
| Commande avec offre | `/espace-partenaire/passer-commande-avec-offre` | `commande_offre` |

## Build

```bash
npm install
npm run build
```

Minifie `src/domofen-forms.js` vers `domofen-forms.min.js` (racine) via Terser.

## Architecture

Le fichier `src/domofen-forms.js` contient 9 modules :

| Module | Fonction |
|--------|----------|
| `colorSelectors` | Peuple les selects couleur depuis le CMS Webflow |
| `memberstackData` | Injecte les donnees Memberstack dans le formulaire |
| `radioSync` | Toggle "autre adresse de livraison" |
| `schemaPicker` | Modal de selection de schema de fenetre |
| `autreOption` | Ajoute "Autre (preciser)" aux selects |
| `positionManager` | Ajout/suppression/reindexation des positions |
| `positionSerializer` | Serialise les positions en JSON avant envoi |
| `prefill` | Pre-remplit le formulaire depuis Airtable (via n8n) |
| `draftSave` | Sauvegarde brouillon (POST direct au webhook n8n) |

## Phase de compatibilité (identité déclarée)

Jusqu'au **2026-09-15**, le drapeau `LEGACY_IDENTITY` reste vrai : `prefill`, `draft` et `submit` envoient encore `x-member-id` / `member_stack_id` en plus de `Authorization: Bearer`. Tant que ce drapeau est vrai, un appelant sans jeton est toujours servi, donc la faiblesse reste ouverte. Ce n'est pas un réglage de confort, c'est une dette datée. Passé cette date, le drapeau passe à faux et seule l'en-tête Bearer identifie le partenaire.

Le fichier `domofen-forms.min.js` servi par jsDelivr n'est pas régénéré ici : le rebuild est un geste humain, plus tard dans la séquence de bascule.

## Backend

Les webhooks pointent vers n8n (n8n.domofen.ch) :

| Action | Webhook |
|--------|---------|
| Prefill | `GET /webhook/intranet/prefill?rec={id}` |
| Draft Save | `POST /webhook/intranet/draft-save` |
| Submit | `POST /webhook/intranet/submit` |
