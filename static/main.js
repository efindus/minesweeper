if ('serviceWorker' in navigator)
	navigator.serviceWorker.register('/sw.js');

const title = document.getElementById('title');
const canvas = document.getElementById('canvas');

const flagImage = document.getElementById('flag');
const mineImage = document.getElementById('mine');

const menu = document.getElementById('menu');
const settingsToggle = document.getElementById('settings-toggle');
const settingsClose = document.getElementById('settings-close');
const restartButton = document.getElementById('restart-button');

/**
 * @type {CanvasRenderingContext2D}
 */
const ctx = canvas.getContext('2d');

// gameState: 0 => not started, 1 => ongoing, 2 => lost, 3 => won; board: -1 => bomb, 0-8 => bomb count; state: 0 => covered, 1 => uncovered, 2 => flagged
const d = {
	gameState: 0,
	pos: {
		x: 0,
		y: 0,
	},
	scale: 0.025,
	last: {
		pos: {
			x: 0,
			y: 0,
		},
		delta: {
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
	flaggingMode: true,
	settingsOpen: false,
	board: [],
	state: [],
	width: 32,
	height: 18,
	bombCount: 100,
	flagCount: 0,
	coveredCount: 0,
};

const random = (min, max) => Math.round(min + (max - min) * Math.random());
const delay = async time => new Promise(resolve => setTimeout(resolve, time));

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

	if (d.gameState === 0) {
		// Not started
		ctx.beginPath();
		ctx.roundRect((0 - x) / d.scale, (0 - y) / d.scale, d.width / d.scale, d.height / d.scale, 0.1 / d.scale);

		ctx.fillStyle = '#42a3cd';
		ctx.fill();

		ctx.fillStyle = '#191a19';
		ctx.font = `400 ${1 / d.scale}px Roboto, sans-serif`;
		ctx.textAlign = 'center';
		ctx.fillText(`Click to begin.`, ((d.width / 2) - x) / d.scale, ((d.height / 2) - y) / d.scale);
		return;
	}

	// Numbers and flags
	ctx.fillStyle = '#bcd0e1';
	ctx.font = `400 ${0.5 / d.scale}px Roboto, sans-serif`;
	ctx.textAlign = 'center';
	
	ctx.beginPath();
	const flags = [];
	for (let pX = 0; pX < d.width; pX++) {
		for (let pY = 0; pY < d.height; pY++) {
			if (d.state[pX][pY] === 2) {
				ctx.roundRect((pX + 0.075 - x) / d.scale, (pY + 0.075 - y) / d.scale, 0.85 / d.scale, 0.85 / d.scale, 0.1 / d.scale);
				flags.push({ x: pX, y: pY });
			} else if (d.state[pX][pY] === 1 && d.board[pX][pY] > 0) {
				ctx.fillText(`${d.board[pX][pY]}`, (pX - x + 0.5) / d.scale, (pY - y + 0.678) / d.scale);
			}
		}
	}

	ctx.fillStyle = '#808e9f';
	ctx.fill();

	for (const f of flags)
		ctx.drawImage(flagImage, (f.x + 0.25 - x) / d.scale, (f.y + 0.25 - y) / d.scale, 0.5 / d.scale, 0.5 / d.scale);
	
	// Fog
	ctx.beginPath();
	for (let pX = 0; pX < d.width; pX++) {
		for (let pY = 0; pY < d.height; pY++) {
			if (d.state[pX][pY] === 0)
				ctx.roundRect((pX + 0.075 - x) / d.scale, (pY + 0.075 - y) / d.scale, 0.85 / d.scale, 0.85 / d.scale, 0.1 / d.scale);
		}
	}

	ctx.fillStyle = '#42a3cd';
	ctx.fill();

	if (d.gameState === 2) {
		ctx.beginPath();
		const bombs = [];
		for (let pX = 0; pX < d.width; pX++) {
			for (let pY = 0; pY < d.height; pY++) {
				if (d.board[pX][pY] !== -1)
					continue;

				if (d.state[pX][pY] !== 2)
					bombs.push({ x: pX, y: pY });

				if (d.state[pX][pY] === 1)
					ctx.roundRect((pX + 0.075 - x) / d.scale, (pY + 0.075 - y) / d.scale, 0.85 / d.scale, 0.85 / d.scale, 0.1 / d.scale);
			}
		}

		ctx.fillStyle = '#cf3f3f';
		ctx.fill();

		for (const b of bombs)
			ctx.drawImage(mineImage, (b.x + 0.2 - x) / d.scale, (b.y + 0.2 - y) / d.scale, 0.6 / d.scale, 0.6 / d.scale);
	}

	// Grid
	ctx.lineCap = 'round';
	ctx.lineWidth = 0.025 / d.scale;
	ctx.strokeStyle = '#374650';

	ctx.beginPath();
	for (let pX = 1; pX < d.width; pX++) {
		for (let pY = 0; pY < d.height; pY++) {
			ctx.moveTo((pX - x) / d.scale, (pY + 0.15 - y) / d.scale);
			ctx.lineTo((pX - x) / d.scale, (pY + 0.85 - y) / d.scale);
		}
	}

	for (let pY = 1; pY < d.height; pY++) {
		for (let pX = 0; pX < d.width; pX++) {
			ctx.moveTo((pX + 0.15 - x) / d.scale, (pY - y) / d.scale);
			ctx.lineTo((pX + 0.85 - x) / d.scale, (pY - y) / d.scale);
		}
	}

	ctx.stroke();
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

const constrainPosition = () => {
	const sX = (d.last.canvasSize.width / 2), sY = (d.last.canvasSize.height / 2);
	if (sX - d.pos.x < 0)
		d.pos.x = sX;
	else if (sX - d.pos.x > d.width / d.scale)
		d.pos.x = -(d.width / d.scale) + sX;

	if (sY - d.pos.y < 0)
		d.pos.y = sY;
	else if (sY - d.pos.y > d.height / d.scale)
		d.pos.y = -(d.height / d.scale) + sY;
};

const resetPosition = () => {
	d.scale = 0.025, d.pos.x = -(d.width / (2 * d.scale)) + (d.last.canvasSize.width / 2), d.pos.y = -(d.height / (2 * d.scale)) + (d.last.canvasSize.height / 2);
};

const canvasOnResize = new ResizeObserver(updateCanvas);
canvasOnResize.observe(canvas);

canvas.addEventListener('mousemove', (event) => {
	if (d.dragging) {
		d.pos.x += (event.offsetX - d.last.pos.x);
		d.pos.y += (event.offsetY - d.last.pos.y);

		d.last.pos.x = event.offsetX, d.last.pos.y = event.offsetY, d.last.delta.x += Math.abs(event.offsetX), d.last.delta.y += Math.abs(event.offsetY);
		if (d.last.delta.x ** 2 + d.last.delta.y ** 2 >= 100)
			canvas.style.cursor = 'grabbing';

		constrainPosition();
		renderCanvas();
	}
});

canvas.addEventListener('wheel', (event) => {
	const preX = get('x', event.offsetX), preY = get('y', event.offsetY);
	d.scale *= (1 + 0.001 * event.deltaY);
	if (d.scale < 0.003)
		d.scale = 0.003;
	else if (d.scale > 0.04)
		d.scale = 0.04;

	// Keep mouse position constant
	d.pos.x = -((preX / d.scale) - event.offsetX), d.pos.y = -((preY / d.scale) - event.offsetY);
	constrainPosition();
	renderCanvas();
});

canvas.addEventListener('mousedown', (event) => {
	d.last.pos.x = event.offsetX, d.last.pos.y = event.offsetY, d.last.delta.x = 0, d.last.delta.y = 0;
	d.dragging = true;
	d.last.clickTS = Date.now();
	
});

const flagTile = (x, y) => {
	if (d.state[x][y] === 1)
		return;

	if (d.state[x][y] === 0)
		d.state[x][y] = 2, d.flagCount++, d.coveredCount--;
	else
		d.state[x][y] = 0, d.flagCount--, d.coveredCount++;

	title.innerHTML = `${d.bombCount - d.flagCount}`;
};

const uncoverTile = (x, y, user = true) => {
	if (d.state[x][y] === 2 || (!user && d.state[x][y] === 1))
		return;

	if (d.gameState === 0) {
		d.gameState = 1;
		title.innerHTML = `${d.bombCount - d.flagCount}`;
	}

	if (d.state[x][y] === 1 && d.board[x][y] > 0) {
		let flags = 0, covered = 0;
		squareRun(d.state, x, y, (val) => {
			if (val === 2)
				flags++;
			else if (val === 0)
				covered++;
		});

		if (flags + covered === d.board[x][y] && user) {
			squareRun(d.state, x, y, (val, pX, pY) => {
				if (val === 0)
					flagTile(pX, pY);
			});
		} else if (flags === d.board[x][y]) {
			squareRun(d.board, x, y, (_, pX, pY) => uncoverTile(pX, pY, false));
		}
	} else {
		d.state[x][y] = 1, d.coveredCount--;
		if (d.board[x][y] === -1) {
			d.gameState = 2;
			resetPosition();

			title.innerHTML = 'You lost!';
		} else if (d.board[x][y] === 0) {
			squareRun(d.board, x, y, (_, pX, pY) => uncoverTile(pX, pY, false));
		}
	}
};

document.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('mouseup', (event) => {
	d.dragging = false;
	canvas.style.cursor = 'default';

	if (d.last.delta.x ** 2 + d.last.delta.y ** 2 < 100) {
		const pX = Math.floor(get('x', event.offsetX)), pY = Math.floor(get('y', event.offsetY));

		const clickLength = Date.now() - d.last.clickTS;

		let flag = false;
		// if (clickLength < 250) {
		// 	if (d.flaggingMode)
		// 		flag = true;
		// } else if (250 <= clickLength) {
		// 	if (!d.flaggingMode)
		// 		flag = true;
		// }
		if (clickLength < 250) {
			if (event.button === 0) {
				if (d.flaggingMode)
		 			flag = true;
			} else if (event.button === 2) {
				if (!d.flaggingMode)
		 			flag = true;
			}
		}

		if (flag && d.gameState === 1 && d.state[pX][pY] !== 1)
			flagTile(pX, pY);
		else if (d.gameState !== 2 && d.gameState !== 3)
			uncoverTile(pX, pY);

		if (d.coveredCount === d.bombCount - d.flagCount && d.gameState === 1) {
			d.gameState = 3;
			title.innerHTML = 'You won!';
			resetPosition();

			for (let x = 0; x < d.width; x++) {
				for (let y = 0; y < d.height; y++) {
					if (d.state[x][y] === 0)
						d.state[x][y] = 2;
				}
			}
		} 

		renderCanvas();
	}
	
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

const genBoard = (val, width, height) => {
	return Array(width).fill(0).map(() => Array(height).fill(val));
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

/**
 * @param {any[][]} arr 
 * @param {any} val 
 * @param {number} x 
 * @param {number} y 
 */
const getValNearby = (arr, val, x, y) => {
	let res = 0;
	squareRun(arr, x, y, v => {
		if (v === val)
			res++;
	});

	return res;
};

const setupGame = () => {
	resetPosition();
	d.gameState = 0, d.flagCount = 0, d.coveredCount = d.width * d.height;
	title.innerHTML = 'Minesweeper';

	d.board = genBoard(-2, d.width, d.height);
	d.state = genBoard(0, d.width, d.height);
	
	for (let bomb = 0; bomb < d.bombCount; bomb++) {
		let x, y;
		do {
			x = random(0, d.width - 1), y = random(0, d.height - 1);
		} while (d.board[x][y] === -1);

		d.board[x][y] = -1;
	}

	for (let x = 0; x < d.width; x++) {
		for (let y = 0; y < d.height; y++) {
			if (d.board[x][y] !== -1)
				d.board[x][y] = getValNearby(d.board, -1, x, y);
		}
	}
};

const load = () => {
	setupGame();

	restartButton.onclick = () => {
		setupGame();
		renderCanvas();
		toggleSettings(true);
	};
	menu.onclick = (e) => e.stopPropagation();
	settingsToggle.onclick = () => toggleSettings();
	settingsClose.onclick = () => toggleSettings(true);
};

load();
