// if ('serviceWorker' in navigator)
// 	navigator.serviceWorker.register('/sw.js');

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
		frameTS: 0,
	},
	dragging: false,
	board: [],
	settings: {
		open: false,
		flaggingMode: true,
		width: 32,
		height: 18,
		bombs: 100,
		longpressDelay: 300,
		clickTimeout: 250,
		vibrationLength: 50,
		animationLength: 220,
	},
	count: {
		flags: 0,
		covered: 0,
	},
	timeSpent: 0,
	touchState: {
		evCache: [],
		prevDist: -1,
		cancelOffset: false,
	},
	colors: {
		bg: '#0d151d',
		fog: '#42a3cd',
		grid: '#384751',
		flagBg: '#808e9f',
		mineBg: '#cf3f3f',
		mineText: '#bcd0e1',
		initialText: '#0d151d',
	},
	updateList: {},
	animationBoard: [],
	animatingPosition: false,
	animationRequested: false,
};

class CubicBezier {
	cx;
	bx;
	ax;
	cy;
	by;
	ay;

	constructor(p1x = 0, p1y = 0, p2x = 1, p2y = 1) {
		this.cx = 3 * p1x;
		this.bx = 3 * (p2x - p1x) - this.cx;
		this.ax = 1 - this.cx - this.bx;
		this.cy = 3 * p1y;
		this.by = 3 * (p2y - p1y) - this.cy;
		this.ay = 1 - this.cy - this.by;

		return (t) => this.sampleCurveY(this.solveCurveX(t));
	}

	sampleCurveX(t) {
		return ((this.ax * t + this.bx) * t + this.cx) * t;
	}

	sampleCurveY(t) {
		return ((this.ay * t + this.by) * t + this.cy) * t;
	}

	sampleCurveDerivativeX(t) {
		return (3 * this.ax * t + 2 * this.bx) * t + this.cx;
	}

	solveCurveX(x) {
		const epsilon = 1e-6;

		if (x <= 0)
			return 0;

		if (x >= 1)
			return 1;

		let t2 = x, x2 = 0, d2 = 0;

		for (let i = 0; i < 8; i += 1) {
			x2 = this.sampleCurveX(t2) - x;
			if (Math.abs(x2) < epsilon)
				return t2;

			d2 = this.sampleCurveDerivativeX(t2);

			if (Math.abs(d2) < epsilon)
				break;

			t2 -= x2 / d2;
		}

		let t0 = 0, t1 = 1;
		t2 = x;
	
		while (t0 < t1) {
			x2 = this.sampleCurveX(t2);

			if (Math.abs(x2 - x) < epsilon)
				return t2;

			if (x > x2)
				t0 = t2;
			else
				t1 = t2;

			t2 = (t1 - t0) * 0.5 + t0;
		}

		return t2;
	}
}

const bezierEase = new CubicBezier(0.25, 0.1, 0.25, 1.0);

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

const getDir = (x, y, pX, pY) => {
	let direction = '';
	if (y < pY)
		direction += 'b';
	else if (pY < y)
		direction += 't';

	if (x < pX)
		direction += 'r';
	else if (pX < x)
		direction += 'l';

	return direction;
};

const recoverOffset = (offset) => {
	if (offset < 0.5)
		return 0.25 - offset;
	else
		return offset - 0.5;
};

const queueUpdate = (x, y, from = null, propagate = false, animation = d.settings.animationLength) => {
	const c = d.animationBoard[x][y];
	d.updateList[x] ??= {};

	let alreadyQueued = false;
	if (d.updateList[x][y] === true)
		alreadyQueued = true;
	else
		d.updateList[x][y] = true;

	if (from !== null)
		c.from = from;

	c.keep = animation;

	if (!propagate)
		return;

	squareRun(d.animationBoard, x, y, (val, pX, pY) => {
		if (x === pX || y === pY)
			val[getDir(pX, pY, x, y)] = animation;

		queueUpdate(pX, pY);
	});

	c.c = c.t = c.r = c.b = c.l = animation;
};

