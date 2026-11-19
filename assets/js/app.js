/* ==========================================================================
   Diffusion Lab — page controllers and the live sandbox
   ========================================================================== */

(function () {
  "use strict";

  const SNA = window.SNA;
  if (!SNA) {
    console.error("Diffusion Lab: core graph engine failed to load.");
    return;
  }

  const $ = function (id) {
    return document.getElementById(id);
  };

  /* The weights from the definition are kept fixed in this pared-back lab. */
  const W_REPOST = 1;
  const W_COMMENT = 1.5;

  const ALPHA_SAMPLES = [];
  for (let value = 1; value <= 8.0001; value += 0.5) {
    ALPHA_SAMPLES.push(Math.round(value * 2) / 2);
  }

  const NETWORKS = {
    spread: {
      graph: SNA.presets.spread.a,
      name: "Dense community",
    },
    efficiency: {
      graph: SNA.presets.efficiency.b,
      name: "Delayed cascade",
    },
  };

  const TITLES = {
    spread: "Spread · Social Network Analysis",
    efficiency: "Efficiency · Social Network Analysis",
    custom: "Sandbox · Social Network Analysis",
  };

  const state = {
    route: "spread",
    spread: null,
    efficiency: null,
    custom: null,
  };

  let spreadRaf = null;
  let efficiencyRaf = null;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    document.querySelectorAll('input[type="range"]').forEach(decorateRange);
    document.addEventListener("input", function (event) {
      if (event.target && event.target.matches('input[type="range"]')) {
        decorateRange(event.target);
      }
    });

    initSpread();
    initEfficiency();
    initCustom();

    window.addEventListener("hashchange", function () {
      applyRoute();
    });

    applyRoute();
  }

  /* ==========================================================================
     Helpers
     ========================================================================== */

  function decorateRange(input) {
    if (!input) return;
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const value = Number(input.value || 0);
    const percentage = max === min ? 0 : SNA.clamp(((value - min) / (max - min)) * 100, 0, 100);
    input.style.setProperty("--fill", percentage.toFixed(2) + "%");
  }

  function setRangeValue(id, value) {
    const input = $(id);
    if (!input) return;
    input.value = String(value);
    decorateRange(input);
  }

  function readParams(prefix) {
    return {
      alpha: Number($(prefix + "-alpha").value),
      beta: Number($(prefix + "-beta").value),
      wRepost: W_REPOST,
      wComment: W_COMMENT,
    };
  }

  function setParams(prefix, values) {
    setRangeValue(prefix + "-alpha", values.alpha);
    setRangeValue(prefix + "-beta", values.beta);
  }

  function syncParamOutputs(prefix, params) {
    setText(prefix + "-alpha-out", SNA.formatAlpha(params.alpha));
    setText(prefix + "-beta-out", String(params.beta));
  }

  function setText(id, text, animate) {
    const el = typeof id === "string" ? $(id) : id;
    if (!el) return;
    const next = String(text);
    if (el.textContent === next) return;
    el.textContent = next;
    if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (el._pulseAnimation) el._pulseAnimation.cancel();
      el._pulseAnimation = el.animate(
        [
          { opacity: 0.25, transform: "translateY(2px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" }
      );
    }
  }

  function formatE(value) {
    if (value == null || !Number.isFinite(value)) return "—";
    return SNA.formatNumber(value, 2);
  }

  function percent(value) {
    return Math.round(value) + "%";
  }

  function countAxis(maxValue) {
    const max = Math.max(1, Math.ceil(maxValue));
    let step;
    if (max <= 5) step = 1;
    else if (max <= 10) step = 2;
    else if (max <= 25) step = 5;
    else if (max <= 60) step = 10;
    else step = 20;
    const top = Math.ceil(max / step) * step;
    const ticks = [];
    for (let value = 0; value <= top + 0.001; value += step) ticks.push(value);
    return { max: top, ticks: ticks };
  }

  function niceAxis(maxValue, targetTicks) {
    if (!Number.isFinite(maxValue) || maxValue <= 0) {
      return { max: 1, ticks: [0, 0.5, 1] };
    }
    const target = targetTicks || 4;
    const rough = maxValue / target;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const normalized = rough / magnitude;
    const candidates = [1, 2, 2.5, 5, 10];
    let candidate = candidates[candidates.length - 1];
    for (let i = 0; i < candidates.length; i += 1) {
      if (candidates[i] >= normalized - 1e-9) {
        candidate = candidates[i];
        break;
      }
    }
    const step = candidate * magnitude;
    const max = Math.ceil((maxValue * 1.01) / step) * step;
    const ticks = [];
    for (let value = 0; value <= max + step * 0.001; value += step) {
      ticks.push(Math.round(value * 1000) / 1000);
    }
    return { max: max, ticks: ticks };
  }

  function betaTicks(maxBeta, count) {
    const n = Math.max(1, count || 5);
    const ticks = [];
    for (let i = 0; i < n; i += 1) {
      ticks.push(Math.round(1 + ((maxBeta - 1) * i) / (n - 1)));
    }
    return Array.from(new Set(ticks));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function alphaSeries(analysis) {
    return ALPHA_SAMPLES.map(function (alpha) {
      let count = 0;
      analysis.activities.forEach(function (activity) {
        if (activity.hop <= alpha) count += 1;
      });
      return { x: alpha, y: count };
    });
  }

  /* ==========================================================================
     Routing
     ========================================================================== */

  function applyRoute() {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    if (!location.hash) history.replaceState(null, "", "#/spread");

    const raw = location.hash.replace(/^#\/?/, "").split("?")[0];
    const known = Object.prototype.hasOwnProperty.call(TITLES, raw);
    const route = known ? raw : "spread";
    state.route = route;

    if (!known && raw) history.replaceState(null, "", "#/spread");

    document.querySelectorAll("[data-route]").forEach(function (section) {
      section.hidden = section.getAttribute("data-route") !== route;
    });

    document.querySelectorAll("[data-nav]").forEach(function (link) {
      const active = link.getAttribute("data-nav") === route;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    document.title = TITLES[route];
    window.scrollTo(0, 0);
    window.requestAnimationFrame(function () {
      window.scrollTo(0, 0);
    });
  }

  /* ==========================================================================
     Study 01 — spread
     ========================================================================== */

  function initSpread() {
    const host = $("spread-graph");
    if (!host) return;

    state.spread = {
      view: new SNA.NetworkView(host, NETWORKS.spread.graph, {
        showWeights: false,
        showNames: false,
        showNumbers: false,
        emphasize: "spread",
      }),
      last: null,
    };

    ["spread-alpha", "spread-beta"].forEach(function (id) {
      const input = $(id);
      if (!input) return;
      input.addEventListener("input", function () {
        if (spreadRaf) return;
        spreadRaf = window.requestAnimationFrame(function () {
          spreadRaf = null;
          updateSpread();
        });
      });
    });

    const reset = $("spread-reset");
    if (reset) {
      reset.addEventListener("click", function () {
        setParams("spread", { alpha: 2.5, beta: 8 });
        updateSpread();
      });
    }

    updateSpread();
  }

  function updateSpread() {
    const params = readParams("spread");
    const analysis = SNA.analyze(NETWORKS.spread.graph, params);
    state.spread.last = { params: params, analysis: analysis };
    syncParamOutputs("spread", params);
    state.spread.view.update(analysis);

    setText("spread-primary-s", String(analysis.spreadCount), true);
    setText(
      "spread-primary-s-sub",
      "of " + analysis.activityCount + " activities at " + percent(analysis.percent)
    );
    setText("spread-primary-e", formatE(analysis.efficiency), true);
    setText(
      "spread-primary-e-sub",
      "latest " + analysis.denominator + " · from seed"
    );

    const host = $("spread-graph");
    if (host) {
      host.setAttribute(
        "aria-label",
        "Dense community network. Spread at alpha " +
          SNA.formatAlpha(params.alpha) +
          " is " +
          analysis.spreadCount +
          " of " +
          analysis.activityCount +
          " activities. Efficiency is " +
          formatE(analysis.efficiency) +
          " weighted hours."
      );
    }

    renderSingleCharts("spread", analysis, params, NETWORKS.spread.graph);
  }

  /* ==========================================================================
     Study 02 — efficiency
     ========================================================================== */

  function initEfficiency() {
    const host = $("eff-graph");
    if (!host) return;

    state.efficiency = {
      view: new SNA.NetworkView(host, NETWORKS.efficiency.graph, {
        showWeights: true,
        showNames: false,
        showNumbers: false,
        emphasize: "efficiency",
      }),
      last: null,
    };

    ["eff-beta", "eff-alpha"].forEach(function (id) {
      const input = $(id);
      if (!input) return;
      input.addEventListener("input", function () {
        if (efficiencyRaf) return;
        efficiencyRaf = window.requestAnimationFrame(function () {
          efficiencyRaf = null;
          updateEfficiency();
        });
      });
    });

    const reset = $("eff-reset");
    if (reset) {
      reset.addEventListener("click", function () {
        setParams("eff", { alpha: 2.5, beta: 8 });
        updateEfficiency();
      });
    }

    updateEfficiency();
  }

  function updateEfficiency() {
    const params = readParams("eff");
    const analysis = SNA.analyze(NETWORKS.efficiency.graph, params);
    state.efficiency.last = { params: params, analysis: analysis };
    syncParamOutputs("eff", params);
    state.efficiency.view.update(analysis);

    const times = analysis.activities.map(function (activity) {
      return activity.time;
    });
    let maxTime = times.length ? Math.max.apply(null, times) : 1;
    maxTime = Math.max(1, Math.ceil(maxTime * 2) / 2);

    SNA.renderTimeline($("eff-timeline"), {
      activities: analysis.activities,
      selectedIds: analysis.selectedIds,
      maxTime: maxTime,
      beta: analysis.denominator,
    });

    setText("eff-window-label", "latest " + analysis.denominator + " · from seed");
    setText("eff-primary-e", formatE(analysis.efficiency), true);
    setText(
      "eff-primary-e-sub",
      "latest " + analysis.denominator + " · from seed"
    );
    setText("eff-primary-s", String(analysis.spreadCount), true);
    setText(
      "eff-primary-s-sub",
      "of " + analysis.activityCount + " activities at " + percent(analysis.percent)
    );

    const host = $("eff-graph");
    if (host) {
      host.setAttribute(
        "aria-label",
        "Delayed cascade network. Efficiency at beta " +
          params.beta +
          " is " +
          formatE(analysis.efficiency) +
          " weighted hours. Spread is " +
          analysis.spreadCount +
          " of " +
          analysis.activityCount +
          " activities."
      );
    }

    renderSingleCharts("eff", analysis, params, NETWORKS.efficiency.graph);
  }

  /* ==========================================================================
     Hyperparameter charts
     ========================================================================== */

  function renderSingleCharts(prefix, analysis, params, graph) {
    const countScale = countAxis(Math.max(1, analysis.activityCount));
    const betaMax = Math.max(2, analysis.activityCount);
    const efficiencyPoints =
      analysis.activityCount > 0
        ? SNA.efficiencyCurve(graph, params, betaMax)
        : [];
    const maxCurve = efficiencyPoints.length
      ? Math.max.apply(
          null,
          efficiencyPoints.map(function (point) {
            return point.y;
          })
        )
      : 0;
    const efficiencyScale = niceAxis(maxCurve, 4);

    SNA.renderLineChart($(prefix + "-chart-s"), {
      width: 700,
      height: 245,
      ariaLabel:
        "Spread versus alpha for the " +
        (prefix === "spread" ? "dense community" : "delayed cascade") +
        ". At alpha " +
        params.alpha +
        ", " +
        analysis.spreadCount +
        " activities are inside the radius.",
      series: [
        {
          name: "Spread",
          color: "var(--spread)",
          points: alphaSeries(analysis),
          area: true,
          showCurrent: true,
          lineWidth: 2.3,
        },
      ],
      xDomain: [1, 8],
      xTicks: [1, 2, 3, 4, 5, 6, 7, 8],
      xTitle: "α · hop radius",
      yDomain: [0, countScale.max],
      yTicks: countScale.ticks,
      yTitle: "POSTS",
      currentX: params.alpha,
      currentText: "α = " + SNA.formatAlpha(params.alpha),
      formatX: function (value) {
        return String(value);
      },
      formatY: function (value) {
        return String(Math.round(value));
      },
      step: true,
    });

    SNA.renderLineChart($(prefix + "-chart-e"), {
      width: 700,
      height: 245,
      ariaLabel:
        "Efficiency versus beta for the " +
        (prefix === "spread" ? "dense community" : "delayed cascade") +
        ". At beta " +
        params.beta +
        ", the weighted average is " +
        formatE(analysis.efficiency) +
        " hours.",
      series:
        efficiencyPoints.length > 0
          ? [
              {
                name: "Efficiency",
                color: "var(--eff)",
                points: efficiencyPoints,
                area: true,
                showCurrent: true,
                lineWidth: 2.3,
              },
            ]
          : [],
      xDomain: [1, betaMax],
      xTicks: betaTicks(betaMax, 5),
      xTitle: "β · latest from seed",
      yDomain: [0, efficiencyScale.max],
      yTicks: efficiencyScale.ticks,
      yTitle: "HOURS",
      currentX: params.beta,
      currentText: "β = " + params.beta,
      formatX: function (value) {
        return String(value);
      },
      formatY: function (value) {
        return Number(value).toFixed(1);
      },
      step: false,
    });
  }

  function renderCustomCharts(analysis, params) {
    const custom = state.custom;
    if (!custom) return;

    const countScale = countAxis(Math.max(1, analysis.activityCount));
    const spreadPoints = alphaSeries(analysis);
    const hostS = $("custom-chart-s");
    const hostE = $("custom-chart-e");

    if (hostS) {
      SNA.renderLineChart(hostS, {
        width: 700,
        height: 245,
        ariaLabel:
          "Custom graph. Spread versus alpha. At alpha " +
          params.alpha +
          ", " +
          analysis.spreadCount +
          " activities are inside the radius.",
        series: [
          {
            name: "Your graph",
            color: "var(--spread)",
            points: spreadPoints,
            area: true,
            showCurrent: true,
            lineWidth: 2.3,
          },
        ],
        xDomain: [1, 8],
        xTicks: [1, 2, 3, 4, 5, 6, 7, 8],
        xTitle: "α · hop radius",
        yDomain: [0, countScale.max],
        yTicks: countScale.ticks,
        yTitle: "POSTS",
        currentX: params.alpha,
        currentText: "α = " + SNA.formatAlpha(params.alpha),
        formatX: function (value) {
          return String(value);
        },
        formatY: function (value) {
          return String(Math.round(value));
        },
        step: true,
      });
    }

    if (hostE) {
      const betaMax = Math.max(2, custom.betaMax);
      const curve =
        analysis.activityCount > 0
          ? SNA.efficiencyCurve(custom.graph, params, betaMax)
          : [];
      const maxCurve = curve.length
        ? Math.max.apply(
            null,
            curve.map(function (point) {
              return point.y;
            })
          )
        : 0;
      const eScale = niceAxis(maxCurve, 4);

      SNA.renderLineChart(hostE, {
        width: 700,
        height: 245,
        ariaLabel:
          "Custom graph. Efficiency versus beta. At beta " +
          params.beta +
          ", the weighted average is " +
          formatE(analysis.efficiency) +
          " hours.",
        series:
          curve.length > 0
            ? [
                {
                  name: "Your graph",
                  color: "var(--eff)",
                  points: curve,
                  area: true,
                  showCurrent: true,
                  lineWidth: 2.3,
                },
              ]
            : [],
        xDomain: [1, betaMax],
        xTicks: betaTicks(betaMax, 5),
        xTitle: "β · latest from seed",
        yDomain: [0, eScale.max],
        yTicks: eScale.ticks,
        yTitle: "HOURS",
        currentX: params.beta,
        currentText: "β = " + params.beta,
        formatX: function (value) {
          return String(value);
        },
        formatY: function (value) {
          return Number(value).toFixed(1);
        },
        step: false,
      });
    }
  }

  /* ==========================================================================
     Study 03 — sandbox
     ========================================================================== */

  function initCustom() {
    const host = $("custom-graph");
    if (!host) return;

    const graph = SNA.cloneGraph(SNA.presets.sample);
    const custom = {
      graph: graph,
      view: new SNA.NetworkView(host, graph, {
        showWeights: true,
        showNames: true,
        showNumbers: true,
        emphasize: "both",
      }),
      tool: "move",
      selection: null,
      linkSource: null,
      last: null,
      betaMax: 12,
      edgeRaf: null,
    };
    state.custom = custom;
    custom.view.setTool("move");

    ["custom-alpha", "custom-beta"].forEach(function (id) {
      const input = $(id);
      if (!input) return;
      input.addEventListener("input", function () {
        applyCustom({ rebuildView: false, renderInspector: false });
      });
    });

    document.querySelectorAll("[data-tool]").forEach(function (button) {
      button.addEventListener("click", function () {
        setCustomTool(button.getAttribute("data-tool"));
      });
    });

    const example = $("custom-example");
    if (example) {
      example.addEventListener("change", function () {
        loadCustomExample(example.value, false);
      });
    }

    const resetSample = $("custom-reset");
    if (resetSample) {
      resetSample.addEventListener("click", function () {
        loadCustomExample("sample", true);
      });
    }

    const resetParams = $("custom-reset-params");
    if (resetParams) {
      resetParams.addEventListener("click", function () {
        setParams("custom", { alpha: 2.5, beta: 6 });
        applyCustom({ rebuildView: false, renderInspector: false });
      });
    }

    const clear = $("custom-clear");
    if (clear) {
      clear.addEventListener("click", clearCustomGraph);
    }

    host.addEventListener("click", handleCustomClick);
    host.addEventListener("pointerdown", handleCustomPointerDown);
    document.addEventListener("keydown", handleCustomKeydown);

    applyCustom({ rebuildView: true, renderInspector: true });
  }

  function applyCustom(options) {
    const custom = state.custom;
    if (!custom) return;
    const opts = options || {};

    if (custom.selection) {
      if (
        custom.selection.kind === "node" &&
        !SNA.findNode(custom.graph, custom.selection.id)
      ) {
        custom.selection = null;
      }
      if (
        custom.selection.kind === "edge" &&
        !SNA.findEdge(custom.graph, custom.selection.id)
      ) {
        custom.selection = null;
      }
    }

    const betaInput = $("custom-beta");
    let params = readParams("custom");
    let analysis = SNA.analyze(custom.graph, params);
    const maxBeta = Math.max(1, analysis.activityCount);

    if (betaInput && Number(betaInput.max) !== maxBeta) {
      betaInput.max = String(maxBeta);
      const betaMaxLabel = $("custom-beta-max");
      if (betaMaxLabel) betaMaxLabel.textContent = String(maxBeta);
    }

    if (params.beta > maxBeta) {
      if (betaInput) {
        betaInput.value = String(maxBeta);
        decorateRange(betaInput);
      }
      params = readParams("custom");
      analysis = SNA.analyze(custom.graph, params);
    }

    if (betaInput) betaInput.disabled = analysis.activityCount === 0;

    custom.betaMax = maxBeta;
    custom.last = { params: params, analysis: analysis };
    syncParamOutputs("custom", params);

    custom.view.graph = custom.graph;
    if (opts.rebuildView) {
      custom.view.options.showNames = custom.graph.nodes.length <= 16;
      custom.view.options.showNumbers = custom.graph.nodes.length <= 16;
      custom.view.build();
      custom.view.setTool(custom.tool);
      custom.view.setSelection(custom.selection);
    } else {
      custom.view.setSelection(custom.selection);
    }
    custom.view.update(analysis);

    updateCustomReadouts(analysis, params);
    updateCustomChrome();
    if (opts.renderInspector !== false) renderCustomInspector(analysis);
    renderCustomCharts(analysis, params);
  }

  function updateCustomReadouts(analysis, params) {
    const hasNodes = state.custom.graph.nodes.length > 0;
    const hasActivities = analysis.activityCount > 0;
    const selectedCount = analysis.denominator;

    setText("custom-s", hasNodes ? String(analysis.spreadCount) : "—", true);
    setText("custom-e", selectedCount ? formatE(analysis.efficiency) : "—", true);

    if (!hasNodes) {
      setText("custom-s-sub", "add a node to start");
      setText("custom-e-sub", "no activities yet");
    } else {
      setText(
        "custom-s-sub",
        percent(analysis.percent) + " of " + analysis.activityCount + " activities"
      );
      setText(
        "custom-e-sub",
        selectedCount
          ? "latest " + selectedCount + " of " + analysis.activityCount + " · from seed"
          : hasActivities
            ? "no reachable activities"
            : "no activities yet"
      );
    }

    const countNode = $("custom-node-count");
    const countEdge = $("custom-edge-count");
    const unreachable = $("custom-unreachable");
    if (countNode) countNode.textContent = String(state.custom.graph.nodes.length);
    if (countEdge) countEdge.textContent = String(state.custom.graph.edges.length);
    if (unreachable) {
      if (!state.custom.graph.nodes.length) {
        unreachable.textContent = "empty canvas";
        unreachable.classList.remove("is-warning");
      } else if (analysis.unreachableCount === 0) {
        unreachable.textContent = "all reachable";
        unreachable.classList.remove("is-warning");
      } else {
        unreachable.textContent = analysis.unreachableCount + " unreachable";
        unreachable.classList.add("is-warning");
      }
    }
  }

  function updateCustomChrome() {
    updateCustomToolButtons();
    updateCustomHint();
    updateSelectionBadge();
  }

  function updateCustomToolButtons() {
    if (!state.custom) return;
    document.querySelectorAll("[data-tool]").forEach(function (button) {
      const active = button.getAttribute("data-tool") === state.custom.tool;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function updateCustomHint() {
    const custom = state.custom;
    const hint = $("custom-hint");
    if (!custom || !hint) return;

    let message;
    if (!custom.graph.nodes.length) {
      message = "Empty canvas. Choose Node, then click to place the original post.";
    } else if (custom.linkSource) {
      message = "Source selected. Click a second node to draw the edge.";
    } else if (custom.tool === "add") {
      message = "Click the canvas to place an activity.";
    } else if (custom.tool === "link") {
      message = "Click one node, then another, to connect them. Cycles are not allowed.";
    } else if (custom.tool === "erase") {
      message = "Click a node or edge to remove it.";
    } else {
      message = "Drag to arrange. Click a node or edge to inspect it.";
    }

    hint.innerHTML = '<span class="hint-dot"></span>' + escapeHtml(message);
  }

  function setCustomTool(tool) {
    const custom = state.custom;
    if (!custom) return;
    custom.tool = tool || "move";
    custom.view.setTool(custom.tool);
    clearLinkSource();
    updateCustomToolButtons();
    updateCustomHint();
  }

  function clearLinkSource() {
    const custom = state.custom;
    if (!custom) return;
    custom.linkSource = null;
    custom.view.setLinkSource(null);
  }

  function setLinkSource(id) {
    const custom = state.custom;
    if (!custom) return;
    custom.linkSource = id || null;
    custom.view.setLinkSource(custom.linkSource);
    updateCustomHint();
  }

  function handleCustomClick(event) {
    const custom = state.custom;
    if (!custom || !custom.view) return;

    const nodeEl = event.target.closest(".nx-node");
    const edgeEl = event.target.closest(".nx-edge");
    const nodeId = nodeEl ? nodeEl.getAttribute("data-node-id") : null;
    const edgeId = edgeEl ? edgeEl.getAttribute("data-edge-id") : null;

    if (custom.tool === "move") {
      if (nodeId) selectCustomNode(nodeId);
      else if (edgeId) selectCustomEdge(edgeId);
      else clearCustomSelection();
      return;
    }

    if (custom.tool === "add") {
      if (nodeId) {
        selectCustomNode(nodeId);
        return;
      }
      if (edgeId) return;
      const point = custom.view.toGraphPoint(event.clientX, event.clientY);
      if (!point) return;
      addCustomNode(point.x, point.y);
      return;
    }

    if (custom.tool === "link") {
      if (!nodeId) {
        clearLinkSource();
        return;
      }
      handleCustomLink(nodeId);
      return;
    }

    if (custom.tool === "erase") {
      if (nodeId) eraseCustomNode(nodeId);
      else if (edgeId) eraseCustomEdge(edgeId);
    }
  }

  function handleCustomPointerDown(event) {
    const custom = state.custom;
    if (!custom || custom.tool !== "move") return;
    if (event.button != null && event.button !== 0) return;

    const nodeEl = event.target.closest(".nx-node");
    if (!nodeEl) return;
    const node = SNA.findNode(custom.graph, nodeEl.getAttribute("data-node-id"));
    if (!node) return;

    const start = custom.view.toGraphPoint(event.clientX, event.clientY);
    if (!start) return;

    let moved = false;

    const onMove = function (moveEvent) {
      const point = custom.view.toGraphPoint(moveEvent.clientX, moveEvent.clientY);
      if (!point) return;
      if (!moved && Math.hypot(point.x - start.x, point.y - start.y) < 3) return;
      moved = true;
      nodeEl.classList.add("is-dragging");
      node.x = point.x;
      node.y = point.y;
      custom.view.updateGeometry();
      if (moveEvent.cancelable) moveEvent.preventDefault();
    };

    const stop = function () {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      nodeEl.classList.remove("is-dragging");
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function addCustomNode(x, y) {
    const custom = state.custom;
    if (!custom) return;
    const id = SNA.uid("n");
    const hasSeed = !!custom.graph.seedId;
    const type = !hasSeed ? "seed" : "repost";
    const name = !hasSeed ? "Original post" : "Node " + (custom.graph.nodes.length + 1);

    custom.graph.nodes.push({ id: id, x: x, y: y, type: type, name: name });
    if (!hasSeed) custom.graph.seedId = id;
    custom.selection = { kind: "node", id: id };
    applyCustom({ rebuildView: true, renderInspector: true });
  }

  function handleCustomLink(nodeId) {
    const custom = state.custom;
    if (!custom) return;

    if (!custom.linkSource) {
      setLinkSource(nodeId);
      return;
    }

    const source = custom.linkSource;
    if (source === nodeId) {
      clearLinkSource();
      return;
    }

    const existing = SNA.edgeBetween(custom.graph, source, nodeId);
    if (existing) {
      clearLinkSource();
      custom.selection = { kind: "edge", id: existing.id };
      custom.view.setSelection(custom.selection);
      renderCustomInspector(custom.last ? custom.last.analysis : SNA.analyze(custom.graph, readParams("custom")));
      updateSelectionBadge();
      updateCustomHint();
      return;
    }

    if (SNA.wouldCreateCycle(custom.graph, source, nodeId)) {
      setCustomHint("Edge skipped: that would create a cycle. Each activity has a single source.");
      return;
    }

    const edge = { id: SNA.uid("e"), a: source, b: nodeId, w: 1 };
    custom.graph.edges.push(edge);
    custom.selection = { kind: "edge", id: edge.id };
    clearLinkSource();
    applyCustom({ rebuildView: true, renderInspector: true });
    setCustomHint("Edge added. Set its delay in the inspector.");
  }

  function eraseCustomNode(nodeId) {
    const custom = state.custom;
    if (!custom) return;
    if (!SNA.findNode(custom.graph, nodeId)) return;

    custom.graph.nodes = custom.graph.nodes.filter(function (node) {
      return node.id !== nodeId;
    });
    custom.graph.edges = custom.graph.edges.filter(function (edge) {
      return edge.a !== nodeId && edge.b !== nodeId;
    });

    if (custom.graph.seedId === nodeId) {
      if (custom.graph.nodes.length) {
        custom.graph.nodes[0].type = "seed";
        custom.graph.seedId = custom.graph.nodes[0].id;
      } else {
        custom.graph.seedId = null;
      }
    }

    if (custom.selection && custom.selection.id === nodeId) custom.selection = null;
    clearLinkSource();
    applyCustom({ rebuildView: true, renderInspector: true });
  }

  function eraseCustomEdge(edgeId) {
    const custom = state.custom;
    if (!custom) return;
    if (!SNA.findEdge(custom.graph, edgeId)) return;
    custom.graph.edges = custom.graph.edges.filter(function (edge) {
      return edge.id !== edgeId;
    });
    if (custom.selection && custom.selection.id === edgeId) custom.selection = null;
    applyCustom({ rebuildView: true, renderInspector: true });
  }

  function selectCustomNode(nodeId) {
    const custom = state.custom;
    if (!custom || !SNA.findNode(custom.graph, nodeId)) return;
    custom.selection = { kind: "node", id: nodeId };
    custom.view.setSelection(custom.selection);
    renderCustomInspector(custom.last ? custom.last.analysis : null);
    updateSelectionBadge();
  }

  function selectCustomEdge(edgeId) {
    const custom = state.custom;
    if (!custom || !SNA.findEdge(custom.graph, edgeId)) return;
    custom.selection = { kind: "edge", id: edgeId };
    custom.view.setSelection(custom.selection);
    renderCustomInspector(custom.last ? custom.last.analysis : null);
    updateSelectionBadge();
  }

  function clearCustomSelection() {
    const custom = state.custom;
    if (!custom) return;
    custom.selection = null;
    custom.view.setSelection(null);
    renderCustomInspector(custom.last ? custom.last.analysis : null);
    updateSelectionBadge();
  }

  function updateSelectionBadge() {
    const custom = state.custom;
    const badge = $("custom-selection-badge");
    if (!custom || !badge) return;
    if (!custom.selection) {
      badge.textContent = "nothing selected";
      badge.classList.remove("has-selection");
    } else {
      badge.textContent = custom.selection.kind + " selected";
      badge.classList.add("has-selection");
    }
  }

  function renderCustomInspector(analysis) {
    const custom = state.custom;
    const host = $("custom-inspector");
    if (!custom || !host) return;
    if (!analysis) analysis = SNA.analyze(custom.graph, readParams("custom"));

    if (!custom.selection) {
      host.innerHTML =
        '<p class="inspector-empty">Pick a node or edge to edit its role or delay.</p>';
      updateSelectionBadge();
      return;
    }

    if (custom.selection.kind === "node") {
      renderNodeInspector(host, custom.selection.id, analysis);
    } else {
      renderEdgeInspector(host, custom.selection.id, analysis);
    }
    updateSelectionBadge();
  }

  function renderNodeInspector(host, nodeId, analysis) {
    const custom = state.custom;
    const node = SNA.findNode(custom.graph, nodeId);
    if (!node) return;

    const isSeed = node.id === custom.graph.seedId;
    const nonSeedIndex =
      custom.graph.nodes
        .filter(function (item) {
          return item.id !== custom.graph.seedId;
        })
        .findIndex(function (item) {
          return item.id === node.id;
        }) + 1;
    const hop = analysis.hops.get(node.id);
    const time = analysis.times.get(node.id);
    const selected = analysis.selectedIds.has(node.id);
    const degree = SNA.degree(custom.graph, node.id);

    let html = "";
    html +=
      '<div class="inspect-head">' +
      '<span class="inspect-icon' +
      (!isSeed && node.type === "comment" ? " is-comment" : "") +
      '"><span>' +
      (isSeed ? "★" : nonSeedIndex) +
      "</span></span>" +
      "<div><strong>" +
      escapeHtml(node.name) +
      "</strong><small>" +
      (isSeed ? "seed · original post" : node.type) +
      "</small></div>" +
      "</div>";

    html +=
      '<div class="inspect-field">' +
      '<label for="custom-node-name">Name</label>' +
      '<input class="inspect-input" id="custom-node-name" type="text" maxlength="28" value="' +
      escapeHtml(node.name) +
      '">' +
      "</div>";

    if (!isSeed) {
      html +=
        '<div class="inspect-field">' +
        "<label>Activity type</label>" +
        '<div class="inspect-segment">' +
        '<button type="button" data-node-type="repost" class="' +
        (node.type !== "comment" ? "is-active" : "") +
        '">Repost</button>' +
        '<button type="button" data-node-type="comment" class="' +
        (node.type === "comment" ? "is-active" : "") +
        '">Comment</button>' +
        "</div>" +
        "</div>";
    }

    html +=
      '<div class="inspect-stats">' +
      "<span>hop <b>" +
      (Number.isFinite(hop) ? hop : "—") +
      "</b></span>" +
      "<span>arrives <b>" +
      (Number.isFinite(time) ? SNA.formatDelay(time) : "—") +
      "</b></span>" +
      "<span>degree <b>" +
      degree +
      "</b></span>" +
      "</div>";

    if (isSeed) {
      html +=
        '<p class="inspect-note">The seed is the original post at t = 0. It is excluded from both metrics.</p>';
    } else if (selected) {
      html +=
        '<p class="inspect-note">Inside the latest β window.</p>';
    }

    html +=
      '<div class="inspect-buttons">' +
      (isSeed
        ? '<button type="button" disabled>Current seed</button>'
        : '<button type="button" data-action="make-seed">Make seed</button>') +
      '<button type="button" class="danger" data-action="delete-node">Delete</button>' +
      "</div>";

    host.innerHTML = html;

    const nameInput = host.querySelector("#custom-node-name");
    if (nameInput) {
      nameInput.addEventListener("input", function () {
        node.name = nameInput.value;
      });
      nameInput.addEventListener("change", function () {
        applyCustom({ rebuildView: true, renderInspector: true });
      });
      nameInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          nameInput.blur();
        }
      });
    }

    host.querySelectorAll("[data-node-type]").forEach(function (button) {
      button.addEventListener("click", function () {
        node.type = button.getAttribute("data-node-type");
        applyCustom({ rebuildView: true, renderInspector: true });
      });
    });

    const makeSeed = host.querySelector('[data-action="make-seed"]');
    if (makeSeed) {
      makeSeed.addEventListener("click", function () {
        const oldSeed = SNA.findNode(custom.graph, custom.graph.seedId);
        if (oldSeed && oldSeed.id !== node.id) oldSeed.type = "repost";
        node.type = "seed";
        custom.graph.seedId = node.id;
        applyCustom({ rebuildView: true, renderInspector: true });
      });
    }

    const deleteNode = host.querySelector('[data-action="delete-node"]');
    if (deleteNode) {
      deleteNode.addEventListener("click", function () {
        eraseCustomNode(node.id);
      });
    }
  }

  function renderEdgeInspector(host, edgeId) {
    const custom = state.custom;
    const edge = SNA.findEdge(custom.graph, edgeId);
    if (!edge) return;
    const edgeIndex = custom.graph.edges.indexOf(edge) + 1;
    const a = SNA.findNode(custom.graph, edge.a);
    const b = SNA.findNode(custom.graph, edge.b);
    if (!a || !b) return;

    host.innerHTML =
      '<div class="inspect-head">' +
      '<span class="inspect-icon">↔</span>' +
      "<div><strong>Edge " +
      String(edgeIndex).padStart(2, "0") +
      "</strong><small>" +
      escapeHtml(a.name) +
      " ↔ " +
      escapeHtml(b.name) +
      "</small></div>" +
      "</div>" +
      '<div class="control inspect-delay-control">' +
      '<div class="control-head">' +
      '<label for="custom-edge-delay">repost delay</label>' +
      '<output id="custom-edge-delay-out" for="custom-edge-delay">' +
      SNA.formatDelay(edge.w) +
      "</output>" +
      "</div>" +
      '<input class="range range-eff" id="custom-edge-delay" type="range" min="0.2" max="10" step="0.1" value="' +
      Number(edge.w) +
      '">' +
      "</div>" +
      '<div class="inspect-stats">' +
      "<span>delay <b>" +
      SNA.formatDelay(edge.w) +
      "</b></span>" +
      "<span>affects <b>arrival</b></span>" +
      "</div>" +
      '<p class="inspect-note">This edge is the time between the two activities. It does not affect spread, only efficiency. Each activity has a single source, so cycles are disabled.</p>' +
      '<div class="inspect-buttons">' +
      '<button type="button" class="danger" data-action="delete-edge">Delete edge</button>' +
      "</div>";

    const range = host.querySelector("#custom-edge-delay");
    const out = host.querySelector("#custom-edge-delay-out");
    decorateRange(range);

    range.addEventListener("input", function () {
      edge.w = Number(range.value);
      if (out) out.textContent = SNA.formatDelay(edge.w);
      if (custom.edgeRaf) return;
      custom.edgeRaf = window.requestAnimationFrame(function () {
        custom.edgeRaf = null;
        applyCustom({ rebuildView: true, renderInspector: false });
      });
    });

    const remove = host.querySelector('[data-action="delete-edge"]');
    if (remove) {
      remove.addEventListener("click", function () {
        eraseCustomEdge(edge.id);
      });
    }
  }

  function clearCustomGraph() {
    const custom = state.custom;
    if (!custom) return;
    if (!custom.graph.nodes.length) return;
    if (!window.confirm("Clear every node and edge from the sandbox?")) return;

    custom.graph = { name: "Untitled network", seedId: null, nodes: [], edges: [] };
    custom.view.graph = custom.graph;
    custom.selection = null;
    custom.linkSource = null;
    setCustomTool("add");
    applyCustom({ rebuildView: true, renderInspector: true });
  }

  function loadCustomExample(name, resetParams) {
    const custom = state.custom;
    if (!custom) return;

    const presets = {
      sample: SNA.presets.sample,
      cluster: SNA.presets.community,
    };
    const preset = presets[name] || SNA.presets.sample;

    custom.graph = SNA.cloneGraph(preset);
    custom.selection = null;
    custom.linkSource = null;
    custom.view.graph = custom.graph;
    setCustomTool("move");

    if (resetParams) {
      setParams("custom", { alpha: 2.5, beta: 6 });
    }

    const example = $("custom-example");
    if (example && Object.prototype.hasOwnProperty.call(presets, name)) {
      example.value = name;
    }

    applyCustom({ rebuildView: true, renderInspector: true });
  }

  function setCustomHint(message) {
    const hint = $("custom-hint");
    if (!hint) return;
    hint.innerHTML = '<span class="hint-dot"></span>' + escapeHtml(message);
  }

  function handleCustomKeydown(event) {
    if (state.route !== "custom" || !state.custom) return;
    const target = event.target;
    const inField =
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable);

    if (event.key === "Escape") {
      clearLinkSource();
      updateCustomHint();
      return;
    }

    if (inField) return;

    if ((event.key === "Delete" || event.key === "Backspace") && state.custom.selection) {
      event.preventDefault();
      if (state.custom.selection.kind === "node") {
        eraseCustomNode(state.custom.selection.id);
      } else {
        eraseCustomEdge(state.custom.selection.id);
      }
    }
  }
})();
