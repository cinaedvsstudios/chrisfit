# Deploying to GitHub Pages

Although the ChrisFit web clone can run locally or on any static host,
GitHub Pages offers a simple way to share the app.  Follow these steps
to deploy your copy:

1. **Create a repository** – push the contents of the `chrisfit-web`
   folder into a new GitHub repository (excluding any secret `config.js` file).
2. **Enable Pages** – in the repository settings find the **Pages**
   section.  Select the `main` branch and the `/` (root) folder as the
   source and save.  GitHub will publish the site at
   `https://<username>.github.io/<repository>/`.
3. **Add your `config.js`** – because `config.js` may contain private
   tokens it should not be committed to GitHub.  Instead create the file
   locally in the project and configure it after cloning.  Alternatively
   deploy the backend with public access and omit the token.
4. **Test** – navigate to the published URL once the page has built.
   The site should load in demo mode unless configured otherwise.

GitHub Pages is optional; any static hosting provider (e.g. Netlify,
Vercel, Firebase Hosting) will work as long as the site is served over
HTTPS.