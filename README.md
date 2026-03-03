# **Stat Bubbles for DC20** — Owlbear Rodeo Extension

Track DC20 token stats using this [Owlbear Rodeo](https://www.owlbear.rodeo/) extension.

> **Stats supported:** HP, Max HP, Temp HP, PD, AD

![Stat Bubbles GitHub Image](<ADD_YOUR_IMAGE_LINK_HERE>)

## Installing

**Option A (recommended):** Install from a manifest URL (self-hosted).

1. Deploy/host this extension (Render, Vercel, etc.)
2. Copy your hosted `manifest.json` URL
3. In Owlbear Rodeo: **Extensions → Add Extension → Paste manifest URL**

Manifest URL example:
`https://YOUR-DEPLOYMENT-HOST/manifest.json`

**Option B:** If you publish to the Owlbear Rodeo store, add the store link here.
`<ADD_STORE_LINK_HERE>`

## How it works

This extension provides a simple way to track:

- **HP** (Current Hit Points)
- **Max HP**
- **Temp HP**
- **PD**
- **AD**

Stat Bubbles also features:

- A per-token setting to hide stats from players
- Name tags that will never overlap with health bars
- Tools for applying area-of-effect (AOE) damage/healing via the Action menu
- Settings to configure health bar positions
- An option to show segmented enemy health bars (GM setting)

### The Basics

**Right click** on a token to access the **context menu** and edit its stats.

<img name="Player Context Menu" src="<ADD_YOUR_IMAGE_LINK_HERE>" width="300" />

**This extension does math for you!**  
Inline math makes repetitive calculations effortless.

- To add 6: type `+6` and press Enter  
- To subtract 6: type `-6` and press Enter  

This works for every numeric stat.

<img name="Inline Math Demo" src="<ADD_YOUR_IMAGE_LINK_HERE>" width="600" />

In a hurry? Press **Tab** to cycle through inputs.

This extension works with tokens on the **Character** and **Mount** layers.

**Bars & bubbles appear automatically** when their values are greater than 0:
- The HP bar is created when **Max HP > 0**
- Temp HP / PD / AD bubbles appear when their value is **> 0**

### Game Masters

GMs get access to additional configuration options.

By clicking the button at the bottom of the context menu, the GM can lock players out of editing/viewing a token’s stats (depending on settings).

<img name="GM Context Menu" src="<ADD_YOUR_IMAGE_LINK_HERE>" width="300" />

### Action Menu

The action menu provides access to all of a room’s tokens in one place.

Quickly apply AOE effects or modify multiple tokens using the built-in operations.

Roll dice either publicly or secretly using the command line. Your rolls are stored in the scene roll log. Check out [RPG Dice Roller](https://dice-roller.github.io/documentation/guide/notation/) for supported dice notation.

![Action Menu](<ADD_YOUR_IMAGE_LINK_HERE>)

### Name tags

Name tags can be enabled from the settings menu. Once enabled, both players and GMs can set a token’s name in the context menu.

The autofill icon sets the name tag to the token’s **name property** (from accessibility settings). The name you give the token will also be displayed in initiative tracking extensions.

<img name="Name tag context menu" src="<ADD_YOUR_IMAGE_LINK_HERE>" width="300" />

### Settings

The settings menu allows GMs to customize the extension.

There are:
- **Room-level settings** (apply to every scene in the room)
- **Scene-level settings** (override room settings for that scene)

![Settings Menu](<ADD_YOUR_IMAGE_LINK_HERE>)

### Uninstalling

Refresh your page after uninstalling the extension to clear health bars and stat bubbles from the scene.

Token data will **not** be deleted by uninstalling.

## Support / Issues

If you need support, open an issue on **your** GitHub repo:
`https://github.com/<YOUR_ACCOUNT>/<YOUR_REPO>/issues`

(Replace the link above.)

## Building

This project uses **yarn**.

Install dependencies:

`yarn`

Run in development mode:

`yarn dev`

Make a production build:

`yarn build`

Preview the production build locally:

`yarn preview`

## License

GNU GPLv3

## Contributing / Attribution

This project is a fork/adaptation of the original Stat Bubbles extension for Owlbear Rodeo.

Original author credits:
- Copyright (C) 2023 Owlbear Rodeo
- Copyright (C) 2023 Seamus Finlayson

If you publish your fork publicly (especially to the store), use your own extension name/logo.
