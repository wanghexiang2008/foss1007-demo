/* ==========================================================================
   Diffusion Lab — SVG views
   Network canvases, live charts, timelines, and the hero illustration.
   ========================================================================== */

(function () {
  "use strict";

  const SNA = (window.SNA = window.SNA || {});
  const NS = "http://www.w3.org/2000/svg";

  function svg(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (attrs[key] == null) return;
        el.setAttribute(key, attrs[key]);
      });
    }
    return el;
  }

  function textEl(attrs, text) {
    const el = svg("text", attrs);
    if (text != null) el.textContent = text;
    return el;
  }

  function shorten(value, length) {
    const str = String(value == null ? "" : value);
    if (str.length <= length) return str;
    return str.slice(0, Math.max(1, length - 1)) + "…";
  }

  function setupHost(host) {
    host.innerHTML = "";
    const chart = svg("svg", {
      viewBox: "0 0 1000 600",
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true",
      focusable: "false",
      class: "nx-svg",
    });
    host.appendChild(chart);
    return chart;
  }

  function titleText(parent, text) {
    const title = svg("title");
    title.textContent = text;
    parent.appendChild(title);
    return title;
  }

  /* ==========================================================================
     NetworkView
     ========================================================================== */

  function NetworkView(host, graph, options) {
    this.host = host;
    this.graph = graph;
    this.options = Object.assign(
      {
        showWeights: false,
        showNames: false,
        showNumbers: true,
        emphasize: "both",
        hero: false,
        nodeScale: 1,
      },
      options || {}
    );

    this.svg = null;
    this.nodeEls = new Map();
    this.edgeEls = new Map();
    this.edgeLineEls = new Map();
    this.edgeFlowEls = new Map();
    this.edgeLabelEls = new Map();
    this.edgeLabelOffsets = new Map();
    this.selection = null;
    this.linkSource = null;
    this.reachedIds = new Set();
    this.selectedIds = new Set();
    this._firstUpdate = true;
    this._version = 0;
    this.bounds = SNA.delayBounds(graph);

    this.build();
    this.setEmphasis(this.options.emphasize);
  }

  NetworkView.prototype.build = function () {
    const host = this.host;
    const graph = this.graph;
    const self = this;
    const options = this.options;
    const bounds = SNA.delayBounds(graph);
    this.bounds = bounds;

    host.innerHTML = "";
    host.classList.add("nx-host");
    host.classList.toggle("nx-weight-edges", !!options.showWeights);
    host.classList.toggle("hide-edge-labels", !options.showWeights);
    host.setAttribute("tabindex", "0");

    const canvas = setupHost(host);
    this.svg = canvas;

    const bg = svg("rect", {
      x: 0,
      y: 0,
      width: 1000,
      height: 600,
      fill: "transparent",
      class: "nx-bg",
      "data-canvas": "true",
    });
    canvas.appendChild(bg);

    const byId = new Map();
    graph.nodes.forEach(function (n) {
      byId.set(n.id, n);
    });
    this.byId = byId;

    const radii = this.computeRadii();
    this.radii = radii;

    if (this.options.hero) {
      this.appendHeroDecor(canvas, byId, radii);
    }

    const edgesGroup = svg("g", { class: "nx-edges" });
    const labelsGroup = svg("g", { class: "nx-edge-labels" });
    const nodesGroup = svg("g", { class: "nx-nodes" });
    canvas.appendChild(edgesGroup);
    canvas.appendChild(labelsGroup);
    canvas.appendChild(nodesGroup);

    const numberById = new Map();
    let counter = 0;
    graph.nodes.forEach(function (n) {
      if (n.id === graph.seedId) return;
      counter += 1;
      numberById.set(n.id, counter);
    });

    graph.edges.forEach(function (e, index) {
      const a = byId.get(e.a);
      const b = byId.get(e.b);
      if (!a || !b) return;

      const group = svg("g", {
        class: "nx-edge",
        "data-edge-id": e.id,
      });
      titleText(group, "Delay " + SNA.formatDelay(e.w));

      const hit = svg("line", {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        class: "nx-edge-hit",
        "data-edge-id": e.id,
      });
      const line = svg("line", {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        class: "nx-edge-line",
      });

      let widthValue = 1.4;
      if (options.showWeights) {
        const normalized =
          bounds.max === bounds.min ? 0.2 : (Number(e.w) - bounds.min) / (bounds.max - bounds.min);
        widthValue = 1.4 + normalized * 3.8;
        line.style.setProperty("--edge-weight-color", SNA.weightColor(e.w, bounds.min, bounds.max));
      }
      line.style.setProperty("--edge-width", widthValue.toFixed(2));

      const flow = svg("line", {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        class: "nx-edge-flow",
      });
      flow.style.setProperty("--flow-delay", ((index % 9) * -0.75).toFixed(2) + "s");

      group.appendChild(hit);
      group.appendChild(line);
      group.appendChild(flow);
      edgesGroup.appendChild(group);

      self.edgeEls.set(e.id, group);
      self.edgeLineEls.set(e.id, line);
      self.edgeFlowEls.set(e.id, flow);

      if (options.showWeights) {
        const label = textEl(
          {
            class: "nx-edge-label",
            "data-edge-id": e.id,
            "text-anchor": "middle",
          },
          SNA.formatDelay(e.w)
        );
        labelsGroup.appendChild(label);
        self.edgeLabelEls.set(e.id, label);
      }
    });

    if (this.options.showWeights) {
      this.positionEdgeLabels();
    }

    graph.nodes.forEach(function (n) {
      const isSeed = n.id === graph.seedId;
      const isComment = n.type === "comment";
      const radius = isSeed ? radii.seed : radii.node;
      const group = svg("g", {
        class:
          "nx-node" +
          (isSeed ? " is-seed" : "") +
          (isComment ? " is-comment" : ""),
        "data-node-id": n.id,
        transform: "translate(" + n.x + " " + n.y + ")",
      });
      titleText(group, n.name || n.id);

      const hit = svg("circle", {
        r: radius + 9,
        fill: "transparent",
        class: "node-hit",
      });
      group.appendChild(hit);

      const reachGlow = svg("circle", {
        r: radius + 7,
        class: "node-reach-glow",
      });
      group.appendChild(reachGlow);

      const reach = svg("circle", {
        r: radius + 5.3,
        class: "node-reach",
      });
      group.appendChild(reach);

      if (isSeed) {
        const halo = svg("circle", {
          r: radius + 7,
          class: "node-halo",
        });
        group.appendChild(halo);

        group.appendChild(
          svg("circle", {
            r: radius,
            class: "node-body node-seed",
          })
        );

        const star = svg("path", {
          d: starPath(radius * 0.64),
          class: "node-seed-star",
        });
        group.appendChild(star);
      } else {
        if (isComment) {
          const side = radius * 1.58;
          group.appendChild(
            svg("rect", {
              x: -side / 2,
              y: -side / 2,
              width: side,
              height: side,
              rx: 2.2,
              transform: "rotate(45)",
              class: "node-body",
            })
          );
        } else {
          group.appendChild(
            svg("circle", {
              r: radius,
              class: "node-body",
            })
          );
        }

        if (options.showNumbers) {
          group.appendChild(
            textEl(
              {
                class: "node-label",
                x: 0,
                y: 0,
              },
              String(numberById.get(n.id))
            )
          );
        }

        if (options.showNames) {
          group.appendChild(
            textEl(
              {
                class: "node-name",
                x: 0,
                y: radius + 12,
              },
              shorten(n.name || "Node", 13)
            )
          );
        }
      }

      if (isSeed) {
        group.appendChild(
          textEl(
            {
              class: "node-seed-tag",
              x: 0,
              y: radius + 16,
              "text-anchor": "middle",
            },
            "SEED"
          )
        );
      }

      const selectable = svg("circle", {
        r: radius + 7.8,
        class: "node-select",
      });
      group.appendChild(selectable);

      group.appendChild(
        svg("circle", {
          r: 2.1,
          cx: radius + 4.5,
          cy: -(radius + 2.5),
          class: "node-select-dot",
        })
      );

      const editorSelect = svg("circle", {
        r: radius + 5.5,
        class: "node-editor-select",
      });
      group.appendChild(editorSelect);

      self.nodeEls.set(n.id, group);
      nodesGroup.appendChild(group);
    });

    if (options.hero) {
      this.appendHeroSignals(canvas, byId);
    }

    if (this.selection) this.setSelection(this.selection);
    if (this.linkSource) this.setLinkSource(this.linkSource);
  };

  function starPath(radius) {
    const inner = radius * 0.32;
    const points = [];
    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI / 4) * i - Math.PI / 2;
      const r = i % 2 === 0 ? radius : inner;
      points.push((Math.cos(angle) * r).toFixed(2) + "," + (Math.sin(angle) * r).toFixed(2));
    }
    return "M" + points.join(" L") + " Z";
  }

  NetworkView.prototype.computeRadii = function () {
    const count = Math.max(1, this.graph.nodes.length);
    let base;
    if (this.options.hero) base = 11.5;
    else if (count > 20) base = 14;
    else if (count > 15) base = 15;
    else base = 17.5;
    base *= this.options.nodeScale;
    return {
      node: base,
      seed: base + 5.5,
    };
  };

  NetworkView.prototype.appendHeroDecor = function (canvas, byId, radii) {
    const seed = byId.get(this.graph.seedId);
    if (!seed) return;

    const group = svg("g", {
      class: "nx-hero-ripples",
      transform: "translate(" + seed.x + " " + seed.y + ")",
    });
    [112, 207, 276].forEach(function (r, i) {
      const ring = svg("circle", {
        r: r,
        class: "nx-hero-ripple",
      });
      ring.style.setProperty("--ripple-delay", i * 0.9 + "s");
      group.appendChild(ring);
    });
    canvas.appendChild(group);
  };

  NetworkView.prototype.appendHeroSignals = function (canvas, byId) {
    const seedId = this.graph.seedId;
    const seed = byId.get(seedId);
    if (!seed) return;

    const targets = this.graph.nodes
      .filter(function (n) {
        return n.id !== seedId;
      })
      .slice(0, 5);

    if (!targets.length) return;

    const group = svg("g", { class: "nx-hero-signals" });
    targets.forEach(function (target, index) {
      const mid = {
        x: (seed.x + target.x) / 2,
        y: (seed.y + target.y) / 2,
      };
      const dot = svg("circle", {
        r: 2,
        class: "nx-hero-signal",
      });
      const motion = svg("animateMotion", {
        dur: 4.8 + index * 0.7 + "s",
        begin: index * 1.15 + "s",
        repeatCount: "indefinite",
        path:
          "M" +
          seed.x +
          " " +
          seed.y +
          " L" +
          mid.x +
          " " +
          mid.y +
          " L" +
          target.x +
          " " +
          target.y,
      });
      dot.appendChild(motion);
      group.appendChild(dot);
    });
    canvas.appendChild(group);
  };

  NetworkView.prototype.positionEdgeLabels = function () {
    if (!this.options.showWeights) return;

    const self = this;
    const byId = this.byId;
    const labelBoxes = [];
    const selectedEdge =
      this.selection && this.selection.kind === "edge" ? this.selection.id : null;

    const order = this.graph.edges.slice().sort(function (a, b) {
      if (a.id === selectedEdge) return -1;
      if (b.id === selectedEdge) return 1;
      return 0;
    });

    order.forEach(function (e) {
      const label = self.edgeLabelEls.get(e.id);
      if (!label) return;
      const a = byId.get(e.a);
      const b = byId.get(e.b);
      if (!a || !b) return;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length;
      const ny = dx / length;
      const orientation = e.id.charCodeAt(e.id.length - 1) % 2 === 0 ? 1 : -1;
      const offset = 10.5 * orientation + 1.5;
      const x = a.x + dx * 0.55 + nx * offset;
      const y = a.y + dy * 0.55 + ny * offset;
      const text = label.textContent || "";
      const width = text.length * 8.2 + 11;
      const box = {
        left: x - width / 2,
        right: x + width / 2,
        top: y - 9,
        bottom: y + 9,
      };

      const overlaps = labelBoxes.some(function (other) {
        return !(
          box.right < other.left ||
          box.left > other.right ||
          box.bottom < other.top ||
          box.top > other.bottom
        );
      });

      if (overlaps && e.id !== selectedEdge) {
        label.setAttribute("opacity", "0");
        label.setAttribute("visibility", "hidden");
      } else {
        label.setAttribute("opacity", "1");
        label.setAttribute("visibility", "visible");
        label.setAttribute("x", x.toFixed(1));
        label.setAttribute("y", y.toFixed(1));
        labelBoxes.push(box);
      }
    });
  };

  NetworkView.prototype.updateGeometry = function () {
    const byId = this.byId;
    const self = this;
    this.graph.nodes.forEach(function (n) {
      const group = self.nodeEls.get(n.id);
      if (group) group.setAttribute("transform", "translate(" + n.x + " " + n.y + ")");
    });

    this.graph.edges.forEach(function (e) {
      const a = byId.get(e.a);
      const b = byId.get(e.b);
      if (!a || !b) return;
      const line = self.edgeLineEls.get(e.id);
      const flow = self.edgeFlowEls.get(e.id);
      const hit = self.edgeEls.get(e.id) && self.edgeEls.get(e.id).querySelector(".nx-edge-hit");
      [line, flow, hit].forEach(function (el) {
        if (!el) return;
        el.setAttribute("x1", a.x);
        el.setAttribute("y1", a.y);
        el.setAttribute("x2", b.x);
        el.setAttribute("y2", b.y);
      });
    });

    this.positionEdgeLabels();
  };

  NetworkView.prototype.toGraphPoint = function (clientX, clientY) {
    if (!this.svg) return null;
    const point = this.svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return null;
    const transformed = point.matrixTransform(ctm.inverse());
    return {
      x: SNA.clamp(transformed.x, 42, 958),
      y: SNA.clamp(transformed.y, 38, 562),
    };
  };

  NetworkView.prototype.setEmphasis = function (mode) {
    this.host.classList.remove(
      "nx-emphasis-spread",
      "nx-emphasis-efficiency",
      "nx-emphasis-both"
    );
    this.host.classList.add("nx-emphasis-" + (mode || "both"));
  };

  NetworkView.prototype.setShowWeights = function (show) {
    this.options.showWeights = !!show;
    this.host.classList.toggle("hide-edge-labels", !show);
  };

  NetworkView.prototype.setSelection = function (selection) {
    this.selection = selection || null;

    this.nodeEls.forEach(function (el) {
      el.classList.remove("is-editor-selected");
    });
    this.edgeEls.forEach(function (el) {
      el.classList.remove("is-editor-selected");
    });
    this.edgeLabelEls.forEach(function (el) {
      el.classList.remove("is-editor-selected");
    });

    if (!selection) return;

    if (selection.kind === "node") {
      const el = this.nodeEls.get(selection.id);
      if (el) el.classList.add("is-editor-selected");
    } else if (selection.kind === "edge") {
      const el = this.edgeEls.get(selection.id);
      const label = this.edgeLabelEls.get(selection.id);
      if (el) el.classList.add("is-editor-selected");
      if (label) label.classList.add("is-editor-selected");
      this.positionEdgeLabels();
    }
  };

  NetworkView.prototype.setLinkSource = function (id) {
    this.linkSource = id || null;
    this.nodeEls.forEach(function (el, key) {
      el.classList.toggle("is-link-source", key === id);
    });
  };

  NetworkView.prototype.setTool = function (tool) {
    this.host.classList.remove("tool-move", "tool-add", "tool-link", "tool-erase");
    this.host.classList.add("tool-" + (tool || "move"));
  };

  NetworkView.prototype.update = function (analysis) {
    const first = this._firstUpdate;
    const prevReached = this.reachedIds;
    const prevSelected = this.selectedIds;
    const reached = analysis.reachedIds;
    const selected = analysis.selectedIds;
    const seedId = this.graph.seedId;
    const self = this;

    this.nodeEls.forEach(function (el, id) {
      const isSeed = id === seedId;
      const node = self.byId.get(id);
      const hop = analysis.hops.get(id);
      const time = analysis.times.get(id);
      const isReached = isSeed || reached.has(id);
      const isSelected = selected.has(id);
      el.classList.toggle("is-reached", isReached);
      el.classList.toggle("is-unreached", !isSeed && !reached.has(id));
      el.classList.toggle("is-selected", isSelected);

      if (!first && !prevReached.has(id) && reached.has(id)) {
        triggerOnce(el, "is-newly-reached", 700);
      }
      if (!first && !prevSelected.has(id) && selected.has(id)) {
        triggerOnce(el, "is-newly-selected", 720);
      }

      const title = el.querySelector("title");
      if (title) {
        if (isSeed) {
          title.textContent = (node.name || "Initial post") + "\nOriginal post · seed";
        } else if (Number.isFinite(hop)) {
          const typeLabel = node && node.type === "comment" ? "comment" : "repost";
          title.textContent =
            (node.name || "Activity " + id) +
            "\n" +
            typeLabel +
            " · " +
            hop +
            " hop" +
            (hop === 1 ? "" : "s") +
            " · arrives at " +
            SNA.formatDelay(time);
        } else {
          title.textContent = (node && node.name) || id;
        }
      }
    });

    const seedHop = analysis.hops.get(seedId);
    const seedReached = Number.isFinite(seedHop) ? seedHop <= analysis.alpha : false;

    this.edgeEls.forEach(function (el, id) {
      const edge = self.graph.edges.find(function (item) {
        return item.id === id;
      });
      if (!edge) return;
      const hopA = analysis.hops.get(edge.a);
      const hopB = analysis.hops.get(edge.b);
      const both =
        (edge.a === seedId ? seedReached : reached.has(edge.a)) &&
        (edge.b === seedId ? seedReached : reached.has(edge.b));
      el.classList.toggle("is-reached", !!both);
      el.classList.toggle("is-unreached", !both);
    });

    this.reachedIds = new Set(reached);
    this.selectedIds = new Set(selected);
    this._firstUpdate = false;
  };

  function triggerOnce(el, className, duration) {
    el.classList.remove(className);
    /* Force a reflow so the same class can replay. */
    void el.getBoundingClientRect();
    el.classList.add(className);
    window.setTimeout(function () {
      el.classList.remove(className);
    }, duration);
  }

  SNA.NetworkView = NetworkView;

  /* ==========================================================================
     Line chart
     ========================================================================== */

  SNA.renderLineChart = function (host, config) {
    if (!host) return;
    host.innerHTML = "";
    const width = config.width || 900;
    const height = config.height || 286;
    const margin = { top: 26, right: 26, bottom: 35, left: 45 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const xMin = config.xDomain[0];
    const xMax = config.xDomain[1];
    const yMax = config.yDomain[1];
    const yMin = config.yDomain[0] || 0;

    const xScale = function (x) {
      return margin.left + ((x - xMin) / Math.max(xMax - xMin, 0.0001)) * plotW;
    };
    const yScale = function (y) {
      return margin.top + plotH - ((y - yMin) / Math.max(yMax - yMin, 0.0001)) * plotH;
    };

    const root = svg("svg", {
      viewBox: "0 0 " + width + " " + height,
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label": config.ariaLabel || "Line chart",
    });
    host.appendChild(root);

    const yTicks = config.yTicks || [];
    yTicks.forEach(function (tick) {
      const y = yScale(tick);
      root.appendChild(
        svg("line", {
          x1: margin.left,
          y1: y,
          x2: width - margin.right,
          y2: y,
          class: "chart-grid-line",
        })
      );
      root.appendChild(
        textEl(
          {
            x: margin.left - 10,
            y: y + 2.5,
            "text-anchor": "end",
            class: "chart-tick-label",
          },
          config.formatY ? config.formatY(tick) : String(tick)
        )
      );
    });

    root.appendChild(
      svg("line", {
        x1: margin.left,
        y1: margin.top + plotH,
        x2: width - margin.right,
        y2: margin.top + plotH,
        class: "chart-axis",
      })
    );

    (config.xTicks || []).forEach(function (tick) {
      const x = xScale(tick);
      root.appendChild(
        svg("line", {
          x1: x,
          y1: margin.top + plotH,
          x2: x,
          y2: margin.top + plotH + 4,
          class: "chart-axis",
        })
      );
      root.appendChild(
        textEl(
          {
            x: x,
            y: margin.top + plotH + 17,
            "text-anchor": "middle",
            class: "chart-axis-label",
          },
          config.formatX ? config.formatX(tick) : String(tick)
        )
      );
    });

    if (config.currentX != null) {
      const cx = xScale(config.currentX);
      root.appendChild(
        svg("line", {
          x1: cx,
          y1: margin.top,
          x2: cx,
          y2: margin.top + plotH,
          class: "chart-current-line",
        })
      );
      if (config.currentText) {
        root.appendChild(
          textEl(
            {
              x: cx,
              y: 12,
              "text-anchor": "middle",
              class: "chart-axis-title",
            },
            config.currentText
          )
        );
      }
    }

    const currentLabels = [];

    (config.series || []).forEach(function (series, seriesIndex) {
      if (!series.points || !series.points.length) return;
      const points = series.points.slice().sort(function (a, b) {
        return a.x - b.x;
      });
      let d = "M" + xScale(points[0].x).toFixed(2) + " " + yScale(points[0].y).toFixed(2);
      for (let i = 1; i < points.length; i += 1) {
        const p = points[i];
        if (config.step) {
          d +=
            " H" +
            xScale(p.x).toFixed(2) +
            " V" +
            yScale(p.y).toFixed(2);
        } else {
          d +=
            " L" +
            xScale(p.x).toFixed(2) +
            " " +
            yScale(p.y).toFixed(2);
        }
      }

      if (series.area) {
        const area =
          d +
          " L" +
          xScale(points[points.length - 1].x).toFixed(2) +
          " " +
          yScale(yMin).toFixed(2) +
          " L" +
          xScale(points[0].x).toFixed(2) +
          " " +
          yScale(yMin).toFixed(2) +
          " Z";
        root.appendChild(
          svg("path", {
            d: area,
            class: "chart-area",
            style: "fill:" + series.color + ";",
          })
        );
      }

      const seriesStyle = [
        "stroke:" + series.color + ";",
        "stroke-width:" + (series.lineWidth || 2) + ";",
        series.dash ? "stroke-dasharray:" + series.dash + ";" : "",
        series.opacity != null ? "opacity:" + series.opacity + ";" : "",
      ].join("");

      root.appendChild(
        svg("path", {
          d: d,
          class: "chart-line",
          style: seriesStyle,
        })
      );

      if (config.currentX != null && series.showCurrent !== false) {
        const currentY = valueAt(points, config.currentX, config.step);
        if (currentY != null) {
          currentLabels.push({
            x: xScale(config.currentX),
            y: yScale(currentY),
            value: currentY,
            color: series.color,
            name: series.name,
            index: seriesIndex,
          });
        }
      }
    });

    currentLabels.forEach(function (label, index) {
      root.appendChild(
        svg("circle", {
          cx: label.x,
          cy: label.y,
          r: 4.5,
          fill: label.color,
          class: "chart-current-dot",
        })
      );

      const nearRight = label.x > width - 72;
      const below = label.y < margin.top + 26;
      const valueText = config.formatY ? config.formatY(label.value) : String(label.value);
      root.appendChild(
        textEl(
          {
            x: label.x + (nearRight ? -8 : 8),
            y: label.y + (below ? 17 : -9),
            "text-anchor": nearRight ? "end" : "start",
            class: "chart-current-label",
            style: "fill:" + label.color + ";",
          },
          valueText
        )
      );
    });

    root.appendChild(
      textEl(
        {
          x: margin.left,
          y: 13,
          class: "chart-axis-title",
        },
        config.yTitle || ""
      )
    );

    root.appendChild(
      textEl(
        {
          x: width - margin.right,
          y: height - 2,
          "text-anchor": "end",
          class: "chart-axis-title",
        },
        config.xTitle || ""
      )
    );
  };

  function valueAt(points, x, step) {
    if (!points.length) return null;
    if (step) {
      let value = points[0].y;
      for (let i = 0; i < points.length; i += 1) {
        if (points[i].x <= x + 1e-9) value = points[i].y;
        else break;
      }
      return value;
    }
    if (x <= points[0].x) return points[0].y;
    if (x >= points[points.length - 1].x) return points[points.length - 1].y;
    for (let i = 0; i < points.length - 1; i += 1) {
      if (x >= points[i].x && x <= points[i + 1].x) {
        const ratio = (x - points[i].x) / (points[i + 1].x - points[i].x);
        return points[i].y + (points[i + 1].y - points[i].y) * ratio;
      }
    }
    return null;
  }

  /* ==========================================================================
     Activity timeline
     ========================================================================== */

  SNA.renderTimeline = function (host, config) {
    host.innerHTML = "";
    const width = 880;
    const height = 72;
    const margin = { left: 18, right: 18 };
    const baseline = 41;
    const maxTime = Math.max(config.maxTime || 0.1, 0.1);
    const activities = config.activities || [];
    const selectedIds = config.selectedIds || new Set();
    const plotW = width - margin.left - margin.right;

    const root = svg("svg", {
      viewBox: "0 0 " + width + " " + height,
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label":
        "Activity timeline. The latest " +
        (config.beta || "") +
        " activities are highlighted in gold.",
    });
    host.appendChild(root);

    const xScale = function (time) {
      return margin.left + (time / maxTime) * plotW;
    };

    const selectedActivities = activities.filter(function (activity) {
      return selectedIds.has(activity.id);
    });

    if (selectedActivities.length) {
      const times = selectedActivities.map(function (a) { return a.time; });
      const start = 0;
      const end = Math.max.apply(null, times);
      const left = xScale(start);
      const right = xScale(end);
      root.appendChild(
        svg("rect", {
          x: left,
          y: 17,
          width: Math.max(right - left, 1.5),
          height: 33,
          rx: 2,
          class: "tl-window",
        })
      );

      const labelX = SNA.clamp((left + right) / 2, margin.left + 52, width - margin.right - 52);
      root.appendChild(
        textEl(
          {
            x: labelX,
            y: 10,
            "text-anchor": "middle",
            class: "tl-window-label",
          },
          "β WINDOW · FROM SEED"
        )
      );
    }

    root.appendChild(
      svg("line", {
        x1: margin.left,
        y1: baseline,
        x2: width - margin.right,
        y2: baseline,
        class: "tl-axis",
      })
    );

    const ticks = [0, maxTime / 2, maxTime];
    ticks.forEach(function (time, index) {
      const x = xScale(time);
      root.appendChild(
        svg("line", {
          x1: x,
          y1: baseline - 3,
          x2: x,
          y2: baseline + 3,
          class: "tl-tick",
        })
      );
      root.appendChild(
        textEl(
          {
            x: SNA.clamp(x, margin.left + 12, width - margin.right - 12),
            y: height - 3,
            "text-anchor": index === 0 ? "start" : index === ticks.length - 1 ? "end" : "middle",
            class: "tl-tick-label",
          },
          SNA.formatDelay(time)
        )
      );
    });

    activities.forEach(function (activity, index) {
      const isComment = activity.type === "comment";
      const selected = selectedIds.has(activity.id);
      const x = xScale(activity.time);
      const laneY = isComment ? baseline + 11 : baseline - 11;
      const jitter = ((index % 3) - 1) * 1.4;
      const dotY = laneY + jitter;

      if (selected) {
        const ring = svg(isComment ? "rect" : "circle", {
          class: "tl-selected-ring",
        });
        if (isComment) {
          const s = 17;
          ring.setAttribute("x", x - s / 2);
          ring.setAttribute("y", dotY - s / 2);
          ring.setAttribute("width", s);
          ring.setAttribute("height", s);
          ring.setAttribute("rx", 1);
          ring.setAttribute("transform", "rotate(45 " + x + " " + dotY + ")");
        } else {
          ring.setAttribute("cx", x);
          ring.setAttribute("cy", dotY);
          ring.setAttribute("r", 9.5);
        }
        root.appendChild(ring);
      }

      let dot;
      if (isComment) {
        dot = svg("rect", {
          x: x - 4.8,
          y: dotY - 4.8,
          width: 9.6,
          height: 9.6,
          rx: 1,
          transform: "rotate(45 " + x + " " + dotY + ")",
          class: "tl-dot is-comment" + (selected ? " is-selected" : ""),
        });
      } else {
        dot = svg("circle", {
          cx: x,
          cy: dotY,
          r: 5,
          class: "tl-dot" + (selected ? " is-selected" : ""),
        });
      }
      titleText(
        dot,
        (activity.name || activity.id) +
          " · " +
          activity.type +
          " · " +
          SNA.formatDelay(activity.time)
      );
      root.appendChild(dot);
    });

    root.appendChild(
      textEl(
        {
          x: margin.left,
          y: height - 3,
          class: "tl-caption",
        },
        ""
      )
    );
  };

  /* ==========================================================================
     Tiny sparkline used by the hero? Exposed for future modules.
     ========================================================================== */

  SNA.hero = {
    path: function (points, width, height) {
      if (!points.length) return "";
      const maxX = Math.max.apply(null, points.map(function (p) { return p.x; })) || 1;
      const maxY = Math.max.apply(null, points.map(function (p) { return p.y; })) || 1;
      return points
        .map(function (p, i) {
          const x = (p.x / maxX) * width;
          const y = height - (p.y / maxY) * height;
          return (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
        })
        .join(" ");
    },
  };
})();
