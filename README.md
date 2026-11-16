# Bokläsare

En statisk HTML/CSS/JS-bokläsare som presenterar `manuskript.md` som en webbsida redo att publiceras på GitHub Pages.

## Funktioner
- **Kapitelindelad läsning** med automatisk innehållsförteckning och uppskattad lästid
- **Tre lästeman**: Papper (ljus), Sepia och Natt (mörk)
- **Anpassningsbar typografi**: Serif / Sans-serif, textstorlek och spaltbredd
- **Sök i hela boken** med direkt hopp till träffar
- **Bokmärke & automatisk läsposition** sparas i webbläsaren (`localStorage`)
- **Tangentbordsgenvägar**: `←` / `→` för att byta kapitel, `T` för innehållsförteckning, `S` för sök

## Publicera på GitHub Pages
1. Skapa ett nytt repository på GitHub och ladda upp alla filer i denna mapp (`index.html`, `styles.css`, `reader.js`, `manuskript.md`, `manuskript-fallback.js`).
2. Gå till **Settings → Pages** i ditt GitHub-repository.
3. Under **Build and deployment**, välj **Deploy from a branch**, välj `main` och mappen `/ (root)`, och klicka **Save**.
4. Efter någon minut finns din bokläsare live på `https://<ditt-användarnamn>.github.io/<ditt-repo>/`.

> **Tips:** Om du ändrar `manuskript.md` på GitHub läser webbsidan automatiskt in den nya versionen via `fetch('./manuskript.md')`. Filen `manuskript-fallback.js` används bara som reserv om du öppnar `index.html` direkt från datorn utan webbserver (`file://`).
