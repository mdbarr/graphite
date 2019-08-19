#!/usr/bin/env node
'use strict';

require('barrkeep/pp');
const fs = require('fs');
const path = require('path');
const nodegit = require('nodegit');

const master = 'master';
//const LIMIT = 5000;

const RENDER_LIMIT = Infinity;

const nodes = [ ];
const index = new Map();
const branches = new Map();
const tags = new Map();
let initial = null;

branches.set(master, null); // sorting

//////////

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateBranchName(length = 8) {
  const possibleAlphaNumerics = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890';
  let generated = '';
  for (let i = 0; i < length; i++) {
    generated += possibleAlphaNumerics.charAt(rand(0, possibleAlphaNumerics.length - 1));
  }
  return generated;
}

//////////

const COLORS = [
  '#D50000', '#C51162', '#AA00FF', '#6200EA', '#304FFE', '#2962FF',
  '#0091EA', '#00B8D4', '#00BFA5', '#00C853', '#64DD17', '#AEEA00',
  '#FFD600', '#FFAB00', '#FF6D00', '#DD2C00',

  '#FF1744', '#F50057', '#D500F9', '#651FFF', '#3D5AFE', '#2979FF',
  '#00B0FF', '#00E5FF', '#1DE9B6', '#00E676', '#76FF03', '#C6FF00',
  '#FFEA00', '#FFC400', '#FF9100', '#FF3D00',

  '#FF5252', '#FF4081', '#E040FB', '#7C4DFF', '#536DFE', '#448AFF',
  '#40C4FF', '#18FFFF', '#64FFDA', '#69F0AE', '#B2FF59', '#EEFF41',
  '#FFFF00', '#FFD740', '#FFAB40', '#FF6E40'
];

function shuffle (array) {
  let j;
  let x;
  let i;

  for (i = array.length; i; i--) {
    j = Math.floor(Math.random() * i);
    x = array[i - 1];
    array[i - 1] = array[j];
    array[j] = x;
  }
  return array;
}

shuffle(COLORS);

let colorIndex = COLORS.indexOf('#2979FF');
const colorMap = new Map();

function getColor(branch) {
  if (colorMap.has(branch)) {
    return colorMap.get(branch);
  }
  const color = COLORS[colorIndex];
  colorMap.set(branch, color);

  colorIndex++;
  if (colorIndex >= COLORS.length) {
    colorIndex = 0;
  }

  return color;
}

getColor('master');

//////////

function Slots() {
  this.slots = [];
  this.index = new Map();
  this.length = 0;
}

Slots.prototype.get = function(y, branch) {
  if (branch && this.index.has(branch)) {
    return this.index.get(branch);
  }

  for (let i = 0; i < this.slots.length; i++) {
    if (typeof this.slots[i] === 'number' && this.slots[i] >= y) {
      console.log('slots*', this.slots, y, i);
      this.slots[i] = branch;
      this.index.set(branch, i);
      return i;
    }
  }

  this.slots.push(branch);
  this.length = this.slots.length;
  const i = this.slots.length - 1;
  console.log('slots+', this.slots, y);
  this.index.set(branch, i);
  return i;
};

Slots.prototype.del = function(i, y, branch) {
  if (typeof this.slots[i] === 'string') {
    this.slots[i] = y;

    if (branch) {
      this.index.delete(branch);
    }
    console.log('slots-', this.slots, i, y, branch);
  }
};

const slots = new Slots();

//////////

function Node (commit) {
  const id = commit.sha();

  if (index.has(id)) {
    return index.get(id);
  }

  this.sha = id;
  this.short = id.substring(0, 8);

  this.author = commit.author().toString();
  this.body = commit.body();
  this.committer = commit.committer().toString();
  this.message = commit.message();
  this.brief = this.message.substring(0, 100).replace(/\n[^]+$/, '').
    replace(/[^\w\s]/g, '');
  this.summary = commit.summary();
  this.timestamp = commit.timeMs();
  this.order = this.timestamp;
  // this.timestamp = Math.min(commit.
  //   author().
  //   when().
  //   time(),
  // commit.
  //   committer().
  //   when().
  //   time()) * 1000;

  this.parents = commit.parents().map(oid => { return oid.toString(); });
  this.children = [ ];
  this.branch = null;
  this.tags = [ ];

  index.set(id, this);
}

