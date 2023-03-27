if ('serviceWorker' in navigator)
	navigator.serviceWorker.register('/sw.js');

const title = document.getElementById('title');
const timer = document.getElementById('timer');

const canvasBundle = document.getElementById('canvas-bundle');
const canvasInitial = document.getElementById('canvas-initial');
const canvasForeground = document.getElementById('canvas-foreground');
const canvasBackground = document.getElementById('canvas-background');
const canvasEventCapture = document.getElementById('canvas-event-capture');

const flagImage = document.getElementById('flag');
const mineImage = document.getElementById('mine');

const menu = document.getElementById('menu');
const settingsToggle = document.getElementById('settings-toggle');
const settingsClose = document.getElementById('settings-close');
const restartButton = document.getElementById('restart-button');

/**
 * @type {CanvasRenderingContext2D}
 */
const ctxInitial = canvasInitial.getContext('2d');
/**
 * @type {CanvasRenderingContext2D}
 */
const ctxForeground = canvasForeground.getContext('2d');
/**
 * @type {CanvasRenderingContext2D}
 */
const ctxBackground = canvasBackground.getContext('2d', { alpha: false });

// gameState: 0 => not started, 1 => ongoing, 2 => lost, 3 => won; board.d: -1 => bomb, 0-8 => bomb count; board.s: 0 => covered, 1 => uncovered, 2 => flagged
const d = {
	gameState: 0,
	pos: {
		x: 0,
		y: 0,
	},
	delta: {
		x: 0,
		y: 0,
	},
	scale: 0.35,
	defaultScale: 0.35,
	pixelScale: 100,
	canvas: {
		width: 0,
		height: 0,
	},
	last: {
		pos: {
			x: 0,
			y: 0,
		},
		clickTS: 0,
		animationFrameId: 0,
	},
	dragging: false,
	board: [],
	settings: {
		open: false,
		flaggingMode: true,
		width: 32,
		height: 18,
		bombs: 100,
	},
	count: {
		flags: 0,
		covered: 0,
	},
	timeSpent: 0,
	touchState: {
		evCache: [],
		prevDiff: -1,
		cancelOffset: false,
	},
	updateList: {},
};

const updateTimer = ()  => {
	const seconds = d.timeSpent % 60, minutes = Math.floor(d.timeSpent / 60) % 60, hours = Math.floor(Math.floor(d.timeSpent / 60) / 60);
	
	let display = `${seconds}S`;
	if (seconds !== d.timeSpent)
		display = `${minutes}M ${display}`;

	if (minutes !== Math.floor(d.timeSpent / 60))
		display = `${hours}H ${display}`;

	timer.innerText = display;
};

const random = (min, max) => Math.round(min + (max - min) * Math.random());
const delay = async time => new Promise(resolve => setTimeout(resolve, time));

const get = (coord, offset = 0, rounded = false) => {
	let val = (offset - d.pos[coord]) / d.scale / d.pixelScale;
	if (rounded)
		val = Math.round(val);

	return val;
};

const queueUpdate = (x, y) => {
	d.updateList[x] ??= {};

	const e = d.updateList[x][y];
	if (e)
		e = false;
	else
		d.updateList[x][y] = true;
};

const clearCanvasInitial = () => {
	ctxInitial.clearRect(0, 0, d.canvas.width, d.canvas.height);
};

const renderCanvasInitial = () => {
	clearCanvasInitial();

	// Not started
	ctxInitial.beginPath();
	ctxInitial.roundRect(0, 0, d.settings.width * d.pixelScale, d.settings.height * d.pixelScale, 0.1 * d.pixelScale);

	ctxInitial.fillStyle = '#42a3cd';
	ctxInitial.fill();

	ctxInitial.fillStyle = '#191a19';
	ctxInitial.font = `400 ${1 * d.pixelScale}px Roboto, sans-serif`;
	ctxInitial.textAlign = 'center';
	ctxInitial.fillText(`Click to begin.`, (d.settings.width / 2) * d.pixelScale, (d.settings.height / 2) * d.pixelScale);
	return;
};