const dequeueUpdate = (x, y) => {
	delete d.updateList[x][y];
	if (!Object.keys(d.updateList[x]).length)
		delete d.updateList[x];
};

const requestAnimation = () => {
	d.animationRequested = true;
};

const reqAnimationLoop = (ts) => {
	const delta = ts - d.last.frameTS;
	d.last.frameTS = ts;
	if (d.animationRequested) {
		d.animationRequested = false;
		updateCanvasForeground(delta);
	}

	window.requestAnimationFrame(reqAnimationLoop);
};

const clearCanvasInitial = () => {
	ctxInitial.clearRect(0, 0, d.canvas.width, d.canvas.height);
};

const renderCanvasInitial = () => {
	clearCanvasInitial();

	// Not started
	ctxInitial.beginPath();
	ctxInitial.roundRect(0, 0, d.settings.width * d.pixelScale, d.settings.height * d.pixelScale, 0.1 * d.pixelScale);

	ctxInitial.fillStyle = d.colors.fog;
	ctxInitial.fill();

	ctxInitial.fillStyle = d.colors.initialText;
	ctxInitial.font = `400 ${1 * d.pixelScale}px Roboto, sans-serif`;
	ctxInitial.textAlign = 'center';
	ctxInitial.fillText(`Click to begin.`, (d.settings.width / 2) * d.pixelScale, (d.settings.height / 2) * d.pixelScale);
	return;
};

const prerenderCanvasBackground = () => {
	ctxBackground.fillStyle = d.colors.bg;
	ctxBackground.fillRect(0, 0, d.canvas.width, d.canvas.height);

	// Grid
	ctxBackground.lineCap = 'round';
	ctxBackground.lineWidth = 0.025 * d.pixelScale;
	ctxBackground.strokeStyle = d.colors.grid;

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
	ctxBackground.fillStyle = d.colors.mineText;
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

	ctxForeground.beginPath();
	ctxForeground.roundRect(0.075 * d.pixelScale, 0.075 * d.pixelScale, (d.settings.width - 0.075 * 2) * d.pixelScale, (d.settings.height - 0.075 * 2) * d.pixelScale, 0.1 * d.pixelScale);

	ctxForeground.fillStyle = d.colors.fog;
	ctxForeground.fill();
};

