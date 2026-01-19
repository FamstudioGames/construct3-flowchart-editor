import { CONFIG, Utils } from './config.js';

class CommandManager {
    constructor(editor) {
        this.editor = editor;
        this.undoStack = []; 
        this.index = -1;     
        this.limit = 50;
        this.isRestoring = false;
    }

    // Инициализация начального состояния
    saveInitialState() {
        const snapshot = JSON.stringify({
            flowchart: this.editor.data.flowchart,
            ui: this.editor.data.ui
        });
        this.undoStack = [{ name: "Empty Canvas", snapshot, timestamp: Date.now() }];
        this.index = 0;
        this.updateUI();
        this.updateHistoryMenu();
    }

    execute(name) {
        if (this.isRestoring) return;

        // Если мы в прошлом и делаем новое действие — обрезаем "будущее"
        if (this.index < this.undoStack.length - 1) {
            this.undoStack = this.undoStack.slice(0, this.index + 1);
        }

        // Снимок состояния ПОСЛЕ изменения данных
        const snapshot = JSON.stringify({
            flowchart: this.editor.data.flowchart,
            ui: this.editor.data.ui
        });

        this.undoStack.push({ name, snapshot, timestamp: Date.now() });
        
        if (this.undoStack.length > this.limit) {
            this.undoStack.shift();
        } else {
            this.index++;
        }

        this.updateUI();
        this.updateHistoryMenu();
    }

    undo() {
        if (this.index <= 0) return;
        this.index--;
        this.restore(this.undoStack[this.index].snapshot);
        this.updateUI();
        this.updateHistoryMenu();
    }

    redo() {
        if (this.index >= this.undoStack.length - 1) return;
        this.index++;
        this.restore(this.undoStack[this.index].snapshot);
        this.updateUI();
        this.updateHistoryMenu();
    }

    restoreToStep(index) {
        if (index < 0 || index >= this.undoStack.length) return;
        this.index = index;
        this.restore(this.undoStack[this.index].snapshot);
        this.updateUI();
        this.updateHistoryMenu();
    }

    restore(json) {
        this.isRestoring = true;
        try {
            const data = JSON.parse(json);
            
            // 1. Запоминаем SID-ы того, что БЫЛО выделено
            const selectedSids = this.editor.state.selection
                .map(n => n.sid || (n.output ? n.output.sid : null))
                .filter(sid => sid !== null);
            
            const prevType = this.editor.state.selectionType;

            // 2. Обновляем данные (глубокое копирование)
            this.editor.data.flowchart = JSON.parse(JSON.stringify(data.flowchart));
            this.editor.data.ui = JSON.parse(JSON.stringify(data.ui));
            
            this.editor.rebuildConnectivity();

            // 3. СИНХРОНИЗАЦИЯ ВЫДЕЛЕНИЯ: ищем те же объекты в новых данных
            if (prevType === 'node' && this.editor.data.flowchart.nodes) {
                this.editor.state.selection = this.editor.data.flowchart.nodes.filter(n => 
                    selectedSids.includes(n.sid)
                );
            } else if (prevType === 'connection') {
                // Для связей: собираем массив объектов {output, sourceNode} из новых данных
                const newSelection = [];
                this.editor.data.flowchart.nodes.forEach(n => {
                    n.outputs?.forEach(out => {
                        if (selectedSids.includes(out.sid)) {
                            newSelection.push({ output: out, sourceNode: n });
                        }
                    });
                });
                this.editor.state.selection = newSelection;
            }

            // 4. Если после восстановления ничего не нашлось — сбрасываем тип
            if (this.editor.state.selection.length === 0) {
                this.editor.state.selectionType = 'none';
            }

            this.editor.render();
            
            // 5. КРИТИЧНО: Обновляем интерфейс, чтобы кнопки заблокировались, если выделение пустое
            this.editor.updateUI(); 

        } catch (e) {
            console.error("Restore failed:", e);
        } finally {
            this.isRestoring = false;
        }
    }

    updateUI() {
        const btnUndo = document.getElementById('btn-undo');
        const btnRedo = document.getElementById('btn-redo');
        const status = document.getElementById('status-bar'); // Находим статус-бар

        if (btnUndo) btnUndo.classList.toggle('disabled', this.index <= 0);
        if (btnRedo) btnRedo.classList.toggle('disabled', this.index >= this.undoStack.length - 1);

        // ОБНОВЛЕНИЕ ТЕКСТА
        if (status) {
            if (this.index >= 0 && this.undoStack[this.index]) {
                // Показываем название текущего шага истории
                status.textContent = `Last action: ${this.undoStack[this.index].name}`;
            } else {
                status.textContent = "Ready";
            }
        }
    }

    updateHistoryMenu() {
        const historyMenu = document.getElementById('history-submenu');
        if (!historyMenu) return;
        historyMenu.innerHTML = '';
        
        [...this.undoStack].reverse().forEach((cmd, revIdx) => {
            const actualIdx = this.undoStack.length - 1 - revIdx;
            const item = document.createElement('div');
            item.className = 'history-step' + (actualIdx === this.index ? ' active' : '');
            
            const time = new Date(cmd.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            item.innerHTML = `<span>${cmd.name}</span><span class="history-time">${time}</span>`;
            
            item.onclick = (e) => {
                e.stopPropagation();
                this.restoreToStep(actualIdx);
            };
            historyMenu.appendChild(item);
        });
    }

    clear() {
        this.undoStack = [];
        this.index = -1;
        this.saveInitialState();
    }

    executeDebounced(name, delay = 1000) {
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this.execute(name);
        }, delay);
    }
}

export class FlowchartEditor {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        this.data = { 
            flowchart: { name: "", nodes: [] }, 
            ui: { nodes: [] }, 
            original: null 
        };
        // 1. Устанавливаем фактический зум 50%
        this.view = { zoom: 0.5, panX: 0, panY: 0 };
        
        // 2. СИНХРОНИЗИРУЕМ ИНТЕРФЕЙС: обновляем текст в кружочке зума при старте
        const zoomDisplay = document.getElementById('zoom-level');
        if (zoomDisplay) zoomDisplay.textContent = '50%';
        
        this.state = {
            mode: 'view', dragging: false, lastMouse: { x: 0, y: 0 },
            selection: [], selectionType: 'none', selectedOutput: null, 
            dragNode: null, dragOffset: null, 
            connectionStart: null,
            hover: { node: null, output: null, connection: null },
            resizing: false, resizeTarget: null, resizeDir: null,
            marqueeStart: null, marqueeCurrent: null, isSpacePressed: false,
            hasMovedDuringDrag: false,
            toolbarCreateCount: 0 // Счётчик последовательных созданий через тулбар
        };
        
        this.clipboard = null; 
        this.resize();
        this.history = new CommandManager(this);
        this.fileHandle = null; 

