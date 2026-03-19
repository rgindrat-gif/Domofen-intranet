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

## Backend

Les webhooks pointent vers n8n (n8n.domofen.ch) :

| Action | Webhook |
|--------|---------|
| Prefill | `GET /webhook/intranet/prefill?rec={id}` |
| Draft Save | `POST /webhook/intranet/draft-save` |
| Submit | `POST /webhook/intranet/submit` |