const updateCanvasForeground = (delta) => {
	// console.log(delta);
	const flaggedList = [], coveredList = [], aL = d.settings.animationLength;
	let ongoingAnimation = false;

	ctxForeground.beginPath();
	for (const x of Object.keys(d.updateList)) {
		const pX = +x;
		for (const y of Object.keys(d.updateList[x])) {
			const pY = +y, c = d.animationBoard[x][y];

			let updateLeft = 0;
			for (const animation of [ 't', 'r', 'b', 'l', 'c', 'keep' ]) {
				c[animation] -= delta;
				if (c[animation] < 0)
					c[animation] = 0;
				else
					updateLeft++;
			}

			if (c.c === 0)
				c.from = -1;

			if (updateLeft)
				ongoingAnimation = true;
			else
				dequeueUpdate(pX, pY);

			ctxForeground.clearRect(pX * d.pixelScale, pY * d.pixelScale, 1 * d.pixelScale, 1 * d.pixelScale);
			if (d.board[x][y].s === 0)
				coveredList.push({ x: pX, y: pY });
			else if (d.board[x][y].s === 2)
				flaggedList.push({ x: pX, y: pY });
		}
	}

	for (const color of [ d.colors.fog, d.colors.flagBg ]) {
		const cList = (color === d.colors.fog ? coveredList : flaggedList);

		for (const { x, y } of cList) {
			const c = d.animationBoard[x][y], b = d.board[x][y];

			squareRun(d.animationBoard, x, y, (val, pX, pY) => {
				if (x !== pX && y !== pY || d.board[pX][pY].s === 1)
					return;

				const direction = getDir(x, y, pX, pY);

				let progress = c[direction];
				if (b.s === d.board[pX][pY].s)
					progress = aL - progress;

				let offset = 0.25 * bezierEase(progress / aL), pos;
				if (x < pX)
					pos = 0.5 + offset;
				else if (pX < x)
					pos = 0.25 - offset;
				else if (y < pY)
					pos = 0.5 + offset;
				else if (pY < y)
					pos = 0.25 - offset;

				c[`p${direction}`] = pos;
			});
		}

		ctxForeground.beginPath();
		for (const { x, y } of cList) {
			const b = d.board[x][y], c = d.animationBoard[x][y];

			ctxForeground.roundRect((x + 0.075) * d.pixelScale, (y + 0.075) * d.pixelScale, 0.85 * d.pixelScale, 0.85 * d.pixelScale, 0.1 * d.pixelScale);

			squareRun(d.animationBoard, x, y, (val, pX, pY) => {
				if (d.board[pX][pY].s === 1)
					return;

				if (x !== pX && y !== pY) {
					const bX = d.board[pX][y], bY = d.board[x][pY], bXY = d.board[pX][pY],
					      cX = d.animationBoard[pX][y], cY = d.animationBoard[x][pY], cXY = d.animationBoard[pX][pY];

					const dir = getDir(x, y, pX, pY), dirY = dir[0], dirX = dir[1];

					let invertedCorner = (b.s === bX.s && bX.s === bY.s && bY.s !== bXY.s ||
					                      b.s === bX.s && bX.s === bY.s && bY.s === bXY.s && cXY.from !== -1);

					if (invertedCorner) {
						let offsetCX = recoverOffset(cX[`p${dirY}`]), offsetCY = recoverOffset(cY[`p${dirX}`]);
						if (x < pX)
							offsetCX = 0.5 + offsetCX;
						else if (pX < x)
							offsetCX = 0.25 - offsetCX;

						if (y < pY)
							offsetCY = 0.5 + offsetCY;
						else if (pY < y)
							offsetCY = 0.25 - offsetCY;

						if (cY.from === -1)
							ctxForeground.rect((x + c[`p${dirX}`]) * d.pixelScale, (y + offsetCY) * d.pixelScale, 0.25 * d.pixelScale, 0.25 * d.pixelScale);

						if (cX.from === -1)
							ctxForeground.rect((x + offsetCX) * d.pixelScale, (y + c[`p${dirY}`]) * d.pixelScale, 0.25 * d.pixelScale, 0.25 * d.pixelScale);
					} else {
						ctxForeground.rect((x + c[`p${dirX}`]) * d.pixelScale, (y + c[`p${dirY}`]) * d.pixelScale, 0.25 * d.pixelScale, 0.25 * d.pixelScale);
					}

					return;
				}

				let pos = c[`p${getDir(x, y, pX, pY)}`], rX = x, rY = y, rW, rH;
				if (x < pX)
					rH = 0.85, rW = 0.25, rY += 0.075, rX += pos;
				else if (pX < x)
					rH = 0.85, rW = 0.25, rY += 0.075, rX += pos;
				else if (y < pY)
					rW = 0.85, rH = 0.25, rX += 0.075, rY += pos;
				else if (pY < y)
					rW = 0.85, rH = 0.25, rX += 0.075, rY += pos;

				ctxForeground.rect(rX * d.pixelScale, rY * d.pixelScale, rW * d.pixelScale, rH * d.pixelScale);
			});
		}

		ctxForeground.fillStyle = color;
		ctxForeground.fill();
	}

	for (const pos of flaggedList) {
		const animationProgress = aL - d.animationBoard[pos.x][pos.y].c;
		const size = 0.7 - 0.2 * bezierEase(animationProgress / aL), coordinateOffset = (1 - size) / 2;

		ctxForeground.drawImage(flagImage, (pos.x + coordinateOffset) * d.pixelScale, (pos.y + coordinateOffset) * d.pixelScale, size * d.pixelScale, size * d.pixelScale);
	}

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

		ctxForeground.fillStyle = d.colors.flagBg;
		ctxForeground.fill();

		ctxForeground.beginPath();
		for (const pos of uncoveredBombs)
			ctxForeground.roundRect((pos.x + 0.075) * d.pixelScale, (pos.y + 0.075) * d.pixelScale, 0.85 * d.pixelScale, 0.85 * d.pixelScale, 0.1 * d.pixelScale);

		ctxForeground.fillStyle = d.colors.mineBg;
		ctxForeground.fill();

		for (const b of bombs)
			ctxForeground.drawImage(mineImage, (b.x + 0.2) * d.pixelScale, (b.y + 0.2) * d.pixelScale, 0.6 * d.pixelScale, 0.6 * d.pixelScale);
	}

	if (ongoingAnimation)
		requestAnimation();
};

