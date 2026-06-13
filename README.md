# 🏆 Pronos Coupe du Monde 2026

Plateforme web de pronostics entre amis pour la Coupe du Monde 2026.

## Fonctionnalités

- Connexion simple avec pseudo (pas de mot de passe)
- Création de groupes privés avec code d'invitation à 6 caractères
- Pronostic 1/N/2 **ou** score exact pour chaque match
- Verrouillage automatique du pronostic dès le début du match
- Calcul automatique des points :
  - **Score exact** → 5 points
  - **Bon résultat (1/N/2)** sans score exact → 3 points
  - **Mauvais pronostic** → 0 point
- Classement général en temps réel (Firebase Firestore + `onSnapshot`)
- Interface responsive (mobile / desktop), design inspiré de la Coupe du Monde
- Page admin (`admin.html`) pour saisir les résultats réels des matchs

## Structure des fichiers

```
├── index.html      → Application principale
├── admin.html       → Page d'administration (saisie des résultats)
├── style.css         → Styles (thème Coupe du Monde, responsive)
├── app.js            → Logique de l'application
├── firebase.js       → Config + initialisation Firebase
├── matches.json      → Liste des matchs (à compléter/éditer)
└── vercel.json       → Config de déploiement Vercel
```

## 1. Configuration Firebase

1. Va sur [console.firebase.google.com](https://console.firebase.google.com) et crée un projet.
2. Active **Firestore Database** (mode production ou test).
3. Dans **Paramètres du projet > Tes applications**, crée une "Application Web" et copie la config.
4. Colle cette config dans `firebase.js` à la place de `firebaseConfig`.

### Règles Firestore recommandées (mode simple, sans auth)

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /groups/{groupCode} {
      allow read, write: if true;
      match /{document=**} {
        allow read, write: if true;
      }
    }
  }
}
```

⚠️ Ces règles sont ouvertes (adapté à un usage "entre amis"). Pour plus de sécurité,
tu peux ajouter Firebase Auth anonyme et restreindre l'écriture des pronostics
au pseudo correspondant.

## 2. Compléter `matches.json`

Le fichier contient 10 matchs d'exemple. Ajoute tous les matchs de la Coupe du
Monde 2026 avec le même format :

```json
{
  "id": "m11",
  "stage": "Groupe F",
  "date": "2026-06-16T17:00:00",
  "home": "Équipe A",
  "away": "Équipe B",
  "homeFlag": "🏳️",
  "awayFlag": "🏳️"
}
```

`date` doit être au format ISO (heure locale du navigateur des utilisateurs).

## 3. Lancer en local

Comme `app.js` utilise des modules ES (`type="module"`), il faut servir les
fichiers via un serveur HTTP (pas en `file://`) :

```bash
npx serve .
# ou
python3 -m http.server 8080
```

## 4. Déployer sur Vercel

```bash
npm i -g vercel
vercel
```

Ou connecte simplement le repo GitHub à Vercel — `vercel.json` est déjà configuré
pour un site statique.

## 5. Saisir les résultats (admin)

Ouvre `admin.html`, entre le **code du groupe**, puis saisis le score réel de
chaque match. Le classement de tous les membres se recalcule automatiquement
en temps réel grâce à `onSnapshot`.

## Notes

- Le pseudo est stocké en `localStorage` (pas de mot de passe — usage entre amis).
- Deux personnes ne peuvent pas avoir le même pseudo *dans le même groupe*
  (le doc Firestore `members/{pseudo}` sera partagé). Conseille à tes amis
  d'utiliser des pseudos uniques.
- Un pronostic ne peut plus être modifié dès que `new Date() >= match.date`.
