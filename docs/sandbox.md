# Sandbox Guide

The sandbox is a local web app — a code editor, an asset manager, and a live
preview, all backed by a small Bun server that saves your work to disk as
you go. This page is a tour of the UI. For install/run instructions, see
[`docs/getting-started.md`](getting-started.md); for a hands-on build, see
[`docs/tutorial.md`](tutorial.md).

```sh
bun run dev:sandbox
```

Then open `http://127.0.0.1:4173`, the address the server prints.

![The sandbox running a game, with the code, the game, and Messages visible](media/main-view-running-game.png)

## Layout

The code is on the left and the game is on the right, as big as the window
allows. Drag the divider between them to give either one more room, and
the divider above **Messages** to trade height with the game.
Double-click a divider to put it back.

- **The top bar** has the logo, the **My game** menu for switching between
  your games, **Examples**, **Docs**, and the sun/moon button.
- **The bar down the left** switches between your **Code** and the
  game's **Images**, **Sounds**, **Music**, and **Fonts**. A number on a
  button counts the files of that kind.
- **The game panel** has Play, Stop and Restart, the game itself, and
  **Messages** underneath it.

**Docs** opens the project documentation in a separate browser tab, so you
can keep it visible while editing and running your game in the sandbox. Use
the grouped navigation to move between the getting-started guide, tutorial,
cookbook, sandbox guide, examples, migration guide, verification CLI guide,
and API reference. Links between these pages, and their images, stay in the
documentation tab. A link to another file in the repository, such as an
example's README, opens that file on GitHub in a new tab, and links to
other websites open in a new tab too.

The sun/moon button switches between light and dark mode. The sandbox
starts light, or dark if your computer is set to dark mode, then remembers
whichever mode you choose. Changing the sandbox theme does not change the
colors drawn by your game.

## Your games

The first time you open the sandbox there are no games yet, so it offers
two ways to start:

- **Remix an example** copies one of the shipped example games (see
  [`docs/examples.md`](examples.md)) into a brand-new game of your own,
  which you're then free to change however you like. Pick one of the three
  shown, or **See all examples** for the whole gallery.
- **Make a blank game** starts from a small working game (an
  arrow-key-controlled circle with the label "Use the arrow keys!") so
  there's something on screen immediately, rather than a blank file.

After that, **My game** in the top bar names the game you have open. Click
it for a list of every game: pick one to switch to it, or use its pencil to
rename it or its bin to delete it. Deleting a game removes every file inside
it and can't be undone. **New game**, at the bottom of the list, offers the
same two ways to start.

Game names must start with a lowercase letter and contain only lowercase
letters, digits, `-`, and `_`.

## Code

Each code file has a tab above the editor (a CodeMirror-based JavaScript
editor). A game opens with `main.js` selected. Use **+** beside the tabs to
add another file, for example to keep notes or alternate versions, and the
**⋯** on the open tab to rename or delete it.

The editor colors the names js-game-zero gives you, such as `screen`,
`Actor`, `keyboard` and `WIDTH`, in blue, and the hooks it calls, such as
`draw` and `update`, in bold orange. Everything else is yours.

The preview evaluates `main.js` as one zero-boilerplate script. It does not
bundle other JavaScript files or resolve `import` statements. Organize a
sandbox game with constants and focused helper functions in that script.
For a game split into modules, use a browser bundler and the scoped
`defineGame()` / `run()` API shown in
[`Sandbox Starter`](../examples/sandbox-starter/README.md).

Changes save automatically about half a second after you stop typing. The
status at the right of the tabs reads "Saving…" until your work is on disk,
then "Saved" (or "Couldn't save" with a message explaining why, if something
went wrong). Press **Ctrl/Cmd+S**, or click the status, to save
immediately instead of waiting.

## Images, sounds, music and fonts

**Images**, **Sounds**, **Music**, and **Fonts** on the left each open a
panel for that kind of asset, matching the framework's asset directories.
**Code**, or the panel's ✕, closes it again.

