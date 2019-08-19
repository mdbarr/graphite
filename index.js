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
}

Slots.prototype.get = function(y) {
  for (let i = 0; i < this.slots.length; i++) {
    if (this.slots[i] !== 'taken' && this.slots[i] > y) {
      console.log('slots*', this.slots, y, i);
      this.slots[i] = 'taken';
      return i;
    }
  }

  this.slots.push('taken');
  console.log('slots+', this.slots, y);
  return this.slots.length - 1;
};

Slots.prototype.del = function(i, y) {
  if (this.slots[i] === 'taken') {
    this.slots[i] = y;
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
  this.summary = commit.summary();
  this.time = commit.timeMs();
  this.timestamp = Math.min(commit.
    author().
    when().
    time(),
  commit.
    committer().
    when().
    time()) * 1000;

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

    for (const parent of this.parents) {
      parent.setBranch(name);
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

Node.prototype.place = function() {
  if (this.x === undefined) {
    this.x = slots.get(this.y);
  }

  console.log('placing', this.short, this.branch, this.children.length);

  if (this.children.length === 1 && this.children[0].branch !== this.branch ||
      this.children.length === 0) {
    slots.del(this.x, this.y);
  }

  let descendant = this.descendant();
  while (descendant) {
    descendant.x = this.x;
    descendant = descendant.descendant();
  }

  for (const child of this.children) {
    if (child.branch !== this.branch) {
      child.x = slots.get(child.y);
    }
  }
};

//////////

function SVG() {
  this.elements = [];
  this.groups = [];
}

SVG.prototype.attributes = function({
  stroke, strokeWidth, fill
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
  cx, cy, r, stroke, strokeWidth, fill
}) {
  const attributes = this.attributes({
    stroke,
    strokeWidth,
    fill
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
    image = '<svg viewBox="0 0 300 5000" xmlns="http://www.w3.org/2000/svg">';
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
    nodes.sort((a, b) => {
      if (a.timestamp < b.timestamp) {
        return -1;
      } else if (a.timestamp > b.timestamp) {
        return 1;
      }
      return 0;
    });
  }).
  then(() => {
    console.log('placing');

    // y coordinate
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].y = nodes.length - i;
    }

    // x coordinate
    for (const node of nodes) {
      node.place();

      console.log(`${ ' '.repeat(node.x) }*${ ' '.repeat(12 - node.x) }` +
                  `${ node.short } ${ node.branch }`);
    }
  }).
  then(() => {
    console.log('drawing');
    const dots = svg.group({ name: 'dots' });
    const lines = svg.group({ name: 'lines' });

    for (const node of nodes) {
      const nx = node.x * 20 + 5;
      const ny = node.y * 20 + 5;

      dots.circle({
        cx: nx,
        cy: ny,
        r: 4,
        stroke: '#4E81C7',
        strokeWidth: 4,
        fill: '#4E81C7'
      });

      for (const child of node.children) {
        const cx = child.x * 20 + 5;
        const cy = child.y * 20 + 5;

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
            fill: '#4E81C7'
          });
        }
      }
    }
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
