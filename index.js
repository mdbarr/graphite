#!/usr/bin/env node
'use strict';

require('barrkeep/pp');
const nodegit = require('nodegit');
const path = require('path');

const master = 'master';
const LIMIT = 5000;

let tree = null;
const nodes = [ ];
const index = new Map();
const branches = new Map();
const tags = new Map();
let tail = null;

branches.set(master, null); // sorting

function Node (commit) {
  const id = commit.sha();

  if (index.has(id)) {
    return index.get(id);
  }

  this.sha = id;
  this.short = id.substring(0, 8);

  this.summary = commit.summary();

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

  if (!tail && this.parents.length === 0) {
    tail = this;
    //this.branches.push('*TAIL');
  }
};

Node.prototype.setBranch = function (name) {
  if (!this.branch) {
    this.branch = name;

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
        return repo.getHeadCommit().
          then((head) => {
            tree = new Node(head);

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
      });
  }).
  then(() => {
    console.log('connecting');
    for (const [ , node ] of index) {
      node.connect();
    }
    console.log(tree);
    return tree;
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
    for (const [ , item ] of index) {
      console.log(item.short, item.parents.length, item.children.length,
        item.branch, item.tags.join(', '));
    }
  }).
  catch(error => {
    console.log(error);
  });
