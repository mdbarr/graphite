#!/usr/bin/env node
'use strict';

const Griff = require('./index');
const griff = new Griff({ save: true });

griff.generate().
  catch((error) => {
    console.log(error);
  });
