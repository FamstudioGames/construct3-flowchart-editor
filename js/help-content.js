const HELP_CONTENTS = {
    "getting-started": `
        <h2>Getting Started</h2>
        <p>Flowchart Editor is a node-based visual editor for creating dialogs, quests, and state machines. By default, the editor opens in <strong>View Mode</strong> to prevent accidental changes.</p>
        
        <div style="background: rgba(0, 120, 212, 0.1); border-left: 4px solid #0078d4; padding: 12px; margin: 15px 0; border-radius: 0 4px 4px 0;">
            Click the <span style="color: #ff9800;">"Enter Edit Mode"</span> button in the top menu to start creating, moving, and connecting nodes.
        </div>

        <h3>Typical Workflow</h3>
        <ol>
            <li>Enable <strong>Edit Mode</strong>.</li>
            <li>Create nodes (Toolbar or <strong>Right-click</strong> → Add Node).</li>
            <li>Connect nodes by dragging from output dots to node inputs.</li>
            <li>Configure properties.</li>
            <li>Set the <strong>Start Node</strong> via Context Menu.</li>
            <li>Save your work as <code>.flowproj</code> or Export for your engine.</li>
        </ol>

        <p>If you see <strong>(Unsaved)</strong> in the title bar, click it to give your project a name before saving.</p>
    `,

"controls": `
    <h2>Controls & Shortcuts</h2>
    
    <p>Efficient workflow relies on mastering key bindings. The editor supports a comprehensive Undo/Redo history stack accessible via Edit menu.</p>

    <h3>Navigation & Viewport</h3>
    <table>
        <tr><th>Input</th><th>Action</th></tr>
        <tr><td><kbd>Space</kbd> + LMB Drag</td><td>Pan canvas view</td></tr>
        <tr><td><kbd>MMB</kbd> Drag</td><td>Pan canvas view</td></tr>
        <tr><td><kbd>Ctrl</kbd> + <kbd>Wheel</kbd></td><td>Zoom in/out</td></tr>
    </table>

    <h3>Editing</h3>
    <table>
        <tr><th>Key</th><th>Action</th></tr>
        <tr><td><kbd>Ctrl</kbd> + <kbd>Z</kbd></td><td>Undo last action</td></tr>
        <tr><td><kbd>Ctrl</kbd> + <kbd>Y</kbd></td><td>Redo reverted action</td></tr>
        <tr><td><kbd>Ctrl</kbd> + <kbd>C</kbd></td><td>Copy selected nodes</td></tr>
        <tr><td><kbd>Ctrl</kbd> + <kbd>V</kbd></td><td>Paste copied nodes</td></tr>
        <tr><td><kbd>Delete</kbd></td><td>Delete selection (nodes or connections)</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Deselect all / Cancel operation</td></tr>
        <tr><td><kbd>Enter</kbd></td><td>Confirm text editing</td></tr>
    </table>

    <h3>File Operations</h3>
    <table>
        <tr><th>Key</th><th>Action</th></tr>
        <tr><td><kbd>Ctrl</kbd> + <kbd>N</kbd></td><td>New project</td></tr>
        <tr><td><kbd>Ctrl</kbd> + <kbd>O</kbd></td><td>Open project</td></tr>
        <tr><td><kbd>Ctrl</kbd> + <kbd>S</kbd></td><td>Save project</td></tr>
        <tr><td><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd></td><td>Save as</td></tr>
        <tr><td><kbd>Ctrl</kbd> + <kbd>E</kbd></td><td>Export Construct 3 format</td></tr>
        <tr><td><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>E</kbd></td><td>Export MiniFlow format</td></tr>
    </table>

    <h3>Mouse Controls</h3>
    <ul>
        <li><strong>LMB Click</strong> — Select node or connection</li>
        <li><strong>LMB Drag (Node)</strong> — Move selected nodes</li>
        <li><strong>LMB Drag (Output)</strong> — Create new connection</li>
        <li><strong>LMB Drag (Canvas)</strong> — Box selection (marquee)</li>
        <li><strong>Shift + LMB</strong> — Add/remove from selection</li>
        <li><strong>RMB</strong> — Open context menu (Edit mode only)</li>
    </ul>

    <h3>Smart Behaviors</h3>
    <ul>
        <li><strong>Cascade Creation:</strong> Nodes created via Toolbar are automatically offset in a staircase pattern until camera is moved</li>
        <li><strong>Group Operations:</strong> Enable/Disable multiple selected nodes at once via Toolbar or Context Menu</li>
        <li><strong>Auto-Truncation:</strong> Long output values are automatically shortened with "..." to keep the graph readable</li>
    </ul>
`,

    "import-export": `
        <h2>File Formats</h2>
        
        <p>The editor supports multiple formats for different workflows. Choose the format that best fits your pipeline.</p>
        
        <h3>Native Format (.flowproj)</h3>
        <p><strong>Recommended for:</strong> Saving your work between sessions</p>
        <p>This format preserves the complete editor state, including:</p>
        <ul>
            <li>Visual layout and viewport position</li>
            <li>Undo/Redo history stack</li>
            <li>Selection states and node properties</li>
            <li>All metadata and custom fields</li>
        </ul>

        <h3>Construct 3 Format</h3>
        <p><strong>Recommended for:</strong> Integration with Construct 3 game engine</p>
        <p>Each flowchart consists of two files:</p>
        <ul>
            <li><code>.json</code> — Core data file. Uses numeric SID (System ID) for nodes and outputs to define logic and structure</li>
            <li><code>.uistate.json</code> — Visual state file. Stores node positions, zoom levels, and metadata for Construct 3 editor integration</li>
        </ul>
        <p><strong>Import:</strong> Select both files when prompted to preserve visual layout</p>
        <p><strong>Export:</strong> Automatically generates both files</p>

        <h3>MiniFlow Format</h3>
        <p><strong>Recommended for:</strong> Custom parsers and lightweight integration</p>
        <p><strong>Format:</strong> Single JSON file with simplified structure</p>
        <p><strong>Import:</strong> Automatically applies BFS-based auto-layout</p>
        <p><strong>Export:</strong> Generates human-readable node IDs</p>
        
        <div class="info-box">
            <p><strong>Note:</strong> MiniFlow format stores only the logical graph structure. Visual states (enabled/disabled, colors, exact positions) are not preserved.</p>
        </div>
    `,

    "formats": `
        <h2>Format Specifications</h2>
        
        <h3>MiniFlow Format</h3>
        <p>MiniFlow is a topology-first format designed for simplicity and human readability.</p>
        
        <h4>Design Principles</h4>
        <ul>
            <li>Stores only functional graph structure</li>
            <li>Uses human-readable node identifiers</li>
            <li>No visual metadata (positions, colors, states)</li>
        </ul>

        <h4>Structure Example</h4>
<pre><code>{
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
    },
    "quest_accept": {
      "caption": "Quest Accepted",
      "tag": "n_action",
      "outputs": [
        { "name": "Next", "next": null }
      ]
    }
  }
}</code></pre>

        <h3>Construct 3 Format</h3>
        <p>Native Construct 3 flowchart format with full engine compatibility.</p>
        <ul>
            <li>Uses numeric SID (System ID) for nodes and outputs</li>
            <li>Stores visual layout in separate <code>.uistate.json</code></li>
            <li>Includes metadata for Construct 3 editor integration</li>
        </ul>
        
        <h3>Conversion Notes</h3>
        <ul>
            <li><strong>MiniFlow → C3:</strong> Generates unique SIDs, applies auto-layout via BFS algorithm</li>
            <li><strong>C3 → MiniFlow:</strong> Converts SIDs to readable names (e.g., <code>quest_start_2</code>)</li>
        </ul>

        <h3>External Resources</h3>
        <ul>
            <li><a href="https://www.construct.net/en/make-games/manuals/construct-3/project-primitives/flowcharts" target="_blank">Construct 3 Flowchart Documentation</a></li>
        </ul>
    `,

    "about": `
        <h2>About / Feedback</h2>
        <p><strong>Version:</strong> 1.0</p>
        
        <h3>Implemented Features:</h3>
        <ul>
            <li>Node management (create, move, resize, enable/disable)</li>
            <li>Connection system (Bezier curves, drag-to-connect)</li>
            <li>Advanced selection (mutual exclusion, marquee)</li>
            <li>Properties panel & Filename editor</li>
            <li>View/Edit modes & Import/Export (C3 + MiniFlow)</li>
        </ul>
        
        <h3>Support Development</h3>
        <p>If this tool speeds up your workflow, consider supporting future updates.</p>
        
        <p>
            <a href="https://famstudiogames.itch.io/advanced-flowchart-editor-for-construct-3/donate" 
            class="button-donate" 
            target="_blank" 
            rel="noopener noreferrer"
            style="
                    display: inline-block;
                    background-color: #ff4757;
                    color: white;
                    padding: 10px 20px;
                    text-decoration: none;
                    border-radius: 4px;
                    font-weight: bold;
                    margin-top: 10px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            ">♥ Donate $3</a>
        </p>

        <h3>Developer Contact</h3>
		<p><em>
			🔗 <a href="https://www.reddit.com/user/famstudios/submitted/" target="_blank">Follow on Reddit</a><br>
			🔗 <a href="https://t.me/+RzFhrTe9XYAxZjhi" target="_blank">Join Telegram Channel</a><br>
			✉️ famstudiogames@gmail.com
		</em></p>
    `
};

// Инициализация модального окна помощи
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('help-modal');
    const closeBtn = document.getElementById('modal-close-btn');
    const helpContent = document.getElementById('help-content');
    const helpMenuItems = document.querySelectorAll('.help-menu-item');
    const helpDropdownItems = document.querySelectorAll('#helpDropdown .dropdown-item[data-help]');

    // Функция загрузки контента
    function loadHelpContent(section) {
        if (HELP_CONTENTS[section]) {
            helpContent.innerHTML = HELP_CONTENTS[section];
            helpContent.scrollTop = 0;
            
            // Обновить активный пункт меню
            helpMenuItems.forEach(item => {
                if (item.dataset.help === section) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        }
    }

    // Открытие модального окна из Help меню
    helpDropdownItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.help;
            loadHelpContent(section);
            modal.classList.add('active');
            
            // Закрыть dropdown меню
            document.querySelectorAll('.dropdown').forEach(d => d.style.display = 'none');
        });
    });

    // Навигация внутри модального окна
    helpMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.help;
            loadHelpContent(section);
        });
    });

    // Закрытие модального окна
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('active');
        });
    }

    // Закрытие по клику вне модального окна
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });

    // Загрузить первую секцию по умолчанию
    loadHelpContent('getting-started');
});