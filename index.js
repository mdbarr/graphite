#!/usr/bin/env node
'use strict';

require('barrkeep/pp');
const nodegit = require('nodegit');
const path = require('path');

const master = 'master';
const LIMIT = 5000;

const nodes = [ ];
const index = new Map();
const branches = new Map();
const tags = new Map();
let initial = null;

branches.set(master, null); // sorting

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
  this.timestamp = commit.timeMs();

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
    const x = new Map();
    let highest = -1;
    let max = -1;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      node.y = nodes.length - i;

      if (x.has(node.branch)) {
        node.x = x.get(node.branch);
      } else {
        node.x = ++highest;
        x.set(node.branch, node.x);
      }

      max = Math.max(max, highest);

      if (node.children.length === 0) {
        highest--;
      } else if (node.children.length === 1 && x.has(node.children[0].branch)) {
        highest = x.get(node.children[0].branch);
      }

      console.log(`${ ' '.repeat(node.x) }*${ ' '.repeat(12 - node.x) }` +
                  `${ node.short } ${ node.branch }`);
    }
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
