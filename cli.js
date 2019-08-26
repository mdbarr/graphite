#!/usr/bin/env node
'use strict';

const Griff = require('./index');
const minimist = require('minimist');

const options = minimist(process.argv.slice(2));
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
