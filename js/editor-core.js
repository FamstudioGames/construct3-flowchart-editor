import { CONFIG, Utils } from './config.js';

export class FlowchartEditor {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        this.data = { flowchart: null, ui: null, original: null };
        this.view = { zoom: 1, panX: 0, panY: 0 };
        
        this.state = {
            mode: 'view',
            dragging: false,
            lastMouse: { x: 0, y: 0 },
            
            // Множественное выделение
            selection: [], // Массив выделенных нод
            selectionType: 'none', // 'none' | 'node' | 'connection'
            selectedOutput: null, 
            
            dragNode: null, 
            dragOffset: null, 
            
            connectionStart: null,
            hover: { node: null, output: null, connection: null },
            
            resizing: false,
            resizeTarget: null,
            resizeDir: null,
            
            // Marquee (Рамка)
            marqueeStart: null, 
            marqueeCurrent: null,
            isSpacePressed: false 
        };
        
        this.clipboard = null; 
        this.resize();
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
            if (e.button === 1 || (e.button === 0 && this.state.isSpacePressed)) {
                this.state.dragging = true;
                this.state.lastMouse = { x: e.clientX, y: e.clientY };
                this.canvas.style.cursor = 'grabbing';
                return; 
            }

            if (e.button === 2) return;

            if (e.button === 0) {
                if (this.state.mode === 'edit') {
                    let hitNode = this.hitTestNode(mx, my);
                    let hitOut = null;

                    for (let i = this.data.flowchart.nodes.length - 1; i >= 0; i--) {
                        const n = this.data.flowchart.nodes[i];
                        const res = this.hitTestOutput(n, mx, my);
                        if (res) {
                            hitOut = res;
                            hitNode = n;
                            break;
                        }
                    }

                    if (hitNode && hitOut) {
                        this.state.connectionStart = { node: hitNode, output: hitOut.output };
                        this.state.lastMouse = { x: e.clientX, y: e.clientY }; 
                        this.render();
                        return; 
                    }

                    const hitConn = this.hitTestConnection(mx, my);
                    if (hitConn) {
                        const isShift = e.shiftKey;
                        if (this.state.selectionType === 'node') {
                            this.selectSingle(null);
                        }
                        this.state.selectionType = 'connection';

                        if (isShift) {
                            const index = this.state.selection.findIndex(x => x.output === hitConn.output);
                            if (index >= 0) {
                                this.state.selection.splice(index, 1);
                            } else {
                                this.state.selection.push(hitConn);
                            }
                        } else {
                            const alreadySelected = this.isSelectedConnection(hitConn.output);
                            if (!alreadySelected) {
                                this.state.selection = [hitConn];
                            }
                        }
                        this.updateUI(); 
                        this.render();
                        return;
                    }

                    const resizeHit = this.hitTestResize(mx, my);
                    if (resizeHit) {
                        if (!this.isSelected(resizeHit.node)) {
                            this.selectSingle(resizeHit.node);
                        }
                        this.state.resizing = true;
                        this.state.resizeTarget = resizeHit.node;
                        this.state.resizeDir = resizeHit.dir;
                        this.state.lastMouse = { x: e.clientX, y: e.clientY };
                        return; 
                    }

                    if (hitNode) {
                        if (this.state.selectionType === 'connection') {
                            this.state.selection = [];
                        }
                        this.state.selectionType = 'node';

                        const isShift = e.shiftKey;
                        const alreadySelected = this.isSelected(hitNode);

                        if (isShift) {
                            this.toggleSelection(hitNode);
                            this.state.dragNode = this.isSelected(hitNode) ? hitNode : null;
                        } else {
                            if (!alreadySelected) {
                                this.selectSingle(hitNode);
                            }
                            this.state.dragNode = hitNode;
                        }

                        const wp = Utils.screenToWorld(mx, my, this.view.panX, this.view.panY, this.view.zoom);
                        this.state.dragStartWorld = { x: wp.x, y: wp.y }; 
                    } 
                    else {
                        if (!this.state.isSpacePressed) {
                            if (!e.shiftKey) {
                                this.selectSingle(null);
                                this.state.selectionType = 'none';
                            }
                            this.state.marqueeStart = { x: mx, y: my };
                            this.state.marqueeCurrent = { x: mx, y: my };
                        }
                    }
                    this.render();
                }
            }
            this.state.lastMouse = { x: e.clientX, y: e.clientY };
        } 
        
        // --- 2. MOUSE MOVE ---
        else if (type === 'move') {
            if (this.state.dragging) {
                this.view.panX += e.clientX - this.state.lastMouse.x;
                this.view.panY += e.clientY - this.state.lastMouse.y;
                this.canvas.style.cursor = 'grabbing';
                this.state.lastMouse = { x: e.clientX, y: e.clientY };
                this.render();
                return;
            }

            if (this.state.mode === 'view') {
                this.canvas.style.cursor = this.state.isSpacePressed ? 'grab' : 'default';
            }

            if (this.state.isSpacePressed && !this.state.dragging) {
                this.canvas.style.cursor = 'grab';
                this.state.lastMouse = { x: e.clientX, y: e.clientY };
                return;
            }

            if (this.state.resizing && this.state.resizeTarget) {
                const dx = (e.clientX - this.state.lastMouse.x) / this.view.zoom;
                const dy = (e.clientY - this.state.lastMouse.y) / this.view.zoom;

                this.state.selection.forEach(node => {
                    const minSize = this.getMinNodeSize(node);
                    if (this.state.resizeDir === 'w') {
                        const oldW = node.w;
                        const newW = Math.max(minSize.w, oldW + dx);
                        node.x += (newW - oldW) / 2;
                        node.w = newW;
                    } else if (this.state.resizeDir === 'h') {
                        const oldH = node.h;
                        const newH = Math.max(minSize.h, oldH + dy);
                        node.y += (newH - oldH) / 2;
                        node.h = newH;
                    }
                });

                this.canvas.style.cursor = this.state.resizeDir === 'w' ? 'ew-resize' : 'ns-resize';
                this.state.lastMouse = { x: e.clientX, y: e.clientY };
                this.render();
                return;
            }

            if (this.state.connectionStart) {
                const hitNode = this.hitTestNode(mx, my);
                this.state.hover.node = (hitNode !== this.state.connectionStart.node) ? hitNode : null;
                this.state.lastMouse = { x: e.clientX, y: e.clientY };
                this.render();
                return;
            }

            if (this.state.marqueeStart) {
                this.state.marqueeCurrent = { x: mx, y: my };
                this.render();
                return;
            }

            if (this.state.dragNode) {
                const wp = Utils.screenToWorld(mx, my, this.view.panX, this.view.panY, this.view.zoom);
                const dx = wp.x - this.state.dragStartWorld.x;
                const dy = wp.y - this.state.dragStartWorld.y;

                this.state.selection.forEach(node => {
                    node.x += dx;
                    node.y += dy;
                });

                this.state.dragStartWorld = { x: wp.x, y: wp.y };
                this.canvas.style.cursor = 'grabbing';
                this.state.lastMouse = { x: e.clientX, y: e.clientY };
                this.render();
                return;
            }

            if (this.state.mode === 'edit') {
                const prevHoverOut = this.state.hover.output;
                const prevHoverNode = this.state.hover.node;

                let hitNode = this.hitTestNode(mx, my);
                let hitOut = null;

                for (let i = this.data.flowchart.nodes.length - 1; i >= 0; i--) {
                    const n = this.data.flowchart.nodes[i];
                    const res = this.hitTestOutput(n, mx, my);
                    if (res) {
                        hitOut = res;
                        hitNode = n;
                        break;
                    }
                }
                
                this.state.hover.node = hitNode;
                this.state.hover.output = hitOut;
                this.state.hover.connection = (!hitNode) ? this.hitTestConnection(mx, my) : null;

                if (hitOut) {
                    this.canvas.style.cursor = 'pointer';
                } else if (this.state.hover.connection) {
                    this.canvas.style.cursor = 'pointer';
                } else if (hitNode) {
                    if (this.isSelected(hitNode)) {
                        const resizeHit = this.hitTestResize(mx, my);
                        this.canvas.style.cursor = resizeHit ? (resizeHit.dir === 'w' ? 'ew-resize' : 'ns-resize') : 'grab';
                    } else {
                        this.canvas.style.cursor = 'grab';
                    }
                } else {
                    this.canvas.style.cursor = 'default';
                }
                
                const outputChanged = (prevHoverOut?.output !== hitOut?.output);
                const nodeChanged = (prevHoverNode !== hitNode);
                
                if (outputChanged || nodeChanged) {
                    this.render();
                }
            }
            this.state.lastMouse = { x: e.clientX, y: e.clientY };
        } 
        
        // --- 3. MOUSE UP ---
        else if (type === 'up') {
            if (this.state.marqueeStart) {
                this.applyMarqueeSelection(e.shiftKey);
                this.state.marqueeStart = null;
                this.state.marqueeCurrent = null;
                this.render();
            }

            if (this.state.resizing) {
                this.state.resizing = false;
                this.state.resizeTarget = null;
                this.canvas.style.cursor = 'default';
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

            if (this.state.mode === 'view') {
                this.canvas.style.cursor = this.state.isSpacePressed ? 'grab' : 'default';
            } else {
                this.canvas.style.cursor = 'default';
            }
        }
    }

    applyMarqueeSelection(isShift) {
        if (!this.state.marqueeStart || !this.state.marqueeCurrent) return;

        const x1 = Math.min(this.state.marqueeStart.x, this.state.marqueeCurrent.x);
        const y1 = Math.min(this.state.marqueeStart.y, this.state.marqueeCurrent.y);
        const x2 = Math.max(this.state.marqueeStart.x, this.state.marqueeCurrent.x);
        const y2 = Math.max(this.state.marqueeStart.y, this.state.marqueeCurrent.y);
        const marqueeRect = { left: x1, top: y1, right: x2, bottom: y2 };

        if (Math.abs(x2 - x1) < 5 && Math.abs(y2 - y1) < 5) return;

        const candidateNodes = [];
        const candidateConns = [];

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

        this.data.flowchart.nodes.forEach(node => {
            if (!node.outputs) return;
            node.outputs.forEach((out, idx) => {
                if (out.cnSID && out.enable) {
                    const target = this.data.flowchart.nodes.find(n => n.sid === out.cnSID);
                    if (target) {
                        const pStart = this.getOutputPos(node, idx);
                        const pEnd = this.getNodeInputPos(target);
                        const cpDist = Math.abs(pEnd.x - pStart.x) * 0.5;
                        const cp1 = { x: pStart.x + cpDist, y: pStart.y };
                        const cp2 = { x: pEnd.x - cpDist, y: pEnd.y };

                        const minX = Math.min(pStart.x, pEnd.x, cp1.x, cp2.x);
                        const maxX = Math.max(pStart.x, pEnd.x, cp1.x, cp2.x);
                        const minY = Math.min(pStart.y, pEnd.y, cp1.y, cp2.y);
                        const maxY = Math.max(pStart.y, pEnd.y, cp1.y, cp2.y);
                        const connRect = { left: minX - 5, top: minY - 5, right: maxX + 5, bottom: maxY + 5 };

                        if (Utils.isRectOverlap(marqueeRect, connRect)) {
                            candidateConns.push({ output: out, sourceNode: node });
                        }
                    }
                }
            });
        });

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
        if (!this.data.flowchart) return null;
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
            btnDel.disabled = true;
            btnAddOut.disabled = true;
            btnEnable.disabled = true;
            btnStart.disabled = true;
            btnDelOut.disabled = true;
        } 
        else if (this.state.selectionType === 'connection') {
            const title = count === 1 ? 'Connection Selected' : `Selection (${count} connections)`;
            panel.innerHTML = `<div class="prop-group"><h3>${title}</h3><p style="color:#aaa">Press Delete to remove connection.</p></div>`;
            btnDel.disabled = false;
            btnAddOut.disabled = true;
            btnEnable.disabled = true;
            btnStart.disabled = true;
            btnDelOut.disabled = true;
        } 
        else if (this.state.selectionType === 'node') {
            btnDel.disabled = false;
            if (count === 1) {
                this.generateProperties(this.state.selection[0]);
                btnAddOut.disabled = false;
                btnEnable.disabled = false; 
                btnStart.disabled = false;
            } else {
                panel.innerHTML = `<div class="prop-group"><h3>Multiple Selection (${count} items)</h3><p style="color:#aaa">Properties editing is disabled for multiple items.</p></div>`;
                btnAddOut.disabled = true;
                btnEnable.disabled = true; 
                btnStart.disabled = true;
                btnDelOut.disabled = true;
            }
        }
    }

    // --- LOGIC & CRUD ---

    connect(source, output, target) {
        output.cnSID = target.sid;
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

    addNode(screenX, screenY) {
        const wp = Utils.screenToWorld(screenX, screenY, this.view.panX, this.view.panY, this.view.zoom);
        const defaultOutputsCount = 1;
        const calcH = CONFIG.dims.headerH + (defaultOutputsCount * CONFIG.dims.rowH) + CONFIG.dims.footerH + 10;

        const newNode = {
            sid: Utils.uuid(), 
            pnSIDs: [], poSIDs: [], nodeSIDs: [],
            x: wp.x - 210, 
            y: wp.y - (calcH / 2), 
            w: 420, 
            h: calcH,
            t: "", s: false, e: true, c: "New Node",
            pi: 0, ty: "dictionary", pr: false, prfsid: null, prfnsid: null,
            outputs: [{ 
                sid: Utils.uuid()+1, 
                cnSID: null, 
                name: "Option 1", 
                value: "", 
                enable: true, 
                default: false 
            }]
        };
        
        this.data.flowchart.nodes.push(newNode);
        this.data.ui.nodes.push({ 
            node: { propertiesBar: {}, nodeTable: {}, color: [0.8, 0.8, 0.8, 1] }, 
            outputs: [{ color: [0, 0, 0, 1], linkMode: "line", propertiesBar: {} }] 
        });
        
        this.select(newNode);
        this.render();
    }

    deleteSelection() {
        if (this.state.selection.length === 0) return;
        if (this.state.selectionType === 'node') {
            const nodesToDelete = [...this.state.selection];
            nodesToDelete.forEach(node => this._deleteNodeInternal(node));
            this.selectSingle(null);
            this.state.selectionType = 'none';
        } 
        else if (this.state.selectionType === 'connection') {
            this.state.selection.forEach(item => {
                if (item.output) item.output.cnSID = null;
            });
            this.state.selection = [];
            this.state.selectionType = 'none';
        }
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
        if (!this.clipboard || !this.clipboard.items) return;
        const wp = Utils.screenToWorld(screenX, screenY, this.view.panX, this.view.panY, this.view.zoom);
        this.selectSingle(null);

        this.clipboard.items.forEach(item => {
            const newNode = JSON.parse(JSON.stringify(item.logic));
            newNode.sid = Utils.uuid();
            newNode.x = wp.x + (item.logic.x - this.clipboard.center.x);
            newNode.y = wp.y + (item.logic.y - this.clipboard.center.y);
            newNode.pnSIDs = []; newNode.poSIDs = []; newNode.nodeSIDs = [];
            if (newNode.outputs) {
                newNode.outputs.forEach(out => { out.sid = Utils.uuid(); out.cnSID = null; });
            }
            const newUiNode = JSON.parse(JSON.stringify(item.ui));
            this.data.flowchart.nodes.push(newNode);
            this.data.ui.nodes.push(newUiNode);
            this.addToSelection(newNode);
        });
        this.render();
    }

    // --- RENDERING ---

    render() {
        if (!this.data.flowchart) return;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawGrid();
        
        this.data.flowchart.nodes.forEach((node, nIdx) => {
            node.outputs?.forEach((out, oIdx) => {
                if (out.cnSID && out.enable) {
                    const target = this.data.flowchart.nodes.find(n => n.sid === out.cnSID);
                    if (target) this.drawConnection(node, nIdx, out, oIdx, target);
                }
            });
        });

        if (this.state.connectionStart) {
            const start = this.getOutputPos(this.state.connectionStart.node, 
                this.state.connectionStart.node.outputs.indexOf(this.state.connectionStart.output));
            const rect = this.canvas.getBoundingClientRect();
            let end = this.state.hover.node ? this.getNodeInputPos(this.state.hover.node) : { 
                x: this.state.lastMouse.x - rect.left, 
                y: this.state.lastMouse.y - rect.top 
            };
            ctx.beginPath();
            ctx.strokeStyle = '#fff';
            ctx.setLineDash([5, 5]);
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        this.data.flowchart.nodes.forEach((node, i) => this.drawNode(node, i));

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
            node.outputs.forEach((out, i) => this.drawOutput(node, out, i, pos, startY, outputNameColor));
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

    drawOutput(node, out, idx, pos, startY, nameColor) {
        const rh = CONFIG.dims.rowH * this.view.zoom;
        const yOff = startY + (idx * rh);
        const textY = pos.y + yOff + rh/2;
        this.ctx.textAlign = 'right';
        let currentX = pos.x + (node.w * this.view.zoom) - (15 * this.view.zoom);
        const fontBaseSize = Math.max(9, 12 * this.view.zoom);
        if (out.default) {
            this.ctx.font = `bold ${Math.max(8, 10 * this.view.zoom)}px sans-serif`;
            this.ctx.fillStyle = '#4caf50';
            const defText = ' (Default)';
            this.ctx.fillText(defText, currentX, textY);
            currentX -= this.ctx.measureText(defText).width;
        }
        if (out.value) {
            this.ctx.font = `${fontBaseSize}px sans-serif`;
            this.ctx.fillStyle = '#ccc';
            const valText = `: ${out.value}`;
            this.ctx.fillText(valText, currentX, textY);
            currentX -= this.ctx.measureText(valText).width;
        }
        this.ctx.font = `bold ${fontBaseSize}px sans-serif`;
        this.ctx.fillStyle = nameColor; 
        this.ctx.fillText(out.name, currentX, textY);
        const cx = pos.x + node.w * this.view.zoom;
        const cy = pos.y + yOff + rh/2;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, CONFIG.dims.dotRadius * this.view.zoom, 0, Math.PI*2);
        this.ctx.fillStyle = (this.state.hover.output?.output === out) ? '#fff' : (out.cnSID ? CONFIG.colors.selection : '#444');
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.textAlign = 'left'; 
    }

    resetView() {
        if (!this.data.flowchart || this.data.flowchart.nodes.length === 0) {
            this.view = { zoom: 1, panX: 0, panY: 0 };
            this.render();
            return;
        }
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
        const padding = 50;
        const canvasW = this.canvas.width - (padding * 2);
        const canvasH = this.canvas.height - (padding * 2);
        let newZoom = Math.min(canvasW / (maxX - minX), canvasH / (maxY - minY));
        newZoom = Math.max(CONFIG.zoom.min, Math.min(newZoom, 1));
        this.view.zoom = newZoom;
        this.view.panX = (this.canvas.width / 2) - (((minX + maxX) / 2) * newZoom);
        this.view.panY = (this.canvas.height / 2) - (((minY + maxY) / 2) * newZoom);
        document.getElementById('zoom-level').textContent = Math.round(this.view.zoom * 100) + '%';
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
        p.querySelectorAll('.node-input').forEach(el => el.oninput = e => { node[e.target.dataset.key] = e.target.value; this.render(); });
        p.querySelectorAll('.node-check').forEach(el => el.onchange = e => { 
            if(e.target.dataset.key === 's' && e.target.checked) this.data.flowchart.nodes.forEach(n=>n.s=false);
            node[e.target.dataset.key] = e.target.checked; 
            this.render(); 
        });
        p.querySelectorAll('.out-input').forEach(el => el.oninput = e => {
            let v = e.target.value;
            if(e.target.tagName === 'TEXTAREA') v = v.replace(/\n/g, '\\n');
            node.outputs[e.target.dataset.idx][e.target.dataset.key] = v;
            this.render();
        });
        p.querySelectorAll('.out-check').forEach(el => el.onchange = e => {
            const idx = e.target.dataset.idx;
            const key = e.target.dataset.key;
            if (key === 'default' && e.target.checked) node.outputs.forEach(o => o.default = false);
            node.outputs[idx][key] = e.target.checked;
            this.generateProperties(node);
            this.render();
        });
        const nodeIdx = this.data.flowchart.nodes.indexOf(node);
        document.getElementById('prop-add-out').onclick = () => {
            node.outputs.push({ sid: Utils.uuid(), name: "Option", value:"", enable:true, default:false });
            node.h += CONFIG.dims.rowH; 
            if (this.data.ui.nodes[nodeIdx]) this.data.ui.nodes[nodeIdx].outputs.push({ color: [0,0,0,1], linkMode: "line", propertiesBar: {} });
            this.generateProperties(node); this.render();
        };
        p.querySelectorAll('[data-del-out]').forEach(b => b.onclick = e => {
            const outIdx = parseInt(e.target.dataset.delOut);
            node.outputs.splice(outIdx, 1);
            node.h = Math.max(this.getMinNodeSize(node).h, node.h - CONFIG.dims.rowH);
            if (this.data.ui.nodes[nodeIdx] && this.data.ui.nodes[nodeIdx].outputs) this.data.ui.nodes[nodeIdx].outputs.splice(outIdx, 1);
            this.generateProperties(node); this.render();
        });
    }

    showContextMenu(e) {
        const menu = document.getElementById('context-menu');
        const items = [];
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        if (this.state.hover.connection) {
            items.push({ txt: 'Delete Connection', fn: () => { this.state.hover.connection.output.cnSID = null; this.render(); }});
        } else if (this.state.hover.node) {
            const n = this.state.hover.node;
            if (!this.isSelected(n)) this.selectSingle(n);
            const count = this.state.selection.length;
            items.push({ txt: 'Copy', fn: () => this.copyNode() });
            items.push({ txt: count > 1 ? `Delete ${count} nodes` : 'Delete node', fn: () => this.deleteSelection() });
            items.push({ txt: '----------------', fn: () => {} });
            items.push({ txt: n.e ? 'Disable' : 'Enable', fn: () => { n.e = !n.e; this.render(); }});
            items.push({ txt: 'Set Start', fn: () => { this.data.flowchart.nodes.forEach(x=>x.s=false); n.s=true; this.render(); }});
        } else {
            items.push({ txt: 'Add Node', fn: () => this.addNode(e.clientX, e.clientY) });
            if (this.clipboard) items.push({ txt: 'Paste Node', fn: () => this.pasteNode(mx, my) });
        }
        menu.innerHTML = items.map((i, idx) => i.txt.startsWith('---') ? `<div style="border-top:1px solid #444; margin:4px 0;"></div>` : `<div class="ctx-item" data-i="${idx}">${i.txt}</div>`).join('');
        menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
        menu.classList.add('active');
        menu.onclick = (evt) => { const idx = evt.target.dataset.i; if(idx !== undefined) { items[idx].fn(); menu.classList.remove('active'); }};
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
            this.data.original = JSON.parse(JSON.stringify(this.data.flowchart));
            ind.textContent = "EDIT MODE"; ind.className = "edit-mode";
            tb.classList.add('active'); c.classList.add('editing');
            document.getElementById('properties-panel').classList.add('active');
            document.getElementById('menu-edit-wrapper').style.opacity = "1"; 
            document.getElementById('btn-toggle-mode').textContent = "Save & Exit";
            document.getElementById('btn-cancel-edit').style.display = "block";
            document.getElementById('edit-hint').style.display = 'block';
        } else {
            ind.textContent = "VIEW MODE"; ind.className = "view-mode";
            tb.classList.remove('active'); c.classList.remove('editing');
            document.getElementById('properties-panel').classList.remove('active');
            document.getElementById('btn-toggle-mode').textContent = "Enter Edit Mode";
            document.getElementById('btn-cancel-edit').style.display = "none";
            document.getElementById('edit-hint').style.display = 'none';
            this.select(null);
        }
    }

    rebuildConnectivity() {
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
                        target.pnSIDs.push(src.sid); target.poSIDs.push(out.sid);
                    } else out.cnSID = null;
                }
            });
        });
    }

    load(json, ui, filename = null) {
        this.data.flowchart = json; this.data.ui = ui;
        this.view.zoom = ui.flowchart?.z || 1;
        if (filename) {
            const nameFromHeader = filename.replace(/\.(json|uistate|miniflow)*$/gi, '');
            if (!json.name) json.name = nameFromHeader;
        }
        if (!json.name) json.name = 'flowchart';
        document.getElementById('filename-display').textContent = json.name;
        document.getElementById('zoom-level').textContent = Math.round(this.view.zoom * 100) + '%';
        this.resetView();
        document.getElementById('menu-edit-wrapper').style.opacity = "1";
        document.getElementById('menu-edit-wrapper').style.pointerEvents = "auto";
        this.render();
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
        this.load(c3Data, uiData);
        document.getElementById('status-bar').textContent = `Imported ${c3Data.nodes.length} nodes from MiniFlow`;
    }

    _miniFlowAutoLayout(nodes, rootSid) {
        const START_X = 300, START_Y = 300, X_STEP = 500, Y_STEP = 300;
        const visited = new Set(), queue = [{ sid: rootSid, layer: 0 }], layerNextY = {}; 
        nodes.forEach(n => { n.x = 0; n.y = 0; });
        while (queue.length > 0) {
            const { sid, layer } = queue.shift();
            if (visited.has(sid)) continue;
            visited.add(sid);
            const node = nodes.find(n => n.sid === sid);
            if (!node) continue;
            if (layerNextY[layer] === undefined) layerNextY[layer] = 0;
            node.x = START_X + (layer * X_STEP);
            node.y = START_Y + layerNextY[layer];
            layerNextY[layer] += Math.max(node.h, 200) + 50;
            if (node.outputs) node.outputs.forEach(out => { if (out.cnSID && !visited.has(out.cnSID)) queue.push({ sid: out.cnSID, layer: layer + 1 }); });
        }
        this.view.panX = 50 - (START_X * this.view.zoom); 
        this.view.panY = 50 - (START_Y * this.view.zoom);
    }
}