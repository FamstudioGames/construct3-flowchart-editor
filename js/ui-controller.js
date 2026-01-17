import { FlowchartEditor } from './editor-core.js';

// --- INITIALIZATION ---
const app = new FlowchartEditor('canvas');

// Привязка событий, которые в оригинале были в методе init()
window.addEventListener('resize', () => { 
    app.resize(); 
    app.render(); 
});

// --- CANVAS EVENTS ---
const c = app.canvas;

c.addEventListener('mousedown', e => app.handleInput('down', e));
c.addEventListener('mousemove', e => app.handleInput('move', e));
c.addEventListener('mouseup', e => app.handleInput('up', e));
c.addEventListener('mouseleave', () => { 
    app.state.dragging = false; 
    app.state.dragNode = null; 
});

// --- ZOOM LOGIC (from monolithic bindEvents) ---
c.addEventListener('wheel', e => {
    if (e.ctrlKey) {
        e.preventDefault();
        
        const rect = c.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // 1. Координаты мира под курсором ДО зума
        const worldX = (mx - app.view.panX) / app.view.zoom;
        const worldY = (my - app.view.panY) / app.view.zoom;

        // 2. Новый зум (используем конфиг через app, если нужно, или фиксированные значения как в оригинале)
        const stepIn = 1.1;
        const stepOut = 0.9;
        const minZ = 0.05;
        const maxZ = 2;

        const f = e.deltaY > 0 ? stepOut : stepIn;
        const newZoom = Math.max(minZ, Math.min(maxZ, app.view.zoom * f));

        // 3. Новый Pan
        app.view.panX = mx - worldX * newZoom;
        app.view.panY = my - worldY * newZoom;
        app.view.zoom = newZoom;

        document.getElementById('zoom-level').textContent = Math.round(app.view.zoom * 100) + '%';
        app.render();
    }
});

// --- CONTEXT MENU ---
c.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (app.state.mode === 'edit') app.showContextMenu(e);
});

document.addEventListener('click', () => {
    const ctxMenu = document.getElementById('context-menu');
    if (ctxMenu) ctxMenu.classList.remove('active');
});

// --- KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', e => {
    // 1. SPACE (PAN MODE)
    if (e.code === 'Space' && !e.repeat && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        app.state.isSpacePressed = true;
        app.canvas.style.cursor = 'grab';
        return; 
    }

    const targetTag = e.target.tagName;
    const isInputActive = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || e.target.isContentEditable;

    // 2. DELETE, BACKSPACE
    if (e.code === 'Delete' || e.code === 'Backspace') {
        if (!isInputActive && app.state.mode === 'edit') {
            if (e.code === 'Backspace') e.preventDefault();
            app.deleteSelection();
        }
    }

    // 3. ESCAPE
    if (e.code === 'Escape') {
        const modal = document.getElementById('help-modal');
        if (modal && modal.classList.contains('active')) {
            modal.classList.remove('active');
            return;
        }
        
        if (app.state.mode === 'edit') {
            app.selectSingle(null);
            app.state.selectionType = 'none';
            app.render();
        }
    }

    if (isInputActive) return;

    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    // --- SAVE / SAVE AS (Project .flowproj) ---
    if (isCtrl && e.code === 'KeyS') {
        e.preventDefault();
        if (isShift) app.projectSaveAs();
        else app.projectSave();
    }

    // 5. COPY (Ctrl+C)
    if (isCtrl && e.code === 'KeyC') {
        if (app.state.mode === 'edit' && app.state.selection.length > 0) {
            app.copyNode(); 
        }
    }

    // 6. PASTE (Ctrl+V)
    if (isCtrl && e.code === 'KeyV') {
        if (app.state.mode === 'edit' && app.clipboard) {
            const rect = app.canvas.getBoundingClientRect();
            const mx = app.state.lastMouse.x - rect.left;
            const my = app.state.lastMouse.y - rect.top;
            app.pasteNode(mx, my);
        }
    }

    // 7. UNDO (Ctrl+Z или Cmd+Z)
    if (isCtrl && e.code === 'KeyZ' && !isShift) {
        e.preventDefault();
        app.history.undo();
        return; // Важно, чтобы не сработал Redo ниже
    }
    
    // 8. REDO (Ctrl+Shift+Z или Cmd+Shift+Z или Ctrl+Y)
    if (isCtrl && ((e.code === 'KeyZ' && isShift) || e.code === 'KeyY')) {
        e.preventDefault();
        app.history.redo();
        return;
    }

    // 9. EXPORT
    if (isCtrl && e.code === 'KeyE') {
        e.preventDefault();
        if (isShift) {
            if (app.data.flowchart) app.exportMiniFlow();
        } else {
            app.exportC3();
        }
    }
});