const prerenderCanvasBackground = () => {
	ctxBackground.fillStyle = '#191a19';
	ctxBackground.fillRect(0, 0, d.canvas.width, d.canvas.height);

	// Grid
	ctxBackground.lineCap = 'round';
	ctxBackground.lineWidth = 0.025 * d.pixelScale;
	ctxBackground.strokeStyle = '#374650';

	ctxBackground.beginPath();
	for (let pX = 1; pX < d.settings.width; pX++) {
		for (let pY = 0; pY < d.settings.height; pY++) {
			ctxBackground.moveTo(pX * d.pixelScale, (pY + 0.15) * d.pixelScale);
			ctxBackground.lineTo(pX * d.pixelScale, (pY + 0.85) * d.pixelScale);
		}
	}

	for (let pY = 1; pY < d.settings.height; pY++) {
		for (let pX = 0; pX < d.settings.width; pX++) {
			ctxBackground.moveTo((pX + 0.15) * d.pixelScale, pY * d.pixelScale);
			ctxBackground.lineTo((pX + 0.85) * d.pixelScale, pY * d.pixelScale);
		}
	}

	ctxBackground.stroke();
};

const renderCanvasBackground = () => {
	// Numbers
	ctxBackground.fillStyle = '#bcd0e1';
	ctxBackground.font = `400 ${0.5 * d.pixelScale}px Roboto, sans-serif`;
	ctxBackground.textAlign = 'center';
	for (let pX = 0; pX < d.settings.width; pX++) {
		for (let pY = 0; pY < d.settings.height; pY++) {
			if (d.board[pX][pY].d > 0)
				ctxBackground.fillText(`${d.board[pX][pY].d}`, (pX + 0.5) * d.pixelScale, (pY + 0.678) * d.pixelScale);
		}
	}
};

const renderCanvasForeground = () => {
	ctxForeground.clearRect(0, 0, d.canvas.width, d.canvas.height);

	// Flags
	ctxForeground.beginPath();
	const flags = [];
	for (let pX = 0; pX < d.settings.width; pX++) {
		for (let pY = 0; pY < d.settings.height; pY++) {
			if (d.board[pX][pY].s === 2) {
				ctxForeground.roundRect((pX + 0.075) * d.pixelScale, (pY + 0.075) * d.pixelScale, 0.85 * d.pixelScale, 0.85 * d.pixelScale, 0.1 * d.pixelScale);
				flags.push({ x: pX, y: pY });
			}
		}
	}

	ctxForeground.fillStyle = '#808e9f';
	ctxForeground.fill();

	for (const f of flags) {
		if (!(d.gameState === 2 && d.board[f.x][f.y].d === -1))
			ctxForeground.drawImage(flagImage, (f.x + 0.25) * d.pixelScale, (f.y + 0.25) * d.pixelScale, 0.5 * d.pixelScale, 0.5 * d.pixelScale);
	}
	
	// Fog
	ctxForeground.beginPath();
	for (let pX = 0; pX < d.settings.width; pX++) {
		for (let pY = 0; pY < d.settings.height; pY++) {
			if (d.board[pX][pY].s === 0)
				ctxForeground.roundRect((pX + 0.075) * d.pixelScale, (pY + 0.075) * d.pixelScale, 0.85 * d.pixelScale, 0.85 * d.pixelScale, 0.1 * d.pixelScale);
		}
	}

	ctxForeground.fillStyle = '#42a3cd';
	ctxForeground.fill();
};

