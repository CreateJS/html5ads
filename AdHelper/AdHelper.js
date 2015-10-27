/*
 * AdHelper
 * Visit http://createjs.com/ for documentation, updates and examples.
 *
 *
 * Copyright (c) 2015 gskinner.com, inc.
 *
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */

// namespace:
this.createjs = this.createjs || {};

(function(){
"use strict";
	
// constructor
	/**
	 * <strong>NOTE: This class is specifically designed to work in an advertising environment, where the ad is isolated
	 * to its own iframe. It can cause problems if there are multiple CreateJS experiences in the same document.</strong>
	 * 
	 * Class that provides a number of helpful capabilities for online advertisements such as:<ul>
	 * <li> detect if CreateJS is supported in the current browser
	 * <li> display alternate content
	 * <li> sleep/pause and mute the ad while it's in a background tab
	 * <li> sleep/pause after a delay & wake on interaction
	 * <li> watch framerate and sleep the ad if it is running slowly
	 * <li> time-sync playback to maintain duration even when framerate is slow
	 * <li> ensure full resolution graphics on high DPI screens
	 * </ul>
	 * These features work together. For example, sleep time will be deferred and performance
	 * measurements will be halted when an ad is paused due to being in a background tab.
	 * 
	 * Background tab detection is enabled automatically, and works in all browsers that support the page visibility API. This includes all
	 * modern browsers except IE <10, Opera Mini, and the Android Browser <4.4. Note that audio is currently muted, not
	 * paused, which can cause audio to become desynched. Use the "sleep" and "wake" events to pause/resume your audio
	 * if this is a problem.
	 * 
	 * Most methods can be chained to allow single line initialization. For example, this would
	 * create an ad helper that sleeps after 15s, and has alt content:
	 * 
	 * 	var ad = new AdHelper(myStage).setSleep(15).highDPI();
	 * 	ad.on("sleep", handleSleep, this);
	 * 
	 * @class AdHelper
	 * @param {Stage} stage The target Stage object.
	 * @extends EventDispatcher
	 */
	function AdHelper(stage) {
		this._stage = stage; // up here because its used by pixelRatio.
		
	// public properties:
		/**
		 * This listener will be removed from the Ticker when the ad sleeps, and added back when it wakes.
		 * By default this will be the stage, to stop updates when sleeping, however if you define your own tick
		 * handler that subsequently calls `stage.update` you should specify it instead.
		 * 
		 * Your listener can alternatively check the `paused` property on tick events, which will be true when the
		 * ad is asleep.
		 * 
		 * <strong>NOTE: if using `on` to add your tick listener, make sure to use the generated listener object as
		 * the tickListener. Example:</strong>
		 * 
		 * 	var listener = createjs.Ticker.on("tick", myTickFunction, scope);
		 * 	myAdHelper.setSleep(15, 3, 0, listener);
		 * 
		 * @property tickListener
		 * @type {Function|Object}
		 */
		this.tickListener = null;
		
		/**
		 * True when awake, false when sleeping.
		 * @property awake
		 * @type {Boolean}
		 * @readonly
		 */
		this.awake = true;
		
		/**
		 * Disables sleep if false. Set to true automatically when `setSleep()` is called.
		 * @property sleepEnabled
		 * @type {Boolean}
		 * @default false
		 */
		this.sleepEnabled = false;
		
		/**
		 * True when the ad is hidden (ex. in a background tab).
		 * @property hidden
		 * @type {Boolean}
		 * @readonly
		 */
		this.hidden = false;
		
		/**
		 * Returns the pixel ratio that is being used to draw the canvas on a high dpi device. On browsers that
		 * automatically utilize high dpi backing stores (like Safari), this returns the backingStorePixelRatio. For
		 * other browsers, this returns 1 by default. This is also affected by the `nominalScale` passed to `highDPI()`.
		 * 
		 * If you call the `highDPI()` method, then `pixelRatio` will be set to the resulting scale.
		 * 
		 * This value is primarily useful for loading appropriately sized bitmap images.
		 * 
		 * 	myAdHelper.highDPI();
		 * 	if (myAdHelper.pixelRatio > 1.5) {
		 * 		// load high res images.
		 * 	} else {
		 * 		// load low res images.
		 * 	}
		 * @property pixelRatio
		 * @type {Number}
		 * @readonly
		 */
		this.pixelRatio = this._getBackingRatio();
		
	// private properties:
		this._time = 0;
		
		this._awake = true; // whether the ad should be awake ignoring tab visibility
		this._sleepy = false; // indicates it should sleep on the next tick
		this._sleepT = 0; // time to go to sleep
		this._sleepMousedownT = null; // time before sleep if user clicks on the stage
		this._sleepInBoundsT = null; // time before sleep if the mouse is in bounds
		this._sleepUseTicks = false; // must be set in props if using startDelay
		this._mouseInDoc = false; // iframes can break stage.mouseInBounds
		
		this._perfDelay = 0; // wait a few ticks before measuring performance
		this._perfCount = 0;
		this._perfThreshold = 0;
		this._perfFPS = 0;
		
		this._width = stage.canvas.width; // for use with highDPI in case of multiple calls.
		this._height = stage.canvas.height;
		
		createjs.Ticker.on("tick", this);
	}
	var p = AdHelper.prototype;
	if (createjs.EventDispatcher) { p = AdHelper.prototype = new createjs.EventDispatcher(); }
	
	
// public static methods:
	/**
	 * Returns true if CreateJS is supported on this browser. For example, this can be used in conjunction with the
	 * `showAlt` methods to display alternate content when the CreateJS banner is not supported. You should run this
	 * check before initializing the ad. For example:
	 * 
	 * 	function init() {
	 * 		if (!createjs.AdHelper.isSupported()) {
	 * 			// not supported, show alt content, and skip everything else.
	 * 			createjs.AdHelper.showAltImage("myImage.jpg", "url");
	 * 			return;
	 * 		}
	 * 		// supported, so continue with normal init...
	 * 	}
	 * 
	 * @method isSupported
	 * @static
	 * @return {Boolean} True if CreateJS is supported on this browser.
	 */
	AdHelper.isSupported = function() {
		return !!window.CanvasRenderingContext2D;
	};
	
	/**
	 * Helper method that generates HTML and passes it to `showAltHTML` to replace the specified canvas.
	 * You can set a link href/url, an image, and alt text. If you require more control over the content
	 * use `setAltHTML` directly.
	 * @method setAltImage
	 * @static
	 * @param {String|HTMLCanvasElement} canvas The canvas element to replace, or its id.
	 * @param {String} src The URL for the image to display.
	 * @param {String} [href] The URL to link.
	 * @param {String} [alt=""] Text to use as alt text for the image.
	 * @param {String} [target="_blank"] The link target to use (ex. _blank, _parent). Default is _blank.
	 * @return {HTMLElement} The div that was created by showAltHTML and swapped with the canvas.
	 */
	AdHelper.showAltImage = function(canvas, src, href, alt, target) {
		return AdHelper.showAltHTML(canvas,
			(href?"<a target='"+(target||"_blank")+"' href='"+href+"'>":"")+ 
			"<img src='"+src+"' border='0' alt='"+(alt||"")+"'>"+
			(href?"</a>":""));
	};
	
	/**
	 * Replaces the specified canvas with a new div containing the specified HTML content. The created div is assigned
	 * an id of "adAlt" for referencing in code or styling with CSS.
	 * @method showAltHTML
	 * @static
	 * @param {String|HTMLCanvasElement} canvas The canvas element to replace, or its id.
	 * @param {String} html The HTML content to display.
	 * @return {HTMLElement} The div that was created and swapped with the canvas.
	 */
	AdHelper.showAltHTML = function(canvas, html) {
		var div = document.createElement("div");
		div.innerHTML = html || "";
		div.id = "adAlt";
		return AdHelper.showAlt(canvas, div);
	};
	
	/**
	 * Swaps the specified canvas with an HTML element as alternative content. The element will have its CSS `display`
	 * value set to `block`. This allows you to set the element's CSS `display` value to `none` by default to
	 * prevent it from displaying when the page loads.
	 * 
	 * Note that any images or scripts you have in your element will be loaded and run as usual, so using showAltHTML
	 * may be preferable in some situations.
	 * @method showAlt
	 * @static
	 * @param {String|HTMLCanvasElement} canvas The canvas element to replace, or its id.
	 * @param {HTMLElement} element The HTML element to display.
	 * @return {HTMLElement} The element that was passed in.
	 */
	AdHelper.showAlt = function(canvas, element) {
		if (typeof canvas == "string") { canvas = document.getElementById(canvas); }
		element.style.display = "block";
		canvas.parentNode.replaceChild(element, canvas);
		return element;
	};
	
	
// events:
	/**
	 * Dispatched when the ad wakes, either via the `wake()` method or automatically due to user interaction or
	 * the browser tab coming to the foreground.
	 * @event wake
	 */
	 
	/**
	 * Dispatched when the ad sleeps, either via the `sleep()` method or automatically due to sleep scheduling or
	 * the browser tab being hidden.
	 * @event sleep
	 */
	 
	/**
	 * Dispatched if performance monitoring (via watchFPS) detects that the ad is running slowly.
	 * @event slow
	 */

// public methods
	/**
	 * Causes all MovieClip instances to run in time synched mode, so their duration remains consistent regardless of
	 * real framerate (ex. if framerate drops due to performance issues).
	 * 
	 * NOTE: If a `framerate` value is not specified, it will use `lib.properties.fps` if available, and finally fall back to `Ticker.getFPS()`.
	 * If the latter occurs, and the `Ticker` framerate has not been correctly set yet, you may see unexpected playback speed.
	 * 
	 * This feature works by injecting code into EaselJS that causes all MovieClip instances to use a master frame rate as
	 * their `framerate` property value. See `MovieClip.framerate` for more information.
	 * @method timeSync
	 * @param {Number} [framerate] The target framerate. Usually the framerate your ad was authored at.
	 * @return {AdHelper} The AdHelper instance the method is called on (useful for chaining calls.)
	 * @chainable
	 */
	p.timeSync = function(framerate) {
		var futureVersion = (this._stage.masterFrameRate !== undefined);
		this._stage.masterFrameRate = framerate || (lib&&lib.properties&&lib.properties.fps) || this._getTickerFPS();
		
		// try to be forwards compatible:
		if (futureVersion) { return this; }
		
		var stage_p = createjs.Stage.prototype, mc_p = createjs.MovieClip.prototype;
		stage_p.__tick = stage_p._tick;
		stage_p._tick = function(evt) {
			evt.stage = this;
			this.__tick(evt);
		}
		
		mc_p.__tick = mc_p._tick;
		mc_p._tick = function(evt) {
			if (!this.ignoreMasterFrameRate && evt.stage) {
				this.framerate = evt.stage.masterFrameRate || null;
			}
			this.__tick(evt);
		}
		return this;
	};
	
	
	/**
	 * Watches the real framerate for the ad, and applies a simple heuristic to determine when the ad has been
	 * running too slowly for too long. When this happens a `slow` event is dispatched, which you can use to modify
	 * your content, for example by displaying alternative content:
	 * 
	 * 	myAdHelper.watchFPS().on("slow", function(evt) {
	 * 		createjs.AdHelper.showAltImage(myStage.canvas, "myImage.jpg", "myURL");
	 * 	});
	 * 
	 * By default, when the slow event fires, AdHelper will call `sleep()` and set `sleepEnabled=true`. You can prevent
	 * this behaviour by calling `preventDefault()` on the slow event object. You can also restart the framerate watcher
	 * after making adjustments:
	 * 
	 * 	myAdHelper.on("slow", function(evt) {
	 * 		if (particleCount > 0) {
	 * 			// if we can speed things up by removing particles, try that first.
	 * 			evt.preventDefault(); // the ad will not be put to sleep.
	 * 			particleCount -= 100; // or whatever will make it run faster.
	 * 			this.watchFPS(); // restart the framerate watcher
	 * 		} else {
	 * 			// no more particles to remove, so let the default sleep happen
	 * 			// and swap in some alt content:
	 * 			createjs.AdHelper.showAltImage(myStage.canvas, "myImage.jpg", "myURL");
	 * 		}
	 * 	});
	 * 
	 * @method watchFPS
	 * @param {Number} [minFPS] The minimum framerate considered acceptable. Calculated automatically if null.
	 * @param {Number} [tolerance=1] The tolerance of the system. A higher value (ex. 2) allows more slow frames before acting than a lower number (ex. 0.5).
	 * @return {AdHelper} The AdHelper instance the method is called on (useful for chaining calls.)
	 * @chainable
	 */
	p.watchFPS = function(minFPS, tolerance) {
		this._perfFPS = minFPS || (this._getTickerFPS()*0.9-1|0);
		this._perfThreshold = tolerance || 1;
		this._perfCount = 0;
		this._perfDelay = 5;
		return this;
	};
	
	
	/**
	 * Scales the canvas and content as appropriate to display full resolution graphics on high dpi devices and updates 
	 * the `pixelRatio` property accordingly.
	 * 
	 * If `false` is passed to the `enabled` parameter, then high DPI rendering will be disabled, including downscaling
	 * the canvas on devices that automatically render at high DPI. This can be useful for reducing render cost on slower
	 * devices.
	 * 
	 * The `nominalScale` param allows you to author content at higher resolution, and have AdHelper scale it appropriately
	 * for the device. For example, you may find it easier to author a 728x90 banner at 1456x180 (2x scale) so that
	 * bitmaps and cacheAsBitmap are high resolution, then specify a `nominalScale` of 2 to display it at the intended
	 * size of 728x90.
	 * 
	 * It will change the canvas width/height attributes, the canvas's CSS width/height, and the stage's scaleX/Y as
	 * necessary.
	 * @method highDPI
	 * @param {Boolean} [enabled=true] If false, disables high DPI rendering.
	 * @param {Number} [nominalScale=1] The scale the content was authored at. The ad will be downscaled by this value.
	 * @return {AdHelper} The AdHelper instance the method is called on (useful for chaining calls.)
	 * @chainable
	 */
	p.highDPI = function(enabled, nominalScale) {
		nominalScale = nominalScale || 1;
		var backingRatio = this._getBackingRatio();
		var scale = Math.max(1, (window.devicePixelRatio || 1) / backingRatio);
		var stage = this._stage, canvas = stage.canvas, style = canvas.style;
		var w = this._width / nominalScale, h = this._height / nominalScale;
		
		// downscale if highDPI is explicitly disabled:
		if (enabled === false) { scale = 1/backingRatio; }
		
		canvas.width = w * scale;
		canvas.height = h * scale;
		style.width = w+"px";
		style.height = h+"px";
		stage.scaleX = stage.scaleY = scale/nominalScale;
		
		this.pixelRatio = (backingRatio === 1 ? scale : enabled === false ? 1 : backingRatio) / nominalScale;
		return this;
	};
	
	
	/**
	 * Sets the sleep schedule for the ad. The system will always use the latest sleep time. For example, if you called:
	 * `setSleep(15, 3)` and the user clicked the ad after 4 seconds, the ad would still sleep after 15 seconds (15 > 3+4).
	 * @method setSleep
	 * @param {Number} start The delay in seconds after this call to wait before sleeping. Set to null to ignore this behaviour.
	 * @param {Number} [mousedown=null] The delay after the user clicks the banner to wait before sleeping. Set to null to ignore this behaviour.
	 * @param {Number} [inBounds=null] The delay after the user's mouse leaves the banner to wait before sleeping. Set to null to ignore this behaviour. For example, set to 0 to wake when the mouse enters, and sleep immediately when it leaves.
	 * @param {Boolean} [useTicks=false] If true, the sleep times are specified in ticks instead of in seconds.
	 * @param {Function|Object} [listener] Defaults to the stage. The listener to add/remove from Ticker when waking/sleeping. See `tickListener` for more details.
	 * @return {AdHelper} The AdHelper instance the method is called on (useful for chaining calls.)
	 * @chainable
	 */
	p.setSleep = function(start, mousedown, inBounds, useTicks, listener) {
		if (mousedown != null) { stage.addEventListener("stagemousedown", this); }
		if (inBounds != null) {
			document.addEventListener("mouseout", this, true);
			document.addEventListener("mousemove", this, true);
		}
		this.tickListener = listener || this._stage;
		this._sleepMousedownT = mousedown;
		this._sleepInBoundsT = inBounds;
		this._sleepUseTicks = !!useTicks;
		this.sleepEnabled = true;
		
		this._sleepy = false; // indicates it should sleep on the next tick
		this._sleepT = (start != null) ? this._getTime() + start*1000 : 0;
		return this;
	};
	
	/**
	 * Sleeps the ad after the specified delay. This pauses the ticker, unsubscribes the `tickListener`,
	 * and pauses GreenSock TweenLite/TweenMax tweens.
	 * @method sleep
	 * @param {Number} [delay=0] The delay before sleeping, or 0 to sleep immediately.
	 */
	p.sleep = function(delay) {
		// TODO: switch to seconds.
		if (delay) { this._sleepT = this._getTime()+(delay||0); return; }
		this._sleepy = false;
		this._sleepT = 0;
		this._awake = false;
		this._sleep();
	};
	
	/**
	 * Wakes the ad for a specified amount of time.
	 * @method wake
	 * @param {Number} [time=null] The amount of time to wake for, or null to wake permanently.
	 */
	p.wake = function(time) {
		// TODO: switch to seconds.
		this._sleepy = false;
		if (time != null) { this._sleepT = Math.max(this._sleepT, this._getTime()+(time||0)); }
		else { this._sleepT = 0; }
		this._awake = true;
		this._wake();
	};
	
	p.handleEvent = function(evt) {
		if (evt.type === "tick") {
			this._tick(evt);
		} else if (evt.type === "stagemousedown") {
			var d = this._sleepMousedownT;
			if (this.sleepEnabled && d != null) { this.wake(d*1000); }
		} else if (evt.type === "mousemove") {
			this._mouseInDoc = true;
		} else if (evt.type === "mouseout") {
			this._mouseInDoc = false;
		}
	};

	
// private methods:
	p._getTickerFPS = function() {
		return (createjs.Ticker.timingMode == createjs.Ticker.RAF ? 60 : createjs.Ticker.framerate);
	};
	
	p._sleep = function() {
		if (!this.awake) { return; }
		createjs.Ticker.paused = true;
		if (this.tickListener) { createjs.Ticker.removeEventListener("tick", this.tickListener); }
		window.TweenLite && TweenLite.ticker && TweenLite.ticker.sleep();
		this.dispatchEvent("sleep");
		this.awake = false;
	};
	
	p._wake = function() {
		if (this.awake) { return; }
		createjs.Ticker.paused = false;
		if (this.tickListener) { createjs.Ticker.addEventListener("tick", this.tickListener); }
		
		if (window.TweenLite) {
			var ticker = TweenLite.ticker, originalFrame = ticker.frame; //record the original frame temporarily so we can revert
			ticker.frame = 1; //hack to make legacy versions of GSAP apply lag smoothing upon wake
			ticker.wake(true);
			ticker.frame = originalFrame;
		}
		
		this.dispatchEvent("wake");
		this.awake = true;
	};

	p._tick = function(evt) {
		/* tab visibility */
		if (document.hidden || document.webkitHidden || document.mozHidden) {
			this.hidden = true;
			this._sleep();
			if (createjs.Sound) { createjs.Sound.muted = true; }
			return;
		} else if (this.hidden) {
			this.hidden = false;
			if (this._awake) { this._wake(); }
			this._perfDelay = 3;
			if (createjs.Sound) { createjs.Sound.muted = false; }
		}
		this._time += this._sleepUseTicks ? 1 : evt.delta;
		
		/* perf */
		var fps;
		if (this._perfFPS && (--this._perfDelay <= 0) && (fps = createjs.Ticker.getMeasuredFPS(1)) > -1) {
			var val = 1-Math.max(0, Math.min(1, fps / this._perfFPS));
			this._perfCount = Math.max(0, this._perfCount + (val === 0 ? -0.2 : val*val*0.5+0.1));
			if (this._perfCount > this._perfThreshold) {
				this._perfFPS = 0;
				if (this.dispatchEvent(new createjs.Event("slow", false, true))) {
					this.sleep();
					this.sleepEnabled = false;
				}
			}
		}
		
		/* sleep */
		if (this.sleepEnabled) {
			if (this._sleepInBoundsT != null && this._stage.mouseInBounds && this._mouseInDoc) { this.wake(this._sleepInBoundsT*1000); }
			if (this._sleepy) { this.sleep(); }
			else if (this._sleepT && (this._getTime() >= this._sleepT)) { this._sleepy = true; } // delay 1 tick.
		}
	};
	
	p._getTime = function() {
		return this._time;
	};
	
	p._getBackingRatio = function() {
		var ctx = this._stage.canvas.getContext("2d");
		return ctx.backingStorePixelRatio || ctx.webkitBackingStorePixelRatio || ctx.mozBackingStorePixelRatio || ctx.msBackingStorePixelRatio || ctx.oBackingStorePixelRatio || 1;
	};

	createjs.AdHelper = AdHelper;
})();