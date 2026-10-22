document.documentElement.classList.add("js");

(() => {
	"use strict";

	const state = {
		fpAbortController: null,
	};

	// 2) Device Attributes (box 2 only)
	function getWebGLRendererString() {
		try {
			const canvas = document.createElement("canvas");
			const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
			if (!gl) return "(unavailable)";

			const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
			if (debugInfo) {
				const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
				const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
				if (vendor && renderer) return `${vendor} | ${renderer}`;
				if (renderer) return String(renderer);
			}

			const vendor = gl.getParameter(gl.VENDOR);
			const renderer = gl.getParameter(gl.RENDERER);
			if (vendor && renderer) return `${vendor} | ${renderer}`;
			if (renderer) return String(renderer);
			return "(unavailable)";
		} catch {
			return "(unavailable)";
		}
	}

	function formatWebGLRendererShort(raw) {
		const value = String(raw || "").trim();
		if (!value || value === "(unavailable)") return "(unavailable)";

		const cleaned = value.replace(/\s+/g, " ");

		let api = "";
		const direct3d = cleaned.match(/Direct3D\d+/i);
		if (direct3d) api = direct3d[0];
		else if (/\bD3D11\b/i.test(cleaned)) api = "Direct3D11";
		else if (/\bD3D12\b/i.test(cleaned)) api = "Direct3D12";
		else {
			const otherApi = cleaned.match(/\b(Metal|OpenGL|Vulkan)\b/i);
			if (otherApi) api = otherApi[0];
		}

		const stripGpuNoise = (s) => {
			return String(s)
				.replace(/\(TM\)|\(R\)|\(C\)/g, "")
				.replace(/\(0x[0-9a-fA-F]+\)/g, "")
				.replace(/\bvs_\d+_\d+\b/gi, "")
				.replace(/\bps_\d+_\d+\b/gi, "")
				.replace(/\bDirect3D\d+\b/gi, "")
				.replace(/\bD3D\d+\b/gi, "")
				.replace(/\s+/g, " ")
				.trim();
		};

		let gpu = "";
		const angleInner = cleaned.match(/ANGLE\s*\((.*)\)/i);
		if (angleInner && angleInner[1]) {
			const parts = angleInner[1].split(",").map((p) => p.trim()).filter(Boolean);
			const preferred =
				parts.find((p) => /Radeon|GeForce|Intel\b|Iris|UHD|Apple|Adreno|Mali/i.test(p)) ||
				parts[1] ||
				parts[0] ||
				"";
			gpu = stripGpuNoise(preferred);
		}

		if (!gpu) {
			const m = cleaned.match(/(Radeon[^|,]+|GeForce[^|,]+|Intel[^|,]+|Apple[^|,]+|Adreno[^|,]+|Mali[^|,]+)/i);
			if (m) gpu = stripGpuNoise(m[1]);
		}

		gpu = gpu.replace(/\s*\|\s*.*/, "").trim();

		if (gpu && api) return `${gpu} (${api})`;
		if (gpu) return gpu;
		if (api) return `(${api})`;
		return "(unavailable)";
	}

	async function getAudioContextInfo() {
		try {
			const AudioCtx = window.AudioContext || window.webkitAudioContext;
			if (!AudioCtx) return { sampleRate: "(unavailable)" };

			const ctx = new AudioCtx();
			const info = { sampleRate: String(ctx.sampleRate) };
			try { await ctx.close(); } catch { /* ignore */ }
			return info;
		} catch {
			return { sampleRate: "(blocked)" };
		}
	}

	function normalizeValue(value) {
		if (value === undefined || value === null || value === "") return "(unavailable)";
		return String(value);
	}

	function formatUserAgentShort() {
		const ua = String(navigator.userAgent || "");

		const pickMajorMinor = (version) => {
			const parts = String(version || "").split(".").filter(Boolean);
			if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
			if (parts.length === 1) return `${parts[0]}.0`;
			return "?";
		};

		let browser = "Browser";
		let version = "?";

		const edge = ua.match(/Edg\/([\d.]+)/);
		const chrome = ua.match(/Chrome\/([\d.]+)/);
		const firefox = ua.match(/Firefox\/([\d.]+)/);
		const safari = ua.match(/Version\/([\d.]+).*Safari\//);

		if (edge) {
			browser = "Edge";
			version = pickMajorMinor(edge[1]);
		} else if (chrome) {
			browser = "Chrome";
			version = pickMajorMinor(chrome[1]);
		} else if (firefox) {
			browser = "Firefox";
			version = pickMajorMinor(firefox[1]);
		} else if (safari) {
			browser = "Safari";
			version = pickMajorMinor(safari[1]);
		}

		let os = "Unknown";
		if (/Windows NT/i.test(ua)) os = "Windows";
		else if (/Android/i.test(ua)) os = "Android";
		else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
		else if (/Mac OS X/i.test(ua)) os = "macOS";
		else if (/Linux/i.test(ua)) os = "Linux";

		let arch = "";
		if (/Win64|x64|x86_64/i.test(ua)) arch = "x64";
		else if (/ARM64|aarch64/i.test(ua)) arch = "arm64";

		return `${browser} v${version} (${os}${arch ? " " + arch : ""})`;
	}

	async function safeFetchJson(url, signal) {
		if (typeof fetch !== "function") throw new Error("fetch unavailable");
		const res = await fetch(url, {
			method: "GET",
			mode: "cors",
			cache: "no-store",
			signal,
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return res.json();
	}

	async function initIpAndLocation(cells, signal) {
		const ipCell = cells.get("Public IP");
		const ispCell = cells.get("ISP");
		const cityStateCell = cells.get("City/State");

		if (ipCell) {
			ipCell.textContent = "Fetching...";
			try {
				const data = await safeFetchJson("https://api.ipify.org?format=json", signal);
				ipCell.textContent = data && data.ip ? String(data.ip) : "Failed";
			} catch (e) {
				if (e && e.name === "AbortError") return;
				ipCell.textContent = "IP likely Hidden by Ad-Blocker or Privacy Settings";
			}
		}

		if (ispCell) ispCell.textContent = "Fetching...";
		if (cityStateCell) cityStateCell.textContent = "Fetching...";

		const geoProviders = [
			{
				name: "ipapi.co",
				url: "https://ipapi.co/json/",
				map(geo) {
					if (!geo || geo.error) {
						throw new Error(geo && geo.reason ? String(geo.reason) : "invalid geo payload");
					}
					const isp = geo.org ? String(geo.org) : "";
					const city = geo.city ? String(geo.city) : "";
					const region = geo.region ? String(geo.region) : "";
					return { isp, cityState: [city, region].filter(Boolean).join(", ") };
				},
			},
			{
				name: "ipwho.is",
				url: "https://ipwho.is/",
				map(geo) {
					if (!geo || geo.success === false) {
						throw new Error(geo && geo.message ? String(geo.message) : "invalid geo payload");
					}
					const connection = geo.connection && typeof geo.connection === "object" ? geo.connection : {};
					const isp = connection.isp ? String(connection.isp) : "";
					const city = geo.city ? String(geo.city) : "";
					const region = geo.region ? String(geo.region) : "";
					return { isp, cityState: [city, region].filter(Boolean).join(", ") };
				},
			},
		];

		for (const provider of geoProviders) {
			try {
				const geo = await safeFetchJson(provider.url, signal);

				const mapped = provider.map(geo);
				const isp = mapped && mapped.isp ? mapped.isp : "";
				const cityState = mapped && mapped.cityState ? mapped.cityState : "";

				if (!isp && !cityState) throw new Error("empty geo fields");

				if (ispCell) ispCell.textContent = isp || "Failed";
				if (cityStateCell) cityStateCell.textContent = cityState || "Failed";
				return;
			} catch (e) {
				if (e && e.name === "AbortError") return;
				// Fall through to the next provider.
			}
		}

		if (ispCell) ispCell.textContent = "Failed";
		if (cityStateCell) cityStateCell.textContent = "Failed";
	}

	async function collectFingerprintAttributes() {
		const tz = (() => {
			try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "(unavailable)"; }
		})();

		const audio = await getAudioContextInfo();

		return [
			["Live System Clock", "(initializing…)"],
			["Mouse Coordinates", "(move mouse)"],
			["Battery Status", "(initializing…)"],
			["Window Dimensions", `${window.innerWidth} x ${window.innerHeight}`],
			["Focus State", document.visibilityState === "hidden" ? "Hidden" : "Active"],

			["Public IP", ""],
			["ISP", "(looked up via ipapi.co on click)"],
			["City/State", "(looked up via ipapi.co on click)"],

			["User Agent", formatUserAgentShort()],
			["Preferred Language", normalizeValue(navigator.language)],

			["CPU Cores", normalizeValue(navigator.hardwareConcurrency)],
			["Device Memory (GB)", normalizeValue(navigator.deviceMemory)],
			["Screen Resolution", `${window.screen.width} x ${window.screen.height}`],

			["Timezone", normalizeValue(tz)],
			["WebGL Renderer", formatWebGLRendererShort(getWebGLRendererString())],
			["Audio Sample Rate", normalizeValue(audio.sampleRate)],
		];
	}

	function renderFingerprintTable(container, rows) {
		const table = document.createElement("table");
		table.className = "fp-table";

		const tbody = document.createElement("tbody");
		const cellsByKey = new Map();

		for (const [key, value] of rows) {
			const tr = document.createElement("tr");

			const th = document.createElement("th");
			th.scope = "row";
			th.textContent = key;

			const td = document.createElement("td");
			const code = document.createElement("code");
			code.textContent = value;
			td.appendChild(code);

			tr.appendChild(th);
			tr.appendChild(td);
			tbody.appendChild(tr);

			cellsByKey.set(key, code);
		}

		table.appendChild(tbody);
		container.replaceChildren(table);
		return cellsByKey;
	}

	function formatClockNow() {
		const d = new Date();
		const pad2 = (n) => String(n).padStart(2, "0");
		const pad3 = (n) => String(n).padStart(3, "0");
		return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
	}

	function initVulnerabilityAlertsPanel() {
		const api = window.VulnerabilityAlerts;
		if (!api || typeof api.init !== "function") return;

		api.init({
			dependencies: {
				api: window.VulnAlertsApiClient,
				engine: window.VulnAlertsThreatEngine,
				renderer: window.VulnAlertsRenderer,
			},
			rootId: "vuln-alerts-box",
			listId: "vuln-alerts-list",
			minCvssId: "vuln-filter-min-cvss",
			minEpssPercentileId: "vuln-filter-min-epss",
			daysSwitchId: "vuln-filter-window-switch",
			fetchButtonId: "vuln-filter-fetch",
			defaultMinCvss: 7.0,
			defaultMinEpssPercentile: 70,
			defaultDaysBack: 30,
		}).catch(() => {
			// Ignore module-level failures; UI state is handled inside the module.
		});
	}

	async function initFingerprinter() {
		const container = document.getElementById("fingerprint-box");
		if (!container) return; // box 2 only

		try {
			if (state.fpAbortController) state.fpAbortController.abort();
		} catch {
			// ignore
		}
		state.fpAbortController = new AbortController();

		container.textContent = "Collecting…";

		try {
			const rows = await collectFingerprintAttributes();
			const cells = renderFingerprintTable(container, rows);

			// Live System Clock
			const clockCell = cells.get("Live System Clock");
			if (clockCell) {
				clockCell.textContent = formatClockNow();
				window.setInterval(() => {
					clockCell.textContent = formatClockNow();
				}, 1000);
			}

			// Mouse Coordinates
			const mouseCell = cells.get("Mouse Coordinates");
			if (mouseCell) {
				window.addEventListener(
					"mousemove",
					(e) => {
						mouseCell.textContent = `${e.clientX}, ${e.clientY}`;
					},
					{ passive: true }
				);
			}

			// Battery Status
			const battCell = cells.get("Battery Status");
			if (battCell) {
				const getBattery = typeof navigator.getBattery === "function" ? navigator.getBattery.bind(navigator) : null;
				if (!getBattery) {
					battCell.textContent = "(unavailable)";
				} else {
					try {
						const battery = await getBattery();

						const renderBattery = () => {
							const pct = Math.round((battery.level || 0) * 100);
							battCell.textContent = `${pct}% | ${battery.charging ? "Plugged" : "On Battery"}`;
						};

						renderBattery();
						battery.addEventListener("levelchange", () => {
							renderBattery();
						});
						battery.addEventListener("chargingchange", () => {
							renderBattery();
						});
					} catch {
						battCell.textContent = "(blocked)";
					}
				}
			}

			// Window Dimensions
			const winCell = cells.get("Window Dimensions");
			if (winCell) {
				const renderWin = () => {
					winCell.textContent = `${window.innerWidth} x ${window.innerHeight}`;
				};
				renderWin();
				window.addEventListener("resize", () => {
					renderWin();
				});
			}

			// Focus State
			const focusCell = cells.get("Focus State");
			if (focusCell) {
				const renderFocus = () => {
					focusCell.textContent = document.visibilityState === "hidden" ? "Hidden" : "Active";
				};
				renderFocus();
				document.addEventListener("visibilitychange", () => {
					renderFocus();
				});
				window.addEventListener("focus", () => {
					renderFocus();
				});
				window.addEventListener("blur", () => {
					renderFocus();
				});
			}

			// Public IP + Geo: nothing is sent to third parties until the visitor clicks.
			const ipCell = cells.get("Public IP");
			if (ipCell) {
				const ispCell = cells.get("ISP");
				const cityStateCell = cells.get("City/State");

				const revealButton = document.createElement("button");
				revealButton.type = "button";
				revealButton.className = "fp-reveal-button";
				revealButton.textContent = "Show my IP (via ipify)";
				revealButton.title = "Sends a request to api.ipify.org, then ipapi.co (fallback ipwho.is) for ISP and location";
				revealButton.addEventListener(
					"click",
					() => {
						const signal = state.fpAbortController.signal;
						void initIpAndLocation(cells, signal).catch(() => {
							if (ipCell.textContent === "Fetching...") ipCell.textContent = "Failed";
							if (ispCell && ispCell.textContent === "Fetching...") ispCell.textContent = "Failed";
							if (cityStateCell && cityStateCell.textContent === "Fetching...") cityStateCell.textContent = "Failed";
						});
					},
					{ once: true }
				);
				ipCell.replaceChildren(revealButton);
			}
		} catch (e) {
			try { console.error("Fingerprint init failed:", e); } catch { /* ignore */ }
			container.textContent = "(failed to collect attributes)";
		}
	}

	function initVideoTile() {
		const video = document.querySelector(".tile-video");
		if (!(video instanceof HTMLVideoElement)) return;
		video.muted = true;
		video.defaultMuted = true;
		video.playsInline = true;
		video.autoplay = true;
		video.loop = true;

		const tryPlay = () => {
			try {
				const playPromise = video.play();
				if (playPromise && typeof playPromise.catch === "function") {
					playPromise.catch(() => {
						// ignore autoplay rejections
					});
				}
			} catch {
				// ignore
			}
		};

		video.addEventListener("loadeddata", tryPlay, { passive: true });
		video.addEventListener("canplay", tryPlay, { passive: true });
		video.addEventListener("pause", tryPlay, { passive: true });

		tryPlay();

		// The local Jekyll dev server (WEBrick) mishandles the range requests used for video streaming.
		// If native loading fails, fall back to downloading the file once as a blob.
		const sourceNode = video.querySelector("source");
		const sourceUrl = sourceNode ? sourceNode.src : "";
		let blobFallbackTried = false;

		const loadAsBlob = async () => {
			if (blobFallbackTried || !sourceUrl) return;
			blobFallbackTried = true;
			try {
				// no-store: skip any partial copy the failed range requests left in the HTTP cache.
				const response = await fetch(sourceUrl, { cache: "no-store" });
				if (!response.ok) return;
				const objectUrl = URL.createObjectURL(await response.blob());
				video.src = objectUrl;
				try { video.load(); } catch { /* ignore */ }
				tryPlay();
			} catch {
				// ignore
			}
		};

		if (sourceNode) sourceNode.addEventListener("error", () => { void loadAsBlob(); });
		video.addEventListener("error", () => { void loadAsBlob(); });
		// The source may have already failed before this deferred script ran.
		if (video.error || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) void loadAsBlob();
	}

	function initPostMenu() {
		const randomLink = document.getElementById("open-random-post");
		if (randomLink) {
			randomLink.addEventListener("click", (event) => {
				event.preventDefault();

				const raw = String(randomLink.getAttribute("data-posts") || "");
				const posts = raw.split("|").map((x) => x.trim()).filter(Boolean);
				if (!posts.length) return;

				const index = Math.floor(Math.random() * posts.length);
				window.location.assign(posts[index]);
			}, { passive: false });
		}
	}

	function initSessionLink() {
		const sessionLink = document.getElementById("session-link");
		if (!sessionLink) return;

		let overlay = null;
		let overlayKeydownHandler = null;

		const closeOverlay = () => {
			try {
				if (overlayKeydownHandler) {
					document.removeEventListener("keydown", overlayKeydownHandler);
				}
			} catch {
				// ignore
			}
			overlayKeydownHandler = null;

			try {
				if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
			} catch {
				// ignore
			}
			overlay = null;
		};

		const openOverlay = () => {
			if (overlay) return;

			overlay = document.createElement("div");
			overlay.setAttribute("role", "dialog");
			overlay.setAttribute("aria-label", "Session Code");
			overlay.tabIndex = -1;
			overlay.style.position = "fixed";
			overlay.style.inset = "0";
			overlay.style.display = "flex";
			overlay.style.alignItems = "center";
			overlay.style.justifyContent = "center";
			overlay.style.padding = "10px";
			overlay.style.zIndex = "9999";
			overlay.style.background = "#202225";
			overlay.style.cursor = "pointer";

			const img = document.createElement("img");
			img.alt = "Session code";
			img.src = new URL("assets/images/session-code.png", document.baseURI).toString();
			img.style.maxWidth = "100%";
			img.style.maxHeight = "100%";
			img.style.width = "auto";
			img.style.height = "auto";
			img.style.objectFit = "contain";
			img.style.border = "1px solid #ffffff";
			img.style.cursor = "pointer";

			overlay.appendChild(img);

			overlay.addEventListener(
				"click",
				() => {
					closeOverlay();
				},
				{ passive: true }
			);

			overlayKeydownHandler = (e) => {
				if (e && e.key === "Escape") {
					e.preventDefault();
					closeOverlay();
				}
			};
			document.addEventListener("keydown", overlayKeydownHandler, { passive: false });

			document.body.appendChild(overlay);
			try {
				overlay.focus();
			} catch {
				// ignore
			}
		};

		sessionLink.addEventListener(
			"click",
			(event) => {
				event.preventDefault();
				openOverlay();
			},
			{ passive: false }
		);
	}

	initPostMenu();
	initSessionLink();
	initVideoTile();
	initFingerprinter();
	initVulnerabilityAlertsPanel();
})();
