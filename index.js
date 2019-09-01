'use strict';

const fs = require('fs');
const path = require('path');
const git = require('nodegit');

const COLORS = [
  '#D50000', '#C51162', '#AA00FF', '#6200EA', '#304FFE', '#2962FF',
  '#0091EA', '#00B8D4', '#00BFA5', '#00C853', '#64DD17', '#AEEA00',
  '#FFD600', '#FFAB00', '#FF6D00', '#DD2C00',

  '#FF1744', '#F50057', '#D500F9', '#651FFF', '#3D5AFE', '#2979FF',
  '#00B0FF', '#00E5FF', '#1DE9B6', '#00E676', '#76FF03', '#C6FF00',
  '#FFEA00', '#FFC400', '#FF9100', '#FF3D00',

  '#FF5252', '#FF4081', '#E040FB', '#7C4DFF', '#536DFE', '#448AFF',
  '#40C4FF', '#18FFFF', '#64FFDA', '#69F0AE', '#B2FF59', '#EEFF41',
  '#FFFF00', '#FFD740', '#FFAB40', '#FF6E40',

  '#FF8A80', '#FF80AB', '#EA80FC', '#B388FF', '#8C9EFF', '#82B1FF',
  '#80D8FF', '#84FFFF', '#A7FFEB', '#B9F6CA', '#CCFF90', '#F4FF81',
  '#FFFF8D', '#FFE57F', '#FFD180', '#FF9E80'
];

//////////

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(array) {
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

function precisionRound(number, precision = 2) {
  const factor = Math.pow(10, precision);
  return Math.round(number * factor) / factor;
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

function SVG({
  width = 100, height = 100, background = '#333'
} = {}) {
  this.width = width;
  this.height = height;
  this.elements = [];
  this.groups = [];
  this.background = background;
}

SVG.prototype.attributes = function(options) {
  const attributes = [ ];
  for (const key in options) {
    const attr = key.replace(/([A-Z])/g, (match, letter) => {
      return `-${ letter.toLowerCase() }`;
    });

    let value = options[key];
    if (!value) {
      continue;
    }

    if ((attr.includes('width') || attr.includes('height')) &&
        typeof value === 'number') {
      value += 'px';
    }

    attributes.push(`${ attr }="${ value }"`);
  }

  return ` ${ attributes.join(' ') }`;
};

SVG.prototype.line = function({
  x1, y1, x2, y2, ...options
}) {
  const attributes = this.attributes(options);
  const element = `<line x1="${ x1 }" y1="${ y1 }" x2="${ x2 }" y2="${ y2 }"${ attributes }/>`;
  this.elements.unshift(element);

  return this;
};

SVG.prototype.circle = function({
  cx, cy, r, ...options
}) {
  const attributes = this.attributes(options);
  const element = `<circle cx="${ cx }" cy="${ cy }" r="${ r }"${ attributes }/>`;
  this.elements.unshift(element);
  return this;
};

SVG.prototype.toRadians = (angle) => { return angle * (Math.PI / 180); };

SVG.prototype.hexagon = function({
  cx, cy, r, rotation = 30, ...options
}) {
  const attributes = this.attributes(options);

  r += 1;

  let points = [];
  for (let i = 0; i < 360; i += 60) {
    points.push({
      x: precisionRound(cx + r * Math.cos(this.toRadians(i + rotation))),
      y: precisionRound(cy + r * Math.sin(this.toRadians(i + rotation)))
    });
  }

  points = points.map((point) => { return `${ point.x },${ point.y }`; }).join(' ');

  const element = `<polygon points="${ points }"${ attributes }/>`;
  this.elements.unshift(element);

  return this;
};

SVG.prototype.path = function({
  d, ...options
}) {
  const attributes = this.attributes(options);
  const element = `<path d="${ d }"${ attributes }/>`;
  this.elements.unshift(element);

  return this;
};

SVG.prototype.text = function({
  x, y, text, ...options
}) {
  const attributes = this.attributes(options);
  const element = `<text x="${ x }" y="${ y }"${ attributes }>${ text }</text>`;
  this.elements.unshift(element);

  return this;
};

SVG.prototype.group = function({
  name, ...options
}) {
  const group = new SVG();
  this.groups.push(group);

  if (name) {
    group.name = name;
  }
  group.style = this.attributes(options);

  return group;
};

SVG.prototype.render = function({ root = true } = {}) {
  let image = '';
  if (root) {
    this.width += 10;
    this.height += 10;

    image = `<svg width="${ this.width }" height="${ this.height }" ` +
      `viewBox="0 0 ${ this.width } ${ this.height }" xmlns="http://www.w3.org/2000/svg" ` +
      `style="background-color: ${ this.background };">`;
  }

  for (const group of this.groups) {
    image += `<g${ group.style }>${ group.render({ root: false }) }</g>`;
  }
  image += this.elements.join('');

  if (root) {
    image += '</svg>';
  }

  return image;
};

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
      this.slots[i] = branch;
      this.index.set(branch, i);
      return i;
    }
  }

  this.slots.push(branch);
  this.length = this.slots.length;
  const i = this.slots.length - 1;
  this.index.set(branch, i);
  return i;
};

