#!/usr/bin/env node
'use strict';

const Griff = require('./index');
const minimist = require('minimist');

const options = Object.assign({ save: true }, minimist(process.argv.slice(2)));

const griff = new Griff(options);

griff.generate().
  catch((error) => {
    console.log(error);
  });