const updateCanvasForeground = () => {
	const flaggedList = [];

	ctxForeground.beginPath();
	for (const x of Object.keys(d.updateList)) {
		const pX = +x;
		for (const y of Object.keys(d.updateList[x])) {
			if (!d.updateList[x][y])
				continue;

			const pY = +y;
			ctxForeground.clearRect(pX * d.pixelScale, pY * d.pixelScale, 1 * d.pixelScale, 1 * d.pixelScale);
			if (d.board[x][y].s === 0)
				ctxForeground.roundRect((pX + 0.075) * d.pixelScale, (pY + 0.075) * d.pixelScale, 0.85 * d.pixelScale, 0.85 * d.pixelScale, 0.1 * d.pixelScale);
			else if (d.board[x][y].s === 2)
				flaggedList.push({ x: pX, y: pY });
		}
	}

	ctxForeground.fillStyle = '#42a3cd';
	ctxForeground.fill();

	ctxForeground.beginPath();
	for (const pos of flaggedList)
		ctxForeground.roundRect((pos.x + 0.075) * d.pixelScale, (pos.y + 0.075) * d.pixelScale, 0.85 * d.pixelScale, 0.85 * d.pixelScale, 0.1 * d.pixelScale);

	ctxForeground.fillStyle = '#808e9f';
	ctxForeground.fill();

	for (const pos of flaggedList)
		ctxForeground.drawImage(flagImage, (pos.x + 0.25) * d.pixelScale, (pos.y + 0.25) * d.pixelScale, 0.5 * d.pixelScale, 0.5 * d.pixelScale);

	d.updateList = {};

	if (d.gameState === 2) {
		const bombs = [], uncoveredBombs = [];
		ctxForeground.beginPath();
		for (let pX = 0; pX < d.settings.width; pX++) {
			for (let pY = 0; pY < d.settings.height; pY++) {
				if (d.board[pX][pY].d !== -1)
					continue;

				if (d.board[pX][pY].s === 2)
					ctxForeground.roundRect((pX + 0.075) * d.pixelScale, (pY + 0.075) * d.pixelScale, 0.85 * d.pixelScale, 0.85 * d.pixelScale, 0.1 * d.pixelScale);
				else if (d.board[pX][pY].s === 1)
					uncoveredBombs.push({ x: pX, y: pY });

				bombs.push({ x: pX, y: pY });
			}
		}

		ctxForeground.fillStyle = '#808e9f';
		ctxForeground.fill();

		ctxForeground.beginPath();
		for (const pos of uncoveredBombs)
			ctxForeground.roundRect((pos.x + 0.075) * d.pixelScale, (pos.y + 0.075) * d.pixelScale, 0.85 * d.pixelScale, 0.85 * d.pixelScale, 0.1 * d.pixelScale);

		ctxForeground.fillStyle = '#cf3f3f';
		ctxForeground.fill();

		for (const b of bombs)
			ctxForeground.drawImage(mineImage, (b.x + 0.2) * d.pixelScale, (b.y + 0.2) * d.pixelScale, 0.6 * d.pixelScale, 0.6 * d.pixelScale);
	}
};

const updatePosition = () => {
	canvasBundle.style.transform = `translateX(${d.pos.x - (d.canvas.width / 2) * (1 - d.scale)}px) translateY(${d.pos.y - (d.canvas.height / 2) * (1 - d.scale)}px) scale(${d.scale})`;
};

const constrainPosition = () => {
	const maxX = (canvasEventCapture.clientWidth / 2), maxY = (canvasEventCapture.clientHeight / 2);
	const minX = maxX - (d.canvas.width * d.scale), minY = maxY - (d.canvas.height * d.scale);
	if (maxX - d.pos.x < 0)
		d.pos.x = maxX;
	else if (minX - d.pos.x > 0)
		d.pos.x = minX;

	if (maxY - d.pos.y < 0)
		d.pos.y = maxY;
	else if (minY - d.pos.y > 0)
		d.pos.y = minY;
};

const resetPosition = (transition = false) => {
	if (transition) {
		canvasBundle.style.transition = 'transform 2s ease';
		setTimeout(() => canvasBundle.style.transition = '', 2000);
	}

	d.scale = d.defaultScale, d.pos.x = (canvasEventCapture.clientWidth / 2) - (d.canvas.width * d.scale / 2), d.pos.y = (canvasEventCapture.clientHeight / 2) - (d.canvas.height * d.scale / 2);
	updatePosition();
};