Node.prototype.connect = function () {
  this.parents = this.parents.map(parent => {
    if (typeof parent === 'string' && index.has(parent)) {
      parent = index.get(parent);

      if (!parent.children.includes(this)) {
        parent.children.push(this);
      }
      return parent;
    }
    return false;
  }).
    filter(parent => { return parent; });
};

Node.prototype.setBranch = function (name) {
  if (!this.branch) {
    this.branch = name;

    if (name === master && !initial && this.parents.length === 0
        && this.children.length) {
      initial = this;
      console.log('*initial', this.short);
    }

    // for (const parent of this.parents) {
    //   parent.setBranch(name);
    // }
    if (this.parents.length) {
      this.parents[0].setBranch(name);
    }
  }
};

Node.prototype.addTag = function(tag) {
  this.tags.push(tag);
};

Node.prototype.descendant = function() {
  for (const child of this.children) {
    if (child.branch === this.branch) {
      return child;
    }
  }
  return false;
};

Node.prototype.isDescendant = function(node, seen = new WeakMap(), depth = 0) {
  for (const child of this.children) {
    if (child === node) {
      return true;
    }
  }

  if (seen.has(this) || depth > 25) {
    return false;
  }

  seen.set(this, this);

  for (const child of this.children) {
    if (child.isDescendant(node, seen, depth + 1)) {
      return true;
    }
  }
  return false;
};

Node.prototype.isAncestor = function(node, seen = new WeakMap(), depth = 0) {
  for (const parent of this.parents) {
    if (parent === node) {
      return true;
    }
  }

  if (seen.has(this) || depth > 25) {
    return false;
  }

  seen.set(this, this);

  for (const parent of this.parents) {
    if (parent.isAncestor(node, seen, depth + 1)) {
      return true;
    }
  }
  return false;
};

Node.prototype.place = function() {
  if (this.x === undefined) {
    console.log('placing', this.short, this.branch, this.children.length);
    this.x = slots.get(this.y, this.branch);
  }

  let descendant = this.descendant();
  while (descendant) {
    descendant.x = this.x;
    descendant = descendant.descendant();
  }

  if (this.children.filter((item) => {
    return item.branch === this.branch;
  }).length === 0) {
    console.log('removing', this.short, this.branch, this.children.length);
    slots.del(this.x, this.y, this.branch);
  }

  for (const child of this.children) {
    if (child.branch !== this.branch) {
      console.log('placing', child.short, child.branch, child.children.length);
      child.x = slots.get(child.y, child.branch);
    }
  }
};

Node.prototype.assignBranch = function(name) {
  if (this.branch === null) {
    this.branch = name || generateBranchName();

    if (this.children.length) {
      if (this.children[0].order < this.order) {
        this.children[0].order = this.order;
      }
      this.children[0].assignBranch(this.branch);
    }
  }
};

Node.sorter = (a, b) => {
  if (a.order < b.order) {
    return -1;
  } else if (a.order > b.order) {
    return 1;
  } else if (a.isAncestor(b)) {
    return 1;
  } else if (a.isDescendant(b)) {
    return -1;
  }
  return 0;
};

//////////

function SVG() {
  this.width = 100;
  this.height = 100;
  this.elements = [];
  this.groups = [];
}

SVG.prototype.attributes = function({
  stroke, strokeWidth, fill, title, textAnchor,
  fontSize, fontWeight, fontFamily
}) {
  let attributes = '';
  if (stroke) {
    attributes += ` stroke="${ stroke }"`;
  }
  if (strokeWidth) {
    if (typeof strokeWidth === 'number') {
      attributes += ` stroke-width="${ strokeWidth }px"`;
    } else {
      attributes += ` stroke-width="${ strokeWidth }"`;
    }
  }
  if (fill) {
    attributes += ` fill="${ fill }"`;
  }

  if (title) {
    attributes += ` title="${ title }"`;
  }

  if (textAnchor) {
    attributes += ` text-anchor="${ textAnchor }"`;
  }

  if (fontSize) {
    attributes += ` font-size="${ fontSize }"`;
  }

  if (fontWeight) {
    attributes += ` font-weight="${ fontWeight }"`;
  }

  if (fontFamily) {
    attributes += ` font-family="${ fontFamily }"`;
  }

  return attributes;
};

SVG.prototype.line = function({
  x1, y1, x2, y2, stroke, strokeWidth, fill
}) {
  const attributes = this.attributes({
    stroke,
    strokeWidth,
    fill
  });
  const element = `<line x1="${ x1 }" y1="${ y1 }" x2="${ x2 }" y2="${ y2 }"${ attributes }/>`;
  this.elements.push(element);

  return this;
};

