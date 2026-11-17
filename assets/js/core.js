/* ==========================================================================
   Diffusion Lab — graph model, presets, and analytic engine
   Plain browser JavaScript. No dependencies, no persistence.
   ========================================================================== */

(function () {
  "use strict";

  const SNA = (window.SNA = window.SNA || {});
  let seq = 0;

  SNA.uid = function (prefix) {
    seq += 1;
    return (prefix || "id") + seq;
  };

  SNA.clamp = function (value, min, max) {
    return Math.min(max, Math.max(min, value));
  };

  SNA.round = function (value, decimals) {
    const p = Math.pow(10, decimals == null ? 2 : decimals);
    return Math.round(value * p) / p;
  };

  SNA.formatNumber = function (value, decimals) {
    if (value == null || !Number.isFinite(value)) return "—";
    return value.toFixed(decimals == null ? 2 : decimals);
  };

  SNA.formatAlpha = function (value) {
    return Number.isInteger(value) ? value.toFixed(1) : String(value);
  };

  SNA.formatDelay = function (value) {
    if (!Number.isFinite(value)) return "—";
    const rounded = Math.round(value * 10) / 10;
    return (Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded)) + "h";
  };

  SNA.formatCompact = function (value, decimals) {
    if (value == null || !Number.isFinite(value)) return "—";
    return value.toFixed(decimals == null ? 2 : decimals);
  };

  SNA.cloneGraph = function (graph) {
    return JSON.parse(JSON.stringify(graph));
  };

  SNA.emptyGraph = function () {
    return {
      name: "Untitled network",
      seedId: null,
      nodes: [],
      edges: [],
    };
  };

  function node(id, x, y, type, name) {
    return {
      id: id,
      x: x,
      y: y,
      type: type || "repost",
      name: name || "Activity " + id,
    };
  }

  function edge(a, b, w) {
    return {
      id: SNA.uid("e"),
      a: a,
      b: b,
      w: w == null ? 1 : w,
    };
  }

  function seedNode(x, y, name) {
    return node("seed", x, y, "seed", name || "Original post");
  }

  function polar(cx, cy, radius, degrees) {
    const angle = (degrees * Math.PI) / 180;
    return {
      x: Math.round((cx + Math.cos(angle) * radius) * 10) / 10,
      y: Math.round((cy + Math.sin(angle) * radius) * 10) / 10,
    };
  }

  /* ==========================================================================
     Preset 01A — dense community
     Concentric rings: 6 immediate neighbours, 10 second-hop nodes,
     5 third-hop nodes. All roads are short.
     ========================================================================== */

  function buildDenseCommunity() {
    const nodes = [seedNode(500, 300, "Original post")];
    const ringDefs = [
      { count: 6, radius: 112, offset: 20, prefix: "a" },
      { count: 10, radius: 207, offset: 9, prefix: "b" },
      { count: 5, radius: 276, offset: 44, prefix: "c" },
    ];

    let n = 0;
    const rings = [];

    ringDefs.forEach(function (def) {
      const ids = [];
      for (let i = 0; i < def.count; i += 1) {
        const angle = def.offset + (360 / def.count) * i;
        const p = polar(500, 300, def.radius, angle);
        const id = def.prefix + (i + 1);
        n += 1;
        const isComment = [9, 13, 18, 20].indexOf(n) !== -1;
        nodes.push(
          node(
            id,
            p.x,
            p.y,
            isComment ? "comment" : "repost",
            "Activity " + String(n).padStart(2, "0")
          )
        );
        ids.push(id);
      }
      rings.push(ids);
    });

    const edges = [];
    const r1 = rings[0];
    const r2 = rings[1];
    const r3 = rings[2];

    r1.forEach(function (id) {
      edges.push(edge("seed", id, 1));
    });

    for (let i = 0; i < r1.length; i += 1) {
      edges.push(edge(r1[i], r1[(i + 1) % r1.length], 1));
    }

    const byId = {};
    nodes.forEach(function (nd) {
      byId[nd.id] = nd;
    });

    /* Each inner node reaches its two closest second-ring nodes. */
    r1.forEach(function (id) {
      const origin = byId[id];
      r2
        .slice()
        .sort(function (a, b) {
          const da = Math.hypot(byId[a].x - origin.x, byId[a].y - origin.y);
          const db = Math.hypot(byId[b].x - origin.x, byId[b].y - origin.y);
          return da - db;
        })
        .slice(0, 2)
        .forEach(function (target) {
          edges.push(edge(id, target, 1));
        });
    });

    for (let i = 0; i < r2.length; i += 1) {
      edges.push(edge(r2[i], r2[(i + 1) % r2.length], 1));
    }

    r3.forEach(function (id) {
      const origin = byId[id];
      const target = r2
        .slice()
        .sort(function (a, b) {
          const da = Math.hypot(byId[a].x - origin.x, byId[a].y - origin.y);
          const db = Math.hypot(byId[b].x - origin.x, byId[b].y - origin.y);
          return da - db;
        })[0];
      edges.push(edge(id, target, 1));
    });

    for (let i = 0; i < r3.length; i += 1) {
      edges.push(edge(r3[i], r3[(i + 1) % r3.length], 1));
    }

    return {
      name: "Dense community",
      seedId: "seed",
      nodes: nodes,
      edges: edges,
    };
  }

  /* ==========================================================================
     Preset 01B — long relay
     A winding backbone plus two leaves at every stop. Same 22 nodes,
     much longer social distance.
     ========================================================================== */

  function buildLongRelay() {
    const nodes = [seedNode(78, 300, "Original post")];
    const chain = [
      { x: 178, y: 328 },
      { x: 283, y: 246 },
      { x: 388, y: 338 },
      { x: 493, y: 254 },
      { x: 598, y: 362 },
      { x: 703, y: 272 },
      { x: 818, y: 340 },
    ];

    const chainIds = [];
    chain.forEach(function (p, i) {
      const id = "b" + (i + 1);
      const isComment = i === 1 || i === 4 || i === 6;
      nodes.push(
        node(
          id,
          p.x,
          p.y,
          isComment ? "comment" : "repost",
          "Relay " + String(i + 1).padStart(2, "0")
        )
      );
      chainIds.push(id);
    });

    const leafIds = [];
    const leafOffsets = [
      { dx: -42, dy: -96 },
      { dx: 42, dy: 96 },
    ];

    chain.forEach(function (p, i) {
      leafOffsets.forEach(function (off, j) {
        const id = "l" + (i + 1) + "-" + (j + 1);
        let x = p.x + off.dx;
        let y = p.y + off.dy;
        x = SNA.clamp(x, 30, 970);
        y = SNA.clamp(y, 34, 566);
        const isComment = i === 2 && j === 1 ? true : i === 4 && j === 0 ? true : i === 6 && j === 0;
        nodes.push(
          node(
            id,
            x,
            y,
            isComment ? "comment" : "repost",
            "Leaf " + (i + 1) + "." + (j + 1)
          )
        );
        leafIds.push({ id: id, chain: i });
      });
    });

    const edges = [];
    edges.push(edge("seed", chainIds[0], 1));
    for (let i = 0; i < chainIds.length - 1; i += 1) {
      edges.push(edge(chainIds[i], chainIds[i + 1], 1));
    }
    leafIds.forEach(function (leaf) {
      edges.push(edge(leaf.id, chainIds[leaf.chain], 1));
    });

    /* Sibling links keep the drawing from feeling like a bare tree. */
    if (leafIds[0] && leafIds[2]) edges.push(edge(leafIds[0].id, leafIds[2].id, 1));
    if (leafIds[8] && leafIds[10]) edges.push(edge(leafIds[8].id, leafIds[10].id, 1));
    if (leafIds[16] && leafIds[18]) edges.push(edge(leafIds[16].id, leafIds[18].id, 1));

    return {
      name: "Long relay",
      seedId: "seed",
      nodes: nodes,
      edges: edges,
    };
  }

  /* ==========================================================================
     Preset 02A — quick core
     A hub-and-spoke burst with short delays.
     ========================================================================== */

  function buildQuickCore() {
    const nodes = [seedNode(500, 300, "Original post")];
    const hubAngles = [-90, -30, 30, 90, 150, 210];
    const hubIds = [];
    const leafGroups = [];

    hubAngles.forEach(function (angle, i) {
      const p = polar(500, 300, 148, angle);
      const id = "h" + (i + 1);
      nodes.push(
        node(id, p.x, p.y, i === 2 || i === 4 ? "comment" : "repost", "Hub " + (i + 1))
      );
      hubIds.push(id);

      const group = [];
      [-15, 15].forEach(function (delta, j) {
        const lp = polar(500, 300, 270, angle + delta);
        const lid = "p" + (i + 1) + "-" + (j + 1);
        const isComment = (i === 1 && j === 0) || (i === 3 && j === 1) || (i === 5 && j === 0);
        nodes.push(
          node(
            lid,
            lp.x,
            lp.y,
            isComment ? "comment" : "repost",
            "Reply " + (i + 1) + "." + (j + 1)
          )
        );
        group.push(lid);
      });

      if (i === 2) {
        const lp = polar(500, 300, 263, angle + 44);
        const lid = "p3-3";
        nodes.push(node(lid, lp.x, lp.y, "repost", "Reply 3.3"));
        group.push(lid);
      }

      leafGroups.push(group);
    });

    const edges = [];
    const seedWeights = [0.4, 0.6, 0.5, 0.7, 0.5, 0.8];
    hubIds.forEach(function (hub, i) {
      edges.push(edge("seed", hub, seedWeights[i]));
      leafGroups[i].forEach(function (leaf, j) {
        const w = [0.5, 0.9, 0.7, 1.2, 0.6, 1.0, 0.8, 1.3, 0.4, 0.9, 1.1, 0.7, 0.6][
          (i * 2 + j) % 13
        ];
        edges.push(edge(hub, leaf, w));
      });
    });

    /* A few cross-links make the burst feel socially real. */
    edges.push(edge(hubIds[0], hubIds[1], 1.1));
    edges.push(edge(hubIds[1], hubIds[2], 1.4));
    edges.push(edge(hubIds[3], hubIds[4], 1.2));
    edges.push(edge(hubIds[4], hubIds[5], 1.3));
    edges.push(edge(hubIds[5], hubIds[0], 1.5));

    return {
      name: "Quick core",
      seedId: "seed",
      nodes: nodes,
      edges: edges,
    };
  }

  /* ==========================================================================
     Preset 02B — delayed mesh
     Two communities, one expensive bridge, and long response times.
     ========================================================================== */

  function buildDelayedMesh() {
    const nodes = [seedNode(165, 300, "Original post")];

    const left = [
      { id: "p1", x: 284, y: 213, type: "repost" },
      { id: "p2", x: 372, y: 249, type: "comment" },
      { id: "p3", x: 379, y: 351, type: "repost" },
      { id: "p4", x: 300, y: 406, type: "repost" },
      { id: "p5", x: 230, y: 356, type: "comment" },
      { id: "p6", x: 245, y: 248, type: "repost" },
      { id: "p7", x: 315, y: 305, type: "repost" },
    ];

    left.forEach(function (n) {
      nodes.push(node(n.id, n.x, n.y, n.type, "Left " + n.id.slice(1)));
    });

    const bridges = [
      { id: "br1", x: 493, y: 243, type: "comment", name: "Bridge 1" },
      { id: "br2", x: 536, y: 378, type: "repost", name: "Bridge 2" },
    ];
    bridges.forEach(function (n) {
      nodes.push(node(n.id, n.x, n.y, n.type, n.name));
    });

    const right = [
      { id: "q1", x: 661, y: 214, type: "repost" },
      { id: "q2", x: 746, y: 181, type: "comment" },
      { id: "q3", x: 827, y: 226, type: "repost" },
      { id: "q4", x: 864, y: 315, type: "repost" },
      { id: "q5", x: 816, y: 402, type: "comment" },
      { id: "q6", x: 731, y: 442, type: "repost" },
      { id: "q7", x: 646, y: 390, type: "comment" },
      { id: "q8", x: 626, y: 305, type: "repost" },
      { id: "q9", x: 707, y: 301, type: "comment" },
      { id: "q10", x: 782, y: 330, type: "comment" },
    ];

    right.forEach(function (n) {
      nodes.push(node(n.id, n.x, n.y, n.type, "Right " + n.id.slice(1)));
    });

    const edges = [];
    const add = function (a, b, w) {
      edges.push(edge(a, b, w));
    };

    /* Left community */
    add("seed", "p1", 1.2);
    add("seed", "p6", 1.0);
    add("seed", "p7", 1.5);
    add("p1", "p2", 1.3);
    add("p1", "p7", 1.1);
    add("p2", "p3", 1.5);
    add("p2", "p7", 1.2);
    add("p3", "p4", 1.6);
    add("p4", "p5", 1.4);
    add("p5", "p6", 1.7);
    add("p6", "p7", 1.3);

    /* The bridge */
    add("p2", "br1", 3.2);
    add("p3", "br2", 3.8);
    add("br1", "br2", 3.4);
    add("br1", "q1", 3.0);
    add("br2", "q7", 3.2);
    add("br2", "q8", 2.8);

    /* Right community */
    add("q1", "q2", 2.5);
    add("q2", "q3", 2.6);
    add("q3", "q4", 2.4);
    add("q4", "q5", 2.5);
    add("q5", "q6", 2.6);
    add("q6", "q7", 2.4);
    add("q7", "q8", 2.0);
    add("q8", "q9", 1.9);
    add("q9", "q10", 2.0);
    add("q10", "q4", 2.2);
    add("q9", "q3", 2.7);
    add("q9", "q1", 2.8);

    return {
      name: "Delayed mesh",
      seedId: "seed",
      nodes: nodes,
      edges: edges,
    };
  }

  /* ==========================================================================
     Sandbox starter graph
     ========================================================================== */

  function buildSampleMesh() {
    const nodes = [seedNode(218, 315, "Original post")];
    const people = [
      { id: "n1", x: 328, y: 201, type: "repost", name: "Ava" },
      { id: "n2", x: 440, y: 272, type: "comment", name: "Ben" },
      { id: "n3", x: 357, y: 397, type: "repost", name: "Cleo" },
      { id: "n4", x: 528, y: 173, type: "repost", name: "Dev" },
      { id: "n5", x: 557, y: 360, type: "comment", name: "Eli" },
      { id: "n6", x: 667, y: 258, type: "repost", name: "Fay" },
      { id: "n7", x: 761, y: 371, type: "repost", name: "Gus" },
      { id: "n8", x: 823, y: 243, type: "comment", name: "Hana" },
      { id: "n9", x: 326, y: 478, type: "repost", name: "Ira" },
      { id: "n10", x: 491, y: 502, type: "comment", name: "Jo" },
      { id: "n11", x: 661, y: 481, type: "repost", name: "Kai" },
      { id: "n12", x: 773, y: 155, type: "repost", name: "Lena" },
    ];

    people.forEach(function (p) {
      nodes.push(node(p.id, p.x, p.y, p.type, p.name));
    });

    const edges = [];
    const add = function (a, b, w) {
      edges.push(edge(a, b, w));
    };

    add("seed", "n1", 0.8);
    add("seed", "n3", 1.2);
    add("n1", "n2", 1.4);
    add("n1", "n4", 2.0);
    add("n1", "n3", 1.1);
    add("n2", "n6", 1.6);
    add("n2", "n5", 2.2);
    add("n3", "n5", 1.8);
    add("n3", "n9", 1.3);
    add("n4", "n12", 2.8);
    add("n5", "n10", 2.4);
    add("n5", "n11", 2.8);
    add("n6", "n8", 1.5);
    add("n6", "n7", 2.1);
    add("n7", "n11", 1.1);
    add("n7", "n8", 1.7);
    add("n8", "n12", 2.0);
    add("n9", "n10", 1.5);
    add("n10", "n11", 1.9);

    return {
      name: "Sample mesh",
      seedId: "seed",
      nodes: nodes,
      edges: edges,
    };
  }

  const denseCommunity = buildDenseCommunity();
  const longRelay = buildLongRelay();
  const quickCore = buildQuickCore();
  const delayedMesh = buildDelayedMesh();
  const sampleMesh = buildSampleMesh();

  SNA.presets = {
    spread: { a: denseCommunity, b: longRelay },
    efficiency: { a: quickCore, b: delayedMesh },
    community: denseCommunity,
    relay: longRelay,
    quick: quickCore,
    slow: delayedMesh,
    sample: sampleMesh,
  };

  /* ==========================================================================
     Analytics
     ========================================================================== */

  function buildAdjacency(graph) {
    const adj = new Map();
    const byId = new Map();

    graph.nodes.forEach(function (n) {
      adj.set(n.id, []);
      byId.set(n.id, n);
    });

    graph.edges.forEach(function (e) {
      if (!byId.has(e.a) || !byId.has(e.b) || e.a === e.b) return;
      const w = Number(e.w);
      if (!Number.isFinite(w) || w <= 0) return;
      adj.get(e.a).push({ id: e.b, w: w, edge: e });
      adj.get(e.b).push({ id: e.a, w: w, edge: e });
    });

    return { adj: adj, byId: byId };
  }

  function bfsHops(graph, adj) {
    const hops = new Map();
    graph.nodes.forEach(function (n) {
      hops.set(n.id, Infinity);
    });
    if (!graph.seedId || !adj.has(graph.seedId)) return hops;

    hops.set(graph.seedId, 0);
    const queue = [graph.seedId];
    let head = 0;

    while (head < queue.length) {
      const current = queue[head];
      head += 1;
      const base = hops.get(current);
      adj.get(current).forEach(function (next) {
        if (hops.get(next.id) === Infinity) {
          hops.set(next.id, base + 1);
          queue.push(next.id);
        }
      });
    }

    return hops;
  }

  function dijkstra(graph, adj) {
    const times = new Map();
    const prev = new Map();
    const visited = new Set();

    graph.nodes.forEach(function (n) {
      times.set(n.id, Infinity);
    });
    if (!graph.seedId || !adj.has(graph.seedId)) {
      return { times: times, prev: prev };
    }

    times.set(graph.seedId, 0);
    const nodes = graph.nodes;

    while (visited.size < nodes.length) {
      let current = null;
      let best = Infinity;
      nodes.forEach(function (n) {
        if (!visited.has(n.id) && times.get(n.id) < best) {
          best = times.get(n.id);
          current = n.id;
        }
      });
      if (current == null) break;
      visited.add(current);

      adj.get(current).forEach(function (next) {
        const candidate = times.get(current) + next.w;
        if (candidate < times.get(next.id) - 1e-9) {
          times.set(next.id, candidate);
          prev.set(next.id, { from: current, edge: next.edge, weight: next.w });
        }
      });
    }

    return { times: times, prev: prev };
  }

  SNA.analyze = function (graph, params) {
    const alpha = Number(params.alpha);
    const beta = Math.max(1, Math.round(Number(params.beta)));
    const wRepost = Number(params.wRepost);
    const wComment = Number(params.wComment);

    const result = {
      alpha: alpha,
      beta: beta,
      wRepost: wRepost,
      wComment: wComment,
      seedId: graph.seedId,
      hops: new Map(),
      times: new Map(),
      byId: new Map(),
      activities: [],
      reachableActivities: [],
      reached: [],
      reachedIds: new Set(),
      selected: [],
      selectedIds: new Set(),
      spreadCount: 0,
      unreachableCount: 0,
      selectedReposts: 0,
      selectedComments: 0,
      sumRepost: 0,
      sumComment: 0,
      weightedTotal: 0,
      denominator: 0,
      efficiency: null,
      hopCounts: new Map(),
      maxHop: 0,
      activityCount: 0,
      percent: 0,
    };

    if (!graph.nodes.length) return result;

    graph.nodes.forEach(function (n) {
      result.byId.set(n.id, n);
    });

    const { adj } = buildAdjacency(graph);
    const hops = bfsHops(graph, adj);
    const weighted = dijkstra(graph, adj);
    result.hops = hops;
    result.times = weighted.times;
    result.prev = weighted.prev;

    graph.nodes.forEach(function (n) {
      if (n.id === graph.seedId) return;
      const hop = hops.get(n.id);
      const time = weighted.times.get(n.id);
      if (hop === Infinity || time === Infinity) {
        result.unreachableCount += 1;
        return;
      }
      const activity = {
        id: n.id,
        type: n.type === "comment" ? "comment" : "repost",
        hop: hop,
        time: time,
        name: n.name,
      };
      result.activities.push(activity);
      result.reachableActivities.push(activity);
      result.hopCounts.set(hop, (result.hopCounts.get(hop) || 0) + 1);
      result.maxHop = Math.max(result.maxHop, hop);
    });

    result.activityCount = result.activities.length;

    result.activities.forEach(function (a) {
      if (a.hop <= alpha) {
        result.reached.push(a);
        result.reachedIds.add(a.id);
      }
    });
    result.spreadCount = result.reached.length;
    result.percent = result.activityCount ? (result.spreadCount / result.activityCount) * 100 : 0;

    /*
     * The β window grows outward from the seed: the "latest" activities are
     * the first ones to arrive after the initial post, not the tail of the
     * cascade. Ties are broken by id for stable results.
     */
    const latestFromSeed = result.activities.slice().sort(function (a, b) {
      if (a.time !== b.time) return a.time - b.time;
      return a.id.localeCompare(b.id);
    });

    result.latest = latestFromSeed;
    const take = Math.min(beta, latestFromSeed.length);
    result.selected = latestFromSeed.slice(0, take);

    let sumRepost = 0;
    let sumComment = 0;
    let selectedReposts = 0;
    let selectedComments = 0;

    result.selected.forEach(function (a) {
      result.selectedIds.add(a.id);
      if (a.type === "comment") {
        sumComment += a.time;
        selectedComments += 1;
      } else {
        sumRepost += a.time;
        selectedReposts += 1;
      }
    });

    result.sumRepost = sumRepost;
    result.sumComment = sumComment;
    result.selectedReposts = selectedReposts;
    result.selectedComments = selectedComments;
    result.denominator = take;
    result.weightedTotal = sumRepost * wRepost + sumComment * wComment;
    result.efficiency = take ? result.weightedTotal / take : null;

    return result;
  };

  SNA.efficiencyCurve = function (graph, params, maxBeta) {
    const values = [];
    const analysis = SNA.analyze(graph, {
      alpha: params.alpha,
      beta: 1,
      wRepost: params.wRepost,
      wComment: params.wComment,
    });
    const latest = analysis.latest || [];
    const limit = Math.min(maxBeta || latest.length, latest.length);
    let sumRepost = 0;
    let sumComment = 0;

    for (let beta = 1; beta <= limit; beta += 1) {
      const activity = latest[beta - 1];
      if (!activity) break;
      if (activity.type === "comment") sumComment += activity.time;
      else sumRepost += activity.time;
      values.push({
        x: beta,
        y: (sumRepost * params.wRepost + sumComment * params.wComment) / beta,
      });
    }

    return values;
  };

  SNA.spreadCurve = function (graph, params, alphaValues) {
    const analysis = SNA.analyze(graph, {
      alpha: params.alpha,
      beta: params.beta,
      wRepost: params.wRepost,
      wComment: params.wComment,
    });
    const activities = analysis.activities || [];

    return alphaValues.map(function (alpha) {
      return {
        x: alpha,
        y: activities.filter(function (a) {
          return a.hop <= alpha;
        }).length,
      };
    });
  };

  SNA.countAtHop = function (analysis, hop) {
    return analysis.hopCounts.get(hop) || 0;
  };

  /* ==========================================================================
     Delay color ramp — cool (fast) to warm (slow)
     ========================================================================== */

  const RAMP = [
    { t: 0, c: [99, 214, 172] },
    { t: 0.5, c: [242, 197, 99] },
    { t: 1, c: [239, 118, 79] },
  ];

  SNA.weightColor = function (weight, min, max) {
    if (max <= min) return "rgb(168, 193, 177)";
    const t = SNA.clamp((weight - min) / (max - min), 0, 1);
    let low = RAMP[0];
    let high = RAMP[RAMP.length - 1];
    for (let i = 0; i < RAMP.length - 1; i += 1) {
      if (t >= RAMP[i].t && t <= RAMP[i + 1].t) {
        low = RAMP[i];
        high = RAMP[i + 1];
        break;
      }
    }
    const local = high.t === low.t ? 0 : (t - low.t) / (high.t - low.t);
    const color = low.c.map(function (value, i) {
      return Math.round(value + (high.c[i] - value) * local);
    });
    return "rgb(" + color.join(", ") + ")";
  };

  SNA.delayBounds = function (graph) {
    let min = Infinity;
    let max = -Infinity;
    graph.edges.forEach(function (e) {
      const w = Number(e.w);
      if (!Number.isFinite(w)) return;
      if (w < min) min = w;
      if (w > max) max = w;
    });
    if (min === Infinity) {
      min = 1;
      max = 1;
    }
    return { min: min, max: max };
  };

  /* ==========================================================================
     Small helpers used by the editor
     ========================================================================== */

  SNA.degree = function (graph, nodeId) {
    return graph.edges.filter(function (e) {
      return e.a === nodeId || e.b === nodeId;
    }).length;
  };

  SNA.findEdge = function (graph, id) {
    return graph.edges.find(function (e) {
      return e.id === id;
    });
  };

  SNA.findNode = function (graph, id) {
    return graph.nodes.find(function (n) {
      return n.id === id;
    });
  };

  SNA.edgeBetween = function (graph, a, b) {
    return graph.edges.find(function (e) {
      return (e.a === a && e.b === b) || (e.a === b && e.b === a);
    });
  };

  SNA.getNeighborIds = function (graph, id) {
    const ids = [];
    graph.edges.forEach(function (e) {
      if (e.a === id) ids.push(e.b);
      else if (e.b === id) ids.push(e.a);
    });
    return ids;
  };

  SNA.nextLabel = function (graph) {
    let max = 0;
    graph.nodes.forEach(function (n) {
      if (n.id === "seed") return;
      const match = String(n.name || "").match(/(\d+)/);
      if (match) max = Math.max(max, Number(match[1]));
    });
    return max + 1;
  };

  SNA.ensureSeed = function (graph) {
    if (!graph.nodes.some(function (n) { return n.id === graph.seedId; })) {
      graph.seedId = graph.nodes.length ? graph.nodes[0].id : null;
      if (graph.seedId) {
        const seed = SNA.findNode(graph, graph.seedId);
        if (seed) seed.type = "seed";
      }
    }
  };
})();