Slots.prototype.del = function(i, y, branch) {
  if (i !== 0 && typeof this.slots[i] === 'string') {
    this.slots[i] = y;

    if (branch) {
      this.index.delete(branch);
    }
  }
};

//////////

function Tree() {
  this.primary = null;

  this.nodes = [ ];
  this.index = new Map();
  this.branches = new Map();
  this.references = new Map();
  this.tags = new Map();
  this.initial = null;

  this.slots = new Slots();
}

Tree.prototype.setPrimary = function(primary) {
  this.primary = primary;
  this.branches.set(this.primary, null);
};

Tree.prototype.addReference = function(sha, reference) {
  const references = this.references.get(sha) || new Set();
  references.add(reference);
  this.references.set(sha, references);
};

//////////

function Node (commit, tree) {
  this.tree = tree;

  const id = commit.sha();

  if (this.tree.index.has(id)) {
    return this.tree.index.get(id);
  }

  this.sha = id;
  this.short = id.substring(0, 8);

  this.author = commit.author().toString();
  this.body = commit.body();
  this.committer = commit.committer().toString();

  this.message = commit.message();
  this.brief = this.message.substring(0, 100).
    replace(/\n[^]+$/, '').
    replace(/[^\w:\-_\s]/g, '').
    trim();

  this.summary = commit.summary();

  this.timestamp = commit.timeMs();
  this.order = this.timestamp;

  this.parents = commit.parents().map(oid => { return oid.toString(); });
  this.children = [ ];

  this.branch = null;
  this.tags = [ ];

  this.stash = false;

  this.tree.index.set(id, this);
  this.tree.nodes.push(this);
}