let longpressTimeout;
const pointerDownHandler = (event) => {
	d.dragging = true, d.last.pos.x = event.offsetX, d.last.pos.y = event.offsetY, d.delta.x = 0, d.delta.y = 0;
	d.last.clickTS = Date.now();

	d.touchState.evCache.push(event);
	if (d.touchState.evCache.length > 1)
		clearTimeout(longpressTimeout);
	else
		longpressTimeout = setTimeout(() => navigator.vibrate(100), 250);
};

const pointerMoveHandler = (event) => {
	for (let i = 0; i < d.touchState.evCache.length; i++) {
		if (event.pointerId == d.touchState.evCache[i].pointerId) {
			d.touchState.evCache[i] = event;
			break;
		}
	}

	let offsetX = event.offsetX, offsetY = event.offsetY;
	if (d.touchState.evCache.length === 2) {
		const e1 = d.touchState.evCache[0], e2 = d.touchState.evCache[1];
		const curDiff = Math.sqrt((e2.clientX - e1.clientX) ** 2 + (e2.clientY - e1.clientY) ** 2);
		offsetX = (e1.clientX + e2.clientX) / 2, offsetY = (e1.clientY + e2.clientY) / 2;
	
		if (d.touchState.prevDiff > 0)
			zoomHandler(offsetX, offsetY, (d.touchState.prevDiff - curDiff) * 2.5);
		else if (d.touchState.prevDiff < 0)
			d.last.pos.x = offsetX, d.last.pos.y = offsetY;

		d.touchState.prevDiff = curDiff;
	}

	if (d.dragging) {
		if (d.touchState.cancelOffset) {
			d.touchState.cancelOffset = false;
			d.last.pos.x = offsetX, d.last.pos.y = offsetY;
		}

		d.pos.x += (offsetX - d.last.pos.x);
		d.pos.y += (offsetY - d.last.pos.y);

		d.delta.x += Math.abs(offsetX - d.last.pos.x), d.delta.y += Math.abs(offsetY - d.last.pos.y);
		d.last.pos.x = offsetX, d.last.pos.y = offsetY;

		if (d.delta.x ** 2 + d.delta.y ** 2 >= 100) {
			canvasEventCapture.style.cursor = 'grabbing';
			clearTimeout(longpressTimeout);
		}

		constrainPosition();
		updatePosition();
	}
};

const pointerCancelHandler = (event) => {
	canvasEventCapture.style.cursor = 'default';
	for (let i = 0; i < d.touchState.evCache.length; i++) {
		if (d.touchState.evCache[i].pointerId === event.pointerId) {
			d.touchState.evCache.splice(i, 1);
			break;
		}
	}

	if (d.touchState.evCache.length < 2) {
		if (d.touchState.prevDiff >= 0)
			d.touchState.cancelOffset = true;

		d.touchState.prevDiff = -1;
	}	

	if (d.touchState.evCache.length === 0)
		d.dragging = false;
};

const pointerUpHandler = (event) => {
	pointerCancelHandler(event);

	if (d.touchState.evCache.length < 2 && d.delta.x ** 2 + d.delta.y ** 2 < 100) {
		const pX = Math.floor(get('x', event.offsetX)), pY = Math.floor(get('y', event.offsetY));
		if (!(0 <= pX && pX < d.settings.width && 0 <= pY && pY < d.settings.height))
			return;

		const clickLength = Date.now() - d.last.clickTS;
		clearTimeout(longpressTimeout);

		let flag = false;
		if (event.pointerType === 'mouse' && clickLength < 250) {
			if (event.button === 0) {
				if (d.settings.flaggingMode)
		 			flag = true;
			} else if (event.button === 2) {
				if (!d.settings.flaggingMode)
		 			flag = true;
			}
		} else if (event.pointerType === 'touch') {
			if (clickLength < 250) {
				if (d.settings.flaggingMode)
					flag = true;
			} else if (250 <= clickLength) {
				if (!d.settings.flaggingMode)
					flag = true;
			}
		}

		if (flag && d.gameState === 1 && d.board[pX][pY].s !== 1)
			flagTile(pX, pY);
		else if (d.gameState !== 2 && d.gameState !== 3)
			uncoverTile(pX, pY);

		if (d.count.covered === d.settings.bombs - d.count.flags && d.gameState === 1) {
			d.gameState = 3;

			resetPosition(true);
			clearInterval(timerInterval);
			title.innerHTML = 'You won!';

			for (let x = 0; x < d.settings.width; x++) {
				for (let y = 0; y < d.settings.height; y++) {
					if (d.board[x][y].s === 0)
						d.board[x][y].s = 2;
				}
			}
		} 

		window.requestAnimationFrame((id) => {
			if (d.last.animationFrameId === id)
				return;

			d.last.animationFrameId = id;
			updateCanvasForeground();
		});
	}
	
};