SVG.prototype.circle = function({
  cx, cy, r, stroke, strokeWidth, fill, title
}) {
  const attributes = this.attributes({
    stroke,
    strokeWidth,
    fill,
    title
  });
  const element = `<circle cx="${ cx }" cy="${ cy }" r="${ r }"${ attributes }/>`;
  this.elements.push(element);
  return this;
};

SVG.prototype.toRadians = (angle) => { return angle * (Math.PI / 180); };

SVG.prototype.hexagon = function({
  cx, cy, r, stroke, strokeWidth, fill, title
}) {
  const attributes = this.attributes({
    stroke,
    strokeWidth,
    fill,
    title
  });

  r += 1;

  let points = [];
  for (let i = 0; i < 360; i += 60) {
    points.push({
      x: cx + r * Math.cos(this.toRadians(i)),
      y: cy + r * Math.sin(this.toRadians(i))
    });
  }

  points = points.map((point) => { return `${ point.x },${ point.y }`; }).join(' ');

  const element = `<polygon points="${ points }"${ attributes }/>`;
  this.elements.push(element);

  return this;
};

SVG.prototype.path = function({
  d, stroke, strokeWidth, fill
}) {
  const attributes = this.attributes({
    stroke,
    strokeWidth,
    fill
  });
  const element = `<path d="${ d }"${ attributes } stroke-linejoin="round"/>`;
  this.elements.push(element);

  return this;
};

SVG.prototype.text = function({
  x, y, text, textAnchor, stroke, strokeWidth, fill,
  fontSize, fontWeight, fontFamily
}) {
  const attributes = this.attributes({
    textAnchor,
    stroke,
    strokeWidth,
    fill,
    fontSize,
    fontWeight,
    fontFamily
  });
  const element = `<text x="${ x }" y="${ y }"${ attributes }>${ text }</text>`;
  this.elements.push(element);

  return this;
};

SVG.prototype.group = function({ name }) {
  const group = new SVG();
  this.groups.push(group);

  if (name) {
    group.name = name;
    // this.[`$${ name }`] = group;
  }

  return group;
};

SVG.prototype.render = function({ root = true } = {}) {
  let image = '';
  if (root) {
    this.width += 10;
    this.height += 10;

    image = `<svg width="${ this.width }" height="${ this.height }" ` +
      `viewBox="0 0 ${ this.width } ${ this.height }" xmlns="http://www.w3.org/2000/svg" ` +
      'style="background-color: #333;">';
  }

  for (const group of this.groups) {
    image += `<g>${ group.render({ root: false }) }</g>`;
  }
  image += this.elements.join('');

  if (root) {
    image += '</svg>';
  }

  return image;
};

const svg = new SVG();

//////////

