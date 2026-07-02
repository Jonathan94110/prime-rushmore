# Who Wore It Better? — TF Marauders

One G1 cartoon. Two third-party Transformers figures. You decide which one nailed the look.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy

Pushes to `main` auto-deploy via GitHub Pages (`.github/workflows/pages.yml`).
One-time setup: Settings → Pages → Source: **GitHub Actions**.

## Add an episode

Edit the `EPISODES` array in `app.js` and drop matching images into `assets/placeholders/`.