const zoomHandler = (x, y, delta) => {
	const preX = get('x', x), preY = get('y', y);
	d.scale *= (1 - 0.001 * delta);

	if (d.scale / d.defaultScale < 0.65)
		d.scale = d.defaultScale * 0.65;
	else if (d.scale / d.defaultScale > 3.5)
		d.scale = d.defaultScale * 3.5;

	// Keep mouse position constant
	d.pos.x = -((preX * d.pixelScale * d.scale) - x), d.pos.y = -((preY * d.pixelScale * d.scale) - y);
	constrainPosition();
	updatePosition();
};

document.addEventListener('contextmenu', e => e.preventDefault());
canvasEventCapture.addEventListener('wheel', e => zoomHandler(e.offsetX, e.offsetY, e.deltaY));
canvasEventCapture.addEventListener('pointerdown', pointerDownHandler);
canvasEventCapture.addEventListener('pointermove', pointerMoveHandler);
document.addEventListener('pointerup', pointerUpHandler);
document.addEventListener('pointercancel', pointerCancelHandler);
document.addEventListener('pointerout', pointerCancelHandler);
document.addEventListener('pointerleave', pointerCancelHandler);

const flagTile = (x, y) => {
	if (d.board[x][y].s === 1)
		return;

	if (d.board[x][y].s === 0)
		d.board[x][y].s = 2, d.count.flags++, d.count.covered--;
	else
		d.board[x][y].s = 0, d.count.flags--, d.count.covered++;

	queueUpdate(x, y);
	title.innerHTML = `${d.settings.bombs - d.count.flags}`;
};

const uncoverTile = (x, y, user = true) => {
	if (d.board[x][y].s === 2 || (!user && d.board[x][y].s === 1))
		return;

	if (d.gameState === 0) {
		d.gameState = 1;
		title.innerHTML = `${d.settings.bombs - d.count.flags}`;
		generateMines(x, y);
		renderCanvasBackground();
		clearCanvasInitial();

		timerInterval = setInterval(() => {
			d.timeSpent++;
			updateTimer();
		}, 1000);
	}

	if (d.board[x][y].s === 1 && d.board[x][y].d > 0) {
		let flags = 0, covered = 0;
		squareRun(d.board, x, y, (val) => {
			if (val.s === 2)
				flags++;
			else if (val.s === 0)
				covered++;
		});

		if (flags + covered === d.board[x][y].d && user) {
			squareRun(d.board, x, y, (val, pX, pY) => {
				if (val.s === 0)
					flagTile(pX, pY);
			});
		} else if (flags === d.board[x][y].d) {
			squareRun(d.board, x, y, (_, pX, pY) => uncoverTile(pX, pY, false));
		}
	} else {
		if (d.board[x][y].s === 0) {
			d.board[x][y].s = 1, d.count.covered--;
			queueUpdate(x, y);
		}

		if (d.board[x][y].d === -1) {
			d.gameState = 2;

			resetPosition(true);
			clearInterval(timerInterval);
			title.innerHTML = 'You lost!';
		} else if (d.board[x][y].d === 0) {
			squareRun(d.board, x, y, (_, pX, pY) => uncoverTile(pX, pY, false));
		}
	}
};

