# Flowchart Editor

A lightweight, browser-based visual editor for creating interactive dialogs, quests, and state machines. Built with vanilla JavaScript for game developers working with node-based flowcharts.

[![Version](https://img.shields.io/badge/version-1.0-blue.svg)](https://github.com/yourusername/flowchart-editor)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## Features

- **Node-Based Visual Editor** – Intuitive drag-and-drop interface for complex flowcharts
- **Multiple Export Formats** – Native support for Construct 3 and MiniFlow formats
- **Undo/Redo System** – Full history stack for worry-free editing
- **View/Edit Modes** – Separate modes to prevent accidental changes
- **Keyboard Shortcuts** – Comprehensive key bindings for efficient workflow
- **Connection System** – Smooth Bezier curves with drag-to-connect functionality
- **Selection Tools** – Marquee selection, multi-select, and mutual exclusion
- **Smart Behaviors** – Auto-cascade creation, group operations, auto-truncation

## Usage

### Basic Workflow

1. Click "Enter Edit Mode" in the top menu
2. Create nodes using toolbar or right-click context menu
3. Connect nodes by dragging from output dots to node inputs
4. Configure node properties in the side panel
5. Set start node via right-click context menu
6. Save project as `.flowproj` or export for your engine

### Keyboard Shortcuts

#### Navigation
- `Space + LMB Drag` or `MMB Drag` – Pan canvas
- `Ctrl + Wheel` – Zoom in/out

#### Editing
- `Ctrl + Z` / `Ctrl + Y` – Undo / Redo
- `Ctrl + C` / `Ctrl + V` – Copy / Paste nodes
- `Delete` – Delete selection
- `Esc` – Deselect all

#### File Operations
- `Ctrl + N` – New project
- `Ctrl + O` – Open project
- `Ctrl + S` – Save project
- `Ctrl + Shift + S` – Save as
- `Ctrl + E` – Export Construct 3 format
- `Ctrl + Shift + E` – Export MiniFlow format

### Mouse Controls

- `LMB Click` – Select node or connection
- `LMB Drag (Node)` – Move selected nodes
- `LMB Drag (Output)` – Create new connection
- `LMB Drag (Canvas)` – Box selection (marquee)
- `Shift + LMB` – Add/remove from selection
- `RMB` – Open context menu (Edit mode only)

## File Formats

### Native Format (.flowproj)

Preserves complete editor state including visual layout, undo history, and all metadata. Recommended for saving work between sessions.

### Construct 3 Format

Full compatibility with Construct 3 game engine. Exports two files:
- `.json` – Core data with numeric SID (System ID) for nodes
- `.uistate.json` – Visual state for editor integration

Import both files to preserve visual layout.

### MiniFlow Format

Simplified JSON format for custom parsers and lightweight integration. Single file with human-readable node IDs.

**Example structure:**
```json
{
  "root": "quest_start",
  "nodes": {
    "quest_start": {
      "caption": "Village Guard",
      "tag": "n_choice",
      "outputs": [
        {
          "name": "Accept Quest",
          "value": "I'll help you!",
          "next": "quest_accept"
        },
        {
          "name": "Refuse",
          "value": "Not interested.",
          "next": "quest_decline"
        }
      ]
    }
  }
}
```

**Note:** MiniFlow stores only logical graph structure. Visual states are not preserved.

## Format Conversion

- **MiniFlow to C3:** Generates unique SIDs, applies BFS-based auto-layout
- **C3 to MiniFlow:** Converts SIDs to readable names

## Technical Details

- Pure vanilla JavaScript – no frameworks or build tools
- Browser-based – works offline after initial load
- Canvas-based rendering for smooth performance
- Comprehensive undo/redo with full state preservation

## Resources

- [Construct 3 Flowchart Documentation](https://www.construct.net/en/make-games/manuals/construct-3/project-primitives/flowcharts)

## Support

If this tool helps your workflow, consider supporting development:

[Donate $3](https://your-donate-link.com)

## Contact

- Reddit: [u/famstudios](https://www.reddit.com/user/famstudios/submitted/)
- Telegram: [Join Channel](https://t.me/+RzFhrTe9XYAxZjhi)
- Email: famstudiogames@gmail.com

## License

MIT License - see [LICENSE](LICENSE) file for details.
