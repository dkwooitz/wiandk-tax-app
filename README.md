# wiandk-tax-app

A single-page **US federal tax estimator for tax year 2026**. Enter your income once and it assembles a full federal estimate — income tax, payroll and self-employment tax, surtaxes, and credits — as a line-by-line worksheet with the governing statute cited beside every figure.

No build step, no framework, no dependencies. Three static files that run in any modern browser.

> **Disclaimer.** Educational estimate only. Federal tax, tax year 2026 (returns filed in 2027), per IRS Rev. Proc. 2025‑32 and the One Big Beautiful Bill Act. It omits state/local tax, the full AMT computation, and several §199A and itemized‑deduction limits. Not tax‑filing software and not tax advice.

## What's in the repo

| File | Purpose |
|------|---------|
| `index.html` | Page structure and inputs |
| `style.css` | All styling |
| `script.js` | The tax engine — the whole model lives in the `compute()` function |

## Run it locally

Just open `index.html` in a browser. Or serve it (so relative paths behave exactly as in production):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy to Cloudflare Pages

This is a static site, so there is **no build command and no output folder** — Cloudflare serves the repo root as-is.

### 1. Push the files to GitHub

If you started from an empty repo with just a README, add the three site files and push:

```bash
git add index.html style.css script.js README.md
git commit -m "Add tax estimator site"
git push -u origin main
```

### 2. Connect the repo in Cloudflare

1. Log in to the [Cloudflare dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Authorize GitHub and pick **`dkwooitz/wiandk-tax-app`**.
3. On the build-settings screen, use:

   | Setting | Value |
   |---------|-------|
   | Framework preset | **None** |
   | Build command | *(leave blank)* |
   | Build output directory | `/` |
   | Root directory | `/` |

4. Click **Save and Deploy**.

Cloudflare builds and gives you a live URL like `https://wiandk-tax-app.pages.dev` within a minute. Every push to `main` redeploys automatically.

### 3. (Optional) Custom domain

In your Pages project → **Custom domains** → **Set up a domain**, enter your domain and follow the DNS prompt. If the domain is already on Cloudflare, the DNS record is added for you.

## Editing the model

All tax parameters sit in the `P` object at the top of `script.js` — brackets, standard deduction, capital‑gains breakpoints, wage base, credit amounts. Update those for a future tax year and the worksheet recalculates. The line-by-line logic is in `compute()`; rendering is in `render()`.

## Notes for next year

When TY2027 figures are published, update the values in `P` and the copy in the header/legislation section of `index.html`. Nothing else needs to change.