        setTimeout(() => this.history.saveInitialState(), 0);
        this.render();
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;
    }

    // --- INPUT HANDLING (LOGIC) ---

    handleInput(type, e) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // --- 1. MOUSE DOWN ---
        if (type === 'down') {
            if (this.state.mode === 'edit') this.state.hasMovedDuringDrag = false;

            // Средняя кнопка или Пробел + ЛКМ = Панорамирование
            if (e.button === 1 || (e.button === 0 && this.state.isSpacePressed)) {
                this.state.dragging = true;
                this.state.lastMouse = { x: e.clientX, y: e.clientY };
                this.canvas.style.cursor = 'grabbing';
                return; 
            }

            if (e.button !== 0 || this.state.mode !== 'edit') return;

            // Хит-тесты
            let hitNode = this.hitTestNode(mx, my);
            let hitOut = null;
            for (let i = this.data.flowchart.nodes.length - 1; i >= 0; i--) {
                const res = this.hitTestOutput(this.data.flowchart.nodes[i], mx, my);
                if (res) { hitOut = res; hitNode = this.data.flowchart.nodes[i]; break; }
            }

            // Нажатие на выход (создание связи)
            if (hitNode && hitOut) {
                this.state.connectionStart = { node: hitNode, output: hitOut.output };
                this.state.lastMouse = { x: e.clientX, y: e.clientY }; 
                this.render(); return; 
            }

            // Нажатие на связь
            const hitConn = this.hitTestConnection(mx, my);
            if (hitConn) {
                if (this.state.selectionType === 'node') this.selectSingle(null);
                this.state.selectionType = 'connection';
                if (e.shiftKey) {
                    const idx = this.state.selection.findIndex(x => x.output === hitConn.output);
                    if (idx >= 0) this.state.selection.splice(idx, 1);
                    else this.state.selection.push(hitConn);
                } else {
                    if (!this.isSelectedConnection(hitConn.output)) this.state.selection = [hitConn];
                }
                this.updateUI(); this.render(); return;
            }

            // Нажатие на зону ресайза
            const resizeHit = this.hitTestResize(mx, my);
            if (resizeHit) {
                if (!this.isSelected(resizeHit.node)) this.selectSingle(resizeHit.node);
                this.state.resizing = true;
                this.state.resizeTarget = resizeHit.node;
                this.state.resizeDir = resizeHit.dir;
                this.state.lastMouse = { x: e.clientX, y: e.clientY };
                return; 
            }

            // Нажатие на ноду (перетаскивание)
            if (hitNode) {
                if (this.state.selectionType === 'connection') this.state.selection = [];
                this.state.selectionType = 'node';
                if (e.shiftKey) {
                    this.toggleSelection(hitNode);
                    this.state.dragNode = this.isSelected(hitNode) ? hitNode : null;
                } else {
                    if (!this.isSelected(hitNode)) this.selectSingle(hitNode);
                    this.state.dragNode = hitNode;
                }
                const wp = Utils.screenToWorld(mx, my, this.view.panX, this.view.panY, this.view.zoom);
                this.state.dragStartWorld = { x: wp.x, y: wp.y }; 
            } else if (!this.state.isSpacePressed) {
                // Рамка выделения
                if (!e.shiftKey) { this.selectSingle(null); this.state.selectionType = 'none'; }
                this.state.marqueeStart = { x: mx, y: my };
                this.state.marqueeCurrent = { x: mx, y: my };
            }
            this.render();
            this.state.lastMouse = { x: e.clientX, y: e.clientY };
        } 
        
        // --- 2. MOUSE MOVE ---
        else if (type === 'move') {
            // Панорамирование
            if (this.state.dragging) {
                this.state.toolbarCreateCount = 0;
                this.view.panX += e.clientX - this.state.lastMouse.x;
                this.view.panY += e.clientY - this.state.lastMouse.y;
                this.canvas.style.cursor = 'grabbing';
                this.state.lastMouse = { x: e.clientX, y: e.clientY };
                this.render(); return;
            }

            // Активный ресайз
            if (this.state.resizing && this.state.resizeTarget) {
                this.state.hasMovedDuringDrag = true;
                const dx = (e.clientX - this.state.lastMouse.x) / this.view.zoom;
                const dy = (e.clientY - this.state.lastMouse.y) / this.view.zoom;
                
                this.state.selection.forEach(node => {
                    const min = this.getMinNodeSize(node);
                    if (this.state.resizeDir === 'w') { 
                        const oldW = node.w; 
                        node.w = Math.max(min.w, oldW + dx); 
                        node.x += (node.w - oldW) / 2; 
                    }
                    else if (this.state.resizeDir === 'h') { 
                        const oldH = node.h; 
                        node.h = Math.max(min.h, oldH + dy); 
                        node.y += (node.h - oldH) / 2; 
                    }
                });
                
                this.canvas.style.cursor = (this.state.resizeDir === 'w') ? 'ew-resize' : 'ns-resize';
                this.state.lastMouse = { x: e.clientX, y: e.clientY }; 
                this.render(); return;
            }

            // Создание связи
           if (this.state.connectionStart) {
                this.canvas.style.cursor = 'crosshair';
                // ИСПРАВЛЕНО: Обновляем координаты, чтобы render() видел актуальное положение мыши
                this.state.lastMouse = { x: e.clientX, y: e.clientY }; 
                
                this.state.hover.node = this.hitTestNode(mx, my);
                if (this.state.hover.node === this.state.connectionStart.node) this.state.hover.node = null;
                
                this.render(); 
                return;
            }

            // Рамка выделения
            if (this.state.marqueeStart) { 
                this.state.marqueeCurrent = { x: mx, y: my }; 
                this.render(); return; 
            }

            // Перетаскивание нод
            if (this.state.dragNode) {
                this.state.hasMovedDuringDrag = true;
                const wp = Utils.screenToWorld(mx, my, this.view.panX, this.view.panY, this.view.zoom);
                const dx = wp.x - this.state.dragStartWorld.x;
                const dy = wp.y - this.state.dragStartWorld.y;
                this.state.selection.forEach(node => { node.x += dx; node.y += dy; });
                this.state.dragStartWorld = wp;
                this.canvas.style.cursor = 'grabbing';
                this.state.lastMouse = { x: e.clientX, y: e.clientY };
                this.render(); return;
            }

            // ЛОГИКА КУРСОРОВ ПРИ НАВЕДЕНИИ
            if (this.state.mode === 'edit') {
                let hitNode = this.hitTestNode(mx, my);
                let hitOut = null;
                for (let i = this.data.flowchart.nodes.length - 1; i >= 0; i--) {
                    const res = this.hitTestOutput(this.data.flowchart.nodes[i], mx, my);
                    if (res) { hitOut = res; hitNode = this.data.flowchart.nodes[i]; break; }
                }

                this.state.hover.node = hitNode;
                this.state.hover.output = hitOut;
                this.state.hover.connection = (!hitNode) ? this.hitTestConnection(mx, my) : null;

                if (hitOut || this.state.hover.connection) {
                    this.canvas.style.cursor = 'pointer';
                } else if (hitNode) {
                    const resizeHit = this.hitTestResize(mx, my);
                    if (resizeHit) {
                        this.canvas.style.cursor = (resizeHit.dir === 'w') ? 'ew-resize' : 'ns-resize';
                    } else {
                        this.canvas.style.cursor = 'grab';
                    }
                } else {
                    this.canvas.style.cursor = this.state.isSpacePressed ? 'grab' : 'default';
                }
                this.render();
            } else {
                this.canvas.style.cursor = this.state.isSpacePressed ? 'grab' : 'default';
            }
            this.state.lastMouse = { x: e.clientX, y: e.clientY };
        } 
        
        // --- 3. MOUSE UP ---
        else if (type === 'up') {
            if (this.state.mode === 'edit') {
                if (this.state.dragNode && this.state.hasMovedDuringDrag) this.history.execute("Move node(s)");
                if (this.state.resizing && this.state.hasMovedDuringDrag) this.history.execute("Resize node");
            }

            if (this.state.marqueeStart) { 
                this.applyMarqueeSelection(e.shiftKey); 
                this.state.marqueeStart = null; 
                this.state.marqueeCurrent = null; 
                this.render(); 
            }

            if (this.state.resizing) { 
                this.state.resizing = false; 
                this.state.resizeTarget = null; 
            }

            if (this.state.connectionStart) {
                let target = this.state.hover.node || this.findClosestNode(mx, my);
                if (target && target !== this.state.connectionStart.node) {
                    this.connect(this.state.connectionStart.node, this.state.connectionStart.output, target);
                }
                this.state.connectionStart = null;
                this.render();
            }
            
            this.state.dragging = false; 
            this.state.dragNode = null; 
            this.state.hasMovedDuringDrag = false;
            this.canvas.style.cursor = this.state.isSpacePressed ? 'grab' : 'default';
        }
    }

    applyMarqueeSelection(isShift) {
        if (!this.state.marqueeStart || !this.state.marqueeCurrent) return;

        // 1. Нормализуем координаты рамки (экранные)
        const x1 = Math.min(this.state.marqueeStart.x, this.state.marqueeCurrent.x);
        const y1 = Math.min(this.state.marqueeStart.y, this.state.marqueeCurrent.y);
        const x2 = Math.max(this.state.marqueeStart.x, this.state.marqueeCurrent.x);
        const y2 = Math.max(this.state.marqueeStart.y, this.state.marqueeCurrent.y);
        const marqueeRect = { left: x1, top: y1, right: x2, bottom: y2 };

        // Игнорируем микро-сдвиги
        if (Math.abs(x2 - x1) < 5 && Math.abs(y2 - y1) < 5) return;

        const candidateNodes = [];
        const candidateConns = [];

        // 2. Поиск НОД в рамке
        this.data.flowchart.nodes.forEach(node => {
            const outputsCount = node.outputs ? node.outputs.length : 0;
            const contentH = CONFIG.dims.headerH + (outputsCount * CONFIG.dims.rowH) + CONFIG.dims.footerH + 10;
            const actualH = Math.max(node.h, contentH);
            
            const tl = Utils.worldToScreen(node.x - node.w/2, node.y - actualH/2, this.view.panX, this.view.panY, this.view.zoom);
            const br = Utils.worldToScreen(node.x + node.w/2, node.y + actualH/2, this.view.panX, this.view.panY, this.view.zoom);
            
            const nodeRect = { left: tl.x, top: tl.y, right: br.x, bottom: br.y };

            if (Utils.isRectOverlap(marqueeRect, nodeRect)) {
                candidateNodes.push(node);
            }
        });

        // 3. Поиск СВЯЗЕЙ в рамке (используем семплирование точек кривой Безье)
        this.data.flowchart.nodes.forEach(node => {
            if (!node.outputs) return;
            node.outputs.forEach((out, idx) => {
                if (out.cnSID && out.enable) {
                    const target = this.data.flowchart.nodes.find(n => n.sid === out.cnSID);
                    if (target) {
                        const pStart = this.getOutputPos(node, idx);
                        const pEnd = this.getNodeInputPos(target);

                        // Параметры кривой (соответствуют методу отрисовки drawConnection)
                        const cpDist = Math.abs(pEnd.x - pStart.x) * 0.5;
                        const p0 = pStart;
                        const p1 = { x: pStart.x + cpDist, y: pStart.y };
                        const p2 = { x: pEnd.x - cpDist, y: pEnd.y };
                        const p3 = pEnd;

                        // Семплируем кривую (20 шагов достаточно для точного определения попадания в рамку)
                        let intersects = false;
                        const steps = 20;
                        for (let i = 0; i <= steps; i++) {
                            const t = i / steps;
                            const it = 1 - t;
                            
                            // Формула кубической кривой Безье
                            const x = it*it*it*p0.x + 3*it*it*t*p1.x + 3*it*t*t*p2.x + t*t*t*p3.x;
                            const y = it*it*it*p0.y + 3*it*it*t*p1.y + 3*it*t*t*p2.y + t*t*t*p3.y;

                            // Проверяем, находится ли точка внутри рамки
                            if (x >= marqueeRect.left && x <= marqueeRect.right && 
                                y >= marqueeRect.top && y <= marqueeRect.bottom) {
                                intersects = true;
                                break;
                            }
                        }

                        if (intersects) {
                            candidateConns.push({ output: out, sourceNode: node });
                        }
                    }
                }
            });
        });

        // 4. Логика разрешения конфликтов (Приоритет: Ноды > Связи)
        if (candidateNodes.length > 0) {
            if (this.state.selectionType === 'connection') {
                this.state.selection = [];
                this.state.selectionType = 'node';
            } else if (this.state.selectionType === 'node' && !isShift) {
                this.state.selection = [];
            }
            this.state.selectionType = 'node';

            candidateNodes.forEach(n => {
                if (!this.isSelected(n)) this.state.selection.push(n);
            });
        } 
        else if (candidateConns.length > 0) {
            if (this.state.selectionType === 'node') {
                this.state.selection = [];
                this.state.selectionType = 'connection';
            } else if (this.state.selectionType === 'connection' && !isShift) {
                 this.state.selection = [];
            } else if (this.state.selectionType === 'none') {
                this.state.selectionType = 'connection';
            }

            candidateConns.forEach(cand => {
                const exists = this.state.selection.some(s => s.output === cand.output);
                if (!exists) this.state.selection.push(cand);
            });
        }
        else if (!isShift) {
            this.state.selection = [];
            this.state.selectionType = 'none';
        }

        this.updateUI();
    }

    // --- HIT TESTING ---

    hitTestNode(mx, my) {
    if (!this.data.flowchart || !this.data.flowchart.nodes) return null;
        const wp = Utils.screenToWorld(mx, my, this.view.panX, this.view.panY, this.view.zoom);
        for (let i = this.data.flowchart.nodes.length - 1; i >= 0; i--) {
            const n = this.data.flowchart.nodes[i];
            const outputsCount = n.outputs ? n.outputs.length : 0;
            const contentH = CONFIG.dims.headerH + (outputsCount * CONFIG.dims.rowH) + CONFIG.dims.footerH + 10;
            const actualH = Math.max(n.h, contentH);
            const left = n.x - (n.w / 2);
            const top = n.y - (actualH / 2);
            if (Utils.isPointInRect(wp.x, wp.y, left, top, n.w, actualH)) return n;
        }
        return null;
    }

    hitTestResize(mx, my) {
        if (!this.data.flowchart) return null;
        const margin = CONFIG.dims.resizeMargin;
        for (let i = this.data.flowchart.nodes.length - 1; i >= 0; i--) {
            const n = this.data.flowchart.nodes[i];
            const outputsCount = n.outputs ? n.outputs.length : 0;
            const contentH = CONFIG.dims.headerH + (outputsCount * CONFIG.dims.rowH) + CONFIG.dims.footerH + 10;
            const actualH = Math.max(n.h, contentH);
            const topLeftX = n.x - (n.w / 2);
            const topLeftY = n.y - (actualH / 2);
            const screenPos = Utils.worldToScreen(topLeftX, topLeftY, this.view.panX, this.view.panY, this.view.zoom);
            const screenW = n.w * this.view.zoom;
            const screenH = actualH * this.view.zoom;
            const left = screenPos.x;
            const right = screenPos.x + screenW;
            const top = screenPos.y;
            const bottom = screenPos.y + screenH;
            if (my >= top && my <= bottom && mx >= right - margin && mx <= right + margin) return { node: n, dir: 'w' };
            if (mx >= left && mx <= right && my >= bottom - margin && my <= bottom + margin) return { node: n, dir: 'h' };
        }
        return null;
    }

    hitTestOutput(node, mx, my) {
        if (!node.outputs) return null;
        const outputsCount = node.outputs.length;
        const contentH = CONFIG.dims.headerH + (outputsCount * CONFIG.dims.rowH) + CONFIG.dims.footerH + 10;
        const actualH = Math.max(node.h, contentH);
        const topLeftX = node.x - (node.w / 2);
        const topLeftY = node.y - (actualH / 2);
        const sp = Utils.worldToScreen(topLeftX, topLeftY, this.view.panX, this.view.panY, this.view.zoom);
        const startY = sp.y + CONFIG.dims.headerH * this.view.zoom + (5 * this.view.zoom);
        const dotX = sp.x + node.w * this.view.zoom;
        const r = 25 * this.view.zoom; 
        for (let i = 0; i < node.outputs.length; i++) {
            const dotY = startY + (i * CONFIG.dims.rowH * this.view.zoom) + (CONFIG.dims.rowH * this.view.zoom / 2);
            if (Math.hypot(mx - dotX, my - dotY) < r) return { output: node.outputs[i], index: i };
        }
        return null;
    }

    hitTestConnection(mx, my) {
        if (!this.data.flowchart) return null;
        for (const node of this.data.flowchart.nodes) {
            if (!node.outputs) continue;
            for (let i = 0; i < node.outputs.length; i++) {
                const out = node.outputs[i];
                if (out.cnSID && out.enable) {
                    const target = this.data.flowchart.nodes.find(n => n.sid === out.cnSID);
                    if (target) {
                        const pStart = this.getOutputPos(node, i);
                        const pEnd = this.getNodeInputPos(target);
                        if (Utils.isPointNearBezier(mx, my, pStart, pEnd, 5)) {
                            return { output: out, sourceNode: node };
                        }
                    }
                }
            }
        }
        return null;
    }

    findClosestNode(mx, my) {
        const wp = Utils.screenToWorld(mx, my, this.view.panX, this.view.panY, this.view.zoom);
        let closest = null, minDist = CONFIG.clickThreshold;
        this.data.flowchart.nodes.forEach(n => {
            const d = Utils.dist(wp, { x: n.x + n.w/2, y: n.y + n.h/2 });
            if (d < minDist) { minDist = d; closest = n; }
        });
        return closest;
    }

    getOutputPos(node, idx) {
        const hh = CONFIG.dims.headerH;
        const rh = CONFIG.dims.rowH;
        const fh = CONFIG.dims.footerH;
        const outputsCount = node.outputs ? node.outputs.length : 0;
        const contentH = hh + (outputsCount * rh) + fh + 10;
        const actualH = Math.max(node.h, contentH);
        const topLeftX = node.x - (node.w / 2);
        const topLeftY = node.y - (actualH / 2);
        const topPadding = 5; 
        const worldY = topLeftY + hh + topPadding + (idx * rh) + (rh / 2);
        const worldX = topLeftX + node.w;
        return Utils.worldToScreen(worldX, worldY, this.view.panX, this.view.panY, this.view.zoom);
    }

    getNodeInputPos(node) {
        const worldY = node.y;
        const worldX = node.x - (node.w / 2);
        return Utils.worldToScreen(worldX, worldY, this.view.panX, this.view.panY, this.view.zoom);
    }

    // --- SELECTION HELPERS ---

    selectSingle(node) {
        this.state.selection = node ? [node] : [];
        this.updateUI();
    }

    addToSelection(node) {
        if (!this.state.selection.includes(node)) {
            this.state.selection.push(node);
            this.updateUI();
        }
    }

    removeFromSelection(node) {
        this.state.selection = this.state.selection.filter(n => n !== node);
        this.updateUI();
    }

    toggleSelection(node) {
        if (this.state.selection.includes(node)) {
            this.removeFromSelection(node);
        } else {
            this.addToSelection(node);
        }
    }

    isSelected(node) {
        return this.state.selection.includes(node);
    }

    isSelectedConnection(output) {
        if (this.state.selectionType !== 'connection') return false;
        return this.state.selection.some(item => item.output === output);
    }

    updateUI() {
        const count = this.state.selection.length;
        const panel = document.getElementById('properties-panel');
        const btnDel = document.getElementById('tool-del-node');
        const btnAddOut = document.getElementById('tool-add-out');
        const btnEnable = document.getElementById('tool-enable');
        const btnStart = document.getElementById('tool-start');
        const btnDelOut = document.getElementById('tool-del-out');

        if (count === 0) {
            panel.innerHTML = '<div class="prop-group"><h3>No Selection</h3></div>';
            btnDel.innerHTML = 'Delete ...';
            btnDel.disabled = true;
            btnAddOut.disabled = true;
            btnEnable.disabled = true;
            btnStart.disabled = true;
            btnDelOut.disabled = true;
            btnEnable.innerHTML = 'Enable / Disable';
        } 
        else if (this.state.selectionType === 'connection') {
            const title = count === 1 ? 'Connection Selected' : `Selection (${count} connections)`;
            panel.innerHTML = `<div class="prop-group"><h3>${title}</h3><p style="color:#aaa">Press Delete to remove connection.</p></div>`;
            btnDel.disabled = false;
            btnDel.innerHTML = 'Delete Connection';
            btnAddOut.disabled = true;
            btnEnable.disabled = true;
            btnStart.disabled = true;
            btnDelOut.disabled = true;
        } 
        else if (this.state.selectionType === 'node') {
            btnDel.disabled = false;
            btnDel.innerHTML = count > 1 ? `Delete ${count} Nodes` : 'Delete Node';
            
            // Кнопка Enable теперь доступна и для группы
            btnEnable.disabled = false; 
            btnEnable.innerHTML = count > 1 ? `Enable / Disable (${count})` : 'Enable / Disable';

            if (count === 1) {
                this.generateProperties(this.state.selection[0]);
                btnAddOut.disabled = false;
                btnStart.disabled = false;
            } else {
                panel.innerHTML = `<div class="prop-group"><h3>Multiple Selection (${count} items)</h3><p style="color:#aaa">Properties editing is disabled for multiple items.</p></div>`;
                btnAddOut.disabled = true;
                btnStart.disabled = true; // "Стартовой" может быть только одна нода, оставляем заблокированным
                btnDelOut.disabled = true;
            }
        }
    }

    // --- LOGIC & CRUD ---

    connect(source, output, target) {
        output.cnSID = target.sid;
        this.history.execute("Connect nodes"); // запомнили действие
    }

    select(node) {
        this.state.selection.node = node;
        const panel = document.getElementById('properties-panel');
        if (node) this.generateProperties(node);
        else panel.innerHTML = '<div class="prop-group"><h3>No Selection</h3></div>';
        
        document.getElementById('tool-del-node').disabled = !node;
        document.getElementById('tool-add-out').disabled = !node;
        document.getElementById('tool-del-out').disabled = true; 
        document.getElementById('tool-enable').disabled = !node;
        document.getElementById('tool-start').disabled = !node;
    }

    // метод для генерации уникальных имен аутпутов
    _getNextOutputData(node) {
        let i = 0;
        const outputs = node.outputs || [];
        // Ищем первый свободный индекс i, чтобы не было дублей имен
        while (outputs.some(o => o.name === `Option ${i}`)) {
            i++;
        }
        return { name: `Option ${i}`, value: `Value ${i}` };
    }

    addNode(screenX, screenY, isToolbar = false) {
        const wp = Utils.screenToWorld(screenX, screenY, this.view.panX, this.view.panY, this.view.zoom);
        
        // РАСЧЕТ СМЕЩЕНИЯ (CASCADE)
        let offsetX = 0;
        let offsetY = 0;

        if (isToolbar) {
            const count = this.state.toolbarCreateCount;
            const wrapLimit = 20;   // После 20 нод начинаем новую "лестницу"
            const step = 30;        // Шаг ступеньки (px)
            const groupShift = 100; // Смещение новой группы вправо (px)

            // Текущая ступенька внутри группы (0-19)
            const stepIdx = count % wrapLimit;
            // Номер группы (0, 1, 2...)
            const groupIdx = Math.floor(count / wrapLimit);

            offsetX = (stepIdx * step) + (groupIdx * groupShift);
            offsetY = (stepIdx * step);

            this.state.toolbarCreateCount++;
        }

        const nextData = this._getNextOutputData({ outputs: [] });
        const defaultOutputsCount = 1;
        const calcH = CONFIG.dims.headerH + (defaultOutputsCount * CONFIG.dims.rowH) + CONFIG.dims.footerH + 10;

        const newNode = {
            sid: Utils.uuid(), 
            pnSIDs: [], poSIDs: [], nodeSIDs: [],
            // Применяем рассчитанное смещение к координатам центра
            x: wp.x + offsetX, 
            y: wp.y + offsetY, 
            w: 420, 
            h: calcH,
            t: "", s: false, e: true, c: "New Node",
            pi: 0, ty: "dictionary", pr: false, prfsid: null, prfnsid: null,
            outputs: [{ 
                sid: Utils.uuid(), 
                cnSID: null, 
                name: nextData.name, 
                value: nextData.value, 
                enable: true, 
                default: false 
            }]
        };
        
        this.data.flowchart.nodes.push(newNode);
        this.data.ui.nodes.push({ 
            node: { propertiesBar: {}, nodeTable: {}, color: [0.8, 0.8, 0.8, 1] }, 
            outputs: [{ color: [0, 0, 0, 1], linkMode: "line", propertiesBar: {} }] 
        });
        
        this.selectSingle(newNode);
        this.history.execute("Add Node"); 
        this.render();
    }

    deleteSelection() {
        // ЗАЩИТА: Если ничего не выделено, просто выходим, не фиксируя шаг в истории
        if (!this.state.selection || this.state.selection.length === 0) return;
    
        const name = this.state.selectionType === 'node' 
            ? `Delete ${this.state.selection.length} node(s)` 
            : "Delete connection(s)";
            
        if (this.state.selectionType === 'node') {
            this.state.selection.forEach(node => {
                const idx = this.data.flowchart.nodes.indexOf(node);
                if (idx > -1) {
                    this.data.flowchart.nodes.forEach(n => {
                        n.outputs?.forEach(o => { if (o.cnSID === node.sid) o.cnSID = null; });
                        n.pnSIDs = (n.pnSIDs || []).filter(s => s !== node.sid);
                    });
                    this.data.flowchart.nodes.splice(idx, 1); 
                    this.data.ui.nodes.splice(idx, 1);
                }
            });
        } else if (this.state.selectionType === 'connection') {
            this.state.selection.forEach(s => {
                if (s.output) s.output.cnSID = null;
            });
        }

        // Фиксируем историю только ПОСЛЕ того, как убедились, что изменения произошли
        this.history.execute(name); 
        this.selectSingle(null); 
        this.state.selectionType = 'none'; 
        this.render();
    }

    _deleteNodeInternal(node) {
        const index = this.data.flowchart.nodes.indexOf(node);
        if (index > -1) {
            this.data.flowchart.nodes.forEach(n => {
                if (n.outputs) {
                    n.outputs.forEach(o => { if (o.cnSID === node.sid) o.cnSID = null; });
                }
                if (n.pnSIDs) n.pnSIDs = n.pnSIDs.filter(sid => sid !== node.sid);
                if (n.nodeSIDs) n.nodeSIDs = n.nodeSIDs.filter(sid => sid !== node.sid);
            });
            this.data.flowchart.nodes.splice(index, 1);
            this.data.ui.nodes.splice(index, 1);
        }
    }

    getMinNodeSize(node) {
        const minW = 200; 
        const hh = CONFIG.dims.headerH;
        const rh = CONFIG.dims.rowH;
        const fh = CONFIG.dims.footerH;
        const outputsCount = node.outputs ? node.outputs.length : 0;
        const minH = hh + (outputsCount * rh) + fh + 10;
        return { w: minW, h: minH };
    }

    // --- CLIPBOARD ---

    copyNode(node) {
        let nodesToCopy = node ? [node] : this.state.selection;
        if (nodesToCopy.length === 0) return;

        const clipboardPayload = nodesToCopy.map(n => {
            const idx = this.data.flowchart.nodes.indexOf(n);
            return {
                logic: JSON.parse(JSON.stringify(n)),
                ui: JSON.parse(JSON.stringify(this.data.ui.nodes[idx]))
            };
        });
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        clipboardPayload.forEach(item => {
            minX = Math.min(minX, item.logic.x);
            minY = Math.min(minY, item.logic.y);
            maxX = Math.max(maxX, item.logic.x);
            maxY = Math.max(maxY, item.logic.y);
        });

        this.clipboard = {
            items: clipboardPayload,
            center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
        };
    }

    pasteNode(screenX, screenY) {
        // ЗАЩИТА: Если буфер пуст, не создаем "пустой" шаг в истории
        if (!this.clipboard || !this.clipboard.items || this.clipboard.items.length === 0) return;

        const wp = Utils.screenToWorld(screenX, screenY, this.view.panX, this.view.panY, this.view.zoom);
        this.selectSingle(null);
        this.state.selectionType = 'node';

        this.clipboard.items.forEach(item => {
            const newNode = JSON.parse(JSON.stringify(item.logic));
            newNode.sid = Utils.uuid(); 
            newNode.x = wp.x + (item.logic.x - this.clipboard.offset.x); 
            newNode.y = wp.y + (item.logic.y - this.clipboard.offset.y);
            newNode.outputs?.forEach(o => { o.sid = Utils.uuid(); o.cnSID = null; });
            
            this.data.flowchart.nodes.push(newNode); 
            this.data.ui.nodes.push(JSON.parse(JSON.stringify(item.ui)));
            this.addToSelection(newNode);
        });

        this.history.execute(`Paste ${this.clipboard.items.length} node(s)`); 
        this.render();
    }

    // --- RENDERING ---

    render() {
        if (!this.data.flowchart) return;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawGrid();
        
        // Отрисовка существующих связей
        this.data.flowchart.nodes.forEach((node, nIdx) => {
            node.outputs?.forEach((out, oIdx) => {
                // Убрали "&& out.enable", теперь связь видна всегда, если есть ID цели
                if (out.cnSID) {
                    const target = this.data.flowchart.nodes.find(n => n.sid === out.cnSID);
                    if (target) this.drawConnection(node, nIdx, out, oIdx, target);
                }
            });
        });

        // Отрисовка временной связи (при перетаскивании)
        if (this.state.connectionStart) {
            const start = this.getOutputPos(this.state.connectionStart.node, 
                this.state.connectionStart.node.outputs.indexOf(this.state.connectionStart.output));
            
            const rect = this.canvas.getBoundingClientRect();
            
            // Если мы над нодой — примагничиваем к входу, иначе — к курсору
            let end;
            if (this.state.hover.node) {
                end = this.getNodeInputPos(this.state.hover.node);
            } else {
                end = { 
                    x: this.state.lastMouse.x - rect.left, 
                    y: this.state.lastMouse.y - rect.top 
                };
            }

            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            
            // Рисуем кривую Безье для превью, как и у настоящих связей
            const cpOffset = Math.abs(end.x - start.x) * 0.5;
            ctx.moveTo(start.x, start.y);
            ctx.bezierCurveTo(
                start.x + cpOffset, start.y, 
                end.x - cpOffset, end.y, 
                end.x, end.y
            );
            
            ctx.stroke();
            ctx.restore();
        }

        // Отрисовка нод
        this.data.flowchart.nodes.forEach((node, i) => this.drawNode(node, i));

        // Отрисовка рамки выделения (Marquee)
        if (this.state.marqueeStart && this.state.marqueeCurrent) {
            const x = Math.min(this.state.marqueeStart.x, this.state.marqueeCurrent.x);
            const y = Math.min(this.state.marqueeStart.y, this.state.marqueeCurrent.y);
            const w = Math.abs(this.state.marqueeCurrent.x - this.state.marqueeStart.x);
            const h = Math.abs(this.state.marqueeCurrent.y - this.state.marqueeStart.y);
            ctx.save();
            ctx.strokeStyle = CONFIG.colors.marqueeStroke;
            ctx.fillStyle = CONFIG.colors.marqueeFill;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
            ctx.restore();
        }
    }

    drawGrid() {
        const ctx = this.ctx;
        const zoom = this.view.zoom;
        const panX = this.view.panX;
        const panY = this.view.panY;
        const cellSize = CONFIG.dims.gridSize * zoom;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = CONFIG.colors.grid;
        ctx.lineWidth = 1;
        const startX = panX % cellSize;
        const startY = panY % cellSize;
        for (let x = startX; x < w; x += cellSize) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
        for (let y = startY; y < h; y += cellSize) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        if (panX >= -50 && panX <= w + 50) { ctx.moveTo(panX, 0); ctx.lineTo(panX, h); }
        if (panY >= -50 && panY <= h + 50) { ctx.moveTo(0, panY); ctx.lineTo(w, panY); }
        ctx.stroke();
        if (panX > -100 && panX < w && panY > -100 && panY < h) {
            ctx.fillStyle = '#888';
            ctx.font = '12px monospace';
            ctx.setLineDash([]);
            ctx.fillText("(0, 0)", panX + 5, panY + 15);
        }
        ctx.restore();
    }

    drawConnection(n1, n1Idx, output, oIdx, n2) {
        const start = this.getOutputPos(n1, oIdx);
        const end = this.getNodeInputPos(n2);
        let color = CONFIG.colors.connection;
        let width = 2;
        if (this.isSelectedConnection(output)) { color = CONFIG.colors.selection; width = 4; } 
        else if (this.state.hover.connection && this.state.hover.connection.output === output) { color = CONFIG.colors.connectionHover; width = 4; } 
        else if (output.default) { color = CONFIG.colors.connectionDefault; width = 3; }
        const cpOffset = Math.abs(end.x - start.x) * 0.5;
        this.ctx.beginPath();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.moveTo(start.x, start.y);
        this.ctx.bezierCurveTo(start.x + cpOffset, start.y, end.x - cpOffset, end.y, end.x, end.y);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.arc(end.x, end.y, 4, 0, Math.PI*2);
        this.ctx.fillStyle = color;
        this.ctx.fill();
    }

    drawNode(node, idx) {
        const zoom = this.view.zoom;
        const w = node.w * zoom;
        const hh = CONFIG.dims.headerH * zoom; 
        const rh = CONFIG.dims.rowH * zoom;    
        const fh = CONFIG.dims.footerH * zoom; 
        const outputsCount = node.outputs ? node.outputs.length : 0;
        const contentHeightRaw = CONFIG.dims.headerH + (outputsCount * CONFIG.dims.rowH) + CONFIG.dims.footerH + 10;
        const actualH = Math.max(node.h, contentHeightRaw);
        const h = actualH * zoom;
        const drawX = node.x - (node.w / 2);
        const drawY = node.y - (actualH / 2);
        const pos = Utils.worldToScreen(drawX, drawY, this.view.panX, this.view.panY, zoom);
        const rad = CONFIG.dims.borderRadius * zoom;

        let borderColor = CONFIG.colors.borderDefault;
        if (this.data.ui.nodes[idx]?.node?.color) {
            const c = this.data.ui.nodes[idx].node.color;
            borderColor = `rgb(${c[0]*255}, ${c[1]*255}, ${c[2]*255})`;
        }
        const headerBgColor = node.s ? CONFIG.colors.headerStart : CONFIG.colors.header;
        const outputNameColor = node.s ? CONFIG.colors.headerStart : CONFIG.colors.outputNameDefault;
        const isSelected = this.isSelected(node);

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.roundRect(pos.x, pos.y, w, h, rad);
        this.ctx.fillStyle = CONFIG.colors.bgNode;
        this.ctx.fill();

        this.ctx.save();
        this.ctx.clip(); 
        this.ctx.fillStyle = headerBgColor;
        this.ctx.fillRect(pos.x, pos.y, w, hh);
        this.ctx.restore();

        this.ctx.beginPath();
        this.ctx.roundRect(pos.x, pos.y, w, h, rad);
        if (isSelected) { this.ctx.lineWidth = 3; this.ctx.strokeStyle = CONFIG.colors.selection; } 
        else if (this.state.hover.node === node && this.state.connectionStart) { this.ctx.lineWidth = 3; this.ctx.strokeStyle = CONFIG.colors.connectionHover; } 
        else { this.ctx.lineWidth = 1; this.ctx.strokeStyle = borderColor; }
        this.ctx.stroke();

        this.ctx.textAlign = 'left'; 
        this.ctx.fillStyle = CONFIG.colors.text;
        this.ctx.font = `bold ${Math.max(10, 13 * zoom)}px sans-serif`;
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(node.c || 'Node', pos.x + 10*zoom, pos.y + hh/2, w - 20);

        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y + h/2, 5*zoom, -Math.PI/2, Math.PI/2);
        this.ctx.fillStyle = '#555';
        this.ctx.fill();

        if (node.outputs) {
            const startY = hh + (5 * zoom); 
            let activeCounter = 0; // Начинаем с 0
            
            node.outputs.forEach((out, i) => {
                // Если активен - берем текущее значение и увеличиваем. Если нет - -1.
                const displayIdx = out.enable ? (activeCounter++) : -1;
                this.drawOutput(node, out, i, pos, startY, outputNameColor, displayIdx);
            });
        }
        if (node.t) {
            this.ctx.textAlign = 'left';
            this.ctx.fillStyle = CONFIG.colors.textDim;
            this.ctx.font = `italic ${Math.max(9, 11 * zoom)}px sans-serif`;
            this.ctx.fillText(node.t, pos.x + 10*zoom, pos.y + h - (fh/2) + 2);
        }
        if (!node.e) {
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.roundRect(pos.x, pos.y, w, h, rad);
            this.ctx.fillStyle = 'rgba(20, 20, 20, 0.6)';
            this.ctx.fill();
            this.ctx.restore();
        }
        this.ctx.restore();
    }

    drawOutput(node, out, idx, pos, startY, nameColor, displayIdx) {
        const rh = CONFIG.dims.rowH * this.view.zoom;
        const yOff = startY + (idx * rh);
        const textY = pos.y + yOff + rh/2;
        const fontBaseSize = Math.max(9, 12 * this.view.zoom);
        const zoom = this.view.zoom;

        this.ctx.save();

        // 1. Состояние Disabled: делаем весь аутпут тусклым
        if (!out.enable) {
            this.ctx.globalAlpha = 0.4;
        }

        // 2. Рисуем индекс выхода (#1, #2 или #-1) слева
        this.ctx.textAlign = 'left';
        this.ctx.font = `${fontBaseSize}px monospace`;
        this.ctx.fillStyle = '#666';
        // Используем переданный displayIdx
        this.ctx.fillText(`#${displayIdx}`, pos.x + 10 * zoom, textY);

        // 3. Подготовка к отрисовке контента справа налево
        this.ctx.textAlign = 'right';
        let currentX = pos.x + (node.w * zoom) - (15 * zoom);
        
        // Определяем границу, дальше которой текст не должен заходить (чтобы не наехать на индекс)
        const leftBoundary = pos.x + 45 * zoom;

        // Отрисовка текста (Default)
        if (out.default) {
            this.ctx.font = `bold ${Math.max(8, 10 * zoom)}px sans-serif`;
            this.ctx.fillStyle = '#4caf50';
            const defText = ' (Default)';
            this.ctx.fillText(defText, currentX, textY);
            currentX -= this.ctx.measureText(defText).width;
        }

        // Отрисовка текста Value с автоматической обрезкой
        if (out.value) {
            this.ctx.font = `${fontBaseSize}px sans-serif`;
            this.ctx.fillStyle = '#ccc';
            
            // Заменяем переносы на пробелы для корректного замера ширины
            let valText = `: ${out.value.replace(/\\n/g, ' ')}`;
            const nameWidth = this.ctx.measureText(out.name).width;
            
            // Вычисляем доступное место для значения
            const availWidth = currentX - leftBoundary - nameWidth - (10 * zoom);

            // Алгоритм обрезки (Truncation)
            if (this.ctx.measureText(valText).width > availWidth) {
                while (valText.length > 0 && this.ctx.measureText(valText + "...").width > availWidth) {
                    valText = valText.slice(0, -1);
                }
                valText += "...";
            }

            this.ctx.fillText(valText, currentX, textY);

            // Зачеркивание значения, если Disabled
            if (!out.enable) {
                const tw = this.ctx.measureText(valText).width;
                this.ctx.beginPath();
                this.ctx.strokeStyle = '#ccc';
                this.ctx.lineWidth = 1;
                this.ctx.moveTo(currentX - tw, textY);
                this.ctx.lineTo(currentX, textY);
                this.ctx.stroke();
            }
            currentX -= this.ctx.measureText(valText).width;
        }

        // Отрисовка Имени выхода
        this.ctx.font = `bold ${fontBaseSize}px sans-serif`;
        this.ctx.fillStyle = nameColor; 
        this.ctx.fillText(out.name, currentX, textY);

        // Зачеркивание имени, если Disabled
        if (!out.enable) {
            const nw = this.ctx.measureText(out.name).width;
            this.ctx.beginPath();
            this.ctx.strokeStyle = nameColor;
            this.ctx.lineWidth = 1;
            this.ctx.moveTo(currentX - nw, textY);
            this.ctx.lineTo(currentX, textY);
            this.ctx.stroke();
        }

        // 4. Рисуем точку (dot) выхода
        const cx = pos.x + node.w * zoom;
        const cy = pos.y + yOff + rh/2;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, CONFIG.dims.dotRadius * zoom, 0, Math.PI*2);
        
        // Подсветка точки
        if (this.state.hover.output?.output === out) {
            this.ctx.fillStyle = '#fff';
        } else {
            this.ctx.fillStyle = out.cnSID ? CONFIG.colors.selection : '#444';
        }
        
        this.ctx.fill();
        this.ctx.strokeStyle = '#222';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    resetView() {
        if (!this.data.flowchart || !this.data.flowchart.nodes || this.data.flowchart.nodes.length === 0) {
            this.view = { zoom: 0.5, panX: 0, panY: 0 };
            const zoomDisplay = document.getElementById('zoom-level');
            if (zoomDisplay) zoomDisplay.textContent = '50%';
            this.render();
            return;
        }

        // 1. Считаем границы всех нод (Bounding Box)
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        this.data.flowchart.nodes.forEach(node => {
            const outputsCount = node.outputs ? node.outputs.length : 0;
            const contentH = CONFIG.dims.headerH + (outputsCount * CONFIG.dims.rowH) + CONFIG.dims.footerH + 10;
            const actualH = Math.max(node.h, contentH);
            minX = Math.min(minX, node.x - node.w / 2);
            maxX = Math.max(maxX, node.x + node.w / 2);
            minY = Math.min(minY, node.y - actualH / 2);
            maxY = Math.max(maxY, node.y + actualH / 2);
        });

        // 2. Вычисляем доступную ширину (Канвас минус Панель свойств)
        const panel = document.getElementById('properties-panel');
        const panelWidth = (panel && panel.classList.contains('active')) ? panel.offsetWidth : 0;
        const availableWidth = this.canvas.width - panelWidth;
        
        const padding = 60; // Отступ от краев
        const canvasW = availableWidth - (padding * 2);
        const canvasH = this.canvas.height - (padding * 2);

        // 3. Рассчитываем идеальный зум
        let newZoom = Math.min(canvasW / (maxX - minX), canvasH / (maxY - minY));
        newZoom = Math.max(CONFIG.zoom.min, Math.min(newZoom, 1));
        this.view.zoom = newZoom;

        // 4. Центрируем камеру в свободной от панели области
        // (availableWidth / 2) — это центр видимого куска канваса
        this.view.panX = (availableWidth / 2) - (((minX + maxX) / 2) * newZoom);
        this.view.panY = (this.canvas.height / 2) - (((minY + maxY) / 2) * newZoom);

        // Обновляем текст в UI
        const zoomDisplay = document.getElementById('zoom-level');
        if (zoomDisplay) zoomDisplay.textContent = Math.round(this.view.zoom * 100) + '%';
        
        this.render();
    }

    generateProperties(node) {
        const p = document.getElementById('properties-panel');
        const val = (v) => (v || '').replace(/"/g, '&quot;');
        
        let html = `<div class="prop-group"><h3>Node Properties</h3>
            <div class="prop-row"><label>Caption</label><input type="text" class="node-input" data-key="c" value="${val(node.c)}"></div>
            <div class="prop-row"><label>Tags</label><input type="text" class="node-input" data-key="t" value="${val(node.t)}"></div>
            <div class="prop-row"><label><input type="checkbox" class="node-check" data-key="e" ${node.e?'checked':''}> Enabled</label></div>
            <div class="prop-row"><label><input type="checkbox" class="node-check" data-key="s" ${node.s?'checked':''}> Start Node</label></div>
        </div><div class="prop-group"><h3>Outputs <button class="btn small" style="float:right" id="prop-add-out">Add</button></h3><div id="out-list">`;
        
        node.outputs.forEach((o, i) => {
            html += `<div class="output-item ${o.default?'default':''}">
                <div class="output-header"><strong>#${i+1}</strong> <button class="btn small danger" data-del-out="${i}">X</button></div>
                <div class="prop-row"><label>Name</label><input type="text" class="out-input" data-idx="${i}" data-key="name" value="${val(o.name)}"></div>
                <div class="prop-row"><label>Value</label><textarea class="out-input" data-idx="${i}" data-key="value">${(o.value||'').replace(/\\n/g, '\n')}</textarea></div>
                <div class="prop-row"><label><input type="checkbox" class="out-check" data-idx="${i}" data-key="enable" ${o.enable?'checked':''}> Enabled</label></div>
                <div class="prop-row"><label><input type="checkbox" class="out-check" data-idx="${i}" data-key="default" ${o.default?'checked':''}> Default</label></div>
            </div>`;
        });
        html += '</div></div>';
        p.innerHTML = html;
        
        // 1. Текстовые поля ноды
        p.querySelectorAll('.node-input').forEach(el => {
            el.oninput = e => {
                node[e.target.dataset.key] = e.target.value; 
                this.history.executeDebounced("Edit node property");
                this.render(); 
            };
        });
        
        // 2. Чекбоксы ноды
        p.querySelectorAll('.node-check').forEach(el => {
            el.onchange = e => {
                const key = e.target.dataset.key; // 'e' или 's'
                const value = e.target.checked;

                if (key === 's' && value) {
                    // Если назначаем стартовую, убираем флаг у остальных
                    this.data.flowchart.nodes.forEach(n => n.s = false);
                }
                
                node[key] = value; 

                // Формируем имя согласно задаче
                let optionName = "";
                if (key === 'e') optionName = value ? "Enable" : "Disable";
                if (key === 's') optionName = value ? "Set start" : "Unset start";

                this.history.execute(`Toggle node option: ${optionName}`); 
                this.render(); 
            };
        });
        
        // 3. Текстовые поля выходов
        p.querySelectorAll('.out-input').forEach(el => {
            el.oninput = e => {
                let v = e.target.value;
                if(e.target.tagName === 'TEXTAREA') v = v.replace(/\n/g, '\\n');
                node.outputs[e.target.dataset.idx][e.target.dataset.key] = v;
                this.history.executeDebounced("Edit output property");
                this.render();
            };
        });
        
        // 4. Чекбоксы выходов
        p.querySelectorAll('.out-check').forEach(el => {
            el.onchange = e => {
                const idx = e.target.dataset.idx;
                const key = e.target.dataset.key;
                const value = e.target.checked;

                if (key === 'default' && value) {
                    node.outputs.forEach(o => o.default = false);
                }
                node.outputs[idx][key] = value;
                
                this.generateProperties(node);
                this.history.execute(key === 'enable' ? (value ? "Enable Output" : "Disable Output") : "Set Default Output"); 
                this.render();
            };
        });
        
        const nodeIdx = this.data.flowchart.nodes.indexOf(node);
        
        // 5. Добавление выхода
        document.getElementById('prop-add-out').onclick = () => {
            // Используем унифицированную логику имен
            const nextData = this._getNextOutputData(node);
            
            node.outputs.push({ 
                sid: Utils.uuid(), 
                name: nextData.name, 
                value: nextData.value, 
                enable: true, 
                default: false 
            });
            node.h += CONFIG.dims.rowH; 
            
            if (this.data.ui.nodes[nodeIdx]) {
                this.data.ui.nodes[nodeIdx].outputs.push({ 
                    color: [0,0,0,1], linkMode: "line", propertiesBar: {} 
                });
            }
            
            this.generateProperties(node); 
            this.history.execute("Add output"); 
            this.render();
        };
        
        // 6. Удаление выхода
        p.querySelectorAll('[data-del-out]').forEach(b => {
            b.onclick = e => {
                const outIdx = parseInt(e.target.dataset.delOut);
                node.outputs.splice(outIdx, 1);
                node.h = Math.max(this.getMinNodeSize(node).h, node.h - CONFIG.dims.rowH);
                
                if (this.data.ui.nodes[nodeIdx] && this.data.ui.nodes[nodeIdx].outputs) {
                    this.data.ui.nodes[nodeIdx].outputs.splice(outIdx, 1);
                }
                
                this.generateProperties(node); 
                this.history.execute("Delete output");
                this.render();
            };
        });
    }

    showContextMenu(e) {
        const menu = document.getElementById('context-menu');
        const items = [];
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;

        if (this.state.hover.connection) {
            items.push({ 
                txt: 'Delete Connection', 
                fn: () => { 
                    this.state.hover.connection.output.cnSID = null; 
                    this.history.execute("Delete Connection"); 
                    this.render(); 
                }
            });
        } else if (this.state.hover.node) {
            const n = this.state.hover.node;
            
            // Если нода не в выделении — выделяем только её. 
            // Если в выделении — работаем со всей группой.
            if (!this.isSelected(n)) {
                this.selectSingle(n);
            }
            
            const count = this.state.selection.length;

            items.push({ txt: 'Copy', fn: () => this.copyNode() });
            items.push({ 
                txt: count > 1 ? `Delete ${count} nodes` : 'Delete node', 
                fn: () => this.deleteSelection() 
            });
            items.push({ txt: '----------------', fn: () => {} });
            
            // ГРУППОВОЕ ДЕЙСТВИЕ ENABLE / DISABLE
            items.push({ 
                txt: n.e ? (count > 1 ? `Disable ${count} Nodes` : 'Disable Node') : (count > 1 ? `Enable ${count} Nodes` : 'Enable Node'), 
                fn: () => { 
                    const newState = !n.e; // Новое состояние на основе кликнутой ноды
                    this.state.selection.forEach(node => {
                        if (this.state.selectionType === 'node') {
                            node.e = newState;
                        }
                    });
                    
                    const actionLabel = newState ? "Enable" : "Disable";
                    const historyName = count > 1 ? `${actionLabel} (${count} nodes)` : actionLabel;
                    
                    this.history.execute(`Toggle node option: ${historyName}`); 
                    this.render(); 
                    if (count === 1) this.generateProperties(n); // Обновляем панель, если одна нода
                }
            });

            items.push({ 
                txt: 'Set Start Node', 
                fn: () => { 
                    this.data.flowchart.nodes.forEach(x => x.s = false); 
                    n.s = true; 
                    this.history.execute("Toggle node option: Set start"); 
                    this.render(); 
                }
            });
        } else {
            items.push({ 
                txt: 'Add Node', 
                fn: () => this.addNode(e.clientX, e.clientY)
            });
            if (this.clipboard) {
                items.push({ 
                    txt: 'Paste Node', 
                    fn: () => this.pasteNode(mx, my)
                });
            }
        }

        menu.innerHTML = items.map((i, idx) => 
            i.txt.startsWith('---') 
            ? `<div style="border-top:1px solid #444; margin:4px 0;"></div>` 
            : `<div class="ctx-item" data-i="${idx}">${i.txt}</div>`
        ).join('');

        menu.style.left = e.clientX + 'px'; 
        menu.style.top = e.clientY + 'px';
        menu.classList.add('active');

        menu.onclick = (evt) => { 
            const idx = evt.target.dataset.i; 
            if(idx !== undefined) { 
                items[idx].fn(); 
                menu.classList.remove('active'); 
            }
        };
    }

    openHelp(sectionId) {
        const modal = document.getElementById('help-modal');
        const content = document.getElementById('help-content');
        content.innerHTML = (typeof HELP_CONTENTS === 'undefined') ? "<h2>Error</h2><p>Help content file not found.</p>" : (HELP_CONTENTS[sectionId] || "<h2>Error</h2><p>Section not found.</p>");
        modal.classList.add('active');
    }

    setMode(mode) {
        this.state.mode = mode;
        const ind = document.getElementById('mode-indicator'), tb = document.getElementById('toolbar'), c = this.canvas;
        
        if (mode === 'edit') {
            // СОХРАНЯЕМ ПОЛНЫЙ СЛЕПОК (Логика + Расположение нод)
            this.data.original = JSON.stringify({
                flowchart: this.data.flowchart,
                ui: this.data.ui
            });

            ind.textContent = "EDIT MODE"; ind.className = "edit-mode";
            tb.classList.add('active'); c.classList.add('editing');
            document.getElementById('properties-panel').classList.add('active');
            document.getElementById('btn-toggle-mode').textContent = "Save & Exit";
            document.getElementById('btn-cancel-edit').style.display = "block";
        } else {
            // ... (логика выхода в view mode без изменений)
            ind.textContent = "VIEW MODE"; ind.className = "view-mode";
            tb.classList.remove('active'); c.classList.remove('editing');
            document.getElementById('properties-panel').classList.remove('active');
            document.getElementById('btn-toggle-mode').textContent = "Enter Edit Mode";
            document.getElementById('btn-cancel-edit').style.display = "none";
            this.selectSingle(null);
        }
    }

    cancelEdit() {
        if (!this.data.original) {
            this.setMode('view');
            return;
        }

        // 1. Восстанавливаем данные из слепка
        const backup = JSON.parse(this.data.original);
        this.data.flowchart = backup.flowchart;
        this.data.ui = backup.ui;

        // 2. СБРОС ИСТОРИИ (Эффективный путь)
        // Мы удаляем все "грязные" шаги редактирования и создаем один чистый
        this.history.undoStack = [{ 
            name: "State Before Edit (Restored)", 
            snapshot: this.data.original, 
            timestamp: Date.now() 
        }];
        this.history.index = 0;
        this.history.updateUI();
        this.history.updateHistoryMenu();

        // 3. Обновляем визуальную часть
        this.rebuildConnectivity();
        this.render();
        this.updateUI(); // Обновит кнопки тулбара
        
        // 4. Выходим в режим просмотра
        this.setMode('view');
        
        document.getElementById('status-bar').textContent = "Edit session canceled. Changes reverted.";
    }

    rebuildConnectivity() {
        // Защита от пустого объекта данных
        if (!this.data.flowchart || !this.data.flowchart.nodes) return;

        this.data.flowchart.nodes.forEach(n => {
            n.pnSIDs = []; n.poSIDs = []; n.nodeSIDs = [];
            n.x = Math.round(n.x); n.y = Math.round(n.y);
        });

        this.data.flowchart.nodes.forEach(src => {
            src.outputs?.forEach(out => {
                if (out.cnSID) {
                    const target = this.data.flowchart.nodes.find(n => n.sid === out.cnSID);
                    if (target) {
                        if(!src.nodeSIDs.includes(target.sid)) src.nodeSIDs.push(target.sid);
                        target.pnSIDs.push(src.sid); 
                        target.poSIDs.push(out.sid);
                    } else {
                        out.cnSID = null;
                    }
                }
            });
        });
    }

    async load(newLogic, newUI, filename = null, isImport = false) {
        // Блокируем запись истории во время внутренних изменений
        this.history.isRestoring = true;

        try {
            const isCanvasEmpty = !this.data.flowchart || this.data.flowchart.nodes.length === 0;

            if (isCanvasEmpty || !isImport) {
                this.data.flowchart = newLogic;
                this.data.ui = newUI;
                this.fileHandle = null; 
            } else {
                // ЛОГИКА SMART IMPORT
                let currentBottomY = -Infinity;
                this.data.flowchart.nodes.forEach(n => {
                    const outputsCount = n.outputs ? n.outputs.length : 0;
                    const contentH = CONFIG.dims.headerH + (outputsCount * CONFIG.dims.rowH) + CONFIG.dims.footerH + 10;
                    const bottom = n.y + (Math.max(n.h, contentH) / 2);
                    if (bottom > currentBottomY) currentBottomY = bottom;
                });

                let importedTopY = Infinity;
                newLogic.nodes.forEach(n => {
                    const outputsCount = n.outputs ? n.outputs.length : 0;
                    const contentH = CONFIG.dims.headerH + (outputsCount * CONFIG.dims.rowH) + CONFIG.dims.footerH + 10;
                    const top = n.y - (Math.max(n.h, contentH) / 2);
                    if (top < importedTopY) importedTopY = top;
                });

                const shiftY = (currentBottomY + 150) - importedTopY;
                const sidMap = new Map();
                const timestamp = Date.now();

                newLogic.nodes.forEach(node => {
                    const oldSid = node.sid;
                    const newSid = timestamp + Math.floor(Math.random() * 1000000);
                    sidMap.set(oldSid, newSid);
                    node.sid = newSid;
                    node.y += shiftY;
                    node.s = false;    
                });

                newLogic.nodes.forEach(node => {
                    if (node.outputs) {
                        node.outputs.forEach(out => {
                            if (out.cnSID && sidMap.has(out.cnSID)) {
                                out.cnSID = sidMap.get(out.cnSID);
                            } else if (out.cnSID) {
                                out.cnSID = null; 
                            }
                        });
                    }
                });

                this.data.flowchart.nodes.push(...newLogic.nodes);
                this.data.ui.nodes.push(...newUI.nodes);
            }

            if (filename && !isImport) {
                this.data.flowchart.name = filename.replace(/\.(json|flowproj|uistate|miniflow)*$/gi, '');
            }

            document.getElementById('filename-display').textContent = this.data.flowchart.name;
            this.rebuildConnectivity();
            this.render();
            this.resetView();
        } finally {
            this.history.isRestoring = false;
            const actionName = isImport ? "Import Project" : "Open File";
            this.history.execute(actionName);
            
            // Закрываем меню
            document.querySelectorAll('.dropdown, .submenu').forEach(d => d.style.display = 'none');
            
            // Дополнительный фидбек в статус-бар (опционально, так как execute уже обновит текст)
            const status = document.getElementById('status-bar');
            if (status && !isImport) {
                status.textContent = `Project "${this.data.flowchart.name || 'Untitled'}" loaded successfully.`;
            }
        }
    }

    exportMiniFlow() {
        const startNode = this.data.flowchart.nodes.find(n => n.s);
        let rootSid = startNode ? startNode.sid : (this.data.flowchart.nodes.length > 0 ? this.data.flowchart.nodes[0].sid : null);
        if (!rootSid) return alert("Граф пуст");
        const idMap = new Map(), usedIds = new Set();
        this.data.flowchart.nodes.forEach(node => {
            let base = (node.t || node.c || "node").trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || "node";
            let candidate = base, counter = 2;
            while (usedIds.has(candidate)) { candidate = `${base}_${counter}`; counter++; }
            usedIds.add(candidate); idMap.set(node.sid, candidate);
        });
        const miniFlow = { root: idMap.get(rootSid), nodes: {} };
        this.data.flowchart.nodes.forEach(node => {
            const outputs = (node.outputs || []).map(out => ({
                name: out.name || "Next", value: out.value || "",
                next: (out.cnSID && idMap.has(out.cnSID)) ? idMap.get(out.cnSID) : null
            }));
            if (outputs.length === 0) outputs.push({ name: "End", value: "", next: null });
            miniFlow.nodes[idMap.get(node.sid)] = { caption: node.c || "", tag: node.t || "", outputs: outputs };
        });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(miniFlow, null, 2)], { type: 'application/json' }));
        a.download = (this.data.flowchart.name || 'miniflow') + '.miniflow.json';
        a.click();
    }

    importMiniFlow(miniJson) {
        if (!miniJson.root || !miniJson.nodes) return alert("Invalid MiniFlow format");
        const c3Data = { sid: Utils.uuid(), nodes: [], "preset-nodes": { items: [], subfolders: [] }, name: "Imported_MiniFlow", w: 30000, h: 30000 };
        const uiData = { flowchart: { z: 1, sx: 0, sy: 0 }, nodes: [] }, sidMap = new Map();
        Object.keys(miniJson.nodes).forEach(strId => sidMap.set(strId, Utils.uuid()));
        if (!sidMap.has(miniJson.root)) return alert("Root node not found");

        Object.entries(miniJson.nodes).forEach(([strId, miniNode]) => {
            const c3Sid = sidMap.get(strId), outputsCount = Array.isArray(miniNode.outputs) ? miniNode.outputs.length : 0;
            const calcH = CONFIG.dims.headerH + (outputsCount * CONFIG.dims.rowH) + CONFIG.dims.footerH + 10;
            const c3Node = { sid: c3Sid, pnSIDs: [], poSIDs: [], nodeSIDs: [], x: 0, y: 0, w: 420, h: calcH, t: miniNode.tag || "", c: miniNode.caption || strId, s: (strId === miniJson.root), e: true, ty: "dictionary", pi: 0, pr: false, prfsid: null, prfnsid: null, outputs: [] };
            if (Array.isArray(miniNode.outputs)) {
                c3Node.outputs = miniNode.outputs.map(miniOut => ({ sid: Utils.uuid(), cnSID: null, name: miniOut.name || "Next", value: miniOut.value || "", enable: true, default: false, _tempNext: miniOut.next }));
            }
            c3Data.nodes.push(c3Node);
            uiData.nodes.push({ node: { color: [0.8, 0.8, 0.8, 1], propertiesBar: {}, nodeTable: {} }, outputs: c3Node.outputs.map(() => ({ color: [0,0,0,1], linkMode: "line", propertiesBar: {} })) });
        });

        c3Data.nodes.forEach(src => src.outputs.forEach(out => {
            if (out._tempNext && sidMap.has(out._tempNext)) {
                const tSid = sidMap.get(out._tempNext), tNode = c3Data.nodes.find(n => n.sid === tSid);
                if (tNode) { out.cnSID = tSid; if (!src.nodeSIDs.includes(tSid)) src.nodeSIDs.push(tSid); tNode.pnSIDs.push(src.sid); tNode.poSIDs.push(out.sid); }
            }
            delete out._tempNext;
        }));

        this._miniFlowAutoLayout(c3Data.nodes, sidMap.get(miniJson.root));
        // передаем флаг true в метод load
        this.load(c3Data, uiData, "Imported_MiniFlow", true); 
        document.getElementById('status-bar').textContent = `Imported ${c3Data.nodes.length} nodes from MiniFlow`;
    }

    _miniFlowAutoLayout(nodes, rootSid) {
        const START_X = 300;
        const X_STEP = 500;
        const Y_GAP = 100;
        const visited = new Set();
        
        // Храним максимальную Y координату, чтобы знать, где заканчивается текущий блок
        let globalMaxY = 300;

        /**
         * Вспомогательная функция для обхода компонента связности (BFS)
         * @param {string} startSid - SID с которого начинаем
         * @param {number} topAnchorY - Y координата, от которой начинаем строить "остров"
         */
        const layoutIsland = (startSid, topAnchorY) => {
            const queue = [{ sid: startSid, layer: 0 }];
            const layerNextY = {}; // Храним текущий Y для каждого уровня (колонки)
            let localMaxY = topAnchorY;

            while (queue.length > 0) {
                const { sid, layer } = queue.shift();
                if (visited.has(sid)) continue;
                visited.add(sid);

                const node = nodes.find(n => n.sid === sid);
                if (!node) continue;

                // Если в этой колонке еще не было нод, начинаем с верхнего якоря
                if (layerNextY[layer] === undefined) {
                    layerNextY[layer] = topAnchorY;
                }

                // Устанавливаем координаты
                node.x = START_X + (layer * X_STEP);
                node.y = layerNextY[layer];

                // Рассчитываем высоту ноды (с учетом контента)
                const outputsCount = node.outputs ? node.outputs.length : 0;
                const contentH = CONFIG.dims.headerH + (outputsCount * CONFIG.dims.rowH) + CONFIG.dims.footerH + 10;
                const nodeH = Math.max(node.h || 0, contentH);

                // Обновляем Y для следующей ноды в этой же колонке
                layerNextY[layer] += nodeH + Y_GAP;

                // Фиксируем самую нижнюю точку этого "острова"
                if (node.y + nodeH > localMaxY) {
                    localMaxY = node.y + nodeH;
                }

                // Добавляем дочерние ноды в очередь
                if (node.outputs) {
                    node.outputs.forEach(out => {
                        if (out.cnSID && !visited.has(out.cnSID)) {
                            queue.push({ sid: out.cnSID, layer: layer + 1 });
                        }
                    });
                }
            }
            return localMaxY;
        };

        // 1. Сначала выстраиваем основной граф, идя от корня
        if (rootSid && nodes.some(n => n.sid === rootSid)) {
            globalMaxY = layoutIsland(rootSid, 300);
        }

        // 2. Обработка "сирот" (orphans) и изолированных островов
        // Идем по всем нодам, и если нода еще не была посещена BFS — строим для неё новый остров ниже
        const orphans = nodes.filter(n => !visited.has(n.sid));
        
        if (orphans.length > 0) {
            // Добавляем отступ от основного графа
            globalMaxY += 250; 
            
            // Если "сирота" одна или их мало — просто выстроим их в ряд или сетку
            // Но мы используем тот же layoutIsland, чтобы если у "сироты" есть свои связи, 
            // они тоже выстроились красиво.
            for (const orphan of nodes) {
                if (!visited.has(orphan.sid)) {
                    // Строим новый остров, обновляя глобальный низ
                    globalMaxY = layoutIsland(orphan.sid, globalMaxY) + Y_GAP;
                }
            }
        }

        // 3. Финальная настройка камеры
        this.view.panX = 100 - (START_X * this.view.zoom); 
        this.view.panY = 100 - (300 * this.view.zoom);
    }

    // Добавить этот метод в класс FlowchartEditor в js/editor-core.js
    exportC3() {
        if (!this.data.flowchart) return alert("No flowchart data to export");
        
        this.rebuildConnectivity();
        const name = this.data.flowchart.name || 'flowchart';
        
        const download = (content, filename) => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([JSON.stringify(content, null, '\t')], {type: 'application/json'}));
            a.download = filename; 
            a.click();
            URL.revokeObjectURL(a.href);
        };
        
        // Скачиваем два раздельных файла для C3
        download(this.data.flowchart, name + '.json');
        download(this.data.ui, name + '.uistate.json');
        
        document.getElementById('status-bar').textContent = "Exported as C3 Files (.json + .uistate.json)";
    }

    async projectSave() {
        // Проверяем, поддерживает ли браузер API и не заблокирован ли он (например, в iframe itch.io)
        const isFileSystemSupported = 'showSaveFilePicker' in window && (() => {
            try { return window.self === window.top; } catch { return false; }
        })();

        if (this.fileHandle && isFileSystemSupported) {
            try {
                this.rebuildConnectivity();
                const projectData = this._prepareProjectJson();
                const writable = await this.fileHandle.createWritable();
                await writable.write(JSON.stringify(projectData, null, "\t"));
                await writable.close();
                document.getElementById('status-bar').textContent = "Project saved natively";
                return;
            } catch (err) {
                console.warn("Native save failed, falling back to download", err);
            }
        }
        
        // Если мы на itch.io или API недоступно — просто вызываем скачивание файла
        this.projectSaveAs();
    }

    // Вспомогательный метод
    _prepareProjectJson() {
        return {
            format: "flowproj",
            version: "1.1.0",
            meta: {
                title: this.data.flowchart.name || "Untitled",
                modified: Date.now()
            },
            projectData: {
                logic: this.data.flowchart,
                uistate: this.data.ui
            }
        };
    }

    async projectSaveAs() {
        const projectData = this._prepareProjectJson();
        const filename = (this.data.flowchart.name || "Untitled") + ".flowproj";

        // Попытка использовать системный диалог (работает в Chrome/Edge вне iframe)
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{ description: 'Flowchart Project', accept: { 'application/json': ['.flowproj'] } }]
                });
                this.fileHandle = handle;
                const writable = await handle.createWritable();
                await writable.write(JSON.stringify(projectData, null, "\t"));
                await writable.close();
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
                // Если ошибка не в отмене, а в безопасности (Itch.io), идем к классическому скачиванию
            }
        }

        // Классический Fallback: Скачивание через Blob (работает ВЕЗДЕ, включая itch.io)
        const blob = new Blob([JSON.stringify(projectData, null, "\t")], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        document.getElementById('status-bar').textContent = "Project exported as file (Download)";
    }

    async projectOpen() {
        // Проверяем: доступен ли современный API и НЕ находимся ли мы в iframe
        const isFileSystemSupported = 'showOpenFilePicker' in window && window.self === window.top;

        if (isFileSystemSupported) {
            // --- СОВРЕМЕННЫЙ МЕТОД (Chrome/Edge на десктопе) ---
            try {
                const [handle] = await window.showOpenFilePicker({
                    types: [{ 
                        description: 'Flowchart Project', 
                        accept: { 'application/json': ['.flowproj'] } 
                    }]
                });
                this.fileHandle = handle;
                const file = await handle.getFile();
                const content = JSON.parse(await file.text());
                
                if (content.format === "flowproj") {
                    this.load(content.projectData.logic, content.projectData.uistate, file.name);
                } else {
                    alert("Not a valid .flowproj file");
                }
                return; // Выходим, если всё успешно
            } catch (err) {
                if (err.name === 'AbortError') return;
                console.warn("Modern File API failed, trying fallback...", err);
            }
        }

        // --- КЛАССИЧЕСКИЙ МЕТОД (Fallback для itch.io, Firefox, Safari) ---
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.flowproj,application/json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const content = JSON.parse(text);
                
                if (content.format === "flowproj") {
                    // При классическом открытии мы не можем сохранить fileHandle для тихой записи
                    this.fileHandle = null; 
                    this.load(content.projectData.logic, content.projectData.uistate, file.name);
                } else {
                    alert("Not a valid .flowproj file");
                }
            } catch (err) {
                console.error("Failed to read file:", err);
                alert("Error reading file content");
            }
        };

        input.click(); // Программно вызываем окно выбора файла
    }
}