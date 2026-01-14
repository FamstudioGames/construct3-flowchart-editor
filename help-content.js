/* help-content.js */
const HELP_CONTENTS = {
    "getting-started": `
        <h2>🚀 Getting Started</h2>
        <p><strong>What is Flowchart Editor?</strong><br>
        A visual tool for creating and managing flowcharts for dialogs, quests, and game logic.</p>
        
        <h3>Typical Workflow:</h3>
        <ol>
            <li>Create nodes (<strong>Right-click</strong> → Add Node).</li>
            <li>Connect outputs by dragging from output dots.</li>
            <li>Set the Start node (<strong>Right-click</strong> → Set Start).</li>
            <li>Export to your target format.</li>
        </ol>
        
        <h3>Use Cases:</h3>
        <ul>
            <li>Dialogue systems</li>
            <li>Quest branching logic</li>
            <li>State machines</li>
        </ul>
    `,

    "controls": `
        <h2>⌨️ Controls & Shortcuts</h2>
        <h3>Hotkeys</h3>
        <table>
            <tr><th>Key</th><th>Action</th></tr>
            <tr><td><kbd>Space</kbd> (hold)</td><td>Pan Mode</td></tr>
            <tr><td><kbd>Ctrl</kbd> + <kbd>Wheel</kbd></td><td>Zoom In/Out</td></tr>
            <tr><td><kbd>Delete</kbd> / <kbd>Bksp</kbd></td><td>Delete selection</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>Deselect all</td></tr>
            <tr><td><kbd>Ctrl</kbd> + <kbd>C</kbd></td><td>Copy nodes</td></tr>
            <tr><td><kbd>Ctrl</kbd> + <kbd>V</kbd></td><td>Paste nodes</td></tr>
            <tr><td><kbd>Ctrl</kbd> + <kbd>S</kbd></td><td>Export</td></tr>
            <tr><td><kbd>Shift</kbd>+<kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Save As (stub)</td></tr>
            <tr><td><kbd>Enter</kbd></td><td>Confirm filename edit</td></tr>
        </table>

        <h3>Mouse Controls</h3>
        <ul>
            <li><strong>LMB Click:</strong> Select node/connection</li>
            <li><strong>LMB Drag Node:</strong> Move selection</li>
            <li><strong>LMB Drag Output:</strong> Create connection</li>
            <li><strong>LMB Drag Empty:</strong> Marquee selection</li>
            <li><strong>LMB Click Name:</strong> Rename flowchart</li>
            <li><strong>Shift + LMB:</strong> Add/toggle selection</li>
            <li><strong>MMB / Space+LMB:</strong> Pan canvas</li>
            <li><strong>RMB:</strong> Context menu</li>
        </ul>
    `,

    "import-export": `
        <h2>📂 Import / Export</h2>
        
        <h3>Construct 3 (Native Format)</h3>
        <p><strong>Import:</strong><br>Requires 2 files: <code>.json</code> (logic) + <code>.uistate.json</code> (layout).<br>Select both files when prompted.</p>
        <p><strong>Export:</strong><br>Downloads 2 files automatically.</p>

        <h3>MiniFlow (Simplified Format)</h3>
        <p><strong>Import:</strong><br>Single file: <code>*.miniflow.json</code>.<br>Auto-layout applied automatically (BFS algorithm).</p>
        <p><strong>Export:</strong><br>Generates simplified JSON with human-readable IDs.<br>Downloads single file.</p>
    `,

    "formats": `
        <h2>📄 Formats (MiniFlow & Construct 3)</h2>
        
        <h3>MiniFlow Format Specification</h3>
        <p><strong>Design Principles:</strong> Topology-first, No visual metadata, Human-readable IDs.</p>
        
        <h4>Structure:</h4>
<pre><code>{
  root: "entry_node_id",
  nodes: {
    "node_id": {
      caption: "Display Name",
      tag: "LogicTag",
      outputs: [
        {
          name: "OutputName",
          value: "Dialog text",
          next: "target_id" // or null
        }
      ]
    }
  }
}</code></pre>

        <h3>Conversion Notes</h3>
        <ul>
            <li><strong>MiniFlow → C3:</strong> Generates unique SIDs, builds arrays (pnSIDs, nodeSIDs), applies BFS Auto-layout.</li>
            <li><strong>C3 → MiniFlow:</strong> Humanizes SIDs (e.g. <code>quest_start_2</code>), extracts topology.</li>
        </ul>

        <h3>Construct 3 Reference</h3>
        <ul>
            <li><a href="https://www.construct.net/en/make-games/manuals/construct-3/project-primitives/flowcharts" target="_blank">Flowchart Documentation</a></li>
        </ul>
    `,

    "about": `
        <h2>ℹ️ About / Feedback</h2>
        <p><strong>Version:</strong> 1.0</p>
        
        <h3>Implemented Features:</h3>
        <ul>
            <li>Node management (create, move, resize, enable/disable)</li>
            <li>Connection system (Bezier curves, drag-to-connect)</li>
            <li>Advanced selection (mutual exclusion, marquee)</li>
            <li>Properties panel & Filename editor</li>
            <li>View/Edit modes & Import/Export (C3 + MiniFlow)</li>
        </ul>

        <h3>Stubs (Placeholders):</h3>
        <ul>
            <li>File → New</li>
            <li>File → Open</li>
            <li>File → Save As</li>
        </ul>
        
        <h3>Developer Contact</h3>
		<p><em>
			🔗 <a href="https://www.reddit.com/user/famstudios/submitted/" target="_blank">Follow on Reddit</a><br>
			🔗 <a href="https://t.me/+RzFhrTe9XYAxZjhi" target="_blank">Join Telegram Channel</a><br>
			✉️ famstudiogames@gmail.com
		</em></p>
    `
};