const toggleSettings = (forceClose = false) => {
	if (forceClose)
		d.settings.open = false;
	else
		d.settings.open ^= true;

	if (d.settings.open)
		menu.style.display = 'flex', settingsClose.style.display = 'block', settingsToggle.style.color = '#bac0c8';
	else
		menu.style.display = 'none', settingsClose.style.display = 'none', settingsToggle.style.color = '';
};

const generateMines = (startX, startY) => {
	// Protect a 3x3 area around the starting pos
	d.board[startX][startY].d = -1;
	squareRun(d.board, startX, startY, (val) => {
		val.d = -1;
	});

	for (let bomb = 0; bomb < d.settings.bombs; bomb++) {
		let x, y;
		do {
			x = random(0, d.settings.width - 1), y = random(0, d.settings.height - 1);
		} while (d.board[x][y].d === -1);

		d.board[x][y].d = -1;
	}

	d.board[startX][startY].d = -2;
	squareRun(d.board, startX, startY, (val) => {
		val.d = -2;
	});

	for (let x = 0; x < d.settings.width; x++) {
		for (let y = 0; y < d.settings.height; y++) {
			if (d.board[x][y].d !== -1) {
				let res = 0;
				squareRun(d.board, x, y, (val) => {
					if (val.d === -1)
						res++;
				});

				d.board[x][y].d = res;
			}
		}
	}
};

const genBoard = (val, width, height) => {
	const strVal = JSON.stringify(val);
	return Array(width).fill(0).map(() => Array(height).fill(0).map(() => JSON.parse(strVal)));
};

/**
 * @param {any[][]} arr
 * @param {number} x 
 * @param {number} y 
 * @param {(val: any, x: number, y: number) => void} func 
 */
const squareRun = (arr, x, y, func) => {
	for (const offsetX of [ -1, 0, 1 ]) {
		for (const offsetY of [ -1, 0, 1 ]) {
			const pX = x + offsetX, pY = y + offsetY;
			if (pX === x && pY === y || !(0 <= pX && pX < arr.length && 0 <= pY && pY < arr[pX].length))
				continue;

			func(arr[pX][pY], pX, pY);
		}
	}
};

let timerInterval;
const setupGame = () => {
	d.gameState = 0, d.count.flags = 0, d.timeSpent = 0, d.count.covered = d.settings.width * d.settings.height;

	clearInterval(timerInterval);
	title.innerHTML = 'Minesweeper';
	updateTimer();

	d.board = genBoard({ d: -2, s: 0 }, d.settings.width, d.settings.height);
	renderCanvasInitial();
	renderCanvasForeground();
	prerenderCanvasBackground();
	resetPosition();
};

const resizeCanvas = () => {
	d.canvas.width = d.pixelScale * d.settings.width, d.canvas.height = d.pixelScale * d.settings.height;

	canvasBundle.style.width = `${d.canvas.width}px`, canvasBundle.style.height = `${d.canvas.height}px`;
	canvasInitial.width = d.canvas.width, canvasInitial.height = d.canvas.height;
	canvasForeground.width = d.canvas.width, canvasForeground.height = d.canvas.height;
	canvasBackground.width = d.canvas.width, canvasBackground.height = d.canvas.height;

	d.defaultScale = Math.min((canvasEventCapture.clientWidth - 40) / d.canvas.width, (canvasEventCapture.clientHeight - 40) / d.canvas.height);
};

const load = () => {
	if (canvasEventCapture.clientHeight > canvasEventCapture.clientWidth)
		[ d.settings.height, d.settings.width ] = [ d.settings.width, d.settings.height ];

	resizeCanvas();
	setupGame();

	restartButton.onclick = () => {
		setupGame();
		renderCanvasForeground();
		toggleSettings(true);
	};
	menu.onclick = (e) => e.stopPropagation();
	settingsToggle.onclick = () => toggleSettings();
	settingsClose.onclick = () => toggleSettings(true);
};

load();