const getElementPosition = (element, noOffset = false) => {
	const rect = element.getBoundingClientRect();
	const win = element.ownerDocument.defaultView;

	let bottom = rect.bottom + win.pageYOffset, right = rect.right + win.pageXOffset;
	if (!noOffset)
		bottom = document.documentElement.clientHeight - bottom, right = document.documentElement.clientWidth - right;

	return {
		top: rect.top + win.pageYOffset,
		left: rect.left + win.pageXOffset,
		bottom,
		right,
	};
};

const resetAnimation = (abort = false) => {
	if (abort) {
		const baseRect = getElementPosition(canvasEventCapture), bundleRect = getElementPosition(canvasBundle);
		d.pos.x = bundleRect.left - baseRect.left, d.pos.y = bundleRect.top - baseRect.top, d.scale = canvasBundle.getBoundingClientRect().width / d.canvas.width;
	}

	clearTimeout(resetAnimationTimeout);
	canvasBundle.style.transition = '', d.animatingPosition = false;
}

let resetAnimationTimeout;
const updatePosition = (transition = false, transitionTime = 2) => {
	if (transition) {
		canvasBundle.style.transition = `transform ${transitionTime}s ease`, d.animatingPosition = true;
		clearTimeout(resetAnimationTimeout);
		resetAnimationTimeout = setTimeout(() => resetAnimation(), (transitionTime * 1000) + 25);
	}

	canvasBundle.style.transform = `translateX(${d.pos.x - (d.canvas.width / 2) * (1 - d.scale)}px) translateY(${d.pos.y - (d.canvas.height / 2) * (1 - d.scale)}px) scale(${d.scale})`;
};

const setPosition = (boardX, boardY, scaleModifier = null) => {
	if (scaleModifier !== null)
		d.scale = d.defaultScale * scaleModifier;

	d.pos.x = -((boardX + 0.5) * d.scale * d.pixelScale) + (canvasEventCapture.clientWidth / 2), d.pos.y = -((boardY + 0.5) * d.scale * d.pixelScale) + (canvasEventCapture.clientHeight / 2);
};

