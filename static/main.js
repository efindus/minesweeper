if ('serviceWorker' in navigator)
	navigator.serviceWorker.register('/sw.js');

const canvas = document.getElementById('canvas');

const menu = document.getElementById('menu');
const settingsToggle = document.getElementById('settings-toggle');
const settingsClose = document.getElementById('settings-close');
const restartButton = document.getElementById('restart-button');

/**
 * @type {CanvasRenderingContext2D}
 */
const ctx = canvas.getContext('2d');

const d = {
	pos: {
		x: 0,
		y: 0,
	},
	scale: 0.01,
	last: {
		pos: {
			x: 0,
			y: 0,
		},
		canvasSize: {
			width: 0,
			height: 0,
		},
		clickTS: 0,
	},
	dragging: false,
	settingsOpen: false,
};

const get = (coord, offset = 0, rounded = false) => {
	let val = (-d.pos[coord] + offset) * d.scale;
	if (rounded)
		val = Math.round(val);

	return val;
};

const renderCanvas = () => {
	const width = canvas.clientWidth, height = canvas.clientHeight;
	const x = get('x'), y = get('y'), x2 = get('x', width), y2 = get('y', height);

	// Clear canvas
	ctx.fillStyle = '#191a19';
	ctx.fillRect(0, 0, width, height);

	ctx.fillStyle = 'white';
	ctx.fillRect((0 - x) / d.scale, (0 - y) / d.scale, 5 / d.scale, 5 / d.scale);
};

const updateCanvas = () => {
	const widthDiff = d.last.canvasSize.width - canvas.clientWidth, heightDiff = d.last.canvasSize.height - canvas.clientHeight;
	if (widthDiff || heightDiff) {
		canvas.setAttribute('width', canvas.clientWidth);
		canvas.setAttribute('height', canvas.clientHeight);

		d.last.canvasSize.width = canvas.clientWidth, d.last.canvasSize.height = canvas.clientHeight;
		d.pos.x -= widthDiff / 2, d.pos.y -= heightDiff / 2;
	}

	renderCanvas();
};

const canvasOnResize = new ResizeObserver(updateCanvas);
canvasOnResize.observe(canvas);

canvas.addEventListener('mousemove', (event) => {
	if (d.dragging) {
		d.pos.x += (event.offsetX - d.last.pos.x);
		d.pos.y += (event.offsetY - d.last.pos.y);
		d.last.pos.x = event.offsetX, d.last.pos.y = event.offsetY;
		renderCanvas();
	}
});

canvas.addEventListener('wheel', (event) => {
	const preX = get('x', event.offsetX), preY = get('y', event.offsetY);
	d.scale *= (1 + 0.001 * event.deltaY);

	// Keep mouse position constant
	d.pos.x = -((preX / d.scale) - event.offsetX), d.pos.y = -((preY / d.scale) - event.offsetY);
	renderCanvas();
});

canvas.addEventListener('mousedown', (event) => {
	d.last.pos.x = event.offsetX, d.last.pos.y = event.offsetY;
	d.dragging = true;
	d.last.clickTS = Date.now();
	canvas.style.cursor = 'grabbing';
});

document.addEventListener('mouseup', (event) => {
	d.dragging = false;
	canvas.style.cursor = 'default';
});

const toggleSettings = (forceClose = false) => {
	if (forceClose)
		d.settingsOpen = false;
	else
		d.settingsOpen ^= true;

	if (d.settingsOpen)
		menu.style.display = 'flex', settingsClose.style.display = 'block', settingsToggle.style.color = '#bac0c8';
	else
		menu.style.display = 'none', settingsClose.style.display = 'none', settingsToggle.style.color = '';
};

const load = () => {
	restartButton.onclick = () => {
		// idk do sth
		toggleSettings(true);
	};
	menu.onclick = (e) => e.stopPropagation();
	settingsToggle.onclick = () => toggleSettings();
	settingsClose.onclick = () => toggleSettings(true);
};

load();