![The Images panel showing a game's images](media/asset-panel.png)

- The top of the panel shows how to use one in code, with the name of one
  of your own files: `new Actor("gem")`, `sounds.jump.play()`,
  `music.play("theme")`, or `fontname: "pixel"`.
- Click **Choose files** to pick files from your computer, or drop them on
  the panel. Dropped files are sorted by type: pictures go to Images and
  font files to Fonts. Audio goes to the open Sounds or Music panel, or else
  to Sounds (Music if "music" is in its name).
- Each file shows a preview (the picture, a play button for sounds and
  music, or "Aa" in the font) and its name in code, and a delete button
  when you point at it.
- Code uses an asset's name in lowercase, without its folder or ending: a
  file uploaded as `images/hero.png` is `new Actor("hero")` or
  `images.hero`. Names can only use lowercase letters, digits and `_`, so a
  file whose name can't be used in code says **Rename to use**; upload it
  again under a name like `hero_2.png`. See
  [`docs/reference/loaders.md`](reference/loaders.md) for the full naming
  grammar.

## Play, Stop, Restart

- **Play** runs the open game's `main.js`, saving any changes first.
- **Restart** runs the same game again from the beginning. Use it after
  changing code while the game keeps running, since editing doesn't change
  the running game by itself.
- **Stop** ends the game.

While the game is stopped, the big play button in the middle of the game
panel does the same as **Play**.

The pill beside the game's title reads **Stopped**, **Running**, or
**Needs a fix** (when the game stopped on a problem). The title is the
game's `TITLE`, or its name if it doesn't set one.

### Keyboard focus

The game runs inside an embedded frame, and browsers only deliver keyboard
events to whichever frame has focus. **Play** hands the keyboard to the
game: a teal ring goes round it, and the line underneath says "Your keys go
to the game. Click your code to type again." When you click somewhere else,
the ring goes and the game shows **"Click the game to use your keyboard"**;
click anywhere on the game to give it the keys again.

## Messages and problems

**Messages**, under the game, shows anything your game prints with
`console.log`/`info`/`warn`/`error`, in order, and the problems the runtime
finds (see [`docs/reference/runtime.md`](reference/runtime.md#diagnostics)),
above them. A count beside the heading says how many problems there are.
Click a problem's **Line** to go to that line in your code.

When a problem stops the game:

- the game says **Your game stopped**, with a button to show you the line;
- the line is marked in red in the editor, with the problem's message
  under it;
- the `main.js` tab gets a red dot.

When the message names the right spelling, such as "`screen.draw.fillRect`
doesn't exist. Did you mean `screen.draw.filledRect`?", a button under it
makes that change for you (**Change it to filledRect**). A link beside it
opens the reference page for the thing the message is about. Editing the
marked line clears the mark; press **Play** to try again.

Messages are cleared each time you press Play or Restart, when you switch
games, and when you click **Clear**.

## Example gallery

![The example gallery, showing every shipped example game](media/example-gallery.png)

Opened from the **Examples** button in the top bar, from **See all
examples** on the first screen, or from **Remix an example** under **New
game**. The examples are grouped: **Start here** has short programs that
each show one idea, **Try next** adds sounds and saving, and **Full games**
are whole games to play, read and change. Each card shows a picture of the
game, a sentence about what it does, and how you play it (keyboard, mouse,
or watch — it just plays). Click a card, name your copy, and the example's
code and assets are copied into a new game of your own. See
[`docs/examples.md`](examples.md) for what each example teaches.

## Command-line options

```sh
bun run dev:sandbox
```

serves the editor on `http://127.0.0.1:4173` by default, prints that
address, and stores projects in a `.jgz-projects` directory next to wherever
you ran the command. The game preview runs on a second port, one above the
editor's (4174 by default), so a game's code runs apart from the editor and
can't use its project API. Use `--port` to move the editor, `--preview-port`
to move the preview, and `--projects-root` for an explicit (e.g. disposable)
project directory:

```sh
bun apps/sandbox/src/server.ts --host 127.0.0.1 --port 4200 --projects-root /tmp/workshop-projects
```

That editor is at `http://127.0.0.1:4200`, and its preview uses port 4201.

The sandbox also works at `http://localhost:4173`. Your projects are the
same at either address, but the browser keeps each game's saved `storage`,
and the sandbox's own settings such as light or dark mode, separately for
each address, so it's simplest to stick to one.

## Server API (advanced)

The sandbox client talks to a small JSON API, useful if you're scripting
against it or building your own tooling on top:

| Method   | Path                                  | Purpose                                    |
| -------- | ------------------------------------- | ------------------------------------------ |
| `GET`    | `/api/health`                         | Liveness check.                            |
| `GET`    | `/api/projects`                       | List projects.                             |
| `POST`   | `/api/projects`                       | Create a project (`{name, exampleSlug?}`). |
| `GET`    | `/api/projects/:project`              | Project summary and file list.             |
| `POST`   | `/api/projects/:project/rename`       | Rename a project.                          |
| `DELETE` | `/api/projects/:project`              | Delete a project.                          |
| `GET`    | `/api/projects/:project/files/:path`  | Read content plus its save `version`.      |
| `PUT`    | `/api/projects/:project/files/:path`  | Versioned write or file creation.          |
| `DELETE` | `/api/projects/:project/files/:path`  | Delete a file.                             |
| `POST`   | `/api/projects/:project/files/rename` | Rename a file (`{from, to}`).              |
| `PUT`    | `/api/projects/:project/assets/:path` | Upload an asset (raw bytes).               |
| `DELETE` | `/api/projects/:project/assets/:path` | Delete an asset.                           |
| `GET`    | `/api/examples`                       | List cloneable example games.              |
| `GET`    | `/api/docs`                           | List documentation pages.                  |
| `GET`    | `/api/docs/:id`                       | Read an allowlisted documentation page.    |
| `GET`    | `/assets/:project/:path`              | An asset's contents.                       |

The game preview is served separately, on the preview port. Its
`GET /play/:project` is the page the editor embeds to run a project, and it
offers the same reads of a project, its files, and its assets that a running
game needs, but no routes that change anything.

Every project/file/asset route rejects path traversal, absolute paths,
encoded escapes, backslashes, and symlink escapes — file and asset paths are
always confined to their project's own directory on disk.

File writes send `{content, baseVersion, revision, sessionId}`. The server
serializes writes per path and compares revisions only within the same editor
session, so an unload-safe save cannot let stale content overwrite a newer edit
and one editor cannot supersede another editor's stale base. Mutation
requests carrying a foreign `Origin` are rejected; the separate learner
preview origin can read only its narrowly scoped source/assets and cannot use
the editor's project mutation API.
