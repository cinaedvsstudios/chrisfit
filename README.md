# Actarium v3.6

Actarium is the weekly control panel for tasks, reminders, ChrisFit, Viaticum, and grouped links.

## v3.6 mobile header layout

The mobile header is one outlined day card:

1. Logo, Actarium name, version, theme, and settings share the top line.
2. Today, Week, Month, and Tasks share one compact line underneath.
3. The current day title and date sit in the centre of that same card.
4. The bottom line keeps the routine/trip context on the left and Apps, Archive, and Add on the right.

Apps, Archive, and Add do not have their own extra mobile row.

## Development rule

Do not add patch files, override scripts, helper-on-helper loaders, or post-load fixes. Fix the owning source file directly. When a permanent concept becomes large, move it into a properly named module with one clear responsibility.

## Live backend

The current Apps Script web-app URL is configured in `js/app.js`. After changing Apps Script, deploy a new version and update the URL only when Google gives a different `/exec` address.