const resetPosition = (transition = false) => {
	setPosition((d.settings.width / 2) - 0.5, (d.settings.height / 2) - 0.5, 1);
	updatePosition(transition);
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

let longpressTimeout;
const pointerDownHandler = (event) => {
	d.dragging = true, d.last.pos.x = event.offsetX, d.last.pos.y = event.offsetY;
	event.pOffsetX = event.offsetX, event.pOffsetY = event.offsetY;

	if (d.touchState.evCache.length === 0) {
		d.delta.x = 0, d.delta.y = 0, d.last.clickTS = Date.now();

		// const pX = Math.floor(get('x', event.offsetX)), pY = Math.floor(get('y', event.offsetY));
		if (event.pointerType === 'touch') {
			longpressTimeout = setTimeout(() => {
				pointerUpHandler({
					offsetX: event.pOffsetX,
					offsetY: event.pOffsetY,
				});
			}, d.settings.longpressDelay + 5);
		}
	} else {
		clearTimeout(longpressTimeout);
	}

	
	d.touchState.evCache.push(event);
};

const pointerMoveHandler = (event) => {
	event.pOffsetX = event.offsetX, event.pOffsetY = event.offsetY;
	for (let i = 0; i < d.touchState.evCache.length; i++) {
		if (event.pointerId == d.touchState.evCache[i].pointerId) {
			d.touchState.evCache[i] = event;
			break;
		}
	}

	let offsetX = event.offsetX, offsetY = event.offsetY;
	if (d.touchState.evCache.length === 2) {
		const e1 = d.touchState.evCache[0], e2 = d.touchState.evCache[1], dist = Math.sqrt((e2.pOffsetX - e1.pOffsetX) ** 2 + (e2.pOffsetY - e1.pOffsetY) ** 2);
		offsetX = (e1.pOffsetX + e2.pOffsetX) / 2, offsetY = (e1.pOffsetY + e2.pOffsetY) / 2;

		if (d.touchState.prevDist > 0)
			zoomHandler(offsetX, offsetY, 0, (dist * d.scale) / d.touchState.prevDist);
		else if (d.touchState.prevDist < 0)
			d.last.pos.x = offsetX, d.last.pos.y = offsetY;

		d.touchState.prevDist = dist;
	}

	if (d.dragging) {
		if (d.animatingPosition && d.gameState !== 2)
			resetAnimation(true);

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
		if (d.touchState.prevDist >= 0)
			d.touchState.cancelOffset = true;

		d.touchState.prevDist = -1;
	}	

	if (d.touchState.evCache.length === 0)
		d.dragging = false;
};

const pointerUpHandler = (event) => {
	if (d.touchState.evCache.length < 2 && d.delta.x ** 2 + d.delta.y ** 2 < 100) {
		const pX = Math.floor(get('x', event.offsetX)), pY = Math.floor(get('y', event.offsetY));
		if (!(0 <= pX && pX < d.settings.width && 0 <= pY && pY < d.settings.height))
			return;

		const clickLength = Date.now() - d.last.clickTS;

		d.delta.x = 69;
		clearTimeout(longpressTimeout);

		let flag = false;
		if (event.pointerType === 'mouse' && clickLength < d.settings.clickTimeout) {
			if (event.button === 0) {
				if (d.settings.flaggingMode)
		 			flag = true;
			} else if (event.button === 2) {
				if (!d.settings.flaggingMode)
		 			flag = true;
			}
		} else if (event.pointerType === 'touch') {
			if (clickLength < d.settings.longpressDelay) {
				if (d.settings.flaggingMode)
					flag = true;
			} else if (d.settings.longpressDelay <= clickLength) {
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
					if (d.board[x][y].s === 0) {
						d.board[x][y].s = 2;
						queueUpdate(x, y, 0, true);
					}
				}
			}
		} 

		requestAnimation();
	}
	
};

const zoomHandler = (x, y, delta, newScale = null) => {
	const preX = get('x', x), preY = get('y', y);
	
	if (newScale !== null)
		d.scale = newScale;
	else
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
// canvasEventCapture.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); });
// canvasEventCapture.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); });
canvasEventCapture.addEventListener('wheel', e => zoomHandler(e.offsetX, e.offsetY, e.deltaY));
canvasEventCapture.addEventListener('pointerdown', pointerDownHandler);
canvasEventCapture.addEventListener('pointermove', pointerMoveHandler);
canvasEventCapture.addEventListener('pointerup', pointerUpHandler);
document.addEventListener('pointerup', pointerCancelHandler);
document.addEventListener('pointercancel', pointerCancelHandler);
document.addEventListener('pointerout', pointerCancelHandler);
document.addEventListener('pointerleave', pointerCancelHandler);

const flagTile = (x, y) => {
	if (d.board[x][y].s === 1)
		return;

	let from;
	if (d.board[x][y].s === 0)
		d.board[x][y].s = 2, d.count.flags++, d.count.covered--, from = 0;
	else
		d.board[x][y].s = 0, d.count.flags--, d.count.covered++, from = 2;

	queueUpdate(x, y, from, true);
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

		setPosition(x, y, 3);
		updatePosition(true, 1.4);

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
			queueUpdate(x, y, 0, true);
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
	d.animationBoard = genBoard({ t: 0, r: 0, b: 0, l: 0, pt: 0.5, pr: 0.5, pb: 0.5, pl: 0.5, c: 0, from: -1, keep: 0, }, d.settings.width, d.settings.height);
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
	reqAnimationLoop();

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