document.addEventListener('keyup', e => {
    if (e.code === 'Space') {
        app.state.isSpacePressed = false;
        app.canvas.style.cursor = 'default';
        if (app.state.dragging) app.state.dragging = false; 
    }
});

// Очистка буфера при копировании текста
document.addEventListener('copy', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        app.clipboard = null;
    }
});

// --- MENU DROPDOWN LOGIC ---
document.querySelectorAll('.menu-item').forEach(m => {
    m.addEventListener('click', e => {
        const drop = m.querySelector('.dropdown');
        if(drop) {
            const wasActive = drop.style.display === 'block';
            document.querySelectorAll('.dropdown').forEach(d => d.style.display = 'none');
            if(!wasActive) drop.style.display = 'block';
            e.stopPropagation();
        }
    });
});

document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown').forEach(d => d.style.display = 'none');
});

// --- FILENAME EDITING LOGIC (from monolithic class method) ---
const bindFilenameEvents = () => {
    const display = document.getElementById('filename-display');
    if (!display) return;
    
    display.onclick = () => {
        if (!app.data.flowchart) return;
        if (display.querySelector('input')) return;

        const currentName = app.data.flowchart.name || 'flowchart';
        const input = document.createElement('input');
        input.id = 'filename-input';
        input.value = currentName;
        
        const save = () => {
            let val = input.value.trim();
            val = val.replace(/[^a-zA-Z0-9_\-\sа-яА-Я]/g, '_');
            if (!val) val = 'flowchart';
            app.data.flowchart.name = val;
            display.textContent = val;
        };

        input.onblur = save;
        input.onkeydown = (e) => {
            e.stopPropagation(); 
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') display.textContent = currentName; 
        };

        display.textContent = '';
        display.appendChild(input);
        input.focus();
        input.select();
    };
};
bindFilenameEvents();

// --- FILE OPERATIONS HANDLERS ---
const fileInputC3 = document.getElementById('file-input');
fileInputC3.onchange = async (e) => {
    const files = Array.from(e.target.files);
    const jFile = files.find(f => f.name.endsWith('.json') && !f.name.endsWith('.uistate.json'));
    const uFile = files.find(f => f.name.endsWith('.uistate.json'));
    
    if (jFile && uFile) {
        try {
            const jData = JSON.parse(await jFile.text());
            const uData = JSON.parse(await uFile.text());
            
            app.load(jData, uData, jFile.name, true); 
            
            document.getElementById('status-bar').textContent = `Imported ${jData.nodes.length} nodes into project`;
        } catch(err) { 
            alert("Error parsing JSON: " + err.message); 
        }
    } else {
        alert("Please select both .json and .uistate.json files");
    }
    e.target.value = ''; 
};

const fileInputMini = document.getElementById('file-input-mini');
fileInputMini.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const json = JSON.parse(text);
        app.importMiniFlow(json);
    } catch (err) {
        alert("Error reading MiniFlow file: " + err.message);
    }
    e.target.value = ''; 
};

// --- MENU BAR ACTIONS ---
document.getElementById('btn-new').onclick = () => {
    if(confirm("Create new project? Current unsaved changes will be lost.")) {
        location.reload(); // Простой сброс стейта
    }
};

document.getElementById('btn-open').onclick = () => app.projectOpen();
document.getElementById('btn-save-stub').onclick = () => app.projectSave();
    document.getElementById('btn-save-as-stub').onclick = () => app.projectSaveAs();

document.getElementById('btn-import-c3').onclick = () => fileInputC3.click();
document.getElementById('btn-import-mini').onclick = () => fileInputMini.click();

document.getElementById('btn-export-mini').onclick = () => {
    if (!app.data.flowchart) return alert("No flowchart to export");
    app.exportMiniFlow();
};

