#!/usr/bin/env node
'use strict';

const Griff = require('./index');

const options = require('yargs').
  usage('Usage: $0 [options]').
  options({
    background: {
      describe: 'svg background color',
      default: '#333',
      type: 'string'
    },
    data: {
      describe: 'include html data attributes on commits nodes in graph',
      default: false,
      type: 'boolean'
    },
    descriptions: {
      describe: 'include commit descriptions in graph',
      default: false,
      type: 'boolean'
    },
    filename: {
      describe: 'file name to use when saving results',
      default: 'graph.svg',
      normalize: true,
      type: 'string'
    },
    head: {
      describe: 'use the current HEAD instead of primary branch HEAD',
      default: false,
      type: 'boolean'
    },
    labels: {
      describe: 'label commits in graph',
      default: false,
      type: 'boolean'
    },
    limit: {
      describe: 'maximum number of commits to follow',
      default: Infinity,
      type: 'number'
    },
    primary: {
      describe: 'primary branch name',
      default: 'master',
      type: 'string'
    },
    repository: {
      describe: 'path to the git repository',
      default: process.cwd(),
      normalize: true,
      type: 'string'
    },
    save: {
      describe: 'save results to a file rather than printing to stdout',
      default: true,
      implies: 'filename',
      type: 'boolean'
    },
    shape: {
      describe: 'shape to draw for commits in graph',
      default: 'hexagon',
      choices: [ 'circle', 'hexagon' ],
      type: 'string'
    },
    size: {
      describe: 'size of graph rows in pixels',
      default: 10,
      type: 'number'
    },
    stashes: {
      describe: 'include stashes in graph',
      default: false,
      type: 'boolean'
    },
    strokeWidth: {
      describe: 'stroke width for svg elements in pixels',
      default: 2,
      type: 'number'
    },
    textColor: {
      describe: 'svg text color',
      default: '#FFF',
      type: 'string'
    },
    titles: {
      describe: 'include html title attributes on commit nodes in the graph',
      default: false,
      type: 'boolean'
    }
  }).
  help('h').
  alias('h', 'help').
  argv;

if (options._.length === 1 && options._[0] === '-') {
  options.output = true;
} else if (options.save === undefined) {
  options.save = true;
}

const griff = new Griff(options);

griff.generate().
  then((svg) => {
    if (options.output) {
      console.log(svg);
    }
  }).
  catch((error) => {
    console.log(error);
  });