Node.prototype.connect = function () {
  this.parents = this.parents.map(parent => {
    if (typeof parent === 'string' && this.tree.index.has(parent)) {
      parent = this.tree.index.get(parent);

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

    if (name === this.tree.primary && !this.tree.initial && this.parents.length === 0
        && this.children.length) {
      this.tree.initial = this;
    }

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
    this.x = this.tree.slots.get(this.y, this.branch);
  }

  let descendant = this.descendant();
  while (descendant) {
    descendant.x = this.x;
    descendant = descendant.descendant();
  }

  if (this.children.filter((item) => {
    return item.branch === this.branch;
  }).length === 0) {
    this.tree.slots.del(this.x, this.y, this.branch);
  }

  for (const child of this.children) {
    if (child.branch !== this.branch) {
      child.x = this.tree.slots.get(child.y, child.branch);
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

function Griff({
  repository = process.cwd(), primary = 'master', head = false, limit = Infinity,
  colors, save = false, filename = 'graph.svg', labels = false,
  descriptions = false, shape = 'hexagon', titles = false, background = '#333',
  stashes = false, data = false
} = {}) {
  shape = shape !== 'hexagon' ? 'circle' : 'hexagon';

  colors = colors || shuffle(Array.from(COLORS));

  let colorIndex = colors.indexOf('#2979FF') || 0;
  const colorMap = new Map();

  function getColor(branch) {
    if (colorMap.has(branch)) {
      return colorMap.get(branch);
    }
    const color = colors[colorIndex];
    colorMap.set(branch, color);

    colorIndex++;
    if (colorIndex >= colors.length) {
      colorIndex = 0;
    }

    return color;
  }

  //////////

  let tree;
  const openPromise = git.Repository.open(path.resolve(repository, '.git'));

  //////////

  this.details = (sha) => {
    if (tree && tree.index.has(sha)) {
      const node = tree.index.get(sha);
      const details = {
        sha: node.sha,
        short: node.short,
        author: node.author,
        body: node.body,
        committer: node.committer,
        message: node.message,
        brief: node.brief,
        summary: node.summary,
        timestamp: node.timestamp,
        branch: node.branch,
        stash: node.stash
      };

      return details;
    }

    return null;
  };

  //////////

  this.generate = (callback) => {
    tree = new Tree();

    const svg = new SVG({ background });

    return openPromise.
      then((repo) => {
        return repo.head().
          then((reference) => {
            let name;

            if (head) {
              name = reference.name().replace('refs/heads/', '');
            } else {
              name = primary;
            }

            tree.setPrimary(name);
            getColor(name);

            return repo.getReferences();
          }).
          then((references) => {
            return Promise.all(references.map((reference) => {
              let name = reference.name();
              if ((reference.isBranch() || name.startsWith('refs/remotes/origin/')) &&
                  name !== 'refs/stash') {
                return git.Reference.nameToId(repo, name).
                  then((oid) => {
                    const remote = name.includes('refs/remotes');
                    name = name.replace(/^refs\/heads\//, '').
                      replace(/^refs\/remotes\//, '');

                    tree.branches.set(name, oid.toString());

                    tree.addReference(oid.toString(), remote ? `{${ name }}` : `[${ name }]`);
                  });
              } else if (reference.isTag()) {
                return git.Reference.nameToId(repo, name).
                  then((oid) => {
                    name = name.replace(/^refs\/tags\//, '');
                    tree.tags.set(name, oid.toString());
                    tree.addReference(oid.toString(), `<${ name }>`);
                  });
              }

              return true;
            }));
          }).
          then(() => {
            const revwalk = git.Revwalk.create(repo);

            revwalk.pushGlob('refs/heads/*');
            revwalk.pushGlob('refs/remotes/*');

            revwalk.sorting(git.Revwalk.TOPOLOGICAL);

            return revwalk.getCommitsUntil((commit) => { return Boolean(commit); }).
              then((commits) => {
                commits.forEach((commit) => {
                  return new Node(commit, tree);
                });
              });
          }).
          then(() => {
            if (stashes) {
              return git.Reflog.read(repo, 'refs/stash').
                then((reflog) => {
                  const stashIndex = new Map();
                  const stashed = [];
                  for (let index = 0; index < reflog.entrycount(); index++) {
                    const entry = reflog.entryByIndex(index);
                    const sha = entry.idNew().toString();
                    const branch = `stash{${ index }}`;
                    tree.branches.set(branch, sha);
                    stashIndex.set(sha, branch);
                    tree.addReference(sha, ` stash@{${ index }} `);

                    stashed.push(repo.getCommit(entry.idNew()));
                  }
                  return Promise.all(stashed).
                    then((commits) => {
                      const lookups = [];
                      commits.forEach((commit) => {
                        const node = new Node(commit, tree);
                        const branch = stashIndex.get(node.sha);
                        node.stash = true;
                        node.branch = branch;

                        node.parents.forEach((parent) => {
                          if (!tree.index.has(parent)) {
                            lookups.push(repo.getCommit(parent).
                              then((pcommit) => {
                                const pnode = new Node(pcommit, tree);
                                pnode.stash = true;
                                if (node.parents.indexOf(pnode.sha) === 1) {
                                  pnode.branch = `${ branch }/index`;
                                }
                                return pnode;
                              }));
                          }
                        });
                      });
                      return Promise.all(lookups);
                    });
                });
            }
            return true;
          });
      }).
      then(() => {
        for (const [ , node ] of tree.index) {
          node.connect();
        }
      }).
      then(() => {
        for (const [ name, sha ] of tree.branches) {
          if (tree.index.has(sha)) {
            const node = tree.index.get(sha);
            node.setBranch(name);
          }
        }
      }).
      then(() => {
        for (const [ name, sha ] of tree.tags) {
          if (tree.index.has(sha)) {
            const node = tree.index.get(sha);
            node.addTag(name);
          }
        }
      }).
      then(() => {
        tree.nodes.reverse();
        tree.nodes.sort(Node.sorter);
      }).
      then(() => {
        // y coordinate, branch names and children ordering
        for (let i = 0; i < tree.nodes.length; i++) {
          tree.nodes[i].y = tree.nodes.length - i;
          tree.nodes[i].assignBranch();
          tree.nodes[i].children.sort(Node.sorter);
        }

        // resort
        tree.nodes.sort(Node.sorter);

        // x coordinate
        for (const node of tree.nodes) {
          node.place();
        }
      }).
      then(() => {
        const lines = [];
        const righthand = [];

        for (let l = 0; l < tree.slots.length; l++) {
          lines.unshift(svg.group({
            name: `lines-${ tree.slots.length - l }`,
            strokeWidth: 2
          }));
        }

        const dots = svg.group({
          name: 'dots',
          strokeWidth: 2,
          fill: background
        });

        let text;
        if (labels || descriptions) {
          text = svg.group({
            name: 'labels',
            textAnchor: 'start',
            fill: 'white',
            fontSize: '10px',
            fontWeight: '300',
            fontFamily: 'monospace'
          });
        }

        let width = 0;
        let height = 0;

        const scale = (x, y) => {
          x *= 16;
          y *= 16;

          x += labels ? 68 : 10;
          return [ x, y ];
        };

        for (const node of tree.nodes) {
          if (node.y > limit) {
            continue;
          }

          const [ nx, ny ] = scale(node.x, node.y);

          righthand[node.y] = Math.max(righthand[node.y] || 0, nx);

          if (labels) {
            text.text({
              x: 6,
              y: ny + 3,
              text: node.short.toUpperCase(),
              dataSha: data ? node.sha : false
            });
          }

          width = Math.max(width, nx);
          height = Math.max(height, ny);

          dots[shape]({
            cx: nx,
            cy: ny,
            r: 4,
            stroke: getColor(node.branch),
            title: titles ? `[${ node.branch }] ${ node.short }: ${ node.brief }` : false,
            dataSha: data ? node.sha : false
          });

          for (const child of node.children) {
            const [ cx, cy ] = scale(child.x, child.y);

            righthand[child.y] = Math.max(righthand[child.y] || 0, cx);

            for (let dy = node.y; dy >= child.y; dy--) {
              righthand[dy] = Math.max(righthand[dy] || 0, cx, nx);
            }

            width = Math.max(width, cx);
            height = Math.max(height, cy);

            if (child.x === node.x) {
              lines[child.x].line({
                x1: nx,
                y1: ny,
                x2: cx,
                y2: cy,
                stroke: getColor(child.branch),
                fill: getColor(child.branch),
                strokeDasharray: child.stash ? 1 : false
              });
            } else {
              let d;
              let stroke;
              if (cx > nx) {
                d = `M${ nx },${ ny } L${ cx - 3 },${ ny } L${ cx },${ ny - 3 } L${ cx },${ cy }`;
                stroke = getColor(child.branch);
              } else {
                d = `M${ cx },${ cy } L${ nx - 3 },${ cy } L${ nx },${ cy + 3 } L${ nx },${ ny }`;
                stroke = getColor(node.branch);
              }

              lines[Math.max(node.x, child.x)].path({
                d,
                stroke,
                fill: 'none',
                strokeDasharray: child.stash ? 2 : false
              });
            }
          }
        }

        if (descriptions) {
          for (const node of tree.nodes) {
            if (node.y > limit) {
              continue;
            }

            const nx = righthand[node.y];
            const [ , ny ] = scale(node.x, node.y);

            const references = tree.references.has(node.sha) ?
              Array.from(tree.references.get(node.sha)).sort() :
              false;

            let description;
            let length = 0;

            if (references) {
              length = references.join(' ').length + node.brief.length + 1;

              description = references.map((reference) => {
                const name = reference.substring(1, reference.length - 1).trim();
                const color = getColor(name);
                const ref = data ? ` data-ref="${ name }"` : '';

                reference = reference.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `<tspan fill="${ color }"${ ref }>${ reference }</tspan>`;
              }).join(' ');

              description += ` ${ node.brief }`;
            } else {
              description = node.brief;
              length = node.brief.length;
            }

            text.text({
              x: nx + 12,
              y: ny + 2.5,
              text: description,
              dataSha: data ? node.sha : false
            });

            width = Math.max(width, length * 6 + nx + 12);
          }
        }

        svg.width = width;
        svg.height = height;

        return svg.render();
      }).
      then((image) => {
        if (save) {
          return new Promise((resolve, reject) => {
            fs.writeFile(filename, image, (error) => {
              if (error) {
                return reject(error);
              }
              return resolve(image);
            });
          });
        }
        if (typeof callback === 'function') {
          return callback(null, image);
        }
        return image;
      });
  };
}

module.exports = Griff;