document.getElementById('btn-export-c3').onclick = () => {
    if (!app.data.flowchart) return alert("No flowchart data to export");
    app.exportC3();
};

document.getElementById('btn-toggle-mode').onclick = () => {
    if (app.state.mode === 'view') app.setMode('edit');
    else {
        app.rebuildConnectivity();
        app.setMode('view');
        document.getElementById('status-bar').textContent = 'Changes Saved locally (Memory)';
    }
};

document.getElementById('btn-cancel-edit').onclick = () => {
    app.data.flowchart = app.data.original; 
    app.setMode('view');
};

// --- EDIT MENU ACTIONS (Undo / Redo) ---
const btnUndo = document.getElementById('btn-undo');
if (btnUndo) {
    btnUndo.onclick = () => app.history.undo();
}

const btnRedo = document.getElementById('btn-redo');
if (btnRedo) {
    btnRedo.onclick = () => app.history.redo();
}

document.getElementById('btn-reset-view').onclick = () => app.resetView();

// Help Modal Dispatcher
document.querySelectorAll('[data-help]').forEach(item => {
    item.onclick = () => app.openHelp(item.getAttribute('data-help'));
});

const closeBtn = document.getElementById('modal-close-btn');
if (closeBtn) {
    closeBtn.onclick = () => document.getElementById('help-modal').classList.remove('active');
}

document.getElementById('help-modal').onclick = (e) => {
    if (e.target.id === 'help-modal') e.target.classList.remove('active');
};

// --- TOOLBAR ACTIONS ---
document.getElementById('tool-add-node').onclick = () => app.addNode(app.canvas.width/2, app.canvas.height/2);

// Кнопка Delete node на тулбаре
document.getElementById('tool-del-node').onclick = () => {
    // Проверка на вшивость: есть ли в выделении хоть один живой объект
    const hasLiveObjects = app.state.selection.some(obj => {
        if (app.state.selectionType === 'node') return app.data.flowchart.nodes.includes(obj);
        if (app.state.selectionType === 'connection') return app.data.flowchart.nodes.includes(obj.sourceNode);
        return false;
    });

    if (hasLiveObjects) {
        app.deleteSelection();
    } else {
        app.selectSingle(null);
    }
};

// Кнопка Add Output на тулбаре
document.getElementById('tool-add-out').onclick = () => {
    if (app.state.selectionType === 'node' && app.state.selection.length === 1) {
        const btn = document.getElementById('prop-add-out');
        if (btn) btn.click();
    }
};

// Кнопка Enable/Disable на тулбаре
document.getElementById('tool-enable').onclick = () => { 
    if (app.state.selectionType === 'node' && app.state.selection.length > 0) { 
        // ЗАЩИТА: Проверяем, что выделенные объекты реально существуют в текущем проекте
        const validNodes = app.state.selection.filter(n => app.data.flowchart.nodes.includes(n));
        
        if (validNodes.length === 0) {
            app.selectSingle(null); // Принудительная очистка "призраков"
            return;
        }

        const count = validNodes.length;
        const newState = !validNodes[0].e; 
        
        validNodes.forEach(node => {
            node.e = newState;
        });
        
        const actionLabel = newState ? "Enable" : "Disable";
        const historyName = count > 1 ? `${actionLabel} (${count} nodes)` : actionLabel;

        app.history.execute(`Toggle node option: ${historyName}`);
        if (count === 1) app.generateProperties(validNodes[0]); 
        app.render(); 
    }
};

// Кнопка Set Start на тулбаре
document.getElementById('tool-start').onclick = () => { 
    if (app.state.selectionType === 'node' && app.state.selection.length === 1) { 
        const node = app.state.selection[0];
        app.data.flowchart.nodes.forEach(n => n.s = false); 
        node.s = true; 
        
        app.history.execute("Toggle node option: Set start");
        app.generateProperties(node); 
        app.render(); 
    }
};

// Инициализируем состояние кнопок истории
app.history.updateUI();

// Исправление для того, чтобы подменю истории не закрывалось при клике на него
const historySubmenu = document.getElementById('history-submenu');
if (historySubmenu) {
    historySubmenu.addEventListener('click', (e) => {
        e.stopPropagation(); // Предотвращаем закрытие основного меню при выборе шага истории
    });
}

// Экспортируем app для доступа из консоли или других скриптов (опционально)
window.editorApp = app;