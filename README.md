# Mudae Toolbox

Application web locale. Ouvre `index.html` dans ton navigateur, rien d'autre a installer.

## Structure

```
index.html              markup de tous les onglets
css/style.css           styles globaux
js/assets.js            atlas decors + 4 atlas sprites + cadre Mudae (base64)
js/pokedata.js          noms des decors et socles
js/pokesprites.js       index des variantes (ids, boites de contenu) + noms FR/EN
js/gif.js               decodeur et encodeur GIF autonome
js/utils.js             fonctions communes (canvas, images, couleurs, copie)
js/sprites.js           generateur de sprites Pokemon
js/cropper.js           recadrage 225x350, GIF, cadre auto, upload Imgur
js/solvers.js           solvers $oq, $oc, $ot
js/adjacency.js         resolution des perks d'adjacence de wishlist
js/wishformator.js      wishlist visuelle, tags, drag and drop, adjacence
js/haremsort.js         trieur unifie series + persos, commandes $sm / $smp
js/colors.js            selection de couleurs et commandes en direct
js/playerstats.js       parsing des bonus joueur
js/boostwish.js         taux d'apparition + optimisation $bw
js/app.js               navigation par onglets et demarrage
```

## Donnees embarquees

Ton pack Black & White complet : 650 sprites de face, 650 shiny, 650 de dos,
96 femelles. Plus 35 arriere-plans et 40 socles Diamant/Perle/Platine, et ton
cadre transparent 225x350.

Les assets sont en base64 dans `js/assets.js` : c'est ce qui permet d'exporter
les images depuis un fichier ouvert en `file://` sans que le navigateur bloque
le canvas.

## Imgur

Le bouton "Envoyer sur Imgur" prepare l'image au format Mudae, la telecharge,
la copie dans le presse-papiers quand c'est un PNG, et ouvre imgur.com/upload
dans un nouvel onglet. Sur cet onglet : Ctrl+V pour coller, ou glisser le
fichier telecharge. Aucune cle API n'est necessaire.

Le presse-papiers ne gere pas le GIF (limite des navigateurs) : pour un GIF,
glisse le fichier telecharge.