nodegit.Repository.open(path.resolve(process.cwd(), '.git')).
  then((repo) => {
    return repo.getReferences().
      then((references) => {
        return Promise.all(references.map((reference) => {
          let name = reference.name();
          if (reference.isBranch() || name === 'refs/stash' ||
              name.startsWith('refs/remotes/origin/')) {
            return nodegit.Reference.nameToId(repo, name).
              then((oid) => {
                name = name.replace(/^refs\/heads\//, '').
                  replace(/^refs\/remotes\//, '').
                  replace(/^refs\/stash$/, 'stash');

                branches.set(name, oid.toString());
                console.log(name, '->', oid.toString());
              });
          } else if (reference.isTag()) {
            return nodegit.Reference.nameToId(repo, name).
              then((oid) => {
                name = name.replace(/^refs\/tags\//, '');
                tags.set(name, oid.toString());
                console.log(name, '->', oid.toString());
              });
          }
          console.log('*skipped ref', name);

          return true;
        }));
      }).
      then(() => {
        const revwalk = nodegit.Revwalk.create(repo);

        revwalk.pushGlob('*');
        revwalk.pushRef('origin/*');

        //revwalk.simplifyFirstParent();
        revwalk.sorting(nodegit.Revwalk.TOPOLOGICAL);

        //return revwalk.commitWalk(LIMIT).
        return revwalk.getCommitsUntil((commit) => { return Boolean(commit); }).
          then((commits) => {
            commits.forEach((commit) => {
              const node = new Node(commit);
              nodes.push(node);
            });
          });
      });
  }).
  then(() => {
    console.log('connecting');
    for (const [ , node ] of index) {
      node.connect();
    }
  }).
  then(() => {
    console.log('branching');
    for (const [ name, sha ] of branches) {
      console.log('branch', name);
      if (index.has(sha)) {
        const node = index.get(sha);
        node.setBranch(name);
      }
    }
  }).
  then(() => {
    console.log('tagging');
    for (const [ name, sha ] of tags) {
      console.log('tag', name);
      if (index.has(sha)) {
        const node = index.get(sha);
        node.addTag(name);
      }
    }
  }).
  then(() => {
    console.log('sorting');
    nodes.reverse();
    nodes.sort(Node.sorter);
  }).
  then(() => {
    console.log('placing');

    // y coordinate, branch names and children ordering
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].y = nodes.length - i;
      nodes[i].assignBranch();
      nodes[i].children.sort(Node.sorter);
    }

    // resort
    nodes.sort(Node.sorter);

    // x coordinate
    for (const node of nodes) {
      node.place();

      // console.log(`${ ' '.repeat(node.x) }*${ ' '.repeat(100 - node.x) }` +
      //             `${ node.short } ${ node.branch }`);
    }
    console.log(slots.index);
  }).
  then(() => {
    console.log('drawing');
    const lines = [];
    for (let l = 0; l < slots.length; l++) {
      lines.unshift(svg.group({ name: `lines-${ slots.length - l }` }));
    }

    const dots = svg.group({ name: 'dots' });
    const labels = svg.group({ name: 'labels' });

    let width = 0;
    let height = 0;

    const scale = (x, y) => {
      x *= 16;
      y *= 16;

      x += 68;

      return [ x, y ];
    };

    for (const node of nodes) {
      if (node.y > RENDER_LIMIT) {
        continue;
      }

      const [ nx, ny ] = scale(node.x, node.y);

      labels.text({
        x: 6,
        y: ny + 3,
        text: node.short.toUpperCase(),
        textAnchor: 'start',
        // stroke: 'white',
        // strokeWidth: 1,
        fill: 'white', // getColor(node.branch),
        fontSize: '10px',
        fontWeight: '300',
        fontFamily: 'monospace'
      });

      width = Math.max(width, nx);
      height = Math.max(height, ny);

      dots.hexagon({
        cx: nx,
        cy: ny,
        r: 4,
        stroke: getColor(node.branch),
        strokeWidth: 2,
        fill: '#333', //getColor(node.branch),
        title: `[${ node.branch }] ${ node.short }: ${ node.brief }`
      });

      for (const child of node.children) {
        const [ cx, cy ] = scale(child.x, child.y);

        width = Math.max(width, cx);
        height = Math.max(height, cy);

        if (child.x === node.x) {
          lines[child.x].line({
            x1: nx,
            y1: ny,
            x2: cx,
            y2: cy,
            stroke: getColor(child.branch),
            strokeWidth: 2,
            fill: getColor(child.branch)
          });
        } else {
          let d;
          let stroke;
          if (cx > nx) {
            // d = `M${ nx },${ ny } L${ cx },${ ny } L${ cx },${ cy }`;
            d = `M${ nx },${ ny } L${ cx - 3 },${ ny } L${ cx },${ ny - 3 } L${ cx },${ cy }`;
            stroke = getColor(child.branch);
          } else {
            // d = `M${ cx },${ cy } L${ nx },${ cy } L${ nx },${ ny }`;
            d = `M${ cx },${ cy } L${ nx - 3 },${ cy } L${ nx },${ cy + 3 } L${ nx },${ ny }`;
            stroke = getColor(node.branch);
          }

          lines[Math.max(node.x, child.x)].path({
            // d: `M${ nx },${ ny } C${ (cx - nx) / 1.5 + nx },${ ny } ` +
            //            `${ ( cx - nx ) / 2.5 + nx },${ cy } ${ cx },${ cy }`,
            d,
            stroke,
            strokeWidth: 2,
            fill: 'transparent'
          });
        }
      }
    }

    svg.width = width;
    svg.height = height;

    return svg.render();
  }).
  then((image) => {
    fs.writeFileSync('graph.svg', image);
  }).
  // then(() => {
  //   for (const item of nodes) {
  //     console.log(item.short, item.parents.length, item.children.length,
  //       item.branch, item.tags.join(', '));
  //   }
  //   console.log(initial);
  // }).
  catch(error => {
    console.log(error);
  });
