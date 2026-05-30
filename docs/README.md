# ChrisFit Web

This folder contains a **web version** of the ChrisFit Android app.  The goal
of this project is to replicate the existing Android functionality and
structure as closely as possible using plain HTML, CSS and JavaScript.  The
web version retains the same workflow, data concepts, calculations and
visual identity wherever technically practical.

## Running locally

Because the application uses ES modules it must be served from a web server
rather than opened directly from the filesystem.  In a terminal run the
following commands from the root of this repository (outside of the ZIP) to
start a simple development server:

```bash
cd chrisfit-web
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.  The app will operate in
demo mode until you provide a Google Apps Script backend URL in
`js/config.js`.

## Configuration

Create a copy of `js/config.example.js` named `js/config.js` and fill in
your Apps Script endpoint and optional token.  Without these values the
application will fall back to in‑memory storage for testing.  See
`docs/GOOGLE_SHEETS_SETUP.md` for instructions on deploying the backend.

## Folder structure

- `index.html` – entry point for the web app.
- `css/` – modular CSS files defining variables, layout, components, history
  view, dialog styles, dark mode and responsive tweaks.
- `js/` – JavaScript modules implementing state management, API wrappers,
  date and calculation utilities and the main application logic.
- `assets/` – place to store copied or adapted Android assets.  The
  original ChrisFit repository did not include image resources, so
  placeholder emojis are used where necessary.
- `google-apps-script/` – stub for the Apps Script backend (see
  `docs/GOOGLE_SHEETS_SETUP.md`).
- `google-sheets-templates/` – CSV and XLSX templates matching the Room
  entities defined in the Android project.
- `docs/` – detailed documentation on source audit, migration steps,
  deployment and handover.

## Limitations

This implementation is a **faithful clone** of the Android code base
inspected at the time of writing.  If future Android versions add or
modify functionality the web version may need to be updated accordingly.

Dark mode support is implemented via a CSS class on the `<body>` element.
You can toggle it manually by adding or removing the `dark` class in
developer tools.  Wiring a proper toggle into the settings screen can be
done as a future enhancement.