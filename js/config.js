// --- CONFIGURATION ---
export const CONFIG = {
    colors: {
        header: '#246aa2',
        headerStart: '#4caf50',
        outputNameDefault: '#4f99d4', 
        borderDefault: '#000000',
        selection: '#0078d4',
        connection: '#666666',
        connectionHover: '#ff9800',
        connectionDefault: '#4caf50',
        bgNode: '#2b2b2b',
        grid: '#3a3a3a',
        text: '#ffffff',
        textDim: '#888888',

        // Цвет рамки выделения
        marqueeStroke: '#0078d4',
        marqueeFill: 'rgba(0, 120, 212, 0.1)'
    },
    dims: {
        nodeW: 420,
        headerH: 32,      // Высота заголовка
        rowH: 33,         // Высота строки выхода
        footerH: 32,      // Высота подвала
        dotRadius: 8,
        borderRadius: 6,
        gridSize: 500,
        resizeMargin: 8
    },
    zoom: { min: 0.05, max: 2, stepIn: 1.1, stepOut: 0.9 },
    clickThreshold: 50
};

// --- MATH UTILS ---
export const Utils = {
    screenToWorld: (sx, sy, panX, panY, zoom) => ({ x: (sx - panX) / zoom, y: (sy - panY) / zoom }),
    worldToScreen: (wx, wy, panX, panY, zoom) => ({ x: wx * zoom + panX, y: wy * zoom + panY }),
    dist: (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y),
    isPointInRect: (px, py, rx, ry, rw, rh) => px >= rx && px <= rx + rw && py >= ry && py <= ry + rh,
    isPointNearBezier: (px, py, p0, p3, threshold) => {
        const cpDist = Math.abs(p3.x - p0.x) * 0.5;
        const p1 = { x: p0.x + cpDist, y: p0.y };
        const p2 = { x: p3.x - cpDist, y: p3.y };
        const steps = 20;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const it = 1 - t;
            const x = it*it*it*p0.x + 3*it*it*t*p1.x + 3*it*t*t*p2.x + t*t*t*p3.x;
            const y = it*it*it*p0.y + 3*it*it*t*p1.y + 3*it*t*t*p2.y + t*t*t*p3.y;
            if (Math.hypot(px - x, py - y) < threshold) return true;
        }
        return false;
    },
    isRectOverlap: (r1, r2) => {
        return !(r2.left > r1.right || 
                r2.right < r1.left || 
                r2.top > r1.bottom || 
                r2.bottom < r1.top);
    },
    uuid: () => Date.now() + Math.floor(Math.random() * 1000000)
};