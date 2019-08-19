#!/usr/bin/env node
'use strict';

require('barrkeep/pp');
const fs = require('fs');
const path = require('path');
const nodegit = require('nodegit');

const master = 'master';
const LIMIT = 5000;

const nodes = [ ];
const index = new Map();
const branches = new Map();
const tags = new Map();
let initial = null;

branches.set(master, null); // sorting

//////////

function Slots() {
  this.slots = [];
  this.index = new Map();
}

Slots.prototype.get = function(y, branch) {
  if (branch && this.index.has(branch)) {
    return this.index.get(branch);
  }

  for (let i = 0; i < this.slots.length; i++) {
    if (this.slots[i] !== 'taken' && this.slots[i] > y) {
      console.log('slots*', this.slots, y, i);
      this.slots[i] = 'taken';
      if (branch) {
        this.index.set(branch, i);
      }
      return i;
    }
  }

  this.slots.push('taken');
  const i = this.slots.length - 1;
  console.log('slots+', this.slots, y);
  if (branch) {
    this.index.set(branch, i);
  }
  return i;
};

Slots.prototype.del = function(i, y, branch) {
  if (this.slots[i] === 'taken') {
    this.slots[i] = y;
  }
  if (branch) {
    this.index.delete(branch);
  }
  console.log('slots-', this.slots);
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
    this.x = slots.get(this.y, this.branch);
  }

  console.log('placing', this.short, this.branch, this.children.length);

  if (this.children.length === 1 && this.children[0].branch !== this.branch ||
      this.children.length === 0) {
    slots.del(this.x, this.y, this.branch);
  }

  let descendant = this.descendant();
  while (descendant) {
    descendant.x = this.x;
    descendant = descendant.descendant();
  }

  for (const child of this.children) {
    if (child.branch !== this.branch) {
      child.x = slots.get(child.y, child.branch);
    }
  }
};

Node.sorter = (a, b) => {
  if (a.timestamp < b.timestamp) {
    return -1;
  } else if (a.timestamp > b.timestamp) {
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
  stroke, strokeWidth, fill, title
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

SVG.prototype.path = function({
  d, stroke, strokeWidth, fill
}) {
  const attributes = this.attributes({
    stroke,
    strokeWidth,
    fill
  });
  const element = `<path d="${ d }"${ attributes }/>`;
  this.elements.push(element);

  return this;
};

SVG.prototype.text = function() {
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

        revwalk.sorting(nodegit.Revwalk.TOPOLOGICAL, nodegit.Revwalk.REVERSE);

        revwalk.pushGlob('*');
        revwalk.pushRef('origin/*');

        return revwalk.commitWalk(LIMIT).
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
    nodes.sort(Node.sorter);
  }).
  then(() => {
    console.log('placing');

    // y coordinate, and children
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].y = nodes.length - i;
      nodes[i].children.sort(Node.sorter);
    }

    // x coordinate
    for (const node of nodes) {
      node.place();

      // console.log(`${ ' '.repeat(node.x) }*${ ' '.repeat(100 - node.x) }` +
      //             `${ node.short } ${ node.branch }`);
    }
  }).
  then(() => {
    console.log('drawing');
    const lines = svg.group({ name: 'lines' });
    const dots = svg.group({ name: 'dots' });

    let width = 0;
    let height = 0;

    const scale = (value) => {
      value *= 30;
      value += 10;
      return value;
    };

    for (const node of nodes) {
      const nx = scale(node.x);
      const ny = scale(node.y);

      width = Math.max(width, nx);
      height = Math.max(height, ny);

      dots.circle({
        cx: nx,
        cy: ny,
        r: 4,
        stroke: '#4E81C7',
        strokeWidth: 4,
        fill: '#4E81C7',
        title: `[${ node.branch }] ${ node.short }: ${ node.brief }`
      });

      for (const child of node.children) {
        const cx = scale(child.x);
        const cy = scale(child.y);

        width = Math.max(width, cx);
        height = Math.max(height, cy);

        if (child.x === node.x) {
          lines.line({
            x1: nx,
            y1: ny,
            x2: cx,
            y2: cy,
            stroke: '#4E81C7',
            strokeWidth: 2,
            fill: '#4E81C7'
          });
        } else {
          lines.path({
            d: `M${ nx },${ ny } C${ (cx - nx) / 1.5 + nx },${ ny } ` +
                       `${ ( cx - nx ) / 2.5 + nx },${ cy } ${ cx },${ cy }`,
            stroke: '#4E81C7',
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
